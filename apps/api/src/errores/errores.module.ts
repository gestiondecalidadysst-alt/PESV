import { Body, Controller, Get, Global, HttpCode, Module, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { errorWebSchema, type ErrorWebInput } from '@pesv/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminPlataforma, Publico } from '../auth/decorators.js';
import { COOKIE_SESION, verificarSesion } from '../auth/session.js';
import { Limitador } from '../common/limitador.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ErroresService } from './errores.service.js';
import { FiltroErrores } from './filtro.js';

export { ErroresService } from './errores.service.js';

const limiteWeb = new Limitador(30, 15 * 60_000);

@Controller()
export class ErroresController {
  constructor(private readonly errores: ErroresService) {}

  /** Errores del navegador (pantalla rota, promesas sin capturar). Público y con límite por IP. */
  @Publico()
  @Post('errores/web')
  @HttpCode(204)
  async web(@Body(new ZodValidationPipe(errorWebSchema)) body: ErrorWebInput, @Req() req: Request) {
    limiteWeb.verificar(`web:${req.ip}`);
    let ruta: string | null;
    try {
      ruta = body.url ? new URL(body.url).pathname : null;
    } catch {
      ruta = null;
    }
    // La ruta es pública (el error puede ocurrir sin sesión); si hay sesión se anota el usuario.
    const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE_SESION];
    const sesion = token ? await verificarSesion(token) : null;
    await this.errores.registrar({
      fuente: 'web',
      mensaje: body.mensaje,
      pila: body.pila,
      ruta,
      usuarioId: sesion?.usuarioId ?? null,
      agenteUsuario: req.header('user-agent') ?? null,
      contexto: body.componente ? { componente: body.componente.slice(0, 2000) } : {},
    });
  }

  @AdminPlataforma()
  @Get('plataforma/errores')
  grupos(@Query('estado') estado?: string) {
    return this.errores.grupos(estado);
  }

  @AdminPlataforma()
  @Get('plataforma/errores/:huella')
  ocurrencias(@Param('huella') huella: string) {
    return this.errores.ocurrencias(huella);
  }

  @AdminPlataforma()
  @Patch('plataforma/errores/:huella')
  estado(@Param('huella') huella: string, @Body(new ZodValidationPipe(z.object({ estado: z.enum(['abierto', 'resuelto', 'ignorado']) }))) body: { estado: 'abierto' | 'resuelto' | 'ignorado' }) {
    return this.errores.cambiarEstado(huella, body.estado);
  }
}

@Global()
@Module({
  controllers: [ErroresController],
  providers: [ErroresService, { provide: APP_FILTER, useClass: FiltroErrores }],
  exports: [ErroresService],
})
export class ErroresModule {}
