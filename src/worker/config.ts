import { validateTokens } from '../http/auth.js';
export const RECEIVER_DATABASE='entrega_fiable_eventos_pedidos_receptor';
export function deliveryToken(env:NodeJS.ProcessEnv):string {
  const token=env.ENTREGA_TOKEN ?? '';
  validateTokens({recepcion:token,consulta:env.RECEPCION_TOKEN ?? ''});
  validateTokens({recepcion:token,consulta:env.CONSULTA_TOKEN ?? ''});
  return token;
}
export function destination(value:string):string {
  const match=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/eventos$/.exec(value);
  if(!match || match[0]!==value || Number(match[1])>65535) throw new Error('Destino local inválido');
  return value;
}
export function databaseUrl(value:string|undefined,database:string,role:string):string {
  let parsed:URL;
  try { parsed=new URL(value ?? ''); } catch { throw new Error('URL de base inválida'); }
  if(!['postgres:','postgresql:'].includes(parsed.protocol) || parsed.hostname!=='127.0.0.1'
    || parsed.port!=='55434' || parsed.pathname!=='/'+database || parsed.username!==role
    || !parsed.password || parsed.search || parsed.hash) throw new Error('Base o rol incorrectos');
  return value!;
}
export function receiverPort(env:NodeJS.ProcessEnv):number {
  const value=env.RECEPTOR_PORT ?? '3004';
  if(!/^[1-9][0-9]{0,4}$/.test(value) || Number(value)>65535) throw new Error('Puerto receptor inválido');
  return Number(value);
}
