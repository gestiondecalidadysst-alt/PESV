/** Eventos que la plataforma envía a n8n u otros destinos por webhook. */
export const EVENTOS = [
  { id: 'documento.por_vencer', nombre: 'Documento por vencer', descripcion: 'Licencia, SOAT, revisión técnico-mecánica o examen médico; aviso 30, 15 y 5 días antes.' },
  { id: 'documento.vencido', nombre: 'Documento vencido', descripcion: 'Un documento de un vehículo o conductor ya venció.' },
  { id: 'preoperacional.falla', nombre: 'Preoperacional con falla crítica', descripcion: 'El vehículo queda no apto hasta que mantenimiento cierre la falla.' },
  { id: 'evidencia.por_revisar', nombre: 'Evidencia por revisar', descripcion: 'Se subió una evidencia que el líder PESV debe aprobar o rechazar.' },
  { id: 'evidencia.decidida', nombre: 'Evidencia revisada', descripcion: 'Una evidencia fue aprobada o rechazada.' },
  { id: 'siniestro.creado', nombre: 'Siniestro registrado', descripcion: 'Notifica al comité y abre la investigación.' },
  { id: 'mantenimiento.vencido', nombre: 'Mantenimiento vencido', descripcion: 'Preventivo no ejecutado en la fecha o kilometraje del plan.' },
  { id: 'vigia.plazo', nombre: 'Plazo de reporte VIGIA 2', descripcion: 'Formularios mensuales y trimestrales por enviar.' },
  { id: 'accion.por_vencer', nombre: 'Acción correctiva por vencer', descripcion: 'Compromisos del comité y acciones de auditoría.' },
  { id: 'comite.reunion', nombre: 'Reunión del comité', descripcion: 'Convocatoria con la agenda sugerida.' },
  { id: 'informe.listo', nombre: 'Informe mensual listo', descripcion: 'Indicadores del mes cerrado.' },
  { id: 'auditoria.hallazgo', nombre: 'Hallazgo de auditoría', descripcion: 'No conformidad u observación registrada en una auditoría (pasos 22 y 23).' },
  { id: 'riesgo.critico', nombre: 'Riesgo crítico', descripcion: 'Un conductor o vehículo entró en la banda de riesgo crítico.' },
  { id: 'ia.presupuesto', nombre: 'Consumo de IA alto', descripcion: 'El consumo del mes llegó al umbral configurado.' },
  { id: 'prueba', nombre: 'Evento de prueba', descripcion: 'Enviado manualmente para probar la integración.' },
] as const;

export type TipoEvento = (typeof EVENTOS)[number]['id'];
export const IDS_EVENTO = EVENTOS.map((e) => e.id) as [TipoEvento, ...TipoEvento[]];

/** Alcances de los tokens de API (RN-31). */
export const ALCANCES_TOKEN = [
  { id: 'leer', nombre: 'Leer indicadores, alertas y registros' },
  { id: 'crear_novedades', nombre: 'Crear preoperacionales y siniestros' },
  { id: 'reportes', nombre: 'Descargar reportes' },
  { id: 'telematica', nombre: 'Enviar viajes desde la plataforma GPS' },
] as const;
export type AlcanceToken = (typeof ALCANCES_TOKEN)[number]['id'];
export const IDS_ALCANCE_TOKEN = ALCANCES_TOKEN.map((a) => a.id) as [AlcanceToken, ...AlcanceToken[]];
