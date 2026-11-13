import type { Pool } from 'pg';
import type { Evento } from '../queue/types.js';
import { ConflictoEvento } from '../queue/types.js';
import { schemaName, transaction } from '../persistence/transaction.js';
import { verifyMigrations } from '../persistence/migrate.js';
import { receiverMigrations } from './migrations.js';
import { checkDatabase, checkPrivileges } from '../worker/readiness.js';

export class ReceiverStore {
  private readonly name: string;
  constructor(private readonly pool: Pool, private readonly schema: string, private readonly database: string) { this.name=schemaName(schema); }
  async ready(): Promise<void> {
    await checkDatabase(this.pool,this.database);
    await verifyMigrations(this.pool,this.schema,receiverMigrations);
    await checkPrivileges(this.pool,this.schema,[['procesado','SELECT,INSERT'],['preparacion','SELECT,INSERT']]);
  }
  async apply(event: Evento): Promise<'aplicado'|'ya_aplicado'> {
    return transaction(this.pool,async client=>{
      const inserted=await client.query(`INSERT INTO ${this.name}.procesado(evento_id,pedido_id,contenido)
        VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING evento_id`,[event.eventoId,event.pedidoId,JSON.stringify(event.contenido)]);
      if(!inserted.rowCount) {
        const existing=await client.query(`SELECT pedido_id=$2 AND contenido=$3::jsonb AS igual
          FROM ${this.name}.procesado WHERE evento_id=$1`,[event.eventoId,event.pedidoId,JSON.stringify(event.contenido)]);
        if(existing.rows[0]?.igual) return 'ya_aplicado';
        throw new ConflictoEvento(existing.rowCount?'identidad_reutilizada':'pedido_ya_confirmado');
      }
      await client.query(`INSERT INTO ${this.name}.preparacion(evento_id,pedido_id) VALUES($1,$2)`,[event.eventoId,event.pedidoId]);
      return 'aplicado';
    });
  }
}
