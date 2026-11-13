import pg from 'pg';
import { EventStore } from '../persistence/event-store.js';
import { createApp } from '../http/app.js';
import { safeLog } from '../http/errors.js';
import type { SafeLog } from '../http/errors.js';
import type { Config } from './config.js';
import { listen } from './listen.js';
export async function startServer(config:Config,log:SafeLog=safeLog) {
  const pool=new pg.Pool({connectionString:config.databaseUrl,max:8,
    connectionTimeoutMillis:3000,statement_timeout:5000,idle_in_transaction_session_timeout:10000,application_name:'p03_api'});
  pool.on('error',()=>log({evento:'error_pool'}));
  return listen(createApp(new EventStore(pool,config.schema,config.database),config.tokens,log),pool,config.port);
}
