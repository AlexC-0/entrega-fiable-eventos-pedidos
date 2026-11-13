import pg from 'pg';
import { PostgresQueue } from '../../src/index.js';
import { assertDatabase, connectionOptions, requiredUrl } from './support.js';

const [schema, lease, base] = process.argv.slice(2);
if (!schema || !lease || !base || !process.send) throw new Error('Consumidor solo para prueba IPC');
const pool = new pg.Pool({ connectionString: requiredUrl(), ...connectionOptions, max: 1 });
try {
  await assertDatabase(pool);
  const queue = new PostgresQueue(pool, schema, { reservaMs: Number(lease), baseReintentoMs: Number(base) });
  const claim = await queue.reservar();
  if (!claim) throw new Error('No hay trabajo disponible');
  process.send({ kind: 'reserved', intento: claim.intento });
  // Ninguna transacción queda abierta. El padre mata este proceso sin cierre ordenado.
  setInterval(() => {}, 1000);
} catch {
  await pool.end();
  process.send({ kind: 'error' });
  process.disconnect();
  process.exitCode = 1;
}
