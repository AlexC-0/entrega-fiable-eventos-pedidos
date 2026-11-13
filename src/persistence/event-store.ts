import type { Pool } from 'pg';
import { PostgresQueue } from '../queue/postgres-queue.js';
import { schemaName } from './transaction.js';
import { verifyMigrations } from './migrate.js';
import { PersistenceNotReady } from './errors.js';
import { encodeCursor } from './list-page.js';
import type { ListQuery } from './list-page.js';

export class EventStore {
  readonly queue: PostgresQueue;
  private readonly name: string;
  constructor(private readonly pool: Pool, private readonly schema: string, private readonly database: string) {
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
  async history(eventId: string) {
    // Una sentencia distingue inexistente de historial vacío sin una carrera entre consultas.
    const result = await this.pool.query(`SELECT e.evento_id AS "eventoId",
      i.numero, i.reservado_en AS "iniciadoEn", i.vence_en AS "venceEn",
      i.finalizado_en AS "finalizadoEn", i.resultado, i.codigo_http AS "codigoHttp",
      i.categoria, i.retry_after AS "retryAfter"
      FROM ${this.name}.evento e LEFT JOIN ${this.name}.intento i USING(evento_id)
      WHERE e.evento_id=$1 ORDER BY i.numero ASC`,[eventId]);
    if (!result.rowCount) return undefined;
    return { eventoId: eventId, intentos: result.rows.filter(r=>r.numero !== null)
      .map(({eventoId: _id,...attempt})=>attempt) };
  }
  async list(query: ListQuery) {
    const values: unknown[]=[];
    const where: string[]=[];
    if (query.estado !== null) { values.push(query.estado); where.push('d.estado=$'+values.length); }
    if (query.cursor) {
      values.push(query.cursor.creadoEn,query.cursor.eventoId);
      where.push('(e.creado_en,e.evento_id)>($'+(values.length-1)+'::timestamptz,$'+values.length+'::uuid)');
    }
    values.push(query.limite+1);
    const result = await this.pool.query(`SELECT e.evento_id AS "eventoId", e.pedido_id AS "pedidoId",
      d.estado, d.intentos,
      to_char(e.creado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "creadoEn",
      d.actualizada_en AS "actualizadoEn", d.proxima_ejecucion AS "proximaEjecucion",
      d.reserva_hasta AS "reservaHasta", d.finalizada_en AS "finalizadoEn"
      FROM ${this.name}.evento e JOIN ${this.name}.entrega d USING(evento_id)
      ${where.length ? 'WHERE '+where.join(' AND ') : ''}
      ORDER BY e.creado_en ASC,e.evento_id ASC LIMIT $${values.length}`,values);
    const items=result.rows.slice(0,query.limite);
    const last=items.at(-1);
    const siguienteCursor=result.rows.length > query.limite && last
      ? encodeCursor({v:1,estado:query.estado,creadoEn:last.creadoEn,eventoId:last.eventoId}) : null;
    return {items,siguienteCursor};
  }
  async ready(): Promise<void> {
    const identity = await this.pool.query('SELECT current_database() AS nombre, rolsuper FROM pg_roles WHERE rolname=current_user');
    if (identity.rows[0]?.nombre !== this.database || identity.rows[0]?.rolsuper !== false) throw new PersistenceNotReady();
    try {
      await verifyMigrations(this.pool,this.schema);
      await this.pool.query(`SELECT e.evento_id,d.estado,d.intentos FROM ${this.name}.evento e
        JOIN ${this.name}.entrega d USING(evento_id) LIMIT 0`);
      await this.pool.query(`SELECT numero,reservado_en,vence_en,finalizado_en,resultado,codigo_http,categoria,retry_after FROM ${this.name}.intento LIMIT 0`);
      const rights = await this.pool.query(`SELECT
        has_table_privilege(current_user,$1,'INSERT') AND
        has_table_privilege(current_user,$2,'INSERT') AS permitido`,[this.name+'.evento',this.name+'.entrega']);
      if (!rights.rows[0]?.permitido) throw new PersistenceNotReady();
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['42P01','3F000','42501'].includes(String(error.code))) throw new PersistenceNotReady();
      throw error;
    }
  }
}
