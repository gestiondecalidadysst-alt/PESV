import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  clasificar,
  CORRESPONDENCIA_PESV_ISO,
  PASOS_PESV,
  RES_40595_2022,
  type CrearOrganizacionInput,
  type EstadoPaso,
} from '@pesv/shared';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import { auditLog, classifications, organizations, stepCompliance } from '../db/schema.js';

const VIOLACION_UNICA = '23505';

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Registra la organización, guarda su primera clasificación e inicializa el estado de los
   * 24 pasos: los que aplican quedan pendientes y los demás como "no aplica".
   */
  async crear(input: CrearOrganizacionInput) {
    const resultado = clasificar(input.clasificacion);
    if (!resultado.obligada || !resultado.nivel) {
      throw new UnprocessableEntityException(
        'Con esa flota y esos conductores la organización no está obligada a tener PESV. La adopción voluntaria llega en la Fase 1.',
      );
    }
    const nivel = resultado.nivel;
    const id = randomUUID();

    try {
      return await this.database.withTenant(id, async (tx) => {
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

        const [clasificacion] = await tx
          .insert(classifications)
          .values({
            organizationId: id,
            normativeVersionId: resultado.versionNormativa,
            misionalidad: input.clasificacion.misionalidad,
            modalityId: input.clasificacion.modalidadId ?? null,
            vehicles: input.clasificacion.vehiculos,
            drivers: input.clasificacion.conductores,
            obligated: resultado.obligada,
            level: nivel,
            levelByVehicles: resultado.nivelPorVehiculos,
            levelByDrivers: resultado.nivelPorConductores,
            reportsToSupertransporte: resultado.reportaSupertransporte,
            applicableSteps: resultado.pasosAplicables,
          })
          .returning();

        await tx.insert(stepCompliance).values(
          PASOS_PESV.map((p) => ({
            organizationId: id,
            normativeVersionId: RES_40595_2022.id,
            stepNumber: p.numero,
            status: (resultado.pasosAplicables.includes(p.numero)
              ? 'pendiente'
              : 'no_aplica') satisfies EstadoPaso,
          })),
        );

        await tx.insert(auditLog).values({
          organizationId: id,
          action: 'organizacion.creada',
          entity: 'organization',
          entityId: id,
          data: { nivel, pasosAplicables: resultado.pasosAplicables.length },
        });

        return { organizacion: org!, clasificacion: clasificacion!, resultado };
      });
    } catch (err) {
      if (
        (err as { code?: string; cause?: { code?: string } }).code === VIOLACION_UNICA ||
        (err as { cause?: { code?: string } }).cause?.code === VIOLACION_UNICA
      ) {
        throw new ConflictException('Ya existe una organización registrada con ese NIT');
      }
      throw err;
    }
  }

  async obtener(id: string) {
    return this.database.withTenant(id, async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, id));
      if (!org) throw new NotFoundException('Organización no encontrada');
      const [clasificacion] = await tx
        .select()
        .from(classifications)
        .where(eq(classifications.organizationId, id))
        .orderBy(desc(classifications.createdAt))
        .limit(1);
      const estados = await tx
        .select({ status: stepCompliance.status })
        .from(stepCompliance)
        .where(eq(stepCompliance.organizationId, id));
      const cuenta = (s: EstadoPaso) => estados.filter((e) => e.status === s).length;
      const aplicables = estados.length - cuenta('no_aplica');
      const hechos = cuenta('hecho');
      return {
        organizacion: org,
        clasificacion: clasificacion ?? null,
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
        .where(
          and(
            eq(stepCompliance.organizationId, id),
            eq(stepCompliance.normativeVersionId, RES_40595_2022.id),
          ),
        );
      if (filas.length === 0) throw new NotFoundException('Organización no encontrada');
      const porNumero = new Map(filas.map((f) => [f.stepNumber, f]));
      return PASOS_PESV.map((p) => ({
        numero: p.numero,
        fase: p.fase,
        nombre: p.nombre,
        estado: porNumero.get(p.numero)?.status ?? 'pendiente',
        actualizado: porNumero.get(p.numero)?.updatedAt ?? null,
        clausulasIso: CORRESPONDENCIA_PESV_ISO[p.numero] ?? [],
      }));
    });
  }
}
