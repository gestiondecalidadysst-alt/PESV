import type { ContextoDocumento } from '../documentos/formato.service.js';
import { DocumentoPdf } from '../documentos/pdf.js';

export interface DatosActa {
  fecha: Date;
  lugar: string | null;
  tipo: string;
  quorumRequerido: number;
  asistentes: { nombre: string; cargo: string | null; rol: string; presente: boolean }[];
  puntos: { titulo: string; notas: string }[];
  decisiones: { texto: string; aFavor: number; enContra: number; abstenciones: number; aprobada: boolean }[];
  compromisos: { descripcion: string; responsable: string; venceEl: string }[];
  resumen?: string | null;
}

const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);

/** Acta del comité en PDF con el formato del sistema de gestión (el contenido queda fijo antes de las firmas). */
export function generarActaPdf(ctx: ContextoDocumento, d: DatosActa): Promise<Buffer> {
  const pdf = new DocumentoPdf(ctx);
  const presentes = d.asistentes.filter((a) => a.presente);
  pdf.datos([
    ['Tipo de reunión', d.tipo === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'],
    ['Fecha y hora', fechaLarga(d.fecha)],
    ['Lugar', d.lugar ?? '—'],
    ['Quórum', `${presentes.length} de ${d.asistentes.length} (requerido ${d.quorumRequerido}) · ${presentes.length >= d.quorumRequerido ? 'hay quórum' : 'sin quórum'}`],
  ]);

  pdf.titulo('Asistencia');
  pdf.tabla(
    [{ titulo: 'Nombre', ancho: 5 }, { titulo: 'Cargo', ancho: 4 }, { titulo: 'Rol en el comité', ancho: 3 }, { titulo: 'Asistencia', ancho: 2, alinear: 'center' }],
    d.asistentes.map((a) => [a.nombre, a.cargo ?? '—', a.rol.replace('_', ' '), { texto: a.presente ? 'Presente' : 'Ausente', alinear: 'center' }]),
  );

  pdf.titulo('Desarrollo de la reunión');
  d.puntos.forEach((p, i) => {
    pdf.parrafo(`${i + 1}. ${p.titulo}`, { negrita: true }).parrafo(p.notas.trim() || 'Sin observaciones registradas.').espacio(0.4);
  });

  if (d.decisiones.length) {
    pdf.titulo('Decisiones');
    pdf.tabla(
      [{ titulo: '#', ancho: 1 }, { titulo: 'Decisión', ancho: 10 }, { titulo: 'Votación', ancho: 4 }, { titulo: 'Resultado', ancho: 3 }],
      d.decisiones.map((x, i) => [String(i + 1), x.texto, `A favor ${x.aFavor} · en contra ${x.enContra} · abstenciones ${x.abstenciones}`, x.aprobada ? 'Aprobada' : 'No aprobada']),
    );
  }

  if (d.compromisos.length) {
    pdf.titulo('Compromisos');
    pdf.tabla(
      [{ titulo: '#', ancho: 1 }, { titulo: 'Compromiso', ancho: 10 }, { titulo: 'Responsable', ancho: 4 }, { titulo: 'Fecha límite', ancho: 3 }],
      d.compromisos.map((c, i) => [String(i + 1), c.descripcion, c.responsable, c.venceEl]),
    );
  }

  if (d.resumen?.trim()) {
    pdf.titulo('Relato del acta');
    pdf.textoConFormato(d.resumen.trim());
  }

  pdf.titulo('Firmas');
  pdf.parrafo('Los asistentes firman electrónicamente en la plataforma. La constancia de cada firma (fecha, hora y huella del documento) queda en el registro de auditoría.');
  return pdf.terminar();
}
