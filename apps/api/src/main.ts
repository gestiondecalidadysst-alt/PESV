import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { config } from './config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigins });
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API PESV escuchando en http://localhost:${config.port}/api`);
}

void bootstrap();
