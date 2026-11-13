export const categories = ['sin_http','recibo_aplicado','recibo_ya_aplicado','timeout','conexion',
  'recibo_invalido','respuesta_excesiva','respuesta_interrumpida','http_reintentable',
  'http_definitivo','redireccion','reserva_vencida'] as const;
export const retryCategories = ['ausente','invalido','no_representable','segundos','fecha'] as const;
export interface Diagnostics {
  categoria: typeof categories[number];
  codigoHttp?: number;
  retryAfter?: typeof retryCategories[number];
}
export function validateDiagnostics(value: Diagnostics): void {
  if (!categories.includes(value.categoria) || (value.codigoHttp !== undefined &&
    (!Number.isInteger(value.codigoHttp) || value.codigoHttp < 100 || value.codigoHttp > 599))
    || (value.retryAfter !== undefined && !retryCategories.includes(value.retryAfter))) throw new Error('Diagnóstico inválido');
}
