import { VIGENCIA_ENLACE_MINUTOS } from '@pesv/shared';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import type { DatabaseService, TenantTx } from '../db/database.service.js';

type Proposito = keyof typeof VIGENCIA_ENLACE_MINUTOS;

/** La conexión o una transacción abierta (para ver un usuario recién creado en la misma transacción). */
type Ejecutor = DatabaseService['db'] | TenantTx;

export const hashEnlace = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Crea un enlace de un solo uso para restablecer o crear la contraseña. Solo se guarda el hash;
 * el token viaja únicamente en el correo. Devuelve null si el correo no existe o si se pidieron
 * demasiados enlaces seguidos.
 */
export async function crearEnlace(db: Ejecutor, email: string, proposito: Proposito) {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await db.execute<{ user_id: string; email: string; full_name: string }>(
    sql`select * from auth_create_password_token(${email}, ${hashEnlace(token)}, ${proposito}, ${VIGENCIA_ENLACE_MINUTOS[proposito]})`,
  );
  const u = rows[0];
  if (!u) return null;
  return { url: `${config.webUrl}/restablecer?token=${token}`, usuarioId: u.user_id, email: u.email, nombre: u.full_name };
}
