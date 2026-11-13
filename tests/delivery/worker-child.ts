import pg from 'pg';
import {requiredUrl,assertDatabase,DATABASE} from '../core/support.js';
import {runWorker} from '../../src/worker/loop.js';
const pool=new pg.Pool({connectionString:requiredUrl(),connectionTimeoutMillis:3000,statement_timeout:5000,application_name:'p03_delivery_test'});
pool.on('error',()=>{});
const controller=new AbortController();
process.on('message',()=>controller.abort());
try {
 await assertDatabase(pool);
 const mode=process.argv[4];
 const pause=async(phase:string)=>{
  process.send?.({phase});
  await new Promise<void>(()=>{});
 };
 process.send?.({phase:'started'});
 await runWorker({pool,schema:process.argv[2]!,database:DATABASE,target:process.argv[3]!,token:process.env.ENTREGA_TOKEN!,
  policy:{reservaMs:1000,baseReintentoMs:20},pollMs:30,timeoutMs:500,
  hooks:mode==='reserve'?{afterReserve:()=>pause('reserved')}:mode==='effect'?{beforeFinalize:()=>pause('effect')}:{}},controller.signal);
} catch {process.exitCode=1;}
finally{await pool.end();process.disconnect?.();}
