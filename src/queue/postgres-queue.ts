import type { Pool, PoolClient } from 'pg';
import { schemaName, transaction } from '../persistence/transaction.js';
import { ConflictoEvento, POLITICA_INICIAL } from './types.js';
import type { Evento, Politica, Reserva, Resultado } from './types.js';
import { validateDiagnostics } from './diagnostics.js';
import type { Diagnostics } from './diagnostics.js';
import { eventContent, uuid } from './validation.js';

type ReservationRow = {
  evento_id: string; pedido_id: string; contenido: Evento['contenido'];
  reserva_token: string; intentos: number; reserva_hasta: Date;
};

// Primitivas persistentes. No contiene bucles, HTTP, purga ni pg-boss.
export class PostgresQueue {
  private readonly name: string;
  private readonly policy: Readonly<Politica>;
  constructor(private readonly pool: Pool, schema: string, policy: Readonly<Politica> = POLITICA_INICIAL) {
    this.name = schemaName(schema);
    for (const value of [policy.reservaMs, policy.baseReintentoMs]) {
      if (!Number.isSafeInteger(value) || value < 1 || value > 86_400_000) throw new Error('Política temporal inválida');
    }
    this.policy = Object.freeze({ ...policy });
  }

  async registrar(event: Evento): Promise<'creado' | 'duplicado'> {
    const content = eventContent(event);
    // Captura los valores antes del primer await; el llamador no puede mutarlos a mitad.
    const { eventoId, pedidoId } = event;
    return transaction(this.pool, async client => {
      const inserted = await client.query(
        `INSERT INTO ${this.name}.evento(evento_id,pedido_id,contenido)
         VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING evento_id`,
        [eventoId, pedidoId, content]);
      if (!inserted.rowCount) {
        const existing = await client.query<{ equivalente: boolean }>(
          `SELECT pedido_id=$2 AND contenido=$3::jsonb AS equivalente FROM ${this.name}.evento WHERE evento_id=$1`,
          [eventoId, pedidoId, content]);
        if (existing.rows[0]?.equivalente) return 'duplicado';
        throw new ConflictoEvento(existing.rowCount ? 'identidad_reutilizada' : 'pedido_ya_confirmado');
      }
      await client.query(`INSERT INTO ${this.name}.entrega(evento_id) VALUES ($1)`, [eventoId]);
      return 'creado';
    });
  }

  async reservar(): Promise<Reserva | undefined> {
    return transaction(this.pool, async client => {
      const selected = await client.query<{ evento_id: string }>(
        `SELECT evento_id FROM ${this.name}.entrega
         WHERE estado IN ('pendiente','esperando_reintento') AND intentos < 6
           AND proxima_ejecucion <= clock_timestamp()
         ORDER BY proxima_ejecucion, evento_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const id = selected.rows[0]?.evento_id;
      if (!id) return undefined;
      await client.query(
        `WITH momento AS MATERIALIZED (SELECT clock_timestamp() AS ahora)
         UPDATE ${this.name}.entrega SET estado='en_proceso', intentos=intentos+1,
           reserva_token=gen_random_uuid(), reserva_hasta=momento.ahora+$2*interval '1 millisecond',
           proxima_ejecucion=NULL, actualizada_en=momento.ahora
         FROM momento WHERE evento_id=$1`, [id, this.policy.reservaMs]);
      await client.query(
        `INSERT INTO ${this.name}.intento(evento_id,numero,reserva_token,reservado_en,vence_en)
         SELECT evento_id,intentos,reserva_token,actualizada_en,reserva_hasta
         FROM ${this.name}.entrega WHERE evento_id=$1`, [id]);
      const result = await client.query<ReservationRow>(
        `SELECT d.*,e.pedido_id,e.contenido FROM ${this.name}.entrega d
         JOIN ${this.name}.evento e USING(evento_id) WHERE evento_id=$1`, [id]);
      const row = result.rows[0]!;
      return { eventoId: row.evento_id, pedidoId: row.pedido_id, contenido: row.contenido,
        token: row.reserva_token, intento: row.intentos, venceEn: row.reserva_hasta };
    });
  }

  async finalizar(reserva: Pick<Reserva, 'eventoId' | 'token' | 'intento'>, resultado: Resultado, diagnostics: Diagnostics = { categoria: 'sin_http' }): Promise<boolean> {
    const { eventoId, token, intento } = reserva;
    validateDiagnostics(diagnostics);
    const diagnostic = { ...diagnostics };
    uuid(eventoId); uuid(token);
    if (!Number.isInteger(intento) || intento < 1 || intento > 6) throw new Error('Intento inválido');
    if (!['entregado','fallido_definitivo','reintentar'].includes(resultado.tipo)) throw new Error('Resultado inválido');
    const tipo = resultado.tipo;
    const minimum = resultado.tipo === 'reintentar' ? resultado.fechaMinima : undefined;
    if (minimum !== undefined && (!(minimum instanceof Date) || !Number.isFinite(minimum.getTime()))) {
      throw new Error('Fecha mínima inválida');
    }
    const minimumIso = minimum?.toISOString() ?? null;
    return transaction(this.pool, async client => {
      // Adquirir primero el bloqueo: el reloj se lee DESPUÉS de cualquier espera.
      await client.query(`SELECT evento_id FROM ${this.name}.entrega WHERE evento_id=$1 FOR UPDATE`, [eventoId]);
      const changed = await client.query(
        `WITH momento AS MATERIALIZED (SELECT clock_timestamp() AS ahora)
         UPDATE ${this.name}.entrega SET
           estado=CASE WHEN $4='reintentar' THEN
             CASE WHEN intentos<6 THEN 'esperando_reintento' ELSE 'agotado' END
             ELSE $4 END,
           proxima_ejecucion=CASE WHEN $4='reintentar' AND intentos<6
             THEN GREATEST(momento.ahora + ($5*power(2,intentos-1)*(1+random()*0.2))*interval '1 millisecond', $6::timestamptz)
             ELSE NULL END,
           finalizada_en=CASE WHEN $4='reintentar' AND intentos<6 THEN NULL ELSE momento.ahora END,
           reserva_token=NULL, reserva_hasta=NULL, actualizada_en=momento.ahora
         FROM momento WHERE evento_id=$1 AND estado='en_proceso' AND reserva_token=$2
           AND intentos=$3 AND reserva_hasta>momento.ahora RETURNING evento_id`,
        [eventoId, token, intento, tipo, this.policy.baseReintentoMs, minimumIso]);
      if (!changed.rowCount) return false;
      const outcome = tipo === 'entregado' ? 'confirmado' : tipo === 'reintentar' ? 'reintentable' : 'fallido_definitivo';
      await this.closeAttempt(client, eventoId, intento, outcome, diagnostic);
      return true;
    });
  }

  async recuperarVencidas(limite = 50): Promise<number> {
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new Error('Límite de recuperación inválido');
    return transaction(this.pool, async client => {
      const expired = await client.query<{ evento_id: string }>(
        `SELECT evento_id FROM ${this.name}.entrega
         WHERE estado='en_proceso' AND reserva_hasta<=clock_timestamp()
         ORDER BY reserva_hasta,evento_id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limite]);
      for (const { evento_id: id } of expired.rows) {
        const changed = await client.query<{ intentos: number }>(
          `WITH momento AS MATERIALIZED (SELECT clock_timestamp() AS ahora)
           UPDATE ${this.name}.entrega SET
             estado=CASE WHEN intentos<6 THEN 'esperando_reintento' ELSE 'agotado' END,
             proxima_ejecucion=CASE WHEN intentos<6 THEN
               momento.ahora+($2*power(2,intentos-1)*(1+random()*0.2))*interval '1 millisecond'
               ELSE NULL END,
             finalizada_en=CASE WHEN intentos=6 THEN momento.ahora ELSE NULL END,
             reserva_token=NULL,reserva_hasta=NULL,actualizada_en=momento.ahora
           FROM momento WHERE evento_id=$1 RETURNING intentos`, [id, this.policy.baseReintentoMs]);
        await this.closeAttempt(client, id, changed.rows[0]!.intentos, 'desconocido', { categoria: 'reserva_vencida' });
      }
      return expired.rowCount ?? 0;
    });
  }

  private async closeAttempt(client: PoolClient, id: string, number: number, outcome: string, diagnostic: Diagnostics): Promise<void> {
    const result = await client.query(
      `UPDATE ${this.name}.intento i SET resultado=$3, finalizado_en=d.actualizada_en,
         codigo_http=$4,categoria=$5,retry_after=$6
       FROM ${this.name}.entrega d WHERE i.evento_id=d.evento_id AND i.evento_id=$1
         AND i.numero=$2 AND i.resultado='reservado'`, [id, number, outcome, diagnostic.codigoHttp ?? null, diagnostic.categoria, diagnostic.retryAfter ?? null]);
    if (result.rowCount !== 1) throw new Error('Historial de reserva inconsistente: transición revertida');
  }
}
