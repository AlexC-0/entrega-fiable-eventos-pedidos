import type { Pool } from 'pg';
import { schemaName } from './transaction.js';

// Solo el migrador/preparador llama a esta función; nunca el arranque HTTP.
export async function grantApiPermissions(pool: Pool, schema: string, role = 'p03_api'): Promise<void> {
  if (!/^p03_[a-z0-9_]{1,55}$/.test(role)) throw new Error('Rol inválido');
  const name=schemaName(schema), grantee='"'+role+'"';
  await pool.query('GRANT USAGE ON SCHEMA '+name+' TO '+grantee);
  await pool.query('GRANT SELECT ON '+['evento','entrega','intento','migracion'].map(t=>name+'.'+t).join(',')+' TO '+grantee);
  await pool.query('GRANT INSERT ON '+name+'.evento,'+name+'.entrega TO '+grantee);
}
