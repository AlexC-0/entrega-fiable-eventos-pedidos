import type { Pool } from 'pg';
import { schemaName } from '../persistence/transaction.js';
import { verifyMigrations } from '../persistence/migrate.js';
import { PersistenceNotReady } from '../persistence/errors.js';
export async function checkDatabase(pool: Pool,database: string): Promise<void> {
  const row=(await pool.query('SELECT current_database() AS nombre,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(row?.nombre!==database || row.rolsuper || row.rolcreatedb || row.rolcreaterole) throw new PersistenceNotReady();
}
export async function checkPrivileges(pool:Pool,schema:string,rights: [string,string][]):Promise<void> {
  for(const [table,operations] of rights) {
    // has_table_privilege con lista comprueba ANY: comprobar cada permiso por separado.
    for(const operation of operations.split(',')) {
      const result=await pool.query('SELECT has_table_privilege(current_user,$1,$2) AS permitido',[schemaName(schema)+'.'+table,operation]);
      if(!result.rows[0]?.permitido) throw new PersistenceNotReady();
    }
  }
}
export async function workerReady(pool:Pool,schema:string,database:string):Promise<void> {
  await checkDatabase(pool,database);
  await verifyMigrations(pool,schema);
  await checkPrivileges(pool,schema,[['evento','SELECT'],['entrega','SELECT,UPDATE'],['intento','SELECT,INSERT,UPDATE']]);
}
