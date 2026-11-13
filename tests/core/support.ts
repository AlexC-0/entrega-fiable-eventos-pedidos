import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PostgresQueue, applyMigrations } from '../../src/index.js';
import type { Evento, Politica } from '../../src/index.js';
import { schemaName } from '../../src/persistence/transaction.js';

export const DATABASE = 'entrega_fiable_eventos_pedidos_test';
export const PROFILE: Politica = { reservaMs: 1500, baseReintentoMs: 20 };
export const connectionOptions = { connectionTimeoutMillis: 3000, statement_timeout: 8000, idle_in_transaction_session_timeout: 10000 };

export function requiredUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL obligatoria: no se omiten pruebas.');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('TEST_DATABASE_URL inválida'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || decodeURIComponent(parsed.pathname.slice(1)) !== DATABASE) {
    throw new Error('Base de pruebas incorrecta');
  }
  return value;
}
export async function assertDatabase(pool: pg.Pool | pg.PoolClient): Promise<void> {
  const { rows } = await pool.query('SELECT current_database() AS nombre, rolsuper FROM pg_roles WHERE rolname=current_user');
  assert.equal(rows[0]?.nombre, DATABASE, 'current_database incorrecta: ninguna escritura permitida');
  assert.equal(rows[0]?.rolsuper, false, 'Se exige rol ordinario');
}
export function event(overrides: Partial<Evento> = {}): Evento {
  return { eventoId: randomUUID(), pedidoId: randomUUID(), contenido: { lineas: [{ sku: 'FICTICIO', cantidad: 2 }] }, ...overrides };
}
export class Fixture {
  readonly queue: PostgresQueue;
  readonly name: string;
  constructor(readonly pool: pg.Pool, readonly schema: string, policy: Politica) {
    this.queue = new PostgresQueue(pool, schema, policy);
    this.name = schemaName(schema);
  }
  async rows(table: 'evento' | 'entrega' | 'intento' | 'migracion') {
    return (await this.pool.query('SELECT * FROM ' + this.name + '.' + table)).rows;
  }
  async expire() {
    // Fixture explícito: representa una reserva vencida; no simula días de parada.
    await this.pool.query(`WITH t AS MATERIALIZED (SELECT clock_timestamp() AS ahora)
      UPDATE ${this.name}.entrega SET actualizada_en=t.ahora-interval '2 seconds',
      reserva_hasta=t.ahora-interval '1 second' FROM t WHERE estado='en_proceso'`);
  }
  async ready() {
    // Solo pruebas de fórmula/budget: adelanta disponibilidad conservando estados y presupuesto.
    await this.pool.query(`UPDATE ${this.name}.entrega SET proxima_ejecucion=clock_timestamp()-interval '1 second'
      WHERE estado='esperando_reintento'`);
  }
  async failTrigger(table: 'entrega' | 'intento', operation: 'INSERT' | 'UPDATE') {
    await this.pool.query(`CREATE FUNCTION ${this.name}.fallo_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo SQL provocado' USING ERRCODE='23514'; END; $$;
      CREATE TRIGGER fallo_prueba BEFORE ${operation} ON ${this.name}.${table}
      FOR EACH ROW EXECUTE FUNCTION ${this.name}.fallo_prueba()`);
  }
  async removeTrigger(table: 'entrega' | 'intento') {
    await this.pool.query(`DROP TRIGGER fallo_prueba ON ${this.name}.${table}; DROP FUNCTION ${this.name}.fallo_prueba()`);
  }
}
export async function withFixture(action: (fixture: Fixture) => Promise<void>, policy = PROFILE) {
  const url = requiredUrl();
  const schema = 'p03_core_' + randomUUID().replaceAll('-', '').slice(0, 24);
  const name = schemaName(schema);
  const errors: Error[] = [];
  const pool = new pg.Pool({ connectionString: url, ...connectionOptions, application_name: schema, max: 6 });
  pool.on('error', error => errors.push(error));
  let created = false;
  try {
    await assertDatabase(pool);
    await pool.query('CREATE SCHEMA ' + name);
    created = true;
    await applyMigrations(pool, schema);
    await applyMigrations(pool, schema);
    assert.equal((await pool.query('SELECT * FROM ' + name + '.migracion')).rowCount, 1);
    await action(new Fixture(pool, schema, policy));
    assert.deepEqual(errors, []);
  } finally {
    await pool.end();
    if (created) {
      const cleanup = new pg.Pool({ connectionString: url, ...connectionOptions });
      try {
        await assertDatabase(cleanup);
        await cleanup.query('DROP SCHEMA ' + name + ' CASCADE');
      } finally { await cleanup.end(); }
    }
  }
}
export async function until<T>(read: () => Promise<T | undefined | false>, timeout = 10000): Promise<T> {
  const deadline = Date.now() + timeout; // Solo límite del runner; el núcleo usa reloj PostgreSQL.
  do {
    const result = await read();
    if (result !== undefined && result !== false) return result;
    await delay(20);
  } while (Date.now() < deadline);
  throw new Error('Tiempo de espera de prueba agotado');
}
