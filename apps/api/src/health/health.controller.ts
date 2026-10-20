import { Publico } from '../auth/decorators.js';
import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../db/database.service.js';

@Publico()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    const db = await this.database.ping();
    return { estado: db ? 'ok' : 'degradado', baseDeDatos: db ? 'conectada' : 'sin conexión' };
  }
}
