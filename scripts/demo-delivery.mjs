import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {readConfig} from '../dist/server/config.js';
import {databaseUrl,deliveryToken,RECEIVER_DATABASE} from '../dist/worker/config.js';
const children=[];
async function launch(module){
 const child=fork(new URL('../dist/'+module,import.meta.url),[],{execArgv:['--env-file-if-exists=.env'],stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const exit=once(child,'exit');
 children.push({child,exit});
 let timer;
 try{
  await Promise.race([
   once(child,'message').then(([value])=>{if(value.phase!=='ready')throw new Error('Arranque no confirmado');}),
   exit.then(()=>{throw new Error('Proceso no disponible');}),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Arranque excedido')),8000);}),
  ]);
 }finally{clearTimeout(timer);}
}
async function stop(){
 let failed=false;
 for(const {child,exit} of children.reverse()){
  let timer;
  try{
   if(child.exitCode===null && child.signalCode===null){
    if(child.connected)child.send('shutdown');else child.kill('SIGTERM');
    timer=setTimeout(()=>child.kill('SIGKILL'),25000);
   }
   const [code]=await exit;if(code!==0)failed=true;
  }finally{clearTimeout(timer);}
 }
 if(failed)throw new Error('Cierre de proceso no confirmado');
}
try{
 const config=readConfig(process.env);deliveryToken(process.env);
 let file=new URL('../.local/demo-evento.json',import.meta.url);
 if(process.argv.includes('--nuevo'))file=new URL('../.local/demo-entrega-'+randomUUID()+'.json',import.meta.url);
 if(!existsSync(file))writeFileSync(file,JSON.stringify({eventoId:randomUUID(),tipo:'pedido.confirmado',version:1,ocurridoEn:new Date().toISOString(),
  datos:{pedidoId:'PED-DEMO-'+randomUUID(),lineas:[{sku:'ART-DEMO-001',cantidad:2}]}},null,2)+'\n',{flag:'wx'});
 const event=JSON.parse(readFileSync(file,'utf8'));
 const base='http://127.0.0.1:'+config.port;
 await launch('server/main.js');await launch('receiver/main.js');
 async function accept(){
  const response=await fetch(base+'/eventos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.tokens.recepcion},
   body:JSON.stringify(event),signal:AbortSignal.timeout(5000)});
  if(![200,202].includes(response.status))throw new Error('No aceptado');
  return {http:response.status,...await response.json()};
 }
 const accepted=await accept();
 await launch('worker/main.js');
 let state;const until=Date.now()+20000;
 do{
  const response=await fetch(base+'/eventos/'+event.eventoId,{headers:{Authorization:'Bearer '+config.tokens.consulta},signal:AbortSignal.timeout(5000)});
  if(response.status!==200)throw new Error('Consulta fallida');
  state=await response.json();if(state.estado==='entregado')break;
  await delay(100);
 }while(Date.now()<until);
 if(state.estado!=='entregado')throw new Error('No se confirmó entrega');
 const repeated=await accept();if(repeated.http!==200)throw new Error('Duplicado no reconocido');
 const pool=new pg.Pool({connectionString:databaseUrl(process.env.RECEPTOR_DATABASE_URL,RECEIVER_DATABASE,'p03_receptor'),connectionTimeoutMillis:3000,statement_timeout:5000});
 try{
  const count=(await pool.query('SELECT count(*)::int AS cantidad FROM p03_receptor.preparacion WHERE evento_id=$1',[event.eventoId])).rows[0].cantidad;
  if(count!==1)throw new Error('Preparación no única');
  console.log(JSON.stringify({eventoId:event.eventoId,aceptacion:accepted.http,repeticion:repeated.http,estado:state.estado,intentos:state.intentos,preparaciones:count},null,2));
 }finally{await pool.end();}
}catch{console.error('Demostración no completada. Revise preparación, migraciones y puertos libres; no se borran datos ni se imprimen secretos.');process.exitCode=1;}
finally{try{await stop();console.log('API, receptor y trabajador propios detenidos. PostgreSQL conserva datos.');}catch{console.error('No se confirmó cierre ordenado de todos los hijos propios.');process.exitCode=1;}}
