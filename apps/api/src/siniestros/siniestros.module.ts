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
  Patch,
  Post,
} from '@nestjs/common';
import {
  accionSchema,
  investigacionSchema,
  nivelSiniestro,
  siniestroSchema,
  type AccionInput,
  type InvestigacionInput,
  type SiniestroInput,
} from '@pesv/shared';
import { desc, eq } from 'drizzle-orm';
import { aAccion, crearAccion } from '../acciones/acciones.module.js';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { actions, classifications, crashInvestigations, crashes, drivers, vehicles } from '../db/schema.js';
import { EventosService } from '../eventos/eventos.service.js';
import { IaModule } from '../ia/ia.module.js';
import { IaService } from '../ia/ia.service.js';

type FilaSiniestro = typeof crashes.$inferSelect;
type FilaInvestigacion = typeof crashInvestigations.$inferSelect;

const aSiniestro = (s: FilaSiniestro, inv?: FilaInvestigacion | null) => ({
  id: s.id,
  ocurridoEn: s.occurredAt,
  lugar: s.location,
  municipio: s.municipality,
  vehiculoId: s.vehicleId,
  placa: s.plate,
  conductorId: s.driverId,
  conductorNombre: s.driverName,
  conductorDocumento: s.driverDocument,
  fallecidos: s.fatalities,
  heridosGraves: s.seriousInjuries,
  heridosLeves: s.minorInjuries,
  nivel: nivelSiniestro({ fallecidos: s.fatalities, heridosGraves: s.seriousInjuries, heridosLeves: s.minorInjuries }),
  numeroIpat: s.ipatNumber,
  autoridad: s.authority,
  descripcion: s.description,
  enMision: s.inMission,
  costoDirecto: s.directCost,
  costoIndirecto: s.indirectCost,
  revisadoPorComiteEl: s.committeeReviewedOn,
  estado: s.status,
  creadoEn: s.createdAt,
  investigacion: inv
    ? {
        obligatoria: inv.required,
        investigadores: inv.investigators,
        hechos: inv.facts,
        causasInmediatas: inv.immediateCauses,
        causasRaiz: inv.rootCauses,
        leccionesAprendidas: inv.lessonsLearned,
        estado: inv.status,
        cerradaEn: inv.closedAt,
      }
    : null,
});

@Injectable()
export class SiniestrosService {
  constructor(
    private readonly database: DatabaseService,
    private readonly eventos: EventosService,
    private readonly ia: IaService,
  ) {}

  listar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx
        .select({ s: crashes, i: crashInvestigations })
        .from(crashes)
        .leftJoin(crashInvestigations, eq(crashInvestigations.crashId, crashes.id))
        .orderBy(desc(crashes.occurredAt));
      return filas.map((f) => aSiniestro(f.s, f.i));
    });
  }

  private async buscar(tx: TenantTx, id: string) {
    const [f] = await tx
      .select({ s: crashes, i: crashInvestigations })
      .from(crashes)
      .leftJoin(crashInvestigations, eq(crashInvestigations.crashId, crashes.id))
      .where(eq(crashes.id, id));
    if (!f) throw new NotFoundException('Siniestro no encontrado');
    return f;
  }

  detalle(orgId: string, id: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const f = await this.buscar(tx, id);
      const acciones = await tx.select().from(actions).where(eq(actions.sourceId, id));
      return { ...aSiniestro(f.s, f.i), acciones: acciones.map(aAccion) };
    });
  }

  /**
   * Registra el siniestro con los datos mínimos del registro oficial (RN-19). En nivel estándar
   * y avanzado abre la investigación interna obligatoria y queda pendiente del comité (RN-20).
   */
  async crear(orgId: string, input: SiniestroInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      let placa = input.placa;
      if (input.vehiculoId) {
        const [v] = await tx.select({ plate: vehicles.plate }).from(vehicles).where(eq(vehicles.id, input.vehiculoId));
        if (!v) throw new NotFoundException('Vehículo no encontrado');
        placa = v.plate;
      }
      let nombre = input.conductorNombre;
      let documento = input.conductorDocumento;
      if (input.conductorId) {
        const [c] = await tx.select().from(drivers).where(eq(drivers.id, input.conductorId));
        if (!c) throw new NotFoundException('Conductor no encontrado');
        nombre = c.fullName;
        documento = c.documentNumber;
      }
      const [s] = await tx
        .insert(crashes)
        .values({
          organizationId: orgId,
          occurredAt: new Date(input.ocurridoEn),
          location: input.lugar,
          municipality: input.municipio ?? null,
          vehicleId: input.vehiculoId ?? null,
          plate: placa,
          driverId: input.conductorId ?? null,
          driverName: nombre,
          driverDocument: documento,
          fatalities: input.fallecidos,
          seriousInjuries: input.heridosGraves,
          minorInjuries: input.heridosLeves,
          ipatNumber: input.numeroIpat ?? null,
          authority: input.autoridad ?? null,
          description: input.descripcion,
          inMission: input.enMision,
          directCost: input.costoDirecto,
          indirectCost: input.costoIndirecto,
          createdBy: actorId,
        })
        .returning();
      const [clasificacion] = await tx
        .select({ level: classifications.level })
        .from(classifications)
        .orderBy(desc(classifications.createdAt))
        .limit(1);
      const obligatoria = clasificacion?.level === 'estandar' || clasificacion?.level === 'avanzado';
      const [inv] = await tx
        .insert(crashInvestigations)
        .values({ crashId: s!.id, organizationId: orgId, required: obligatoria })
        .returning();
      const nivel = nivelSiniestro({ fallecidos: input.fallecidos, heridosGraves: input.heridosGraves, heridosLeves: input.heridosLeves });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'siniestro.registrado', entidad: 'crash', entidadId: s!.id, datos: { nivel, placa } });
      await this.eventos.emitir(tx, orgId, 'siniestro.creado', {
        siniestroId: s!.id,
        placa,
        nivel,
        ocurridoEn: input.ocurridoEn,
        investigacionObligatoria: obligatoria,
      });
      return aSiniestro(s!, inv);
    });
  }

  async actualizarInvestigacion(orgId: string, id: string, input: InvestigacionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const actual = await this.buscar(tx, id);
      if (input.estado === 'cerrada' && (!input.causasRaiz || !input.leccionesAprendidas)) {
        throw new BadRequestException('Para cerrar la investigación registra las causas raíz y las lecciones aprendidas');
      }
      const [inv] = await tx
        .update(crashInvestigations)
        .set({
          investigators: input.investigadores ?? null,
          facts: input.hechos ?? null,
          immediateCauses: input.causasInmediatas ?? null,
          rootCauses: input.causasRaiz ?? null,
          lessonsLearned: input.leccionesAprendidas ?? null,
          status: input.estado,
          closedAt: input.estado === 'cerrada' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(crashInvestigations.crashId, id))
        .returning();
      const [s] = await tx
        .update(crashes)
        .set({
          status: input.estado === 'cerrada' ? 'cerrado' : input.estado === 'en_curso' ? 'en_investigacion' : actual.s.status,
          committeeReviewedOn: input.revisadoPorComiteEl ?? actual.s.committeeReviewedOn,
        })
        .where(eq(crashes.id, id))
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'siniestro.investigacion_actualizada', entidad: 'crash', entidadId: id, datos: { estado: input.estado } });
      return aSiniestro(s!, inv);
    });
  }

  crearAccion(orgId: string, id: string, input: AccionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.buscar(tx, id);
      return aAccion(await crearAccion(tx, orgId, { ...input, origen: 'siniestro', origenId: id }, actorId));
    });
  }

  async borradorIa(orgId: string, id: string, actorId: string) {
    const s = await this.detalle(orgId, id);
    const resumen = [
      `Fecha: ${s.ocurridoEn.toISOString()}`,
      `Lugar: ${s.lugar}${s.municipio ? `, ${s.municipio}` : ''}`,
      `Vehículo: ${s.placa}. Conductor: ${s.conductorNombre}.`,
      `Víctimas: ${s.fallecidos} fallecidos, ${s.heridosGraves} heridos graves, ${s.heridosLeves} heridos leves.`,
      `En misión: ${s.enMision ? 'sí' : 'no'}.`,
      `Relato: ${s.descripcion}`,
      s.investigacion?.hechos ? `Hechos ya registrados: ${s.investigacion.hechos}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return this.ia.investigarSiniestro(orgId, actorId, resumen);
  }
}

@Controller('org/siniestros')
export class SiniestrosController {
  constructor(private readonly service: SiniestrosService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion) {
    return this.service.listar(org.id);
  }

  @Get(':id')
  @Permiso('ver')
  detalle(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion) {
    return this.service.detalle(org.id, id);
  }

  @Post()
  @Permiso('gestionar_siniestros')
  crear(@Body(new ZodValidationPipe(siniestroSchema)) body: SiniestroInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crear(org.id, body, u.id);
  }

  @Patch(':id/investigacion')
  @Permiso('gestionar_siniestros')
  investigacion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(investigacionSchema)) body: InvestigacionInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.actualizarInvestigacion(org.id, id, body, u.id);
  }

  @Post(':id/acciones')
  @Permiso('gestionar_siniestros')
  accion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(accionSchema)) body: AccionInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.crearAccion(org.id, id, body, u.id);
  }

  @Post(':id/borrador-ia')
  @Permiso('gestionar_siniestros')
  borrador(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.borradorIa(org.id, id, u.id);
  }
}

@Module({ imports: [IaModule], controllers: [SiniestrosController], providers: [SiniestrosService], exports: [SiniestrosService] })
export class SiniestrosModule {}
