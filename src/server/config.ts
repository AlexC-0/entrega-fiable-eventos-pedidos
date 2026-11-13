import { validateTokens } from '../http/auth.js';
import type { Tokens } from '../http/auth.js';
export const DEVELOPMENT_DATABASE = 'entrega_fiable_eventos_pedidos';
export interface Config { databaseUrl: string; database: string; schema: string; port: number; tokens: Tokens }
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const tokens = { recepcion: env.RECEPCION_TOKEN ?? '', consulta: env.CONSULTA_TOKEN ?? '' };
  validateTokens(tokens);
  const databaseUrl = env.DATABASE_URL ?? '';
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL no válida.'); }
  if (!['postgres:','postgresql:'].includes(parsed.protocol)
    || parsed.hostname !== '127.0.0.1' || parsed.port !== '55434'
    || parsed.pathname !== '/' + DEVELOPMENT_DATABASE || parsed.username !== 'p03_api'
    || !parsed.password || parsed.search || parsed.hash) throw new Error('DATABASE_URL no apunta al desarrollo propio.');
  const portValue = env.PORT ?? '3003';
  if (!/^[0-9]{1,5}$/.test(portValue) || Number(portValue)<1 || Number(portValue)>65535) throw new Error('PORT no válido.');
  return { databaseUrl, database: DEVELOPMENT_DATABASE, schema: 'p03_app', port: Number(portValue), tokens };
}
