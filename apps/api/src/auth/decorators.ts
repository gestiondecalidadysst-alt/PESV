import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permiso as TipoPermiso } from '@pesv/shared';
import type { Request } from 'express';

export const PUBLICO = 'pesv:publico';
export const PERMISO = 'pesv:permiso';
export const ADMIN_PLATAFORMA = 'pesv:admin-plataforma';

/** La ruta no requiere sesión. */
export const Publico = () => SetMetadata(PUBLICO, true);

/**
 * La ruta trabaja sobre la organización activa (encabezado `x-organization-id`): exige que el
 * usuario sea miembro y que alguno de sus roles tenga el permiso indicado.
 */
export const Permiso = (permiso: TipoPermiso) => SetMetadata(PERMISO, permiso);

/** La ruta trabaja sobre la organización activa y basta con ser miembro (cualquier rol). */
export const Miembro = () => SetMetadata(PERMISO, '*');

/** Solo para administradores de la plataforma (planes, límites, organizaciones). */
export const AdminPlataforma = () => SetMetadata(ADMIN_PLATAFORMA, true);

export interface UsuarioSesion {
  id: string;
  email: string;
  nombre: string;
  esAdminPlataforma: boolean;
}

export interface OrgSesion {
  id: string;
  roles: string[];
}

export type RequestConSesion = Request & { usuario?: UsuarioSesion; org?: OrgSesion };

export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RequestConSesion>().usuario!,
);

export const OrgActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<RequestConSesion>().org!,
);
