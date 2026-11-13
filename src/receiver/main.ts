import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseUrl,deliveryToken,receiverPort,RECEIVER_DATABASE } from '../worker/config.js';
import { ReceiverStore } from './store.js';
import { createReceiverApp } from './app.js';
import { installShutdown } from '../server/shutdown.js';
import { listen } from '../server/listen.js';
export async function main():Promise<void> {
  const token=deliveryToken(process.env);
  const port=receiverPort(process.env);
  const connectionString=databaseUrl(process.env.RECEPTOR_DATABASE_URL,RECEIVER_DATABASE,'p03_receptor');
  const pool=new pg.Pool({connectionString,max:4,connectionTimeoutMillis:3000,statement_timeout:5000,idle_in_transaction_session_timeout:10000,application_name:'p03_receptor'});
  pool.on('error',()=>console.error('Persistencia del receptor temporalmente no disponible.'));
  const store=new ReceiverStore(pool,'p03_receptor',RECEIVER_DATABASE);
  try {await store.ready();} catch(error) {await pool.end();throw error;}
  const runtime=await listen(createReceiverApp(store,token),pool,port);
  console.log('Receptor local disponible en 127.0.0.1:'+port);
  installShutdown(runtime.close);
  process.send?.({phase:'ready'});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('No se pudo iniciar el receptor. Revise configuración, migraciones y permisos.');process.exitCode=1;});
}
