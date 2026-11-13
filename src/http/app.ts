import express from 'express';
import type { EventStore } from '../persistence/event-store.js';
import { authenticate, validateTokens } from './auth.js';
import type { Tokens } from './auth.js';
import { HttpError, errorHandler, safeLog } from './errors.js';
import type { SafeLog } from './errors.js';
import { canonicalUuid, validateEvent } from './validation.js';

export function createApp(store: EventStore, tokens: Tokens, log: SafeLog = safeLog) {
  validateTokens(tokens);
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('case sensitive routing',true);
  app.set('strict routing',true);
  app.use((_req,res,next) => { res.set('Cache-Control','no-store'); res.set('X-Content-Type-Options','nosniff'); next(); });
  app.get('/salud', (_req,res) => { res.json({ estado: 'vivo' }); });
  app.get('/listo', async (_req,res) => { await store.ready(); res.json({ estado: 'listo' }); });
  app.post('/eventos', authenticate(tokens,'recepcion'), (req,_res,next) => {
    const type = req.get('content-type') ?? '';
    const encoding = (req.get('content-encoding') ?? 'identity').toLowerCase();
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/i.test(type) || encoding !== 'identity') {
      throw new HttpError(415,'formato_no_admitido','Se requiere application/json sin compresión y en UTF-8.');
    }
    next();
  }, express.json({
    limit: 64 * 1024, inflate: false, strict: false, type: () => true,
    verify: (_req,_res,buffer) => {
      try { new TextDecoder('utf-8',{ fatal: true }).decode(buffer); }
      catch { throw new HttpError(415,'formato_no_admitido','Se requiere application/json sin compresión y en UTF-8.'); }
    },
  }), async (req,res) => {
    const event = validateEvent(req.body);
    const result = await store.queue.registrar(event); // Incluye COMMIT; no responder antes.
    const consulta = '/eventos/' + event.eventoId;
    res.location(consulta).status(result === 'creado' ? 202 : 200)
      .json({ eventoId: event.eventoId, resultado: result, consulta });
  });
  app.get('/eventos/:eventoId', authenticate(tokens,'consulta'), async (req,res) => {
    if (!canonicalUuid(req.params.eventoId)) throw new HttpError(422,'identificador_invalido','Se requiere un UUID canónico en minúsculas.');
    const event = await store.get(req.params.eventoId);
    if (!event) throw new HttpError(404,'evento_no_encontrado','El evento no existe.');
    res.json(event);
  });
  app.use((_req,_res,next) => next(new HttpError(404,'ruta_no_encontrada','La ruta no existe.')));
  app.use(errorHandler(log));
  return app;
}
