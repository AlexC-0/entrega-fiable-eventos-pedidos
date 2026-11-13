import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { databaseUrl, deliveryToken, destination } from './config.js';
import { runWorker } from './loop.js';
import { workerReady } from './readiness.js';
import { installShutdown } from '../server/shutdown.js';
export async function main():Promise<void> {
  const token=deliveryToken(process.env),target=destination(process.env.DESTINO_URL ?? '');
  const connectionString=databaseUrl(process.env.WORKER_DATABASE_URL,'entrega_fiable_eventos_pedidos','p03_trabajador');
  const pool=new pg.Pool({connectionString,max:2,connectionTimeoutMillis:3000,statement_timeout:5000,idle_in_transaction_session_timeout:10000,application_name:'p03_trabajador'});
  pool.on('error',()=>console.error('Persistencia del trabajador temporalmente no disponible.'));
  const controller=new AbortController();
  let done:Promise<void>=Promise.resolve();
  const remove=installShutdown(async()=>{controller.abort();await done;});
  try {
    await workerReady(pool,'p03_app','entrega_fiable_eventos_pedidos');
    process.send?.({phase:'ready'});
    done=runWorker({pool,schema:'p03_app',database:'entrega_fiable_eventos_pedidos',target,token},controller.signal)
      .finally(()=>pool.end());
    await done;
  } finally {
    remove();if(!pool.ended)await pool.end();if(process.connected)process.disconnect();
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('No se pudo ejecutar el trabajador. Revise configuración, migraciones y permisos.');process.exitCode=1;});
}
