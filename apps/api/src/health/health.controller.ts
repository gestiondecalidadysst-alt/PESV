import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../db/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    const db = await this.database.ping();
    return { estado: db ? 'ok' : 'degradado', baseDeDatos: db ? 'conectada' : 'sin conexión' };
  }
}
