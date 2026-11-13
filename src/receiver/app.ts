import express from 'express';
import { createHash,timingSafeEqual } from 'node:crypto';
import type { ReceiverStore } from './store.js';
import { eventBody } from '../http/body.js';
import { validateEvent } from '../http/validation.js';
import { errorHandler,HttpError,safeLog } from '../http/errors.js';
import type { SafeLog } from '../http/errors.js';

export function createReceiverApp(store:ReceiverStore,token:string,log:SafeLog=safeLog) {
  if(!/^[A-Za-z0-9._~+\/-]{32,256}={0,2}$/.exec(token)?.[0] || token.trim()!==token) throw new Error('Token receptor inválido');
  const expected=createHash('sha256').update(token).digest();
  const app=express();
  app.disable('x-powered-by');app.disable('etag');app.set('strict routing',true);app.set('case sensitive routing',true);
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
  app.get('/salud',(_req,res)=>{res.json({estado:'vivo'});});
  app.post('/eventos',(req,_res,next)=>{
    const count=req.rawHeaders.filter((value,i)=>i%2===0 && value.toLowerCase()==='authorization').length;
    const match=/^Bearer ([A-Za-z0-9._~+\/-]+={0,2})$/i.exec(req.get('authorization')??'');
    const actual=createHash('sha256').update(count===1 && match?match[1]!:'').digest();
    if(!timingSafeEqual(expected,actual)) throw new HttpError(401,'no_autenticado','Se requiere una credencial válida.');
    next();
  },...eventBody,async(req,res)=>{
    const event=validateEvent(req.body);
    const resultado=await store.apply(event);
    res.status(200).json({eventoId:event.eventoId,resultado});
  });
  app.use((_req,_res,next)=>next(new HttpError(404,'ruta_no_encontrada','La ruta no existe.')));
  app.use(errorHandler(log));
  return app;
}
