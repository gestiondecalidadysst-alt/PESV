import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  copilotoSchema,
  iaConfigSchema,
  redactarSchema,
  type IaConfigInput,
  type RedactarInput,
} from '@pesv/shared';
import {
  Miembro,
  OrgActual,
  Permiso,
  RequiereFuncion,
  UsuarioActual,
  type OrgSesion,
  type UsuarioSesion,
} from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EvidenciasModule } from '../evidencias/evidencias.module.js';
import { FlotaModule } from '../flota/flota.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { IaService } from './ia.service.js';

const IMAGENES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Controller('org/ia')
export class IaController {
  constructor(private readonly ia: IaService) {}

  @Get('estado')
  @Miembro()
  estado(@OrgActual() org: OrgSesion) {
    return this.ia.estado(org.id);
  }

  @Get('config')
  @Permiso('configurar')
  config(@OrgActual() org: OrgSesion) {
    return this.ia.config(org.id);
  }

  @Put('config')
  @Permiso('configurar')
  @RequiereFuncion('ia')
  guardar(
    @Body(new ZodValidationPipe(iaConfigSchema)) body: IaConfigInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.ia.guardar(org.id, body, u.id);
  }

  @Post('probar')
  @Permiso('configurar')
  @RequiereFuncion('ia')
  probar(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.ia.probar(org.id, u.id);
  }

  @Get('uso')
  @Permiso('configurar')
  uso(@OrgActual() org: OrgSesion) {
    return this.ia.uso(org.id);
  }

  @Post('copiloto')
  @Permiso('ver')
  copiloto(
    @Body(new ZodValidationPipe(copilotoSchema)) body: { pregunta: string },
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.ia.copiloto(org.id, u.id, body.pregunta);
  }

  @Get('copiloto')
  @Permiso('ver')
  historial(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.ia.historial(org.id, u.id);
  }

  @Post('redactar')
  @Permiso('gestionar_pesv')
  redactar(
    @Body(new ZodValidationPipe(redactarSchema)) body: RedactarInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.ia.redactar(org.id, u.id, body);
  }

  @Post('diagnostico')
  @Permiso('ver')
  diagnostico(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.ia.diagnostico(org.id, u.id);
  }

  @Post('lector')
  @Permiso('gestionar_flota')
  @UseInterceptors(FileInterceptor('imagen', { limits: { fileSize: 8 * 1024 * 1024 } }))
  lector(
    @UploadedFile() imagen: Express.Multer.File | undefined,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    if (!imagen || !IMAGENES.has(imagen.mimetype)) {
      throw new BadRequestException('Adjunta una foto del documento en PNG, JPG o WebP');
    }
    return this.ia.leerDocumento(org.id, u.id, { tipo: imagen.mimetype, base64: imagen.buffer.toString('base64') });
  }
}

@Module({
  imports: [OrganizationsModule, FlotaModule, EvidenciasModule],
  controllers: [IaController],
  providers: [IaService],
  exports: [IaService],
})
export class IaModule {}
