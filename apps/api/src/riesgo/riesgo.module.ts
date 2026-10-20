import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { diasHasta, nivelSiniestro, puntajeConductor, puntajeVehiculo, type FactoresConductor } from '@pesv/shared';
import { sql } from 'drizzle-orm';
import { OrgActual, Permiso, type OrgSesion } from '../auth/decorators.js';
import { DatabaseService } from '../db/database.service.js';
import { FlotaModule, FlotaService } from '../flota/flota.module.js';
import { MantenimientoModule, MantenimientoService } from '../mantenimiento/mantenimiento.module.js';

/**
 * Puntaje de riesgo por conductor y por vehículo (RN-32): reglas fijas de @pesv/shared sobre
 * los datos de la organización. Sirve para priorizar capacitación, inspección y mantenimiento.
 */
@Injectable()
export class RiesgoService {
  constructor(
    private readonly database: DatabaseService,
    private readonly flota: FlotaService,
    private readonly mantenimiento: MantenimientoService,
  ) {}

  private async datos(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const siniestros = await tx.execute<{ driver_id: string | null; vehicle_id: string | null; fatalities: number; serious_injuries: number; minor_injuries: number }>(sql`
        select driver_id, vehicle_id, fatalities, serious_injuries, minor_injuries
          from crashes where occurred_at > now() - interval '12 months'`);
      const viajes = await tx.execute<{ driver_id: string; viajes: number; velocidad: number; jornada: number }>(sql`
        select driver_id, count(*)::int as viajes, count(*) filter (where speeding)::int as velocidad, count(*) filter (where over_shift)::int as jornada
          from trips where departure_at > now() - interval '90 days' and status <> 'cancelado' group by driver_id`);
      const capacitaciones = await tx.execute<{ driver_id: string; total: number }>(sql`
        select a.driver_id, count(distinct t.id)::int as total
          from training_attendance a join trainings t on t.id = a.training_id
         where a.attended and a.driver_id is not null and t.status = 'ejecutada' and t.executed_on > current_date - 365
         group by a.driver_id`);
      const inspecciones = await tx.execute<{ vehicle_id: string; criticas: number; menores: number; ultima: string | null }>(sql`
        select vehicle_id,
               count(*) filter (where result = 'falla_critica' and performed_at > now() - interval '90 days')::int as criticas,
               count(*) filter (where result = 'falla_menor' and performed_at > now() - interval '90 days')::int as menores,
               max(performed_at)::date::text as ultima
          from inspections group by vehicle_id`);
      return { siniestros: siniestros.rows, viajes: viajes.rows, capacitaciones: capacitaciones.rows, inspecciones: inspecciones.rows };
    });
  }

  async conductores(orgId: string) {
    const [conductores, d] = await Promise.all([this.flota.conductores(orgId), this.datos(orgId)]);
    return conductores
      .filter((c) => c.activo)
      .map((c) => {
        const propios = d.siniestros.filter((s) => s.driver_id === c.id);
        const porNivel = (n: string) =>
          propios.filter((s) => nivelSiniestro({ fallecidos: s.fatalities, heridosGraves: s.serious_injuries, heridosLeves: s.minor_injuries }) === n).length;
        const v = d.viajes.find((x) => x.driver_id === c.id);
        const factores: FactoresConductor = {
          siniestros: {
            conFallecidos: porNivel('con_fallecidos'),
            conLesionadosGraves: porNivel('con_lesionados_graves'),
            conLesionadosLeves: porNivel('con_lesionados_leves'),
            soloDanos: porNivel('solo_danos'),
          },
          viajes: v?.viajes ?? 0,
          excesosVelocidad: v?.velocidad ?? 0,
          excesosJornada: v?.jornada ?? 0,
          licencia: c.documentos.licencia,
          examenMedico: c.documentos.examenMedico,
          capacitaciones: d.capacitaciones.find((x) => x.driver_id === c.id)?.total ?? 0,
        };
        return { id: c.id, nombre: c.nombre, documento: c.documento, ...puntajeConductor(factores) };
      })
      .sort((a, b) => b.puntaje - a.puntaje);
  }

  async vehiculos(orgId: string) {
    const hoy = new Date();
    const [vehiculos, planes, d] = await Promise.all([this.flota.vehiculos(orgId), this.mantenimiento.planes(orgId), this.datos(orgId)]);
    return vehiculos
      .filter((v) => v.estado !== 'inactivo')
      .map((v) => {
        const i = d.inspecciones.find((x) => x.vehicle_id === v.id);
        const r = puntajeVehiculo(
          {
            motorizado: v.motorizado,
            modelo: v.modelo,
            fallasCriticas: i?.criticas ?? 0,
            fallasMenores: i?.menores ?? 0,
            diasSinPreoperacional: i?.ultima ? -diasHasta(i.ultima, hoy) : null,
            mantenimientosVencidos: planes.filter((p) => p.vehiculoId === v.id && p.estado === 'vencido').length,
            soat: v.documentos.soat,
            revisionTecnicoMecanica: v.documentos.rtm,
            siniestros: d.siniestros.filter((s) => s.vehicle_id === v.id).length,
          },
          hoy,
        );
        return { id: v.id, placa: v.placa, tipo: v.tipo, estado: v.estado, ...r };
      })
      .sort((a, b) => b.puntaje - a.puntaje);
  }
}

@Controller('org/riesgo')
export class RiesgoController {
  constructor(private readonly service: RiesgoService) {}

  @Get('conductores')
  @Permiso('ver')
  conductores(@OrgActual() org: OrgSesion) {
    return this.service.conductores(org.id);
  }

  @Get('vehiculos')
  @Permiso('ver')
  vehiculos(@OrgActual() org: OrgSesion) {
    return this.service.vehiculos(org.id);
  }
}

@Module({ imports: [FlotaModule, MantenimientoModule], controllers: [RiesgoController], providers: [RiesgoService], exports: [RiesgoService] })
export class RiesgoModule {}
