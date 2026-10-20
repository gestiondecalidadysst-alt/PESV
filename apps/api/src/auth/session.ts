import { jwtVerify, SignJWT } from 'jose';
import type { CookieOptions } from 'express';
import { config } from '../config.js';

export const COOKIE_SESION = 'pesv_sesion';
const secreto = new TextEncoder().encode(config.sessionSecret);

export async function firmarSesion(usuarioId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionHours}h`)
    .setIssuer('pesv')
    .sign(secreto);
}

export async function verificarSesion(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secreto, { issuer: 'pesv', algorithms: ['HS256'] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export const opcionesCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.produccion,
  path: '/',
  maxAge: config.sessionHours * 3600 * 1000,
};
