import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID, randomInt } from 'node:crypto';
import pg from 'pg';
import { assertDatabase, requiredUrl, withFixture, until } from '../core/support.js';
import { call, envelope, runtime, tokens, withHttp } from './support.js';
import { readConfig } from '../../src/server/config.js';

const url=requiredUrl();
const initial=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});
try { await assertDatabase(initial); }
catch { throw new Error('PostgreSQL real requerido para HTTP; no se omiten casos.'); }
finally { await initial.end(); }

test('01 salud y disponibilidad son JSON mínimos y sin caché',async()=>{
  await withHttp(async(_f,api)=>{
    assert.deepEqual((await call(api.port,'GET','/salud',{token:null})).body,{estado:'vivo'});
    const ready=await call(api.port,'GET','/listo',{token:null});
    assert.equal(ready.status,200); assert.deepEqual(ready.body,{estado:'listo'});
    assert.equal(ready.headers['cache-control'],'no-store');
    assert.equal(ready.headers['x-powered-by'],undefined);
    assert.equal(ready.headers['set-cookie'],undefined);
    assert.equal(ready.headers['access-control-allow-origin'],undefined);
  });
});
test('02 aceptación 202 persiste sobre completo y consulta pendiente sin datos internos',async()=>{
  await withHttp(async(f,api)=>{
    const event=envelope();
    const response=await call(api.port,'POST','/eventos',{body:event});
    assert.equal(response.status,202);
    assert.deepEqual(response.body,{eventoId:event.eventoId,resultado:'creado',consulta:'/eventos/'+event.eventoId});
    assert.equal(response.headers.location,response.body.consulta);
    assert.equal((await f.rows('evento')).length,1);
    assert.deepEqual((await f.rows('evento'))[0].contenido,event);
    assert.equal((await f.rows('entrega')).length,1);
    assert.equal((await f.rows('intento')).length,0);
    const query=await call(api.port,'GET',response.body.consulta);
    assert.equal(query.status,200); assert.equal(query.body.estado,'pendiente'); assert.equal(query.body.intentos,0);
    assert.deepEqual(Object.keys(query.body).sort(),['eventoId','pedidoId','estado','intentos','creadoEn','actualizadoEn','proximaEjecucion','reservaHasta','finalizadoEn'].sort());
    assert.equal(query.body.eventoId,event.eventoId); assert.equal(query.body.pedidoId,event.datos.pedidoId);
    assert.ok(Number.isFinite(Date.parse(query.body.creadoEn))); assert.equal(query.body.finalizadoEn,null);
  });
});
test('03 repetición equivalente con propiedades reordenadas devuelve 200 sin nuevas filas',async()=>{
  await withHttp(async(f,api)=>{
    const event=envelope();
    await call(api.port,'POST','/eventos',{body:event});
    const reordered={datos:event.datos,ocurridoEn:event.ocurridoEn,version:1,tipo:event.tipo,eventoId:event.eventoId};
    const response=await call(api.port,'POST','/eventos',{body:reordered});
    assert.equal(response.status,200); assert.equal(response.body.resultado,'duplicado');
    assert.equal((await f.rows('evento')).length,1); assert.equal((await f.rows('entrega')).length,1);
  });
});
test('04 seis duplicados HTTP concurrentes producen una creación y cinco duplicados',async()=>{
  await withHttp(async(f,api)=>{
    const event=envelope();
    const results=await Promise.all(Array.from({length:6},()=>call(api.port,'POST','/eventos',{body:event})));
    assert.equal(results.filter(r=>r.status===202).length,1); assert.equal(results.filter(r=>r.status===200).length,5);
    assert.equal((await f.rows('evento')).length,1); assert.equal((await f.rows('entrega')).length,1);
  });
});
test('05 conflictos de contenido, identidad, pedido y orden de líneas',async()=>{
  await withHttp(async(f,api)=>{
    const event=envelope(); event.datos.lineas.push({sku:'SEGUNDO',cantidad:1});
    await call(api.port,'POST','/eventos',{body:event});
    const others=[
      {...event,ocurridoEn:'2026-11-13T11:00:00.000Z'},
      {...event,datos:{...event.datos,pedidoId:'OTRO'}},
      {...event,eventoId:randomUUID()},
      {...event,datos:{...event.datos,lineas:[...event.datos.lineas].reverse()}},
    ];
    for(const body of others) assert.equal((await call(api.port,'POST','/eventos',{body})).status,409);
    assert.equal((await f.rows('evento')).length,1);
  });
});
test('06 contrato inválido y campos desconocidos se rechazan sin persistir',async()=>{
  await withHttp(async(f,api)=>{
    const base=envelope();
    const invalid: unknown[]=[
      null,[],true,1,'texto',{}, {...base,extra:1}, {...base,version:'1'}, {...base,version:2},
      {...base,tipo:'pedido.creado'}, {...base,eventoId:base.eventoId.toUpperCase()},
      {...base,eventoId:base.eventoId+'\n'}, {...base,datos:{...base.datos,extra:true}},
    ];
    for(const pedidoId of ['', ' PED', 'PED ', 'PED\n', '_PED', 'á', 'A'.repeat(101),42]) invalid.push({...base,datos:{...base.datos,pedidoId}});
    for(const sku of ['', '-ART','ART\n','A'.repeat(101),'Á',3]) invalid.push({...base,datos:{...base.datos,lineas:[{sku,cantidad:2}]}});
    for(const cantidad of [0,-1,1.5,1000001,'2',null,true]) invalid.push({...base,datos:{...base.datos,lineas:[{sku:'ART',cantidad}]}});
    for(const lineas of [[],Array.from({length:101},(_,i)=>({sku:'A'+i,cantidad:1})),[{sku:'A',cantidad:1},{sku:'A',cantidad:2}],
      [{sku:'A',cantidad:1,extra:0}], [{sku:'A'}], [null], {}]) invalid.push({...base,datos:{...base.datos,lineas}});
    for(const key of Object.keys(base)) { const copy: Record<string,unknown>={...base}; delete copy[key]; invalid.push(copy); }
    for(const body of invalid) {
      const response=await call(api.port,'POST','/eventos',{body});
      assert.equal(response.status,422); assert.equal(response.body.error.codigo,'contrato_invalido');
    }
    assert.equal((await f.rows('evento')).length,0);
  });
});
test('07 límites válidos y calendario real sin normalización silenciosa',async()=>{
  await withHttp(async(f,api)=>{
    const event=envelope(); event.ocurridoEn='2024-02-29T23:59:59.999Z';
    event.datos.pedidoId='A'.repeat(100);
    event.datos.lineas=Array.from({length:100},(_,i)=>({sku:String(i).padEnd(100,'A'),cantidad:i===0?1:1000000}));
    assert.equal((await call(api.port,'POST','/eventos',{body:event})).status,202);
    for(const ocurridoEn of ['2025-02-29T10:00:00.000Z','2026-04-31T10:00:00.000Z','2026-13-01T10:00:00.000Z',
      '2026-11-13T24:00:00.000Z','2026-11-13T10:00:60.000Z','2026-11-13T10:00:00Z','2026-11-13T10:00:00.000+00:00',
      '2026-11-13t10:00:00.000z',event.ocurridoEn+'\n',1]) {
      assert.equal((await call(api.port,'POST','/eventos',{body:{...envelope(),ocurridoEn}})).status,422);
    }
    assert.equal((await f.rows('evento')).length,1);
  });
});
test('08 autenticación precede al parser y separa recepción/consulta',async()=>{
  await withHttp(async(f,api)=>{
    const path='/eventos/'+randomUUID();
    for(const token of [null,'desconocido']) {
      const response=await call(api.port,'POST','/eventos',{raw:'{',token,headers:{'Content-Type':'text/plain'}});
      assert.equal(response.status,401); assert.ok(response.headers['www-authenticate']);
      assert.equal((await call(api.port,'GET',path,{token})).status,401);
    }
    assert.equal((await call(api.port,'POST','/eventos',{raw:'{',token:tokens.consulta})).status,403);
    assert.equal((await call(api.port,'GET',path,{token:tokens.recepcion})).status,403);
    assert.equal((await f.rows('evento')).length,0);
  });
});
test('09 JSON mal formado es 400 y un valor JSON fuera de contrato es 422',async()=>{
  await withHttp(async(f,api)=>{
    for(const raw of ['{','{"eventoId":}','undefined','{"a":1,}']) {
      const response=await call(api.port,'POST','/eventos',{raw});
      assert.equal(response.status,400); assert.equal(response.body.error.codigo,'json_invalido');
    }
    assert.equal((await call(api.port,'POST','/eventos',{raw:'null'})).status,422);
    assert.equal((await f.rows('evento')).length,0);
  });
});
test('10 tipo, charset y codificación: solo JSON UTF-8 sin compresión',async()=>{
  await withHttp(async(f,api)=>{
    for(const headers of [
      {'Content-Type':'text/plain'}, {'Content-Type':'application/json; charset=utf-16'},
      {'Content-Type':'application/json; charset=iso-8859-1'}, {'Content-Type':'application/problem+json'},
      {'Content-Type':'application/json; other=yes'}, {'Content-Type':''},
      {'Content-Encoding':'gzip'}, {'Content-Encoding':'br'}, {'Content-Encoding':'deflate'},
    ]) assert.equal((await call(api.port,'POST','/eventos',{body:envelope(),headers})).status,415);
    assert.equal((await call(api.port,'POST','/eventos',{raw:Buffer.from([0x7b,0xff,0x7d])})).status,415);
    assert.equal((await call(api.port,'POST','/eventos',{body:envelope(),headers:{'Content-Type':'application/json; charset="UTF-8"'}})).status,202);
    assert.equal((await f.rows('evento')).length,1);
  });
});
test('11 límite de 64 KiB inclusive y exceso con transferencia segmentada',async()=>{
  await withHttp(async(f,api)=>{
    const event=envelope(), body=JSON.stringify(event);
    const exact=body+' '.repeat(65536-Buffer.byteLength(body));
    assert.equal((await call(api.port,'POST','/eventos',{raw:exact})).status,202);
    const tooLarge=exact+' ';
    assert.equal((await call(api.port,'POST','/eventos',{raw:tooLarge})).status,413);
    assert.equal((await call(api.port,'POST','/eventos',{raw:tooLarge,chunked:true})).status,413);
    assert.equal((await call(api.port,'POST','/eventos',{raw:tooLarge,token:null})).status,401);
    assert.equal((await f.rows('evento')).length,1);
  });
});
test('12 consulta inexistente, identificador inválido y ruta desconocida',async()=>{
  await withHttp(async(_f,api)=>{
    assert.equal((await call(api.port,'GET','/eventos/'+randomUUID())).status,404);
    assert.equal((await call(api.port,'GET','/eventos/no-uuid')).status,422);
    assert.equal((await call(api.port,'GET','/eventos/no-uuid',{token:null})).status,401);
    const response=await call(api.port,'GET','/no-existe');
    assert.equal(response.status,404); assert.equal(response.body.error.codigo,'ruta_no_encontrada');
  });
});
test('13 error SQL al crear entrega revierte evento y responde 500, nunca 202 ni 503',async()=>{
  await withHttp(async(f,api)=>{
    await f.failTrigger('entrega','INSERT');
    const response=await call(api.port,'POST','/eventos',{body:envelope()});
    assert.equal(response.status,500); assert.equal(response.body.error.codigo,'error_interno');
    assert.equal((await f.rows('evento')).length,0); assert.equal((await f.rows('entrega')).length,0);
  });
});
test('14 respuesta 202 espera realmente COMMIT bloqueado por trigger diferido',async()=>{
  await withHttp(async(f,api)=>{
    const key=randomInt(100000000,900000000);
    await f.pool.query(`CREATE FUNCTION ${f.name}.esperar_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(${key}); RETURN NEW; END; $$;
      CREATE CONSTRAINT TRIGGER esperar_commit AFTER INSERT ON ${f.name}.entrega
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${f.name}.esperar_commit()`);
    const locker=await f.pool.connect();
    let response: ReturnType<typeof call> | undefined;
    try {
      await locker.query('SELECT pg_advisory_lock($1)',[key]);
      const pid=(await locker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      let completed=false;
      response=call(api.port,'POST','/eventos',{body:envelope()}).then(result=>{completed=true;return result;});
      await until(async()=>(await f.pool.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',[pid])).rows[0]?.blocked);
      assert.equal(completed,false); assert.equal((await f.rows('evento')).length,0);
      await locker.query('SELECT pg_advisory_unlock($1)',[key]);
      assert.equal((await response).status,202); assert.equal((await f.rows('evento')).length,1);
    } finally {
      await locker.query('SELECT pg_advisory_unlock_all()'); locker.release();
      if(response) await response;
    }
  });
});
test('15 error diferido durante COMMIT tampoco produce aceptación ni filas',async()=>{
  await withHttp(async(f,api)=>{
    await f.pool.query(`CREATE FUNCTION ${f.name}.fallar_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo diferido' USING ERRCODE='23514'; END; $$;
      CREATE CONSTRAINT TRIGGER fallar_commit AFTER INSERT ON ${f.name}.entrega
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${f.name}.fallar_commit()`);
    assert.equal((await call(api.port,'POST','/eventos',{body:envelope()})).status,500);
    assert.equal((await f.rows('evento')).length,0); assert.equal((await f.rows('entrega')).length,0);
  });
});
test('16 persistencia inaccesible: salud viva, listo y aceptación 503 sin falsa aceptación',async()=>{
  await withFixture(async f=>{
    const socket=createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
    const port=(socket.address() as import('node:net').AddressInfo).port;
    await new Promise<void>(resolve=>socket.close(()=>resolve()));
    const absent=new URL(url); absent.port=String(port);
    const api=await runtime(f,()=>{},absent.toString());
    try {
      assert.equal((await call(api.port,'GET','/salud')).status,200);
      assert.equal((await call(api.port,'GET','/listo')).status,503);
      assert.equal((await call(api.port,'POST','/eventos',{body:envelope()})).status,503);
      assert.equal((await call(api.port,'GET','/eventos/'+randomUUID())).status,503);
      assert.equal((await f.rows('evento')).length,0);
    } finally { await api.close(); }
  });
});
test('17 reinicio real del proceso HTTP conserva evento pendiente y deduplicación',async()=>{
  await withFixture(async f=>{
    async function child() {
      const process=fork(new URL('./server-child.js',import.meta.url),[f.schema],{
        env:{...globalThis.process.env,TEST_DATABASE_URL:url,RECEPCION_TOKEN:tokens.recepcion,CONSULTA_TOKEN:tokens.consulta},
        stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,
      });
      const exit=once(process,'exit');
      const timer=setTimeout(()=>process.kill('SIGKILL'),15000);
      try {
        const [message]=await Promise.race([once(process,'message'),exit.then(()=>{ throw new Error('Hijo salió antes de iniciar HTTP'); })]);
        assert.equal(message.tipo,'listo');
        return {port:message.port as number,close:async()=>{
          process.send('cerrar');
          const [code]=await exit; clearTimeout(timer); assert.equal(code,0);
        }};
      } catch(error) { process.kill('SIGKILL'); await exit; clearTimeout(timer); throw error; }
    }
    const event=envelope();
    const first=await child();
    try { assert.equal((await call(first.port,'POST','/eventos',{body:event})).status,202); }
    finally { await first.close(); }
    const second=await child();
    try {
      const result=await call(second.port,'GET','/eventos/'+event.eventoId);
      assert.equal(result.status,200); assert.equal(result.body.estado,'pendiente');
      assert.equal((await call(second.port,'POST','/eventos',{body:event})).status,200);
      assert.equal((await f.rows('evento')).length,1);
    } finally { await second.close(); }
  });
});
test('18 cierre repetido libera servidor y pool',async()=>{
  await withFixture(async f=>{
    const api=await runtime(f);
    await call(api.port,'GET','/listo');
    await Promise.all([api.close(),api.close()]);
    assert.equal(api.server.listening,false); assert.equal(api.pool.ended,true);
    await assert.rejects(call(api.port,'GET','/salud'));
  });
});
test('19 sin migración explícita listo devuelve 503 y arrancar no crea esquema',async()=>{
  await withFixture(async f=>{
    const schema='p03_ausente_'+randomUUID().replaceAll('-','');
    const api=await runtime(f,()=>{},url,schema);
    try {
      assert.equal((await call(api.port,'GET','/salud')).status,200);
      const result=await call(api.port,'GET','/listo');
      assert.equal(result.status,503); assert.equal(result.body.error.codigo,'persistencia_no_preparada');
      assert.equal((await f.pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);
    } finally { await api.close(); }
  });
});
test('20 respuestas y logs no contienen secretos ni cuerpos aunque SQL los incluya',async()=>{
  await withHttp(async(f,api,logs)=>{
    const event=envelope();
    await f.pool.query(`CREATE FUNCTION ${f.name}.fallo_privado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION '${tokens.recepcion}'; END; $$;
      CREATE TRIGGER fallo_privado BEFORE INSERT ON ${f.name}.entrega
      FOR EACH ROW EXECUTE FUNCTION ${f.name}.fallo_privado()`);
    const result=await call(api.port,'POST','/eventos',{body:event});
    assert.equal(result.status,500);
    const text=JSON.stringify({result,logs});
    for(const secret of [tokens.recepcion,tokens.consulta,event.datos.pedidoId,decodeURIComponent(new URL(url).password)]) assert.ok(!text.includes(secret));
    assert.deepEqual(logs,[{evento:'error_http',codigo:'error_interno',estado:500}]);
    assert.ok(!text.includes('Authorization')); assert.ok(!text.includes('reserva_token'));
  });
});
test('21 configuración rechaza credenciales ausentes/iguales y confusión con base de pruebas',()=>{
  const env={DATABASE_URL:'postgresql://p03_api:privado@127.0.0.1:55434/entrega_fiable_eventos_pedidos',RECEPCION_TOKEN:tokens.recepcion,CONSULTA_TOKEN:tokens.consulta};
  assert.equal(readConfig(env).port,3003);
  for(const invalid of [
    {...env,RECEPCION_TOKEN:''},{...env,CONSULTA_TOKEN:tokens.recepcion},{...env,CONSULTA_TOKEN:'demo'},
    {...env,DATABASE_URL:url},{...env,DATABASE_URL:env.DATABASE_URL+'_test'},
    {...env,PORT:'0'},{...env,PORT:'3003x'},{...env,PORT:'65536'},
  ]) assert.throws(()=>readConfig(invalid));
});
test('22 ausencia de esquemas y conexiones HTTP residuales',async()=>{
  const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});
  try {
    await assertDatabase(pool);
    assert.equal((await pool.query("SELECT 1 FROM pg_namespace WHERE nspname ~ '^p03_core_[a-f0-9]{24}$'")).rowCount,0);
    assert.equal((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='p03_api' AND datname=current_database()")).rowCount,0);
  } finally { await pool.end(); }
});
