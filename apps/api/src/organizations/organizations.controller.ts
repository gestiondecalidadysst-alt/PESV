import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { crearOrganizacionSchema, type CrearOrganizacionInput } from '@pesv/shared';
import { OrganizacionActiva } from '../common/tenant.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  crear(@Body(new ZodValidationPipe(crearOrganizacionSchema)) body: CrearOrganizacionInput) {
    return this.service.crear(body);
  }

  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @OrganizacionActiva() activa: string) {
    this.verificar(id, activa);
    return this.service.obtener(id);
  }

  @Get(':id/steps')
  pasos(@Param('id', ParseUUIDPipe) id: string, @OrganizacionActiva() activa: string) {
    this.verificar(id, activa);
    return this.service.pasos(id);
  }

  private verificar(id: string, activa: string) {
    if (id.toLowerCase() !== activa) {
      throw new ForbiddenException('No tienes acceso a esta organización');
    }
  }
}
