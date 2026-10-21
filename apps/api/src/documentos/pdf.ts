import PDFDocument from 'pdfkit';
import type { ContextoDocumento } from './formato.service.js';

type Doc = InstanceType<typeof PDFDocument>;

export interface CeldaPdf {
  texto: string;
  fondo?: string;
  color?: string;
  negrita?: boolean;
  alinear?: 'left' | 'center' | 'right';
}
export interface ColumnaPdf {
  titulo: string;
  /** Ancho relativo; los anchos se reparten en el ancho útil de la página. */
  ancho: number;
  alinear?: 'left' | 'center' | 'right';
}

const ENCABEZADO_ALTO = 66;
const PIE_ALTO = 58;
const MARGEN = 36;
const GRIS = '#5B6576';
const LINEA = '#C9CED6';
const TINTA = '#1A2233';

/** Aclara un color hexadecimal mezclándolo con blanco (para fondos de encabezados de tabla). */
export function aclarar(hex: string, cantidad = 0.88) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * cantidad));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Lienzo de un documento con el formato del sistema de gestión. El contenido se escribe con los
 * métodos de esta clase; el encabezado y el pie se dibujan al final en todas las páginas, cuando
 * ya se conoce el total («Página X de Y»).
 */
export class DocumentoPdf {
  readonly doc: Doc;
  private readonly arriba: number;
  private readonly abajo: number;

  constructor(
    readonly ctx: ContextoDocumento,
    readonly horizontal = false,
  ) {
    this.arriba = MARGEN + ENCABEZADO_ALTO + 14;
    this.abajo = MARGEN + PIE_ALTO + 10;
    this.doc = new PDFDocument({
      size: 'LETTER',
      layout: horizontal ? 'landscape' : 'portrait',
      bufferPages: true,
      margins: { top: this.arriba, bottom: this.abajo, left: MARGEN, right: MARGEN },
      info: { Title: `${ctx.codigo} ${ctx.titulo}`, Author: ctx.organizacion.nombre, Creator: 'Plataforma PESV' },
    });
  }

  get ancho() {
    return this.doc.page.width - MARGEN * 2;
  }
  private get limiteInferior() {
    return this.doc.page.height - this.abajo;
  }

  /** Salta de página si no caben `alto` puntos más. */
  asegurar(alto: number) {
    if (this.doc.y + alto > this.limiteInferior) this.doc.addPage();
  }

  titulo(texto: string, tamano = 12) {
    this.asegurar(40);
    this.doc.moveDown(0.6).font('Helvetica-Bold').fontSize(tamano).fillColor(this.ctx.color).text(texto, MARGEN, this.doc.y, { width: this.ancho });
    this.doc.moveDown(0.3);
    return this;
  }

  parrafo(texto: string, opciones: { tamano?: number; color?: string; negrita?: boolean } = {}) {
    this.doc
      .font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opciones.tamano ?? 9.5)
      .fillColor(opciones.color ?? TINTA)
      .text(texto, MARGEN, this.doc.y, { width: this.ancho, align: 'left' });
    return this;
  }

  espacio(lineas = 0.5) {
    this.doc.moveDown(lineas);
    return this;
  }

  /** Pares etiqueta–valor en dos columnas (datos generales de un documento). */
  datos(pares: [string, string][], columnas = 2) {
    const anchoCol = this.ancho / columnas;
    for (let i = 0; i < pares.length; i += columnas) {
      const fila = pares.slice(i, i + columnas);
      // Se mide en negrilla (la etiqueta lo es y ocupa más) para que el texto que se parte no se monte en la fila siguiente.
      const alto = Math.max(...fila.map(([k, v]) => this.doc.font('Helvetica-Bold').fontSize(9).heightOfString(`${k}: ${v || '—'}`, { width: anchoCol - 8 }))) + 4;
      this.asegurar(alto);
      const y = this.doc.y;
      fila.forEach(([k, v], j) => {
        this.doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS).text(`${k}: `, MARGEN + j * anchoCol, y, { width: anchoCol - 8, continued: true });
        this.doc.font('Helvetica').fillColor(TINTA).text(v || '—');
      });
      this.doc.y = y + alto;
    }
    this.doc.x = MARGEN;
    return this;
  }

  /**
   * Tabla con encabezado que se repite en cada página. Las filas que no caben pasan a la página
   * siguiente completas.
   */
  tabla(columnas: ColumnaPdf[], filas: (string | CeldaPdf)[][], opciones: { tamano?: number } = {}) {
    const tamano = opciones.tamano ?? 8;
    const total = columnas.reduce((t, c) => t + c.ancho, 0);
    const anchos = columnas.map((c) => (c.ancho / total) * this.ancho);
    const relleno = 3;
    const altoDe = (textos: string[], negrita: boolean) =>
      Math.max(
        ...textos.map((t, i) => this.doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano).heightOfString(t || ' ', { width: anchos[i]! - relleno * 2 })),
      ) +
      relleno * 2;

    const dibujarFila = (celdas: CeldaPdf[], encabezado: boolean) => {
      const alto = altoDe(celdas.map((c) => c.texto), encabezado || celdas.some((c) => c.negrita));
      let x = MARGEN;
      const y = this.doc.y;
      celdas.forEach((c, i) => {
        const w = anchos[i]!;
        const fondo = encabezado ? aclarar(this.ctx.color, 0.85) : c.fondo;
        if (fondo) this.doc.rect(x, y, w, alto).fill(fondo);
        this.doc.rect(x, y, w, alto).lineWidth(0.5).strokeColor(LINEA).stroke();
        this.doc
          .font(encabezado || c.negrita ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(tamano)
          .fillColor(c.color ?? (encabezado ? this.ctx.color : TINTA))
          .text(c.texto || '', x + relleno, y + relleno, { width: w - relleno * 2, align: c.alinear ?? columnas[i]!.alinear ?? 'left' });
        x += w;
      });
      this.doc.y = y + alto;
      this.doc.x = MARGEN;
      return alto;
    };

    const cabecera = columnas.map((c): CeldaPdf => ({ texto: c.titulo, alinear: c.alinear }));
    this.asegurar(altoDe(cabecera.map((c) => c.texto), true) + 18);
    dibujarFila(cabecera, true);
    for (const fila of filas) {
      const celdas = fila.map((c) => (typeof c === 'string' ? { texto: c } : c));
      const alto = altoDe(celdas.map((c) => c.texto), celdas.some((c) => c.negrita));
      if (this.doc.y + alto > this.limiteInferior) {
        this.doc.addPage();
        dibujarFila(cabecera, true);
      }
      dibujarFila(celdas, false);
    }
    this.doc.moveDown(0.5);
    return this;
  }

  /** Texto con formato sencillo: # títulos, ## subtítulos, - viñetas, 1. numerados y **negrita**. */
  textoConFormato(texto: string) {
    for (const bruto of texto.replace(/\r/g, '').split('\n')) {
      const linea = bruto.trimEnd();
      if (!linea.trim()) {
        this.doc.moveDown(0.4);
        continue;
      }
      const h = /^(#{1,3})\s+(.*)$/.exec(linea);
      if (h) {
        this.titulo(h[2]!.replace(/\*\*/g, ''), h[1]!.length === 1 ? 13 : h[1]!.length === 2 ? 11.5 : 10.5);
        continue;
      }
      const vineta = /^\s*[-*]\s+(.*)$/.exec(linea);
      const numero = /^\s*(\d+)[.)]\s+(.*)$/.exec(linea);
      const sangria = vineta || numero ? 14 : 0;
      const contenido = vineta ? vineta[1]! : numero ? numero[2]! : linea;
      this.asegurar(14);
      const y = this.doc.y;
      if (vineta || numero) this.doc.font('Helvetica').fontSize(9.5).fillColor(TINTA).text(vineta ? '•' : `${numero![1]}.`, MARGEN + 2, y, { width: 12 });
      // Negritas: se escriben por tramos continuos.
      const tramos = contenido.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
      this.doc.text('', MARGEN + sangria, y, { width: this.ancho - sangria, continued: tramos.length > 1 });
      tramos.forEach((t, i) => {
        const negrita = t.startsWith('**') && t.endsWith('**');
        this.doc
          .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9.5)
          .fillColor(TINTA)
          .text(negrita ? t.slice(2, -2) : t, { width: this.ancho - sangria, continued: i < tramos.length - 1, align: 'justify' });
      });
      this.doc.x = MARGEN;
      this.doc.moveDown(0.15);
    }
    return this;
  }

  /** Imagen (por ejemplo una gráfica en PNG) ajustada al ancho disponible. */
  imagen(datos: Buffer, alto: number) {
    this.asegurar(alto + 10);
    this.doc.image(datos, MARGEN, this.doc.y, { fit: [this.ancho, alto], align: 'center' });
    this.doc.y += alto + 8;
    return this;
  }

  private encabezado() {
    const d = this.doc;
    const { ctx } = this;
    const x = MARGEN;
    const y = MARGEN;
    const w = this.ancho;
    const anchoLogo = 120;
    const anchoDatos = 150;
    const anchoCentro = w - anchoLogo - anchoDatos;
    d.lineWidth(0.8).strokeColor(ctx.color);
    d.rect(x, y, w, ENCABEZADO_ALTO).stroke();
    d.moveTo(x + anchoLogo, y).lineTo(x + anchoLogo, y + ENCABEZADO_ALTO).stroke();
    d.moveTo(x + anchoLogo + anchoCentro, y).lineTo(x + anchoLogo + anchoCentro, y + ENCABEZADO_ALTO).stroke();
    const mitad = y + ENCABEZADO_ALTO / 2;
    d.moveTo(x + anchoLogo, mitad).lineTo(x + anchoLogo + anchoCentro, mitad).stroke();

    if (ctx.logo) {
      try {
        d.image(ctx.logo.datos, x + 6, y + 6, { fit: [anchoLogo - 12, ENCABEZADO_ALTO - 12], align: 'center', valign: 'center' });
      } catch {
        d.font('Helvetica-Bold').fontSize(9).fillColor(ctx.color).text(ctx.organizacion.nombre, x + 6, y + 24, { width: anchoLogo - 12, align: 'center' });
      }
    } else {
      d.font('Helvetica-Bold').fontSize(9).fillColor(ctx.color).text(ctx.organizacion.nombre, x + 6, y + 22, { width: anchoLogo - 12, align: 'center' });
    }

    d.font('Helvetica-Bold').fontSize(9.5).fillColor(TINTA).text(ctx.organizacion.nombre, x + anchoLogo + 6, y + 6, { width: anchoCentro - 12, align: 'center', height: 14, ellipsis: true });
    d.font('Helvetica').fontSize(8).fillColor(GRIS).text(`NIT ${ctx.organizacion.nit}`, x + anchoLogo + 6, y + 19, { width: anchoCentro - 12, align: 'center' });
    d.font('Helvetica-Bold').fontSize(9).fillColor(ctx.color).text(ctx.titulo.toUpperCase(), x + anchoLogo + 6, mitad + 5, { width: anchoCentro - 12, align: 'center', height: ENCABEZADO_ALTO / 2 - 8, ellipsis: true });

    const filas: [string, string][] = [
      ['Código', ctx.codigo],
      ['Versión', String(ctx.version)],
      ['Fecha', ctx.fechaVersion],
    ];
    const altoFila = ENCABEZADO_ALTO / filas.length;
    filas.forEach(([k, v], i) => {
      const fy = y + i * altoFila;
      if (i > 0) d.moveTo(x + anchoLogo + anchoCentro, fy).lineTo(x + w, fy).stroke();
      d.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text(`${k}:`, x + anchoLogo + anchoCentro + 6, fy + altoFila / 2 - 4, { width: 46 });
      d.font('Helvetica').fontSize(8).fillColor(TINTA).text(v, x + anchoLogo + anchoCentro + 52, fy + altoFila / 2 - 4, { width: anchoDatos - 58 });
    });
  }

  private pie(pagina: number, total: number) {
    const d = this.doc;
    const { ctx } = this;
    const x = MARGEN;
    const w = this.ancho;
    const y = d.page.height - MARGEN - PIE_ALTO;
    const altoFirmas = 36;
    const col = w / 3;
    d.lineWidth(0.6).strokeColor(LINEA);
    d.rect(x, y, w, altoFirmas).stroke();
    d.moveTo(x + col, y).lineTo(x + col, y + altoFirmas).stroke();
    d.moveTo(x + col * 2, y).lineTo(x + col * 2, y + altoFirmas).stroke();
    (
      [
        ['Elaboró', ctx.elaboro],
        ['Revisó', ctx.reviso],
        ['Aprobó', ctx.aprobo],
      ] as const
    ).forEach(([rol, f], i) => {
      const cx = x + col * i + 6;
      d.font('Helvetica-Bold').fontSize(7.5).fillColor(GRIS).text(rol, cx, y + 4, { width: col - 12 });
      d.font('Helvetica').fontSize(8).fillColor(TINTA).text(f.nombre ?? '', cx, y + 14, { width: col - 12, height: 10, ellipsis: true });
      d.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(f.cargo ?? '', cx, y + 24, { width: col - 12, height: 10, ellipsis: true });
    });
    const yTexto = y + altoFirmas + 6;
    if (ctx.pie) d.font('Helvetica').fontSize(7).fillColor(GRIS).text(ctx.pie, x, yTexto, { width: w - 110, height: 16, ellipsis: true });
    d.font('Helvetica-Bold').fontSize(8).fillColor(TINTA).text(`Página ${pagina} de ${total}`, x + w - 100, yTexto, { width: 100, align: 'right' });
  }

  /** Dibuja encabezado y pie en todas las páginas y devuelve el PDF. */
  terminar(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const partes: Buffer[] = [];
      this.doc.on('data', (c: Buffer) => partes.push(c));
      this.doc.on('end', () => resolve(Buffer.concat(partes)));
      this.doc.on('error', reject);
      const rango = this.doc.bufferedPageRange();
      for (let i = rango.start; i < rango.start + rango.count; i++) {
        this.doc.switchToPage(i);
        // Sin márgenes mientras se dibuja fuera del área de contenido (si no, PDFKit agrega páginas).
        const margenes = { ...this.doc.page.margins };
        this.doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
        this.encabezado();
        this.pie(i - rango.start + 1, rango.count);
        this.doc.page.margins = margenes;
      }
      this.doc.end();
    });
  }
}
