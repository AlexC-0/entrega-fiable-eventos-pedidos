import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { PostgresQueue } from '../queue/postgres-queue.js';
import { schemaName } from './transaction.js';
import { sql, version } from './migrations/001-core.js';
import { PersistenceNotReady } from './errors.js';

export class EventStore {
  readonly queue: PostgresQueue;
  private readonly name: string;
  constructor(private readonly pool: Pool, schema: string, private readonly database: string) {
    this.name = schemaName(schema);
    this.queue = new PostgresQueue(pool,schema);
  }
  async get(eventId: string) {
    const result = await this.pool.query(`SELECT e.evento_id AS "eventoId", e.pedido_id AS "pedidoId",
      d.estado, d.intentos, e.creado_en AS "creadoEn", d.actualizada_en AS "actualizadoEn",
      d.proxima_ejecucion AS "proximaEjecucion", d.reserva_hasta AS "reservaHasta",
      d.finalizada_en AS "finalizadoEn"
      FROM ${this.name}.evento e JOIN ${this.name}.entrega d USING(evento_id)
      WHERE e.evento_id=$1`,[eventId]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }
  async ready(): Promise<void> {
    const identity = await this.pool.query('SELECT current_database() AS nombre, rolsuper FROM pg_roles WHERE rolname=current_user');
    if (identity.rows[0]?.nombre !== this.database || identity.rows[0]?.rolsuper !== false) {
      throw new PersistenceNotReady();
    }
    try {
      const ledger = await this.pool.query(`SELECT version,sha256 FROM ${this.name}.migracion ORDER BY version`);
      if (ledger.rowCount !== 1 || ledger.rows[0]?.version !== version
        || ledger.rows[0]?.sha256 !== createHash('sha256').update(sql).digest('hex')) {
        throw new PersistenceNotReady();
      }
      await this.pool.query(`SELECT e.evento_id,d.estado,d.intentos FROM ${this.name}.evento e
        JOIN ${this.name}.entrega d USING(evento_id) LIMIT 0`);
      const rights = await this.pool.query(`SELECT
        has_table_privilege(current_user,$1,'INSERT') AND
        has_table_privilege(current_user,$2,'INSERT') AS permitido`,[this.name+'.evento',this.name+'.entrega']);
      if (!rights.rows[0]?.permitido) throw new PersistenceNotReady();
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['42P01','3F000','42501'].includes(String(error.code))) {
        throw new PersistenceNotReady();
      }
      throw error;
    }
  }
}
