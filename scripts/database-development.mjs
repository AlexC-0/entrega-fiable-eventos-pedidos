import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import pg from 'pg';

const root = fileURLToPath(new URL('..',import.meta.url));
const local = join(root,'.local/portable-postgres');
const database = 'entrega_fiable_eventos_pedidos';
const schema = 'p03_app';
const envFile = join(root,'.env');
const options = { host:'127.0.0.1', port:55434, connectionTimeoutMillis:3000, statement_timeout:5000 };
const credentialsFile = join(local,'development.json');
function check(condition, message) { if (!condition) throw new Error(message); }
function url(role,password) { return 'postgresql://' + role + ':' + password + '@127.0.0.1:55434/' + database; }
function privateConfig() {
  check(existsSync(credentialsFile),'Falta db:prepare.');
  const value=JSON.parse(readFileSync(credentialsFile,'utf8'));
  check(['migration','api'].every(key=>/^[a-f0-9]{64}$/.test(value[key])),'Archivo privado inválido.');
  return value;
}
async function identity(client, role) {
  const row=(await client.query('SELECT current_database() AS nombre, current_user AS usuario, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  check(row?.nombre===database && row.usuario===role && !row.rolsuper && !row.rolcreatedb && !row.rolcreaterole,'Base o rol de desarrollo incorrectos.');
}
function updateEnvironment(secrets) {
  check(existsSync(envFile),'Falta .env del cluster propio.');
  const original=readFileSync(envFile,'utf8');
  const env=parseEnv(original);
  const additions={ DATABASE_URL:url('p03_api',secrets.api), MIGRATION_DATABASE_URL:url('p03_migracion',secrets.migration) };
  for(const [key,value] of Object.entries(additions)) {
    check(!env[key] || env[key]===value,'Configuración privada distinta; no se sobrescribe.');
  }
  for(const key of ['RECEPCION_TOKEN','CONSULTA_TOKEN']) additions[key]=env[key] || randomBytes(32).toString('hex');
  check(additions.RECEPCION_TOKEN!==additions.CONSULTA_TOKEN,'Tokens iguales; corrija la configuración privada.');
  check(['RECEPCION_TOKEN','CONSULTA_TOKEN'].every(key=>/^[A-Za-z0-9._~+\/-]{32,256}={0,2}$/.exec(additions[key])?.[0]===additions[key]),'Tokens existentes inválidos; no se sustituyen.');
  let next=original;
  for(const [key,value] of Object.entries(additions)) {
    if(env[key]) continue;
    const pattern=new RegExp('^'+key+'=.*$','m');
    if(pattern.test(next)) next=next.replace(pattern,()=>key+'='+value);
    else next+=(next.endsWith('\n')?'':'\n')+key+'='+value+'\n';
  }
  if(next!==original) writeFileSync(envFile,next,{mode:0o600});
}
async function prepare() {
  check(existsSync(join(local,'data/PG_VERSION')),'Falta el cluster existente; use db:portable up.');
  const adminSecrets=JSON.parse(readFileSync(join(local,'credentials.json'),'utf8'));
  const admin=new pg.Client({...options,user:'p03_preparacion',password:adminSecrets.admin,database:'postgres'});
  try {
    await admin.connect();
    const own=(await admin.query("SELECT current_database() AS nombre,current_setting('data_directory') AS ruta")).rows[0];
    check(own?.nombre==='postgres' && resolve(own.ruta)===resolve(local,'data'),'Cluster ajeno rechazado.');
    if(!existsSync(credentialsFile)) {
      const existing=await admin.query("SELECT 1 FROM pg_roles WHERE rolname IN ('p03_migracion','p03_api') UNION ALL SELECT 1 FROM pg_database WHERE datname=$1",[database]);
      check(existing.rowCount===0,'Recursos existentes sin archivo privado propio; no se alteran.');
      writeFileSync(credentialsFile,JSON.stringify({migration:randomBytes(32).toString('hex'),api:randomBytes(32).toString('hex')})+'\n',{flag:'wx',mode:0o600});
    }
    const secrets=privateConfig();
    // Solo nombres fijos y contraseñas hex verificadas. Nunca se imprimen consultas ni errores originales.
    for(const [role,key] of [['p03_migracion','migration'],['p03_api','api']]) {
      if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount) {
        await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+secrets[key]+"'");
      }
    }
    if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount) {
      await admin.query('CREATE DATABASE '+database+' OWNER p03_migracion');
      await admin.query('REVOKE ALL ON DATABASE '+database+' FROM PUBLIC');
      await admin.query('GRANT CONNECT ON DATABASE '+database+' TO p03_api');
    }
    const owner=(await admin.query('SELECT pg_get_userbyid(datdba) AS propietario FROM pg_database WHERE datname=$1',[database])).rows[0];
    check(owner?.propietario==='p03_migracion','Propietario inesperado; no se cambia.');
    for(const [role,key] of [['p03_migracion','migration'],['p03_api','api']]) {
      const client=new pg.Client({...options,database,user:role,password:secrets[key]});
      try {
        await client.connect(); await identity(client,role);
        if(role==='p03_api') {
          const right=(await client.query('SELECT has_database_privilege(current_user,current_database(),\'CREATE\') AS crea')).rows[0];
          check(!right.crea,'El rol API tiene permisos de creación inesperados.');
        }
      } finally { await client.end(); }
    }
    updateEnvironment(secrets);
    console.log('Desarrollo preparado; base separada, roles ordinarios y secretos locales conservados. Ejecute db:migrate explícitamente.');
  } finally { await admin.end(); }
}
async function migrate() {
  const secrets=privateConfig();
  const env=parseEnv(readFileSync(envFile,'utf8'));
  check(env.MIGRATION_DATABASE_URL===url('p03_migracion',secrets.migration) && env.DATABASE_URL===url('p03_api',secrets.api),'URLs de desarrollo incorrectas; no se migra.');
  // Importar el módulo compilado no crea ni arranca recursos.
  const { applyMigrations }=await import('../dist/persistence/migrate.js');
  const pool=new pg.Pool({connectionString:env.MIGRATION_DATABASE_URL,connectionTimeoutMillis:3000,statement_timeout:5000});
  try {
    await identity(pool,'p03_migracion');
    const existing=await pool.query('SELECT pg_get_userbyid(nspowner) AS propietario FROM pg_namespace WHERE nspname=$1',[schema]);
    if(existing.rowCount) check(existing.rows[0].propietario==='p03_migracion','Esquema de otro propietario; no se modifica.');
    else await pool.query('CREATE SCHEMA p03_app AUTHORIZATION p03_migracion');
    await applyMigrations(pool,schema);
    const { grantApiPermissions }=await import('../dist/persistence/api-permissions.js');
    await grantApiPermissions(pool,schema);
    console.log('Migración aplicada/verificada; API con SELECT/INSERT de recepción y sin DDL.');
  } finally { await pool.end(); }
}
const action=process.argv[2];
try {
  if(action==='prepare') await prepare();
  else if(action==='migrate') await migrate();
  else throw new Error('Acción desconocida.');
} catch {
  console.error('No se completó la preparación/migración de desarrollo. Revise cluster propio, build, permisos y configuración privada; no se restablecen datos ni contraseñas.');
  process.exitCode=1;
}
