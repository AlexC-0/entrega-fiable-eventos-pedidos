import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../dist/server/config.js';
try {
  const config=readConfig(process.env);
  const file=fileURLToPath(new URL('../.local/demo-evento.json',import.meta.url));
  if(!existsSync(file)) writeFileSync(file,JSON.stringify({
    eventoId:randomUUID(),tipo:'pedido.confirmado',version:1,ocurridoEn:new Date().toISOString(),
    datos:{pedidoId:'PED-DEMO-'+randomUUID(),lineas:[{sku:'ART-DEMO-001',cantidad:2}]},
  },null,2)+'\n',{flag:'wx'});
  const event=JSON.parse(readFileSync(file,'utf8'));
  const base='http://127.0.0.1:'+config.port;
  const response=await fetch(base+'/eventos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.tokens.recepcion},
    body:JSON.stringify(event),signal:AbortSignal.timeout(5000)});
  if(![200,202].includes(response.status)) throw new Error('Aceptación fallida');
  const accepted=await response.json();
  const query=await fetch(base+'/eventos/'+event.eventoId,{headers:{Authorization:'Bearer '+config.tokens.consulta},signal:AbortSignal.timeout(5000)});
  if(query.status!==200) throw new Error('Consulta fallida');
  const stored=await query.json();
  console.log(JSON.stringify({http:response.status,resultado:accepted.resultado,eventoId:accepted.eventoId,
    estado:stored.estado,intentos:stored.intentos},null,2));
} catch {
  console.error('Demostración no completada. Revise preparación, migración y API local. No se imprimen credenciales ni respuestas internas.');
  process.exitCode=1;
}
