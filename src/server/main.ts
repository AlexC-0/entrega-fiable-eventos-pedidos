import {pathToFileURL} from 'node:url';
import {readConfig} from './config.js';
import {startServer} from './runtime.js';
import {installShutdown} from './shutdown.js';
export async function main():Promise<void> {
  const runtime=await startServer(readConfig(process.env));
  console.log('API disponible en http://127.0.0.1:'+runtime.port);
  installShutdown(runtime.close);
  process.send?.({phase:'ready'});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 main().catch(()=>{console.error('No se pudo iniciar la API. Revise configuración privada, puerto y credenciales.');process.exitCode=1;});
}
