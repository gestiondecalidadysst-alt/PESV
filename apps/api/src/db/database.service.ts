import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;
export type TenantTx = Parameters<Parameters<Db['transaction']>[0]>[0];

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  readonly db: Db = drizzle(this.pool, { schema });

  /**
   * Ejecuta `fn` dentro de una transacción con la organización activa fijada, de modo que las
   * políticas RLS de PostgreSQL solo dejen ver y escribir datos de esa organización.
   */
  async withTenant<T>(organizationId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_org', ${organizationId}, true)`);
      return fn(tx);
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
