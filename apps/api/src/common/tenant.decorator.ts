import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Organización activa de la petición.
 *
 * FASE 0: se toma del encabezado `x-organization-id`. En la Fase 1 se reemplaza por la sesión
 * autenticada (OIDC) y se verifica que el usuario sea miembro de esa organización.
 */
export const OrganizacionActiva = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const id = req.header('x-organization-id');
  if (!id || !UUID.test(id)) {
    throw new BadRequestException('Falta el encabezado x-organization-id con un UUID válido');
  }
  return id.toLowerCase();
});
