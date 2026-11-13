// Índice de recorrido por clave: evita ordenar todo evento para cada página.
export const version = 3;
export const sql = `
CREATE INDEX evento_listado ON __SCHEMA__.evento(creado_en, evento_id);
`;
