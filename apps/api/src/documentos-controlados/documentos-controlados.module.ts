import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  aprobarDocumentoSchema,
  borradorDocumentoSchema,
  CLASES_DOCUMENTO,
  devolverDocumentoSchema,
  divulgacionSchema,
  documentoControladoSchema,
  llenarPlantilla,
  PASOS_PESV,
  PLANTILLAS_DOCUMENTO,
  type AprobarDocumentoInput,
  type BorradorDocumentoInput,
  type ClaseDocumento,
  type DivulgacionInput,
  type DocumentoControladoInput,
} from '@pesv/shared';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar, esViolacionUnica } from '../common/audit.js';
import { verifyPassword } from '../common/crypto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { config } from '../config.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { controlledDocuments, documentSettings, documentVersions, organizations } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf, type CeldaPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService, TIPOS_PERMITIDOS } from '../evidencias/evidencias.module.js';
import { nombreSeguro, StorageService } from '../storage/storage.service.js';
import { hoyColombia } from '../common/fechas.js';

type FilaDocumento = typeof controlledDocuments.$inferSelect;
type FilaVersion = typeof documentVersions.$inferSelect;

const hoy = hoyColombia;
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const EN_CURSO = ['borrador', 'en_revision'];
const ESTADO_TEXTO: Record<string, string> = { borrador: 'Borrador', en_revision: 'En revisión', aprobado: 'Vigente', obsoleto: 'Obsoleta' };

const aVersion = (v: FilaVersion, conContenido = false) => ({
  id: v.id,
  version: v.version,
  estado: v.status as 'borrador' | 'en_revision' | 'aprobado' | 'obsoleto',
  contenido: conContenido ? v.content : undefined,
  tieneContenido: !!v.content,
  archivo: v.fileKey ? { nombre: v.fileName, tipo: v.fileMime } : null,
  resumenCambios: v.changeSummary,
  elaboro: v.preparedName,
  enviadaEl: v.submittedAt,
  reviso: v.reviewedName,
  revisadaEl: v.reviewedAt,
  aprobo: v.approvedName,
  aprobadaEl: v.approvedAt,
  vigenteDesde: v.effectiveOn,
  notaDevolucion: v.returnNote,
  divulgacion: v.disseminatedOn ? { fecha: v.disseminatedOn, medio: v.disseminationNote } : null,
  evidenciaId: v.evidenceId,
  creadaEl: v.createdAt,
});

function aDocumento(d: FilaDocumento, versiones: FilaVersion[]) {
  const propias = versiones.filter((v) => v.documentId === d.id).sort((a, b) => b.version - a.version);
  const vigente = propias.find((v) => v.status === 'aprobado') ?? null;
  const enCurso = propias.find((v) => EN_CURSO.includes(v.status)) ?? null;
  // Una política o un documento aprobado hace más de un año debe revisarse.
  const revisionVencida = !!vigente?.effectiveOn && vigente.effectiveOn < new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  return {
    id: d.id,
    codigo: d.code,
    titulo: d.title,
    clase: d.class as ClaseDocumento,
    pasoNumero: d.stepNumber,
    responsable: d.ownerName,
    retencion: d.retention,
    vigente: vigente ? aVersion(vigente) : null,
    enCurso: enCurso ? aVersion(enCurso) : null,
    versiones: propias.length,
    revisionVencida,
    sinDivulgar: !!vigente && !vigente.disseminatedOn,
    actualizadoEl: d.updatedAt,
  };
}
export type DocumentoControlado = ReturnType<typeof aDocumento>;

/**
 * Documentos controlados del PESV: redacción en la plataforma (o archivo adjunto), versiones con
 * revisión y aprobación firmada, divulgación y lista maestra (paso 19).
 */
@Injectable()
export class DocumentosControladosService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
    private readonly storage: StorageService,
  ) {}

  private async documento(tx: TenantTx, id: string) {
    const [d] = await tx.select().from(controlledDocuments).where(eq(controlledDocuments.id, id));
    if (!d) throw new NotFoundException('Documento no encontrado');
    return d;
  }

  private async enCurso(tx: TenantTx, documentoId: string) {
    const [v] = await tx.select().from(documentVersions).where(and(eq(documentVersions.documentId, documentoId), inArray(documentVersions.status, EN_CURSO)));
    return v ?? null;
  }

  private async prefijo(tx: TenantTx) {
    const [s] = await tx.select({ p: documentSettings.codePrefix }).from(documentSettings);
    return s?.p ?? 'PESV';
  }

  async listar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const docs = await tx.select().from(controlledDocuments).orderBy(asc(controlledDocuments.code));
      const versiones = docs.length ? await tx.select().from(documentVersions).where(inArray(documentVersions.documentId, docs.map((d) => d.id))) : [];
      const lista = docs.map((d) => aDocumento(d, versiones));
      return {
        documentos: lista,
        resumen: {
          total: lista.length,
          vigentes: lista.filter((d) => d.vigente).length,
          enRevision: lista.filter((d) => d.enCurso?.estado === 'en_revision').length,
          borradores: lista.filter((d) => d.enCurso?.estado === 'borrador').length,
          revisionVencida: lista.filter((d) => d.revisionVencida).length,
          sinDivulgar: lista.filter((d) => d.sinDivulgar).length,
        },
        tienePolitica: lista.some((d) => d.clase === 'politica' && d.vigente),
        prefijo: await this.prefijo(tx),
      };
    });
  }

  async detalle(orgId: string, id: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const d = await this.documento(tx, id);
      const versiones = await tx.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.version));
      return { ...aDocumento(d, versiones), historial: versiones.map((v) => aVersion(v, true)) };
    });
  }

  crear(orgId: string, input: DocumentoControladoInput, usuario: UsuarioSesion) {
    return this.database.withTenant(orgId, async (tx) => {
      const plantilla = input.plantilla ? PLANTILLAS_DOCUMENTO.find((p) => p.id === input.plantilla) : null;
      if (input.plantilla && !plantilla) throw new BadRequestException('La plantilla no existe');
      let codigo = input.codigo;
      if (!codigo) {
        // Código sugerido: prefijo-sigla-consecutivo (PESV-PO-01).
        const sigla = CLASES_DOCUMENTO.find((c) => c.id === input.clase)!.sigla;
        const base = `${await this.prefijo(tx)}-${sigla}-`;
        const usados = (await tx.select({ c: controlledDocuments.code }).from(controlledDocuments)).map((x) => x.c).filter((c) => c.startsWith(base));
        let n = 1;
        while (usados.includes(`${base}${String(n).padStart(2, '0')}`)) n++;
        codigo = `${base}${String(n).padStart(2, '0')}`;
      }
      let contenido = input.contenido ?? null;
      if (plantilla && !contenido) {
        const [o] = await tx.select({ nombre: organizations.name, nit: organizations.nit }).from(organizations).where(eq(organizations.id, orgId));
        const fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date());
        contenido = llenarPlantilla(plantilla.contenido, { organizacion: o?.nombre, nit: o?.nit, fecha, ...input.datosPlantilla });
      }
      try {
        const [d] = await tx
          .insert(controlledDocuments)
          .values({ organizationId: orgId, code: codigo, title: input.titulo, class: input.clase, stepNumber: input.pasoNumero ?? plantilla?.paso ?? null, ownerName: input.responsable ?? null, retention: input.retencion ?? null, createdBy: usuario.id })
          .returning();
        await tx.insert(documentVersions).values({ organizationId: orgId, documentId: d!.id, version: 1, content: contenido, changeSummary: 'Creación del documento', preparedBy: usuario.id, preparedName: usuario.nombre });
        await auditar(tx, { organizacionId: orgId, actorId: usuario.id, accion: 'documento.creado', entidad: 'controlled_document', entidadId: d!.id, datos: { codigo } });
        return { id: d!.id, codigo };
      } catch (e) {
        if (esViolacionUnica(e)) throw new ConflictException(`Ya existe un documento con el código ${codigo}`);
        throw e;
      }
    });
  }

  editar(orgId: string, id: string, input: DocumentoControladoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const d = await this.documento(tx, id);
      try {
        await tx
          .update(controlledDocuments)
          .set({ title: input.titulo, class: input.clase, code: input.codigo ?? d.code, stepNumber: input.pasoNumero ?? null, ownerName: input.responsable ?? null, retention: input.retencion ?? null, updatedAt: new Date() })
          .where(eq(controlledDocuments.id, id));
      } catch (e) {
        if (esViolacionUnica(e)) throw new ConflictException(`Ya existe un documento con el código ${input.codigo}`);
        throw e;
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.actualizado', entidad: 'controlled_document', entidadId: id });
      return { id };
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const d = await this.documento(tx, id);
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(documentVersions).where(and(eq(documentVersions.documentId, id), inArray(documentVersions.status, ['aprobado', 'obsoleto'])));
      if (n > 0) throw new BadRequestException('Un documento que ya tuvo versiones aprobadas no se elimina: queda en el historial');
      await tx.delete(controlledDocuments).where(eq(controlledDocuments.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.eliminado', entidad: 'controlled_document', entidadId: id, datos: { codigo: d.code } });
    });
  }

  guardarBorrador(orgId: string, id: string, input: BorradorDocumentoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.documento(tx, id);
      const v = await this.enCurso(tx, id);
      if (!v || v.status !== 'borrador') throw new BadRequestException('No hay un borrador para editar');
      await tx
        .update(documentVersions)
        .set({ content: input.contenido === undefined ? v.content : input.contenido || null, changeSummary: input.resumenCambios ?? v.changeSummary, updatedAt: new Date() })
        .where(eq(documentVersions.id, v.id));
      await tx.update(controlledDocuments).set({ updatedAt: new Date() }).where(eq(controlledDocuments.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.borrador', entidad: 'document_version', entidadId: v.id });
      return { version: v.version };
    });
  }

  async adjuntar(orgId: string, id: string, archivo: { nombre: string; tipo: string; datos: Buffer }, actorId: string) {
    if (!TIPOS_PERMITIDOS.has(archivo.tipo)) throw new BadRequestException('Tipo de archivo no permitido. Usa PDF, Word, Excel, imagen o texto.');
    const v = await this.database.withTenant(orgId, async (tx) => {
      await this.documento(tx, id);
      const actual = await this.enCurso(tx, id);
      if (!actual || actual.status !== 'borrador') throw new BadRequestException('No hay un borrador para adjuntar el archivo');
      return actual;
    });
    const clave = `${orgId}/documentos/${id}/${v.version}-${randomUUID().slice(0, 8)}-${nombreSeguro(archivo.nombre)}`;
    await this.storage.guardar(clave, archivo.datos, archivo.tipo);
    return this.database.withTenant(orgId, async (tx) => {
      await tx.update(documentVersions).set({ fileKey: clave, fileName: archivo.nombre, fileMime: archivo.tipo, updatedAt: new Date() }).where(eq(documentVersions.id, v.id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.archivo', entidad: 'document_version', entidadId: v.id, datos: { archivo: archivo.nombre } });
      return { version: v.version };
    });
  }

  quitarArchivo(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const v = await this.enCurso(tx, id);
      if (!v || v.status !== 'borrador') throw new BadRequestException('No hay un borrador');
      await tx.update(documentVersions).set({ fileKey: null, fileName: null, fileMime: null, updatedAt: new Date() }).where(eq(documentVersions.id, v.id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.archivo_quitado', entidad: 'document_version', entidadId: v.id });
    });
  }

  nuevaVersion(orgId: string, id: string, usuario: UsuarioSesion) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.documento(tx, id);
      if (await this.enCurso(tx, id)) throw new BadRequestException('Ya hay una versión en elaboración');
      const [ultima] = await tx.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.version)).limit(1);
      const [v] = await tx
        .insert(documentVersions)
        .values({ organizationId: orgId, documentId: id, version: (ultima?.version ?? 0) + 1, content: ultima?.content ?? null, fileKey: ultima?.fileKey ?? null, fileName: ultima?.fileName ?? null, fileMime: ultima?.fileMime ?? null, preparedBy: usuario.id, preparedName: usuario.nombre })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId: usuario.id, accion: 'documento.nueva_version', entidad: 'document_version', entidadId: v!.id, datos: { version: v!.version } });
      return { version: v!.version };
    });
  }

  enviar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const v = await this.enCurso(tx, id);
      if (!v || v.status !== 'borrador') throw new BadRequestException('No hay un borrador para enviar');
      if (!v.content?.trim() && !v.fileKey) throw new BadRequestException('Escribe el contenido o adjunta el archivo antes de enviar a revisión');
      if (v.version > 1 && !v.changeSummary?.trim()) throw new BadRequestException('Describe los cambios de esta versión');
      await tx.update(documentVersions).set({ status: 'en_revision', submittedAt: new Date(), returnNote: null, updatedAt: new Date() }).where(eq(documentVersions.id, v.id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.enviado', entidad: 'document_version', entidadId: v.id });
      return { estado: 'en_revision' };
    });
  }

  revisar(orgId: string, id: string, usuario: UsuarioSesion) {
    return this.database.withTenant(orgId, async (tx) => {
      const v = await this.enCurso(tx, id);
      if (!v || v.status !== 'en_revision') throw new BadRequestException('El documento no está en revisión');
      await tx.update(documentVersions).set({ reviewedBy: usuario.id, reviewedName: usuario.nombre, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(documentVersions.id, v.id));
      await auditar(tx, { organizacionId: orgId, actorId: usuario.id, accion: 'documento.revisado', entidad: 'document_version', entidadId: v.id });
      return { reviso: usuario.nombre };
    });
  }

  devolver(orgId: string, id: string, nota: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const v = await this.enCurso(tx, id);
      if (!v || v.status !== 'en_revision') throw new BadRequestException('El documento no está en revisión');
      await tx.update(documentVersions).set({ status: 'borrador', returnNote: nota, reviewedBy: null, reviewedName: null, reviewedAt: null, updatedAt: new Date() }).where(eq(documentVersions.id, v.id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.devuelto', entidad: 'document_version', entidadId: v.id, datos: { nota } });
      return { estado: 'borrador' };
    });
  }

  /**
   * Aprueba la versión en revisión con la contraseña de quien aprueba (firma electrónica simple).
   * La versión anterior queda obsoleta y el PDF aprobado queda como evidencia aprobada del paso.
   */
  async aprobar(orgId: string, id: string, input: AprobarDocumentoInput, usuario: UsuarioSesion) {
    const { rows } = await this.database.db.execute<{ password_hash: string | null }>(sql`select password_hash from auth_lookup_user(${usuario.email})`);
    if (!(await verifyPassword(input.password, rows[0]?.password_hash ?? null))) throw new UnauthorizedException('La contraseña no es correcta');
    const vigente = input.vigenteDesde ?? hoy();
    const { d, v } = await this.database.withTenant(orgId, async (tx) => {
      const d = await this.documento(tx, id);
      const v = await this.enCurso(tx, id);
      if (!v || v.status !== 'en_revision') throw new BadRequestException('El documento no está en revisión');
      await tx.update(documentVersions).set({ status: 'obsoleto', updatedAt: new Date() }).where(and(eq(documentVersions.documentId, id), eq(documentVersions.status, 'aprobado')));
      await tx
        .update(documentVersions)
        .set({
          status: 'aprobado',
          approvedBy: usuario.id,
          approvedName: usuario.nombre,
          approvedAt: new Date(),
          reviewedBy: v.reviewedBy ?? usuario.id,
          reviewedName: v.reviewedName ?? usuario.nombre,
          reviewedAt: v.reviewedAt ?? new Date(),
          effectiveOn: vigente,
          updatedAt: new Date(),
        })
        .where(eq(documentVersions.id, v.id));
      await tx.update(controlledDocuments).set({ updatedAt: new Date() }).where(eq(controlledDocuments.id, id));
      await auditar(tx, { organizacionId: orgId, actorId: usuario.id, accion: 'documento.aprobado', entidad: 'document_version', entidadId: v.id, datos: { codigo: d.code, version: v.version } });
      return { d, v };
    });
    // Evidencia del paso: el PDF aprobado (o el archivo adjunto si no se redactó en la plataforma).
    let evidenciaId: string | null = null;
    if (d.stepNumber) {
      const archivo = v.content?.trim()
        ? { ...(await this.pdf(orgId, id, v.version)), tipo: MIME_PDF }
        : { datos: await this.storage.leer(v.fileKey!), nombre: v.fileName ?? 'documento', tipo: v.fileMime ?? MIME_PDF };
      try {
        const ev = await this.evidencias.crear(
          orgId,
          { titulo: `${d.code} ${d.title} · versión ${v.version}`, pasoNumero: d.stepNumber, descripcion: `Documento controlado aprobado por ${usuario.nombre} el ${vigente}.` },
          { nombre: archivo.nombre, tipo: archivo.tipo, datos: archivo.datos },
          usuario.id,
        );
        // Quien aprueba el documento también aprueba su evidencia: no se pide dos veces.
        await this.evidencias.decidir(orgId, ev.id, { decision: 'aprobar' }, usuario.id);
        evidenciaId = ev.id;
        await this.database.withTenant(orgId, (tx) => tx.update(documentVersions).set({ evidenceId: evidenciaId }).where(eq(documentVersions.id, v.id)));
      } catch (e) {
        // El documento queda aprobado aunque su paso no aplique al nivel de la organización.
        if (!(e instanceof BadRequestException)) throw e;
      }
    }
    return { version: v.version, vigenteDesde: vigente, evidenciaId };
  }

  divulgar(orgId: string, id: string, input: DivulgacionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [v] = await tx.select().from(documentVersions).where(and(eq(documentVersions.documentId, id), eq(documentVersions.status, 'aprobado')));
      if (!v) throw new BadRequestException('El documento no tiene una versión vigente');
      if (input.fecha < v.effectiveOn! || input.fecha > hoy()) throw new BadRequestException('La fecha de divulgación debe estar entre la aprobación y hoy');
      await tx.update(documentVersions).set({ disseminatedOn: input.fecha, disseminationNote: input.medio, updatedAt: new Date() }).where(eq(documentVersions.id, v.id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'documento.divulgado', entidad: 'document_version', entidadId: v.id, datos: { medio: input.medio } });
      return { divulgado: true };
    });
  }

  // Archivos y PDF ----------------------------------------------------------------------

  async archivo(orgId: string, id: string, version: number) {
    const v = await this.database.withTenant(orgId, async (tx) => {
      await this.documento(tx, id);
      const [v] = await tx.select().from(documentVersions).where(and(eq(documentVersions.documentId, id), eq(documentVersions.version, version)));
      if (!v?.fileKey) throw new NotFoundException('Esta versión no tiene archivo');
      return v;
    });
    return { datos: await this.storage.leer(v.fileKey!), nombre: v.fileName ?? 'documento', tipo: v.fileMime ?? 'application/octet-stream' };
  }

  /** PDF de una versión con el encabezado y pie del sistema de gestión y sus firmas reales. */
  async pdf(orgId: string, id: string, version: number) {
    const { d, v } = await this.database.withTenant(orgId, async (tx) => {
      const d = await this.documento(tx, id);
      const [v] = await tx.select().from(documentVersions).where(and(eq(documentVersions.documentId, id), eq(documentVersions.version, version)));
      if (!v) throw new NotFoundException('Versión no encontrada');
      return { d, v };
    });
    if (!v.content?.trim()) throw new BadRequestException('Esta versión no se redactó en la plataforma: descarga el archivo adjunto');
    const base = await this.formato.contexto(orgId, 'lista_maestra');
    const fechaFirma = (f: Date | null) => (f ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeZone: 'America/Bogota' }).format(f) : '');
    const ctx = {
      ...base,
      titulo: d.title.toUpperCase(),
      codigo: d.code,
      version: v.version,
      fechaVersion: v.effectiveOn ?? hoy(),
      elaboro: { nombre: v.preparedName, cargo: v.submittedAt ? `Enviado ${fechaFirma(v.submittedAt)}` : null },
      reviso: { nombre: v.reviewedName, cargo: v.reviewedAt ? `Revisado ${fechaFirma(v.reviewedAt)}` : null },
      aprobo: { nombre: v.approvedName, cargo: v.approvedAt ? `Firmado electrónicamente ${fechaFirma(v.approvedAt)}` : null },
    };
    const doc = new DocumentoPdf(ctx);
    if (v.status === 'borrador' || v.status === 'en_revision') {
      doc.parrafo(`${v.status === 'borrador' ? 'BORRADOR' : 'EN REVISIÓN'} — documento no aprobado, sin validez como copia controlada.`, { tamano: 9, color: '#9E2A1C', negrita: true });
      doc.espacio(4);
    } else if (v.status === 'obsoleto') {
      doc.parrafo('VERSIÓN OBSOLETA — reemplazada por una versión posterior.', { tamano: 9, color: '#9E2A1C', negrita: true });
      doc.espacio(4);
    }
    doc.textoConFormato(v.content);
    if (v.changeSummary) {
      doc.espacio(8);
      doc.tabla([{ titulo: 'Versión', ancho: 2, alinear: 'center' }, { titulo: 'Fecha', ancho: 3, alinear: 'center' }, { titulo: 'Descripción del cambio', ancho: 12 }], [[{ texto: String(v.version), alinear: 'center' }, { texto: v.effectiveOn ?? '—', alinear: 'center' }, v.changeSummary]], { tamano: 8 });
    }
    return { datos: await doc.terminar(), nombre: `${d.code}-v${v.version}.pdf` };
  }

  // Lista maestra -------------------------------------------------------------------------

  private async filasListaMaestra(orgId: string) {
    const { documentos } = await this.listar(orgId);
    return documentos;
  }

  async listaMaestraPdf(orgId: string) {
    const [docs, ctx] = await Promise.all([this.filasListaMaestra(orgId), this.formato.contexto(orgId, 'lista_maestra')]);
    const doc = new DocumentoPdf(ctx, true);
    doc.datos([['Documentos', String(docs.length)], ['Vigentes', String(docs.filter((d) => d.vigente).length)], ['Fecha de corte', hoy()]], 3);
    const estado = (d: DocumentoControlado): CeldaPdf =>
      d.vigente
        ? { texto: d.revisionVencida ? 'Vigente · revisar' : 'Vigente', fondo: d.revisionVencida ? '#FDE9B8' : '#CDEBD9', alinear: 'center', negrita: true }
        : { texto: d.enCurso ? ESTADO_TEXTO[d.enCurso.estado]! : 'Sin versión', fondo: '#DCE8F7', alinear: 'center' };
    doc.tabla(
      [
        { titulo: 'Código', ancho: 3.4 },
        { titulo: 'Documento', ancho: 9 },
        { titulo: 'Tipo', ancho: 3.2 },
        { titulo: 'Paso', ancho: 1.6, alinear: 'center' },
        { titulo: 'Versión', ancho: 1.8, alinear: 'center' },
        { titulo: 'Vigente desde', ancho: 2.8, alinear: 'center' },
        { titulo: 'Aprobó', ancho: 4 },
        { titulo: 'Responsable', ancho: 4 },
        { titulo: 'Retención', ancho: 3 },
        { titulo: 'Estado', ancho: 3, alinear: 'center' },
      ],
      docs.map((d) => [
        d.codigo,
        `${d.titulo}${d.enCurso && d.vigente ? `\nVersión ${d.enCurso.version} en ${d.enCurso.estado === 'borrador' ? 'borrador' : 'revisión'}` : ''}`,
        nombreDe(CLASES_DOCUMENTO, d.clase),
        { texto: d.pasoNumero ? String(d.pasoNumero) : '—', alinear: 'center' },
        { texto: d.vigente ? String(d.vigente.version) : '—', alinear: 'center' },
        { texto: d.vigente?.vigenteDesde ?? '—', alinear: 'center' },
        d.vigente?.aprobo ?? '—',
        d.responsable ?? '—',
        d.retencion ?? '—',
        estado(d),
      ]),
      { tamano: 7.5 },
    );
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-lista-maestra.pdf` };
  }

  async listaMaestraExcel(orgId: string) {
    const [docs, ctx] = await Promise.all([this.filasListaMaestra(orgId), this.formato.contexto(orgId, 'lista_maestra')]);
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Lista maestra',
        horizontal: true,
        columnas: [
          { titulo: 'Código', ancho: 16 },
          { titulo: 'Documento', ancho: 44 },
          { titulo: 'Tipo', ancho: 16 },
          { titulo: 'Paso PESV', ancho: 10 },
          { titulo: 'Paso (nombre)', ancho: 34 },
          { titulo: 'Versión vigente', ancho: 10 },
          { titulo: 'Vigente desde', ancho: 13 },
          { titulo: 'Elaboró', ancho: 22 },
          { titulo: 'Revisó', ancho: 22 },
          { titulo: 'Aprobó', ancho: 22 },
          { titulo: 'Divulgado', ancho: 13 },
          { titulo: 'Responsable', ancho: 22 },
          { titulo: 'Retención', ancho: 16 },
          { titulo: 'Estado', ancho: 14 },
        ],
        filas: docs.map((d): ValorExcel[] => [
          d.codigo,
          d.titulo,
          nombreDe(CLASES_DOCUMENTO, d.clase),
          d.pasoNumero,
          d.pasoNumero ? PASOS_PESV.find((p) => p.numero === d.pasoNumero)?.nombre ?? null : null,
          d.vigente?.version ?? null,
          d.vigente?.vigenteDesde ?? null,
          d.vigente?.elaboro ?? null,
          d.vigente?.reviso ?? null,
          d.vigente?.aprobo ?? null,
          d.vigente?.divulgacion?.fecha ?? null,
          d.responsable,
          d.retencion,
          d.vigente ? { valor: d.revisionVencida ? 'Vigente · revisar' : 'Vigente', fondo: d.revisionVencida ? '#FDE9B8' : '#CDEBD9' } : d.enCurso ? ESTADO_TEXTO[d.enCurso.estado]! : 'Sin versión',
        ]),
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-lista-maestra.xlsx` };
  }

  async evidenciaListaMaestra(orgId: string, actorId: string) {
    const { datos, nombre } = await this.listaMaestraPdf(orgId);
    const ev = await this.evidencias.crear(orgId, { titulo: `Lista maestra de documentos · ${hoy()}`, pasoNumero: 19, descripcion: 'Generada desde los documentos controlados de la plataforma.' }, { nombre, tipo: MIME_PDF, datos }, actorId);
    return { evidenciaId: ev.id };
  }
}

@Controller('org/documentos')
export class DocumentosControladosController {
  constructor(private readonly s: DocumentosControladosService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() o: OrgSesion) {
    return this.s.listar(o.id);
  }

  @Get('lista-maestra')
  @Permiso('ver')
  async listaMaestra(@Query('formato') formato: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.s.listaMaestraExcel(o.id) : await this.s.listaMaestraPdf(o.id);
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post('lista-maestra/evidencia')
  @Permiso('gestionar_pesv')
  evidenciaLista(@OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidenciaListaMaestra(o.id, u.id);
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(documentoControladoSchema)) b: DocumentoControladoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.crear(o.id, b, u);
  }

  @Get(':id')
  @Permiso('ver')
  detalle(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion) {
    return this.s.detalle(o.id, id);
  }

  @Put(':id')
  @Permiso('gestionar_pesv')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(documentoControladoSchema)) b: DocumentoControladoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.editar(o.id, id, b, u.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Put(':id/borrador')
  @Permiso('gestionar_pesv')
  borrador(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(borradorDocumentoSchema)) b: BorradorDocumentoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardarBorrador(o.id, id, b, u.id);
  }

  @Post(':id/borrador/archivo')
  @Permiso('gestionar_pesv')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: config.maxUploadBytes } }))
  adjuntar(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() archivo: Express.Multer.File | undefined, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    if (!archivo) throw new BadRequestException('Adjunta el archivo');
    return this.s.adjuntar(o.id, id, { nombre: Buffer.from(archivo.originalname, 'latin1').toString('utf8'), tipo: archivo.mimetype, datos: archivo.buffer }, u.id);
  }

  @Delete(':id/borrador/archivo')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async quitarArchivo(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.quitarArchivo(o.id, id, u.id);
  }

  @Post(':id/nueva-version')
  @Permiso('gestionar_pesv')
  nuevaVersion(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.nuevaVersion(o.id, id, u);
  }

  @Post(':id/enviar')
  @Permiso('gestionar_pesv')
  enviar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.enviar(o.id, id, u.id);
  }

  @Post(':id/revisar')
  @Permiso('gestionar_pesv')
  revisar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.revisar(o.id, id, u);
  }

  @Post(':id/devolver')
  @Permiso('gestionar_pesv')
  devolver(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(devolverDocumentoSchema)) b: { nota: string }, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.devolver(o.id, id, b.nota, u.id);
  }

  @Post(':id/aprobar')
  @Permiso('aprobar_evidencias')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(aprobarDocumentoSchema)) b: AprobarDocumentoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.aprobar(o.id, id, b, u);
  }

  @Post(':id/divulgacion')
  @Permiso('gestionar_pesv')
  divulgar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(divulgacionSchema)) b: DivulgacionInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.divulgar(o.id, id, b, u.id);
  }

  @Get(':id/versiones/:version/pdf')
  @Permiso('ver')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = await this.s.pdf(o.id, id, version);
    return enviarArchivo(res, r.datos, r.nombre, MIME_PDF);
  }

  @Get(':id/versiones/:version/archivo')
  @Permiso('ver')
  async archivo(@Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const r = await this.s.archivo(o.id, id, version);
    return enviarArchivo(res, r.datos, r.nombre, r.tipo);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [DocumentosControladosController], providers: [DocumentosControladosService], exports: [DocumentosControladosService] })
export class DocumentosControladosModule {}
