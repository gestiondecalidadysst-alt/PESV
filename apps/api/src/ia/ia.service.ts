import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AGENTES_IA,
  CORRESPONDENCIA_PESV_ISO,
  FASE_LABEL,
  NIVEL_LABEL,
  PASOS_PESV,
  RES_40595_2022,
  type AgenteIa,
  type IaConfigInput,
  type Nivel,
  type RedactarInput,
} from '@pesv/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { auditar } from '../common/audit.js';
import { decrypt, encrypt } from '../common/crypto.js';
import { DatabaseService } from '../db/database.service.js';
import { aiMessages, aiSettings, aiUsage } from '../db/schema.js';
import { EventosService } from '../eventos/eventos.service.js';
import { EvidenciasService } from '../evidencias/evidencias.module.js';
import { FlotaService } from '../flota/flota.module.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { completar, ErrorProveedorIa, type ConfigProveedor, type ImagenIa, type MensajeIa } from './proveedores.js';

type FilaConfig = typeof aiSettings.$inferSelect;

export interface Fuente {
  id: string;
  titulo: string;
}

const PRINCIPIOS = `Eres el copiloto de una plataforma de gestión del Plan Estratégico de Seguridad Vial (PESV) en Colombia.
Reglas:
- Responde en español de Colombia, claro y breve. Usa listas solo cuando ayuden.
- Básate solo en el CONTEXTO entregado. Si algo no está en el contexto, dilo y sugiere dónde verificarlo.
- Cita la fuente entre corchetes con su identificador, por ejemplo [Paso 13] o [Alertas].
- No inventes cifras, fechas, nombres ni artículos de norma.
- Recuerda que tus sugerencias son borradores: una persona de la organización debe revisarlas y aprobarlas.`;

const inicioDeMes = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

@Injectable()
export class IaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizaciones: OrganizationsService,
    private readonly flota: FlotaService,
    private readonly evidencias: EvidenciasService,
    private readonly eventos: EventosService,
  ) {}

  private async fila(orgId: string): Promise<FilaConfig | null> {
    return this.database.withTenant(orgId, async (tx) => {
      const [f] = await tx.select().from(aiSettings).where(eq(aiSettings.organizationId, orgId));
      return f ?? null;
    });
  }

  /** Configuración visible: nunca devuelve la clave, solo sus últimos 4 caracteres (RN-12). */
  async config(orgId: string) {
    const f = await this.fila(orgId);
    const gastado = await this.gastoDelMes(orgId);
    if (!f) return { configurado: false as const, gastoMesUsd: gastado };
    return {
      configurado: true as const,
      proveedor: f.provider,
      modelo: f.model,
      modeloEconomico: f.economicModel,
      urlBase: f.baseUrl,
      despliegue: f.deployment,
      versionApi: f.apiVersion,
      tieneClave: !!f.apiKeyEncrypted,
      claveTermina: f.apiKeyLast4,
      presupuestoMensualUsd: f.monthlyBudgetUsd,
      precioEntradaPorMillon: f.priceInputPerMtok,
      precioSalidaPorMillon: f.priceOutputPerMtok,
      umbralAlertaPct: f.alertThresholdPct,
      agentes: f.enabledAgents,
      verificadoEn: f.verifiedAt,
      gastoMesUsd: gastado,
    };
  }

  /** Estado mínimo para cualquier miembro: qué agentes puede usar la interfaz (RN-11). */
  async estado(orgId: string) {
    const f = await this.fila(orgId);
    return { activa: !!f, agentes: f?.enabledAgents ?? [] };
  }

  async guardar(orgId: string, input: IaConfigInput, actorId: string) {
    const anterior = await this.fila(orgId);
    const pideClave = input.proveedor !== 'local';
    if (pideClave && !input.claveApi && !anterior?.apiKeyEncrypted) {
      throw new BadRequestException('Escribe la clave de API del proveedor');
    }
    const cambioDeProveedor = anterior && anterior.provider !== input.proveedor;
    const clave = input.claveApi
      ? { apiKeyEncrypted: encrypt(input.claveApi), apiKeyLast4: input.claveApi.slice(-4) }
      : cambioDeProveedor || !pideClave
        ? { apiKeyEncrypted: null, apiKeyLast4: null }
        : {};
    if (cambioDeProveedor && pideClave && !input.claveApi) {
      throw new BadRequestException('Cambiaste de proveedor: escribe la clave de API del nuevo proveedor');
    }
    const valores = {
      provider: input.proveedor,
      model: input.modelo,
      economicModel: input.modeloEconomico ?? null,
      baseUrl: input.urlBase ?? null,
      deployment: input.despliegue ?? null,
      apiVersion: input.versionApi ?? null,
      monthlyBudgetUsd: input.presupuestoMensualUsd ?? null,
      priceInputPerMtok: input.precioEntradaPorMillon,
      priceOutputPerMtok: input.precioSalidaPorMillon,
      alertThresholdPct: input.umbralAlertaPct,
      enabledAgents: input.agentes,
      verifiedAt: null,
      updatedBy: actorId,
      updatedAt: new Date(),
      ...clave,
    };
    await this.database.withTenant(orgId, async (tx) => {
      await tx
        .insert(aiSettings)
        .values({ organizationId: orgId, ...valores })
        .onConflictDoUpdate({ target: aiSettings.organizationId, set: valores });
      await auditar(tx, {
        organizacionId: orgId,
        actorId,
        accion: 'ia.configurada',
        entidad: 'ai_settings',
        entidadId: orgId,
        datos: { proveedor: input.proveedor, modelo: input.modelo, claveNueva: !!input.claveApi },
      });
    });
    return this.config(orgId);
  }

  private configProveedor(f: FilaConfig, economico = false): ConfigProveedor {
    return {
      proveedor: f.provider as ConfigProveedor['proveedor'],
      modelo: (economico && f.economicModel) || f.model,
      claveApi: f.apiKeyEncrypted ? decrypt(f.apiKeyEncrypted) : null,
      urlBase: f.baseUrl,
      despliegue: f.deployment,
      versionApi: f.apiVersion,
    };
  }

  async gastoDelMes(orgId: string): Promise<number> {
    return this.database.withTenant(orgId, async (tx) => {
      const [r] = await tx
        .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, inicioDeMes()));
      return Number(r?.total ?? 0);
    });
  }

  /** Ejecuta una llamada al proveedor del cliente con control de agente, presupuesto y registro de uso. */
  private async llamar(
    orgId: string,
    usuarioId: string | null,
    agente: AgenteIa,
    sistema: string,
    mensajes: MensajeIa[],
    opciones: { maxTokens?: number; imagen?: ImagenIa; economico?: boolean; ignorarAgente?: boolean } = {},
  ) {
    const f = await this.fila(orgId);
    if (!f) throw new BadRequestException('La organización aún no configuró su proveedor de IA');
    if (!opciones.ignorarAgente && !f.enabledAgents.includes(agente)) {
      const nombre = AGENTES_IA.find((a) => a.id === agente)?.nombre ?? agente;
      throw new BadRequestException(`El agente "${nombre}" está desactivado en la configuración de IA`);
    }
    const gastado = await this.gastoDelMes(orgId);
    if (f.monthlyBudgetUsd !== null && f.monthlyBudgetUsd > 0 && gastado >= f.monthlyBudgetUsd) {
      throw new HttpException(
        'Se alcanzó el tope de gasto de IA de este mes. Un administrador puede ampliarlo en la configuración.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const config = this.configProveedor(f, opciones.economico);
    let respuesta;
    try {
      respuesta = await completar(config, { sistema, mensajes, maxTokens: opciones.maxTokens, imagen: opciones.imagen });
    } catch (err) {
      if (err instanceof ErrorProveedorIa) throw new HttpException(err.message, HttpStatus.BAD_GATEWAY);
      throw err;
    }
    const costo =
      (respuesta.tokensEntrada * f.priceInputPerMtok + respuesta.tokensSalida * f.priceOutputPerMtok) / 1_000_000;
    await this.database.withTenant(orgId, async (tx) => {
      await tx.insert(aiUsage).values({
        organizationId: orgId,
        userId: usuarioId || null,
        agent: agente,
        model: respuesta.modelo,
        inputTokens: respuesta.tokensEntrada,
        outputTokens: respuesta.tokensSalida,
        costUsd: costo,
      });
      const total = gastado + costo;
      if (f.monthlyBudgetUsd && total >= (f.monthlyBudgetUsd * f.alertThresholdPct) / 100) {
        const mes = new Date().toISOString().slice(0, 7);
        await this.eventos.emitir(
          tx,
          orgId,
          'ia.presupuesto',
          { gastoUsd: Number(total.toFixed(4)), presupuestoUsd: f.monthlyBudgetUsd, umbralPct: f.alertThresholdPct },
          `ia.presupuesto:${mes}`,
        );
      }
    });
    return respuesta;
  }

  async probar(orgId: string, actorId: string) {
    const inicio = Date.now();
    const r = await this.llamar(orgId, actorId, 'copiloto', 'Responde exactamente con la palabra OK.', [{ rol: 'user', texto: 'Prueba de conexión' }], {
      maxTokens: 20,
      ignorarAgente: true,
    });
    await this.database.withTenant(orgId, (tx) =>
      tx.update(aiSettings).set({ verifiedAt: new Date() }).where(eq(aiSettings.organizationId, orgId)),
    );
    return { ok: true, modelo: r.modelo, milisegundos: Date.now() - inicio };
  }

  /** Contexto con los datos de la organización y la norma, con identificadores citables. */
  private async contexto(orgId: string): Promise<{ texto: string; fuentes: Fuente[] }> {
    const [detalle, pasos, alertas, vehiculos, conductores] = await Promise.all([
      this.organizaciones.obtener(orgId),
      this.organizaciones.pasos(orgId),
      this.flota.alertas(orgId),
      this.flota.vehiculos(orgId),
      this.flota.conductores(orgId),
    ]);
    const nivel = detalle.clasificacion?.level as Nivel | undefined;
    const fuentes: Fuente[] = [
      { id: 'Organización', titulo: `${detalle.organizacion.name}: clasificación y avance` },
      { id: 'Res. 40595', titulo: RES_40595_2022.nombre },
      { id: 'Alertas', titulo: 'Vencimientos y vehículos no aptos' },
    ];
    const lineasPasos = pasos.map((p) => {
      const def = PASOS_PESV.find((d) => d.numero === p.numero)!;
      return `[Paso ${p.numero}] ${p.nombre} · fase ${FASE_LABEL[def.fase]} · estado: ${p.estado} · evidencias aprobadas: ${p.evidencias.aprobadas}, en revisión: ${p.evidencias.enRevision}, rechazadas: ${p.evidencias.rechazadas} · ISO 39001: ${(CORRESPONDENCIA_PESV_ISO[p.numero] ?? []).join(', ')}`;
    });
    const texto = `CONTEXTO
[Organización] ${detalle.organizacion.name}. Misionalidad ${detalle.organizacion.misionalidad}. Nivel ${nivel ? NIVEL_LABEL[nivel] : 'sin clasificar'}. ${detalle.clasificacion?.vehicles ?? 0} vehículos y ${detalle.clasificacion?.drivers ?? 0} conductores en la clasificación vigente; registrados en la plataforma: ${vehiculos.length} vehículos y ${conductores.length} conductores. Cumplimiento: ${detalle.resumen.hechos} de ${detalle.resumen.aplicables} pasos aplicables (${detalle.resumen.porcentajeCumplimiento} %).
[Res. 40595] Metodología de 24 pasos en ciclo PHVA. Básico aplica 18 pasos, estándar 22 (suma 2, 13, 18 y 19), avanzado 24 (suma 11 y 21). Un paso solo se marca hecho con evidencia aprobada.
${lineasPasos.join('\n')}
[Alertas] ${alertas.length ? alertas.slice(0, 15).map((a) => `${a.titulo}: ${a.detalle}`).join('; ') : 'Sin alertas activas.'}`;
    return { texto, fuentes: [...fuentes, ...pasos.map((p) => ({ id: `Paso ${p.numero}`, titulo: p.nombre }))] };
  }

  async copiloto(orgId: string, usuarioId: string, pregunta: string) {
    const { texto, fuentes } = await this.contexto(orgId);
    const historial = await this.database.withTenant(orgId, (tx) =>
      tx
        .select()
        .from(aiMessages)
        .where(and(eq(aiMessages.organizationId, orgId), eq(aiMessages.userId, usuarioId)))
        .orderBy(desc(aiMessages.createdAt))
        .limit(6),
    );
    const mensajes: MensajeIa[] = [
      ...historial.reverse().map((m) => ({ rol: m.role as 'user' | 'assistant', texto: m.content })),
      { rol: 'user', texto: pregunta },
    ];
    const r = await this.llamar(orgId, usuarioId, 'copiloto', `${PRINCIPIOS}\n\n${texto}`, mensajes, { maxTokens: 1200 });
    const citadas = fuentes.filter((f) => r.texto.includes(`[${f.id}]`));
    await this.database.withTenant(orgId, (tx) =>
      tx.insert(aiMessages).values([
        { organizationId: orgId, userId: usuarioId, role: 'user', content: pregunta },
        { organizationId: orgId, userId: usuarioId, role: 'assistant', content: r.texto, sources: citadas },
      ]),
    );
    return { respuesta: r.texto, fuentes: citadas };
  }

  historial(orgId: string, usuarioId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (
        await tx
          .select()
          .from(aiMessages)
          .where(and(eq(aiMessages.organizationId, orgId), eq(aiMessages.userId, usuarioId)))
          .orderBy(desc(aiMessages.createdAt))
          .limit(40)
      )
        .reverse()
        .map((m) => ({ id: m.id, rol: m.role, texto: m.content, fuentes: m.sources, fecha: m.createdAt })),
    );
  }

  /** Borrador de documento que queda como evidencia en revisión; no cuenta hasta aprobarse (RN-10). */
  async redactar(orgId: string, usuarioId: string, input: RedactarInput) {
    const paso = PASOS_PESV.find((p) => p.numero === input.pasoNumero);
    if (!paso) throw new NotFoundException('Paso no encontrado');
    const { texto } = await this.contexto(orgId);
    const sistema = `${PRINCIPIOS}
Tu tarea ahora es redactar un borrador de documento en Markdown para el paso ${paso.numero} (${paso.nombre}).
- Empieza con un título de nivel 1.
- Adapta el contenido a la organización del contexto (nivel, misionalidad, flota).
- Deja entre corchetes los datos que la organización debe completar, por ejemplo [Nombre del representante legal].
- No incluyas citas de fuente en el documento.
\n${texto}`;
    const r = await this.llamar(
      orgId,
      usuarioId,
      'redactor',
      sistema,
      [{ rol: 'user', texto: `Documento: ${input.documento}.${input.instrucciones ? ` Indicaciones: ${input.instrucciones}` : ''}` }],
      { maxTokens: 3000 },
    );
    const evidencia = await this.evidencias.crear(
      orgId,
      { titulo: `${input.documento} (borrador IA)`, descripcion: 'Borrador generado con IA. Revísalo y apruébalo antes de usarlo.', pasoNumero: input.pasoNumero },
      { nombre: `${input.documento}.md`, tipo: 'text/markdown', datos: Buffer.from(r.texto, 'utf8') },
      usuarioId,
      { generadaPorIa: true },
    );
    return { evidenciaId: evidencia.id, contenido: r.texto };
  }

  async diagnostico(orgId: string, usuarioId: string) {
    const { texto, fuentes } = await this.contexto(orgId);
    const r = await this.llamar(
      orgId,
      usuarioId,
      'diagnostico',
      `${PRINCIPIOS}\n\n${texto}`,
      [
        {
          rol: 'user',
          texto:
            'Haz un diagnóstico del avance del PESV: qué pasos aplicables están pendientes o sin evidencia aprobada, cuáles atender primero y por qué, y qué alertas operativas afectan el cumplimiento. Máximo 12 viñetas.',
        },
      ],
      { maxTokens: 1500 },
    );
    return { diagnostico: r.texto, fuentes: fuentes.filter((f) => r.texto.includes(`[${f.id}]`)) };
  }

  /** Extrae datos de un documento (SOAT, revisión técnico-mecánica, licencia) desde una foto. */
  async leerDocumento(orgId: string, usuarioId: string, imagen: ImagenIa) {
    const r = await this.llamar(
      orgId,
      usuarioId,
      'lector',
      'Extraes datos de documentos colombianos de tránsito. Responde solo con un objeto JSON válido, sin texto adicional.',
      [
        {
          rol: 'user',
          texto:
            'Identifica el documento de la imagen y devuelve: {"tipo": "soat" | "rtm" | "licencia" | "otro", "placa": string | null, "documentoTitular": string | null, "nombreTitular": string | null, "numero": string | null, "venceEl": "AAAA-MM-DD" | null, "categoria": string | null, "confianza": "alta" | "media" | "baja"}. Usa null si un dato no se ve con claridad.',
        },
      ],
      { maxTokens: 400, imagen, economico: true },
    );
    const json = r.texto.match(/\{[\s\S]*\}/)?.[0];
    try {
      return JSON.parse(json ?? '') as Record<string, unknown>;
    } catch {
      throw new HttpException('No se pudieron leer los datos del documento. Intenta con una foto más nítida.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  async uso(orgId: string) {
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({
          agente: aiUsage.agent,
          llamadas: sql<number>`count(*)::int`,
          tokensEntrada: sql<number>`sum(${aiUsage.inputTokens})::int`,
          tokensSalida: sql<number>`sum(${aiUsage.outputTokens})::int`,
          costoUsd: sql<number>`sum(${aiUsage.costUsd})::float`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, inicioDeMes()))
        .groupBy(aiUsage.agent),
    );
  }
}
