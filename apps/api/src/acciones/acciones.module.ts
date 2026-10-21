import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  accionSchema,
  cerrarAccionSchema,
  cerrarHallazgoPasoSchema,
  diasHasta,
  FUENTES_HALLAZGO,
  hallazgoPasoSchema,
  ORIGENES_ACCION,
  PASOS_PESV,
  TIPOS_ACCION,
  TIPOS_HALLAZGO_PASO,
  type AccionInput,
  type HallazgoPasoInput,
} from '@pesv/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { actions, stepCompliance, stepFindings } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf, type CeldaPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';

type FilaAccion = typeof actions.$inferSelect;
type FilaHallazgo = typeof stepFindings.$inferSelect;

const hoy = () => new Date().toISOString().slice(0, 10);
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';

/** Paso del PESV que corresponde a una acción según su origen (si no se indicó). */
const pasoPorOrigen = (origen: string) => ORIGENES_ACCION.find((o) => o.id === origen)?.paso ?? null;

export const aAccion = (a: FilaAccion) => ({
  id: a.id,
  origen: a.source,
  origenId: a.sourceId,
  pasoNumero: a.stepNumber,
  tipo: a.kind,
  descripcion: a.description,
  responsable: a.responsibleName,
  responsableUsuarioId: a.responsibleUserId,
  venceEl: a.dueOn,
  estado: a.status,
  vencida: a.status === 'abierta' && diasHasta(a.dueOn) < 0,
  diasParaVencer: a.status === 'abierta' ? diasHasta(a.dueOn) : null,
  cerradaATiempo: a.status === 'cerrada' && a.closedAt ? a.closedAt.toISOString().slice(0, 10) <= a.dueOn : null,
  notaCierre: a.closureNote,
  cerradaEn: a.closedAt,
  creadaEn: a.createdAt,
});
export type Accion = ReturnType<typeof aAccion>;

/** Inserta una acción dentro de una transacción existente (comité, siniestros, auditorías…). */
export async function crearAccion(tx: TenantTx, orgId: string, input: AccionInput, actorId: string) {
  const [a] = await tx
    .insert(actions)
    .values({
      organizationId: orgId,
      source: input.origen,
      sourceId: input.origenId ?? null,
      kind: input.tipo,
      description: input.descripcion,
      responsibleName: input.responsable,
      responsibleUserId: input.responsableUsuarioId ?? null,
      dueOn: input.venceEl,
      stepNumber: input.pasoNumero ?? pasoPorOrigen(input.origen),
      createdBy: actorId,
    })
    .returning();
  await auditar(tx, { organizacionId: orgId, actorId, accion: 'accion.creada', entidad: 'action', entidadId: a!.id, datos: { origen: input.origen } });
  return a!;
}

const aHallazgo = (h: FilaHallazgo, acciones: FilaAccion[]) => {
  const propias = acciones.filter((a) => a.source === 'paso' && a.sourceId === h.id).map(aAccion);
  return {
    id: h.id,
    pasoNumero: h.stepNumber,
    tipo: h.kind as HallazgoPasoInput['tipo'],
    fuente: h.origin as HallazgoPasoInput['fuente'],
    descripcion: h.description,
    causa: h.cause,
    detectadoEl: h.detectedOn,
    estado: h.status as 'abierto' | 'cerrado',
    notaCierre: h.closureNote,
    cerradoEn: h.closedAt,
    acciones: propias,
    /** Se puede cerrar cuando tiene al menos una acción y todas están cerradas. */
    listoParaCerrar: h.status === 'abierto' && propias.length > 0 && propias.every((a) => a.estado === 'cerrada'),
  };
};
export type HallazgoPaso = ReturnType<typeof aHallazgo>;

/**
 * Plan de acción unificado (paso 23) y hallazgos de los pasos. Toda acción, venga del comité, un
 * siniestro, una auditoría, un indicador, la matriz o un hallazgo de un paso, queda aquí con su
 * paso del PESV, responsable y fecha.
 */
@Injectable()
export class AccionesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  listar(orgId: string, filtros: { estado?: string; origen?: string; origenId?: string; paso?: number }) {
    return this.database.withTenant(orgId, async (tx) =>
      (
        await tx
          .select()
          .from(actions)
          .where(
            and(
              filtros.estado ? eq(actions.status, filtros.estado) : undefined,
              filtros.origen ? eq(actions.source, filtros.origen) : undefined,
              filtros.origenId ? eq(actions.sourceId, filtros.origenId) : undefined,
              filtros.paso ? eq(actions.stepNumber, filtros.paso) : undefined,
            ),
          )
          .orderBy(asc(actions.status), asc(actions.dueOn))
      ).map(aAccion),
    );
  }

  /** Plan de acción con su resumen: por origen, por paso, vencidas y cumplimiento a tiempo. */
  async plan(orgId: string) {
    const todas = await this.listar(orgId, {});
    const abiertas = todas.filter((a) => a.estado === 'abierta');
    const cerradas = todas.filter((a) => a.estado === 'cerrada');
    const conVencimiento = todas.filter((a) => a.venceEl <= hoy());
    const aTiempo = conVencimiento.filter((a) => a.cerradaATiempo).length;
    return {
      acciones: todas,
      resumen: {
        total: todas.length,
        abiertas: abiertas.length,
        vencidas: abiertas.filter((a) => a.vencida).length,
        porVencer: abiertas.filter((a) => !a.vencida && (a.diasParaVencer ?? 99) <= 15).length,
        cerradas: cerradas.length,
        cumplimientoATiempo: conVencimiento.length ? Math.round((aTiempo / conVencimiento.length) * 1000) / 10 : null,
        porOrigen: ORIGENES_ACCION.map((o) => ({
          origen: o.id,
          abiertas: abiertas.filter((a) => a.origen === o.id).length,
          cerradas: cerradas.filter((a) => a.origen === o.id).length,
        })).filter((o) => o.abiertas + o.cerradas > 0),
        porPaso: [...new Set(todas.map((a) => a.pasoNumero).filter((p): p is number => p != null))]
          .sort((a, b) => a - b)
          .map((p) => ({ paso: p, abiertas: abiertas.filter((a) => a.pasoNumero === p).length, vencidas: abiertas.filter((a) => a.pasoNumero === p && a.vencida).length })),
      },
    };
  }

  crear(orgId: string, input: AccionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => aAccion(await crearAccion(tx, orgId, input, actorId)));
  }

  cerrar(orgId: string, id: string, nota: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [a] = await tx
        .update(actions)
        .set({ status: 'cerrada', closureNote: nota, closedAt: new Date(), closedBy: actorId })
        .where(and(eq(actions.id, id), eq(actions.status, 'abierta')))
        .returning();
      if (!a) throw new BadRequestException('La acción no existe o ya está cerrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'accion.cerrada', entidad: 'action', entidadId: id });
      return aAccion(a);
    });
  }

  // Hallazgos de los pasos ---------------------------------------------------------------

  private async hallazgo(tx: TenantTx, id: string) {
    const [h] = await tx.select().from(stepFindings).where(eq(stepFindings.id, id));
    if (!h) throw new NotFoundException('Hallazgo no encontrado');
    return h;
  }

  hallazgos(orgId: string, paso?: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(stepFindings).where(paso ? eq(stepFindings.stepNumber, paso) : undefined).orderBy(asc(stepFindings.status), desc(stepFindings.detectedOn));
      const acciones = filas.length ? await tx.select().from(actions).where(and(eq(actions.source, 'paso'), inArray(actions.sourceId, filas.map((f) => f.id)))) : [];
      return filas.map((f) => aHallazgo(f, acciones));
    });
  }

  registrarHallazgo(orgId: string, paso: number, input: HallazgoPasoInput, actorId: string) {
    if (input.detectadoEl > hoy()) throw new BadRequestException('La fecha no puede ser futura');
    return this.database.withTenant(orgId, async (tx) => {
      const [p] = await tx.select({ status: stepCompliance.status }).from(stepCompliance).where(eq(stepCompliance.stepNumber, paso));
      if (!p) throw new NotFoundException('Paso no encontrado');
      if (p.status === 'no_aplica') throw new BadRequestException('Este paso no aplica al nivel de la organización');
      const [h] = await tx
        .insert(stepFindings)
        .values({ organizationId: orgId, stepNumber: paso, kind: input.tipo, origin: input.fuente, description: input.descripcion, cause: input.causa ?? null, detectedOn: input.detectadoEl, createdBy: actorId })
        .returning();
      // Una no conformidad reabre el paso si estaba hecho: no se puede dar por cumplido.
      if (input.tipo === 'no_conformidad' && p.status === 'hecho') {
        await tx.update(stepCompliance).set({ status: 'en_curso', updatedBy: actorId, updatedAt: new Date() }).where(eq(stepCompliance.stepNumber, paso));
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'paso.hallazgo', entidad: 'step_finding', entidadId: h!.id, datos: { paso, tipo: input.tipo } });
      return aHallazgo(h!, []);
    });
  }

  accionDeHallazgo(orgId: string, id: string, input: AccionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const h = await this.hallazgo(tx, id);
      if (h.status === 'cerrado') throw new BadRequestException('El hallazgo ya se cerró');
      if (input.venceEl < hoy()) throw new BadRequestException('La fecha límite no puede estar en el pasado');
      // Una no conformidad se trata con una acción correctiva.
      const tipo = h.kind === 'no_conformidad' ? 'correctiva' : input.tipo === 'compromiso' ? 'mejora' : input.tipo;
      return aAccion(await crearAccion(tx, orgId, { ...input, tipo, origen: 'paso', origenId: h.id, pasoNumero: h.stepNumber }, actorId));
    });
  }

  cerrarHallazgo(orgId: string, id: string, nota: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const h = await this.hallazgo(tx, id);
      if (h.status === 'cerrado') throw new BadRequestException('El hallazgo ya se cerró');
      const propias = await tx.select().from(actions).where(and(eq(actions.source, 'paso'), eq(actions.sourceId, id)));
      if (!propias.length) throw new BadRequestException('Registra al menos una acción para tratar el hallazgo');
      if (propias.some((a) => a.status !== 'cerrada')) throw new BadRequestException('Cierra primero todas las acciones del hallazgo');
      await tx.update(stepFindings).set({ status: 'cerrado', closureNote: nota, closedAt: new Date(), closedBy: actorId }).where(eq(stepFindings.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'paso.hallazgo_cerrado', entidad: 'step_finding', entidadId: id });
      return { estado: 'cerrado' };
    });
  }

  // Documentos ------------------------------------------------------------------------

  private estadoAccion(a: Accion): CeldaPdf {
    if (a.estado === 'cerrada') return { texto: a.cerradaATiempo ? 'Cerrada a tiempo' : 'Cerrada tarde', fondo: a.cerradaATiempo ? '#CDEBD9' : '#FDE9B8', alinear: 'center' };
    return a.vencida ? { texto: 'Vencida', fondo: '#F8C9C4', negrita: true, alinear: 'center' } : { texto: 'Abierta', fondo: '#DCE8F7', alinear: 'center' };
  }

  async pdf(orgId: string) {
    const [{ acciones, resumen }, hallazgos, ctx] = await Promise.all([this.plan(orgId), this.hallazgos(orgId), this.formato.contexto(orgId, 'plan_accion')]);
    const doc = new DocumentoPdf(ctx, true);
    doc.datos(
      [
        ['Acciones abiertas', `${resumen.abiertas} (${resumen.vencidas} vencidas)`],
        ['Acciones cerradas', String(resumen.cerradas)],
        ['Cerradas a tiempo', resumen.cumplimientoATiempo == null ? '—' : `${resumen.cumplimientoATiempo} %`],
        ['Fecha de corte', hoy()],
      ],
      4,
    );
    const abiertosH = hallazgos.filter((h) => h.estado === 'abierto');
    if (abiertosH.length) {
      doc.titulo('Hallazgos abiertos de los pasos');
      doc.tabla(
        [{ titulo: 'Paso', ancho: 1.6, alinear: 'center' }, { titulo: 'Tipo', ancho: 3.4 }, { titulo: 'Hallazgo', ancho: 12 }, { titulo: 'Causa', ancho: 8 }, { titulo: 'Detectado', ancho: 2.6, alinear: 'center' }, { titulo: 'Acciones', ancho: 3, alinear: 'center' }],
        abiertosH.map((h) => [
          { texto: String(h.pasoNumero), alinear: 'center' },
          nombreDe(TIPOS_HALLAZGO_PASO, h.tipo),
          h.descripcion,
          h.causa ?? '—',
          { texto: h.detectadoEl, alinear: 'center' },
          { texto: `${h.acciones.filter((a) => a.estado === 'cerrada').length}/${h.acciones.length}`, alinear: 'center' },
        ]),
        { tamano: 7.5 },
      );
    }
    doc.titulo('Plan de acción');
    doc.tabla(
      [
        { titulo: 'Paso', ancho: 1.6, alinear: 'center' },
        { titulo: 'Origen', ancho: 4 },
        { titulo: 'Tipo', ancho: 2.8 },
        { titulo: 'Acción', ancho: 13 },
        { titulo: 'Responsable', ancho: 4.5 },
        { titulo: 'Fecha límite', ancho: 2.8, alinear: 'center' },
        { titulo: 'Estado', ancho: 3.2, alinear: 'center' },
        { titulo: 'Cierre', ancho: 7 },
      ],
      acciones.map((a) => [
        { texto: a.pasoNumero ? String(a.pasoNumero) : '—', alinear: 'center' },
        nombreDe(ORIGENES_ACCION, a.origen),
        nombreDe(TIPOS_ACCION, a.tipo),
        a.descripcion,
        a.responsable,
        { texto: a.venceEl, alinear: 'center' },
        this.estadoAccion(a),
        a.notaCierre ? `${a.notaCierre}${a.cerradaEn ? ` (${a.cerradaEn.toISOString().slice(0, 10)})` : ''}` : '—',
      ]),
      { tamano: 7.2 },
    );
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-plan-de-accion.pdf` };
  }

  async excel(orgId: string) {
    const [{ acciones }, hallazgos, ctx] = await Promise.all([this.plan(orgId), this.hallazgos(orgId), this.formato.contexto(orgId, 'plan_accion')]);
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Plan de acción',
        horizontal: true,
        columnas: [
          { titulo: 'Paso', ancho: 7 },
          { titulo: 'Nombre del paso', ancho: 30 },
          { titulo: 'Origen', ancho: 22 },
          { titulo: 'Tipo', ancho: 12 },
          { titulo: 'Acción', ancho: 60 },
          { titulo: 'Responsable', ancho: 22 },
          { titulo: 'Fecha límite', ancho: 12 },
          { titulo: 'Estado', ancho: 16 },
          { titulo: 'Cerrada el', ancho: 12 },
          { titulo: 'Nota de cierre', ancho: 50 },
        ],
        filas: acciones.map((a): ValorExcel[] => [
          a.pasoNumero,
          a.pasoNumero ? (PASOS_PESV.find((p) => p.numero === a.pasoNumero)?.nombre ?? null) : null,
          nombreDe(ORIGENES_ACCION, a.origen),
          nombreDe(TIPOS_ACCION, a.tipo),
          a.descripcion,
          a.responsable,
          a.venceEl,
          (() => {
            const e = this.estadoAccion(a);
            return { valor: e.texto, fondo: e.fondo };
          })(),
          a.cerradaEn ? a.cerradaEn.toISOString().slice(0, 10) : null,
          a.notaCierre,
        ]),
      },
      {
        nombre: 'Hallazgos de pasos',
        columnas: [
          { titulo: 'Paso', ancho: 7 },
          { titulo: 'Tipo', ancho: 20 },
          { titulo: 'Fuente', ancho: 22 },
          { titulo: 'Hallazgo', ancho: 60 },
          { titulo: 'Causa', ancho: 40 },
          { titulo: 'Detectado', ancho: 12 },
          { titulo: 'Estado', ancho: 10 },
          { titulo: 'Acciones cerradas', ancho: 16 },
          { titulo: 'Cierre', ancho: 40 },
        ],
        filas: hallazgos.map((h): ValorExcel[] => [
          h.pasoNumero,
          nombreDe(TIPOS_HALLAZGO_PASO, h.tipo),
          nombreDe(FUENTES_HALLAZGO, h.fuente),
          h.descripcion,
          h.causa,
          h.detectadoEl,
          h.estado === 'abierto' ? 'Abierto' : 'Cerrado',
          `${h.acciones.filter((a) => a.estado === 'cerrada').length} de ${h.acciones.length}`,
          h.notaCierre,
        ]),
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-plan-de-accion.xlsx` };
  }

  async evidencia(orgId: string, actorId: string) {
    const { datos, nombre } = await this.pdf(orgId);
    const ev = await this.evidencias.crear(orgId, { titulo: `Plan de acción y mejora · ${hoy()}`, pasoNumero: 23, descripcion: 'Generado desde el plan de acción unificado de la plataforma.' }, { nombre, tipo: MIME_PDF, datos }, actorId);
    return { evidenciaId: ev.id };
  }
}

@Controller('org/acciones')
export class AccionesController {
  constructor(private readonly service: AccionesService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion, @Query('estado') estado?: string, @Query('origen') origen?: string, @Query('origenId') origenId?: string, @Query('paso') paso?: string) {
    return this.service.listar(org.id, { estado, origen, origenId, paso: paso ? Number(paso) : undefined });
  }

  @Get('plan')
  @Permiso('ver')
  plan(@OrgActual() org: OrgSesion) {
    return this.service.plan(org.id);
  }

  @Get('exportar')
  @Permiso('ver')
  async exportar(@Query('formato') formato: string | undefined, @OrgActual() org: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.service.excel(org.id) : await this.service.pdf(org.id);
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post('evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.evidencia(org.id, u.id);
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(accionSchema)) body: AccionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crear(org.id, body, u.id);
  }

  @Post(':id/cerrar')
  @Permiso('comite')
  cerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cerrarAccionSchema)) body: { nota: string },
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.cerrar(org.id, id, body.nota, u.id);
  }
}

@Controller('org')
export class HallazgosPasoController {
  constructor(private readonly service: AccionesService) {}

  @Get('hallazgos')
  @Permiso('ver')
  todos(@OrgActual() org: OrgSesion) {
    return this.service.hallazgos(org.id);
  }

  @Get('pasos/:numero/hallazgos')
  @Permiso('ver')
  delPaso(@Param('numero', ParseIntPipe) numero: number, @OrgActual() org: OrgSesion) {
    return this.service.hallazgos(org.id, numero);
  }

  @Post('pasos/:numero/hallazgos')
  @Permiso('gestionar_pesv')
  registrar(@Param('numero', ParseIntPipe) numero: number, @Body(new ZodValidationPipe(hallazgoPasoSchema)) b: HallazgoPasoInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    if (numero < 1 || numero > 24) throw new BadRequestException('Paso no válido');
    return this.service.registrarHallazgo(org.id, numero, b, u.id);
  }

  @Post('hallazgos/:id/acciones')
  @Permiso('gestionar_pesv')
  accion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(accionSchema)) b: AccionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.accionDeHallazgo(org.id, id, b, u.id);
  }

  @Post('hallazgos/:id/cerrar')
  @Permiso('gestionar_pesv')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cerrarHallazgoPasoSchema)) b: { nota: string }, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.cerrarHallazgo(org.id, id, b.nota, u.id);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [AccionesController, HallazgosPasoController], providers: [AccionesService], exports: [AccionesService] })
export class AccionesModule {}
