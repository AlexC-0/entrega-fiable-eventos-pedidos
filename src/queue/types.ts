export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Evento {
  eventoId: string;
  pedidoId: string;
  contenido: { [key: string]: Json };
}
export interface Reserva extends Evento {
  token: string;
  intento: number;
  venceEn: Date;
}
export type Resultado =
  | { tipo: 'entregado' }
  | { tipo: 'fallido_definitivo' }
  | { tipo: 'reintentar'; fechaMinima?: Date };
export interface Politica {
  reservaMs: number;
  baseReintentoMs: number;
}
export const POLITICA_INICIAL: Readonly<Politica> = Object.freeze({
  reservaMs: 30_000,
  baseReintentoMs: 5_000,
});
export class ConflictoEvento extends Error {
  constructor(readonly motivo: 'identidad_reutilizada' | 'pedido_ya_confirmado') {
    super(motivo);
    this.name = 'ConflictoEvento';
  }
}
