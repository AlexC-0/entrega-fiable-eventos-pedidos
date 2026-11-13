import { pathToFileURL } from 'node:url';
import { readConfig } from './config.js';
import { startServer } from './runtime.js';

export async function main(): Promise<void> {
  const runtime = await startServer(readConfig(process.env));
  console.log('API disponible en http://127.0.0.1:' + runtime.port);
  const shutdown = () => {
    void runtime.close().then(() => {
      process.off('SIGINT',shutdown); process.off('SIGTERM',shutdown);
    }).catch(() => { console.error('No se completó el cierre de la API.'); process.exitCode = 1; });
  };
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('No se pudo iniciar la API. Revise configuración privada, puerto y credenciales.'); process.exitCode = 1; });
}
