import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Res, StreamableFile } from '@nestjs/common';
import {
  diasHasta,
  FORMULARIOS_VIGIA,
  IDS_FORMULARIO_VIGIA,
  periodoAnterior,
  periodoDesdeId,
  type FormularioVigia,
  type Periodo,
} from '@pesv/shared';
import { and, desc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { DatabaseService } from '../db/database.service.js';
import { classifications, organizations, vigiaReports } from '../db/schema.js';
import { StorageService } from '../storage/storage.service.js';
import { calcularFormulario, type ResultadoFormulario } from './indicadores.js';

function validar(formulario: string, periodo: string): { form: FormularioVigia; p: Periodo } {
  if (!IDS_FORMULARIO_VIGIA.includes(formulario as FormularioVigia)) throw new BadRequestException('Formulario desconocido');
  const form = formulario as FormularioVigia;
  const p = periodoDesdeId(periodo);
  const def = FORMULARIOS_VIGIA.find((f) => f.id === form)!;
  if (!p) throw new BadRequestException('Periodo inválido: usa AAAA-MM o AAAA-T1…T4');
  if ((def.periodicidad === 'mensual') !== /^\d{4}-\d{2}$/.test(periodo)) {
    throw new BadRequestException(`El formulario ${def.nombre} es ${def.periodicidad}`);
  }
  return { form, p };
}

@Injectable()
export class VigiaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  private async reportaASupertransporte(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [c] = await tx.select().from(classifications).orderBy(desc(classifications.createdAt)).limit(1);
      return c?.reportsToSupertransporte ?? true;
    });
  }

  /** Último periodo cerrado de cada formulario, su plazo de referencia y su estado. */
  async calendario(orgId: string, hoy = new Date()) {
    const reporta = await this.reportaASupertransporte(orgId);
    const generados = await this.database.withTenant(orgId, (tx) => tx.select().from(vigiaReports));
    const formularios = await Promise.all(
      FORMULARIOS_VIGIA.map(async (f) => {
        const p = periodoAnterior(f.id, hoy);
        const r = generados.find((g) => g.form === f.id && g.period === p.id);
        const { problemas } = await this.database.withTenant(orgId, (tx) => calcularFormulario(tx, f.id, p));
        return {
          formulario: f.id,
          nombre: f.nombre,
          periodicidad: f.periodicidad,
          periodo: p,
          diasParaPlazo: diasHasta(p.plazo, hoy),
          estado: r?.status ?? 'pendiente',
          generadoEn: r?.generatedAt ?? null,
          enviadoEn: r?.sentAt ?? null,
          problemas: problemas.length,
        };
      }),
    );
    return { reportaASupertransporte: reporta, formularios };
  }

  async formulario(orgId: string, formulario: string, periodo: string) {
    const { form, p } = validar(formulario, periodo);
    const r = await this.database.withTenant(orgId, (tx) => calcularFormulario(tx, form, p));
    const [registro] = await this.database.withTenant(orgId, (tx) =>
      tx.select().from(vigiaReports).where(and(eq(vigiaReports.form, form), eq(vigiaReports.period, p.id))),
    );
    return {
      formulario: form,
      periodo: p,
      indicadores: r.indicadores,
      problemas: r.problemas,
      detalle: r.hojas.map((h) => ({ nombre: h.nombre, filas: h.filas.length })),
      estado: registro?.status ?? 'pendiente',
      generadoEn: registro?.generatedAt ?? null,
      enviadoEn: registro?.sentAt ?? null,
    };
  }

  private async excel(orgNombre: string, nit: string, titulo: string, p: Periodo, r: ResultadoFormulario) {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'PESV';
    const resumen = libro.addWorksheet('Resumen');
    resumen.addRow([titulo]).font = { bold: true, size: 14 };
    resumen.addRow([`${orgNombre} · NIT ${nit}`]);
    resumen.addRow([`Periodo: ${p.etiqueta} (${p.desde} a ${p.hasta})`]);
    resumen.addRow([]);
    resumen.addRow(['Indicador', 'Valor']).font = { bold: true };
    for (const i of r.indicadores) resumen.addRow([i.nombre, i.valor]);
    if (r.problemas.length) {
      resumen.addRow([]);
      resumen.addRow(['Datos por completar antes de cargar en VIGIA 2']).font = { bold: true };
      for (const pr of r.problemas) resumen.addRow([pr]);
    }
    resumen.getColumn(1).width = 70;
    resumen.getColumn(2).width = 18;
    for (const h of r.hojas) {
      const hoja = libro.addWorksheet(h.nombre.slice(0, 31));
      hoja.addRow(h.columnas).font = { bold: true };
      for (const f of h.filas) hoja.addRow(f);
      h.columnas.forEach((c, i) => (hoja.getColumn(i + 1).width = Math.max(14, c.length + 4)));
    }
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  /** Genera el archivo del formulario con los indicadores y los soportes calculados (RN-23). */
  async generar(orgId: string, formulario: string, periodo: string, actorId: string) {
    const { form, p } = validar(formulario, periodo);
    const def = FORMULARIOS_VIGIA.find((f) => f.id === form)!;
    const [org] = await this.database.withTenant(orgId, (tx) => tx.select().from(organizations).where(eq(organizations.id, orgId)));
    const r = await this.database.withTenant(orgId, (tx) => calcularFormulario(tx, form, p));
    const archivo = await this.excel(org!.name, org!.nit, `VIGIA 2 · Formulario ${def.nombre}`, p, r);
    const nombre = `VIGIA2_${form}_${p.id}.xlsx`;
    const clave = `${orgId}/vigia/${form}/${p.id}.xlsx`;
    await this.storage.guardar(clave, archivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const valores = Object.fromEntries(r.indicadores.map((i) => [i.clave, i.valor]));
    await this.database.withTenant(orgId, async (tx) => {
      await tx
        .insert(vigiaReports)
        .values({ organizationId: orgId, form, period: p.id, fileKey: clave, fileName: nombre, indicators: valores, generatedBy: actorId })
        .onConflictDoUpdate({
          target: [vigiaReports.organizationId, vigiaReports.form, vigiaReports.period],
          set: { fileKey: clave, fileName: nombre, indicators: valores, generatedBy: actorId, generatedAt: new Date() },
        });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'vigia.generado', entidad: 'vigia_report', entidadId: `${form}:${p.id}`, datos: { problemas: r.problemas.length } });
    });
    return { archivo: nombre, problemas: r.problemas };
  }

  async archivo(orgId: string, formulario: string, periodo: string) {
    const { form, p } = validar(formulario, periodo);
    const [r] = await this.database.withTenant(orgId, (tx) => tx.select().from(vigiaReports).where(and(eq(vigiaReports.form, form), eq(vigiaReports.period, p.id))));
    if (!r?.fileKey) throw new NotFoundException('Genera primero el archivo del formulario');
    return { datos: await this.storage.leer(r.fileKey), nombre: r.fileName ?? `${form}.xlsx` };
  }

  async marcarEnviado(orgId: string, formulario: string, periodo: string, actorId: string) {
    const { form, p } = validar(formulario, periodo);
    return this.database.withTenant(orgId, async (tx) => {
      const [r] = await tx
        .update(vigiaReports)
        .set({ status: 'enviado', sentAt: new Date(), sentBy: actorId })
        .where(and(eq(vigiaReports.form, form), eq(vigiaReports.period, p.id)))
        .returning();
      if (!r) throw new BadRequestException('Genera primero el archivo del formulario');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'vigia.enviado', entidad: 'vigia_report', entidadId: `${form}:${p.id}` });
      return { estado: r.status, enviadoEn: r.sentAt };
    });
  }

  reportes(orgId: string) {
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({ formulario: vigiaReports.form, periodo: vigiaReports.period, estado: vigiaReports.status, generadoEn: vigiaReports.generatedAt, enviadoEn: vigiaReports.sentAt })
        .from(vigiaReports)
        .orderBy(desc(vigiaReports.generatedAt)),
    );
  }
}

@Controller('org/vigia')
export class VigiaController {
  constructor(private readonly s: VigiaService) {}

  @Get('calendario') @Permiso('ver')
  calendario(@OrgActual() o: OrgSesion) { return this.s.calendario(o.id); }

  @Get('reportes') @Permiso('ver')
  reportes(@OrgActual() o: OrgSesion) { return this.s.reportes(o.id); }

  @Get(':formulario/:periodo') @Permiso('ver')
  formulario(@Param('formulario') f: string, @Param('periodo') p: string, @OrgActual() o: OrgSesion) { return this.s.formulario(o.id, f, p); }

  @Post(':formulario/:periodo/generar') @Permiso('gestionar_pesv')
  generar(@Param('formulario') f: string, @Param('periodo') p: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.generar(o.id, f, p, u.id); }

  @Post(':formulario/:periodo/enviado') @Permiso('gestionar_pesv')
  enviado(@Param('formulario') f: string, @Param('periodo') p: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.marcarEnviado(o.id, f, p, u.id); }

  @Get(':formulario/:periodo/archivo') @Permiso('ver')
  async archivo(@Param('formulario') f: string, @Param('periodo') p: string, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const { datos, nombre } = await this.s.archivo(o.id, f, p);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    return new StreamableFile(datos);
  }
}

@Module({ controllers: [VigiaController], providers: [VigiaService], exports: [VigiaService] })
export class VigiaModule {}
