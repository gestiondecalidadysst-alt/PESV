import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ingresoSchema, registroSchema, type IngresoInput, type RegistroInput } from '@pesv/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Publico, UsuarioActual, type UsuarioSesion } from './decorators.js';
import { COOKIE_SESION, opcionesCookie } from './session.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('registro')
  async registro(
    @Body(new ZodValidationPipe(registroSchema)) body: RegistroInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, organizacionId, resultado } = await this.auth.registrar(body);
    res.cookie(COOKIE_SESION, token, opcionesCookie);
    return { organizacionId, resultado };
  }

  @Publico()
  @Post('ingresar')
  @HttpCode(200)
  async ingresar(
    @Body(new ZodValidationPipe(ingresoSchema)) body: IngresoInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, usuario } = await this.auth.ingresar(body);
    res.cookie(COOKIE_SESION, token, opcionesCookie);
    return { usuario, organizaciones: await this.auth.membresias(usuario.id) };
  }

  @Publico()
  @Post('salir')
  @HttpCode(204)
  salir(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_SESION, { ...opcionesCookie, maxAge: undefined });
  }

  @Get('yo')
  async yo(@UsuarioActual() usuario: UsuarioSesion) {
    return { usuario, organizaciones: await this.auth.membresias(usuario.id) };
  }
}
