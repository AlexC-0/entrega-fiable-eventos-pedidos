import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const root=fileURLToPath(new URL('..',import.meta.url)),local=join(root,'.local/portable-postgres');
const sender='entrega_fiable_eventos_pedidos',receiver=sender+'_receptor';
const privateFile=join(local,'delivery.json'),envFile=join(root,'.env');
const options={host:'127.0.0.1',port:55434,connectionTimeoutMillis:3000,statement_timeout:5000};
const roles=[['p03_trabajador','worker',sender],['p03_receptor_migracion','migration',receiver],['p03_receptor','receiver',receiver]];
function check(value){if(!value)throw new Error('Configuración propia no verificada');}
function connection(role,password,database){return 'postgresql://'+role+':'+password+'@127.0.0.1:55434/'+database;}
function secrets(){const s=JSON.parse(readFileSync(privateFile,'utf8'));check(roles.every(([,key])=>/^[a-f0-9]{64}$/.test(s[key])));return s;}
async function identity(pool,database,role){
 const row=(await pool.query('SELECT current_database() AS db,current_user AS rol,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
 check(row.db===database && row.rol===role && !row.rolsuper && !row.rolcreatedb && !row.rolcreaterole);
}
async function prepare(){
 const adminSecrets=JSON.parse(readFileSync(join(local,'credentials.json'),'utf8'));
 const client=new pg.Client({...options,user:'p03_preparacion',password:adminSecrets.admin,database:'postgres'});
 try {
  await client.connect();
  const own=(await client.query("SELECT current_database() AS db,current_setting('data_directory') AS ruta")).rows[0];
  check(own.db==='postgres' && resolve(own.ruta)===resolve(local,'data'));
  if(!existsSync(privateFile)){
   const found=await client.query('SELECT 1 FROM pg_roles WHERE rolname=ANY($1) UNION ALL SELECT 1 FROM pg_database WHERE datname=$2',[roles.map(([role])=>role),receiver]);
   check(found.rowCount===0);
   writeFileSync(privateFile,JSON.stringify({worker:randomBytes(32).toString('hex'),migration:randomBytes(32).toString('hex'),receiver:randomBytes(32).toString('hex')})+'\n',{flag:'wx',mode:0o600});
  }
  const s=secrets();
  for(const [role,key] of roles) if(!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)
   await client.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+s[key]+"'");
  if(!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[receiver])).rowCount){
   await client.query('CREATE DATABASE '+receiver+' OWNER p03_receptor_migracion');
   await client.query('REVOKE ALL ON DATABASE '+receiver+' FROM PUBLIC');
  }
  check((await client.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[receiver])).rows[0].owner==='p03_receptor_migracion');
  await client.query('GRANT CONNECT ON DATABASE '+sender+' TO p03_trabajador');
  await client.query('GRANT CONNECT ON DATABASE '+receiver+' TO p03_receptor');
  for(const [role,key,database] of roles){
   const ordinary=new pg.Client({...options,database,user:role,password:s[key]});
   try {await ordinary.connect();await identity(ordinary,database,role);
    if(key!=='migration')check(!(await ordinary.query("SELECT has_database_privilege(current_user,current_database(),'CREATE') AS crea")).rows[0].crea);
   } finally {await ordinary.end();}
  }
  let text=readFileSync(envFile,'utf8');const env=parseEnv(text);
  const additions={
   WORKER_DATABASE_URL:connection('p03_trabajador',s.worker,sender),
   RECEPTOR_DATABASE_URL:connection('p03_receptor',s.receiver,receiver),
   RECEPTOR_MIGRATION_DATABASE_URL:connection('p03_receptor_migracion',s.migration,receiver),
   ENTREGA_TOKEN:env.ENTREGA_TOKEN||randomBytes(32).toString('hex'),
   DESTINO_URL:env.DESTINO_URL||'http://127.0.0.1:'+(env.RECEPTOR_PORT||'3004')+'/eventos'
  };
  check(additions.ENTREGA_TOKEN!==env.RECEPCION_TOKEN && additions.ENTREGA_TOKEN!==env.CONSULTA_TOKEN);
  check(/^[A-Za-z0-9._~+\/-]{32,256}={0,2}$/.exec(additions.ENTREGA_TOKEN)?.[0]===additions.ENTREGA_TOKEN);
  const {destination}=await import('../dist/worker/config.js');destination(additions.DESTINO_URL);
  for(const [key,value] of Object.entries(additions)){
   check(!env[key]||env[key]===value);
   if(env[key])continue;
   const pattern=new RegExp('^'+key+'=.*$','m');
   text=pattern.test(text)?text.replace(pattern,()=>key+'='+value):text+(text.endsWith('\n')?'':'\n')+key+'='+value+'\n';
  }
  if(text!==readFileSync(envFile,'utf8'))writeFileSync(envFile,text,{mode:0o600});
  console.log('Recursos de trabajador y receptor preparados; secretos existentes conservados. Falta migración explícita.');
 } finally {await client.end();}
}
async function migrate(){
 const s=secrets(),env=parseEnv(readFileSync(envFile,'utf8'));
 const {applyMigrations}=await import('../dist/persistence/migrate.js');
 const {receiverMigrations}=await import('../dist/receiver/migrations.js');
 const dev=JSON.parse(readFileSync(join(local,'development.json'),'utf8'));
 check(env.MIGRATION_DATABASE_URL===connection('p03_migracion',dev.migration,sender));
 check(env.RECEPTOR_MIGRATION_DATABASE_URL===connection('p03_receptor_migracion',s.migration,receiver));
 const source=new pg.Pool({connectionString:env.MIGRATION_DATABASE_URL,connectionTimeoutMillis:3000,statement_timeout:5000});
 try{
  await identity(source,sender,'p03_migracion');
  check((await source.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='p03_app'")).rows[0]?.owner==='p03_migracion');
  await applyMigrations(source,'p03_app');
  await source.query('GRANT USAGE ON SCHEMA p03_app TO p03_trabajador');
  await source.query('GRANT SELECT ON p03_app.evento,p03_app.entrega,p03_app.intento,p03_app.migracion TO p03_trabajador');
  await source.query('GRANT UPDATE ON p03_app.entrega,p03_app.intento TO p03_trabajador');
  await source.query('GRANT INSERT ON p03_app.intento TO p03_trabajador');
 }finally{await source.end();}
 const target=new pg.Pool({connectionString:env.RECEPTOR_MIGRATION_DATABASE_URL,connectionTimeoutMillis:3000,statement_timeout:5000});
 try{
  await identity(target,receiver,'p03_receptor_migracion');
  const existing=await target.query("SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname='p03_receptor'");
  if(existing.rowCount)check(existing.rows[0].owner==='p03_receptor_migracion');
  else await target.query('CREATE SCHEMA p03_receptor AUTHORIZATION p03_receptor_migracion');
  await applyMigrations(target,'p03_receptor',receiverMigrations);
  await target.query('GRANT USAGE ON SCHEMA p03_receptor TO p03_receptor');
  await target.query('GRANT SELECT ON p03_receptor.procesado,p03_receptor.preparacion,p03_receptor.migracion TO p03_receptor');
  await target.query('GRANT INSERT ON p03_receptor.procesado,p03_receptor.preparacion TO p03_receptor');
 }finally{await target.end();}
 console.log('Migraciones y permisos de trabajador/receptor verificados; API conserva sus permisos.');
}
try{
 if(process.argv[2]==='prepare')await prepare();
 else if(process.argv[2]==='migrate')await migrate();
 else throw new Error('Acción desconocida');
}catch{console.error('No se completó la preparación de entrega. Revise build, cluster propio, configuración y permisos; no se restablecen datos ni credenciales.');process.exitCode=1;}
