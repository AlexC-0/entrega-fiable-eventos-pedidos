import {validateTokens} from '../dist/http/auth.js';
import {canonicalUuid} from '../dist/http/validation.js';
import {parseListQuery} from '../dist/http/list-query.js';
try {
 validateTokens({recepcion:process.env.RECEPCION_TOKEN??'',consulta:process.env.CONSULTA_TOKEN??''});
 const [command,...args]=process.argv.slice(2);
 let path;
 if(command==='listar'){
  if(args.length>1)throw new Error();
  const query=args[0]??'';
  parseListQuery('/eventos'+(query?'?'+query:''));
  path='/eventos'+(query?'?'+query:'');
 }else if(['evento','intentos'].includes(command)&&args.length===1&&canonicalUuid(args[0])){
  path='/eventos/'+args[0]+(command==='intentos'?'/intentos':'');
 }else throw new Error();
 const port=process.env.PORT??'3003';
 if(!/^[0-9]{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error();
 const response=await fetch('http://127.0.0.1:'+port+path,{headers:{Authorization:'Bearer '+process.env.CONSULTA_TOKEN},redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!response.ok){console.error('Consulta rechazada. HTTP '+response.status);process.exitCode=1;}
 else console.log(JSON.stringify(await response.json(),null,2));
}catch{console.error('No se completó la consulta. Use listar [consulta], evento UUID o intentos UUID; compruebe API y configuración privada.');process.exitCode=1;}
