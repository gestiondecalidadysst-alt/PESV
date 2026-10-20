import ExcelJS from 'exceljs';
import { aclarar } from './pdf.js';
import type { ContextoDocumento } from './formato.service.js';

export interface ColumnaExcel {
  titulo: string;
  ancho: number;
  /** Formato numérico de Excel, por ejemplo '0%' o '#,##0'. */
  formato?: string;
}
export type ValorExcel = string | number | boolean | Date | null | { valor: string | number | null; fondo?: string; negrita?: boolean };

export interface HojaExcel {
  nombre: string;
  columnas: ColumnaExcel[];
  filas: ValorExcel[][];
  horizontal?: boolean;
  /** Líneas de texto antes de la tabla (por ejemplo, el periodo o la metodología). */
  notas?: string[];
}

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFC9CED6' } },
  left: { style: 'thin', color: { argb: 'FFC9CED6' } },
  bottom: { style: 'thin', color: { argb: 'FFC9CED6' } },
  right: { style: 'thin', color: { argb: 'FFC9CED6' } },
};

/** Nombre de hoja válido para Excel (máximo 31 caracteres, sin símbolos reservados). */
const nombreHoja = (n: string) => n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

/**
 * Libro de Excel con el formato del sistema de gestión en cada hoja: logo, empresa, título,
 * código, versión y fecha arriba; tabla con filtros y paneles fijos; firmas al final; y el pie de
 * impresión «Página X de Y».
 */
export async function generarExcel(ctx: ContextoDocumento, hojas: HojaExcel[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Plataforma PESV';
  libro.company = ctx.organizacion.nombre;
  libro.title = `${ctx.codigo} ${ctx.titulo}`;
  const logo = ctx.logo ? libro.addImage({ buffer: ctx.logo.datos as unknown as ExcelJS.Buffer, extension: ctx.logo.mime === 'image/png' ? 'png' : 'jpeg' }) : null;

  for (const h of hojas) {
    const ws = libro.addWorksheet(nombreHoja(h.nombre), {
      pageSetup: { orientation: h.horizontal ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 } },
      headerFooter: { oddFooter: `&L&8${(ctx.pie ?? '').replace(/&/g, '&&')}&R&8Página &P de &N` },
    });
    const n = Math.max(h.columnas.length, 4);
    h.columnas.forEach((c, i) => (ws.getColumn(i + 1).width = c.ancho));
    for (let i = h.columnas.length; i < n; i++) ws.getColumn(i + 1).width = 14;

    // Encabezado: A1:A4 logo · B..(n-1) empresa y título · n código, versión, fecha.
    const ultima = n;
    const centroFin = ultima - 1;
    ws.mergeCells(1, 1, 4, 1);
    ws.mergeCells(1, 2, 2, centroFin);
    ws.mergeCells(3, 2, 4, centroFin);
    for (let r = 1; r <= 4; r++) ws.getRow(r).height = 18;
    const empresa = ws.getCell(1, 2);
    empresa.value = `${ctx.organizacion.nombre}\nNIT ${ctx.organizacion.nit}`;
    empresa.font = { bold: true, size: 11 };
    empresa.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const titulo = ws.getCell(3, 2);
    titulo.value = ctx.titulo.toUpperCase();
    titulo.font = { bold: true, size: 11, color: { argb: argb(ctx.color) } };
    titulo.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    (
      [
        ['Código', ctx.codigo],
        ['Versión', String(ctx.version)],
        ['Fecha', ctx.fechaVersion],
        ['Hoja', h.nombre],
      ] as const
    ).forEach(([k, v], i) => {
      const c = ws.getCell(i + 1, ultima);
      c.value = `${k}: ${v}`;
      c.font = { size: 9 };
      c.alignment = { vertical: 'middle' };
    });
    for (let r = 1; r <= 4; r++) for (let col = 1; col <= ultima; col++) ws.getCell(r, col).border = { ...borde, top: { style: 'thin', color: { argb: argb(ctx.color) } } };
    if (logo !== null) ws.addImage(logo, { tl: { col: 0.1, row: 0.15 }, ext: { width: Math.min(140, (h.columnas[0]?.ancho ?? 14) * 7), height: 66 }, editAs: 'oneCell' });
    else {
      const c = ws.getCell(1, 1);
      c.value = ctx.organizacion.nombre;
      c.font = { bold: true, color: { argb: argb(ctx.color) } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    let fila = 6;
    for (const nota of h.notas ?? []) {
      ws.mergeCells(fila, 1, fila, ultima);
      const c = ws.getCell(fila, 1);
      c.value = nota;
      c.font = { size: 9, color: { argb: 'FF5B6576' } };
      c.alignment = { wrapText: true };
      fila++;
    }
    if (h.notas?.length) fila++;

    const filaTitulos = fila;
    const cab = ws.getRow(filaTitulos);
    h.columnas.forEach((col, i) => {
      const c = cab.getCell(i + 1);
      c.value = col.titulo;
      c.font = { bold: true, size: 9, color: { argb: argb(ctx.color) } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(aclarar(ctx.color, 0.85)) } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = borde;
    });
    cab.height = 30;
    for (const valores of h.filas) {
      fila++;
      const r = ws.getRow(fila);
      valores.forEach((v, i) => {
        const c = r.getCell(i + 1);
        if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
          c.value = v.valor;
          if (v.fondo) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(v.fondo) } };
          if (v.negrita) c.font = { bold: true, size: 9 };
        } else c.value = v;
        if (!c.font?.bold) c.font = { size: 9 };
        c.alignment = { vertical: 'top', wrapText: true };
        c.border = borde;
        const formato = h.columnas[i]?.formato;
        if (formato) c.numFmt = formato;
      });
    }
    if (h.filas.length) ws.autoFilter = { from: { row: filaTitulos, column: 1 }, to: { row: fila, column: h.columnas.length } };
    ws.views = [{ state: 'frozen', ySplit: filaTitulos, xSplit: 0 }];

    // Firmas.
    fila += 2;
    const tercio = Math.max(1, Math.floor(ultima / 3));
    (
      [
        ['Elaboró', ctx.elaboro],
        ['Revisó', ctx.reviso],
        ['Aprobó', ctx.aprobo],
      ] as const
    ).forEach(([rol, f], i) => {
      const desde = 1 + i * tercio;
      const hasta = i === 2 ? ultima : desde + tercio - 1;
      if (hasta > desde) {
        ws.mergeCells(fila, desde, fila, hasta);
        ws.mergeCells(fila + 1, desde, fila + 1, hasta);
      }
      const c1 = ws.getCell(fila, desde);
      c1.value = rol;
      c1.font = { bold: true, size: 9, color: { argb: 'FF5B6576' } };
      const c2 = ws.getCell(fila + 1, desde);
      c2.value = [f.nombre, f.cargo].filter(Boolean).join(' · ');
      c2.font = { size: 9 };
    });
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}
