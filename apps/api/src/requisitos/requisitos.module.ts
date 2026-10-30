import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common';
import { requisitoPorId, resumenRequisitos, RES_40595_2022, verificarRequisitoSchema, type Nivel, type VerificarRequisitoInput } from '@pesv/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { fechaColombia } from '../common/fechas.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { classifications, evidenceLinks, evidences, organizations, stepCompliance, stepRequirementChecks } from '../db/schema.js';
import { evaluarRequisitos } from './evaluar.js';

/** Nivel vigente y fecha de registro de la organización (para las reglas por nivel y periodo). */
export async function contextoOrganizacion(tx: TenantTx, orgId: string) {
  const [c] = await tx.select({ nivel: classifications.level }).from(classifications).where(eq(classifications.organizationId, orgId)).orderBy(desc(classifications.createdAt)).limit(1);
  const [o] = await tx.select({ creada: organizations.createdAt }).from(organizations).where(eq(organizations.id, orgId));
  if (!c || !o) throw new NotFoundException('Organización no encontrada');
  return { nivel: c.nivel as Nivel, creada: fechaColombia(o.creada) };
}

/**
 * Requisitos de la Res. 40595 por paso y su verificación (RN-06): los automáticos se calculan con
 * los datos; los de registro los verifica el líder con una evidencia aprobada del paso.
 */
@Injectable()
export class RequisitosService {
  constructor(private readonly database: DatabaseService) {}

  todos(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const ctx = await contextoOrganizacion(tx, orgId);
      const aplicables = (await tx.select({ n: stepCompliance.stepNumber }).from(stepCompliance).where(and(eq(stepCompliance.organizationId, orgId), sql`${stepCompliance.status} <> 'no_aplica'`))).map((p) => p.n);
      const lista = await evaluarRequisitos(tx, { ...ctx, pasos: aplicables });
      return {
        nivel: ctx.nivel,
        resumen: resumenRequisitos(lista),
        porPaso: aplicables.sort((a, b) => a - b).map((paso) => ({ paso, ...resumenRequisitos(lista.filter((r) => r.paso === paso)) })),
      };
    });
  }

  delPaso(orgId: string, paso: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const ctx = await contextoOrganizacion(tx, orgId);
      const requisitos = await evaluarRequisitos(tx, { ...ctx, pasos: [paso] });
      const aprobadas = await tx
        .select({ id: evidences.id, titulo: evidences.title, aprobadaEl: evidences.approvedAt })
        .from(evidences)
        .innerJoin(evidenceLinks, eq(evidenceLinks.evidenceId, evidences.id))
        .where(and(eq(evidenceLinks.norm, 'PESV'), eq(evidenceLinks.ref, String(paso)), eq(evidences.status, 'aprobada')))
        .orderBy(desc(evidences.approvedAt));
      return { paso, nivel: ctx.nivel, version: RES_40595_2022.id, resumen: resumenRequisitos(requisitos), requisitos, evidenciasAprobadas: aprobadas };
    });
  }

  verificar(orgId: string, paso: number, requisitoId: string, input: VerificarRequisitoInput, actorId: string) {
    const requisito = requisitoPorId(requisitoId);
    if (!requisito || requisito.paso !== paso) throw new NotFoundException('Requisito no encontrado en este paso');
    if (requisito.verificacion.tipo !== 'registro') throw new BadRequestException('Este requisito se verifica solo con los datos de la plataforma');
    return this.database.withTenant(orgId, async (tx) => {
      const [estadoPaso] = await tx.select({ s: stepCompliance.status }).from(stepCompliance).where(eq(stepCompliance.stepNumber, paso));
      if (estadoPaso?.s === 'no_aplica') throw new BadRequestException('Este paso no aplica al nivel de la organización');
      if (input.evidenciaId) {
        const [e] = await tx
          .select({ id: evidences.id })
          .from(evidences)
          .innerJoin(evidenceLinks, eq(evidenceLinks.evidenceId, evidences.id))
          .where(and(eq(evidences.id, input.evidenciaId), eq(evidences.status, 'aprobada'), eq(evidenceLinks.norm, 'PESV'), eq(evidenceLinks.ref, String(paso))));
        if (!e) throw new BadRequestException('La evidencia debe estar aprobada y pertenecer a este paso');
      }
      const valores = { status: input.estado, note: input.nota, evidenceId: input.evidenciaId ?? null, checkedBy: actorId, checkedAt: new Date() };
      await tx
        .insert(stepRequirementChecks)
        .values({ organizationId: orgId, requirementId: requisitoId, stepNumber: paso, ...valores })
        .onConflictDoUpdate({ target: [stepRequirementChecks.organizationId, stepRequirementChecks.requirementId], set: valores });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'requisito.verificado', entidad: 'requirement', entidadId: requisitoId, datos: { paso, estado: input.estado, evidencia: input.evidenciaId ?? null } });
      return { requisito: requisitoId, estado: input.estado };
    });
  }
}

@Controller('org')
export class RequisitosController {
  constructor(private readonly service: RequisitosService) {}

  @Get('requisitos')
  @Permiso('ver')
  todos(@OrgActual() org: OrgSesion) {
    return this.service.todos(org.id);
  }

  @Get('pasos/:numero/requisitos')
  @Permiso('ver')
  delPaso(@Param('numero', ParseIntPipe) numero: number, @OrgActual() org: OrgSesion) {
    if (numero < 1 || numero > 24) throw new BadRequestException('Paso no válido');
    return this.service.delPaso(org.id, numero);
  }

  @Post('pasos/:numero/requisitos/:id')
  @Permiso('gestionar_pesv')
  verificar(
    @Param('numero', ParseIntPipe) numero: number,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verificarRequisitoSchema)) body: VerificarRequisitoInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.service.verificar(org.id, numero, id, body, usuario.id);
  }
}

@Module({ controllers: [RequisitosController], providers: [RequisitosService], exports: [RequisitosService] })
export class RequisitosModule {}
