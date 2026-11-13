import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const database = 'entrega_fiable_eventos_pedidos_test';
const container = 'p03-eventos-postgres';
const volume = 'p03-eventos-postgres-datos';
const label = 'entrega-fiable-eventos-pedidos';
const privateFile = '.local/database-experiment.json';
const action = process.argv[2] ?? 'status';

function docker(args, capture = false, env = process.env) {
  const result = spawnSync('docker', ['--context', 'desktop-linux', ...args], {
    encoding: 'utf8', windowsHide: true, env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) throw new Error('Docker no disponible o comando rechazado; revisar el motor y sus permisos.');
  return result.stdout?.trim() ?? '';
}
function owned(kind, name) {
  const names = docker(kind === 'container'
    ? ['ps', '-a', '--format', '{{.Names}}']
    : ['volume', 'ls', '--format', '{{.Name}}'], true).split(/\r?\n/);
  if (!names.includes(name)) return false;
  const format = kind === 'container' ? '{{index .Config.Labels "proyecto"}}' : '{{index .Labels "proyecto"}}';
  if (docker([kind, 'inspect', '--format', format, name], true) !== label) {
    throw new Error('Conflicto de nombre: recurso sin etiqueta propia. No se modifica.');
  }
  return true;
}
async function checkPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error('127.0.0.1:55434 ocupado. No se cierra el proceso existente.')));
    server.listen(55434, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function main() {
  if (!['up', 'stop', 'status'].includes(action)) throw new Error('Usar up, stop o status.');
  docker(['info', '--format', '{{.ServerVersion}}']);
  const hasContainer = owned('container', container);
  const hasVolume = owned('volume', volume);
  if (action === 'status') {
    console.log(hasContainer ? docker(['inspect', '--format', '{{.State.Status}}', container], true) : 'Contenedor propio ausente');
    return;
  }
  if (action === 'stop') {
    if (hasContainer) docker(['stop', container]);
    console.log('Datos conservados; no se eliminan volúmenes.');
    return;
  }
  if (!hasContainer || docker(['inspect', '--format', '{{.State.Running}}', container], true) !== 'true') await checkPort();
  if (!existsSync(privateFile)) {
    if (hasContainer || hasVolume || existsSync('.env')) throw new Error('Recursos o .env preexistentes sin credenciales propias: no se sobrescriben.');
    mkdirSync('.local', { recursive: true });
    writeFileSync(privateFile, JSON.stringify({
      admin: randomBytes(32).toString('hex'), runtime: randomBytes(32).toString('hex'),
    }), { flag: 'wx', mode: 0o600 });
  }
  const secrets = JSON.parse(readFileSync(privateFile, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(secrets.admin) || !/^[a-f0-9]{64}$/.test(secrets.runtime)) throw new Error('Archivo privado inválido.');
  const connectionString = 'postgresql://p03_prueba:' + secrets.runtime + '@127.0.0.1:55434/' + database;
  if (existsSync('.env') && !readFileSync('.env', 'utf8').split(/\r?\n/).includes('TEST_DATABASE_URL=' + connectionString)) {
    throw new Error('.env existente diferente: no se reemplaza.');
  }
  docker(['compose', '-f', 'compose.experiment.yml', 'up', '-d', '--wait'], false,
    { ...process.env, P03_ADMIN_PASSWORD: secrets.admin });
  const admin = new pg.Client({
    host: '127.0.0.1', port: 55434, database, user: 'p03_preparacion',
    password: secrets.admin, connectionTimeoutMillis: 5000,
  });
  try {
    await admin.connect();
    const result = await admin.query('SELECT current_database() AS nombre');
    if (result.rows[0]?.nombre !== database) throw new Error('Base incorrecta: se rechaza preparación.');
    const role = await admin.query('SELECT rolname FROM pg_roles WHERE rolname=$1', ['p03_prueba']);
    if (!role.rowCount) {
      // Contraseña aleatoria hexadecimal validada; nunca proviene de texto SQL del usuario.
      await admin.query("CREATE ROLE p03_prueba LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + secrets.runtime + "'");
    }
    // No ALTER PASSWORD: si el rol existía, se comprueba la credencial conservada.
    await admin.query('GRANT CONNECT, CREATE ON DATABASE entrega_fiable_eventos_pedidos_test TO p03_prueba');
  } finally { await admin.end(); }
  const runtime = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await runtime.connect();
    const check = await runtime.query('SELECT current_database() AS nombre, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname=current_user');
    if (check.rows[0]?.nombre !== database || check.rows[0]?.rolsuper || check.rows[0]?.rolcreatedb || check.rows[0]?.rolcreaterole) throw new Error('Rol/base de ejecución no permitido.');
    console.log('PostgreSQL propio listo; rol ordinario comprobado.');
  } finally { await runtime.end(); }
  if (!existsSync('.env')) writeFileSync('.env', 'TEST_DATABASE_URL=' + connectionString + '\n', { flag: 'wx', mode: 0o600 });
  const imageId = docker(['inspect', '--format', '{{.Image}}', container], true);
  const digest = docker(['image', 'inspect', '--format', '{{json .RepoDigests}}', imageId], true);
  writeFileSync('.local/postgres-image.json', JSON.stringify({ image: 'postgres:18.7-bookworm', imageId, digest }, null, 2) + '\n');
  console.log('Credenciales privadas conservadas en .local y .env; no se imprimen.');
}
main().catch(() => { console.error('Preparación no completada. Revise Docker, el puerto y los recursos propios; no se han restablecido credenciales ni datos.'); process.exitCode = 1; });
