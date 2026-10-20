import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import {
  cambiarClaveSchema,
  ingresoSchema,
  recuperarSchema,
  registroSchema,
  restablecerSchema,
  type CambiarClaveInput,
  type IngresoInput,
  type RecuperarInput,
  type RegistroInput,
  type RestablecerInput,
} from '@pesv/shared';
import type { Request, Response } from 'express';
import { Limitador } from '../common/limitador.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Publico, UsuarioActual, type UsuarioSesion } from './decorators.js';
import { COOKIE_SESION, opcionesCookie } from './session.js';

/** Intentos por IP: ingreso 10 cada 15 minutos; recuperación y restablecimiento 5 cada 15 minutos. */
const limiteIngreso = new Limitador(10, 15 * 60_000);
const limiteRecuperacion = new Limitador(5, 15 * 60_000);

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('registro')
  async registro(@Body(new ZodValidationPipe(registroSchema)) body: RegistroInput, @Res({ passthrough: true }) res: Response) {
    const { token, organizacionId, resultado } = await this.auth.registrar(body);
    res.cookie(COOKIE_SESION, token, opcionesCookie);
    return { organizacionId, resultado };
  }

  @Publico()
  @Post('ingresar')
  @HttpCode(200)
  async ingresar(@Body(new ZodValidationPipe(ingresoSchema)) body: IngresoInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    limiteIngreso.verificar(`${req.ip}:${body.email}`);
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

  /** Siempre responde lo mismo, exista o no la cuenta, para no revelar qué correos están registrados. */
  @Publico()
  @Post('recuperar')
  @HttpCode(200)
  async recuperar(@Body(new ZodValidationPipe(recuperarSchema)) body: RecuperarInput, @Req() req: Request) {
    limiteRecuperacion.verificar(`recuperar:${req.ip}`);
    await this.auth.recuperar(body.email);
    return { mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de spam.' };
  }

  @Publico()
  @Get('enlace')
  enlace(@Query('token') token: string | undefined) {
    return this.auth.verificarEnlace(token ?? '');
  }

  @Publico()
  @Post('restablecer')
  @HttpCode(200)
  async restablecer(@Body(new ZodValidationPipe(restablecerSchema)) body: RestablecerInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    limiteRecuperacion.verificar(`restablecer:${req.ip}`);
    const { token, usuario } = await this.auth.restablecer(body.token, body.password);
    res.cookie(COOKIE_SESION, token, opcionesCookie);
    return { usuario, organizaciones: await this.auth.membresias(usuario.id) };
  }

  @Post('cambiar-clave')
  @HttpCode(200)
  async cambiarClave(@Body(new ZodValidationPipe(cambiarClaveSchema)) body: CambiarClaveInput, @UsuarioActual() usuario: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    limiteIngreso.verificar(`cambiar:${usuario.id}`);
    const { token } = await this.auth.cambiarClave(usuario, body);
    res.cookie(COOKIE_SESION, token, opcionesCookie);
    return { mensaje: 'Contraseña actualizada. Se cerraron las sesiones en otros dispositivos.' };
  }

  @Post('cerrar-sesiones')
  @HttpCode(200)
  async cerrarSesiones(@UsuarioActual() usuario: UsuarioSesion, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.auth.cerrarSesiones(usuario);
    res.cookie(COOKIE_SESION, token, opcionesCookie);
    return { mensaje: 'Se cerraron las sesiones en los demás dispositivos.' };
  }
}
