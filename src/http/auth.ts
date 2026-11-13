import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

export interface Tokens { recepcion: string; consulta: string }
const tokenSyntax = /^[A-Za-z0-9._~+\/-]{32,256}={0,2}$/;
export function validateTokens(tokens: Tokens): void {
  if (![tokens.recepcion,tokens.consulta].every(value => typeof value === 'string' && tokenSyntax.exec(value)?.[0] === value)
    || tokens.recepcion === tokens.consulta) throw new Error('Credenciales ausentes, inválidas o iguales.');
}
function hash(value: string) { return createHash('sha256').update(value).digest(); }
export function authenticate(tokens: Tokens, permission: keyof Tokens): RequestHandler {
  validateTokens(tokens);
  const reception = hash(tokens.recepcion), query = hash(tokens.consulta);
  return (req, _res, next) => {
    const count = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i]?.toLowerCase() === 'authorization').length;
    const match = /^Bearer ([A-Za-z0-9._~+\/-]+={0,2})$/i.exec(req.get('authorization') ?? '');
    const candidate = hash(count === 1 && match ? match[1]! : '');
    const isReception = timingSafeEqual(candidate,reception), isQuery = timingSafeEqual(candidate,query);
    if (!isReception && !isQuery) return next(new HttpError(401,'no_autenticado','Se requiere una credencial válida.'));
    if ((permission === 'recepcion' && !isReception) || (permission === 'consulta' && !isQuery)) {
      return next(new HttpError(403,'sin_permiso','La credencial no permite esta operación.'));
    }
    next();
  };
}
