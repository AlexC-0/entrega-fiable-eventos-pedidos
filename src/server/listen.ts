import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import type { Pool } from 'pg';
export async function listen(app:Express,pool:Pool,port:number) {
  const server=createServer(app);
  server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once('error',reject);
      server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});
    });
  } catch(error) {await pool.end();throw error;}
  let closing:Promise<void>|undefined;
  const close=()=>closing??=(async()=>{
    const timer=setTimeout(()=>server.closeAllConnections(),6000);timer.unref();
    try {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    finally {clearTimeout(timer);await pool.end();}
  })();
  return {server,pool,port:(server.address() as AddressInfo).port,close};
}
