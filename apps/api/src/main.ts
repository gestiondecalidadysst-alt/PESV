import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function configurarApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurarApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API PESV escuchando en http://localhost:${config.port}/api`);
}

if (process.env.VITEST === undefined) void bootstrap();
