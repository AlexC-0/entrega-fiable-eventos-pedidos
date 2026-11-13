import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { DATABASE, QUEUE, Experiment, assertDatabase, bossOptions, identifier, poolOptions, requiredUrl, until, withExperiment } from './support.js';
import type { Claim } from './support.js';

// Fallo explícito antes de declarar los casos si falta base; no hay skip ni mocks.
const url = requiredUrl();
const preflight = new pg.Pool({ connectionString: url, ...poolOptions });
try { await assertDatabase(preflight); }
catch { throw new Error('PostgreSQL real requerido: no conecta o no coincide base/rol. Ninguna prueba de cola se omite silenciosamente.'); }
finally { await preflight.end(); }

async function reserved(e: Experiment) {
  return until(() => e.reserve());
}
async function queueState(e: Experiment, id: string, state: string) {
  return until(async () => {
    await e.boss.supervise(QUEUE);
    const [job] = await e.jobs(id);
    return job?.state === state ? job : false;
  });
}
async function crashAfterReserve(e: Experiment, retryCount: number) {
  const child = fork(new URL('./consumer.js', import.meta.url), [e.app, e.queueSchema], {
    env: { ...process.env, TEST_DATABASE_URL: e.url }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    const message = await new Promise<{ kind: string; retryCount: number }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Hijo sin confirmar reserva')), 10000);
      child.once('message', value => resolve(value as { kind: string; retryCount: number }));
      child.once('error', () => reject(new Error('No se pudo iniciar el consumidor hijo')));
      child.once('exit', () => reject(new Error('Consumidor salió antes de confirmar')));
    });
    assert.equal(message.kind, 'reserved');
    assert.equal(message.retryCount, retryCount);
    const attempts = await e.rows('intento');
    assert.equal(attempts.length, retryCount + 1, 'Historial visible desde otra conexión antes de matar');
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
  }
}
async function httpFixture(action: (url: string, received: number[]) => Promise<void>, replies: number[] = [200]) {
  const received: number[] = [];
  const server = createServer((request, response) => {
    request.resume();
    received.push(Date.now());
    const status = replies[Math.min(received.length - 1, replies.length - 1)] ?? 200;
    response.writeHead(status, status === 429 ? { 'Retry-After': '2' } : {});
    response.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try { await action('http://127.0.0.1:' + address.port, received); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
async function send(destination: string, job: Claim) {
  return fetch(destination, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ eventoId: job.data.eventoId }),
  });
}

test('A: COMMIT, ROLLBACK y fallo de encolado conservan evento/trabajo atómicos', async () => {
  await withExperiment(async e => {
    const id = await e.enqueue();
    assert.equal((await e.rows('evento')).length, 1);
    assert.equal((await e.jobs(id)).length, 1);
    await assert.rejects(e.enqueue(undefined, true), /rollback provocado/);
    assert.equal((await e.rows('evento')).length, 1);
    await assert.rejects(e.enqueue(undefined, false, 'cola_inexistente'));
    assert.equal((await e.rows('evento')).length, 1);
    assert.equal((await e.boss.findJobs(QUEUE)).length, 1);
  });
});

test('B: fallo SQL de historial revierte reserva; dos consumidores no comparten reserva', async () => {
  await withExperiment(async e => {
    const id = await e.enqueue();
    await assert.rejects(e.reserve(true), (error: unknown) => (error as { code?: string }).code === '23502');
    assert.equal((await e.jobs(id))[0]?.state, 'created');
    assert.equal((await e.rows('intento')).length, 0);
    const claims = (await Promise.all([e.reserve(), e.reserve()])).filter(value => value !== undefined);
    assert.equal(claims.length, 1);
    assert.equal((await e.rows('intento')).length, 1);
    assert.equal(claims[0]?.retryCount, 0);
  });
});

test('C: muerte de proceso en primera y sexta reserva; recuperación, desconocido y ningún séptimo envío', async () => {
  await withExperiment(async e => {
    const id = await e.enqueue();
    // El supervisor permanece vivo mientras muere el consumidor.
    const supervisor = new PgBoss(bossOptions(e.queueSchema, e.url, true));
    supervisor.on('error', error => e.errors.push(error));
    await supervisor.start();
    try {
      await crashAfterReserve(e, 0);
      await until(async () => (await e.jobs(id))[0]?.state === 'retry');
      await httpFixture(async (destination, received) => {
        for (let count = 1; count <= 4; count++) {
          const job = await reserved(e);
          assert.equal(job.retryCount, count);
          assert.equal((await e.rows('intento')).length, count + 1);
          assert.equal((await send(destination, job)).status, 200);
          await e.retry(job); // Se fuerza fallo después del HTTP: efecto remoto incierto.
        }
        await crashAfterReserve(e, 5);
        await until(async () => (await e.jobs(id))[0]?.state === 'failed');
        // Nuevo objeto de proceso tras la muerte, sin depender de un finally del hijo.
        const restarted = new Experiment(e.app, e.queueSchema, e.url);
        try {
          await restarted.boss.start();
          await restarted.reconcile(id);
          await restarted.reconcile(id);
          assert.equal((await restarted.rows('entrega'))[0]?.estado, 'agotado');
          assert.equal(await restarted.reserve(), undefined);
        } finally { await restarted.close(); }
        const attempts = await e.rows('intento');
        assert.equal(attempts.length, 6);
        assert.equal(attempts.find(row => row.numero === 1)?.resultado, 'desconocido');
        assert.equal(attempts.find(row => row.numero === 6)?.resultado, 'desconocido');
        assert.equal(received.length, 4, 'Las dos reservas interrumpidas no enviaron HTTP');
      });
    } finally { await supervisor.stop(); }
  });
});

test('D: resultado antiguo no sobrescribe reserva vigente ni entrega posterior', async () => {
  await withExperiment(async e => {
    const id = await e.enqueue();
    const old = await reserved(e);
    await queueState(e, id, 'retry');
    const current = await reserved(e);
    assert.equal(current.retryCount, 1);
    await assert.rejects(e.complete(old), /Reserva de cola antigua/);
    assert.equal((await e.jobs(id))[0]?.state, 'active');
    assert.equal((await e.rows('entrega'))[0]?.generacion, 2);
    await e.complete(current);
    await assert.rejects(e.complete(old), /Reserva de cola antigua/);
    assert.equal((await e.rows('entrega'))[0]?.estado, 'entregado');
    assert.equal((await e.rows('intento')).find(row => row.numero === 2)?.resultado, 'confirmado');
  });
});

test('E: 503 y 429 reales; fail/update atómicos, Retry-After y backoff observado', async t => {
  await withExperiment(async e => {
    await e.enqueue();
    await httpFixture(async (destination, received) => {
      const first = await reserved(e);
      assert.equal((await send(destination, first)).status, 503);
      const failureAt = Date.now();
      const backoff = await e.retry(first);
      t.diagnostic('Primer backoff nativo programado (ms): ' + (backoff.native.getTime() - failureAt));
      const second = await reserved(e);
      assert.ok(Date.now() >= backoff.scheduled.getTime());
      const response = await send(destination, second);
      assert.equal(response.status, 429);
      const minimum = new Date(Date.now() + Number(response.headers.get('retry-after')) * 1000);
      const planned = await e.retry(second, minimum, async () => {
        // Otro consumidor intenta reservar entre fail y update, con transacción aún abierta.
        assert.equal(await e.reserve(), undefined);
      });
      assert.ok(planned.scheduled.getTime() >= minimum.getTime());
      assert.equal(await e.reserve(), undefined);
      const third = await reserved(e);
      const confirmation = await send(destination, third);
      assert.equal(confirmation.status, 200);
      assert.ok(received[2]! >= minimum.getTime(), 'Envío anterior a Retry-After');
      assert.equal(received.length, 3);
      await e.complete(third);
      t.diagnostic('Intervalos HTTP observados (ms): ' + received.slice(1).map((time, index) => time - received[index]!).join(', '));
    }, [503, 429, 200]);
  }, { retryDelay: 1, retryBackoff: true, expireInSeconds: 15 });
});

test('F1: rol ordinario, historial conservado al borrar job y sin transacción durante HTTP', async () => {
  await withExperiment(async e => {
    await assertDatabase(e.pool);
    const id = await e.enqueue();
    const job = await reserved(e);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const requestEntered = new Promise<void>(resolve => { entered = resolve; });
    const server = createServer(async (request, response) => {
      request.resume(); entered(); await gate; response.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    let sending: Promise<Response> | undefined;
    try {
      sending = send('http://127.0.0.1:' + address.port, job);
      await requestEntered;
      const active = await e.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = ANY($1) AND pid <> pg_backend_pid() AND xact_start IS NOT NULL", [[e.app, e.queueSchema]]);
      assert.equal(active.rows[0]?.n, 0);
      assert.equal((await e.rows('intento')).length, 1);
      release();
      assert.equal((await sending).status, 200);
      await e.complete(job);
      await delay(1100);
      await e.boss.supervise(QUEUE);
      assert.equal((await e.jobs(id)).length, 1, 'Terminal conservado con deleteAfterSeconds=0');
      assert.equal((await e.boss.deleteJob(QUEUE, id)).affected, 1);
      assert.equal((await e.jobs(id)).length, 0);
      assert.equal((await e.rows('intento'))[0]?.resultado, 'confirmado');
      assert.equal((await e.rows('entrega'))[0]?.estado, 'entregado');
    } finally {
      release();
      if (sending) await sending.catch(() => {});
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, { expireInSeconds: 15 });
});

test('F2: retención pendiente finita elimina job sin conciliar aunque deleteAfterSeconds=0', async () => {
  await withExperiment(async e => {
    await assert.rejects(e.boss.createQueue('sin_retencion', { retentionSeconds: 0 }), /retentionSeconds/);
    const id = await e.enqueue();
    await until(async () => {
      await e.boss.supervise(QUEUE);
      return (await e.jobs(id)).length === 0;
    });
    assert.equal((await e.rows('evento')).length, 1);
    assert.equal((await e.rows('entrega'))[0]?.estado, 'pendiente');
    await assert.rejects(e.reconcile(id), /Falta evidencia/);
  }, { retentionSeconds: 1, deleteAfterSeconds: 0 });
});

test('G: conexión a otra base real se rechaza antes de crear esquemas', async () => {
  const other = new URL(url);
  other.pathname = '/postgres';
  const pool = new pg.Pool({ connectionString: other.toString(), ...poolOptions });
  try { await assert.rejects(assertDatabase(pool), /current_database incorrecta/); }
  finally { await pool.end(); }
});

test('H: sin esquemas residuales de esta suite al terminar', async () => {
  const pool = new pg.Pool({ connectionString: url, ...poolOptions });
  try {
    await assertDatabase(pool);
    // Solo lectura: cualquier residuo informa fallo y no se borra automáticamente.
    const result = await pool.query("SELECT nspname FROM pg_namespace WHERE nspname ~ '^p03_(app|cola)_[a-f0-9]{24}$'");
    assert.equal(result.rowCount, 0, 'Esquemas residuales: inspeccionar su propiedad antes de limpiar');
  } finally { await pool.end(); }
});
