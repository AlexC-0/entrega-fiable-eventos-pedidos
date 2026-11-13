import pg from 'pg';
import { assertDatabase, requiredUrl, DATABASE } from '../core/support.js';
import { startServer } from '../../src/server/runtime.js';
const pool = new pg.Pool({connectionString:requiredUrl(),connectionTimeoutMillis:3000});
try {
  await assertDatabase(pool);
  await pool.end();
  const api = await startServer({databaseUrl:requiredUrl(),database:DATABASE,schema:process.argv[2]!,
    port:0,tokens:{recepcion:process.env.RECEPCION_TOKEN!,consulta:process.env.CONSULTA_TOKEN!}});
  process.send?.({tipo:'listo',port:api.port});
  process.once('message',() => {
    void api.close().then(() => { process.send?.({tipo:'cerrado'}); process.disconnect(); })
      .catch(() => { process.exitCode=1; process.disconnect(); });
  });
} catch { await pool.end().catch(()=>{}); console.error('Hijo HTTP no disponible.'); process.exitCode=1; process.disconnect?.(); }
