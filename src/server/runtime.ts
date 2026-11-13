import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { EventStore } from '../persistence/event-store.js';
import { createApp } from '../http/app.js';
import { safeLog } from '../http/errors.js';
import type { SafeLog } from '../http/errors.js';
import type { Config } from './config.js';

export async function startServer(config: Config, log: SafeLog = safeLog) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 8,
    connectionTimeoutMillis: 3000, statement_timeout: 5000, idle_in_transaction_session_timeout: 10000,
    application_name: 'p03_api' });
  pool.on('error', () => log({ evento: 'error_pool' }));
  const store = new EventStore(pool,config.schema,config.database);
  const server = createServer(createApp(store,config.tokens,log));
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  try {
    await new Promise<void>((resolve,reject) => {
      server.once('error',reject);
      server.listen(config.port,'127.0.0.1',() => { server.off('error',reject); resolve(); });
    });
  } catch (error) { await pool.end(); throw error; }
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    const timer = setTimeout(() => server.closeAllConnections(),6000);
    timer.unref();
    try { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); }
    finally { clearTimeout(timer); await pool.end(); }
  })();
  return { server, pool, port: (server.address() as AddressInfo).port, close };
}
