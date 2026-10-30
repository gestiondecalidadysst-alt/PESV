import { BadRequestException, Injectable } from '@nestjs/common';
import { TIPOS_DOCUMENTO, type FormatoDocumentoInput, type FormatoGeneralInput, type TipoDocumento } from '@pesv/shared';
import { and, eq } from 'drizzle-orm';
import { auditar } from '../common/audit.js';
import { DatabaseService } from '../db/database.service.js';
import { documentFormats, documentSettings, organizations } from '../db/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { hoyColombia } from '../common/fechas.js';

export interface Firmante {
  nombre: string | null;
  cargo: string | null;
}

/** Todo lo que necesita el encabezado y el pie de un documento generado. */
export interface ContextoDocumento {
  organizacion: { nombre: string; nit: string };
  logo: { datos: Buffer; mime: 'image/png' | 'image/jpeg' } | null;
  color: string;
  pie: string | null;
  titulo: string;
  codigo: string;
  version: number;
  fechaVersion: string;
  elaboro: Firmante;
  reviso: Firmante;
  aprobo: Firmante;
}

const MAX_LOGO = 1024 * 1024;

/** Detecta PNG o JPEG por su firma binaria (no se confía en el tipo que declara el navegador). */
export function tipoDeImagen(datos: Buffer): 'image/png' | 'image/jpeg' | null {
  if (datos.length > 8 && datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (datos.length > 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'image/jpeg';
  return null;
}

const firmante = (nombre: string | null | undefined, cargo: string | null | undefined): Firmante => ({ nombre: nombre ?? null, cargo: cargo ?? null });
const hoy = hoyColombia;

/**
 * Identidad documental de la organización: logo y formato del sistema de gestión (prefijo de
 * códigos, pie, responsables y la versión de cada documento que genera la plataforma).
 */
@Injectable()
export class FormatoService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async consultar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
      const [g] = await tx.select().from(documentSettings).where(eq(documentSettings.organizationId, orgId));
      const formatos = await tx.select().from(documentFormats).where(eq(documentFormats.organizationId, orgId));
      const prefijo = g?.codePrefix ?? 'PESV';
      return {
        tieneLogo: !!org?.logoKey,
        logoActualizado: org?.logoUpdatedAt ?? null,
        general: {
          prefijo,
          pieTexto: g ? g.footerNote : 'Documento controlado. Toda copia impresa se considera no controlada.',
          colorPrimario: g?.primaryColor ?? '#0F1B2D',
          elaboro: firmante(g?.preparedName, g?.preparedRole),
          reviso: firmante(g?.reviewedName, g?.reviewedRole),
          aprobo: firmante(g?.approvedName, g?.approvedRole),
        },
        documentos: TIPOS_DOCUMENTO.map((t) => {
          const f = formatos.find((x) => x.docType === t.id);
          return {
            tipo: t.id,
            nombre: t.nombre,
            paso: t.paso,
            codigo: f?.code ?? `${prefijo}-${t.codigo}`,
            version: f?.version ?? 1,
            fechaVersion: f?.versionDate ?? null,
            personalizado: !!f,
            elaboro: firmante(f?.preparedName, f?.preparedRole),
            reviso: firmante(f?.reviewedName, f?.reviewedRole),
            aprobo: firmante(f?.approvedName, f?.approvedRole),
          };
        }),
      };
    });
  }

  guardarGeneral(orgId: string, input: FormatoGeneralInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        codePrefix: input.prefijo,
        footerNote: input.pieTexto ?? null,
        primaryColor: input.colorPrimario.toUpperCase(),
        preparedName: input.elaboro.nombre ?? null,
        preparedRole: input.elaboro.cargo ?? null,
        reviewedName: input.reviso.nombre ?? null,
        reviewedRole: input.reviso.cargo ?? null,
        approvedName: input.aprobo.nombre ?? null,
        approvedRole: input.aprobo.cargo ?? null,
        updatedBy: actorId,
        updatedAt: new Date(),
      };
      await tx
        .insert(documentSettings)
        .values({ organizationId: orgId, ...valores })
        .onConflictDoUpdate({ target: documentSettings.organizationId, set: valores });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'formato.general', entidad: 'document_settings', entidadId: orgId });
      return input;
    });
  }

  guardarDocumento(orgId: string, input: FormatoDocumentoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        code: input.codigo,
        version: input.version,
        versionDate: input.fechaVersion,
        preparedName: input.elaboro.nombre ?? null,
        preparedRole: input.elaboro.cargo ?? null,
        reviewedName: input.reviso.nombre ?? null,
        reviewedRole: input.reviso.cargo ?? null,
        approvedName: input.aprobo.nombre ?? null,
        approvedRole: input.aprobo.cargo ?? null,
        updatedBy: actorId,
        updatedAt: new Date(),
      };
      await tx
        .insert(documentFormats)
        .values({ organizationId: orgId, docType: input.tipo, ...valores })
        .onConflictDoUpdate({ target: [documentFormats.organizationId, documentFormats.docType], set: valores });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'formato.documento', entidad: 'document_format', entidadId: null, datos: { tipo: input.tipo, version: input.version } });
      return input;
    });
  }

  // Logo ------------------------------------------------------------------------

  async subirLogo(orgId: string, datos: Buffer, actorId: string) {
    if (datos.length > MAX_LOGO) throw new BadRequestException('El logo debe pesar máximo 1 MB');
    const mime = tipoDeImagen(datos);
    if (!mime) throw new BadRequestException('El logo debe ser una imagen PNG o JPG');
    const clave = `${orgId}/marca/logo.${mime === 'image/png' ? 'png' : 'jpg'}`;
    await this.storage.guardar(clave, datos, mime);
    await this.database.withTenant(orgId, async (tx) => {
      await tx.update(organizations).set({ logoKey: clave, logoMime: mime, logoUpdatedAt: new Date() }).where(eq(organizations.id, orgId));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'formato.logo', entidad: 'organization', entidadId: orgId });
    });
    return { tieneLogo: true };
  }

  async borrarLogo(orgId: string, actorId: string) {
    await this.database.withTenant(orgId, async (tx) => {
      await tx.update(organizations).set({ logoKey: null, logoMime: null, logoUpdatedAt: new Date() }).where(eq(organizations.id, orgId));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'formato.logo_retirado', entidad: 'organization', entidadId: orgId });
    });
  }

  async logo(orgId: string): Promise<ContextoDocumento['logo']> {
    const [org] = await this.database.withTenant(orgId, (tx) => tx.select().from(organizations).where(eq(organizations.id, orgId)));
    if (!org?.logoKey || !org.logoMime) return null;
    try {
      return { datos: await this.storage.leer(org.logoKey), mime: org.logoMime as 'image/png' | 'image/jpeg' };
    } catch {
      return null;
    }
  }

  // Contexto para generar documentos ------------------------------------------------

  /**
   * Encabezado y pie de un documento: los responsables del documento si se definieron, y si no los
   * generales del formato.
   */
  async contexto(orgId: string, tipo: TipoDocumento, titulo?: string): Promise<ContextoDocumento> {
    const [datos, logo] = await Promise.all([
      this.database.withTenant(orgId, async (tx) => {
        const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
        const [g] = await tx.select().from(documentSettings).where(eq(documentSettings.organizationId, orgId));
        const [f] = await tx.select().from(documentFormats).where(and(eq(documentFormats.organizationId, orgId), eq(documentFormats.docType, tipo)));
        return { org: org!, g, f };
      }),
      this.logo(orgId),
    ]);
    const { org, g, f } = datos;
    const def = TIPOS_DOCUMENTO.find((t) => t.id === tipo)!;
    const elegir = (a: string | null | undefined, b: string | null | undefined) => a || b || null;
    return {
      organizacion: { nombre: org.name, nit: org.nit },
      logo,
      color: g?.primaryColor ?? '#0F1B2D',
      pie: g ? g.footerNote : 'Documento controlado. Toda copia impresa se considera no controlada.',
      titulo: titulo ?? def.nombre,
      codigo: f?.code ?? `${g?.codePrefix ?? 'PESV'}-${def.codigo}`,
      version: f?.version ?? 1,
      fechaVersion: f?.versionDate ?? hoy(),
      elaboro: firmante(elegir(f?.preparedName, g?.preparedName), elegir(f?.preparedRole, g?.preparedRole)),
      reviso: firmante(elegir(f?.reviewedName, g?.reviewedName), elegir(f?.reviewedRole, g?.reviewedRole)),
      aprobo: firmante(elegir(f?.approvedName, g?.approvedName), elegir(f?.approvedRole, g?.approvedRole)),
    };
  }
}
