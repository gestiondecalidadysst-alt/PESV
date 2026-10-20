import type { TenantTx } from '../db/database.service.js';
import { auditLog } from '../db/schema.js';

/** Registra un evento en la bitácora de auditoría de la organización (solo inserción, RN-28). */
export async function auditar(
  tx: TenantTx,
  evento: {
    organizacionId: string;
    actorId?: string | null;
    accion: string;
    entidad: string;
    entidadId?: string | null;
    datos?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLog).values({
    organizationId: evento.organizacionId,
    actorId: evento.actorId ?? null,
    action: evento.accion,
    entity: evento.entidad,
    entityId: evento.entidadId ?? null,
    data: evento.datos ?? {},
  });
}

export const CODIGO_VIOLACION_UNICA = '23505';

/** true si el error de PostgreSQL (directo o envuelto por Drizzle) es de restricción única. */
export function esViolacionUnica(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === CODIGO_VIOLACION_UNICA || e?.cause?.code === CODIGO_VIOLACION_UNICA;
}
