import { request } from 'node:http';
import type { Reserva, Resultado } from '../queue/types.js';
import type { Diagnostics } from '../queue/diagnostics.js';
import type { Pool } from 'pg';
import { destination } from './config.js';
import { retryAfter } from './retry-after.js';

export interface Observation {
  status?:number; retryAfter?:string; body?:string;
  fault?:'timeout'|'conexion'|'respuesta_excesiva'|'respuesta_interrumpida'|'recibo_invalido';
}
export function send(reservation:Reserva,target:string,token:string,timeoutMs=5000):Promise<Observation> {
  destination(target);
  const payload=JSON.stringify(reservation.contenido);
  return new Promise(resolve=>{
    let settled=false, status:number|undefined, retry:string|undefined;
    let response:import('node:http').IncomingMessage|undefined;
    const finish=(value:Observation)=>{
      if(settled) return; settled=true; clearTimeout(timer);
      response?.destroy(); req.destroy();
      resolve({...value,...(status===undefined?{}:{status}),...(retry===undefined?{}:{retryAfter:retry})});
    };
    const req=request(target,{method:'POST',agent:false,headers:{
      'Content-Type':'application/json',Authorization:'Bearer '+token,'Content-Length':Buffer.byteLength(payload),
      'Accept-Encoding':'identity',
    }},res=>{
      response=res; status=res.statusCode;
      retry=typeof res.headers['retry-after']==='string'?res.headers['retry-after']:undefined;
      const chunks:Buffer[]=[]; let size=0;
      res.on('data',(chunk:Buffer)=>{
        size+=chunk.length;
        if(size>8192) { finish({fault:'respuesta_excesiva'}); return; }
        chunks.push(chunk);
      });
      res.on('error',()=>finish({fault:'respuesta_interrumpida'}));
      res.on('aborted',()=>finish({fault:'respuesta_interrumpida'}));
      res.on('end',()=>{
        if(!res.complete) { finish({fault:'respuesta_interrumpida'}); return; }
        try { finish({body:new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))}); }
        catch { finish({fault:'recibo_invalido'}); }
      });
    });
    const timer=setTimeout(()=>finish({fault:'timeout'}),timeoutMs);
    req.on('error',()=>finish({fault:status===undefined?'conexion':'respuesta_interrumpida'}));
    req.end(payload); // Una sola petición; node:http no sigue redirecciones ni reintenta.
  });
}
export async function classify(pool:Pool,reservation:Reserva,response:Observation):Promise<{result:Resultado;diagnostic:Diagnostics}> {
  const status=response.status;
  const diagnostic:Diagnostics={categoria:'http_reintentable',...(status===undefined?{}:{codigoHttp:status})};
  if(status!==undefined && status>=300 && status<400) return {result:{tipo:'fallido_definitivo'},diagnostic:{...diagnostic,categoria:'redireccion'}};
  if(status!==undefined && status>=400 && status<500 && status!==408 && status!==429) return {result:{tipo:'fallido_definitivo'},diagnostic:{...diagnostic,categoria:'http_definitivo'}};
  if(status===429) {
    const minimum=await retryAfter(pool,response.retryAfter);
    return {result:{tipo:'reintentar',...(minimum.fechaMinima?{fechaMinima:minimum.fechaMinima}:{})},
      diagnostic:{...diagnostic,retryAfter:minimum.categoria}};
  }
  if(response.fault) return {result:{tipo:'reintentar'},diagnostic:{...diagnostic,categoria:response.fault}};
  if(status===200) {
    let receipt:unknown;
    try { receipt=JSON.parse(response.body ?? ''); } catch { /* Sin recibo acreditado. */ }
    if(typeof receipt==='object' && receipt!==null && !Array.isArray(receipt)
      && Object.keys(receipt).length===2 && 'eventoId' in receipt && 'resultado' in receipt
      && receipt.eventoId===reservation.eventoId && (receipt.resultado==='aplicado' || receipt.resultado==='ya_aplicado')) {
      return {result:{tipo:'entregado'},diagnostic:{...diagnostic,categoria:receipt.resultado==='aplicado'?'recibo_aplicado':'recibo_ya_aplicado'}};
    }
  }
  return {result:{tipo:'reintentar'},diagnostic:{...diagnostic,categoria:status!==undefined && status>=200 && status<300?'recibo_invalido':'http_reintentable'}};
}
