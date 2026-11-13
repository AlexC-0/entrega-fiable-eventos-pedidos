import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withFixture,requiredUrl,assertDatabase,DATABASE,until} from '../core/support.js';
import type {Fixture} from '../core/support.js';
import {withHttp,runtime,call,envelope,tokens} from '../http/support.js';
import {withDelivery,receiver,step,finish} from '../delivery/support.js';
import {validateEvent} from '../../src/http/validation.js';
import {grantApiPermissions} from '../../src/persistence/api-permissions.js';
import {states} from '../../src/persistence/list-page.js';
import {applyMigrations} from '../../src/persistence/migrate.js';
import {queueMigrations} from '../../src/persistence/catalog.js';
import {EventStore} from '../../src/persistence/event-store.js';
import {PostgresQueue} from '../../src/queue/postgres-queue.js';

const url=requiredUrl();
const apiUrl=process.env.TEST_API_DATABASE_URL;
if(!apiUrl)throw new Error('TEST_API_DATABASE_URL obligatoria: no se omiten pruebas.');
let parsed: URL;
try { parsed=new URL(apiUrl); } catch { throw new Error('TEST_API_DATABASE_URL inválida.'); }
if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.pathname!=='/'+DATABASE||parsed.username!=='p03_api_prueba')
 throw new Error('URL del rol API de pruebas incorrecta.');
const preflight=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});
const apiPreflight=new pg.Pool({connectionString:apiUrl,connectionTimeoutMillis:3000});
try{await assertDatabase(preflight);await assertDatabase(apiPreflight);}
catch{throw new Error('PostgreSQL real y roles ordinarios requeridos; no se omiten casos.');}
finally{await preflight.end();await apiPreflight.end();}

async function register(f:Fixture){const event=envelope();await f.queue.registrar(validateEvent(event));return event;}
const history=(port:number,id:string)=>call(port,'GET','/eventos/'+id+'/intentos');
async function snapshot(f:Fixture){return JSON.stringify(await Promise.all(['evento','entrega','intento'].map(t=>f.pool.query('SELECT * FROM '+f.name+'.'+t+' ORDER BY evento_id').then(r=>r.rows))));}
async function insertAt(f:Fixture,id:string,date:string){
 const event={...envelope(),eventoId:id};
 const client=await f.pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('INSERT INTO '+f.name+'.evento(evento_id,pedido_id,contenido,creado_en) VALUES($1,$2,$3,$4::timestamptz)',[id,event.datos.pedidoId,JSON.stringify(event),date]);
  await client.query('INSERT INTO '+f.name+'.entrega(evento_id) VALUES($1)',[id]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
test('01 autenticación previa a validar ambos endpoints y respuestas sin caché',async()=>{
 await withHttp(async(f,api)=>{
  const event=await register(f);
  for(const path of ['/eventos?limite=mal','/eventos/no-uuid/intentos']){
   assert.equal((await call(api.port,'GET',path,{token:null})).status,401);
   assert.equal((await call(api.port,'GET',path,{token:'desconocido'})).status,401);
   assert.equal((await call(api.port,'GET',path,{token:tokens.recepcion})).status,403);
   assert.equal((await call(api.port,'GET',path)).status,422);
  }
  for(const path of ['/eventos','/eventos/'+event.eventoId+'/intentos']){
   const res=await call(api.port,'GET',path);assert.equal(res.status,200);
   assert.equal(res.headers['cache-control'],'no-store');
   assert.ok(!res.raw.includes(tokens.consulta)&&!res.raw.includes(tokens.recepcion));
  }
 });
});
test('02 inexistente, UUID inválido e historial vacío; sin contenido ni datos internos',async()=>{
 await withHttp(async(f,api)=>{
  assert.equal((await history(api.port,randomUUID())).status,404);
  for(const id of ['invalido',randomUUID().toUpperCase()])assert.equal((await history(api.port,id)).status,422);
  const event=await register(f);
  assert.deepEqual((await history(api.port,event.eventoId)).body,{eventoId:event.eventoId,intentos:[]});
  const list=(await call(api.port,'GET','/eventos')).body;
  assert.equal(list.siguienteCursor,null);
  assert.deepEqual(Object.keys(list.items[0]).sort(),['eventoId','pedidoId','estado','intentos','creadoEn','actualizadoEn','proximaEjecucion','reservaHasta','finalizadoEn'].sort());
  assert.equal(list.items[0].reservaHasta,null);assert.equal(list.items[0].finalizadoEn,null);
 });
});
test('03 historial reservado, desconocido, reintentable y confirmado con fechas y null legítimos',async()=>{
 await withHttp(async(f,api)=>{
  const event=await register(f);const first=(await f.queue.reservar())!;
  const reserved=(await history(api.port,event.eventoId)).body.intentos[0];
  assert.equal(reserved.resultado,'reservado');assert.equal(reserved.finalizadoEn,null);
  assert.equal(reserved.codigoHttp,null);assert.equal(reserved.categoria,null);assert.equal(reserved.retryAfter,null);
  await f.expire();await f.queue.recuperarVencidas();await f.ready();
  const second=(await f.queue.reservar())!;
  await f.queue.finalizar(second,{tipo:'reintentar'},{codigoHttp:429,categoria:'http_reintentable',retryAfter:'segundos'});
  await f.ready();const third=(await f.queue.reservar())!;
  await f.queue.finalizar(third,{tipo:'entregado'},{codigoHttp:200,categoria:'recibo_ya_aplicado'});
  const before=await snapshot(f), res=await history(api.port,event.eventoId), attempts=res.body.intentos;
  assert.deepEqual(attempts.map((a:any)=>a.numero),[1,2,3]);
  assert.deepEqual(attempts.map((a:any)=>a.resultado),['desconocido','reintentable','confirmado']);
  assert.deepEqual(attempts.map((a:any)=>a.codigoHttp),[null,429,200]);
  assert.deepEqual(attempts.map((a:any)=>a.categoria),['reserva_vencida','http_reintentable','recibo_ya_aplicado']);
  assert.deepEqual(attempts.map((a:any)=>a.retryAfter),[null,'segundos',null]);
  for(const attempt of attempts){
   assert.deepEqual(Object.keys(attempt).sort(),['numero','iniciadoEn','venceEn','finalizadoEn','resultado','codigoHttp','categoria','retryAfter'].sort());
   assert.ok(Date.parse(attempt.venceEn)>Date.parse(attempt.iniciadoEn));
   assert.ok(Date.parse(attempt.finalizadoEn)>=Date.parse(attempt.iniciadoEn));
  }
  for(const token of [first.token,second.token,third.token])assert.ok(!res.raw.includes(token));
  assert.equal(await snapshot(f),before);
 });
});
test('04 historia HTTP de respuesta perdida: dos intentos, una preparación y entregado',async()=>{
 await withDelivery(async ctx=>{
  const api=await runtime(ctx.f),target=await receiver(ctx,true);
  try{
   const event=await register(ctx.f);
   await step(ctx,target.target);await finish(ctx,target.target);
   const res=await history(api.port,event.eventoId);assert.equal(res.status,200);
   assert.deepEqual(res.body.intentos.map((a:any)=>[a.numero,a.resultado,a.codigoHttp,a.categoria]),[
    [1,'reintentable',null,'conexion'],[2,'confirmado',200,'recibo_ya_aplicado']]);
   assert.equal(target.count(),2);
   assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM '+ctx.name+'.preparacion')).rows[0].n,1);
   assert.equal((await call(api.port,'GET','/eventos/'+event.eventoId)).body.estado,'entregado');
  }finally{await api.close();await target.close();}
 });
});
test('05 filtros de todos los estados, agotamiento y fallo definitivo; lecturas sin mutación',async()=>{
 await withHttp(async(f,api)=>{
  const ids=new Map<string,string>();
  for(const state of ['entregado','fallido_definitivo','agotado','esperando_reintento','en_proceso','pendiente']){
   const event=await register(f);ids.set(state,event.eventoId);
   if(state==='pendiente')continue;
   const reservation=(await f.queue.reservar())!;assert.equal(reservation.eventoId,event.eventoId);
   if(state==='en_proceso')continue;
   if(state==='entregado'||state==='fallido_definitivo')
    await f.queue.finalizar(reservation,{tipo:state},{codigoHttp:state==='entregado'?200:401,categoria:state==='entregado'?'recibo_aplicado':'http_definitivo'});
   else if(state==='agotado'){
    await f.queue.finalizar(reservation,{tipo:'reintentar'},{codigoHttp:503,categoria:'http_reintentable'});
    for(let n=2;n<=6;n++){
     await f.ready();const r=(await f.queue.reservar())!;
     await f.queue.finalizar(r,{tipo:'reintentar'},{codigoHttp:503,categoria:'http_reintentable'});
    }
   }else await f.queue.finalizar(reservation,{tipo:'reintentar',fechaMinima:new Date('2099-01-01T00:00:00Z')},{codigoHttp:503,categoria:'http_reintentable'});
  }
  // Una reserva vencida sigue visible hasta que un trabajador la recupere; GET no lo hace.
  await f.expire();const before=await snapshot(f);
  for(const state of states){
   const res=await call(api.port,'GET','/eventos?estado='+state);assert.equal(res.status,200);
   assert.equal(res.body.items.length,1);assert.equal(res.body.items[0].eventoId,ids.get(state));
   assert.equal(res.body.items[0].estado,state);assert.equal(res.body.siguienteCursor,null);
   assert.equal((await history(api.port,ids.get(state)!)).status,200);
  }
  const exhausted=(await history(api.port,ids.get('agotado')!)).body.intentos;
  assert.equal(exhausted.length,6);assert.ok(exhausted.every((a:any)=>a.resultado==='reintentable'&&a.codigoHttp===503));
  assert.equal((await history(api.port,ids.get('fallido_definitivo')!)).body.intentos[0].resultado,'fallido_definitivo');
  assert.equal(await snapshot(f),before);
 });
});
test('06 límites y consultas/cursors mal formados devuelven 422 seguro',async()=>{
 await withHttp(async(_f,api)=>{
  const invalid=['estado=otro','estado=','limite=0','limite=101','limite=-1','limite=1.0','limite=01','limite=1e1','limite=+1',
   'limite=','limite=1&limite=2','estado=pendiente&estado=pendiente','cursor=a&cursor=b','limite=1&%6cimite=2',
   'limite[]=1','extra=1','limite','limite=1&','limite=1=2','estado=%','estado=%FF','cursor=','cursor='+ 'a'.repeat(513),'cursor=abc','cursor=***'];
  const valid={v:1,estado:null,creadoEn:'2026-11-13T00:00:00.000001Z',eventoId:randomUUID()};
  for(const c of [null,[],{...valid,v:2},{...valid,extra:1},{...valid,creadoEn:'2026-02-30T00:00:00.000001Z'},
   {...valid,creadoEn:"2026-01-01';DROP TABLE evento;--"},{...valid,creadoEn:'2026-11-13T00:00:00.000Z'},{...valid,eventoId:'bad'}])
   invalid.push('cursor='+Buffer.from(JSON.stringify(c)).toString('base64url'));
  for(const query of invalid){
   const res=await call(api.port,'GET','/eventos?'+query);assert.equal(res.status,422,query);
   assert.equal(res.body.error.codigo,'consulta_invalida');assert.equal(res.body.error.mensaje,'Los parámetros de consulta no son válidos.');
  }
  for(const limit of ['1','20','100']){
   const res=await call(api.port,'GET','/eventos?limite='+limit);
   assert.equal(res.status,200);assert.deepEqual(res.body,{items:[],siguienteCursor:null});
  }
 });
});
test('07 páginas estables, empates y microsegundos sin omisiones ni duplicados',async()=>{
 await withHttp(async(f,api)=>{
  const ids=Array.from({length:23},(_,i)=>'00000000-0000-0000-0000-'+(i+1).toString().padStart(12,'0'));
  // Inserción en orden inverso, todos dentro del mismo milisegundo.
  for(let i=22;i>=0;i--)await insertAt(f,ids[i]!,'2026-11-13T00:00:00.'+(i<10?'000001':i<20?'000002':'000999')+'Z');
  assert.equal((await call(api.port,'GET','/eventos')).body.items.length,20);
  assert.equal((await call(api.port,'GET','/eventos?limite=100')).body.items.length,23);
  for(const limit of [1,7,20]){
   const seen:string[]=[];let cursor:string|null=null;
   do{
    const res=await call(api.port,'GET','/eventos?limite='+limit+(cursor?'&cursor='+cursor:''));
    assert.equal(res.status,200);seen.push(...res.body.items.map((r:any)=>r.eventoId));cursor=res.body.siguienteCursor;
    if(cursor){assert.ok(cursor.length<=512);const c=JSON.parse(Buffer.from(cursor,'base64url').toString());assert.match(c.creadoEn,/\.\d{6}Z$/);}
    assert.ok(seen.length<=ids.length);
   }while(cursor);
   assert.deepEqual(seen,ids);
  }
  const filtered=await call(api.port,'GET','/eventos?estado=pendiente&limite=1');
  const cursor=filtered.body.siguienteCursor;
  for(const suffix of ['', '&estado=entregado'])assert.equal((await call(api.port,'GET','/eventos?cursor='+cursor+suffix)).status,422);
  assert.equal((await call(api.port,'GET','/eventos?estado=pendiente&limite=2&cursor='+cursor)).status,200);
  const plain=(await call(api.port,'GET','/eventos?limite=1')).body.siguienteCursor;
  assert.equal((await call(api.port,'GET','/eventos?estado=pendiente&cursor='+plain)).status,422);
 });
});
test('08 inserción y cambios de estado entre páginas: vista actual, sin snapshot global',async()=>{
 await withHttp(async(f,api)=>{
  const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',c='00000000-0000-0000-0000-000000000003';
  await insertAt(f,a,'2026-11-13T00:00:00.000001Z');await insertAt(f,b,'2026-11-13T00:00:00.000002Z');
  const first=(await call(api.port,'GET','/eventos?estado=pendiente&limite=1')).body;assert.equal(first.items[0].eventoId,a);
  const ra=(await f.queue.reservar())!;await f.queue.finalizar(ra,{tipo:'entregado'});
  const rb=(await f.queue.reservar())!;await f.queue.finalizar(rb,{tipo:'entregado'});
  await insertAt(f,c,'2026-11-13T00:00:00.000003Z');
  const next=(await call(api.port,'GET','/eventos?estado=pendiente&cursor='+first.siguienteCursor)).body;
  assert.deepEqual(next.items.map((r:any)=>r.eventoId),[c]);assert.equal(next.siguienteCursor,null);
  // COMMIT tardío con clave anterior al cursor: solo una nueva consulta desde el inicio lo localiza.
  const late=randomUUID();await insertAt(f,late,'2026-11-12T23:59:59.999999Z');
  const resumed=(await call(api.port,'GET','/eventos?estado=pendiente&cursor='+first.siguienteCursor)).body;
  assert.deepEqual(resumed.items.map((r:any)=>r.eventoId),[c]);
  assert.deepEqual((await call(api.port,'GET','/eventos?estado=pendiente')).body.items.map((r:any)=>r.eventoId),[late,c]);
 });
});
test('09 permisos reales API: solo lectura adicional; listo detecta falta de SELECT intento',async()=>{
 await withFixture(async f=>{
  await grantApiPermissions(f.pool,f.schema,'p03_api_prueba');
  const api=await runtime(f,()=>{},apiUrl);
  const restricted=new pg.Pool({connectionString:apiUrl,connectionTimeoutMillis:3000});
  try{
   await assertDatabase(restricted);
   const rights=(await restricted.query("SELECT rolsuper,rolcreatedb,rolcreaterole,has_database_privilege(current_user,current_database(),'CREATE') AS db,has_schema_privilege(current_user,$1,'CREATE') AS schema FROM pg_roles WHERE rolname=current_user",[f.schema])).rows[0];
   assert.deepEqual(Object.values(rights),[false,false,false,false,false]);
   assert.equal((await call(api.port,'GET','/listo')).status,200);
   const e=envelope();assert.equal((await call(api.port,'POST','/eventos',{body:e})).status,202);
   assert.equal((await call(api.port,'GET','/eventos')).body.items[0].eventoId,e.eventoId);
   assert.deepEqual((await history(api.port,e.eventoId)).body.intentos,[]);
   for(const [table,privileges] of [['evento',['UPDATE','DELETE']],['entrega',['UPDATE','DELETE']],['intento',['INSERT','UPDATE','DELETE']]] as const)
    for(const privilege of privileges)assert.equal((await restricted.query('SELECT has_table_privilege(current_user,$1,$2) AS ok',[f.schema+'.'+table,privilege])).rows[0].ok,false);
   const before=await snapshot(f);
   await assert.rejects(restricted.query('UPDATE '+f.name+".entrega SET intentos=intentos"),(e:any)=>e.code==='42501');
   await assert.rejects(restricted.query('CREATE TABLE '+f.name+'.prohibida(id int)'),(e:any)=>e.code==='42501');
   assert.equal(await snapshot(f),before);
   await f.pool.query('REVOKE SELECT ON '+f.name+'.intento FROM p03_api_prueba');
   assert.equal((await call(api.port,'GET','/listo')).status,503);
   assert.equal((await history(api.port,e.eventoId)).status,500);
   await grantApiPermissions(f.pool,f.schema,'p03_api_prueba');
   assert.equal((await call(api.port,'GET','/listo')).status,200);
   assert.equal((await history(api.port,e.eventoId)).status,200);
  }finally{await api.close();await restricted.end();}
 });
});
test('10 actualización de 002 a 003 conserva datos y diagnósticos previos null',async()=>{
 const schema='p03_ops_'+randomUUID().replaceAll('-','').slice(0,24), name='"'+schema+'"';
 const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});let created=false;
 try{
  await assertDatabase(pool);await pool.query('CREATE SCHEMA '+name);created=true;
  await applyMigrations(pool,schema,queueMigrations.slice(0,2));
  const queue=new PostgresQueue(pool,schema),event=envelope();await queue.registrar(validateEvent(event));
  const reservation=(await queue.reservar())!;
  await queue.finalizar(reservation,{tipo:'entregado'});
  // Fixture de datos históricos anteriores a los diagnósticos.
  await pool.query('UPDATE '+name+'.intento SET categoria=NULL,codigo_http=NULL,retry_after=NULL');
  const store=new EventStore(pool,schema,DATABASE);
  await assert.rejects(store.ready());
  const before=(await pool.query('SELECT * FROM '+name+'.intento')).rows;
  await applyMigrations(pool,schema);await applyMigrations(pool,schema);
  await store.ready();
  assert.deepEqual((await pool.query('SELECT * FROM '+name+'.intento')).rows,before);
  assert.equal((await pool.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND indexname=$2',[schema,'evento_listado'])).rowCount,1);
  assert.equal((await store.history(event.eventoId))!.intentos[0]!.categoria,null);
 }finally{
  await pool.end();
  if(created){const clean=new pg.Pool({connectionString:url});try{await assertDatabase(clean);await clean.query('DROP SCHEMA '+name+' CASCADE');}finally{await clean.end();}}
 }
});
test('11 cierre sin esquemas ni conexiones de consulta residuales',async()=>{
 const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:3000});
 try{
  await assertDatabase(pool);
  assert.equal((await pool.query("SELECT nspname FROM pg_namespace WHERE nspname ~ '^p03_(core|rec|ops)_[a-f0-9]{24}$'")).rowCount,0);
  await until(async()=>(await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND (application_name='p03_api' OR usename='p03_api_prueba')")).rowCount===0);
 }finally{await pool.end();}
});
