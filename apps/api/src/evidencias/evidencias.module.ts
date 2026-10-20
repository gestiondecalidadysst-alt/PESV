import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CORRESPONDENCIA_PESV_ISO,
  decisionEvidenciaSchema,
  ISO_39001_VERSION,
  RES_40595_2022,
  subirEvidenciaSchema,
  type DecisionEvidenciaInput,
  type SubirEvidenciaInput,
} from '@pesv/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import {
  OrgActual,
  Permiso,
  UsuarioActual,
  type OrgSesion,
  type UsuarioSesion,
} from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { config } from '../config.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { evidenceLinks, evidences, stepCompliance, users } from '../db/schema.js';
import { nombreSeguro, StorageService } from '../storage/storage.service.js';

export const TIPOS_PERMITIDOS = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export interface ArchivoEvidencia {
  nombre: string;
  tipo: string;
  datos: Buffer;
}

@Injectable()
export class EvidenciasService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Registra una evidencia de un paso y la vincula también a las cláusulas ISO 39001 que le
   * corresponden (RN-09). Queda en borrador hasta que el líder PESV la apruebe (RN-06, RN-10).
   */
  async crear(
    orgId: string,
    input: SubirEvidenciaInput,
    archivo: ArchivoEvidencia,
    usuarioId: string,
    opciones: { generadaPorIa?: boolean } = {},
  ) {
    if (!TIPOS_PERMITIDOS.has(archivo.tipo)) {
      throw new BadRequestException('Tipo de archivo no permitido. Usa PDF, imagen, Word, Excel o texto.');
    }
    if (archivo.datos.length > config.maxUploadBytes) {
      throw new BadRequestException('El archivo supera los 15 MB permitidos');
    }
    const id = randomUUID();
    const nombre = nombreSeguro(archivo.nombre);
    const clave = `${orgId}/evidencias/${id}/${nombre}`;

    return this.database.withTenant(orgId, async (tx) => {
      const [paso] = await tx
        .select()
        .from(stepCompliance)
        .where(and(eq(stepCompliance.organizationId, orgId), eq(stepCompliance.stepNumber, input.pasoNumero)));
      if (!paso) throw new NotFoundException('Paso no encontrado');
      if (paso.status === 'no_aplica') {
        throw new BadRequestException('Este paso no aplica al nivel de la organización');
      }

      let version = 1;
      if (input.reemplazaId) {
        const anterior = await this.buscar(tx, input.reemplazaId);
        const yaReemplazada = await tx.select({ id: evidences.id }).from(evidences).where(eq(evidences.replacesId, anterior.id));
        if (yaReemplazada.length > 0) throw new BadRequestException('Esa evidencia ya tiene una versión más reciente');
        version = anterior.version + 1;
      }

      await this.storage.guardar(clave, archivo.datos, archivo.tipo);
      const [evidencia] = await tx
        .insert(evidences)
        .values({
          id,
          organizationId: orgId,
          title: input.titulo,
          description: input.descripcion ?? null,
          fileKey: clave,
          originalFilename: nombre,
          mimeType: archivo.tipo,
          sizeBytes: archivo.datos.length,
          checksumSha256: createHash('sha256').update(archivo.datos).digest('hex'),
          version,
          replacesId: input.reemplazaId ?? null,
          aiGenerated: opciones.generadaPorIa ?? false,
          uploadedBy: usuarioId,
        })
        .returning();
      await tx.insert(evidenceLinks).values([
        { evidenceId: id, organizationId: orgId, norm: 'PESV', versionId: RES_40595_2022.id, ref: String(input.pasoNumero) },
        ...(CORRESPONDENCIA_PESV_ISO[input.pasoNumero] ?? []).map((c) => ({
          evidenceId: id,
          organizationId: orgId,
          norm: 'ISO39001',
          versionId: ISO_39001_VERSION.id,
          ref: c,
        })),
      ]);
      if (paso.status === 'pendiente') {
        await tx
          .update(stepCompliance)
          .set({ status: 'en_curso', updatedBy: usuarioId, updatedAt: new Date() })
          .where(and(eq(stepCompliance.organizationId, orgId), eq(stepCompliance.stepNumber, input.pasoNumero)));
      }
      await auditar(tx, {
        organizacionId: orgId,
        actorId: usuarioId,
        accion: opciones.generadaPorIa ? 'evidencia.borrador_ia' : 'evidencia.subida',
        entidad: 'evidence',
        entidadId: id,
        datos: { paso: input.pasoNumero, version },
      });
      return evidencia!;
    });
  }

  private async buscar(tx: TenantTx, id: string) {
    const [e] = await tx.select().from(evidences).where(eq(evidences.id, id));
    if (!e) throw new NotFoundException('Evidencia no encontrada');
    return e;
  }

  /** Versiones vigentes (las que nadie ha reemplazado), con su historial. */
  async listar(orgId: string, paso?: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx
        .select({
          evidencia: evidences,
          paso: evidenceLinks.ref,
          subidaPor: users.fullName,
          versiones: sql<number>`(with recursive cadena as (
              select e.id, e.replaces_id from evidences e where e.id = ${evidences.id}
              union all select p.id, p.replaces_id from evidences p join cadena c on p.id = c.replaces_id
            ) select count(*)::int from cadena)`,
        })
        .from(evidences)
        .innerJoin(evidenceLinks, and(eq(evidenceLinks.evidenceId, evidences.id), eq(evidenceLinks.norm, 'PESV')))
        .leftJoin(users, eq(users.id, evidences.uploadedBy))
        .where(
          and(
            paso ? eq(evidenceLinks.ref, String(paso)) : undefined,
            sql`not exists (select 1 from evidences r where r.replaces_id = ${evidences.id})`,
          ),
        )
        .orderBy(desc(evidences.createdAt));
      const clausulas = await tx
        .select({ evidenceId: evidenceLinks.evidenceId, ref: evidenceLinks.ref })
        .from(evidenceLinks)
        .where(eq(evidenceLinks.norm, 'ISO39001'));
      return filas.map((f) => ({
        id: f.evidencia.id,
        titulo: f.evidencia.title,
        descripcion: f.evidencia.description,
        paso: Number(f.paso),
        clausulasIso: clausulas.filter((c) => c.evidenceId === f.evidencia.id).map((c) => c.ref),
        archivo: f.evidencia.originalFilename,
        tipo: f.evidencia.mimeType,
        tamano: f.evidencia.sizeBytes,
        version: f.evidencia.version,
        versiones: f.versiones,
        estado: f.evidencia.status,
        motivoRechazo: f.evidencia.rejectionReason,
        generadaPorIa: f.evidencia.aiGenerated,
        subidaPor: f.subidaPor,
        aprobadaEn: f.evidencia.approvedAt,
        creadaEn: f.evidencia.createdAt,
      }));
    });
  }

  async decidir(orgId: string, id: string, input: DecisionEvidenciaInput, usuarioId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const e = await this.buscar(tx, id);
      if (e.status !== 'borrador') throw new BadRequestException('Esta evidencia ya fue revisada');
      const aprobar = input.decision === 'aprobar';
      const [actualizada] = await tx
        .update(evidences)
        .set(
          aprobar
            ? { status: 'aprobada', approvedBy: usuarioId, approvedAt: new Date(), rejectionReason: null }
            : { status: 'rechazada', rejectionReason: input.motivo ?? null },
        )
        .where(eq(evidences.id, id))
        .returning();
      await auditar(tx, {
        organizacionId: orgId,
        actorId: usuarioId,
        accion: aprobar ? 'evidencia.aprobada' : 'evidencia.rechazada',
        entidad: 'evidence',
        entidadId: id,
        datos: aprobar ? {} : { motivo: input.motivo },
      });
      return actualizada!;
    });
  }

  async archivo(orgId: string, id: string) {
    const e = await this.database.withTenant(orgId, (tx) => this.buscar(tx, id));
    if (!e.fileKey) throw new NotFoundException('La evidencia no tiene archivo');
    return { datos: await this.storage.leer(e.fileKey), tipo: e.mimeType ?? 'application/octet-stream', nombre: e.originalFilename ?? 'evidencia' };
  }
}

@Controller('org/evidencias')
export class EvidenciasController {
  constructor(private readonly service: EvidenciasService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion, @Query('paso') paso?: string) {
    return this.service.listar(org.id, paso ? Number(paso) : undefined);
  }

  @Post()
  @Permiso('gestionar_pesv')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: config.maxUploadBytes } }))
  subir(
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(subirEvidenciaSchema)) body: SubirEvidenciaInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    if (!archivo) throw new BadRequestException('Adjunta el archivo de la evidencia');
    return this.service.crear(
      org.id,
      body,
      { nombre: Buffer.from(archivo.originalname, 'latin1').toString('utf8'), tipo: archivo.mimetype, datos: archivo.buffer },
      usuario.id,
    );
  }

  @Post(':id/decision')
  @Permiso('aprobar_evidencias')
  decidir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decisionEvidenciaSchema)) body: DecisionEvidenciaInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.service.decidir(org.id, id, body, usuario.id);
  }

  @Get(':id/archivo')
  @Permiso('ver')
  async descargar(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgActual() org: OrgSesion,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { datos, tipo, nombre } = await this.service.archivo(org.id, id);
    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(datos);
  }
}

@Module({ controllers: [EvidenciasController], providers: [EvidenciasService], exports: [EvidenciasService] })
export class EvidenciasModule {}
