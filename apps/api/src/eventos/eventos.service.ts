import { createHmac, randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { decrypt } from '../common/crypto.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { eventOutbox, webhookDeliveries, webhookEndpoints } from '../db/schema.js';

export const MAX_INTENTOS = 5;

/** Firma HMAC-SHA256 de `<timestamp>.<cuerpo>`, como la verifica el flujo de n8n. */
export function firmar(secreto: string, timestamp: string, cuerpo: string): string {
  return createHmac('sha256', secreto).update(`${timestamp}.${cuerpo}`).digest('hex');
}

/**
 * Bandeja de salida de eventos. Cada evento se guarda en la misma transacción que lo originó y
 * se programa una entrega por cada destino suscrito. Un despachador envía las entregas firmadas
 * y reintenta hasta 5 veces con espera creciente (RN-30).
 */
@Injectable()
export class EventosService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Eventos');
  private temporizador?: NodeJS.Timeout;
  private despachando = false;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    if (process.env.DISABLE_WORKERS === 'true') return;
    this.temporizador = setInterval(() => void this.despachar().catch((e) => this.log.error(e)), 10_000);
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /** Registra un evento. Con `claveUnica`, un mismo aviso no se repite (p. ej. un vencimiento por día). */
  async emitir(tx: TenantTx, orgId: string, tipo: string, datos: Record<string, unknown>, claveUnica?: string) {
    const [evento] = await tx
      .insert(eventOutbox)
      .values({ id: randomUUID(), organizationId: orgId, eventType: tipo, payload: datos, dedupKey: claveUnica ?? null })
      .onConflictDoNothing()
      .returning();
    if (!evento) return null;
    const destinos = await tx
      .select({ id: webhookEndpoints.id })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.organizationId, orgId),
          eq(webhookEndpoints.active, true),
          sql`(${tipo} = any(${webhookEndpoints.events}) or 'prueba' = ${tipo})`,
        ),
      );
    if (destinos.length) {
      await tx
        .insert(webhookDeliveries)
        .values(destinos.map((d) => ({ organizationId: orgId, endpointId: d.id, eventId: evento.id })));
    }
    return evento;
  }

  /** Emite fuera de una transacción existente. */
  async emitirAhora(orgId: string, tipo: string, datos: Record<string, unknown>, claveUnica?: string) {
    return this.database.withTenant(orgId, (tx) => this.emitir(tx, orgId, tipo, datos, claveUnica));
  }

  /** Envía las entregas vencidas de todas las organizaciones. Devuelve cuántas procesó. */
  async despachar(limite = 25): Promise<number> {
    if (this.despachando) return 0;
    this.despachando = true;
    try {
      const { rows } = await this.database.db.execute<{ delivery_id: string; organization_id: string }>(
        sql`select * from webhook_claim_due(${limite})`,
      );
      for (const r of rows) await this.entregar(r.organization_id, Number(r.delivery_id));
      return rows.length;
    } finally {
      this.despachando = false;
    }
  }

  private async entregar(orgId: string, entregaId: number) {
    const datos = await this.database.withTenant(orgId, async (tx) => {
      const [fila] = await tx
        .select({ entrega: webhookDeliveries, destino: webhookEndpoints, evento: eventOutbox })
        .from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .innerJoin(eventOutbox, eq(eventOutbox.id, webhookDeliveries.eventId))
        .where(eq(webhookDeliveries.id, entregaId));
      return fila;
    });
    if (!datos) return;
    const cuerpo = JSON.stringify({
      id: datos.evento.id,
      tipo: datos.evento.eventType,
      organizacionId: orgId,
      fecha: datos.evento.createdAt,
      datos: datos.evento.payload,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    let codigo: number | null = null;
    let respuesta = '';
    try {
      const res = await fetch(datos.destino.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pesv-evento': datos.evento.eventType,
          'x-pesv-entrega': String(entregaId),
          'x-pesv-timestamp': timestamp,
          'x-pesv-firma': `sha256=${firmar(decrypt(datos.destino.secretEncrypted), timestamp, cuerpo)}`,
        },
        body: cuerpo,
        signal: AbortSignal.timeout(10_000),
      });
      codigo = res.status;
      respuesta = (await res.text()).slice(0, 500);
    } catch (err) {
      respuesta = `Sin respuesta: ${(err as Error).message}`.slice(0, 500);
    }
    const ok = codigo !== null && codigo >= 200 && codigo < 300;
    const intentos = datos.entrega.attempts + 1;
    const estado = ok ? 'entregado' : intentos >= MAX_INTENTOS ? 'fallido' : 'reintentando';
    await this.database.withTenant(orgId, (tx) =>
      tx
        .update(webhookDeliveries)
        .set({
          status: estado,
          attempts: intentos,
          responseCode: codigo,
          responseBody: respuesta,
          // Espera creciente: 1, 2, 4 y 8 minutos.
          nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** (intentos - 1)),
          updatedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, entregaId)),
    );
  }
}
