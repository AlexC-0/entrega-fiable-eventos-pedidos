import {readFileSync} from 'node:fs';
import pg from 'pg';
import {databaseUrl,RECEIVER_DATABASE} from '../dist/worker/config.js';
import {canonicalUuid} from '../dist/http/validation.js';
import {ReceiverStore} from '../dist/receiver/store.js';
try{
 const eventId=process.argv[2]??JSON.parse(readFileSync(new URL('../.local/demo-evento.json',import.meta.url),'utf8')).eventoId;
 if(!canonicalUuid(eventId))throw new Error('Identidad inválida');
 const pool=new pg.Pool({connectionString:databaseUrl(process.env.RECEPTOR_DATABASE_URL,RECEIVER_DATABASE,'p03_receptor'),connectionTimeoutMillis:3000,statement_timeout:5000});
 try{
  await new ReceiverStore(pool,'p03_receptor',RECEIVER_DATABASE).ready();
  const result=await pool.query('SELECT evento_id AS "eventoId",pedido_id AS "pedidoId",creada_en AS "preparadoEn" FROM p03_receptor.preparacion WHERE evento_id=$1',[eventId]);
  console.log(JSON.stringify({eventoId:eventId,preparaciones:result.rowCount,preparacion:result.rows[0]??null},null,2));
 }finally{await pool.end();}
}catch{console.error('No se pudo consultar la preparación ficticia. Revise identidad y configuración local.');process.exitCode=1;}
