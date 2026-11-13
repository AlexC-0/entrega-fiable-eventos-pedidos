import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import pg from 'pg';
import { ConflictoEvento, POLITICA_INICIAL, PostgresQueue, applyMigrations } from '../../src/index.js';
import { assertDatabase, connectionOptions, event, requiredUrl, until, withFixture } from './support.js';
import { queueMigrations } from '../../src/persistence/catalog.js';
import type { Fixture } from './support.js';

const url = requiredUrl();
const initial = new pg.Pool({ connectionString: url, ...connectionOptions });
try { await assertDatabase(initial); }
catch { throw new Error('PostgreSQL real requerido y base/rol correctos; no se omiten casos.'); }
finally { await initial.end(); }

async function claim(f: Fixture) {
  const result = await f.queue.reservar();
  assert.ok(result);
  return result;
}
async function crash(f: Fixture, number: number) {
  const child = fork(new URL('./consumer.js', import.meta.url), [f.schema, '1000', '20'], {
    env: { ...process.env, TEST_DATABASE_URL: url },
    stdio: ['ignore','ignore','ignore','ipc'], windowsHide: true,
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    const message = await new Promise<{ kind: string; intento: number }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Hijo sin confirmar reserva')), 12000);
      child.once('message', value => resolve(value as { kind: string; intento: number }));
      child.once('error', () => reject(new Error('Error al iniciar hijo')));
      child.once('exit', () => reject(new Error('Hijo salió antes de confirmar')));
    });
    assert.equal(message.kind, 'reserved');
    assert.equal(message.intento, number);
    assert.equal((await f.rows('intento')).length, number);
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
  }
}

test('01 migraciones repetibles/concurrentes, versión y evento inmutable', async () => {
  await withFixture(async f => {
    await Promise.all([applyMigrations(f.pool, f.schema), applyMigrations(f.pool, f.schema)]);
    assert.equal((await f.rows('migracion')).length, queueMigrations.length);
    await f.queue.registrar(event());
    await assert.rejects(f.pool.query(`UPDATE ${f.name}.evento SET contenido='{}'`), /inmutable/);
    await assert.rejects(f.pool.query(`DELETE FROM ${f.name}.evento`), /inmutable/);
    assert.equal((await f.rows('evento')).length, 1);
    await f.pool.query(`UPDATE ${f.name}.migracion SET sha256='alterado_por_fixture'`);
    await assert.rejects(applyMigrations(f.pool, f.schema), /ha cambiado/);
  });
});

test('02 evento y entrega confirman juntos; fallo SQL revierte toda la aceptación', async () => {
  await withFixture(async f => {
    assert.equal(await f.queue.registrar(event()), 'creado');
    assert.equal((await f.rows('evento')).length, 1);
    assert.equal((await f.rows('entrega')).length, 1);
    await f.failTrigger('entrega', 'INSERT');
    await assert.rejects(f.queue.registrar(event()), /fallo SQL provocado/);
    assert.equal((await f.rows('evento')).length, 1);
    assert.equal((await f.rows('entrega')).length, 1);
  });
});

test('03 equivalencia jsonb y conflictos de identidad/pedido sin otra entrega', async () => {
  await withFixture(async f => {
    const input = event({ contenido: { a: 1, b: { x: 'sí', y: [1,2] } } });
    await f.queue.registrar(input);
    assert.equal(await f.queue.registrar({ ...input, contenido: { b: { y: [1,2], x: 'sí' }, a: 1 } }), 'duplicado');
    await assert.rejects(f.queue.registrar({ ...input, contenido: { a: 1, b: { x: 'sí', y: [2,1] } } }), ConflictoEvento);
    await assert.rejects(f.queue.registrar({ ...input, contenido: { ...input.contenido, extra: true } }), ConflictoEvento);
    await assert.rejects(f.queue.registrar({ ...input, pedidoId: 'otro' }), ConflictoEvento);
    await assert.rejects(f.queue.registrar({ ...input, eventoId: randomUUID() }), error => error instanceof ConflictoEvento && error.motivo === 'pedido_ya_confirmado');
    assert.equal((await f.rows('entrega')).length, 1);
  });
});

test('04 aceptación concurrente de duplicados y conflictos', async () => {
  await withFixture(async f => {
    const same = event();
    const duplicateResults = await Promise.all(Array.from({ length: 6 }, () => f.queue.registrar(same)));
    assert.equal(duplicateResults.filter(value => value === 'creado').length, 1);
    assert.equal(duplicateResults.filter(value => value === 'duplicado').length, 5);
    const conflict = event();
    const results = await Promise.allSettled([
      f.queue.registrar(conflict),
      f.queue.registrar({ ...conflict, contenido: { diferente: true } }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(results.some(result => result.status === 'rejected' && result.reason instanceof ConflictoEvento));
    const pedido = randomUUID();
    const orders = await Promise.allSettled([
      f.queue.registrar(event({ pedidoId: pedido })),
      f.queue.registrar(event({ pedidoId: pedido })),
    ]);
    assert.equal(orders.filter(result => result.status === 'fulfilled').length, 1);
    assert.ok(orders.some(result => result.status === 'rejected' && result.reason instanceof ConflictoEvento));
    assert.equal((await f.rows('evento')).length, 3);
    assert.equal((await f.rows('entrega')).length, 3);
  });
});

test('05 consumidores concurrentes no comparten una reserva vigente', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const results = await Promise.all([f.queue.reservar(), f.queue.reservar()]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await f.rows('intento')).length, 1);
    assert.equal((await f.rows('entrega'))[0]?.intentos, 1);
    await f.queue.registrar(event());
    await f.queue.registrar(event());
    const others = await Promise.all([f.queue.reservar(), f.queue.reservar()]);
    assert.ok(others[0] && others[1]);
    assert.notEqual(others[0].eventoId, others[1].eventoId);
    assert.notEqual(others[0].token, others[1].token);
  });
});

test('06 fallo al registrar intento revierte token, estado y contador', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    await f.failTrigger('intento','INSERT');
    await assert.rejects(f.queue.reservar(), /fallo SQL provocado/);
    const [row] = await f.rows('entrega');
    assert.equal(row.estado, 'pendiente');
    assert.equal(row.intentos, 0);
    assert.equal(row.reserva_token, null);
    assert.equal((await f.rows('intento')).length, 0);
    await f.removeTrigger('intento');
    assert.equal((await claim(f)).intento, 1);
  });
});

test('07 finalización válida y terminal inalterable por repetición', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation = await claim(f);
    assert.equal(await f.queue.finalizar(reservation, { tipo: 'entregado' }), true);
    assert.equal(await f.queue.finalizar(reservation, { tipo: 'reintentar' }), false);
    assert.equal(await f.queue.recuperarVencidas(), 0);
    assert.equal(await f.queue.reservar(), undefined);
    assert.equal((await f.rows('entrega'))[0]?.estado, 'entregado');
    assert.equal((await f.rows('intento'))[0]?.resultado, 'confirmado');
  });
});

test('08 ejecución antigua no confirma, reprograma ni falla la reserva posterior', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const previous = await claim(f);
    await f.expire();
    assert.equal(await f.queue.recuperarVencidas(), 1);
    const current = await until(() => f.queue.reservar());
    assert.notEqual(previous.token, current.token);
    for (const tipo of ['entregado','reintentar','fallido_definitivo'] as const) {
      assert.equal(await f.queue.finalizar(previous, { tipo }), false);
    }
    assert.equal((await f.rows('entrega'))[0]?.reserva_token, current.token);
    assert.equal(await f.queue.finalizar(current, { tipo: 'entregado' }), true);
    assert.equal(await f.queue.finalizar(previous, { tipo: 'entregado' }), false);
    const rows = await f.rows('intento');
    assert.equal(rows.find(row => row.numero === 1)?.resultado, 'desconocido');
    assert.equal(rows.find(row => row.numero === 2)?.resultado, 'confirmado');
  });
});

test('09 reserva vencida rechazada antes de cualquier recuperación', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation = await claim(f);
    await f.expire();
    for (const tipo of ['entregado','reintentar','fallido_definitivo'] as const) {
      assert.equal(await f.queue.finalizar(reservation, { tipo }), false);
    }
    assert.equal((await f.rows('entrega'))[0]?.estado, 'en_proceso');
    assert.equal((await f.rows('intento'))[0]?.resultado, 'reservado');
    assert.equal(await f.queue.recuperarVencidas(), 1);
    assert.equal((await f.rows('intento'))[0]?.resultado, 'desconocido');
  });
});

test('10 reloj posterior a espera de bloqueo: vence realmente antes de finalizar', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation = await claim(f);
    const locker = await f.pool.connect();
    let pending: Promise<boolean> | undefined;
    try {
      await locker.query('BEGIN');
      await locker.query(`SELECT * FROM ${f.name}.entrega FOR UPDATE`);
      const pid = (await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending = f.queue.finalizar(reservation, { tipo: 'entregado' });
      await until(async () => (await f.pool.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',[pid])).rows[0]?.blocked);
      await until(async () => (await locker.query(`SELECT clock_timestamp()>=reserva_hasta AS expired FROM ${f.name}.entrega`)).rows[0]?.expired);
      await locker.query('COMMIT');
      assert.equal(await pending, false);
      assert.equal((await f.rows('intento'))[0]?.resultado, 'reservado');
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
      if (pending) await pending;
    }
  });
});

test('11 recuperación concurrente e idempotente sin contradicción con finalización', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation = await claim(f);
    await f.expire();
    const [one,two,finish] = await Promise.all([
      f.queue.recuperarVencidas(), f.queue.recuperarVencidas(),
      f.queue.finalizar(reservation, { tipo: 'entregado' }),
    ]);
    assert.equal(one + two, 1);
    assert.equal(finish, false);
    const backoff = (await f.pool.query(`SELECT
      proxima_ejecucion BETWEEN actualizada_en+interval '0.02 seconds'
      AND actualizada_en+interval '0.024 seconds' AS correcto FROM ${f.name}.entrega`)).rows[0];
    assert.equal(backoff.correcto, true);
    assert.equal(await f.queue.recuperarVencidas(), 0);
    assert.equal((await f.rows('entrega'))[0]?.estado, 'esperando_reintento');
    assert.equal((await f.rows('intento'))[0]?.resultado, 'desconocido');
  });
});

test('12 una finalización vigente gana frente a recuperación sin vencimiento', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation = await claim(f);
    const [finish,recover] = await Promise.all([
      f.queue.finalizar(reservation, { tipo: 'entregado' }), f.queue.recuperarVencidas(),
    ]);
    assert.equal(finish, true);
    assert.equal(recover, 0);
    assert.equal((await f.rows('entrega'))[0]?.estado, 'entregado');
    assert.equal((await f.rows('intento'))[0]?.resultado, 'confirmado');
  });
});

test('13 muerte real del hijo tras reserva confirmada y recuperación desde otra instancia', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    await crash(f, 1);
    const restarted = new PostgresQueue(f.pool, f.schema, { reservaMs: 1500, baseReintentoMs: 20 });
    await until(async () => (await restarted.recuperarVencidas()) === 1);
    assert.equal((await f.rows('intento'))[0]?.resultado, 'desconocido');
    const reservation = await until(() => restarted.reservar());
    assert.equal(reservation.intento, 2);
    assert.equal(await restarted.finalizar(reservation, { tipo: 'entregado' }), true);
  });
});

test('14 interrupción real en sexto intento: agotado y nunca séptima reserva', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    for (let number = 1; number <= 5; number++) {
      const reservation = await until(() => f.queue.reservar());
      assert.equal(reservation.intento, number);
      assert.equal(await f.queue.finalizar(reservation, { tipo: 'reintentar' }), true);
    }
    await until(async () => (await f.pool.query(`SELECT clock_timestamp()>=proxima_ejecucion AS ready FROM ${f.name}.entrega`)).rows[0]?.ready);
    await crash(f, 6);
    await until(async () => (await f.queue.recuperarVencidas()) === 1);
    assert.equal((await f.rows('entrega'))[0]?.estado, 'agotado');
    assert.equal((await f.rows('entrega'))[0]?.intentos, 6);
    assert.equal((await f.rows('intento')).length, 6);
    assert.equal((await f.rows('intento')).find(row => row.numero === 6)?.resultado, 'desconocido');
    assert.equal(await f.queue.reservar(), undefined);
    assert.equal(await f.queue.recuperarVencidas(), 0);
  });
});

test('15 error SQL de historial revierte finalización y recuperación', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation = await claim(f);
    await f.failTrigger('intento','UPDATE');
    await assert.rejects(f.queue.finalizar(reservation, { tipo: 'entregado' }), /fallo SQL provocado/);
    assert.equal((await f.rows('entrega'))[0]?.estado, 'en_proceso');
    assert.equal((await f.rows('intento'))[0]?.resultado, 'reservado');
    await f.expire();
    await assert.rejects(f.queue.recuperarVencidas(), /fallo SQL provocado/);
    assert.equal((await f.rows('entrega'))[0]?.estado, 'en_proceso');
    assert.equal((await f.rows('intento'))[0]?.resultado, 'reservado');
    await f.removeTrigger('intento');
    assert.equal(await f.queue.recuperarVencidas(), 1);
  });
});

test('16 cinco bases reales y jitter 0–20 %, sexta finalización agota presupuesto', async t => {
  await withFixture(async f => {
    const queue = new PostgresQueue(f.pool, f.schema, POLITICA_INICIAL);
    await queue.registrar(event());
    const observed: number[] = [];
    for (let number = 1; number <= 6; number++) {
      const reservation = await queue.reservar();
      assert.ok(reservation);
      assert.equal(reservation.intento, number);
      const lease = (await f.pool.query(`SELECT reserva_hasta-actualizada_en=interval '30 seconds'
        AS correcto FROM ${f.name}.entrega`)).rows[0];
      assert.equal(lease.correcto, true);
      assert.equal(await queue.finalizar(reservation, { tipo: 'reintentar' }), true);
      if (number < 6) {
        const base = 5000 * 2 ** (number - 1);
        const row = (await f.pool.query(`SELECT extract(epoch FROM (proxima_ejecucion-actualizada_en))*1000 AS ms,
          proxima_ejecucion>=actualizada_en+$1*interval '1 millisecond' AND
          proxima_ejecucion<=actualizada_en+$2*interval '1 millisecond' AS correcto FROM ${f.name}.entrega`,[base,base*1.2])).rows[0];
        assert.equal(row.correcto,true);
        observed.push(Number(row.ms));
        await f.ready();
      }
    }
    assert.equal((await f.rows('entrega'))[0]?.estado,'agotado');
    assert.equal((await f.rows('intento')).length,6);
    assert.equal(await queue.reservar(),undefined);
    t.diagnostic('Backoff PostgreSQL programado, ms (fixtures adelantan consumo): ' + observed.join(', '));
  });
});

test('17 fecha mínima posterior se respeta; fecha anterior no reduce backoff', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const first = await claim(f);
    const minimum: Date = (await f.pool.query("SELECT clock_timestamp()+interval '0.3 seconds' AS fecha")).rows[0].fecha;
    assert.equal(await f.queue.finalizar(first, { tipo: 'reintentar', fechaMinima: minimum }),true);
    const scheduled = (await f.rows('entrega'))[0].proxima_ejecucion as Date;
    assert.ok(scheduled.getTime() >= minimum.getTime());
    assert.equal(await f.queue.reservar(),undefined);
    const second = await until(() => f.queue.reservar());
    const attempt = (await f.rows('intento')).find(row=>row.numero===2);
    assert.ok(attempt.reservado_en.getTime()>=minimum.getTime());
    await f.queue.finalizar(second,{tipo:'reintentar',fechaMinima:new Date(0)});
    const row=(await f.pool.query(`SELECT proxima_ejecucion>=actualizada_en+interval '0.04 seconds' AS correcto FROM ${f.name}.entrega`)).rows[0];
    assert.equal(row.correcto,true);
  });
});

test('18 trabajo antiguo sigue disponible; no se purga evento, entrega ni historial', async () => {
  await withFixture(async f => {
    const input=event();
    // Fixture antiguo explícito: no se presenta como una espera real de años.
    await f.pool.query(`INSERT INTO ${f.name}.evento(evento_id,pedido_id,contenido,creado_en)
      VALUES ($1,$2,$3,clock_timestamp()-interval '3 years')`,[input.eventoId,input.pedidoId,JSON.stringify(input.contenido)]);
    await f.pool.query(`INSERT INTO ${f.name}.entrega(evento_id,proxima_ejecucion,actualizada_en)
      VALUES ($1,clock_timestamp()-interval '3 years',clock_timestamp()-interval '3 years')`,[input.eventoId]);
    assert.equal(await f.queue.recuperarVencidas(),0);
    const reservation=await claim(f);
    await f.queue.finalizar(reservation,{tipo:'reintentar'});
    await f.pool.query(`UPDATE ${f.name}.entrega SET proxima_ejecucion=clock_timestamp()-interval '2 years' WHERE evento_id=$1`,[input.eventoId]);
    const second=await claim(f);
    assert.equal(second.intento,2);
    await f.queue.finalizar(second,{tipo:'entregado'});
    assert.equal(await f.queue.registrar(input),'duplicado');
    assert.equal((await f.rows('evento')).length,1);
    assert.equal((await f.rows('entrega')).length,1);
    assert.equal((await f.rows('intento')).length,2);
  });
});

test('19 fallo definitivo cierra sin reintento y sin gastar seis intentos', async () => {
  await withFixture(async f => {
    await f.queue.registrar(event());
    const reservation=await claim(f);
    assert.equal(await f.queue.finalizar(reservation,{tipo:'fallido_definitivo'}),true);
    assert.equal((await f.rows('entrega'))[0]?.estado,'fallido_definitivo');
    assert.equal((await f.rows('entrega'))[0]?.intentos,1);
    assert.equal((await f.rows('intento'))[0]?.resultado,'fallido_definitivo');
    assert.equal(await f.queue.reservar(),undefined);
  });
});

test('20 otra base real se rechaza y no quedan esquemas propios residuales', async () => {
  const other=new URL(url); other.pathname='/postgres';
  const rejected=new pg.Pool({connectionString:other.toString(),...connectionOptions});
  try { await assert.rejects(assertDatabase(rejected),/current_database incorrecta/); }
  finally { await rejected.end(); }
  const pool=new pg.Pool({connectionString:url,...connectionOptions});
  try {
    await assertDatabase(pool);
    const result=await pool.query("SELECT nspname FROM pg_namespace WHERE nspname ~ '^p03_core_[a-f0-9]{24}$'");
    assert.equal(result.rowCount,0,'Residuos: informar y revisar propiedad, nunca borrar a ciegas');
  } finally { await pool.end(); }
});
