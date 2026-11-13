import type { ErrorRequestHandler } from 'express';
import { ConflictoEvento } from '../queue/types.js';
import { PersistenceNotReady } from '../persistence/errors.js';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export type SafeLog = (entry: { evento: string; codigo?: string; estado?: number }) => void;
export const safeLog: SafeLog = entry => console.error(JSON.stringify(entry));

export function unavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && (
    code.startsWith('08') || ['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE',
      'ENETUNREACH','EHOSTUNREACH','57P01','57P02','57P03','53300','53400','55P03','57014'].includes(code)
  ) || ['Connection terminated unexpectedly','Connection terminated due to connection timeout',
    'timeout exceeded when trying to connect'].includes(error.message);
}
export function errorHandler(log: SafeLog): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    let failure: HttpError;
    if (error instanceof HttpError) failure = error;
    else if (error instanceof PersistenceNotReady) failure = new HttpError(503,'persistencia_no_preparada','La persistencia requerida no está preparada.');
    else if (error instanceof ConflictoEvento) failure = new HttpError(409, 'evento_en_conflicto', 'La identidad o el pedido ya están registrados con otro contenido.');
    else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      failure = new HttpError(413, 'cuerpo_demasiado_grande', 'El cuerpo supera 64 KiB.');
    } else if (typeof error === 'object' && error !== null && 'type' in error && ['entity.parse.failed','request.aborted','request.size.invalid'].includes(String(error.type))) {
      failure = new HttpError(400, 'json_invalido', 'El cuerpo debe contener JSON válido.');
    } else if (typeof error === 'object' && error !== null && 'type' in error && ['encoding.unsupported','charset.unsupported'].includes(String(error.type))) {
      failure = new HttpError(415, 'formato_no_admitido', 'Se requiere application/json sin compresión y en UTF-8.');
    } else if (unavailable(error)) failure = new HttpError(503, 'persistencia_no_disponible', 'La persistencia no está disponible temporalmente.');
    else failure = new HttpError(500, 'error_interno', 'No se pudo completar la operación.');
    // Solo categorías constantes: nunca mensajes originales, URLs, cuerpos o cabeceras.
    if (failure.status >= 500) log({ evento: 'error_http', codigo: failure.code, estado: failure.status });
    if (res.headersSent) { res.destroy(); return; }
    if (failure.status === 401) res.set('WWW-Authenticate', 'Bearer realm="eventos"');
    res.status(failure.status).json({ error: { codigo: failure.code, mensaje: failure.message } });
  };
}
