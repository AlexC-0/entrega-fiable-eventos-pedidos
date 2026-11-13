import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const root=fileURLToPath(new URL('..',import.meta.url)), local=join(root,'.local/portable-postgres');
const database='entrega_fiable_eventos_pedidos_test', role='p03_api_prueba';
const file=join(local,'query-tests.json'), envFile=join(root,'.env');
const check=(ok)=>{if(!ok)throw new Error('Preparación no válida');};
let admin;
try {
 const secrets=JSON.parse(readFileSync(join(local,'credentials.json'),'utf8'));
 admin=new pg.Client({host:'127.0.0.1',port:55434,database:'postgres',user:'p03_preparacion',password:secrets.admin,connectionTimeoutMillis:3000});
 await admin.connect();
 const own=(await admin.query("SELECT current_database() AS db,current_setting('data_directory') AS dir")).rows[0];
 check(own.db==='postgres'&&resolve(own.dir)===resolve(local,'data'));
 check((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount===1);
 if(!existsSync(file)){
  check((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount===0);
  writeFileSync(file,JSON.stringify({password:randomBytes(32).toString('hex')})+'\n',{flag:'wx',mode:0o600});
 }
 const {password}=JSON.parse(readFileSync(file,'utf8'));check(/^[a-f0-9]{64}$/.test(password));
 if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)
  await admin.query("CREATE ROLE p03_api_prueba LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
 await admin.query('GRANT CONNECT ON DATABASE '+database+' TO '+role);
 const url='postgresql://'+role+':'+password+'@127.0.0.1:55434/'+database;
 const client=new pg.Client({connectionString:url,connectionTimeoutMillis:3000});
 try{
  await client.connect();
  const r=(await client.query("SELECT current_database() AS db,rolsuper,rolcreatedb,rolcreaterole,has_database_privilege(current_user,current_database(),'CREATE') AS crea FROM pg_roles WHERE rolname=current_user")).rows[0];
  check(r.db===database&&!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.crea);
 }finally{await client.end();}
 let source=readFileSync(envFile,'utf8');const env=parseEnv(source);
 check(!env.TEST_API_DATABASE_URL||env.TEST_API_DATABASE_URL===url);
 if(!env.TEST_API_DATABASE_URL){
  if(/^TEST_API_DATABASE_URL=.*$/m.test(source)) source=source.replace(/^TEST_API_DATABASE_URL=.*$/m,()=> 'TEST_API_DATABASE_URL='+url);
  else source+=(source.endsWith('\n')?'':'\n')+'TEST_API_DATABASE_URL='+url+'\n';
  writeFileSync(envFile,source,{mode:0o600});
 }
 console.log('Rol API de pruebas preparado: solo CONNECT; cada fixture concede sus tablas y elimina su propio esquema.');
}catch{console.error('No se preparó el rol API de pruebas. Revise cluster propio y recursos existentes; no se sustituyen credenciales.');process.exitCode=1;}
finally{await admin?.end();}
