import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Module,
  NotFoundException,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  formatoDocumentoSchema,
  formatoGeneralSchema,
  IDS_TIPO_DOCUMENTO,
  type FormatoDocumentoInput,
  type FormatoGeneralInput,
  type TipoDocumento,
} from '@pesv/shared';
import type { Response } from 'express';
import { Miembro, OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { generarExcel } from './excel.js';
import { FormatoService } from './formato.service.js';
import { DocumentoPdf } from './pdf.js';

export { FormatoService } from './formato.service.js';

export const MIME_PDF = 'application/pdf';
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Envía un archivo generado para descargar con un nombre seguro. */
export function enviarArchivo(res: Response, datos: Buffer, nombre: string, mime: string) {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${nombre.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(datos);
}

@Controller('org')
export class FormatoController {
  constructor(private readonly formato: FormatoService) {}

  @Get('formato')
  @Permiso('ver')
  consultar(@OrgActual() org: OrgSesion) {
    return this.formato.consultar(org.id);
  }

  @Put('formato')
  @Permiso('configurar')
  guardarGeneral(@Body(new ZodValidationPipe(formatoGeneralSchema)) body: FormatoGeneralInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.formato.guardarGeneral(org.id, body, u.id);
  }

  @Put('formato/documentos')
  @Permiso('gestionar_pesv')
  guardarDocumento(@Body(new ZodValidationPipe(formatoDocumentoSchema)) body: FormatoDocumentoInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.formato.guardarDocumento(org.id, body, u.id);
  }

  /** Muestra de cómo queda el encabezado y el pie en PDF o Excel. */
  @Get('formato/vista-previa')
  @Permiso('ver')
  async vistaPrevia(@Query('tipo') tipo: string | undefined, @Query('formato') formato: string | undefined, @OrgActual() org: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const t = (IDS_TIPO_DOCUMENTO as readonly string[]).includes(tipo ?? '') ? (tipo as TipoDocumento) : 'matriz_riesgos';
    const ctx = await this.formato.contexto(org.id, t);
    const filas = [
      ['1', 'Ejemplo de contenido', 'Así se verán las tablas del documento con tu encabezado y pie de página.'],
      ['2', 'Logo y datos', ctx.logo ? 'Se usa el logo cargado.' : 'Aún no hay logo: se muestra el nombre de la organización.'],
    ];
    if (formato === 'xlsx') {
      const datos = await generarExcel(ctx, [{ nombre: 'Vista previa', columnas: [{ titulo: '#', ancho: 6 }, { titulo: 'Elemento', ancho: 28 }, { titulo: 'Detalle', ancho: 60 }, { titulo: 'Notas', ancho: 24 }], filas }]);
      return enviarArchivo(res, datos, `${ctx.codigo}-vista-previa.xlsx`, MIME_XLSX);
    }
    const pdf = new DocumentoPdf(ctx);
    pdf.titulo('Vista previa del formato').parrafo('Este documento muestra el encabezado y el pie de página configurados para tu sistema de gestión.').espacio();
    pdf.tabla([{ titulo: '#', ancho: 1 }, { titulo: 'Elemento', ancho: 4 }, { titulo: 'Detalle', ancho: 10 }], filas);
    return enviarArchivo(res, await pdf.terminar(), `${ctx.codigo}-vista-previa.pdf`, MIME_PDF);
  }

  @Get('logo')
  @Miembro()
  async logo(@OrgActual() org: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const logo = await this.formato.logo(org.id);
    if (!logo) throw new NotFoundException('La organización no tiene logo');
    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(logo.datos);
  }

  @Post('logo')
  @Permiso('configurar')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: 1024 * 1024 } }))
  subirLogo(@UploadedFile() archivo: Express.Multer.File | undefined, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    if (!archivo) throw new BadRequestException('Adjunta el logo (PNG o JPG)');
    return this.formato.subirLogo(org.id, archivo.buffer, u.id);
  }

  @Delete('logo')
  @HttpCode(204)
  @Permiso('configurar')
  async borrarLogo(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.formato.borrarLogo(org.id, u.id);
  }
}

/** Global: matriz, planes, actas y demás módulos generan sus documentos con este formato. */
@Global()
@Module({ controllers: [FormatoController], providers: [FormatoService], exports: [FormatoService] })
export class DocumentosModule {}
