import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type Nivel = 'info' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/**
 * Registro en JSON, una línea por evento, para leerlo con `docker compose logs` o enviarlo a
 * cualquier herramienta de registros. Campos: fecha, nivel, contexto, mensaje y, en errores, pila.
 */
export class RegistroJson implements LoggerService {
  private escribir(nivel: Nivel, mensaje: unknown, extra: unknown[]) {
    const contexto = typeof extra.at(-1) === 'string' ? (extra.at(-1) as string) : undefined;
    const pila = nivel === 'error' && typeof extra[0] === 'string' && extra.length > 1 ? extra[0] : undefined;
    const linea = JSON.stringify({
      fecha: new Date().toISOString(),
      nivel,
      contexto,
      mensaje: typeof mensaje === 'string' ? mensaje : mensaje instanceof Error ? mensaje.message : mensaje,
      ...(pila ? { pila } : {}),
    });
    (nivel === 'error' || nivel === 'fatal' ? process.stderr : process.stdout).write(`${linea}\n`);
  }
  log(m: unknown, ...e: unknown[]) {
    this.escribir('info', m, e);
  }
  error(m: unknown, ...e: unknown[]) {
    this.escribir('error', m, e);
  }
  warn(m: unknown, ...e: unknown[]) {
    this.escribir('warn', m, e);
  }
  debug(m: unknown, ...e: unknown[]) {
    this.escribir('debug', m, e);
  }
  verbose(m: unknown, ...e: unknown[]) {
    this.escribir('verbose', m, e);
  }
  fatal(m: unknown, ...e: unknown[]) {
    this.escribir('fatal', m, e);
  }
}

const ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Asigna un código a cada solicitud (o respeta el que llega en x-request-id desde el proxy), lo
 * devuelve en la respuesta y, con registro JSON, escribe una línea por solicitud con su duración.
 */
export function idDeSolicitud(registrarSolicitudes: boolean) {
  return (req: Request & { idSolicitud?: string }, res: Response, next: NextFunction) => {
    const recibido = req.header('x-request-id');
    const id = recibido && ID_VALIDO.test(recibido) ? recibido : randomUUID();
    req.idSolicitud = id;
    res.setHeader('x-request-id', id);
    if (registrarSolicitudes && req.path !== '/api/health') {
      const inicio = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
        process.stdout.write(
          `${JSON.stringify({ fecha: new Date().toISOString(), nivel: res.statusCode >= 500 ? 'error' : 'info', contexto: 'HTTP', metodo: req.method, ruta: req.path, estado: res.statusCode, ms: Math.round(ms), idSolicitud: id })}\n`,
        );
      });
    }
    next();
  };
}
