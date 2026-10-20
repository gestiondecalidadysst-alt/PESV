import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { diasHasta } from '@pesv/shared';
import { and, eq, lte, sql } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { actions } from '../db/schema.js';
import { EventosService } from '../eventos/eventos.service.js';
import { FlotaModule, FlotaService } from '../flota/flota.module.js';
import { MantenimientoModule, MantenimientoService } from '../mantenimiento/mantenimiento.module.js';
import { RiesgoModule, RiesgoService } from '../riesgo/riesgo.module.js';
import { TableroModule, TableroService } from '../tablero/tablero.module.js';
import { VigiaModule, VigiaService } from '../vigia/vigia.module.js';

/** Umbral de aviso de vencimiento: se avisa una vez al entrar en cada tramo (30, 15 y 5 días). */
const tramo = (dias: number) => (dias <= 5 ? 5 : dias <= 15 ? 15 : 30);

/**
 * Tareas programadas: revisan cada hora vencimientos, mantenimientos, acciones y plazos de
 * VIGIA 2 en todas las organizaciones y emiten los eventos para n8n. Cada aviso tiene una
 * clave única, así no se repite aunque la tarea corra muchas veces.
 */
@Injectable()
export class TareasService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Tareas');
  private temporizador?: NodeJS.Timeout;
  private inicial?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseService,
    private readonly eventos: EventosService,
    private readonly flota: FlotaService,
    private readonly mantenimiento: MantenimientoService,
    private readonly vigia: VigiaService,
    private readonly tablero: TableroService,
    private readonly riesgo: RiesgoService,
  ) {}

  onModuleInit() {
    if (process.env.DISABLE_WORKERS === 'true') return;
    const correr = () => void this.ejecutar().catch((e) => this.log.error(e));
    this.inicial = setTimeout(correr, 30_000);
    this.temporizador = setInterval(correr, 3_600_000);
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
    if (this.inicial) clearTimeout(this.inicial);
  }

  async ejecutar(hoy = new Date()) {
    const { rows } = await this.database.db.execute<{ id: string }>(sql`select app_all_organization_ids() as id`);
    let emitidos = 0;
    for (const { id } of rows) {
      try {
        emitidos += await this.revisarOrganizacion(id, hoy);
      } catch (err) {
        this.log.error(`Organización ${id}: ${(err as Error).message}`);
      }
    }
    return { organizaciones: rows.length, emitidos };
  }

  async revisarOrganizacion(orgId: string, hoy = new Date()) {
    let emitidos = 0;
    const emitir = async (tipo: string, datos: Record<string, unknown>, clave: string) => {
      if (await this.eventos.emitirAhora(orgId, tipo, datos, clave)) emitidos++;
    };

    for (const a of await this.flota.alertas(orgId)) {
      if (a.tipo !== 'documento' || a.dias === undefined) continue;
      if (a.dias < 0) {
        await emitir('documento.vencido', { ...a }, `doc:${a.entidadId}:${a.titulo}:vencido:${a.vence}`);
      } else {
        await emitir('documento.por_vencer', { ...a }, `doc:${a.entidadId}:${a.titulo}:${tramo(a.dias)}:${a.vence}`);
      }
    }

    for (const p of await this.mantenimiento.planes(orgId)) {
      if (p.estado !== 'vencido') continue;
      await emitir(
        'mantenimiento.vencido',
        { placa: p.placa, plan: p.nombre, proximaFecha: p.proximaFecha, proximoKm: p.proximoKm, odometroActual: p.odometroActual },
        `mant:${p.id}:${p.proximaFecha ?? p.proximoKm}`,
      );
    }

    const limite = new Date(hoy.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    const proximas = await this.database.withTenant(orgId, (tx) =>
      tx.select().from(actions).where(and(eq(actions.status, 'abierta'), lte(actions.dueOn, limite))),
    );
    for (const a of proximas) {
      const vencida = diasHasta(a.dueOn, hoy) < 0;
      await emitir(
        'accion.por_vencer',
        { descripcion: a.description, responsable: a.responsibleName, venceEl: a.dueOn, origen: a.source, vencida },
        `accion:${a.id}:${a.dueOn}:${vencida ? 'vencida' : 'proxima'}`,
      );
    }

    const { reportaASupertransporte, formularios } = await this.vigia.calendario(orgId, hoy);
    if (reportaASupertransporte) {
      for (const f of formularios) {
        if (f.estado === 'enviado' || f.diasParaPlazo > 7) continue;
        await emitir(
          'vigia.plazo',
          { formulario: f.nombre, periodo: f.periodo.etiqueta, plazo: f.periodo.plazo, diasParaPlazo: f.diasParaPlazo, datosPorCompletar: f.problemas },
          `vigia:${f.formulario}:${f.periodo.id}`,
        );
      }
    }

    // Riesgo crítico: un aviso por conductor o vehículo al mes mientras siga en esa banda.
    const mesActual = hoy.toISOString().slice(0, 7);
    const [conductores, vehiculos] = await Promise.all([this.riesgo.conductores(orgId), this.riesgo.vehiculos(orgId)]);
    for (const c of conductores.filter((x) => x.banda === 'critico')) {
      await emitir('riesgo.critico', { tipo: 'conductor', nombre: c.nombre, puntaje: c.puntaje, factores: c.factores }, `riesgo:conductor:${c.id}:${mesActual}`);
    }
    for (const v of vehiculos.filter((x) => x.banda === 'critico')) {
      await emitir('riesgo.critico', { tipo: 'vehiculo', placa: v.placa, puntaje: v.puntaje, factores: v.factores }, `riesgo:vehiculo:${v.id}:${mesActual}`);
    }

    if (hoy.getDate() <= 3) {
      const mes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 7);
      const t = await this.tablero.resumen(orgId);
      await emitir(
        'informe.listo',
        { mes, cumplimiento: t.cumplimiento, flota: t.flota, alertas: t.totalAlertas, evidenciasPorRevisar: t.evidenciasPorRevisar },
        `informe:${mes}`,
      );
    }
    return emitidos;
  }
}

@Module({
  imports: [FlotaModule, MantenimientoModule, VigiaModule, TableroModule, RiesgoModule],
  providers: [TareasService],
  exports: [TareasService],
})
export class TareasModule {}
