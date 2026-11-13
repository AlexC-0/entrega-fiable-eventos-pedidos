import type { Pool } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresQueue } from '../queue/postgres-queue.js';
import type { Politica, Reserva } from '../queue/types.js';
import { send, classify } from './send.js';
import { workerReady } from './readiness.js';
import type { SafeLog } from '../http/errors.js';
import { safeLog } from '../http/errors.js';
export interface WorkerOptions {
  pool:Pool; schema:string; database:string; target:string; token:string;
  policy?:Politica; timeoutMs?:number; pollMs?:number; log?:SafeLog;
  // Solo inyección interna de fixtures; nunca endpoints ni opciones del CLI.
  hooks?:{afterReserve?:(reservation:Reserva)=>Promise<void>; beforeFinalize?:(reservation:Reserva)=>Promise<void>};
}
export async function cycle(options:WorkerOptions,signal?:AbortSignal):Promise<boolean> {
  const queue=new PostgresQueue(options.pool,options.schema,options.policy);
  await queue.recuperarVencidas();
  if(signal?.aborted) return false;
  const reservation=await queue.reservar();
  if(!reservation) return false;
  await options.hooks?.afterReserve?.(reservation);
  if(signal?.aborted) return false; // Una reserva ya confirmada se recuperará por vencimiento.
  const observation=await send(reservation,options.target,options.token,options.timeoutMs);
  const classified=await classify(options.pool,reservation,observation);
  await options.hooks?.beforeFinalize?.(reservation);
  const updated=await queue.finalizar(reservation,classified.result,classified.diagnostic);
  if(!updated) (options.log??safeLog)({evento:'resultado_antiguo_rechazado'});
  return true;
}
export async function runWorker(options:WorkerOptions,signal:AbortSignal):Promise<void> {
  await workerReady(options.pool,options.schema,options.database);
  while(!signal.aborted) {
    let worked=false;
    try { worked=await cycle(options,signal); }
    catch { (options.log??safeLog)({evento:'intento_incierto_por_persistencia'}); }
    if(!worked && !signal.aborted) {
      try { await delay(options.pollMs??500,undefined,{signal}); }
      catch { if(!signal.aborted) throw new Error('Espera de trabajador fallida'); }
    }
  }
}
