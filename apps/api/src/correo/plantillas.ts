import { EVENTOS, NIVEL_SINIESTRO_LABEL } from '@pesv/shared';

/** Un correo listo para enviar: asunto, HTML y texto plano (para clientes sin HTML y filtros de spam). */
export interface Mensaje {
  asunto: string;
  html: string;
  texto: string;
}

const escapar = (v: unknown) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

interface Contenido {
  asunto: string;
  titulo: string;
  parrafos: string[];
  /** Filas de datos (etiqueta, valor) que se muestran como tabla. */
  datos?: [string, string][];
  boton?: { texto: string; url: string };
  nota?: string;
}

/** Diseño común: cabecera con la marca, contenido y pie. Estilos en línea para los clientes de correo. */
function componer(c: Contenido): Mensaje {
  const filas = (c.datos ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5b6576;font-size:14px;vertical-align:top">${escapar(k)}</td><td style="padding:6px 0;color:#1a2233;font-size:14px;font-weight:600">${escapar(v)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapar(c.asunto)}</title></head>
<body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2233">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e5ea">
<tr><td style="background:#0f1b2d;padding:18px 24px"><span style="display:inline-block;background:#f2b705;color:#0f1b2d;font-weight:800;border-radius:6px;padding:2px 8px;margin-right:8px">P</span><span style="color:#ffffff;font-weight:700;font-size:16px">PESV</span></td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f1b2d">${escapar(c.titulo)}</h1>
${c.parrafos.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${escapar(p)}</p>`).join('')}
${filas ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px">${filas}</table>` : ''}
${c.boton ? `<p style="margin:8px 0 22px"><a href="${escapar(c.boton.url)}" style="display:inline-block;background:#f2b705;color:#0f1b2d;font-weight:700;text-decoration:none;border-radius:8px;padding:12px 20px;font-size:15px">${escapar(c.boton.texto)}</a></p>` : ''}
${c.nota ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#5b6576">${escapar(c.nota)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e5ea;font-size:12px;color:#5b6576">Plataforma de gestión del Plan Estratégico de Seguridad Vial. Este correo se envió automáticamente; no lo respondas.</td></tr>
</table></td></tr></table></body></html>`;
  const texto = [
    c.titulo,
    '',
    ...c.parrafos,
    ...(c.datos?.length ? ['', ...c.datos.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(c.boton ? ['', `${c.boton.texto}: ${c.boton.url}`] : []),
    ...(c.nota ? ['', c.nota] : []),
  ].join('\n');
  return { asunto: c.asunto, html, texto };
}

export function correoRecuperacion(nombre: string, enlace: string, minutos: number): Mensaje {
  return componer({
    asunto: 'Restablece tu contraseña',
    titulo: `Hola, ${nombre}`,
    parrafos: ['Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa el botón para crear una nueva.'],
    boton: { texto: 'Crear una nueva contraseña', url: enlace },
    nota: `El enlace vence en ${minutos} minutos y solo se puede usar una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.`,
  });
}

export function correoInvitacion(nombre: string, organizacion: string, invitadoPor: string, enlace: string, dias: number): Mensaje {
  return componer({
    asunto: `Te invitaron a ${organizacion} en la plataforma PESV`,
    titulo: `Hola, ${nombre}`,
    parrafos: [`${invitadoPor} te agregó a ${organizacion} para gestionar el Plan Estratégico de Seguridad Vial. Crea tu contraseña para entrar.`],
    boton: { texto: 'Crear mi contraseña', url: enlace },
    nota: `El enlace vence en ${dias} días. Si no esperabas esta invitación, ignora este correo.`,
  });
}

export function correoAgregado(nombre: string, organizacion: string, invitadoPor: string, enlace: string): Mensaje {
  return componer({
    asunto: `Ahora tienes acceso a ${organizacion}`,
    titulo: `Hola, ${nombre}`,
    parrafos: [`${invitadoPor} te dio acceso a ${organizacion}. Entra con tu correo y tu contraseña de siempre y elige la organización en el menú.`],
    boton: { texto: 'Entrar', url: enlace },
  });
}

export function correoContrasenaCambiada(nombre: string, enlaceRecuperar: string): Mensaje {
  return componer({
    asunto: 'Tu contraseña cambió',
    titulo: `Hola, ${nombre}`,
    parrafos: ['La contraseña de tu cuenta se acaba de cambiar y se cerraron las sesiones abiertas en otros dispositivos.'],
    nota: `Si no fuiste tú, restablece tu contraseña de inmediato en ${enlaceRecuperar} y avisa al administrador de tu organización.`,
  });
}

export function correoPrueba(organizacion: string): Mensaje {
  return componer({
    asunto: 'Correo de prueba de la plataforma PESV',
    titulo: 'El correo funciona',
    parrafos: [`Este es un correo de prueba enviado desde la configuración de notificaciones de ${organizacion}.`],
  });
}

export function correoAlertaError(info: { fuente: string; mensaje: string; ruta: string | null; ocurrencias: number; enlace: string }): Mensaje {
  return componer({
    asunto: `[PESV] Error nuevo en ${info.fuente}: ${info.mensaje.slice(0, 80)}`,
    titulo: 'Se registró un error nuevo en la plataforma',
    parrafos: ['El registro de errores detectó un error que no se había visto o que volvió a aparecer después de marcarse como resuelto.'],
    datos: [
      ['Origen', info.fuente],
      ['Mensaje', info.mensaje],
      ['Ruta', info.ruta ?? '—'],
      ['Ocurrencias', String(info.ocurrencias)],
    ],
    boton: { texto: 'Ver en el panel de la plataforma', url: info.enlace },
    nota: 'Recibirás como máximo un aviso por hora por cada error.',
  });
}

// Notificaciones de eventos ----------------------------------------------------------

const fecha = (v: unknown) => {
  if (typeof v !== 'string' || !v) return '—';
  const d = new Date(v.length === 10 ? `${v}T12:00:00-05:00` : v);
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', ...(v.length > 10 ? { timeStyle: 'short' } : {}), timeZone: 'America/Bogota' }).format(d);
};
const texto = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v));

/** Asunto, explicación, datos y página de la web de cada evento (para el correo de notificación). */
export function resumenEvento(tipo: string, d: Record<string, unknown>): { asunto: string; parrafo: string; datos: [string, string][]; ruta: string } {
  const nombre = EVENTOS.find((e) => e.id === tipo)?.nombre ?? tipo;
  switch (tipo) {
    case 'documento.vencido':
    case 'documento.por_vencer': {
      const vencido = tipo === 'documento.vencido';
      return {
        asunto: `${vencido ? 'Documento vencido' : 'Documento por vencer'}: ${texto(d.titulo)}`,
        parrafo: vencido
          ? 'Un documento ya venció. Mientras no se renueve, no se pueden asignar desplazamientos con ese vehículo o conductor.'
          : 'Un documento está próximo a vencer. Renuévalo a tiempo para no frenar la operación.',
        datos: [
          ['Documento', texto(d.titulo)],
          ['Detalle', texto(d.detalle)],
          ['Vence', fecha(d.vence)],
          ...(typeof d.dias === 'number' && d.dias >= 0 ? ([['Días restantes', String(d.dias)]] as [string, string][]) : []),
        ],
        ruta: '/flota',
      };
    }
    case 'preoperacional.falla':
      return {
        asunto: `Vehículo ${texto(d.placa)} no apto: falla crítica en el preoperacional`,
        parrafo: 'El vehículo quedó no apto para operar hasta que mantenimiento cierre la falla.',
        datos: [['Placa', texto(d.placa)], ['Fallas críticas', texto(d.fallas)]],
        ruta: '/mantenimiento',
      };
    case 'evidencia.por_revisar':
      return {
        asunto: `Evidencia por revisar en el paso ${texto(d.paso)}`,
        parrafo: d.generadaPorIa ? 'La IA preparó un borrador que debe revisar y aprobar una persona.' : 'Se subió una evidencia que espera aprobación.',
        datos: [['Evidencia', texto(d.titulo)], ['Paso', texto(d.paso)], ['Versión', texto(d.version)]],
        ruta: `/pasos/${texto(d.paso)}`,
      };
    case 'evidencia.decidida':
      return {
        asunto: `Evidencia ${texto(d.decision)}: ${texto(d.titulo)}`,
        parrafo: d.decision === 'rechazada' ? 'Revisa el motivo y sube una nueva versión.' : 'La evidencia quedó aprobada.',
        datos: [['Evidencia', texto(d.titulo)], ['Decisión', texto(d.decision)], ...(d.motivo ? ([['Motivo', texto(d.motivo)]] as [string, string][]) : [])],
        ruta: '/pasos',
      };
    case 'siniestro.creado':
      return {
        asunto: `Siniestro registrado: ${texto(d.placa)}`,
        parrafo: d.investigacionObligatoria
          ? 'Se registró un siniestro vial. En el nivel de la organización la investigación es obligatoria y el comité debe revisarlo.'
          : 'Se registró un siniestro vial.',
        datos: [
          ['Placa', texto(d.placa)],
          ['Nivel', NIVEL_SINIESTRO_LABEL[d.nivel as keyof typeof NIVEL_SINIESTRO_LABEL] ?? texto(d.nivel)],
          ['Fecha', fecha(d.ocurridoEn)],
        ],
        ruta: `/siniestros/${texto(d.siniestroId)}`,
      };
    case 'mantenimiento.vencido':
      return {
        asunto: `Mantenimiento vencido: ${texto(d.placa)}`,
        parrafo: 'Un mantenimiento preventivo no se hizo en la fecha o el kilometraje del plan.',
        datos: [['Placa', texto(d.placa)], ['Plan', texto(d.plan)], ['Fecha prevista', fecha(d.proximaFecha)], ['Kilometraje previsto', texto(d.proximoKm)]],
        ruta: '/mantenimiento',
      };
    case 'vigia.plazo':
      return {
        asunto: `VIGIA 2: el formulario ${texto(d.formulario)} vence el ${fecha(d.plazo)}`,
        parrafo: 'Se acerca el plazo de reporte a Supertransporte.',
        datos: [['Formulario', texto(d.formulario)], ['Periodo', texto(d.periodo)], ['Días para el plazo', texto(d.diasParaPlazo)], ['Datos por completar', texto((d.datosPorCompletar as unknown[] | undefined)?.length ?? 0)]],
        ruta: '/vigia',
      };
    case 'accion.por_vencer':
      return {
        asunto: `${d.vencida ? 'Acción vencida' : 'Acción por vencer'}: ${texto(d.descripcion)}`,
        parrafo: 'Hay un compromiso con fecha límite próxima o vencida.',
        datos: [['Acción', texto(d.descripcion)], ['Responsable', texto(d.responsable)], ['Fecha límite', fecha(d.venceEl)]],
        ruta: '/acciones',
      };
    case 'comite.reunion':
      return {
        asunto: `Reunión del comité de seguridad vial: ${fecha(d.fecha)}`,
        parrafo: 'Estás convocado a la reunión del comité de seguridad vial.',
        datos: [['Fecha', fecha(d.fecha)], ['Lugar', texto(d.lugar)], ['Orden del día', texto(d.agenda)]],
        ruta: `/comite/${texto(d.reunionId)}`,
      };
    case 'auditoria.hallazgo':
      return {
        asunto: `Hallazgo de auditoría: ${texto(d.tipo)}`,
        parrafo: 'Se registró un hallazgo que requiere seguimiento en el plan de mejora.',
        datos: [['Tipo', texto(d.tipo)], ['Paso', texto(d.paso)], ['Cláusula ISO', texto(d.clausulaIso)], ['Descripción', texto(d.descripcion)]],
        ruta: `/auditorias/${texto(d.auditoriaId)}`,
      };
    case 'riesgo.critico':
      return {
        asunto: `Riesgo crítico: ${d.tipo === 'vehiculo' ? `vehículo ${texto(d.placa)}` : texto(d.nombre)}`,
        parrafo: 'El puntaje de riesgo entró en la banda crítica. Revisa los factores y define acciones.',
        datos: [
          [d.tipo === 'vehiculo' ? 'Vehículo' : 'Conductor', d.tipo === 'vehiculo' ? texto(d.placa) : texto(d.nombre)],
          ['Puntaje', texto(d.puntaje)],
          ['Factores', ((d.factores as { factor: string; puntos: number }[] | undefined) ?? []).map((f) => `${f.factor} (+${f.puntos})`).join(', ') || '—'],
        ],
        ruta: '/riesgo',
      };
    case 'informe.listo':
      return { asunto: `Informe mensual ${texto(d.mes)}`, parrafo: 'Los indicadores del mes cerrado están disponibles.', datos: [['Mes', texto(d.mes)]], ruta: '/' };
    case 'ia.presupuesto':
      return {
        asunto: 'El consumo de IA llegó al umbral del mes',
        parrafo: 'Al llegar al tope configurado, la IA se pausa hasta el próximo mes o hasta que un administrador lo amplíe.',
        datos: [['Gasto del mes (USD)', texto(d.gastoUsd)], ['Tope (USD)', texto(d.presupuestoUsd)]],
        ruta: '/configuracion/ia',
      };
    default:
      return { asunto: nombre, parrafo: EVENTOS.find((e) => e.id === tipo)?.descripcion ?? '', datos: [], ruta: '/' };
  }
}

/** El enlace lleva ?org= para abrir la organización correcta si la persona pertenece a varias. */
export function correoEvento(organizacion: string, tipo: string, datos: Record<string, unknown>, webUrl: string, orgId: string): Mensaje {
  const r = resumenEvento(tipo, datos);
  return componer({
    asunto: `${r.asunto} · ${organizacion}`,
    titulo: r.asunto,
    parrafos: [r.parrafo, `Organización: ${organizacion}.`].filter(Boolean),
    datos: r.datos,
    boton: { texto: 'Abrir en la plataforma', url: `${webUrl}${r.ruta}?org=${orgId}` },
    nota: 'Recibes este correo por las notificaciones configuradas en tu organización. Un administrador puede cambiarlas en Configuración › Notificaciones.',
  });
}
