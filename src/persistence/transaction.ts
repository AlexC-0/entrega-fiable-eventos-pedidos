import type { Pool, PoolClient } from 'pg';

export function schemaName(value: string): string {
  if (!/^p03_[a-z0-9_]{1,55}$/.test(value)) throw new Error('Esquema propio inválido');
  return '"' + value + '"';
}

export async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
