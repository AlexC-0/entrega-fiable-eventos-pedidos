import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import type {ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import express from 'express';
import pg from 'pg';
import {withFixture,requiredUrl,DATABASE,assertDatabase,until} from '../core/support.js';
import type {Fixture} from '../core/support.js';
import {applyMigrations} from '../../src/persistence/migrate.js';
import {receiverMigrations} from '../../src/receiver/migrations.js';
import {ReceiverStore} from '../../src/receiver/store.js';
import {createReceiverApp} from '../../src/receiver/app.js';
import {listen} from '../../src/server/listen.js';
import {cycle} from '../../src/worker/loop.js';
export const token=randomBytes(32).toString('hex');
export const policy={reservaMs:1500,baseReintentoMs:20};
export type Context={f:Fixture;schema:string;name:string;store:ReceiverStore;pool:pg.Pool};
export async function withDelivery(action:(ctx:Context)=>Promise<void>) {
 await withFixture(async f=>{
  const schema='p03_rec_'+randomUUID().replaceAll('-','').slice(0,24),name='"'+schema+'"';
  await assertDatabase(f.pool);await f.pool.query('CREATE SCHEMA '+name);
  const pool=new pg.Pool({connectionString:requiredUrl(),connectionTimeoutMillis:3000,statement_timeout:5000,application_name:'p03_delivery_test'});
  pool.on('error',()=>{});
  try {
   await applyMigrations(f.pool,schema,receiverMigrations);
   const store=new ReceiverStore(pool,schema,DATABASE);await store.ready();
   await action({f,schema,name,store,pool});
  }finally{await pool.end();await assertDatabase(f.pool);await f.pool.query('DROP SCHEMA '+name+' CASCADE');}
 },policy);
}
export async function receiver(ctx:Context,loseFirst=false,port=0) {
 const pool=new pg.Pool({connectionString:requiredUrl(),connectionTimeoutMillis:3000,statement_timeout:5000,application_name:'p03_delivery_test'});
 pool.on('error',()=>{});
 const store=new ReceiverStore(pool,ctx.schema,DATABASE);
 const app=express();let requests=0;const receipts:string[]=[];
 app.use((req,res,next)=>{
  if(req.method==='POST'){
   requests++;
   const original=res.json.bind(res);
   res.json=(body:any)=>{
    if(body.resultado)receipts.push(body.resultado);
    if(loseFirst && requests===1){res.destroy();return res;}
    return original(body);
   };
  }
  next();
 });
 app.use(createReceiverApp(store,token,()=>{}));
 const api=await listen(app,pool,port);
 return {...api,target:'http://127.0.0.1:'+api.port+'/eventos',count:()=>requests,receipts};
}
export async function laboratory(handler:(res:ServerResponse,event:any,index:number)=>void) {
 let count=0;const ids:string[]=[];const timers=new Set<NodeJS.Timeout>();
 const server=createServer((req,res)=>{
  const chunks:Buffer[]=[];
  req.on('data',chunk=>chunks.push(chunk));
  req.on('end',()=>{
   assert.equal(req.headers.authorization,'Bearer '+token);assert.equal(req.headers['content-type'],'application/json');
   const event=JSON.parse(Buffer.concat(chunks).toString('utf8'));ids.push(event.eventoId);
   handler(res,event,++count);
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as AddressInfo).port;
 return {port,target:'http://127.0.0.1:'+port+'/eventos',count:()=>count,ids,
  later:(callback:()=>void,ms:number)=>{const t=setTimeout(()=>{timers.delete(t);callback();},ms);timers.add(t);},
  close:async()=>{for(const t of timers)clearTimeout(t);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
export async function step(ctx:Context,target:string,timeoutMs=5000) {
 return cycle({pool:ctx.f.pool,schema:ctx.f.schema,database:DATABASE,target,token,policy,timeoutMs,log:()=>{}});
}
export async function finish(ctx:Context,target:string) {
 await until(async()=>{await step(ctx,target);return (await ctx.f.rows('entrega'))[0]?.estado==='entregado';});
}
