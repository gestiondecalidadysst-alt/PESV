import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  actualizarPasoSchema,
  crearOrganizacionSchema,
  type ActualizarPasoInput,
  type CrearOrganizacionInput,
} from '@pesv/shared';
import {
  Miembro,
  OrgActual,
  Permiso,
  UsuarioActual,
  type OrgSesion,
  type UsuarioSesion,
} from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrganizationsService } from './organizations.service.js';

@Controller()
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  /** Un usuario con sesión registra otra organización (por ejemplo, un consultor). */
  @Post('organizations')
  async crear(
    @Body(new ZodValidationPipe(crearOrganizacionSchema)) body: CrearOrganizacionInput,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    const { organizacion, resultado } = await this.service.crear(body, { usuarioId: usuario.id });
    return { organizacion, resultado };
  }

  @Get('org')
  @Miembro()
  obtener(@OrgActual() org: OrgSesion) {
    return this.service.obtener(org.id);
  }

  @Get('org/pasos')
  @Permiso('ver')
  pasos(@OrgActual() org: OrgSesion) {
    return this.service.pasos(org.id);
  }

  @Patch('org/pasos/:numero')
  @Permiso('gestionar_pesv')
  actualizarPaso(
    @Param('numero', ParseIntPipe) numero: number,
    @Body(new ZodValidationPipe(actualizarPasoSchema)) body: ActualizarPasoInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.service.actualizarPaso(org.id, numero, body.estado, usuario.id);
  }

  @Get('org/reclasificacion')
  @Permiso('ver')
  propuesta(@OrgActual() org: OrgSesion) {
    return this.service.propuestaReclasificacion(org.id);
  }

  @Post('org/reclasificacion')
  @Permiso('gestionar_pesv')
  confirmar(@OrgActual() org: OrgSesion, @UsuarioActual() usuario: UsuarioSesion) {
    return this.service.confirmarReclasificacion(org.id, usuario.id);
  }
}
