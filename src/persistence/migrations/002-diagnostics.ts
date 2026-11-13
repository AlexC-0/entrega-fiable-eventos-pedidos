export const version = 2;
export const sql = `
ALTER TABLE __SCHEMA__.intento
  ADD COLUMN codigo_http smallint CHECK (codigo_http BETWEEN 100 AND 599),
  ADD COLUMN categoria text CHECK (categoria IN ('sin_http','recibo_aplicado','recibo_ya_aplicado',
    'timeout','conexion','recibo_invalido','respuesta_excesiva','respuesta_interrumpida',
    'http_reintentable','http_definitivo','redireccion','reserva_vencida')),
  ADD COLUMN retry_after text CHECK (retry_after IN ('ausente','invalido','no_representable','segundos','fecha'));
`;
