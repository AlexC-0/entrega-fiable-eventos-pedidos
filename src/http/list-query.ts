import { HttpError } from './errors.js';
import { canonicalUuid } from './validation.js';
import { states } from '../persistence/list-page.js';
import type { Cursor, ListQuery, State } from '../persistence/list-page.js';

function invalid(): never { throw new HttpError(422,'consulta_invalida','Los parámetros de consulta no son válidos.'); }
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(value) || value.startsWith('0000')) return false;
  const millis = value.slice(0,23)+'Z';
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) && date.toISOString() === millis;
}
export function parseListQuery(originalUrl: string): ListQuery {
  const raw = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')+1) : '';
  if (raw.length > 2048) invalid();
  // decodeURIComponent rechaza escapes incompletos y UTF-8 inválido; URLSearchParams los toleraría.
  const values = new Map<string,string>();
  if (raw) for (const part of raw.split('&')) {
    const pair = part.split('=');
    if (pair.length !== 2) invalid();
    let key: string, value: string;
    try { key=decodeURIComponent(pair[0]!.replaceAll('+',' ')); value=decodeURIComponent(pair[1]!.replaceAll('+',' ')); }
    catch { invalid(); }
    if (!['estado','limite','cursor'].includes(key) || values.has(key) || value === '') invalid();
    values.set(key,value);
  }
  const estado = values.get('estado') ?? null;
  if (estado !== null && !states.includes(estado as State)) invalid();
  const limit = values.get('limite') ?? '20';
  if (!/^(?:[1-9][0-9]?|100)$/.test(limit)) invalid();
  let cursor: Cursor | null = null;
  if (values.has('cursor')) {
    const encoded = values.get('cursor')!;
    if (encoded.length > 512 || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid();
    try {
      const bytes=Buffer.from(encoded,'base64url');
      if (bytes.toString('base64url') !== encoded) invalid();
      const parsed: unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid();
      const c=parsed as Record<string,unknown>;
      if (Object.keys(c).sort().join(',') !== 'creadoEn,estado,eventoId,v' || c.v !== 1 ||
          c.estado !== estado || !timestamp(c.creadoEn) || !canonicalUuid(c.eventoId)) invalid();
      cursor = c as unknown as Cursor;
    } catch { invalid(); }
  }
  return { estado: estado as State | null, limite: Number(limit), cursor };
}
