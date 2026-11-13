export const states = ['pendiente','en_proceso','esperando_reintento','entregado','fallido_definitivo','agotado'] as const;
export type State = typeof states[number];
export interface Cursor { v: 1; estado: State | null; creadoEn: string; eventoId: string }
export interface ListQuery { estado: State | null; limite: number; cursor: Cursor | null }
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor),'utf8').toString('base64url');
}
