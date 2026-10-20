import { createHash, randomUUID } from 'node:crypto';
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
  Put,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import {
  accionSchema,
  asistenciaSchema,
  decisionSchema,
  firmaActaSchema,
  miembroComiteSchema,
  notasPuntoSchema,
  programarReunionSchema,
  type AccionInput,
  type DecisionInput,
  type MiembroComiteInput,
  type ProgramarReunionInput,
} from '@pesv/shared';
import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { aAccion, crearAccion } from '../acciones/acciones.module.js';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { verifyPassword } from '../common/crypto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import {
  actions,
  committeeMeetings,
  committeeMembers,
  crashInvestigations,
  crashes,
  evidences,
  meetingAttendance,
  meetingDecisions,
  organizations,
  planActivities,
  stepCompliance,
  type PuntoAgenda,
} from '../db/schema.js';
import { EventosService } from '../eventos/eventos.service.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';
import { FlotaModule, FlotaService } from '../flota/flota.module.js';
import { IaModule } from '../ia/ia.module.js';
import { IaService } from '../ia/ia.service.js';
import { StorageService } from '../storage/storage.service.js';
import { generarActaPdf } from './acta-pdf.js';

const punto = (titulo: string, origen?: string): PuntoAgenda => ({ id: randomUUID().slice(0, 8), titulo, notas: '', origen });
const fechaCorta = (d: Date) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' }).format(d);

@Injectable()
export class ComiteService {
  constructor(
    private readonly database: DatabaseService,
    private readonly eventos: EventosService,
    private readonly evidencias: EvidenciasService,
    private readonly flota: FlotaService,
    private readonly storage: StorageService,
    private readonly ia: IaService,
  ) {}

  // Integrantes -------------------------------------------------------------

  miembros(orgId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(committeeMembers).orderBy(desc(committeeMembers.active), asc(committeeMembers.fullName))).map((m) => ({
        id: m.id,
        usuarioId: m.userId,
        nombre: m.fullName,
        cargo: m.position,
        rolComite: m.committeeRole,
        activo: m.active,
      })),
    );
  }

  async guardarMiembro(orgId: string, input: MiembroComiteInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        userId: input.usuarioId ?? null,
        fullName: input.nombre,
        position: input.cargo ?? null,
        committeeRole: input.rolComite,
        active: input.activo,
      };
      const [m] = id
        ? await tx.update(committeeMembers).set(valores).where(eq(committeeMembers.id, id)).returning()
        : await tx.insert(committeeMembers).values({ organizationId: orgId, ...valores }).returning();
      if (!m) throw new NotFoundException('Integrante no encontrado');
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'comite.integrante_actualizado' : 'comite.integrante_agregado', entidad: 'committee_member', entidadId: m.id });
      return m;
    });
  }

  // Reuniones ---------------------------------------------------------------

  /** Agenda armada con lo que está pendiente en la organización. */
  async agendaSugerida(orgId: string): Promise<PuntoAgenda[]> {
    const alertas = await this.flota.alertas(orgId);
    return this.database.withTenant(orgId, async (tx) => {
      const puntos: PuntoAgenda[] = [punto('Verificación del quórum y aprobación del orden del día')];
      const compromisos = await tx.select().from(actions).where(and(eq(actions.source, 'comite'), eq(actions.status, 'abierta')));
      if (compromisos.length) {
        const vencidos = compromisos.filter((c) => aAccion(c).vencida).length;
        puntos.push(punto(`Seguimiento a compromisos anteriores: ${compromisos.length} abiertos${vencidos ? `, ${vencidos} vencidos` : ''}`, 'compromisos'));
      }
      const sinRevisar = await tx.select().from(crashes).where(isNull(crashes.committeeReviewedOn)).orderBy(asc(crashes.occurredAt));
      for (const s of sinRevisar) puntos.push(punto(`Revisión del siniestro del ${fechaCorta(s.occurredAt)}, placa ${s.plate}`, `siniestro:${s.id}`));
      const [{ invPendientes } = { invPendientes: 0 }] = await tx
        .select({ invPendientes: count() })
        .from(crashInvestigations)
        .where(and(eq(crashInvestigations.required, true), ne(crashInvestigations.status, 'cerrada')));
      if (invPendientes) puntos.push(punto(`Investigaciones internas de siniestros por aprobar: ${invPendientes}`, 'investigaciones'));
      const anio = new Date().getFullYear();
      const actividades = await tx.select({ status: planActivities.status }).from(planActivities).where(eq(planActivities.year, anio));
      if (actividades.length) {
        const ejecutadas = actividades.filter((a) => a.status === 'ejecutada').length;
        puntos.push(punto(`Avance del plan anual de trabajo: ${ejecutadas} de ${actividades.length} actividades ejecutadas`, 'plan'));
      }
      if (alertas.length) puntos.push(punto(`Alertas operativas: ${alertas.length} (vencimientos y vehículos no aptos)`, 'alertas'));
      const [{ porRevisar } = { porRevisar: 0 }] = await tx.select({ porRevisar: count() }).from(evidences).where(eq(evidences.status, 'borrador'));
      if (porRevisar) puntos.push(punto(`Evidencias del PESV pendientes de aprobación: ${porRevisar}`, 'evidencias'));
      puntos.push(punto('Proposiciones y varios'));
      return puntos;
    });
  }

  reuniones(orgId: string) {
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({
          id: committeeMeetings.id,
          fecha: committeeMeetings.scheduledAt,
          lugar: committeeMeetings.location,
          tipo: committeeMeetings.kind,
          estado: committeeMeetings.status,
          quorumRequerido: committeeMeetings.quorumRequired,
          presentes: sql<number>`(select count(*)::int from meeting_attendance a where a.meeting_id = committee_meetings.id and a.present)`,
        })
        .from(committeeMeetings)
        .orderBy(desc(committeeMeetings.scheduledAt)),
    );
  }

  async programar(orgId: string, input: ProgramarReunionInput, actorId: string) {
    const agenda = input.agenda?.length ? input.agenda.map((t) => punto(t)) : await this.agendaSugerida(orgId);
    return this.database.withTenant(orgId, async (tx) => {
      const activos = await tx.select().from(committeeMembers).where(eq(committeeMembers.active, true));
      if (activos.length === 0) throw new BadRequestException('Registra primero a los integrantes del comité');
      const [r] = await tx
        .insert(committeeMeetings)
        .values({
          organizationId: orgId,
          scheduledAt: new Date(input.fecha),
          location: input.lugar ?? null,
          kind: input.tipo,
          agenda,
          quorumRequired: Math.floor(activos.length / 2) + 1,
          createdBy: actorId,
        })
        .returning();
      await tx.insert(meetingAttendance).values(activos.map((m) => ({ meetingId: r!.id, memberId: m.id, organizationId: orgId })));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'comite.reunion_programada', entidad: 'committee_meeting', entidadId: r!.id });
      await this.eventos.emitir(tx, orgId, 'comite.reunion', {
        reunionId: r!.id,
        fecha: input.fecha,
        lugar: input.lugar ?? null,
        agenda: agenda.map((p) => p.titulo),
        integrantes: activos.map((m) => m.fullName),
      });
      return r!;
    });
  }

  private async reunion(tx: TenantTx, id: string) {
    const [r] = await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, id));
    if (!r) throw new NotFoundException('Reunión no encontrada');
    return r;
  }

  private abierta(r: typeof committeeMeetings.$inferSelect) {
    if (r.status === 'cerrada' || r.status === 'firmada') throw new BadRequestException('La reunión ya se cerró; el acta no se puede modificar');
  }

  async detalle(orgId: string, id: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const r = await this.reunion(tx, id);
      const asistencia = await tx
        .select({ a: meetingAttendance, m: committeeMembers })
        .from(meetingAttendance)
        .innerJoin(committeeMembers, eq(committeeMembers.id, meetingAttendance.memberId))
        .where(eq(meetingAttendance.meetingId, id))
        .orderBy(asc(committeeMembers.fullName));
      const decisiones = await tx.select().from(meetingDecisions).where(eq(meetingDecisions.meetingId, id)).orderBy(asc(meetingDecisions.createdAt));
      const compromisos = await tx.select().from(actions).where(and(eq(actions.source, 'comite'), eq(actions.sourceId, id))).orderBy(asc(actions.createdAt));
      const presentes = asistencia.filter((x) => x.a.present).length;
      return {
        id: r.id,
        fecha: r.scheduledAt,
        lugar: r.location,
        tipo: r.kind,
        estado: r.status,
        agenda: r.agenda,
        transcripcion: r.transcript,
        quorumRequerido: r.quorumRequired,
        presentes,
        hayQuorum: presentes >= r.quorumRequired,
        tieneActa: !!r.minutesKey,
        evidenciaId: r.evidenceId,
        asistencia: asistencia.map(({ a, m }) => ({
          miembroId: m.id,
          usuarioId: m.userId,
          nombre: m.fullName,
          cargo: m.position,
          rolComite: m.committeeRole,
          presente: a.present,
          llegada: a.checkedInAt,
          firmadoEn: a.signedAt,
        })),
        decisiones: decisiones.map((d) => ({
          id: d.id,
          puntoId: d.agendaItemId,
          texto: d.text,
          votosAFavor: d.votesFor,
          votosEnContra: d.votesAgainst,
          abstenciones: d.abstentions,
          aprobada: d.approved,
        })),
        compromisos: compromisos.map(aAccion),
      };
    });
  }

  async iniciar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const r = await this.reunion(tx, id);
      if (r.status !== 'programada') throw new BadRequestException('La reunión ya inició');
      await tx.update(committeeMeetings).set({ status: 'en_curso', startedAt: new Date() }).where(eq(committeeMeetings.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'comite.reunion_iniciada', entidad: 'committee_meeting', entidadId: id });
      return { id, estado: 'en_curso' };
    });
  }

  /** Notas de un punto. Se bloquea la fila para no perder cambios de dos personas en puntos distintos. */
  async notasPunto(orgId: string, id: string, puntoId: string, notas: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [r] = await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, id)).for('update');
      if (!r) throw new NotFoundException('Reunión no encontrada');
      this.abierta(r);
      if (!r.agenda.some((p) => p.id === puntoId)) throw new NotFoundException('Punto de agenda no encontrado');
      const agenda = r.agenda.map((p) => (p.id === puntoId ? { ...p, notas } : p));
      await tx.update(committeeMeetings).set({ agenda }).where(eq(committeeMeetings.id, id));
      return { puntoId, notas };
    });
  }

  async agregarPunto(orgId: string, id: string, titulo: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [r] = await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, id)).for('update');
      if (!r) throw new NotFoundException('Reunión no encontrada');
      this.abierta(r);
      const nuevo = punto(titulo);
      await tx.update(committeeMeetings).set({ agenda: [...r.agenda, nuevo] }).where(eq(committeeMeetings.id, id));
      return nuevo;
    });
  }

  async asistencia(orgId: string, id: string, miembroId: string, presente: boolean) {
    return this.database.withTenant(orgId, async (tx) => {
      this.abierta(await this.reunion(tx, id));
      const [a] = await tx
        .update(meetingAttendance)
        .set({ present: presente, checkedInAt: presente ? new Date() : null })
        .where(and(eq(meetingAttendance.meetingId, id), eq(meetingAttendance.memberId, miembroId)))
        .returning();
      if (!a) throw new NotFoundException('Esa persona no está convocada a la reunión');
      return { miembroId, presente };
    });
  }

  /** Registro de llegada desde el celular del propio integrante. */
  async registrarLlegada(orgId: string, id: string, usuarioId: string) {
    const miembro = await this.database.withTenant(orgId, async (tx) => {
      const [m] = await tx.select().from(committeeMembers).where(eq(committeeMembers.userId, usuarioId));
      return m;
    });
    if (!miembro) throw new BadRequestException('Tu usuario no está vinculado a un integrante del comité');
    return this.asistencia(orgId, id, miembro.id, true);
  }

  async decision(orgId: string, id: string, input: DecisionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const r = await this.reunion(tx, id);
      this.abierta(r);
      const [{ presentes } = { presentes: 0 }] = await tx
        .select({ presentes: count() })
        .from(meetingAttendance)
        .where(and(eq(meetingAttendance.meetingId, id), eq(meetingAttendance.present, true)));
      if (presentes < r.quorumRequired) throw new BadRequestException(`No hay quórum para decidir: se necesitan ${r.quorumRequired} presentes`);
      if (input.votosAFavor + input.votosEnContra + input.abstenciones > presentes) {
        throw new BadRequestException('Hay más votos que integrantes presentes');
      }
      const [d] = await tx
        .insert(meetingDecisions)
        .values({
          meetingId: id,
          organizationId: orgId,
          agendaItemId: input.puntoId ?? null,
          text: input.texto,
          votesFor: input.votosAFavor,
          votesAgainst: input.votosEnContra,
          abstentions: input.abstenciones,
          approved: input.votosAFavor > input.votosEnContra,
        })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'comite.decision', entidad: 'meeting_decision', entidadId: d!.id });
      return d!;
    });
  }

  async compromiso(orgId: string, id: string, input: AccionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      this.abierta(await this.reunion(tx, id));
      return aAccion(await crearAccion(tx, orgId, { ...input, origen: 'comite', origenId: id }, actorId));
    });
  }

  async transcripcion(orgId: string, id: string, texto: string) {
    return this.database.withTenant(orgId, async (tx) => {
      this.abierta(await this.reunion(tx, id));
      await tx.update(committeeMeetings).set({ transcript: texto }).where(eq(committeeMeetings.id, id));
      return { ok: true };
    });
  }

  private materialActa(d: Awaited<ReturnType<ComiteService['detalle']>>) {
    return [
      `Reunión ${d.tipo} del ${d.fecha.toISOString()}${d.lugar ? ` en ${d.lugar}` : ''}.`,
      `Asistentes: ${d.asistencia.filter((a) => a.presente).map((a) => `${a.nombre} (${a.rolComite})`).join(', ') || 'ninguno registrado'}. Quórum requerido ${d.quorumRequerido}.`,
      ...d.agenda.map((p, i) => `Punto ${i + 1}: ${p.titulo}. Notas: ${p.notas || 'sin notas'}`),
      ...d.decisiones.map((x) => `Decisión: ${x.texto} (a favor ${x.votosAFavor}, en contra ${x.votosEnContra}, abstenciones ${x.abstenciones}).`),
      ...d.compromisos.map((c) => `Compromiso: ${c.descripcion}. Responsable ${c.responsable}. Fecha ${c.venceEl}.`),
      d.transcripcion ? `Transcripción:\n${d.transcripcion}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async borradorActa(orgId: string, id: string, actorId: string) {
    const d = await this.detalle(orgId, id);
    return { borrador: await this.ia.redactarActa(orgId, actorId, this.materialActa(d)) };
  }

  /**
   * Cierra la reunión: exige quórum (RN-21), genera el acta en PDF y la deja como evidencia del
   * paso 2 para aprobación del líder PESV. Desde aquí el contenido no cambia y empiezan las firmas.
   */
  async cerrar(orgId: string, id: string, resumen: string | undefined, actorId: string) {
    const d = await this.detalle(orgId, id);
    if (d.estado !== 'en_curso') throw new BadRequestException('Solo se puede cerrar una reunión en curso');
    if (!d.hayQuorum) throw new BadRequestException(`No hay quórum: se necesitan ${d.quorumRequerido} presentes y hay ${d.presentes}`);
    const org = await this.database.withTenant(orgId, async (tx) => (await tx.select().from(organizations).where(eq(organizations.id, orgId)))[0]!);
    const pdf = await generarActaPdf({
      organizacion: org.name,
      nit: org.nit,
      fecha: d.fecha,
      lugar: d.lugar,
      tipo: d.tipo,
      quorumRequerido: d.quorumRequerido,
      asistentes: d.asistencia.map((a) => ({ nombre: a.nombre, cargo: a.cargo, rol: a.rolComite, presente: a.presente })),
      puntos: d.agenda,
      decisiones: d.decisiones.map((x) => ({ texto: x.texto, aFavor: x.votosAFavor, enContra: x.votosEnContra, abstenciones: x.abstenciones, aprobada: x.aprobada })),
      compromisos: d.compromisos.map((c) => ({ descripcion: c.descripcion, responsable: c.responsable, venceEl: c.venceEl })),
      resumen,
    });
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const clave = `${orgId}/comite/${id}/acta.pdf`;
    await this.storage.guardar(clave, pdf, 'application/pdf');

    const paso2 = await this.database.withTenant(orgId, async (tx) => (await tx.select().from(stepCompliance).where(eq(stepCompliance.stepNumber, 2)))[0]);
    let evidenciaId: string | null = null;
    if (paso2 && paso2.status !== 'no_aplica') {
      const ev = await this.evidencias.crear(
        orgId,
        { titulo: `Acta del comité de seguridad vial · ${fechaCorta(d.fecha)}`, pasoNumero: 2, descripcion: 'Generada al cerrar la reunión en la plataforma.' },
        { nombre: `acta-comite-${d.fecha.toISOString().slice(0, 10)}.pdf`, tipo: 'application/pdf', datos: pdf },
        actorId,
      );
      evidenciaId = ev.id;
    }
    await this.database.withTenant(orgId, async (tx) => {
      await tx
        .update(committeeMeetings)
        .set({ status: 'cerrada', closedAt: new Date(), minutesKey: clave, minutesChecksum: checksum, evidenceId: evidenciaId })
        .where(eq(committeeMeetings.id, id));
      // Los siniestros tratados en la agenda quedan revisados por el comité (dato del registro de VIGIA 2).
      const hoy = new Date().toISOString().slice(0, 10);
      for (const p of d.agenda.filter((x) => x.origen?.startsWith('siniestro:'))) {
        await tx.update(crashes).set({ committeeReviewedOn: hoy }).where(eq(crashes.id, p.origen!.slice('siniestro:'.length)));
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'comite.reunion_cerrada', entidad: 'committee_meeting', entidadId: id, datos: { checksum } });
    });
    return { id, estado: 'cerrada', checksum, evidenciaId };
  }

  /** Firma electrónica del acta con confirmación de contraseña. Con todas las firmas, el acta queda firmada. */
  async firmar(orgId: string, id: string, usuario: UsuarioSesion, password: string) {
    const { rows } = await this.database.db.execute<{ password_hash: string | null }>(sql`select password_hash from auth_lookup_user(${usuario.email})`);
    if (!(await verifyPassword(password, rows[0]?.password_hash ?? null))) throw new UnauthorizedException('La contraseña no es correcta');
    return this.database.withTenant(orgId, async (tx) => {
      const r = await this.reunion(tx, id);
      if (r.status !== 'cerrada') throw new BadRequestException(r.status === 'firmada' ? 'El acta ya tiene todas las firmas' : 'El acta se firma después de cerrar la reunión');
      const [m] = await tx.select().from(committeeMembers).where(eq(committeeMembers.userId, usuario.id));
      if (!m) throw new BadRequestException('Tu usuario no está vinculado a un integrante del comité');
      const [a] = await tx.select().from(meetingAttendance).where(and(eq(meetingAttendance.meetingId, id), eq(meetingAttendance.memberId, m.id)));
      if (!a?.present) throw new BadRequestException('Solo firman quienes asistieron a la reunión');
      if (a.signedAt) throw new BadRequestException('Ya firmaste esta acta');
      const firmadoEn = new Date();
      const huella = createHash('sha256').update(`${id}|${m.id}|${firmadoEn.toISOString()}|${r.minutesChecksum}`).digest('hex');
      await tx
        .update(meetingAttendance)
        .set({ signedAt: firmadoEn, signatureHash: huella })
        .where(and(eq(meetingAttendance.meetingId, id), eq(meetingAttendance.memberId, m.id)));
      const pendientes = await tx
        .select({ id: meetingAttendance.memberId })
        .from(meetingAttendance)
        .innerJoin(committeeMembers, eq(committeeMembers.id, meetingAttendance.memberId))
        .where(and(eq(meetingAttendance.meetingId, id), eq(meetingAttendance.present, true), isNull(meetingAttendance.signedAt), sql`${committeeMembers.userId} is not null`));
      if (pendientes.length === 0) await tx.update(committeeMeetings).set({ status: 'firmada' }).where(eq(committeeMeetings.id, id));
      await auditar(tx, { organizacionId: orgId, actorId: usuario.id, accion: 'comite.acta_firmada', entidad: 'committee_meeting', entidadId: id, datos: { huella, documento: r.minutesChecksum } });
      return { firmadoEn, huella, pendientes: pendientes.length };
    });
  }

  async acta(orgId: string, id: string) {
    const r = await this.database.withTenant(orgId, (tx) => this.reunion(tx, id));
    if (!r.minutesKey) throw new NotFoundException('La reunión aún no tiene acta');
    return this.storage.leer(r.minutesKey);
  }
}

@Controller('org/comite')
export class ComiteController {
  constructor(private readonly service: ComiteService) {}

  @Get('miembros')
  @Permiso('ver')
  miembros(@OrgActual() org: OrgSesion) {
    return this.service.miembros(org.id);
  }

  @Post('miembros')
  @Permiso('comite')
  agregar(@Body(new ZodValidationPipe(miembroComiteSchema)) body: MiembroComiteInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.guardarMiembro(org.id, body, u.id);
  }

  @Patch('miembros/:id')
  @Permiso('comite')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(miembroComiteSchema)) body: MiembroComiteInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.guardarMiembro(org.id, body, u.id, id);
  }

  @Get('agenda-sugerida')
  @Permiso('ver')
  agenda(@OrgActual() org: OrgSesion) {
    return this.service.agendaSugerida(org.id);
  }

  @Get('reuniones')
  @Permiso('ver')
  reuniones(@OrgActual() org: OrgSesion) {
    return this.service.reuniones(org.id);
  }

  @Post('reuniones')
  @Permiso('comite')
  programar(@Body(new ZodValidationPipe(programarReunionSchema)) body: ProgramarReunionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.programar(org.id, body, u.id);
  }

  @Get('reuniones/:id')
  @Permiso('ver')
  detalle(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion) {
    return this.service.detalle(org.id, id);
  }

  @Post('reuniones/:id/iniciar')
  @Permiso('comite')
  iniciar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.iniciar(org.id, id, u.id);
  }

  @Patch('reuniones/:id/puntos/:puntoId')
  @Permiso('comite')
  notas(@Param('id', ParseUUIDPipe) id: string, @Param('puntoId') puntoId: string, @Body(new ZodValidationPipe(notasPuntoSchema)) body: { notas: string }, @OrgActual() org: OrgSesion) {
    return this.service.notasPunto(org.id, id, puntoId, body.notas);
  }

  @Post('reuniones/:id/puntos')
  @Permiso('comite')
  agregarPunto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ titulo: z.string().trim().min(3, 'Escribe el punto').max(300) }))) body: { titulo: string },
    @OrgActual() org: OrgSesion,
  ) {
    return this.service.agregarPunto(org.id, id, body.titulo);
  }

  @Post('reuniones/:id/asistencia')
  @Permiso('comite')
  asistencia(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(asistenciaSchema)) body: { miembroId: string; presente: boolean }, @OrgActual() org: OrgSesion) {
    return this.service.asistencia(org.id, id, body.miembroId, body.presente);
  }

  @Post('reuniones/:id/llegada')
  @Permiso('comite')
  llegada(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.registrarLlegada(org.id, id, u.id);
  }

  @Post('reuniones/:id/decisiones')
  @Permiso('comite')
  decision(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(decisionSchema)) body: DecisionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.decision(org.id, id, body, u.id);
  }

  @Post('reuniones/:id/compromisos')
  @Permiso('comite')
  compromiso(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(accionSchema)) body: AccionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.compromiso(org.id, id, body, u.id);
  }

  @Put('reuniones/:id/transcripcion')
  @Permiso('comite')
  transcripcion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ texto: z.string().max(200_000) }))) body: { texto: string },
    @OrgActual() org: OrgSesion,
  ) {
    return this.service.transcripcion(org.id, id, body.texto);
  }

  @Post('reuniones/:id/borrador-acta')
  @Permiso('comite')
  borrador(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.borradorActa(org.id, id, u.id);
  }

  @Post('reuniones/:id/cerrar')
  @Permiso('comite')
  cerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ resumen: z.string().max(50_000).optional() }))) body: { resumen?: string },
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.cerrar(org.id, id, body.resumen, u.id);
  }

  @Post('reuniones/:id/firmar')
  @Permiso('comite')
  firmar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(firmaActaSchema)) body: { password: string }, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.firmar(org.id, id, u, body.password);
  }

  @Get('reuniones/:id/acta')
  @Permiso('ver')
  async acta(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const pdf = await this.service.acta(org.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acta-comite-${id.slice(0, 8)}.pdf"`);
    return new StreamableFile(pdf);
  }
}

@Module({
  imports: [EvidenciasModule, FlotaModule, IaModule],
  controllers: [ComiteController],
  providers: [ComiteService],
})
export class ComiteModule {}
