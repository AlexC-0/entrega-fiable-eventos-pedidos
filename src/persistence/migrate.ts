import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import * as initial from './migrations/001-core.js';
import { schemaName, transaction } from './transaction.js';

// El llamador prepara el esquema. Esta función no crea bases ni inicia servicios.
export async function applyMigrations(pool: Pool, schema: string): Promise<void> {
  const name = schemaName(schema);
  const migrations = [initial];
  await transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['p03-core-migrations:' + schema]);
    await client.query(`CREATE TABLE IF NOT EXISTS ${name}.migracion (
      version integer PRIMARY KEY, sha256 text NOT NULL,
      aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp())`);
    const applied = await client.query<{ version: number; sha256: string }>('SELECT version, sha256 FROM ' + name + '.migracion ORDER BY version');
    if (applied.rows.some(row => !migrations.some(migration => migration.version === row.version))) {
      throw new Error('El esquema contiene una versión de migración desconocida');
    }
    for (const migration of migrations) {
      const hash = createHash('sha256').update(migration.sql).digest('hex');
      const existing = applied.rows.find(row => row.version === migration.version);
      if (existing) {
        if (existing.sha256 !== hash) throw new Error('Una migración aplicada ha cambiado');
        continue;
      }
      await client.query(migration.sql.replaceAll('__SCHEMA__', name));
      await client.query('INSERT INTO ' + name + '.migracion(version,sha256) VALUES ($1,$2)', [migration.version, hash]);
    }
  });
}
