import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {withDelivery,receiver,laboratory,step,finish,token,policy} from './support.js';
import type {Context} from './support.js';
import {requiredUrl,assertDatabase,until,DATABASE} from '../core/support.js';
import {startServer} from '../../src/server/runtime.js';
import {envelope,call,runtime,tokens as apiTokens} from '../http/support.js';
import {validateEvent} from '../../src/http/validation.js';
import {cycle,runWorker} from '../../src/worker/loop.js';
import {destination,deliveryToken} from '../../src/worker/config.js';
import {retryAfter} from '../../src/worker/retry-after.js';
import {applyMigrations} from '../../src/persistence/migrate.js';
import * as initial from '../../src/persistence/migrations/001-core.js';
import {queueMigrations} from '../../src/persistence/catalog.js';
import {PostgresQueue} from '../../src/queue/postgres-queue.js';
import {EventStore} from '../../src/persistence/event-store.js';
const url=requiredUrl();
const preflight=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});
try{await assertDatabase(preflight);}catch{throw new Error('PostgreSQL real requerido para entrega; no se omiten casos.');}finally{await preflight.end();}
async function register(ctx:Context){const event=envelope();await ctx.f.queue.registrar(validateEvent(event));return event;}
async function preparations(ctx:Context){return (await ctx.pool.query('SELECT * FROM '+ctx.name+'.preparacion')).rows;}
function worker(ctx:Context,target:string,mode='run'){
 const child=fork(new URL('./worker-child.js',import.meta.url),[ctx.f.schema,target,mode],{
  env:{...process.env,TEST_DATABASE_URL:url,ENTREGA_TOKEN:token},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const phases:string[]=[];child.on('message',(message:any)=>phases.push(message.phase));
 const exited=once(child,'exit');const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
 return {wait:async(phase:string)=>until(async()=>{if(child.exitCode!==null||child.signalCode!==null)throw new Error('Hijo terminado prematuramente');return phases.includes(phase);}),
  close:async(kill=false)=>{if(child.exitCode===null && child.signalCode===null){if(kill)child.kill('SIGKILL');else child.send('stop');}
   const [code]=await exited;clearTimeout(timeout);if(!kill)assert.equal(code,0);}};
}

async function receiverProcess(ctx:Context){
 const child=fork(new URL('./receiver-child.js',import.meta.url),[ctx.schema],{env:{...process.env,TEST_DATABASE_URL:url,ENTREGA_TOKEN:token},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const exit=once(child,'exit');const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
 try{
  const [message]=await Promise.race([once(child,'message'),exit.then(()=>{throw new Error('Receptor no disponible');})]);
  assert.equal(message.phase,'ready');
  return {port:message.port as number,close:async()=>{if(child.connected)child.send('shutdown');const [code]=await exit;clearTimeout(timeout);assert.equal(code,0);}};
 }catch(error){child.kill('SIGKILL');await exit;clearTimeout(timeout);throw error;}
}

test('01 recorrido POST autenticado, trabajador, preparación única y entregado',async()=>{
 await withDelivery(async ctx=>{
  const api=await runtime(ctx.f),target=await receiver(ctx);
  try{
   const event=envelope();assert.equal((await call(api.port,'POST','/eventos',{body:event})).status,202);
   assert.equal((await ctx.f.rows('entrega'))[0].estado,'pendiente');
   await step(ctx,target.target);
   assert.equal((await call(api.port,'GET','/eventos/'+event.eventoId)).body.estado,'entregado');
   assert.equal((await preparations(ctx)).length,1);
   const attempt=(await ctx.f.rows('intento'))[0];assert.equal(attempt.codigo_http,200);assert.equal(attempt.categoria,'recibo_aplicado');
  }finally{await api.close();await target.close();}
 });
});
test('02 conexión rechazada conserva trabajo y entrega al arrancar receptor',async()=>{
 await withDelivery(async ctx=>{
  const first=await receiver(ctx),port=first.port,target=first.target;await first.close();
  await register(ctx);await step(ctx,target);
  assert.equal((await ctx.f.rows('intento'))[0].categoria,'conexion');
  assert.equal((await ctx.f.rows('entrega'))[0].estado,'esperando_reintento');
  const restarted=await receiver(ctx,false,port);
  try{await finish(ctx,target);assert.equal((await preparations(ctx)).length,1);assert.equal((await ctx.f.rows('entrega'))[0].intentos,2);}
  finally{await restarted.close();}
 });
});
test('03 respuesta perdida tras COMMIT remoto: dos envíos, una preparación',async t=>{
 await withDelivery(async ctx=>{
  const target=await receiver(ctx,true);
  try{
   await register(ctx);await step(ctx,target.target);
   assert.equal((await preparations(ctx)).length,1);
   assert.equal((await ctx.f.rows('entrega'))[0].estado,'esperando_reintento');
   await finish(ctx,target.target);
   assert.equal(target.count(),2);assert.deepEqual(target.receipts,['aplicado','ya_aplicado']);
   assert.equal((await preparations(ctx)).length,1);
   assert.deepEqual((await ctx.f.rows('intento')).sort((a,b)=>a.numero-b.numero).map(r=>r.categoria),['conexion','recibo_ya_aplicado']);
   t.diagnostic('Evidencia: 2 POST observados; aplicado/ya_aplicado; 1 preparación; entregado; 2 intentos persistidos.');
  }finally{await target.close();}
 });
});
test('04 muerte real tras reserva sin enviar: recuperación desde estado persistido',async()=>{
 await withDelivery(async ctx=>{
  const target=await receiver(ctx);await register(ctx);const child=worker(ctx,target.target,'reserve');
  try{
   await child.wait('reserved');assert.equal(target.count(),0);await child.close(true);
   await finish(ctx,target.target);
   const attempts=(await ctx.f.rows('intento')).sort((a,b)=>a.numero-b.numero);
   assert.equal(attempts[0].resultado,'desconocido');assert.equal(attempts[0].codigo_http,null);
   assert.equal(attempts[0].categoria,'reserva_vencida');assert.equal((await preparations(ctx)).length,1);
  }finally{await child.close(true);await target.close();}
 });
});
test('05 muerte real tras efecto remoto antes de finalizar: reenvío sin segundo efecto',async()=>{
 await withDelivery(async ctx=>{
  const target=await receiver(ctx);await register(ctx);const child=worker(ctx,target.target,'effect');
  try{
   await child.wait('effect');assert.equal((await preparations(ctx)).length,1);
   assert.equal((await ctx.f.rows('entrega'))[0].estado,'en_proceso');await child.close(true);
   await finish(ctx,target.target);
   assert.equal(target.count(),2);assert.equal((await preparations(ctx)).length,1);
   const attempts=(await ctx.f.rows('intento')).sort((a,b)=>a.numero-b.numero);
   assert.equal(attempts[0].resultado,'desconocido');assert.equal(attempts[0].codigo_http,null);
   assert.equal(attempts[1].categoria,'recibo_ya_aplicado');
  }finally{await child.close(true);await target.close();}
 });
});
test('06 fallo SQL al finalizar después de recibo: incertidumbre sin reenvío inmediato',async()=>{
 await withDelivery(async ctx=>{
  const target=await receiver(ctx);
  try{
   await register(ctx);await ctx.f.failTrigger('intento','UPDATE');
   await assert.rejects(step(ctx,target.target),/fallo SQL provocado/);
   assert.equal((await ctx.f.rows('entrega'))[0].estado,'en_proceso');
   assert.equal((await ctx.f.rows('intento'))[0].codigo_http,null);
   assert.equal(target.count(),1);assert.equal(await step(ctx,target.target),false);assert.equal(target.count(),1);
   await ctx.f.removeTrigger('intento');await ctx.f.expire(); // Fixture temporal explícito.
   await finish(ctx,target.target);
   assert.equal(target.count(),2);assert.equal((await preparations(ctx)).length,1);
  }finally{await target.close();}
 });
});
test('07 timeout total real de cinco segundos incluye lectura del recibo',async()=>{
 await withDelivery(async ctx=>{
  const target=await laboratory(res=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{"eventoId":');});
  try{
   await register(ctx);const started=performance.now();
   await cycle({pool:ctx.f.pool,schema:ctx.f.schema,database:DATABASE,target:target.target,token,log:()=>{}});
   const elapsed=performance.now()-started;assert.ok(elapsed>=4800 && elapsed<8500);
   const attempt=(await ctx.f.rows('intento'))[0];assert.equal(attempt.categoria,'timeout');assert.equal(attempt.codigo_http,200);
   assert.equal((await ctx.f.rows('entrega'))[0].estado,'esperando_reintento');
  }finally{await target.close();}
 });
});
test('08 429 Retry-After segundos y fecha: espera real sin adelantar reintento',async()=>{
 for(const form of ['segundos','fecha']){
  await withDelivery(async ctx=>{
   const minimum=(await ctx.pool.query("SELECT clock_timestamp()+interval '2 seconds' AS fecha")).rows[0].fecha as Date;
   const value=form==='segundos'?'1':minimum.toUTCString();
   const target=await laboratory((res,event,index)=>{
    if(index===1){res.writeHead(429,{'Retry-After':value});res.end('{}');}
    else{res.writeHead(200);res.end(JSON.stringify({eventoId:event.eventoId,resultado:'aplicado'}));}
   });
   try{
    await register(ctx);const before=(await ctx.pool.query('SELECT clock_timestamp() AS fecha')).rows[0].fecha as Date;
    await step(ctx,target.target);const planned=(await ctx.f.rows('entrega'))[0].proxima_ejecucion as Date;
    assert.ok(planned.getTime()>=(form==='segundos'?before.getTime()+1000:Date.parse(value)));
    assert.equal(await step(ctx,target.target),false);assert.equal(target.count(),1);
    await finish(ctx,target.target);
    const rows=(await ctx.f.rows('intento')).sort((a,b)=>a.numero-b.numero);
    assert.equal(rows[0].retry_after,form);assert.ok(rows[1].reservado_en.getTime()>=planned.getTime());
   }finally{await target.close();}
  });
 }
});
test('09 Retry-After ausente/inválido/no representable y pasado: categorías seguras',async()=>{
 await withDelivery(async ctx=>{
  for(const [value,category] of [[undefined,'ausente'],['-1','invalido'],['1.5','invalido'],['1e2','invalido'],
   ['9999999999999999999999','no_representable'],['Wed, 31 Feb 2027 00:00:00 GMT','invalido'],['Thu, 01 Jan 1970 00:00:00 GMT','fecha']] as const){
   const event=await register(ctx);
   const target=await laboratory(res=>{res.writeHead(429,value===undefined?{}:{'Retry-After':value});res.end('{}');});
   try{
    await step(ctx,target.target);
    const row=(await ctx.f.pool.query('SELECT * FROM '+ctx.f.name+'.intento WHERE evento_id=$1',[event.eventoId])).rows[0];
    assert.equal(row.retry_after,category);assert.equal(row.codigo_http,429);
    // Aísla las variantes sin reintento manual ni otra reserva: siguiente evento, fixture terminal.
    await ctx.f.pool.query("UPDATE "+ctx.f.name+".entrega SET estado='fallido_definitivo',proxima_ejecucion=NULL,finalizada_en=clock_timestamp() WHERE evento_id=$1",[event.eventoId]);
   }finally{await target.close();}
  }
  const large=await retryAfter(ctx.pool,'864000');assert.equal(large.categoria,'segundos');
  assert.ok(large.fechaMinima!.getTime()>Date.now()+9*86400000);
  const zero=await retryAfter(ctx.pool,'0000000000000000000000000000');assert.equal(zero.categoria,'segundos');
  for(const date of ['Sunday, 06-Nov-94 08:49:37 GMT','Sun Nov  6 08:49:37 1994'])
   assert.equal((await retryAfter(ctx.pool,date)).categoria,'fecha');
 });
});
test('10 seis respuestas 503 agotan sin séptimo envío',async()=>{
 await withDelivery(async ctx=>{
  const target=await laboratory(res=>{res.writeHead(503);res.end('{}');});
  try{
   await register(ctx);
   await until(async()=>{await step(ctx,target.target);return (await ctx.f.rows('entrega'))[0].estado==='agotado';});
   assert.equal(target.count(),6);assert.equal((await ctx.f.rows('intento')).length,6);
   assert.equal(await step(ctx,target.target),false);assert.equal(target.count(),6);
  }finally{await target.close();}
 });
});
test('11 408 reintenta; 4xx definitivos y redirecciones no se siguen',async()=>{
 for(const status of [408,400,401,403,404,409,422,301,302,307,308]){
  await withDelivery(async ctx=>{
   const sink=await laboratory(res=>res.end('{}'));
   const target=await laboratory(res=>{res.writeHead(status,{Location:sink.target});res.end('{}');});
   try{
    await register(ctx);await step(ctx,target.target);
    const row=(await ctx.f.rows('entrega'))[0],attempt=(await ctx.f.rows('intento'))[0];
    assert.equal(row.estado,status===408?'esperando_reintento':'fallido_definitivo');
    assert.equal(attempt.codigo_http,status);assert.equal(sink.count(),0);
   }finally{await target.close();await sink.close();}
  });
 }
});
test('12 recibos cerrados: 200 inválido y otros 2xx nunca acreditan entrega',async()=>{
 const variants=[(id:string)=>'{}',(id:string)=>'{',(id:string)=>JSON.stringify({eventoId:randomUUID(),resultado:'aplicado'}),
  (id:string)=>JSON.stringify({eventoId:id,resultado:'aplicado',extra:1}),
  (id:string)=>JSON.stringify({eventoId:id,resultado:['aplicado']}),
  (id:string)=>JSON.stringify({eventoId:id,resultado:'otro'})];
 for(const value of variants)await withDelivery(async ctx=>{
  const target=await laboratory((res,event)=>{res.writeHead(200);res.end(value(event.eventoId));});
  try{await register(ctx);await step(ctx,target.target);assert.equal((await ctx.f.rows('intento'))[0].categoria,'recibo_invalido');}
  finally{await target.close();}
 });
 await withDelivery(async ctx=>{
  const target=await laboratory((res,event)=>{res.writeHead(202);res.end(JSON.stringify({eventoId:event.eventoId,resultado:'aplicado'}));});
  try{await register(ctx);await step(ctx,target.target);assert.equal((await ctx.f.rows('entrega'))[0].estado,'esperando_reintento');}
  finally{await target.close();}
 });
});
test('13 respuesta excesiva y truncada se cancelan sin acreditar entrega',async()=>{
 for(const mode of ['large','truncated'])await withDelivery(async ctx=>{
  const target=await laboratory(res=>{
   if(mode==='large'){res.writeHead(200);res.end('x'.repeat(8193));}
   else{res.writeHead(200,{'Content-Length':'200'});res.flushHeaders();res.write('{"eventoId":');target.later(()=>res.destroy(),30);}
  });
  try{
   await register(ctx);await step(ctx,target.target);
   const attempt=(await ctx.f.rows('intento'))[0];assert.equal(attempt.codigo_http,200);
   assert.equal(attempt.categoria,mode==='large'?'respuesta_excesiva':'respuesta_interrumpida');
  }finally{await target.close();}
 });
});
test('14 dos procesos trabajadores entregan sin compartir reserva vigente',async()=>{
 await withDelivery(async ctx=>{
  const target=await receiver(ctx);
  for(let i=0;i<4;i++)await register(ctx);
  const one=worker(ctx,target.target),two=worker(ctx,target.target);
  try{
   await one.wait('started');await two.wait('started');
   await until(async()=>(await ctx.f.rows('entrega')).every(row=>row.estado==='entregado'));
   assert.equal(target.count(),4);assert.equal((await preparations(ctx)).length,4);
   assert.ok((await ctx.f.rows('entrega')).every(row=>row.intentos===1));
  }finally{await one.close();await two.close();await target.close();}
 });
});
test('15 receptor concurrente, conflictos y reinicio conservan un efecto',async()=>{
 await withDelivery(async ctx=>{
  const target=await receiverProcess(ctx);const event=envelope();
  try{
   assert.equal((await call(target.port,'POST','/eventos',{body:event,token:null})).status,401);
   const responses=await Promise.all(Array.from({length:6},()=>call(target.port,'POST','/eventos',{body:event,token})));
   assert.equal(responses.filter(r=>r.body.resultado==='aplicado').length,1);
   assert.equal(responses.filter(r=>r.body.resultado==='ya_aplicado').length,5);
   for(const other of [{...event,eventoId:randomUUID()},{...event,ocurridoEn:'2026-11-14T10:00:00.000Z'}])
    assert.equal((await call(target.port,'POST','/eventos',{body:other,token})).status,409);
  }finally{await target.close();}
  const restarted=await receiverProcess(ctx);
  try{assert.equal((await call(restarted.port,'POST','/eventos',{body:event,token})).body.resultado,'ya_aplicado');assert.equal((await preparations(ctx)).length,1);}
  finally{await restarted.close();}
 });
});
test('16 fallo de preparación revierte identidad del receptor; respuesta posterior al COMMIT',async()=>{
 await withDelivery(async ctx=>{
  await ctx.pool.query('CREATE FUNCTION '+ctx.name+".fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END; $$;"+
   'CREATE CONSTRAINT TRIGGER fallo AFTER INSERT ON '+ctx.name+'.preparacion DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION '+ctx.name+'.fallo()');
  const target=await receiver(ctx);
  try{
   assert.equal((await call(target.port,'POST','/eventos',{body:envelope(),token})).status,500);
   assert.equal((await preparations(ctx)).length,0);
   assert.equal((await ctx.pool.query('SELECT * FROM '+ctx.name+'.procesado')).rowCount,0);
  }finally{await target.close();}
 });
});
test('17 migración desde 001 con evento e intento conserva datos y actualiza listo',async()=>{
 await withDelivery(async ctx=>{
  const schema='p03_upgrade_'+randomUUID().replaceAll('-','').slice(0,24),name='"'+schema+'"';
  await assertDatabase(ctx.f.pool);await ctx.f.pool.query('CREATE SCHEMA '+name);
  let api:Awaited<ReturnType<typeof startServer>>|undefined;
  try{
   await applyMigrations(ctx.f.pool,schema,[initial]);
   const queue=new PostgresQueue(ctx.f.pool,schema),event=envelope();await queue.registrar(validateEvent(event));
   const reservation=await queue.reservar();assert.ok(reservation);
   const store=new EventStore(ctx.f.pool,schema,DATABASE);await assert.rejects(store.ready());
   api=await startServer({databaseUrl:url,database:DATABASE,schema,port:0,tokens:apiTokens},()=>{});
   assert.equal((await call(api.port,'GET','/listo')).status,503);
   await applyMigrations(ctx.f.pool,schema);await store.ready();
   assert.equal((await call(api.port,'GET','/listo')).status,200);
   assert.deepEqual((await ctx.f.pool.query('SELECT contenido FROM '+name+'.evento')).rows[0].contenido,event);
   const row=(await ctx.f.pool.query('SELECT * FROM '+name+'.intento')).rows[0];
   assert.equal(row.numero,1);assert.equal(row.categoria,null);assert.equal(row.codigo_http,null);
   assert.equal(await queue.finalizar(reservation,{tipo:'entregado'},{categoria:'recibo_aplicado',codigoHttp:200}),true);
   assert.equal((await ctx.f.pool.query('SELECT * FROM '+name+'.migracion')).rowCount,queueMigrations.length);
  }finally{await api?.close();await assertDatabase(ctx.f.pool);await ctx.f.pool.query('DROP SCHEMA '+name+' CASCADE');}
 });
});
test('18 resultado antiguo no altera diagnósticos de reserva posterior',async()=>{
 await withDelivery(async ctx=>{
  await register(ctx);const previous=await ctx.f.queue.reservar();assert.ok(previous);
  await ctx.f.expire();await ctx.f.queue.recuperarVencidas();
  const current=await until(()=>ctx.f.queue.reservar());
  assert.equal(await ctx.f.queue.finalizar(current,{tipo:'entregado'},{categoria:'recibo_aplicado',codigoHttp:200}),true);
  assert.equal(await ctx.f.queue.finalizar(previous,{tipo:'fallido_definitivo'},{categoria:'http_definitivo',codigoHttp:403}),false);
  const rows=(await ctx.f.rows('intento')).sort((a,b)=>a.numero-b.numero);
  assert.equal(rows[0].codigo_http,null);assert.equal(rows[0].categoria,'reserva_vencida');
  assert.equal(rows[1].codigo_http,200);assert.equal(rows[1].categoria,'recibo_aplicado');
 });
});
test('19 configuración rechaza destinos externos, credenciales, rutas y tokens reutilizados',()=>{
 for(const value of ['https://127.0.0.1:3004/eventos','http://localhost:3004/eventos','http://example.com/eventos',
  'http://x:y@127.0.0.1:3004/eventos','http://127.0.0.1:3004/eventos#x','http://127.0.0.1:3004/eventos?x',
  'http://127.0.0.1:3004/otra','http://127.0.0.1:65536/eventos','http://127.0.0.1:3004/eventos\n'])assert.throws(()=>destination(value));
 assert.equal(destination('http://127.0.0.1:3004/eventos'),'http://127.0.0.1:3004/eventos');
 assert.throws(()=>deliveryToken({RECEPCION_TOKEN:token,CONSULTA_TOKEN:'a'.repeat(64),ENTREGA_TOKEN:token}));
});
test('20 apagado ordenado espera intento activo y evita otra reserva',async()=>{
 await withDelivery(async ctx=>{
  const target=await laboratory((res,event)=>{target.later(()=>res.end(JSON.stringify({eventoId:event.eventoId,resultado:'aplicado'})),100);});
  try{
   await register(ctx);await register(ctx);
   const controller=new AbortController();
   const done=runWorker({pool:ctx.f.pool,schema:ctx.f.schema,database:DATABASE,target:target.target,token,policy,pollMs:20},controller.signal);
   await until(async()=>target.count()===1);controller.abort();await done;
   assert.equal(target.count(),1);
   const states=(await ctx.f.rows('entrega')).map(row=>row.estado).sort();
   assert.deepEqual(states,['entregado','pendiente']);
  }finally{await target.close();}
 });
});
test('21 cierre sin esquemas, conexiones ni hijos residuales',async()=>{
 const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});
 try{
  await assertDatabase(pool);
  assert.equal((await pool.query("SELECT 1 FROM pg_namespace WHERE nspname ~ '^p03_(core|rec|upgrade)_[a-f0-9]{24}$'")).rowCount,0);
  assert.equal((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name='p03_delivery_test'")).rowCount,0);
 }finally{await pool.end();}
});
