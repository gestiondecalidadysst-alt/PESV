import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tienePermiso, type Permiso } from '@pesv/shared';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { memberships } from '../db/schema.js';
import { AuthService } from './auth.service.js';
import {
  ADMIN_PLATAFORMA,
  PERMISO,
  PUBLICO,
  type RequestConSesion,
} from './decorators.js';
import { COOKIE_SESION, verificarSesion } from './session.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guardia global:
 * 1. Exige sesión válida salvo en rutas @Publico().
 * 2. En rutas con @Permiso(), valida la organización activa, la membresía y el permiso del rol.
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, objetivos)) return true;

    const req = ctx.switchToHttp().getRequest<RequestConSesion>();
    const bearer = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (bearer?.startsWith('pesv_')) return this.porTokenApi(req, bearer, objetivos);
    const token =
      (req.cookies?.[COOKIE_SESION] as string | undefined) ??
      req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const usuarioId = token ? await verificarSesion(token) : null;
    const usuario = usuarioId ? await this.auth.usuarioPorId(usuarioId) : null;
    if (!usuario) throw new UnauthorizedException('Tu sesión terminó. Ingresa de nuevo.');
    req.usuario = usuario;

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_PLATAFORMA, objetivos) && !usuario.esAdminPlataforma) {
      throw new ForbiddenException('Solo los administradores de la plataforma pueden hacer esto');
    }

    const permiso = this.reflector.getAllAndOverride<Permiso | '*' | undefined>(PERMISO, objetivos);
    if (!permiso) return true;

    // La consulta ?org= permite descargas desde enlaces, donde no se pueden enviar encabezados.
    const orgId = (req.header('x-organization-id') ?? (typeof req.query.org === 'string' ? req.query.org : undefined))?.toLowerCase();
    if (!orgId || !UUID.test(orgId)) {
      throw new BadRequestException('Elige una organización (encabezado x-organization-id)');
    }
    const roles = await this.database.withTenant(orgId, async (tx) =>
      (
        await tx
          .select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, usuario.id)))
      ).map((r) => r.role),
    );
    if (roles.length === 0) throw new ForbiddenException('No perteneces a esta organización');
    if (permiso !== '*' && !tienePermiso(roles, permiso)) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta acción');
    }
    req.org = { id: orgId, roles };
    return true;
  }

  /** Acceso con token de API (n8n u otros sistemas): la organización la fija el token (RN-31). */
  private async porTokenApi(req: RequestConSesion, token: string, objetivos: Parameters<Reflector['getAllAndOverride']>[1]) {
    const hash = createHash('sha256').update(token).digest('hex');
    const { rows } = await this.database.db.execute<{ token_id: string; organization_id: string; scopes: string[]; created_by: string | null }>(
      sql`select * from api_token_lookup(${hash})`,
    );
    const fila = rows[0];
    if (!fila) throw new UnauthorizedException('Token de API inválido o revocado');
    const permiso = this.reflector.getAllAndOverride<Permiso | '*' | undefined>(PERMISO, objetivos);
    const permitidos = new Set(fila.scopes.flatMap((s) => PERMISOS_POR_ALCANCE[s] ?? []));
    if (!permiso || (permiso !== '*' && !permitidos.has(permiso))) {
      throw new ForbiddenException('El token no tiene permiso para esta acción');
    }
    const cabecera = req.header('x-organization-id')?.toLowerCase();
    if (cabecera && cabecera !== fila.organization_id) {
      throw new ForbiddenException('El token pertenece a otra organización');
    }
    req.usuario = { id: fila.created_by ?? '', email: '', nombre: 'Token de API', esAdminPlataforma: false };
    req.org = { id: fila.organization_id, roles: [] };
    return true;
  }
}

const PERMISOS_POR_ALCANCE: Record<string, Permiso[]> = {
  leer: ['ver'],
  crear_novedades: ['inspeccionar', 'gestionar_siniestros'],
  reportes: ['ver'],
};
