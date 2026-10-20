import { NOTIFICACIONES_POR_DEFECTO } from '@pesv/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { config } from '../config.js';
import type { TenantTx } from '../db/database.service.js';
import { emailOutbox, emailRules, memberships, organizations, users } from '../db/schema.js';
import { correoEvento } from './plantillas.js';

/** Reglas de notificación por defecto de una organización nueva. */
export async function reglasDeCorreoIniciales(tx: TenantTx, orgId: string) {
  const filas = Object.entries(NOTIFICACIONES_POR_DEFECTO).map(([evento, roles]) => ({ organizationId: orgId, eventType: evento, roles: roles ?? [] }));
  if (filas.length) await tx.insert(emailRules).values(filas).onConflictDoNothing();
}

/** Correos de los miembros con alguno de los roles indicados (sin repetir). */
export async function correosPorRoles(tx: TenantTx, orgId: string, roles: string[]) {
  if (!roles.length) return [];
  const filas = await tx
    .selectDistinct({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, orgId), inArray(memberships.role, roles)));
  return filas.map((f) => f.email);
}

/**
 * Encola los correos de un evento según las reglas de la organización. Corre en la misma
 * transacción que el evento: si el evento no se guarda, tampoco se envía el correo.
 */
export async function encolarNotificacionesDeEvento(
  tx: TenantTx,
  orgId: string,
  evento: { id: string; tipo: string; datos: Record<string, unknown> },
) {
  if (evento.tipo === 'prueba') return 0;
  const [regla] = await tx
    .select()
    .from(emailRules)
    .where(and(eq(emailRules.organizationId, orgId), eq(emailRules.eventType, evento.tipo), eq(emailRules.active, true)));
  if (!regla) return 0;
  const destinatarios = [...new Set([...(await correosPorRoles(tx, orgId, regla.roles)), ...regla.extraEmails].map((c) => c.toLowerCase()))];
  if (!destinatarios.length) return 0;
  const [org] = await tx.select({ nombre: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  const m = correoEvento(org?.nombre ?? 'tu organización', evento.tipo, evento.datos, config.webUrl, orgId);
  await tx.insert(emailOutbox).values(
    destinatarios.map((para) => ({ organizationId: orgId, eventId: evento.id, recipient: para, subject: m.asunto, html: m.html, bodyText: m.texto })),
  );
  return destinatarios.length;
}
