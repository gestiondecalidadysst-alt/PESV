import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  campanaEncuestaSchema,
  cuestionarioPorId,
  CUESTIONARIO_VIGENTE,
  hallazgosPerfil,
  resumirRespuestas,
  respuestaEncuestaSchema,
  validarRespuestas,
  type CampanaEncuestaInput,
  type Cuestionario,
  type RespuestaEncuestaInput,
  type Respuestas,
} from '@pesv/shared';
import { randomBytes } from 'node:crypto';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { OrgActual, Permiso, Publico, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar, esViolacionUnica } from '../common/audit.js';
import { Limitador } from '../common/limitador.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { config } from '../config.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { drivers, surveyCampaigns, surveyResponses } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';

type FilaCampana = typeof surveyCampaigns.$inferSelect;

const hoy = () => new Date().toISOString().slice(0, 10);
const limiteEnvio = new Limitador(20, 15 * 60_000);

interface CampanaPublica {
  campaign_id: string;
  organization_id: string;
  organization_name: string;
  title: string;
  questionnaire: string;
  status: string;
  anonymous: boolean;
  closes_on: string | null;
}

const abierta = (c: { status: string; closes_on?: string | null; closesOn?: string | null }) => {
  const cierre = c.closes_on ?? c.closesOn ?? null;
  return c.status === 'abierta' && (!cierre || cierre >= hoy());
};

const aCampana = (c: FilaCampana, respuestas: number) => ({
  id: c.id,
  titulo: c.title,
  cuestionario: c.questionnaire,
  estado: c.status as 'abierta' | 'cerrada',
  abierta: abierta(c),
  anonima: c.anonymous,
  cierraEl: c.closesOn,
  enlace: `${config.webUrl}/encuesta/${c.token}`,
  respuestas,
  creadaEl: c.createdAt,
});

/**
 * Encuesta de perfil sociodemográfico y de desplazamientos (diagnóstico, paso 5). Se responde en la
 * plataforma o por un enlace público desde el celular, con autorización de tratamiento de datos.
 */
@Injectable()
export class PerfilService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  private async campana(tx: TenantTx, id: string) {
    const [c] = await tx.select().from(surveyCampaigns).where(eq(surveyCampaigns.id, id));
    if (!c) throw new NotFoundException('Encuesta no encontrada');
    return c;
  }

  private cuestionario(id: string): Cuestionario {
    return cuestionarioPorId(id) ?? CUESTIONARIO_VIGENTE;
  }

  listar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(surveyCampaigns).orderBy(desc(surveyCampaigns.createdAt));
      const conteos = await tx
        .select({ id: surveyResponses.campaignId, n: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .groupBy(surveyResponses.campaignId);
      return filas.map((c) => aCampana(c, conteos.find((x) => x.id === c.id)?.n ?? 0));
    });
  }

  crear(orgId: string, input: CampanaEncuestaInput, actorId: string) {
    if (input.cierraEl && input.cierraEl < hoy()) throw new BadRequestException('La fecha de cierre no puede estar en el pasado');
    return this.database.withTenant(orgId, async (tx) => {
      const [c] = await tx
        .insert(surveyCampaigns)
        .values({ organizationId: orgId, title: input.titulo, questionnaire: CUESTIONARIO_VIGENTE.id, token: randomBytes(18).toString('base64url'), anonymous: input.anonima, closesOn: input.cierraEl ?? null, createdBy: actorId })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'perfil.encuesta_creada', entidad: 'survey_campaign', entidadId: c!.id });
      return aCampana(c!, 0);
    });
  }

  cambiarEstado(orgId: string, id: string, estado: 'abierta' | 'cerrada', actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const c = await this.campana(tx, id);
      if (estado === 'abierta' && c.closesOn && c.closesOn < hoy()) throw new BadRequestException('La fecha de cierre ya pasó: crea una encuesta nueva');
      await tx.update(surveyCampaigns).set({ status: estado, closedAt: estado === 'cerrada' ? new Date() : null }).where(eq(surveyCampaigns.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: estado === 'cerrada' ? 'perfil.encuesta_cerrada' : 'perfil.encuesta_reabierta', entidad: 'survey_campaign', entidadId: id });
      return { estado };
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.campana(tx, id);
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(surveyResponses).where(eq(surveyResponses.campaignId, id));
      if (n > 0) throw new BadRequestException('La encuesta ya tiene respuestas: ciérrala en lugar de eliminarla');
      await tx.delete(surveyCampaigns).where(eq(surveyCampaigns.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'perfil.encuesta_eliminada', entidad: 'survey_campaign', entidadId: id });
    });
  }

  /** Resultados: distribución por pregunta, hallazgos, cobertura y quiénes faltan por responder. */
  resultados(orgId: string, id: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const c = await this.campana(tx, id);
      const filas = await tx.select().from(surveyResponses).where(eq(surveyResponses.campaignId, id)).orderBy(desc(surveyResponses.submittedAt));
      const activos = await tx.select({ id: drivers.id, nombre: drivers.fullName, documento: drivers.documentNumber }).from(drivers).where(eq(drivers.active, true)).orderBy(asc(drivers.fullName));
      const cuestionario = this.cuestionario(c.questionnaire);
      const respuestas = filas.map((f) => f.answers as Respuestas);
      const respondieron = new Set(filas.flatMap((f) => [f.driverId, f.documentNumber]).filter(Boolean));
      const conductoresQueRespondieron = activos.filter((d) => respondieron.has(d.id) || respondieron.has(d.documento)).length;
      return {
        campana: aCampana(c, filas.length),
        total: filas.length,
        conductoresActivos: activos.length,
        conductoresQueRespondieron,
        cobertura: c.anonymous || !activos.length ? null : Math.round((conductoresQueRespondieron / activos.length) * 1000) / 10,
        pendientes: c.anonymous ? [] : activos.filter((d) => !respondieron.has(d.id) && !respondieron.has(d.documento)),
        hallazgos: hallazgosPerfil(respuestas),
        resumen: resumirRespuestas(cuestionario, respuestas),
        respuestas: filas.map((f) => ({ id: f.id, nombre: f.fullName, documento: f.documentNumber, conductorId: f.driverId, canal: f.channel, enviadaEl: f.submittedAt })),
      };
    });
  }

  /** Guarda una respuesta (por enlace o registrada en la plataforma). */
  private async guardarRespuesta(tx: TenantTx, orgId: string, c: { id: string; anonymous: boolean; questionnaire: string }, input: RespuestaEncuestaInput, canal: 'enlace' | 'interno', actorId: string | null) {
    const v = validarRespuestas(this.cuestionario(c.questionnaire), input.respuestas);
    if (!v.ok) throw new BadRequestException({ message: 'Revisa las respuestas marcadas', errores: Object.entries(v.errores).map(([campo, mensaje]) => ({ campo: `respuestas.${campo}`, mensaje })) });
    let conductorId: string | null = null;
    let documento: string | null = null;
    let nombre: string | null = null;
    if (!c.anonymous) {
      if (input.conductorId) {
        const [d] = await tx.select().from(drivers).where(eq(drivers.id, input.conductorId));
        if (!d) throw new BadRequestException('El conductor no existe');
        conductorId = d.id;
        documento = d.documentNumber;
        nombre = d.fullName;
      } else {
        if (!input.documento || !input.nombre) throw new BadRequestException('Escribe tu nombre y tu cédula');
        documento = input.documento;
        nombre = input.nombre;
        const [d] = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.documentNumber, documento));
        conductorId = d?.id ?? null;
      }
    }
    try {
      const [r] = await tx
        .insert(surveyResponses)
        .values({ organizationId: orgId, campaignId: c.id, driverId: conductorId, documentNumber: documento, fullName: nombre, answers: v.respuestas, channel: canal, consentAt: new Date(), submittedBy: actorId })
        .returning({ id: surveyResponses.id });
      return r!.id;
    } catch (e) {
      if (esViolacionUnica(e)) throw new ConflictException('Esta persona ya respondió la encuesta');
      throw e;
    }
  }

  registrarInterna(orgId: string, id: string, input: RespuestaEncuestaInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const c = await this.campana(tx, id);
      if (!abierta(c)) throw new BadRequestException('La encuesta está cerrada');
      const respuestaId = await this.guardarRespuesta(tx, orgId, c, input, 'interno', actorId);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'perfil.respuesta', entidad: 'survey_response', entidadId: respuestaId });
      return { id: respuestaId };
    });
  }

  eliminarRespuesta(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [r] = await tx.delete(surveyResponses).where(eq(surveyResponses.id, id)).returning({ id: surveyResponses.id });
      if (!r) throw new NotFoundException('Respuesta no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'perfil.respuesta_eliminada', entidad: 'survey_response', entidadId: id });
    });
  }

  // Enlace público --------------------------------------------------------------------

  private async publica(token: string): Promise<CampanaPublica> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new NotFoundException('La encuesta no existe');
    const { rows } = await this.database.db.execute<CampanaPublica & Record<string, unknown>>(sql`select * from survey_by_token(${token})`);
    if (!rows[0]) throw new NotFoundException('La encuesta no existe');
    return rows[0];
  }

  async verPublica(token: string) {
    const c = await this.publica(token);
    const logo = await this.formato.logo(c.organization_id);
    return { organizacion: c.organization_name, titulo: c.title, cuestionario: c.questionnaire, anonima: c.anonymous, abierta: abierta(c), cierraEl: c.closes_on, tieneLogo: !!logo };
  }

  async logoPublico(token: string) {
    const c = await this.publica(token);
    const logo = await this.formato.logo(c.organization_id);
    if (!logo) throw new NotFoundException('Sin logo');
    return logo;
  }

  async responderPublica(token: string, input: RespuestaEncuestaInput) {
    const c = await this.publica(token);
    if (!abierta(c)) throw new BadRequestException('Esta encuesta ya está cerrada');
    return this.database.withTenant(c.organization_id, async (tx) => {
      const id = await this.guardarRespuesta(tx, c.organization_id, { id: c.campaign_id, anonymous: c.anonymous, questionnaire: c.questionnaire }, { ...input, conductorId: null }, 'enlace', null);
      await auditar(tx, { organizacionId: c.organization_id, actorId: null, accion: 'perfil.respuesta_enlace', entidad: 'survey_response', entidadId: id });
      return { recibida: true };
    });
  }

  // Documentos ------------------------------------------------------------------------

  async pdf(orgId: string, id: string) {
    const [r, ctx] = await Promise.all([this.resultados(orgId, id), this.formato.contexto(orgId, 'perfil_conductores')]);
    const doc = new DocumentoPdf(ctx);
    doc.datos(
      [
        ['Encuesta', r.campana.titulo],
        ['Respuestas', String(r.total)],
        ['Conductores activos', String(r.conductoresActivos)],
        ['Cobertura de conductores', r.cobertura == null ? 'Encuesta anónima' : `${r.cobertura} % (${r.conductoresQueRespondieron} de ${r.conductoresActivos})`],
        ['Estado', r.campana.abierta ? 'Abierta' : 'Cerrada'],
        ['Fecha del informe', hoy()],
      ],
      2,
    );
    doc.titulo('Hallazgos para el diagnóstico');
    doc.tabla(
      [{ titulo: 'Hallazgo', ancho: 8 }, { titulo: '%', ancho: 2, alinear: 'center' }, { titulo: 'Por qué importa', ancho: 9 }],
      r.hallazgos.map((h) => [h.nombre, { texto: h.valor == null ? '—' : `${h.valor} %`, negrita: true, alinear: 'center' }, h.ayuda]),
      { tamano: 8.5 },
    );
    let seccion = '';
    for (const p of r.resumen) {
      if (p.seccion !== seccion) {
        seccion = p.seccion;
        doc.titulo(seccion);
      }
      doc.parrafo(`${p.texto} (${p.respondieron} ${p.respondieron === 1 ? 'respuesta' : 'respuestas'}${p.base !== r.total ? ` de ${p.base} a quienes aplica` : ''})`, { tamano: 8.5, negrita: true });
      if (p.tipo === 'texto') {
        doc.parrafo(p.textos.length ? p.textos.slice(0, 30).map((t) => `• ${t}`).join('\n') : 'Sin respuestas.', { tamano: 8, color: '#5b6576' });
      } else {
        doc.tabla(
          [{ titulo: 'Respuesta', ancho: 8 }, { titulo: 'Personas', ancho: 2, alinear: 'center' }, { titulo: '%', ancho: 2, alinear: 'center' }, { titulo: '', ancho: 6 }],
          p.opciones.map((o) => [o.nombre, { texto: String(o.cantidad), alinear: 'center' }, { texto: `${o.porcentaje} %`, alinear: 'center' }, '█'.repeat(Math.round(o.porcentaje / 5)) || ' ']),
          { tamano: 7.5 },
        );
      }
    }
    if (r.resumen.some((p) => p.tipo === 'multiple')) doc.parrafo('En las preguntas de selección múltiple los porcentajes pueden sumar más de 100 %.', { tamano: 7.5, color: '#5b6576' });
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-perfil-colaboradores.pdf` };
  }

  async excel(orgId: string, id: string) {
    const [r, ctx] = await Promise.all([this.resultados(orgId, id), this.formato.contexto(orgId, 'perfil_conductores')]);
    const cuestionario = this.cuestionario(r.campana.cuestionario);
    const filas = await this.database.withTenant(orgId, (tx) => tx.select().from(surveyResponses).where(eq(surveyResponses.campaignId, id)).orderBy(asc(surveyResponses.submittedAt)));
    const texto = (pid: string, v: string | string[] | undefined) => {
      const p = cuestionario.preguntas.find((x) => x.id === pid)!;
      if (v == null) return null;
      if (p.tipo === 'texto') return v as string;
      const nombre = (id: string) => p.opciones!.find((o) => o.id === id)?.nombre ?? id;
      return Array.isArray(v) ? v.map(nombre).join('; ') : nombre(v);
    };
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Resumen',
        columnas: [{ titulo: 'Sección', ancho: 26 }, { titulo: 'Pregunta', ancho: 50 }, { titulo: 'Respuesta', ancho: 36 }, { titulo: 'Personas', ancho: 10 }, { titulo: '%', ancho: 8 }],
        notas: [`${r.total} respuestas. Cobertura de conductores: ${r.cobertura == null ? 'encuesta anónima' : `${r.cobertura} %`}.`],
        filas: r.resumen.flatMap((p) => (p.tipo === 'texto' ? [] : p.opciones.map((o): ValorExcel[] => [p.seccion, p.texto, o.nombre, o.cantidad, o.porcentaje]))),
      },
      {
        nombre: 'Respuestas',
        horizontal: true,
        columnas: [
          { titulo: 'Fecha', ancho: 12 },
          { titulo: 'Canal', ancho: 10 },
          ...(r.campana.anonima ? [] : [{ titulo: 'Nombre', ancho: 26 }, { titulo: 'Cédula', ancho: 14 }]),
          ...cuestionario.preguntas.map((p) => ({ titulo: p.texto, ancho: p.tipo === 'texto' ? 36 : 20 })),
        ],
        filas: filas.map((f) => {
          const a = f.answers as Respuestas;
          return [f.submittedAt.toISOString().slice(0, 10), f.channel === 'enlace' ? 'Enlace' : 'Plataforma', ...(r.campana.anonima ? [] : [f.fullName, f.documentNumber]), ...cuestionario.preguntas.map((p) => texto(p.id, a[p.id]))];
        }),
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-perfil-colaboradores.xlsx` };
  }

  async evidencia(orgId: string, id: string, actorId: string) {
    const { datos, nombre } = await this.pdf(orgId, id);
    const ev = await this.evidencias.crear(orgId, { titulo: `Perfil sociodemográfico y de desplazamientos · ${hoy()}`, pasoNumero: 5, descripcion: 'Informe de la encuesta de caracterización generado en la plataforma.' }, { nombre, tipo: MIME_PDF, datos }, actorId);
    return { evidenciaId: ev.id };
  }
}

@Controller('org/perfil-conductores')
export class PerfilController {
  constructor(private readonly s: PerfilService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() o: OrgSesion) {
    return this.s.listar(o.id);
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(campanaEncuestaSchema)) b: CampanaEncuestaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.crear(o.id, b, u.id);
  }

  @Get(':id')
  @Permiso('ver')
  resultados(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion) {
    return this.s.resultados(o.id, id);
  }

  @Post(':id/cerrar')
  @Permiso('gestionar_pesv')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.cambiarEstado(o.id, id, 'cerrada', u.id);
  }

  @Post(':id/reabrir')
  @Permiso('gestionar_pesv')
  reabrir(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.cambiarEstado(o.id, id, 'abierta', u.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Post(':id/respuestas')
  @Permiso('gestionar_pesv')
  registrar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(respuestaEncuestaSchema)) b: RespuestaEncuestaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.registrarInterna(o.id, id, b, u.id);
  }

  @Delete('respuestas/:id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminarRespuesta(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminarRespuesta(o.id, id, u.id);
  }

  @Get(':id/exportar')
  @Permiso('ver')
  async exportar(@Param('id', ParseUUIDPipe) id: string, @Query('formato') formato: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.s.excel(o.id, id) : await this.s.pdf(o.id, id);
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post(':id/evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidencia(o.id, id, u.id);
  }
}

/** Enlace público de la encuesta (sin sesión). */
@Controller('encuesta')
export class EncuestaPublicaController {
  constructor(private readonly s: PerfilService) {}

  @Get(':token')
  @Publico()
  ver(@Param('token') token: string) {
    return this.s.verPublica(token);
  }

  @Get(':token/logo')
  @Publico()
  async logo(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const l = (await this.s.logoPublico(token))!;
    res.setHeader('Content-Type', l.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return new StreamableFile(l.datos);
  }

  @Post(':token')
  @Publico()
  responder(@Param('token') token: string, @Body(new ZodValidationPipe(respuestaEncuestaSchema)) b: RespuestaEncuestaInput, @Req() req: Request) {
    limiteEnvio.verificar(`encuesta:${req.ip}`);
    return this.s.responderPublica(token, b);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [PerfilController, EncuestaPublicaController], providers: [PerfilService] })
export class PerfilModule {}
