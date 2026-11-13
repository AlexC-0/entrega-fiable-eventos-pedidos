import pg from 'pg';
import {requiredUrl,assertDatabase,DATABASE} from '../core/support.js';
import {ReceiverStore} from '../../src/receiver/store.js';
import {createReceiverApp} from '../../src/receiver/app.js';
import {listen} from '../../src/server/listen.js';
const pool=new pg.Pool({connectionString:requiredUrl(),connectionTimeoutMillis:3000,statement_timeout:5000,application_name:'p03_delivery_test'});
pool.on('error',()=>{});
try{
 await assertDatabase(pool);
 const store=new ReceiverStore(pool,process.argv[2]!,DATABASE);await store.ready();
 const api=await listen(createReceiverApp(store,process.env.ENTREGA_TOKEN!,()=>{}),pool,0);
 process.send?.({phase:'ready',port:api.port});
 process.once('message',()=>{void api.close().then(()=>process.disconnect()).catch(()=>{process.exitCode=1;process.disconnect();});});
}catch{if(!pool.ended)await pool.end();process.exitCode=1;process.disconnect?.();}
