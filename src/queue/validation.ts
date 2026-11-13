import type { Evento, Json } from './types.js';

export function uuid(value: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Identidad UUID inválida');
  }
}
function text(value: string) {
  if (/\u0000|\p{Surrogate}/u.test(value)) throw new Error('Texto JSON no representable');
}
export function eventContent(event: Evento): string {
  uuid(event.eventoId);
  if (typeof event.pedidoId !== 'string' || event.pedidoId.length === 0) throw new Error('pedidoId obligatorio');
  text(event.pedidoId);
  const visited = new Set<object>();
  function visit(value: Json): void {
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') { text(value); return; }
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || visited.has(value)) throw new Error('Contenido JSON inválido');
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new Error('Contenido JSON debe usar objetos simples');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) throw new Error('Contenido JSON inválido');
    visited.add(value);
    for (const key of Object.keys(value)) text(key);
    for (const item of Array.isArray(value) ? value : Object.values(value)) visit(item);
    visited.delete(value);
  }
  if (!event.contenido || Array.isArray(event.contenido) || typeof event.contenido !== 'object') {
    throw new Error('contenido debe ser un objeto JSON');
  }
  visit(event.contenido);
  return JSON.stringify(event.contenido);
}
