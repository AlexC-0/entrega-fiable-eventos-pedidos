import type { Evento, Json } from '../queue/types.js';
import { HttpError } from './errors.js';
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function canonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && uuidPattern.test(value);
}
function object(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.exec(value)?.[0] === value;
}
function date(value: unknown): boolean {
  return typeof value === 'string' && value.length === 24
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function invalid(): never { throw new HttpError(422,'contrato_invalido','El evento no cumple el contrato pedido.confirmado v1.'); }
export function validateEvent(value: unknown): Evento {
  if (!object(value,['eventoId','tipo','version','ocurridoEn','datos'])
    || !canonicalUuid(value.eventoId) || value.tipo !== 'pedido.confirmado' || value.version !== 1
    || !date(value.ocurridoEn) || !object(value.datos,['pedidoId','lineas'])
    || !identifier(value.datos.pedidoId) || !Array.isArray(value.datos.lineas)
    || value.datos.lineas.length < 1 || value.datos.lineas.length > 100) invalid();
  const skus = new Set<string>();
  for (const line of value.datos.lineas) {
    if (!object(line,['sku','cantidad']) || !identifier(line.sku)
      || typeof line.cantidad !== 'number' || !Number.isInteger(line.cantidad)
      || line.cantidad < 1 || line.cantidad > 1_000_000 || skus.has(line.sku)) invalid();
    skus.add(line.sku);
  }
  return { eventoId: value.eventoId, pedidoId: value.datos.pedidoId, contenido: value as { [key: string]: Json } };
}
