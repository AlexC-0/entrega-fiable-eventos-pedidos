import type { Migration } from '../persistence/catalog.js';
export const receiverMigrations: readonly Migration[] = [{
  version: 1,
  sql: `
CREATE TABLE __SCHEMA__.procesado (
  evento_id uuid PRIMARY KEY,
  pedido_id text NOT NULL UNIQUE,
  contenido jsonb NOT NULL CHECK (jsonb_typeof(contenido)='object'),
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE __SCHEMA__.preparacion (
  evento_id uuid PRIMARY KEY REFERENCES __SCHEMA__.procesado(evento_id),
  pedido_id text NOT NULL UNIQUE,
  creada_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
`
}];
