// Migración versionada: no modificar después de su publicación.
export const version = 1;
export const sql = `
CREATE TABLE __SCHEMA__.evento (
  evento_id uuid PRIMARY KEY,
  pedido_id text NOT NULL UNIQUE CHECK (length(pedido_id) > 0),
  contenido jsonb NOT NULL CHECK (jsonb_typeof(contenido) = 'object'),
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION __SCHEMA__.evento_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El evento es inmutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER evento_inmutable BEFORE UPDATE OR DELETE ON __SCHEMA__.evento
FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.evento_inmutable();

CREATE TABLE __SCHEMA__.entrega (
  evento_id uuid PRIMARY KEY REFERENCES __SCHEMA__.evento(evento_id),
  estado text NOT NULL DEFAULT 'pendiente',
  intentos smallint NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 6),
  proxima_ejecucion timestamptz DEFAULT clock_timestamp(),
  reserva_token uuid UNIQUE,
  reserva_hasta timestamptz,
  actualizada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalizada_en timestamptz,
  CHECK (
    (estado = 'pendiente' AND intentos = 0 AND proxima_ejecucion IS NOT NULL
      AND reserva_token IS NULL AND reserva_hasta IS NULL AND finalizada_en IS NULL)
    OR
    (estado = 'esperando_reintento' AND intentos BETWEEN 1 AND 5 AND proxima_ejecucion IS NOT NULL
      AND reserva_token IS NULL AND reserva_hasta IS NULL AND finalizada_en IS NULL)
    OR
    (estado = 'en_proceso' AND intentos BETWEEN 1 AND 6 AND proxima_ejecucion IS NULL
      AND reserva_token IS NOT NULL AND reserva_hasta IS NOT NULL AND finalizada_en IS NULL
      AND reserva_hasta > actualizada_en)
    OR
    (estado IN ('entregado','fallido_definitivo') AND intentos BETWEEN 1 AND 6
      AND proxima_ejecucion IS NULL AND reserva_token IS NULL AND reserva_hasta IS NULL
      AND finalizada_en IS NOT NULL)
    OR
    (estado = 'agotado' AND intentos = 6 AND proxima_ejecucion IS NULL
      AND reserva_token IS NULL AND reserva_hasta IS NULL AND finalizada_en IS NOT NULL)
  )
);
CREATE INDEX entrega_disponible ON __SCHEMA__.entrega(proxima_ejecucion, evento_id)
WHERE estado IN ('pendiente','esperando_reintento');
CREATE INDEX entrega_vencida ON __SCHEMA__.entrega(reserva_hasta, evento_id)
WHERE estado = 'en_proceso';

CREATE TABLE __SCHEMA__.intento (
  evento_id uuid NOT NULL REFERENCES __SCHEMA__.entrega(evento_id),
  numero smallint NOT NULL CHECK (numero BETWEEN 1 AND 6),
  reserva_token uuid NOT NULL UNIQUE,
  reservado_en timestamptz NOT NULL,
  vence_en timestamptz NOT NULL CHECK (vence_en > reservado_en),
  resultado text NOT NULL DEFAULT 'reservado',
  finalizado_en timestamptz,
  PRIMARY KEY (evento_id, numero),
  CHECK (
    (resultado = 'reservado' AND finalizado_en IS NULL)
    OR
    (resultado IN ('confirmado','reintentable','fallido_definitivo','desconocido')
      AND finalizado_en IS NOT NULL AND finalizado_en >= reservado_en)
  )
);
`;
