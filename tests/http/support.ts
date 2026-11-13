import { request } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { startServer } from '../../src/server/runtime.js';
import { withFixture, DATABASE, requiredUrl } from '../core/support.js';
import type { Fixture } from '../core/support.js';
import type { SafeLog } from '../../src/http/errors.js';
export type Runtime = Awaited<ReturnType<typeof startServer>>;
export const tokens = { recepcion: randomBytes(32).toString('hex'), consulta: randomBytes(32).toString('hex') };
export function envelope() {
  return { eventoId: randomUUID(), tipo: 'pedido.confirmado', version: 1,
    ocurridoEn: '2026-11-13T10:00:00.000Z',
    datos: { pedidoId: 'PED-'+randomUUID(), lineas: [{ sku: 'ART-DEMO-001', cantidad: 2 }] } };
}
export async function runtime(f: Fixture, log: SafeLog = () => {}, databaseUrl = requiredUrl(), schema = f.schema) {
  return startServer({ databaseUrl, database: DATABASE, schema, port: 0, tokens },log);
}
export async function withHttp(action: (f: Fixture, api: Runtime, logs: Parameters<SafeLog>[0][]) => Promise<void>) {
  return withFixture(async f => {
    const logs: Parameters<SafeLog>[0][] = [];
    const api = await runtime(f,entry=>logs.push(entry));
    try { await action(f,api,logs); } finally { await api.close(); }
  });
}
export function call(port: number, method: string, path: string, options: {
  body?: unknown; raw?: Buffer | string; token?: string | null; headers?: Record<string,string>; chunked?: boolean;
} = {}): Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: any; raw: string }> {
  const data = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const token = options.token === undefined ? (method === 'POST' ? tokens.recepcion : tokens.consulta) : options.token;
  const headers: Record<string,string> = { ...(data === undefined ? {} : { 'Content-Type':'application/json' }),
    ...(token ? { Authorization:'Bearer '+token } : {}), ...options.headers };
  if (data !== undefined && !options.chunked) headers['Content-Length'] = String(Buffer.byteLength(data));
  return new Promise((resolve,reject) => {
    const req = request({ hostname:'127.0.0.1', port, method, path, headers, agent:false },res => {
      const chunks: Buffer[]=[];
      res.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      res.on('error',reject);
      res.on('end',() => {
        const raw=Buffer.concat(chunks).toString('utf8');
        try { resolve({ status:res.statusCode!,headers:res.headers,body:JSON.parse(raw),raw }); } catch { reject(new Error('Respuesta no JSON')); }
      });
    });
    req.on('error',reject);
    req.setTimeout(12000,()=>req.destroy(new Error('Timeout HTTP de prueba')));
    if(data !== undefined) req.write(data);
    req.end();
  });
}
