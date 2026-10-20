import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { FuncionPlan } from '@pesv/shared';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import type { TenantTx } from '../db/database.service.js';
import { drivers, memberships, plans, subscriptions, vehicles } from '../db/schema.js';

/** Suscripción vigente con su plan. Sin fila o sin plan = sin restricciones (plataforma sin configurar). */
export async function suscripcionDe(tx: TenantTx, orgId: string) {
  const [fila] = await tx
    .select({ s: subscriptions, p: plans })
    .from(subscriptions)
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organizationId, orgId));
  return { estado: (fila?.s.status ?? 'prueba') as 'prueba' | 'activa' | 'mora' | 'cancelada', suscripcion: fila?.s ?? null, plan: fila?.p ?? null };
}

/** RN-27: con mora o cancelada la cuenta queda en solo lectura; leer y descargar evidencias sigue funcionando. */
export const esSoloLectura = (estado: string) => estado === 'mora' || estado === 'cancelada';

export class SoloLecturaException extends HttpException {
  constructor() {
    super(
      { statusCode: HttpStatus.PAYMENT_REQUIRED, message: 'La cuenta está en solo lectura por un pago pendiente. Puedes consultar y descargar tu información.' },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Una función del plan (IA, n8n, telemática…) está disponible si no hay plan o si el plan la incluye. */
export function funcionDisponible(plan: { features: string[] } | null, funcion: FuncionPlan) {
  return !plan || plan.features.includes(funcion);
}

export type RecursoLimitado = 'vehiculos' | 'conductores' | 'usuarios';
const NOMBRE_RECURSO: Record<RecursoLimitado, string> = { vehiculos: 'vehículos', conductores: 'conductores activos', usuarios: 'usuarios' };

/** Valida el límite del plan antes de crear un vehículo, conductor o usuario (RN-26). */
export async function verificarLimite(tx: TenantTx, orgId: string, recurso: RecursoLimitado) {
  const { plan } = await suscripcionDe(tx, orgId);
  const maximo = !plan ? null : recurso === 'vehiculos' ? plan.maxVehicles : recurso === 'conductores' ? plan.maxDrivers : plan.maxUsers;
  if (!maximo) return;
  const [{ n } = { n: 0 }] =
    recurso === 'vehiculos'
      ? await tx.select({ n: count() }).from(vehicles).where(and(eq(vehicles.organizationId, orgId), ne(vehicles.status, 'inactivo')))
      : recurso === 'conductores'
        ? await tx.select({ n: count() }).from(drivers).where(and(eq(drivers.organizationId, orgId), eq(drivers.active, true)))
        : await tx.select({ n: sql<number>`count(distinct ${memberships.userId})::int` }).from(memberships).where(eq(memberships.organizationId, orgId));
  if (n >= maximo) {
    throw new ForbiddenException(`Tu plan ${plan!.name} permite hasta ${maximo} ${NOMBRE_RECURSO[recurso]}. Pide a la plataforma un cambio de plan.`);
  }
}

/**
 * Suscripción inicial al crear la organización: el plan marcado por defecto (si existe) en
 * periodo de prueba. Si la plataforma aún no tiene planes, queda en prueba sin plan.
 */
export async function suscripcionInicial(tx: TenantTx, orgId: string, hoy = new Date()) {
  const [porDefecto] = await tx.select().from(plans).where(and(eq(plans.isDefault, true), eq(plans.active, true)));
  const finPrueba = porDefecto?.trialDays ? new Date(hoy.getTime() + porDefecto.trialDays * 86_400_000).toISOString().slice(0, 10) : null;
  await tx.insert(subscriptions).values({ organizationId: orgId, planId: porDefecto?.id ?? null, status: 'prueba', trialEndsOn: finPrueba });
}
