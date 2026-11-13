import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import type { Db, JobWithMetadata, QueueOptions } from 'pg-boss';

export const DATABASE = 'entrega_fiable_eventos_pedidos_test';
export const QUEUE = 'entrega_prueba';
export type Payload = { eventoId: string };
export type Claim = JobWithMetadata<Payload>;
export const poolOptions = { connectionTimeoutMillis: 3000, statement_timeout: 5000, idle_in_transaction_session_timeout: 10000 };

export function requiredUrl(value = process.env.TEST_DATABASE_URL): string {
  if (!value) throw new Error('TEST_DATABASE_URL es obligatoria; no se omiten pruebas.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('TEST_DATABASE_URL no es una URL válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.pathname.slice(1)) !== DATABASE) {
    throw new Error('Base rechazada: se exige entrega_fiable_eventos_pedidos_test.');
  }
  return value;
}
export async function assertDatabase(db: Pick<pg.Pool, 'query'> | pg.PoolClient): Promise<void> {
  const result = await db.query('SELECT current_database() AS nombre, rolsuper FROM pg_roles WHERE rolname=current_user');
  assert.equal(result.rows[0]?.nombre, DATABASE, 'current_database incorrecta: ninguna escritura permitida');
  assert.equal(result.rows[0]?.rolsuper, false, 'El experimento exige un rol ordinario');
}
export function identifier(value: string): string {
  assert.match(value, /^p03_(app|cola)_[a-f0-9]{24}$/);
  return '"' + value + '"';
}
export function adapter(client: pg.PoolClient): Db {
  return { executeSql: (text, values) => client.query(text, values) };
}
export async function transaction<T>(pool: pg.Pool, action: (client: pg.PoolClient, db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await assertDatabase(client);
    await client.query('BEGIN');
    const result = await action(client, adapter(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export function bossOptions(schema: string, url: string, supervise = false) {
  identifier(schema);
  return {
    connectionString: url, schema, application_name: schema,
    max: 4, connectionTimeoutMillis: 3000, migrate: false, createSchema: false,
    schedule: false, supervise, superviseIntervalSeconds: 1, monitorIntervalSeconds: 1,
    maintenanceIntervalSeconds: 1, reindex: false, monitorVacuum: false,
    persistWarnings: false, persistQueueStats: false, registerInstance: false,
  };
}
export class Experiment {
  readonly url: string;
  readonly pool: pg.Pool;
  readonly boss: PgBoss;
  readonly errors: Error[] = [];
  constructor(readonly app: string, readonly queueSchema: string, url: string) {
    this.url = requiredUrl(url);
    identifier(app);
    this.pool = new pg.Pool({ connectionString: url, ...poolOptions, application_name: app, max: 5 });
    this.boss = new PgBoss(bossOptions(queueSchema, url));
    this.boss.on('error', error => this.errors.push(error));
    this.pool.on('error', error => this.errors.push(error));
  }
  async enqueue(eventoId = randomUUID(), rollback = false, queue = QUEUE) {
    return transaction(this.pool, async (client, db) => {
      await client.query('INSERT INTO ' + identifier(this.app) + '.evento(id) VALUES ($1)', [eventoId]);
      const id = await this.boss.send(queue, { eventoId }, { db });
      assert.ok(id, 'No se acepta evento sin trabajo');
      await client.query('INSERT INTO ' + identifier(this.app) + '.entrega(evento_id, job_id) VALUES ($1,$2)', [eventoId, id]);
      if (rollback) throw new Error('rollback provocado');
      return id;
    });
  }
  async reserve(failHistory = false): Promise<Claim | undefined> {
    return transaction(this.pool, async (client, db) => {
      const [job] = await this.boss.fetch<Payload>(QUEUE, { db, includeMetadata: true });
      if (!job) return undefined;
      const generation = job.retryCount + 1;
      assert.ok(generation <= 6, 'Presupuesto excedido');
      const updated = await client.query('UPDATE ' + identifier(this.app) + ".entrega SET generacion=$2, estado='en_proceso' WHERE job_id=$1 AND generacion < $2 AND estado NOT IN ('entregado','agotado') RETURNING job_id", [job.id, generation]);
      assert.equal(updated.rowCount, 1, 'Reserva de dominio no vigente');
      await client.query('UPDATE ' + identifier(this.app) + ".intento SET resultado='desconocido' WHERE job_id=$1 AND resultado='reservado'", [job.id]);
      await client.query('INSERT INTO ' + identifier(this.app) + '.intento(job_id,numero,resultado) VALUES ($1,$2,$3)', [job.id, generation, failHistory ? null : 'reservado']);
      return job;
    });
  }
  async complete(job: Claim): Promise<void> {
    await transaction(this.pool, async (client, db) => {
      const result = await this.boss.complete(QUEUE, job, undefined, { db });
      assert.equal(result.affected, 1, 'Reserva de cola antigua');
      const changed = await client.query('UPDATE ' + identifier(this.app) + ".entrega SET estado='entregado' WHERE job_id=$1 AND generacion=$2 AND estado='en_proceso' RETURNING job_id", [job.id, job.retryCount + 1]);
      assert.equal(changed.rowCount, 1, 'Generación de dominio antigua');
      await client.query('UPDATE ' + identifier(this.app) + ".intento SET resultado='confirmado' WHERE job_id=$1 AND numero=$2", [job.id, job.retryCount + 1]);
    });
  }
  async retry(job: Claim, minimum?: Date, during?: () => Promise<void>): Promise<{ native: Date; scheduled: Date }> {
    return transaction(this.pool, async (client, db) => {
      const result = await this.boss.fail(QUEUE, job, { motivo: 'fallo_temporal_de_prueba' }, { db });
      assert.equal(result.affected, 1, 'Reserva de cola antigua');
      const [pending] = await this.boss.findJobs<Payload>(QUEUE, { id: job.id, db });
      assert.ok(pending);
      assert.equal(pending.state, 'retry');
      if (during) await during(); // Barrera de prueba mientras se conserva el bloqueo transaccional.
      const scheduled = new Date(Math.max(pending.startAfter.getTime(), minimum?.getTime() ?? 0));
      if (minimum) {
        const update = await this.boss.update(QUEUE, undefined, { id: job.id, startAfter: scheduled, db });
        assert.equal(update.updated, 1);
      }
      const changed = await client.query('UPDATE ' + identifier(this.app) + ".entrega SET estado='esperando_reintento' WHERE job_id=$1 AND generacion=$2 AND estado='en_proceso' RETURNING job_id", [job.id, job.retryCount + 1]);
      assert.equal(changed.rowCount, 1);
      await client.query('UPDATE ' + identifier(this.app) + ".intento SET resultado='reintentable' WHERE job_id=$1 AND numero=$2", [job.id, job.retryCount + 1]);
      return { native: pending.startAfter, scheduled };
    });
  }
  async reconcile(id: string): Promise<void> {
    await transaction(this.pool, async (client, db) => {
      const [job] = await this.boss.findJobs<Payload>(QUEUE, { id, db });
      assert.ok(job, 'Falta evidencia de cola: no se inventa un resultado');
      if (job.state !== 'failed') return;
      assert.equal(job.retryCount, 5);
      const changed = await client.query('UPDATE ' + identifier(this.app) + ".entrega SET estado='agotado' WHERE job_id=$1 AND generacion=6 AND estado='en_proceso' RETURNING job_id", [id]);
      if (changed.rowCount) await client.query('UPDATE ' + identifier(this.app) + ".intento SET resultado='desconocido' WHERE job_id=$1 AND numero=6 AND resultado='reservado'", [id]);
    });
  }
  async jobs(id: string) { return this.boss.findJobs<Payload>(QUEUE, { id }); }
  async rows(table: 'evento' | 'entrega' | 'intento') {
    return (await this.pool.query('SELECT * FROM ' + identifier(this.app) + '.' + table)).rows;
  }
  async close() {
    await this.boss.stop();
    await this.pool.end();
  }
}
export async function withExperiment(action: (experiment: Experiment) => Promise<void>, options: QueueOptions = {}): Promise<void> {
  const url = requiredUrl();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 24);
  const app = 'p03_app_' + suffix;
  const queueSchema = 'p03_cola_' + suffix;
  const experiment = new Experiment(app, queueSchema, url);
  let created = false;
  let installer: PgBoss | undefined;
  try {
    await assertDatabase(experiment.pool);
    await transaction(experiment.pool, async client => {
      await client.query('CREATE SCHEMA ' + identifier(app));
      await client.query('CREATE SCHEMA ' + identifier(queueSchema));
    });
    created = true;
    await experiment.pool.query(`
      CREATE TABLE ${identifier(app)}.evento(id uuid PRIMARY KEY);
      CREATE TABLE ${identifier(app)}.entrega(
        evento_id uuid PRIMARY KEY REFERENCES ${identifier(app)}.evento(id),
        job_id uuid UNIQUE NOT NULL, generacion integer NOT NULL DEFAULT 0,
        estado text NOT NULL DEFAULT 'pendiente');
      CREATE TABLE ${identifier(app)}.intento(
        job_id uuid NOT NULL REFERENCES ${identifier(app)}.entrega(job_id),
        numero integer NOT NULL CHECK (numero BETWEEN 1 AND 6),
        resultado text NOT NULL, registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(job_id,numero));`);
    installer = new PgBoss({ ...bossOptions(queueSchema, url), migrate: true });
    installer.on('error', error => experiment.errors.push(error));
    await installer.start();
    await installer.createQueue(QUEUE, {
      retryLimit: 5, retryDelay: 0, expireInSeconds: 2,
      retentionSeconds: 86400, deleteAfterSeconds: 0, ...options,
    });
    await installer.stop();
    installer = undefined;
    await experiment.boss.start();
    await action(experiment);
    assert.deepEqual(experiment.errors, [], 'Errores de recursos en segundo plano');
  } finally {
    try { if (installer) await installer.stop(); }
    finally {
      try { await experiment.close(); }
      finally {
        if (created) {
          const cleanup = new pg.Pool({ connectionString: url, ...poolOptions });
          try {
            await assertDatabase(cleanup);
            await cleanup.query('DROP SCHEMA ' + identifier(queueSchema) + ' CASCADE');
            await cleanup.query('DROP SCHEMA ' + identifier(app) + ' CASCADE');
          } finally { await cleanup.end(); }
        }
      }
    }
  }
}
export async function until<T>(read: () => Promise<T | undefined | false>, timeout = 12000): Promise<T> {
  const end = Date.now() + timeout;
  do {
    const result = await read();
    if (result !== undefined && result !== false) return result;
    await delay(40);
  } while (Date.now() < end);
  throw new Error('Tiempo de espera agotado');
}
