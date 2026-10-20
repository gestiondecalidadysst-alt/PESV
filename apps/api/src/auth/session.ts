import { jwtVerify, SignJWT } from 'jose';
import type { CookieOptions } from 'express';
import { config } from '../config.js';

export const COOKIE_SESION = 'pesv_sesion';
const secreto = new TextEncoder().encode(config.sessionSecret);

/** La sesión guarda el instante exacto de emisión (ms) para invalidarla al cambiar la contraseña. */
export async function firmarSesion(usuarioId: string): Promise<string> {
  return new SignJWT({ ems: Date.now() })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionHours}h`)
    .setIssuer('pesv')
    .sign(secreto);
}

/** Devuelve el usuario y el instante (ms) en que se firmó la sesión, o null si no es válida. */
export async function verificarSesion(token: string): Promise<{ usuarioId: string; emitidaMs: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secreto, { issuer: 'pesv', algorithms: ['HS256'] });
    const emitidaMs = typeof payload.ems === 'number' ? payload.ems : (payload.iat ?? 0) * 1000;
    return payload.sub ? { usuarioId: payload.sub, emitidaMs } : null;
  } catch {
    return null;
  }
}

export const opcionesCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
  maxAge: config.sessionHours * 3600 * 1000,
};
