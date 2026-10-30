import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import {
  actividadTrabajoSchema,
  actualizacionProgramaSchema,
  CAMPOS_PROGRAMA,
  equipoVelocidadSchema,
  finDeTrimestre,
  INSTANCIAS_REVISION,
  programaSchema,
  PROGRAMAS_OBLIGATORIOS,
  pruebaSustanciasSchema,
  RESULTADOS_PRUEBA,
  revisionProgramasSchema,
  TIPOS_EQUIPO_VELOCIDAD,
  TIPOS_PROGRAMA,
  TIPOS_PRUEBA_SUSTANCIAS,
  trimestreAnterior,
  type ActividadTrabajoInput,
  type ActualizacionProgramaInput,
  type EquipoVelocidadInput,
  type ProgramaInput,
  type PruebaSustanciasInput,
  type RevisionProgramasInput,
  type TipoProgramaId,
} from '@pesv/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { crearAccion } from '../acciones/acciones.module.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { committeeMeetings, criticalPrograms, drivers, goals, indicators, planActivities, programReviews, roadRisks, speedDevices, substanceTests, vehicles } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF } from '../documentos/documentos.module.js';
import { DocumentoPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';
import { fechasDeMeses } from '../plan-trabajo/sincronizar.js';
import { hoyColombia, restarMeses } from '../common/fechas.js';
import { contextoOrganizacion } from '../requisitos/requisitos.module.js';
import { estadoProgramas, programasFaltantes } from './estado.js';

const tipoDe = (id: string) => TIPOS_PROGRAMA.find((t) => t.id === id)!;
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Programas de gestión de riesgos críticos y factores de desempeño (paso 8, Res. 40595): los cinco
 * obligatorios con su contenido mínimo, sus actividades en el plan de trabajo, la actualización
 * anual y su divulgación, la revisión trimestral, los equipos de medición de velocidad y las pruebas
 * de alcohol y sustancias (datos sensibles).
 */
@Injectable()
export class ProgramasService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  private async programa(tx: TenantTx, id: string) {
    const [p] = await tx.select().from(criticalPrograms).where(eq(criticalPrograms.id, id));
    if (!p || !p.active) throw new NotFoundException('Programa no encontrado');
    return p;
  }

  consultar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const hoy = hoyColombia();
      const hace12 = restarMeses(hoy, 12);
      const lista = await estadoProgramas(tx);
      const ids = lista.map((p) => p.fila.id);
      const actividades = ids.length
        ? await tx.select().from(planActivities).where(and(eq(planActivities.source, 'programa'), inArray(planActivities.sourceId, ids))).orderBy(asc(planActivities.year), asc(planActivities.plannedStart))
        : [];
      const indicadores = await tx.select({ id: indicators.id, nombre: indicators.name, calculo: indicators.calculation, paso: indicators.stepNumber }).from(indicators).where(eq(indicators.active, true)).orderBy(asc(indicators.name));
      const riesgos = await tx.select({ id: roadRisks.id, peligro: roadRisks.hazard }).from(roadRisks).orderBy(asc(roadRisks.hazard));
      const revisiones = await tx.select().from(programReviews).orderBy(desc(programReviews.period));
      const equipos = await tx
        .select({ e: speedDevices, placa: vehicles.plate })
        .from(speedDevices)
        .leftJoin(vehicles, eq(vehicles.id, speedDevices.vehicleId))
        .orderBy(desc(speedDevices.active), asc(speedDevices.name));
      const [flota] = (await tx.execute<{ activos: number; cubiertos: number }>(sql`
        select count(*)::int as activos,
               count(*) filter (where exists (select 1 from speed_devices d where d.vehicle_id = v.id and d.active))::int as cubiertos
          from vehicles v where v.status <> 'inactivo' and v.motorized`)).rows;
      const [pruebas] = (await tx.execute<{ conductores: number; aleatorias: number; positivas: number; alcohol: number; sustancias: number }>(sql`
        select (select count(*)::int from drivers where active) as conductores,
               (select count(*)::int from substance_tests where kind like '%aleatoria' and performed_on >= ${hace12} and result <> 'no_realizada') as aleatorias,
               (select count(*)::int from substance_tests where result = 'positivo' and performed_on >= ${hace12}) as positivas,
               (select count(*)::int from drivers d where d.active and exists (select 1 from substance_tests t where t.driver_id = d.id and t.kind = 'alcohol_sangre_anual' and t.performed_on >= ${hace12} and t.result <> 'no_realizada')) as alcohol,
               (select count(*)::int from drivers d where d.active and exists (select 1 from substance_tests t where t.driver_id = d.id and t.kind = 'sustancias_orina_anual' and t.performed_on >= ${hace12} and t.result <> 'no_realizada')) as sustancias`)).rows;
      const reuniones = await tx
        .select({ id: committeeMeetings.id, fecha: committeeMeetings.scheduledAt, estado: committeeMeetings.status })
        .from(committeeMeetings)
        .where(inArray(committeeMeetings.status, ['cerrada', 'firmada']))
        .orderBy(desc(committeeMeetings.scheduledAt))
        .limit(12);
      const anterior = trimestreAnterior(hoy);
      // Un trimestre que terminó antes de registrar la organización no es exigible.
      const { creada } = await contextoOrganizacion(tx, orgId);
      const exigible = finDeTrimestre(anterior) >= creada;
      return {
        hoy,
        faltantes: programasFaltantes(lista),
        programas: lista
          .sort((a, b) => TIPOS_PROGRAMA.findIndex((t) => t.id === a.fila.kind) - TIPOS_PROGRAMA.findIndex((t) => t.id === b.fila.kind))
          .map((p) => ({
            id: p.fila.id,
            tipo: p.fila.kind as TipoProgramaId,
            nombre: p.fila.name,
            lineamientos: p.fila.guidelines,
            alcance: p.fila.scope,
            inicio: p.fila.startOn,
            duracionMeses: p.fila.durationMonths,
            lineaBase: p.fila.baseline,
            objetivos: p.fila.objectives,
            factores: p.fila.performanceFactors,
            responsable: p.fila.responsibleName,
            presupuesto: p.fila.budget,
            seguimiento: p.fila.followUp,
            elementos: p.fila.elements,
            indicadorIds: p.fila.indicatorIds,
            riesgoIds: p.fila.riskIds,
            actualizadoEl: p.fila.reviewedOn,
            divulgadoEl: p.fila.disseminatedOn,
            divulgacion: p.fila.disseminationNote,
            vigente: !!p.fila.reviewedOn && p.fila.reviewedOn >= hace12 && !!p.fila.disseminatedOn && p.fila.disseminatedOn >= hace12,
            completo: p.completo,
            avance: p.avance,
            camposFaltantes: p.camposFaltantes,
            elementosFaltantes: p.elementosFaltantes,
            actividades: actividades
              .filter((a) => a.sourceId === p.fila.id)
              .map((a) => ({ id: a.id, anio: a.year, titulo: a.title, responsable: a.responsibleName, meses: a.plannedMonths, estado: a.status, presupuesto: a.budget })),
          })),
        indicadores,
        riesgos,
        revisiones: revisiones.map((r) => ({ id: r.id, periodo: r.period, fecha: r.reviewedOn, instancia: r.instance, reunionId: r.meetingId, participantes: r.participants, conclusiones: r.conclusions })),
        trimestrePendiente: !exigible || revisiones.some((r) => r.period === anterior) ? null : anterior,
        reuniones: reuniones.map((r) => ({ id: r.id, fecha: r.fecha.toISOString().slice(0, 10), estado: r.estado })),
        velocidad: {
          vehiculosActivos: flota?.activos ?? 0,
          vehiculosCubiertos: flota?.cubiertos ?? 0,
          equipos: equipos.map(({ e, placa }) => ({
            id: e.id,
            tipo: e.kind,
            nombre: e.name,
            serial: e.serial,
            vehiculoId: e.vehicleId,
            placa,
            calibradoEl: e.calibratedOn,
            calibracionVence: e.calibrationExpiresOn,
            notas: e.notes,
            activo: e.active,
            estado: !e.active ? 'inactivo' : !e.calibratedOn || !e.calibrationExpiresOn ? 'sin_calibracion' : e.calibrationExpiresOn < hoy ? 'vencido' : e.calibrationExpiresOn <= sumarDias(hoy, 30) ? 'por_vencer' : 'vigente',
          })),
        },
        sustancias: pruebas!,
      };
    });
  }

  /** Crea los programas obligatorios que falten, con los factores de desempeño que propone la norma. */
  iniciar(orgId: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const faltan = programasFaltantes(await estadoProgramas(tx));
      const calculos = await tx.select({ id: indicators.id, calculo: indicators.calculation }).from(indicators).where(eq(indicators.active, true));
      for (const tipo of faltan) {
        const t = tipoDe(tipo);
        await tx.insert(criticalPrograms).values({
          organizationId: orgId,
          kind: tipo,
          name: t.nombre,
          performanceFactors: t.factoresSugeridos.map((f) => `• ${f}`).join('\n'),
          indicatorIds: calculos.filter((c) => c.calculo && t.indicadoresSugeridos.includes(c.calculo)).map((c) => c.id),
          createdBy: actorId,
        });
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programas.iniciados', entidad: 'critical_program', datos: { creados: faltan } });
      return { creados: faltan.length };
    });
  }

  guardar(orgId: string, input: ProgramaInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const anterior = id ? await this.programa(tx, id) : null;
      if (anterior && anterior.kind !== input.tipo) throw new BadRequestException('El tipo de programa no se puede cambiar');
      if (!anterior && input.tipo !== 'otro') {
        const [ya] = await tx.select({ id: criticalPrograms.id }).from(criticalPrograms).where(and(eq(criticalPrograms.kind, input.tipo), eq(criticalPrograms.active, true)));
        if (ya) throw new BadRequestException('Ya existe ese programa; edítalo');
      }
      const validos = new Set(tipoDe(input.tipo).elementos.map((e) => e.id));
      if (input.elementos.some((e) => !validos.has(e))) throw new BadRequestException('Hay elementos que no corresponden a este programa');
      if (input.indicadorIds.length) {
        const ok = await tx.select({ id: indicators.id }).from(indicators).where(inArray(indicators.id, input.indicadorIds));
        if (ok.length !== new Set(input.indicadorIds).size) throw new BadRequestException('Algún indicador no existe');
      }
      if (input.riesgoIds.length) {
        const ok = await tx.select({ id: roadRisks.id }).from(roadRisks).where(inArray(roadRisks.id, input.riesgoIds));
        if (ok.length !== new Set(input.riesgoIds).size) throw new BadRequestException('Algún riesgo no existe');
      }
      const valores = {
        kind: input.tipo,
        name: input.nombre,
        guidelines: input.lineamientos ?? null,
        scope: input.alcance ?? null,
        startOn: input.inicio ?? null,
        durationMonths: input.duracionMeses ?? null,
        baseline: input.lineaBase ?? null,
        objectives: input.objetivos ?? null,
        performanceFactors: input.factores ?? null,
        responsibleName: input.responsable ?? null,
        budget: input.presupuesto ?? null,
        followUp: input.seguimiento ?? null,
        elements: [...new Set(input.elementos)],
        indicatorIds: [...new Set(input.indicadorIds)],
        riskIds: [...new Set(input.riesgoIds)],
        updatedAt: new Date(),
      };
      const [p] = anterior
        ? await tx.update(criticalPrograms).set(valores).where(eq(criticalPrograms.id, anterior.id)).returning()
        : await tx.insert(criticalPrograms).values({ organizationId: orgId, ...valores, createdBy: actorId }).returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: anterior ? 'programa.actualizado' : 'programa.creado', entidad: 'critical_program', entidadId: p!.id });
      return { id: p!.id };
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const p = await this.programa(tx, id);
      if ((PROGRAMAS_OBLIGATORIOS as readonly string[]).includes(p.kind)) throw new BadRequestException('Los programas obligatorios del paso 8 no se pueden eliminar');
      await tx.update(criticalPrograms).set({ active: false, updatedAt: new Date() }).where(eq(criticalPrograms.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programa.retirado', entidad: 'critical_program', entidadId: id, datos: { nombre: p.name } });
    });
  }

  /** Actividad del programa en el plan de trabajo (cronograma y seguimiento mensual se llevan allí). */
  actividad(orgId: string, id: string, input: ActividadTrabajoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const p = await this.programa(tx, id);
      if (input.metaId) {
        const [m] = await tx.select({ year: goals.year }).from(goals).where(eq(goals.id, input.metaId));
        if (!m) throw new BadRequestException('La meta no existe');
        if (m.year !== input.anio) throw new BadRequestException('La meta pertenece a otro año');
      }
      const [a] = await tx
        .insert(planActivities)
        .values({
          organizationId: orgId,
          source: 'programa',
          sourceId: p.id,
          year: input.anio,
          title: input.titulo,
          description: input.descripcion ?? null,
          stepNumber: 8,
          goalId: input.metaId ?? null,
          phase: input.fase,
          responsibleName: input.responsable,
          resources: input.recursos ?? null,
          deliverable: input.entregable ?? null,
          budget: input.presupuesto ?? null,
          plannedMonths: input.meses,
          ...fechasDeMeses(input.anio, input.meses),
          status: input.cancelada ? 'cancelada' : 'planeada',
        })
        .returning({ id: planActivities.id });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programa.actividad', entidad: 'critical_program', entidadId: p.id, datos: { actividad: a!.id } });
      return { id: a!.id };
    });
  }

  actualizar(orgId: string, id: string, input: ActualizacionProgramaInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.programa(tx, id);
      if (input.fecha > hoyColombia()) throw new BadRequestException('La fecha no puede ser futura');
      await tx.update(criticalPrograms).set({ reviewedOn: input.fecha, disseminatedOn: input.fecha, disseminationNote: input.divulgacion, updatedAt: new Date() }).where(eq(criticalPrograms.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programa.actualizacion_anual', entidad: 'critical_program', entidadId: id, datos: { fecha: input.fecha } });
      return { actualizadoEl: input.fecha };
    });
  }

  revision(orgId: string, input: RevisionProgramasInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      if (input.fecha > hoyColombia()) throw new BadRequestException('La fecha no puede ser futura');
      if (input.reunionId) {
        const [r] = await tx.select({ id: committeeMeetings.id }).from(committeeMeetings).where(eq(committeeMeetings.id, input.reunionId));
        if (!r) throw new BadRequestException('La reunión no existe');
      }
      const valores = { reviewedOn: input.fecha, instance: input.instancia, meetingId: input.reunionId ?? null, participants: input.participantes, conclusions: input.conclusiones };
      await tx
        .insert(programReviews)
        .values({ organizationId: orgId, period: input.periodo, ...valores, createdBy: actorId })
        .onConflictDoUpdate({ target: [programReviews.organizationId, programReviews.period], set: valores });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programas.revision', entidad: 'program_review', entidadId: input.periodo, datos: { instancia: input.instancia } });
      return { periodo: input.periodo };
    });
  }

  // Equipos de medición de velocidad -------------------------------------------------

  guardarEquipo(orgId: string, input: EquipoVelocidadInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      if (input.vehiculoId) {
        const [v] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, input.vehiculoId));
        if (!v) throw new BadRequestException('El vehículo no existe');
      }
      const valores = {
        kind: input.tipo,
        name: input.nombre,
        serial: input.serial ?? null,
        vehicleId: input.vehiculoId ?? null,
        calibratedOn: input.calibradoEl ?? null,
        calibrationExpiresOn: input.calibracionVence ?? null,
        notes: input.notas ?? null,
        active: input.activo,
        updatedAt: new Date(),
      };
      if (id) {
        const [e] = await tx.update(speedDevices).set(valores).where(eq(speedDevices.id, id)).returning({ id: speedDevices.id });
        if (!e) throw new NotFoundException('Equipo no encontrado');
      } else {
        const [e] = await tx.insert(speedDevices).values({ organizationId: orgId, ...valores }).returning({ id: speedDevices.id });
        id = e!.id;
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programa.equipo_velocidad', entidad: 'speed_device', entidadId: id });
      return { id };
    });
  }

  // Pruebas de alcohol y sustancias (datos sensibles) -----------------------------------

  pruebas(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const lista = await tx
        .select({ t: substanceTests, nombre: drivers.fullName, documento: drivers.documentNumber })
        .from(substanceTests)
        .innerJoin(drivers, eq(drivers.id, substanceTests.driverId))
        .orderBy(desc(substanceTests.performedOn), desc(substanceTests.createdAt))
        .limit(500);
      return lista.map(({ t, nombre, documento }) => ({ id: t.id, conductorId: t.driverId, conductor: nombre, documento, tipo: t.kind, metodo: t.method, fecha: t.performedOn, resultado: t.result, accionId: t.actionId, notas: t.notes }));
    });
  }

  /** Registra una prueba; un resultado positivo abre una acción correctiva del programa (paso 8). */
  registrarPrueba(orgId: string, input: PruebaSustanciasInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const hoy = hoyColombia();
      if (input.fecha > hoy) throw new BadRequestException('La fecha no puede ser futura');
      const [d] = await tx.select({ id: drivers.id, nombre: drivers.fullName }).from(drivers).where(eq(drivers.id, input.conductorId));
      if (!d) throw new BadRequestException('El conductor no existe');
      let accionId: string | null = null;
      if (input.resultado === 'positivo') {
        const [programa] = await tx.select().from(criticalPrograms).where(and(eq(criticalPrograms.kind, 'alcohol_spa'), eq(criticalPrograms.active, true)));
        const reiterado = await tx.select({ id: substanceTests.id }).from(substanceTests).where(and(eq(substanceTests.driverId, d.id), eq(substanceTests.result, 'positivo')));
        const accion = await crearAccion(
          tx,
          orgId,
          {
            descripcion: `Prueba positiva (${nombreDe(TIPOS_PRUEBA_SUSTANCIAS, input.tipo)}) del ${input.fecha}: aplicar las acciones correctivas del programa de cero tolerancia${reiterado.length ? ' y el procedimiento para casos reiterados' : ''}.`,
            tipo: 'correctiva',
            responsable: programa?.responsibleName ?? 'Líder PESV',
            venceEl: sumarDias(hoy, 15),
            origen: 'programa',
            origenId: programa?.id ?? null,
            pasoNumero: 8,
          },
          actorId,
        );
        accionId = accion.id;
      }
      const [t] = await tx
        .insert(substanceTests)
        .values({ organizationId: orgId, driverId: d.id, kind: input.tipo, method: input.metodo ?? null, performedOn: input.fecha, result: input.resultado, consent: true, actionId: accionId, notes: input.notas ?? null, recordedBy: actorId })
        .returning({ id: substanceTests.id });
      // El registro de auditoría no guarda el resultado: es un dato sensible.
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'programa.prueba_sustancias', entidad: 'substance_test', entidadId: t!.id });
      return { id: t!.id, accionId };
    });
  }

  // Documento y evidencia del paso 8 -------------------------------------------------

  async pdf(orgId: string) {
    const [datos, ctx] = await Promise.all([this.consultar(orgId), this.formato.contexto(orgId, 'programas_riesgo', 'PROGRAMAS DE GESTIÓN DE RIESGOS CRÍTICOS Y FACTORES DE DESEMPEÑO')]);
    const indicadores = new Map(datos.indicadores.map((i) => [i.id, i.nombre]));
    const riesgos = new Map(datos.riesgos.map((r) => [r.id, r.peligro]));
    const doc = new DocumentoPdf(ctx);
    doc.datos(
      [
        ['Programas', `${datos.programas.length} (${datos.programas.filter((p) => p.completo).length} con el contenido mínimo completo)`],
        ['Cobertura del programa de velocidad', `${datos.velocidad.vehiculosCubiertos} de ${datos.velocidad.vehiculosActivos} vehículos`],
        ['Última revisión trimestral', datos.revisiones[0] ? `${datos.revisiones[0].periodo} (${datos.revisiones[0].fecha})` : 'Sin registrar'],
        ['Fecha de corte', datos.hoy],
      ],
      2,
    );
    for (const p of datos.programas) {
      const tipo = tipoDe(p.tipo);
      doc.titulo(p.nombre);
      const filas: [string, string][] = [
        ['Lineamientos', p.lineamientos ?? '—'],
        ['Alcance', p.alcance ?? '—'],
        ['Inicio y duración', `${p.inicio ?? '—'} · ${p.duracionMeses ? `${p.duracionMeses} meses` : '—'}`],
        ['Línea base', p.lineaBase ?? '—'],
        ['Objetivos y metas', p.objetivos ?? '—'],
        ['Indicadores', p.indicadorIds.map((i) => indicadores.get(i)).filter(Boolean).join('; ') || '—'],
        ['Factores de desempeño', p.factores ?? '—'],
        ['Riesgos que atiende', p.riesgoIds.map((r) => riesgos.get(r)).filter(Boolean).join('; ') || '—'],
        ['Responsable', p.responsable ?? '—'],
        ['Presupuesto', p.presupuesto != null ? `$ ${new Intl.NumberFormat('es-CO').format(p.presupuesto)}` : '—'],
        ['Mecanismos de seguimiento', p.seguimiento ?? '—'],
        ['Actualización y divulgación', p.actualizadoEl ? `${p.actualizadoEl}: ${p.divulgacion ?? ''}` : 'Sin registrar'],
      ];
      doc.datos(filas, 1);
      if (tipo.elementos.length) {
        doc.parrafo(`Elementos de la norma: ${tipo.elementos.map((e) => `${p.elementos.includes(e.id) ? '[x]' : '[ ]'} ${e.texto}`).join('  ')}`, { tamano: 8 });
      }
      if (p.actividades.length) {
        doc.tabla(
          [
            { titulo: 'Actividad', ancho: 12 },
            { titulo: 'Responsable', ancho: 6 },
            { titulo: 'Año', ancho: 2.4, alinear: 'center' },
            { titulo: 'Meses', ancho: 6 },
            { titulo: 'Estado', ancho: 3.6 },
          ],
          p.actividades.map((a) => [a.titulo, a.responsable, { texto: String(a.anio), alinear: 'center' as const }, a.meses.join(', '), a.estado]),
          { tamano: 8 },
        );
      }
      if (!p.completo) doc.parrafo(`Contenido mínimo pendiente: ${p.camposFaltantes.map((c) => CAMPOS_PROGRAMA.find((x) => x.id === c)!.nombre).join(', ') || 'elementos de la norma sin confirmar'}.`, { tamano: 8, color: '#9E2A1C' });
    }
    if (datos.revisiones.length) {
      doc.titulo('Revisión trimestral de resultados');
      doc.tabla(
        [
          { titulo: 'Trimestre', ancho: 3 },
          { titulo: 'Fecha', ancho: 3.2 },
          { titulo: 'Instancia', ancho: 5.5 },
          { titulo: 'Conclusiones', ancho: 18 },
        ],
        datos.revisiones.map((r) => [r.periodo, r.fecha, nombreDe(INSTANCIAS_REVISION, r.instancia), r.conclusiones]),
        { tamano: 8 },
      );
    }
    if (datos.velocidad.equipos.length) {
      doc.titulo('Equipos de medición de velocidad');
      doc.tabla(
        [
          { titulo: 'Equipo', ancho: 8 },
          { titulo: 'Tipo', ancho: 6 },
          { titulo: 'Vehículo', ancho: 3.5 },
          { titulo: 'Calibrado', ancho: 3.4 },
          { titulo: 'Vence', ancho: 3.4 },
          { titulo: 'Estado', ancho: 3.6 },
        ],
        datos.velocidad.equipos.map((e) => [e.serial ? `${e.nombre} (${e.serial})` : e.nombre, nombreDe(TIPOS_EQUIPO_VELOCIDAD, e.tipo), e.placa ?? '—', e.calibradoEl ?? '—', e.calibracionVence ?? '—', e.estado.replace('_', ' ')]),
        { tamano: 8 },
      );
    }
    const s = datos.sustancias;
    doc.parrafo(`Pruebas de alcohol y sustancias en los últimos doce meses: ${s.aleatorias} aleatorias; controles anuales de alcohol para ${s.alcohol} y de sustancias para ${s.sustancias} de ${s.conductores} conductores activos. El detalle por persona es reservado (Ley 1581 de 2012).`, { tamano: 8 });
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-programas-riesgo-critico.pdf` };
  }

  async evidencia(orgId: string, actorId: string) {
    const { datos, nombre } = await this.pdf(orgId);
    const ev = await this.evidencias.crear(orgId, { titulo: `Programas de riesgo crítico · corte ${hoyColombia()}`, pasoNumero: 8, descripcion: 'Generado desde los programas del paso 8 de la plataforma.' }, { nombre, tipo: MIME_PDF, datos }, actorId);
    return { evidenciaId: ev.id };
  }
}

@Controller('org/programas')
export class ProgramasController {
  constructor(private readonly s: ProgramasService) {}

  @Get()
  @Permiso('ver')
  consultar(@OrgActual() o: OrgSesion) {
    return this.s.consultar(o.id);
  }

  @Get('catalogo')
  @Permiso('ver')
  catalogo() {
    return { tipos: TIPOS_PROGRAMA, campos: CAMPOS_PROGRAMA, equipos: TIPOS_EQUIPO_VELOCIDAD, pruebas: TIPOS_PRUEBA_SUSTANCIAS, resultados: RESULTADOS_PRUEBA };
  }

  @Post('iniciar')
  @Permiso('gestionar_pesv')
  iniciar(@OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.iniciar(o.id, u.id);
  }

  @Get('exportar')
  @Permiso('ver')
  async exportar(@OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const { datos, nombre } = await this.s.pdf(o.id);
    return enviarArchivo(res, datos, nombre, MIME_PDF);
  }

  @Post('evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidencia(o.id, u.id);
  }

  @Post('revisiones')
  @Permiso('gestionar_pesv')
  revision(@Body(new ZodValidationPipe(revisionProgramasSchema)) b: RevisionProgramasInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.revision(o.id, b, u.id);
  }

  @Post('equipos')
  @Permiso('gestionar_pesv')
  crearEquipo(@Body(new ZodValidationPipe(equipoVelocidadSchema)) b: EquipoVelocidadInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardarEquipo(o.id, b, u.id);
  }

  @Put('equipos/:id')
  @Permiso('gestionar_pesv')
  editarEquipo(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(equipoVelocidadSchema)) b: EquipoVelocidadInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardarEquipo(o.id, b, u.id, id);
  }

  @Get('pruebas')
  @Permiso('datos_sensibles')
  pruebas(@OrgActual() o: OrgSesion) {
    return this.s.pruebas(o.id);
  }

  @Post('pruebas')
  @Permiso('datos_sensibles')
  registrarPrueba(@Body(new ZodValidationPipe(pruebaSustanciasSchema)) b: PruebaSustanciasInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.registrarPrueba(o.id, b, u.id);
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(programaSchema)) b: ProgramaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id);
  }

  @Put(':id')
  @Permiso('gestionar_pesv')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(programaSchema)) b: ProgramaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Post(':id/actividades')
  @Permiso('gestionar_pesv')
  actividad(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(actividadTrabajoSchema)) b: ActividadTrabajoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.actividad(o.id, id, b, u.id);
  }

  @Post(':id/actualizacion')
  @Permiso('gestionar_pesv')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(actualizacionProgramaSchema)) b: ActualizacionProgramaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.actualizar(o.id, id, b, u.id);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [ProgramasController], providers: [ProgramasService] })
export class ProgramasModule {}
