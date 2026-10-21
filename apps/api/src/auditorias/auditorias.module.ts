import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  accionSchema,
  auditoriaSchema,
  cerrarAuditoriaSchema,
  cerrarHallazgoSchema,
  exigeAccionCorrectiva,
  hallazgoSchema,
  importarSimulacroSchema,
  TIPOS_HALLAZGO,
  type AccionInput,
  type AuditoriaInput,
  type HallazgoInput,
} from '@pesv/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { aAccion, crearAccion } from '../acciones/acciones.module.js';
import { OrgActual, Permiso, RequiereFuncion, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { actions, auditFindings, audits } from '../db/schema.js';
import { EventosService } from '../eventos/eventos.service.js';
import { IaModule } from '../ia/ia.module.js';
import { IaService } from '../ia/ia.service.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

type FilaAuditoria = typeof audits.$inferSelect;
type FilaHallazgo = typeof auditFindings.$inferSelect;

const aAuditoria = (a: FilaAuditoria) => ({
  id: a.id,
  tipo: a.kind,
  alcance: a.scope,
  auditor: a.auditorName,
  auditorIndependiente: a.auditorIndependent,
  incluyeIso: a.includesIso,
  programadaEl: a.plannedOn,
  ejecutadaEl: a.executedOn,
  estado: a.status,
  conclusiones: a.conclusions,
  cerradaEn: a.closedAt,
});

const aHallazgo = (h: FilaHallazgo) => ({
  id: h.id,
  auditoriaId: h.auditId,
  tipo: h.kind,
  pasoNumero: h.stepNumber,
  clausulaIso: h.isoClause,
  descripcion: h.description,
  evidencia: h.evidence,
  causa: h.rootCause,
  generadoPorIa: h.aiGenerated,
  estado: h.status,
  verificacion: h.verification,
  cerradoEn: h.closedAt,
});

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Auditorías del PESV (paso 22) y mejora continua (paso 23). Cada no conformidad necesita
 * acciones correctivas cerradas y una verificación de eficacia para cerrarse (RN-33).
 */
@Injectable()
export class AuditoriasService {
  constructor(
    private readonly database: DatabaseService,
    private readonly eventos: EventosService,
    private readonly ia: IaService,
    private readonly organizaciones: OrganizationsService,
  ) {}

  listar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(audits).orderBy(desc(audits.plannedOn));
      const conteo = await tx
        .select({ auditId: auditFindings.auditId, status: auditFindings.status, total: sql<number>`count(*)::int` })
        .from(auditFindings)
        .groupBy(auditFindings.auditId, auditFindings.status);
      return filas.map((a) => ({
        ...aAuditoria(a),
        hallazgosAbiertos: conteo.find((c) => c.auditId === a.id && c.status === 'abierto')?.total ?? 0,
        hallazgosCerrados: conteo.find((c) => c.auditId === a.id && c.status === 'cerrado')?.total ?? 0,
      }));
    });
  }

  private async auditoria(tx: TenantTx, id: string) {
    const [a] = await tx.select().from(audits).where(eq(audits.id, id));
    if (!a) throw new NotFoundException('Auditoría no encontrada');
    return a;
  }

  private async hallazgo(tx: TenantTx, id: string) {
    const [h] = await tx.select().from(auditFindings).where(eq(auditFindings.id, id));
    if (!h) throw new NotFoundException('Hallazgo no encontrado');
    return h;
  }

  detalle(orgId: string, id: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const a = await this.auditoria(tx, id);
      const hallazgos = await tx.select().from(auditFindings).where(eq(auditFindings.auditId, id)).orderBy(asc(auditFindings.createdAt));
      const acciones = hallazgos.length
        ? await tx
            .select()
            .from(actions)
            .where(and(eq(actions.source, 'hallazgo'), inArray(actions.sourceId, hallazgos.map((h) => h.id))))
            .orderBy(asc(actions.createdAt))
        : [];
      return {
        ...aAuditoria(a),
        hallazgos: hallazgos.map((h) => ({ ...aHallazgo(h), acciones: acciones.filter((x) => x.sourceId === h.id).map(aAccion) })),
      };
    });
  }

  guardar(orgId: string, input: AuditoriaInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      if (id && (await this.auditoria(tx, id)).status === 'cerrada') throw new BadRequestException('La auditoría ya se cerró');
      const valores = {
        kind: input.tipo,
        scope: input.alcance,
        auditorName: input.auditor,
        auditorIndependent: input.auditorIndependiente,
        includesIso: input.incluyeIso,
        plannedOn: input.programadaEl,
        executedOn: input.ejecutadaEl ?? null,
        status: input.ejecutadaEl ? 'en_curso' : 'planeada',
      };
      const [a] = id
        ? await tx.update(audits).set(valores).where(eq(audits.id, id)).returning()
        : await tx.insert(audits).values({ organizationId: orgId, ...valores, createdBy: actorId }).returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'auditoria.actualizada' : 'auditoria.programada', entidad: 'audit', entidadId: a!.id });
      return aAuditoria(a!);
    });
  }

  private async insertarHallazgo(tx: TenantTx, orgId: string, auditoria: FilaAuditoria, input: HallazgoInput, actorId: string, generadoPorIa: boolean) {
    const [h] = await tx
      .insert(auditFindings)
      .values({
        organizationId: orgId,
        auditId: auditoria.id,
        kind: input.tipo,
        stepNumber: input.pasoNumero ?? null,
        isoClause: input.clausulaIso ?? null,
        description: input.descripcion,
        evidence: input.evidencia ?? null,
        rootCause: input.causa ?? null,
        aiGenerated: generadoPorIa,
        createdBy: actorId,
      })
      .returning();
    if (auditoria.status === 'planeada') {
      await tx.update(audits).set({ status: 'en_curso', executedOn: auditoria.executedOn ?? hoy() }).where(eq(audits.id, auditoria.id));
    }
    await this.eventos.emitir(tx, orgId, 'auditoria.hallazgo', {
      auditoriaId: auditoria.id,
      tipo: TIPOS_HALLAZGO.find((t) => t.id === input.tipo)?.nombre ?? input.tipo,
      paso: input.pasoNumero ?? null,
      clausulaIso: input.clausulaIso ?? null,
      descripcion: input.descripcion,
    });
    return h!;
  }

  agregarHallazgo(orgId: string, auditoriaId: string, input: HallazgoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const a = await this.auditoria(tx, auditoriaId);
      if (a.status === 'cerrada') throw new BadRequestException('La auditoría ya se cerró');
      const h = await this.insertarHallazgo(tx, orgId, a, input, actorId, false);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'auditoria.hallazgo', entidad: 'audit_finding', entidadId: h.id, datos: { tipo: input.tipo } });
      return aHallazgo(h);
    });
  }

  /** Registra los hallazgos del auditor simulado que la persona eligió (RN-10). */
  importarSimulacro(orgId: string, auditoriaId: string, hallazgos: HallazgoInput[], actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const a = await this.auditoria(tx, auditoriaId);
      if (a.status === 'cerrada') throw new BadRequestException('La auditoría ya se cerró');
      const creados = [];
      for (const h of hallazgos) creados.push(aHallazgo(await this.insertarHallazgo(tx, orgId, a, h, actorId, true)));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'auditoria.simulacro_importado', entidad: 'audit', entidadId: a.id, datos: { hallazgos: creados.length } });
      return creados;
    });
  }

  accion(orgId: string, hallazgoId: string, input: AccionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const h = await this.hallazgo(tx, hallazgoId);
      if (h.status === 'cerrado') throw new BadRequestException('El hallazgo ya se cerró');
      const tipo = exigeAccionCorrectiva(h.kind as HallazgoInput['tipo']) ? 'correctiva' : input.tipo;
      return aAccion(await crearAccion(tx, orgId, { ...input, tipo, origen: 'hallazgo', origenId: h.id, pasoNumero: h.stepNumber ?? 22 }, actorId));
    });
  }

  /** RN-33: una no conformidad se cierra con acciones cerradas y verificación de eficacia. */
  cerrarHallazgo(orgId: string, hallazgoId: string, verificacion: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const h = await this.hallazgo(tx, hallazgoId);
      if (h.status === 'cerrado') throw new BadRequestException('El hallazgo ya está cerrado');
      if (exigeAccionCorrectiva(h.kind as HallazgoInput['tipo'])) {
        const acciones = await tx.select().from(actions).where(and(eq(actions.source, 'hallazgo'), eq(actions.sourceId, h.id)));
        if (acciones.length === 0) throw new BadRequestException('Registra al menos una acción correctiva antes de cerrar la no conformidad');
        const abiertas = acciones.filter((a) => a.status !== 'cerrada').length;
        if (abiertas) throw new BadRequestException(`Faltan ${abiertas} acciones correctivas por cerrar`);
      }
      const [c] = await tx
        .update(auditFindings)
        .set({ status: 'cerrado', verification: verificacion, closedAt: new Date(), closedBy: actorId })
        .where(eq(auditFindings.id, h.id))
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'auditoria.hallazgo_cerrado', entidad: 'audit_finding', entidadId: h.id });
      return aHallazgo(c!);
    });
  }

  cerrar(orgId: string, id: string, conclusiones: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const a = await this.auditoria(tx, id);
      if (a.status === 'cerrada') throw new BadRequestException('La auditoría ya está cerrada');
      const [c] = await tx
        .update(audits)
        .set({ status: 'cerrada', conclusions: conclusiones, executedOn: a.executedOn ?? hoy(), closedAt: new Date() })
        .where(eq(audits.id, id))
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'auditoria.cerrada', entidad: 'audit', entidadId: id });
      return aAuditoria(c!);
    });
  }

  /** Material para el auditor simulado: estado de los pasos y señales operativas, sin datos personales. */
  private async materialSimulacro(orgId: string) {
    const [detalle, pasos] = await Promise.all([this.organizaciones.obtener(orgId), this.organizaciones.pasos(orgId)]);
    const { rows } = await this.database.withTenant(orgId, (tx) =>
      tx.execute<Record<string, number | string | null>>(sql`
        select
          (select count(*)::int from crashes c join crash_investigations i on i.crash_id = c.id
            where i.required and i.status <> 'cerrada') as investigaciones_abiertas,
          (select count(*)::int from crashes where committee_reviewed_on is null) as siniestros_sin_revision_comite,
          (select count(*)::int from actions where status = 'abierta' and due_on < current_date) as acciones_vencidas,
          (select max(scheduled_at)::date::text from committee_meetings where status in ('cerrada', 'firmada')) as ultima_reunion_comite,
          (select count(*)::int from road_risks) as riesgos_identificados,
          (select count(*)::int from goals where year = extract(year from current_date)) as metas_del_anio,
          (select count(*)::int from plan_activities where year = extract(year from current_date)) as actividades_plan,
          (select count(*)::int from plan_activities where year = extract(year from current_date) and status = 'ejecutada') as actividades_ejecutadas,
          (select count(*)::int from trainings where status = 'ejecutada' and executed_on > current_date - 365) as capacitaciones_12_meses,
          (select count(*)::int from work_orders where status <> 'cerrada') as ordenes_mantenimiento_abiertas,
          (select count(*)::int from audits where status = 'cerrada') as auditorias_cerradas`),
    );
    const c = detalle.clasificacion;
    return [
      `Nivel PESV: ${c?.level ?? 'sin clasificar'}${c?.voluntary ? ' (adopción voluntaria)' : ''}; ${c?.vehicles ?? 0} vehículos y ${c?.drivers ?? 0} conductores declarados.`,
      `Cumplimiento: ${detalle.resumen.hechos} de ${detalle.resumen.aplicables} pasos hechos (${detalle.resumen.porcentajeCumplimiento} %).`,
      'Pasos (número, nombre, estado, evidencias aprobadas/en revisión/rechazadas, cláusulas ISO):',
      ...pasos
        .filter((p) => p.estado !== 'no_aplica')
        .map((p) => `- Paso ${p.numero} ${p.nombre}: ${p.estado}; evidencias ${p.evidencias.aprobadas}/${p.evidencias.enRevision}/${p.evidencias.rechazadas}; ISO ${p.clausulasIso.join(', ') || '—'}`),
      'Señales operativas:',
      ...Object.entries(rows[0] ?? {}).map(([k, v]) => `- ${k.replaceAll('_', ' ')}: ${v ?? 'sin dato'}`),
    ].join('\n');
  }

  /** Preauditoría con IA: devuelve propuestas validadas; no guarda nada. */
  async simulacro(orgId: string, actorId: string) {
    const r = await this.ia.auditarSimulado(orgId, actorId, await this.materialSimulacro(orgId));
    const hallazgos = (Array.isArray(r.hallazgos) ? r.hallazgos : [])
      .map((h) => hallazgoSchema.safeParse(h))
      .filter((x) => x.success)
      .map((x) => x.data);
    return { resumen: typeof r.resumen === 'string' ? r.resumen : '', hallazgos };
  }
}

@Controller('org/auditorias')
export class AuditoriasController {
  constructor(private readonly service: AuditoriasService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion) {
    return this.service.listar(org.id);
  }

  @Post()
  @Permiso('auditar')
  crear(@Body(new ZodValidationPipe(auditoriaSchema)) body: AuditoriaInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.guardar(org.id, body, u.id);
  }

  @Post('simulacro')
  @Permiso('auditar')
  @RequiereFuncion('auditor_ia')
  simulacro(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.simulacro(org.id, u.id);
  }

  @Get(':id')
  @Permiso('ver')
  detalle(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion) {
    return this.service.detalle(org.id, id);
  }

  @Patch(':id')
  @Permiso('auditar')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(auditoriaSchema)) body: AuditoriaInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.guardar(org.id, body, u.id, id);
  }

  @Post(':id/hallazgos')
  @Permiso('auditar')
  hallazgo(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(hallazgoSchema)) body: HallazgoInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.agregarHallazgo(org.id, id, body, u.id);
  }

  @Post(':id/hallazgos/importar')
  @Permiso('auditar')
  importar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(importarSimulacroSchema)) body: { hallazgos: HallazgoInput[] },
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.importarSimulacro(org.id, id, body.hallazgos, u.id);
  }

  @Post(':id/cerrar')
  @Permiso('auditar')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cerrarAuditoriaSchema)) body: { conclusiones: string }, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.cerrar(org.id, id, body.conclusiones, u.id);
  }

  @Post('hallazgos/:hallazgoId/acciones')
  @Permiso('gestionar_pesv')
  accion(@Param('hallazgoId', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(accionSchema)) body: AccionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.accion(org.id, id, body, u.id);
  }

  @Post('hallazgos/:hallazgoId/cerrar')
  @Permiso('auditar')
  cerrarHallazgo(
    @Param('hallazgoId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cerrarHallazgoSchema)) body: { verificacion: string },
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.cerrarHallazgo(org.id, id, body.verificacion, u.id);
  }
}

@Module({ imports: [IaModule, OrganizationsModule], controllers: [AuditoriasController], providers: [AuditoriasService] })
export class AuditoriasModule {}
