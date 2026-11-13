import express from 'express';
import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';
const format: RequestHandler = (req,_res,next) => {
  const type = req.get('content-type') ?? '';
  const encoding = (req.get('content-encoding') ?? 'identity').toLowerCase();
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/i.test(type) || encoding !== 'identity') {
    throw new HttpError(415,'formato_no_admitido','Se requiere application/json sin compresión y en UTF-8.');
  }
  next();
};
export const eventBody: RequestHandler[] = [format, express.json({
  limit:64*1024, inflate:false, strict:false, type:()=>true,
  verify:(_req,_res,buffer)=>{
    try { new TextDecoder('utf-8',{fatal:true}).decode(buffer); }
    catch { throw new HttpError(415,'formato_no_admitido','Se requiere application/json sin compresión y en UTF-8.'); }
  },
})];
