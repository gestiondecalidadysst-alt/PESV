import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { and, count, eq, gte, lt } from 'drizzle-orm';
import { cumplimientoIso, FASES_PHVA, PASOS_PESV, pasosQueDependenDe, siguientesPasos } from '@pesv/shared';
import { AccionesModule, AccionesService } from '../acciones/acciones.module.js';
import { CapacitacionModule, CapacitacionService } from '../capacitacion/capacitacion.module.js';
import { DocumentosControladosModule, DocumentosControladosService } from '../documentos-controlados/documentos-controlados.module.js';
import { IndicadoresModule, IndicadoresService } from '../indicadores/indicadores.module.js';
import { MatrizModule, MatrizService } from '../matriz/matriz.module.js';
import { PlanTrabajoModule, PlanTrabajoService } from '../plan-trabajo/plan-trabajo.module.js';
import { OrgActual, Permiso, RequiereFuncion, type OrgSesion } from '../auth/decorators.js';
import { DatabaseService } from '../db/database.service.js';
import { evidences, inspections } from '../db/schema.js';
import { FlotaModule, FlotaService } from '../flota/flota.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

/** Inicio del día de hoy en Colombia (UTC-5, sin horario de verano). */
export function inicioDelDiaColombia(fecha = new Date()): Date {
  const local = new Date(fecha.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 5));
}

@Injectable()
export class TableroService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizaciones: OrganizationsService,
    private readonly flota: FlotaService,
    private readonly plan: PlanTrabajoService,
    private readonly formacion: CapacitacionService,
    private readonly indicadores: IndicadoresService,
    private readonly acciones: AccionesService,
    private readonly matriz: MatrizService,
    private readonly documentos: DocumentosControladosService,
  ) {}

  /**
   * Tablero de gestión: avance por fase, pasos que conviene trabajar, y el estado de los planes,
   * indicadores, acciones, riesgos y documentos (lo que conecta los pasos entre sí).
   */
  async gestion(orgId: string) {
    const anio = new Date().getFullYear();
    const [pasos, plan, formacion, indicadores, acciones, matriz, documentos] = await Promise.all([
      this.organizaciones.pasos(orgId),
      this.plan.consultar(orgId, anio),
      this.formacion.consultar(orgId, anio),
      this.indicadores.consultar(orgId, anio),
      this.acciones.plan(orgId),
      this.matriz.consultar(orgId),
      this.documentos.listar(orgId),
    ]);
    const estados = Object.fromEntries(pasos.map((p) => [p.numero, p.estado]));
    return {
      anio,
      porFase: FASES_PHVA.map((f) => {
        const de = pasos.filter((p) => p.fase === f.id && p.estado !== 'no_aplica');
        return { fase: f.id, aplicables: de.length, hechos: de.filter((p) => p.estado === 'hecho').length, enCurso: de.filter((p) => p.estado === 'en_curso').length };
      }),
      siguientes: siguientesPasos(estados, pasosQueDependenDe)
        .slice(0, 5)
        .map((n) => {
          const p = pasos.find((x) => x.numero === n)!;
          return { numero: n, nombre: PASOS_PESV.find((x) => x.numero === n)!.nombre, estado: p.estado, habilita: p.habilita.length, evidencias: p.evidencias.aprobadas };
        }),
      bloqueados: pasos.filter((p) => p.estado !== 'no_aplica' && p.estado !== 'hecho' && p.prerrequisitosPendientes.length > 0).length,
      planTrabajo: { cumplimiento: plan.resumen.cumplimiento, ejecucion: plan.resumen.ejecucion, atrasadas: plan.resumen.atrasadas, actividades: plan.resumen.actividades, porMes: plan.resumen.porMes },
      formacion: { cumplimiento: formacion.indicadores.cumplimiento, cobertura: formacion.indicadores.cobertura, eficacia: formacion.indicadores.eficacia },
      indicadores: indicadores.resumen,
      acciones: { abiertas: acciones.resumen.abiertas, vencidas: acciones.resumen.vencidas, porVencer: acciones.resumen.porVencer, cumplimientoATiempo: acciones.resumen.cumplimientoATiempo, hallazgosAbiertos: pasos.reduce((s, p) => s + p.hallazgosAbiertos, 0) },
      riesgos: {
        total: matriz.resumen.total,
        criticos: matriz.resumen.criticos,
        criticosSinMedida: matriz.riesgos.filter((r) => r.estado !== 'cerrado' && r.inherente?.critico && r.medidas.length === 0).length,
        porNivel: matriz.resumen.porNivel,
        metodologia: matriz.metodologia,
      },
      documentos: { tienePolitica: documentos.tienePolitica, vigentes: documentos.resumen.vigentes, enRevision: documentos.resumen.enRevision, porRevisar: documentos.resumen.revisionVencida },
    };
  }

  async iso(orgId: string) {
    const pasos = await this.organizaciones.pasos(orgId);
    return cumplimientoIso(Object.fromEntries(pasos.map((p) => [p.numero, p.estado])));
  }

  async resumen(orgId: string) {
    const desde = inicioDelDiaColombia();
    const hasta = new Date(desde.getTime() + 86_400_000);
    const [detalle, vehiculos, conductores, alertas, conteos, iso] = await Promise.all([
      this.organizaciones.obtener(orgId),
      this.flota.vehiculos(orgId),
      this.flota.conductores(orgId),
      this.flota.alertas(orgId),
      this.database.withTenant(orgId, async (tx) => {
        const hoy = await tx
          .select({ resultado: inspections.result, vehiculo: inspections.vehicleId })
          .from(inspections)
          .where(and(gte(inspections.performedAt, desde), lt(inspections.performedAt, hasta)));
        const [{ porRevisar } = { porRevisar: 0 }] = await tx
          .select({ porRevisar: count() })
          .from(evidences)
          .where(eq(evidences.status, 'borrador'));
        return { hoy, porRevisar };
      }),
      this.iso(orgId),
    ]);
    const operables = vehiculos.filter((v) => v.estado !== 'inactivo' && v.motorizado);
    const inspeccionados = new Set(conteos.hoy.map((i) => i.vehiculo));
    return {
      cumplimiento: detalle.resumen,
      iso: { porcentaje: iso.porcentaje, cubiertas: iso.cubiertas, evaluables: iso.evaluables },
      nivel: detalle.clasificacion?.level ?? null,
      flota: {
        vehiculos: vehiculos.filter((v) => v.estado !== 'inactivo').length,
        noAptos: vehiculos.filter((v) => v.estado === 'no_apto').length,
        conductoresActivos: conductores.filter((c) => c.activo).length,
      },
      preoperacionalesHoy: {
        esperados: operables.length,
        realizados: operables.filter((v) => inspeccionados.has(v.id)).length,
        fallasCriticas: conteos.hoy.filter((i) => i.resultado === 'falla_critica').length,
        fallasMenores: conteos.hoy.filter((i) => i.resultado === 'falla_menor').length,
      },
      evidenciasPorRevisar: conteos.porRevisar,
      alertas: alertas.slice(0, 8),
      totalAlertas: alertas.length,
    };
  }
}

@Controller('org/tablero')
export class TableroController {
  constructor(private readonly service: TableroService) {}

  @Get()
  @Permiso('ver')
  resumen(@OrgActual() org: OrgSesion) {
    return this.service.resumen(org.id);
  }

  @Get('gestion')
  @Permiso('ver')
  gestion(@OrgActual() org: OrgSesion) {
    return this.service.gestion(org.id);
  }

  /** Cumplimiento de ISO 39001 por cláusula, derivado del estado de los pasos (RN-07). */
  @Get('iso')
  @Permiso('ver')
  @RequiereFuncion('iso39001')
  iso(@OrgActual() org: OrgSesion) {
    return this.service.iso(org.id);
  }
}

@Module({ imports: [OrganizationsModule, FlotaModule, PlanTrabajoModule, CapacitacionModule, IndicadoresModule, AccionesModule, MatrizModule, DocumentosControladosModule], controllers: [TableroController], providers: [TableroService], exports: [TableroService] })
export class TableroModule {}
