import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  adopcionVoluntaria,
  clasificar,
  CORRESPONDENCIA_PESV_ISO,
  PASOS_PESV,
  pasosQueDependenDe,
  PRERREQUISITOS_PASO,
  prerrequisitosPendientes,
  RES_40595_2022,
  type CrearOrganizacionInput,
  type EstadoPaso,
  type ResultadoClasificacion,
} from '@pesv/shared';
import { and, count, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { auditar, esViolacionUnica } from '../common/audit.js';
import { suscripcionInicial } from '../suscripciones/reglas.js';
import { reglasDeCorreoIniciales } from '../correo/notificaciones.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import {
  actions,
  classifications,
  drivers,
  evidenceLinks,
  evidences,
  memberships,
  organizations,
  stepCompliance,
  stepFindings,
  users,
  vehicles,
} from '../db/schema.js';

export type Creador =
  | { usuarioId: string }
  | { nuevo: { email: string; nombre: string; passwordHash: string } };

const VERSION = RES_40595_2022.id;

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Registra la organización, guarda su primera clasificación, inicializa el estado de los
   * 24 pasos y deja a quien la crea como administrador y líder PESV.
   */
  async crear(input: CrearOrganizacionInput, creador: Creador) {
    const base = clasificar(input.clasificacion);
    if (!base.obligada && !input.adopcionVoluntaria) {
      throw new UnprocessableEntityException(
        'Con esa flota y esos conductores la organización no está obligada a tener PESV. Puedes adoptarlo de forma voluntaria.',
      );
    }
    const resultado = adopcionVoluntaria(base);
    const id = randomUUID();
    const usuarioId = 'usuarioId' in creador ? creador.usuarioId : randomUUID();

    try {
      return await this.database.withTenant(id, async (tx) => {
        if ('nuevo' in creador) {
          await tx.insert(users).values({
            id: usuarioId,
            email: creador.nuevo.email,
            fullName: creador.nuevo.nombre,
            passwordHash: creador.nuevo.passwordHash,
          });
        }
        const [org] = await tx
          .insert(organizations)
          .values({
            id,
            name: input.nombre,
            nit: input.nit,
            misionalidad: input.clasificacion.misionalidad,
            modalityId: input.clasificacion.modalidadId ?? null,
            actionRadius: input.radioAccion ?? null,
          })
          .returning();
        await tx.insert(memberships).values([
          { organizationId: id, userId: usuarioId, role: 'admin' },
          { organizationId: id, userId: usuarioId, role: 'lider_pesv' },
        ]);
        await this.guardarClasificacion(tx, id, input.clasificacion, resultado, usuarioId);
        await suscripcionInicial(tx, id);
        await reglasDeCorreoIniciales(tx, id);
        await tx.insert(stepCompliance).values(
          PASOS_PESV.map((p) => ({
            organizationId: id,
            normativeVersionId: VERSION,
            stepNumber: p.numero,
            status: (resultado.pasosAplicables.includes(p.numero)
              ? 'pendiente'
              : 'no_aplica') satisfies EstadoPaso,
          })),
        );
        await auditar(tx, {
          organizacionId: id,
          actorId: usuarioId,
          accion: 'organizacion.creada',
          entidad: 'organization',
          entidadId: id,
          datos: { nivel: resultado.nivel, pasosAplicables: resultado.pasosAplicables.length, voluntaria: resultado.voluntaria ?? false },
        });
        return { organizacion: org!, resultado, usuarioId };
      });
    } catch (err) {
      if (esViolacionUnica(err)) {
        throw new ConflictException('Ya existe una organización registrada con ese NIT o ese correo');
      }
      throw err;
    }
  }

  private async guardarClasificacion(
    tx: TenantTx,
    organizacionId: string,
    entrada: CrearOrganizacionInput['clasificacion'],
    resultado: ResultadoClasificacion,
    usuarioId: string,
  ) {
    const [fila] = await tx
      .insert(classifications)
      .values({
        organizationId: organizacionId,
        normativeVersionId: resultado.versionNormativa,
        misionalidad: entrada.misionalidad,
        modalityId: entrada.modalidadId ?? null,
        vehicles: entrada.vehiculos,
        drivers: entrada.conductores,
        obligated: resultado.obligada,
        level: resultado.nivel,
        levelByVehicles: resultado.nivelPorVehiculos,
        levelByDrivers: resultado.nivelPorConductores,
        reportsToSupertransporte: resultado.reportaSupertransporte,
        applicableSteps: resultado.pasosAplicables,
        voluntary: resultado.voluntaria ?? false,
        createdBy: usuarioId,
      })
      .returning();
    return fila!;
  }

  private async clasificacionVigente(tx: TenantTx, id: string) {
    const [fila] = await tx
      .select()
      .from(classifications)
      .where(eq(classifications.organizationId, id))
      .orderBy(desc(classifications.createdAt))
      .limit(1);
    return fila ?? null;
  }

  async obtener(id: string) {
    return this.database.withTenant(id, async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, id));
      if (!org) throw new NotFoundException('Organización no encontrada');
      const clasificacion = await this.clasificacionVigente(tx, id);
      const estados = await tx
        .select({ status: stepCompliance.status })
        .from(stepCompliance)
        .where(eq(stepCompliance.organizationId, id));
      const cuenta = (s: EstadoPaso) => estados.filter((e) => e.status === s).length;
      const aplicables = estados.length - cuenta('no_aplica');
      const hechos = cuenta('hecho');
      return {
        organizacion: org,
        clasificacion,
        resumen: {
          aplicables,
          hechos,
          enCurso: cuenta('en_curso'),
          pendientes: cuenta('pendiente'),
          porcentajeCumplimiento: aplicables ? Math.round((hechos / aplicables) * 100) : 0,
        },
      };
    });
  }

  async pasos(id: string) {
    return this.database.withTenant(id, async (tx) => {
      const filas = await tx
        .select()
        .from(stepCompliance)
        .where(and(eq(stepCompliance.organizationId, id), eq(stepCompliance.normativeVersionId, VERSION)));
      if (filas.length === 0) throw new NotFoundException('Organización no encontrada');
      const conteo = await tx
        .select({ ref: evidenceLinks.ref, status: evidences.status, total: count() })
        .from(evidenceLinks)
        .innerJoin(evidences, eq(evidences.id, evidenceLinks.evidenceId))
        .where(and(eq(evidenceLinks.norm, 'PESV'), sql`not exists (select 1 from evidences e2 where e2.replaces_id = ${evidences.id})`))
        .groupBy(evidenceLinks.ref, evidences.status);
      const porNumero = new Map(filas.map((f) => [f.stepNumber, f]));
      const hallazgos = await tx
        .select({ paso: stepFindings.stepNumber, tipo: stepFindings.kind, total: count() })
        .from(stepFindings)
        .where(eq(stepFindings.status, 'abierto'))
        .groupBy(stepFindings.stepNumber, stepFindings.kind);
      const acciones = await tx
        .select({ paso: actions.stepNumber, vencidas: sql<number>`count(*) filter (where ${actions.dueOn} < current_date)::int`, total: count() })
        .from(actions)
        .where(eq(actions.status, 'abierta'))
        .groupBy(actions.stepNumber);
      const estados = Object.fromEntries(PASOS_PESV.map((p) => [p.numero, (porNumero.get(p.numero)?.status ?? 'pendiente') as string]));
      return PASOS_PESV.map((p) => {
        const delPaso = conteo.filter((c) => c.ref === String(p.numero));
        const n = (s: string) => delPaso.find((c) => c.status === s)?.total ?? 0;
        const h = hallazgos.filter((x) => x.paso === p.numero);
        const a = acciones.find((x) => x.paso === p.numero);
        return {
          numero: p.numero,
          fase: p.fase,
          nombre: p.nombre,
          estado: estados[p.numero] as EstadoPaso,
          actualizado: porNumero.get(p.numero)?.updatedAt ?? null,
          clausulasIso: CORRESPONDENCIA_PESV_ISO[p.numero] ?? [],
          evidencias: { aprobadas: n('aprobada'), enRevision: n('borrador'), rechazadas: n('rechazada') },
          prerrequisitos: (PRERREQUISITOS_PASO[p.numero] ?? []).map((q) => ({ numero: q, estado: estados[q] as EstadoPaso })),
          prerrequisitosPendientes: prerrequisitosPendientes(p.numero, estados),
          habilita: pasosQueDependenDe(p.numero),
          hallazgosAbiertos: h.reduce((s, x) => s + x.total, 0),
          noConformidadesAbiertas: h.find((x) => x.tipo === 'no_conformidad')?.total ?? 0,
          accionesAbiertas: a?.total ?? 0,
          accionesVencidas: a?.vencidas ?? 0,
        };
      });
    });
  }

  /** Cambia el estado de un paso. "Hecho" exige al menos una evidencia aprobada (RN-06). */
  async actualizarPaso(id: string, numero: number, estado: Exclude<EstadoPaso, 'no_aplica'>, usuarioId: string) {
    return this.database.withTenant(id, async (tx) => {
      const [actual] = await tx
        .select()
        .from(stepCompliance)
        .where(
          and(
            eq(stepCompliance.organizationId, id),
            eq(stepCompliance.normativeVersionId, VERSION),
            eq(stepCompliance.stepNumber, numero),
          ),
        );
      if (!actual) throw new NotFoundException('Paso no encontrado');
      if (actual.status === 'no_aplica') {
        throw new BadRequestException('Este paso no aplica al nivel de la organización');
      }
      if (estado === 'hecho') {
        // Pasos conectados: los prerrequisitos deben estar cerrados y no puede haber no conformidades abiertas.
        const todos = await tx.select({ n: stepCompliance.stepNumber, s: stepCompliance.status }).from(stepCompliance).where(and(eq(stepCompliance.organizationId, id), eq(stepCompliance.normativeVersionId, VERSION)));
        const pendientes = prerrequisitosPendientes(numero, Object.fromEntries(todos.map((t) => [t.n, t.s])));
        if (pendientes.length) {
          const nombres = pendientes.map((q) => `${q}. ${PASOS_PESV.find((p) => p.numero === q)!.nombre}`).join('; ');
          throw new UnprocessableEntityException(`Antes de cerrar este paso deben estar hechos: ${nombres}`);
        }
        const [{ nc } = { nc: 0 }] = await tx
          .select({ nc: count() })
          .from(stepFindings)
          .where(and(eq(stepFindings.stepNumber, numero), eq(stepFindings.status, 'abierto'), eq(stepFindings.kind, 'no_conformidad')));
        if (nc > 0) throw new UnprocessableEntityException('El paso tiene no conformidades abiertas: trátalas en el plan de acción antes de cerrarlo');
        const [{ total } = { total: 0 }] = await tx
          .select({ total: count() })
          .from(evidenceLinks)
          .innerJoin(evidences, eq(evidences.id, evidenceLinks.evidenceId))
          .where(
            and(eq(evidenceLinks.norm, 'PESV'), eq(evidenceLinks.ref, String(numero)), eq(evidences.status, 'aprobada')),
          );
        if (total === 0) {
          throw new UnprocessableEntityException(
            'Para marcar el paso como hecho necesita al menos una evidencia aprobada',
          );
        }
      }
      await tx
        .update(stepCompliance)
        .set({ status: estado, updatedBy: usuarioId, updatedAt: new Date() })
        .where(
          and(
            eq(stepCompliance.organizationId, id),
            eq(stepCompliance.normativeVersionId, VERSION),
            eq(stepCompliance.stepNumber, numero),
          ),
        );
      await auditar(tx, {
        organizacionId: id,
        actorId: usuarioId,
        accion: 'paso.actualizado',
        entidad: 'step',
        entidadId: String(numero),
        datos: { de: actual.status, a: estado },
      });
      return { numero, estado };
    });
  }

  /**
   * Compara la clasificación vigente con la flota y los conductores registrados (RN-04).
   * Devuelve la propuesta sin aplicarla.
   */
  async propuestaReclasificacion(id: string) {
    return this.database.withTenant(id, async (tx) => {
      const vigente = await this.clasificacionVigente(tx, id);
      if (!vigente) throw new NotFoundException('La organización no tiene clasificación');
      const [{ v } = { v: 0 }] = await tx
        .select({ v: count() })
        .from(vehicles)
        .where(and(eq(vehicles.organizationId, id), ne(vehicles.status, 'inactivo')));
      const [{ c } = { c: 0 }] = await tx
        .select({ c: count() })
        .from(drivers)
        .where(and(eq(drivers.organizationId, id), eq(drivers.active, true)));
      const entrada = {
        misionalidad: vigente.misionalidad as 1 | 2,
        vehiculos: v,
        conductores: c,
        modalidadId: vigente.modalityId ?? undefined,
      };
      const resultado = clasificar(entrada);
      return {
        vigente: { nivel: vigente.level, vehiculos: vigente.vehicles, conductores: vigente.drivers },
        registrados: { vehiculos: v, conductores: c },
        propuesta: resultado,
        // Una organización voluntaria que llega a estar obligada se reclasifica aunque siga en básico.
        cambiaNivel: resultado.obligada && (resultado.nivel !== vigente.level || vigente.voluntary),
        entrada,
      };
    });
  }

  /** Aplica la reclasificación: abre los pasos nuevos y marca como "no aplica" los que salen. */
  async confirmarReclasificacion(id: string, usuarioId: string) {
    const { propuesta, entrada, cambiaNivel } = await this.propuestaReclasificacion(id);
    if (!propuesta.obligada || !propuesta.nivel) {
      throw new UnprocessableEntityException(
        'Con la flota y los conductores registrados la organización no estaría obligada; revisa los datos antes de reclasificar.',
      );
    }
    if (!cambiaNivel) throw new BadRequestException('El nivel no cambia con los datos registrados');
    return this.database.withTenant(id, async (tx) => {
      const fila = await this.guardarClasificacion(tx, id, entrada, propuesta, usuarioId);
      const aplican = propuesta.pasosAplicables;
      await tx
        .update(stepCompliance)
        .set({ status: 'pendiente', updatedBy: usuarioId, updatedAt: new Date() })
        .where(
          and(
            eq(stepCompliance.organizationId, id),
            eq(stepCompliance.status, 'no_aplica'),
            inArray(stepCompliance.stepNumber, aplican),
          ),
        );
      await tx
        .update(stepCompliance)
        .set({ status: 'no_aplica', updatedBy: usuarioId, updatedAt: new Date() })
        .where(
          and(eq(stepCompliance.organizationId, id), notInArray(stepCompliance.stepNumber, aplican)),
        );
      await auditar(tx, {
        organizacionId: id,
        actorId: usuarioId,
        accion: 'organizacion.reclasificada',
        entidad: 'classification',
        entidadId: fila.id,
        datos: { nivel: propuesta.nivel },
      });
      return { clasificacion: fila, resultado: propuesta };
    });
  }
}
