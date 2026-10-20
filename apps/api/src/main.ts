import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { idDeSolicitud, RegistroJson } from './common/registro.js';
import { config } from './config.js';
import { ErroresService } from './errores/errores.module.js';

export function configurarApp(app: NestExpressApplication) {
  app.use(idDeSolicitud(config.formatoLogs === 'json' && process.env.VITEST === undefined));
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.set('trust proxy', config.trustProxy);
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, config.formatoLogs === 'json' ? { logger: new RegistroJson() } : {});
  configurarApp(app);
  app.enableShutdownHooks();

  // Errores fuera de una solicitud (promesas sin capturar): quedan en el registro de errores.
  const errores = app.get(ErroresService);
  process.on('unhandledRejection', (motivo) => {
    const e = motivo instanceof Error ? motivo : new Error(String(motivo));
    new Logger('Proceso').error(`Promesa sin capturar: ${e.message}`, e.stack);
    void errores.registrar({ fuente: 'tarea', mensaje: e.message, pila: e.stack, contexto: { tipo: 'unhandledRejection' } });
  });

  await app.listen(config.port);
  new Logger('API').log(`API PESV escuchando en el puerto ${config.port} (prefijo /api)`);
}

if (process.env.VITEST === undefined) void bootstrap();
