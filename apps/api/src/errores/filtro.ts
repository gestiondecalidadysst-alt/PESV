import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestConSesion } from '../auth/decorators.js';
import { ErroresService } from './errores.service.js';

export type RequestConId = RequestConSesion & { idSolicitud?: string };

/**
 * Filtro global: los errores esperados (400, 401, 403, 404, 422…) responden igual que siempre.
 * Los errores inesperados quedan en el registro de errores con su código de solicitud y la
 * persona recibe un mensaje claro con ese código, sin detalles internos.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  constructor(private readonly errores: ErroresService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestConId>();

    if (exception instanceof HttpException && exception.getStatus() < 500) {
      let cuerpo = exception.getResponse();
      // El analizador de JSON de Nest responde en inglés; se traduce.
      const mensaje = typeof cuerpo === 'object' && cuerpo !== null && 'message' in cuerpo ? (cuerpo as { message: unknown }).message : cuerpo;
      if (exception.getStatus() === 400 && (exception.cause instanceof SyntaxError || (typeof mensaje === 'string' && /JSON|Unexpected token|Expected property name/i.test(mensaje)))) {
        cuerpo = { statusCode: 400, message: 'El contenido enviado no es un JSON válido' };
      }
      if (!res.headersSent) res.status(exception.getStatus()).json(typeof cuerpo === 'string' ? { statusCode: exception.getStatus(), message: cuerpo } : cuerpo);
      return;
    }

    // Errores de Express o body-parser con su propio código 4xx (JSON mal formado, cuerpo muy grande).
    const deExpress = exception as { status?: unknown; expose?: unknown; message?: unknown };
    if (!(exception instanceof HttpException) && typeof deExpress.status === 'number' && deExpress.status >= 400 && deExpress.status < 500) {
      const mensaje =
        deExpress.status === 413 ? 'El contenido enviado es demasiado grande' : deExpress.status === 400 ? 'El contenido enviado no es válido' : String(deExpress.message ?? 'Solicitud no válida');
      if (!res.headersSent) res.status(deExpress.status).json({ statusCode: deExpress.status, message: mensaje });
      return;
    }

    const estado = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = exception instanceof Error ? exception : new Error(String(exception));
    // 502, 503 y 504 vienen de servicios externos (proveedor de IA, S3); se registran igual.
    this.log.error(`${req.method} ${req.originalUrl} → ${estado} [${req.idSolicitud ?? '-'}] ${error.message}`, error.stack);
    await this.errores.registrar({
      fuente: 'api',
      mensaje: error.message || error.name,
      pila: error.stack,
      metodo: req.method,
      // Ruta con parámetros (/api/org/siniestros/:id) para agrupar; si no hay, la ruta pedida sin consulta.
      ruta: req.route?.path ? String(req.route.path) : req.path,
      estado,
      idSolicitud: req.idSolicitud,
      usuarioId: req.usuario?.id || null,
      organizacionId: req.org?.id ?? null,
      agenteUsuario: req.header('user-agent') ?? null,
    });
    if (res.headersSent) return;
    if (exception instanceof HttpException) {
      const cuerpo = exception.getResponse();
      res.status(estado).json({ ...(typeof cuerpo === 'string' ? { message: cuerpo } : cuerpo), statusCode: estado, idSolicitud: req.idSolicitud });
      return;
    }
    res.status(estado).json({
      statusCode: estado,
      message: `Ocurrió un error inesperado. Si se repite, comparte este código con soporte: ${req.idSolicitud ?? 'sin código'}`,
      idSolicitud: req.idSolicitud,
    });
  }
}
