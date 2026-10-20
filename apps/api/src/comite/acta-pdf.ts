import PDFDocument from 'pdfkit';

export interface DatosActa {
  organizacion: string;
  nit: string;
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

/** Genera el acta del comité en PDF (el contenido queda fijo antes de las firmas). */
export function generarActaPdf(d: DatosActa): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 56, info: { Title: `Acta del comité de seguridad vial · ${d.organizacion}` } });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const titulo = (t: string) => doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor('#0f1b2d').text(t).moveDown(0.3);
    const parrafo = (t: string) => doc.font('Helvetica').fontSize(10).fillColor('#1a2233').text(t, { align: 'left' });

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f1b2d').text('Acta de reunión del comité de seguridad vial');
    doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#5b6576');
    doc.text(`${d.organizacion} · NIT ${d.nit}`);
    doc.text(`Reunión ${d.tipo} · ${fechaLarga(d.fecha)}${d.lugar ? ` · ${d.lugar}` : ''}`);

    const presentes = d.asistentes.filter((a) => a.presente);
    titulo('Asistencia y quórum');
    parrafo(`Asistieron ${presentes.length} de ${d.asistentes.length} integrantes. Quórum requerido: ${d.quorumRequerido}. ${presentes.length >= d.quorumRequerido ? 'Hay quórum para deliberar y decidir.' : 'No hubo quórum.'}`);
    doc.moveDown(0.3);
    for (const a of d.asistentes) parrafo(`${a.presente ? 'Presente' : 'Ausente'} · ${a.nombre}${a.cargo ? `, ${a.cargo}` : ''} (${a.rol.replace('_', ' ')})`);

    titulo('Desarrollo de la reunión');
    d.puntos.forEach((p, i) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a2233').text(`${i + 1}. ${p.titulo}`);
      parrafo(p.notas.trim() || 'Sin observaciones registradas.');
      doc.moveDown(0.4);
    });

    if (d.decisiones.length) {
      titulo('Decisiones');
      d.decisiones.forEach((x, i) =>
        parrafo(`${i + 1}. ${x.texto} · ${x.aprobada ? 'Aprobada' : 'No aprobada'} (a favor ${x.aFavor}, en contra ${x.enContra}, abstenciones ${x.abstenciones})`),
      );
    }

    if (d.compromisos.length) {
      titulo('Compromisos');
      d.compromisos.forEach((c, i) => parrafo(`${i + 1}. ${c.descripcion} · Responsable: ${c.responsable} · Fecha: ${c.venceEl}`));
    }

    if (d.resumen?.trim()) {
      titulo('Relato del acta');
      parrafo(d.resumen.trim());
    }

    titulo('Firmas');
    parrafo('Los asistentes firman electrónicamente en la plataforma. La constancia de cada firma (fecha, hora y huella del documento) queda en el registro de auditoría.');
    doc.end();
  });
}
