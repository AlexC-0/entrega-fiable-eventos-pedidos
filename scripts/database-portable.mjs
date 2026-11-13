import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, createWriteStream, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const local = resolve('.local/portable-postgres');
const data = join(local, 'data');
const bin = join(local, 'pgsql/bin');
const secretFile = join(local, 'credentials.json');
const database = 'entrega_fiable_eventos_pedidos_test';
const source = 'https://get.enterprisedb.com/postgresql/postgresql-18.7-1-windows-x64-binaries.zip';
const sha256 = 'ead0bbc27fb678fa24dcf86b738981323042abd073c744103bf7f3aed23f9a33';
const action = process.argv[2] ?? 'status';
function run(executable, args, allowFailure = false) {
  const result = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0 && !allowFailure) throw new Error('No se completó la operación local de PostgreSQL.');
  return result.status;
}
function status() {
  if (!existsSync(join(data, 'PG_VERSION'))) return false;
  return run(join(bin, 'pg_ctl.exe'), ['-D', data, 'status'], true) === 0;
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('Puerto 55434 ocupado; no se cierra ningún proceso.')));
    server.listen(55434, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}
async function main() {
  if (process.platform !== 'win32') throw new Error('Este preparador portátil es exclusivo de Windows.');
  if (!['up', 'stop', 'status'].includes(action)) throw new Error('Usar up, stop o status.');
  if (action === 'status') { console.log(status() ? 'Instancia propia activa' : 'Instancia propia detenida o ausente'); return; }
  if (action === 'stop') {
    if (status()) run(join(bin, 'pg_ctl.exe'), ['-D', data, 'stop', '-m', 'fast', '-w', '-t', '30']);
    console.log('Datos propios conservados.');
    return;
  }
  const alreadyRunning = status();
  if (!alreadyRunning) await freePort();
  if (!existsSync(secretFile)) {
    if (existsSync(data) || existsSync('.env')) throw new Error('Datos o .env existentes sin credenciales propias; no se reinicializa.');
    mkdirSync(local, { recursive: true });
    writeFileSync(secretFile, JSON.stringify({ admin: randomBytes(32).toString('hex'), runtime: randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
  }
  const secrets = JSON.parse(readFileSync(secretFile, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(secrets.admin) || !/^[a-f0-9]{64}$/.test(secrets.runtime)) throw new Error('Archivo privado inválido.');
  const runtimeUrl = 'postgresql://p03_prueba:' + secrets.runtime + '@127.0.0.1:55434/' + database;
  if (existsSync('.env') && !readFileSync('.env', 'utf8').split(/\r?\n/).includes('TEST_DATABASE_URL=' + runtimeUrl)) throw new Error('.env distinto; no se sobrescribe.');
  if (!existsSync(join(bin, 'postgres.exe'))) {
    const archive = join(local, 'postgresql-18.7-1.zip');
    if (!existsSync(archive)) {
      console.log('Descargando PostgreSQL 18.7 portátil desde EDB...');
      const response = await fetch(source);
      if (!response.ok || !response.body) throw new Error('Descarga oficial no disponible.');
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: 'wx' }));
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest('hex') !== sha256) throw new Error('SHA-256 no coincide; no se extrae ni ejecuta.');
    console.log('SHA-256 oficial verificado; extrayendo binarios propios...');
    run('tar.exe', ['-xf', archive, '-C', local]);
    writeFileSync(join(local, 'source.json'), JSON.stringify({ source, sha256 }, null, 2) + '\n');
  }
  run(join(bin, 'postgres.exe'), ['--version']);
  if (!existsSync(join(data, 'PG_VERSION'))) {
    if (existsSync(data)) throw new Error('Directorio de datos preexistente sin PG_VERSION; no se reinicializa.');
    const passwordFile = join(local, 'init-password.txt');
    writeFileSync(passwordFile, secrets.admin, { flag: 'wx', mode: 0o600 });
    try {
      run(join(bin, 'initdb.exe'), ['-D', data, '-U', 'p03_preparacion', '--pwfile=' + passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
    } finally { unlinkSync(passwordFile); }
  }
  if (!alreadyRunning) run(join(bin, 'pg_ctl.exe'), ['-D', data, '-l', join(local, 'server.log'), '-o', '-h 127.0.0.1 -p 55434', 'start', '-w', '-t', '30']);
  const admin = new pg.Client({ host: '127.0.0.1', port: 55434, user: 'p03_preparacion', password: secrets.admin, database: 'postgres', connectionTimeoutMillis: 5000 });
  try {
    await admin.connect();
    const check = await admin.query('SELECT current_database() AS nombre, current_setting(\'data_directory\') AS ruta');
    if (check.rows[0]?.nombre !== 'postgres' || resolve(check.rows[0]?.ruta) !== data) throw new Error('La preparación no apunta al cluster propio.');
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) await admin.query('CREATE DATABASE ' + database);
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', ['p03_prueba'])).rowCount) {
      await admin.query("CREATE ROLE p03_prueba LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + secrets.runtime + "'");
    }
    await admin.query('GRANT CONNECT, CREATE ON DATABASE ' + database + ' TO p03_prueba');
  } finally { await admin.end(); }
  const runtime = new pg.Client({ connectionString: runtimeUrl, connectionTimeoutMillis: 5000 });
  try {
    await runtime.connect();
    const check = await runtime.query('SELECT current_database() AS nombre, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user');
    if (check.rows[0]?.nombre !== database || check.rows[0]?.rolsuper || check.rows[0]?.rolcreatedb || check.rows[0]?.rolcreaterole) throw new Error('Base o rol de ejecución incorrectos.');
  } finally { await runtime.end(); }
  if (!existsSync('.env')) writeFileSync('.env', 'TEST_DATABASE_URL=' + runtimeUrl + '\n', { flag: 'wx', mode: 0o600 });
  console.log('PostgreSQL 18.7 propio listo en 127.0.0.1:55434; rol ordinario y base comprobados. Secretos no impresos.');
}
main().catch(error => {
  // Solo mensajes controlados; los errores del driver/red no exponen el objeto ni la URL.
  const safe = ['Puerto ', 'Datos ', 'Archivo ', '.env ', 'SHA-256 ', 'Directorio ', 'La preparación ', 'Base ', 'Descarga ', 'No se ', 'Este ', 'Usar '];
  console.error(safe.some(prefix => error.message?.startsWith(prefix)) ? error.message : 'No se completó la preparación portátil. Revise conexión, archivos propios y puerto; no se restablecen datos.');
  process.exitCode = 1;
});
