import { useId, useRef, useState, type ReactNode } from 'react';

/**
 * Gráficas propias en SVG (sin dependencias). Siguen unas reglas fijas: barras de máximo 24 px
 * con punta redondeada, líneas de 2 px, rejilla tenue, leyenda cuando hay más de una serie,
 * información al pasar el puntero o al enfocar con el teclado, y una vista de tabla con los
 * mismos datos para que nada dependa solo del color o del puntero.
 */

/** Colores categóricos en orden fijo (validados para daltonismo en pares adyacentes). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
const REJILLA = '#e2e5ea';
const TEXTO_SECUNDARIO = '#5b6576';
const TEXTO = '#1a2233';

export interface Serie {
  nombre: string;
  valores: (number | null)[];
  /** Si no se indica, toma el color de su posición. */
  color?: string;
}

type Formato = (v: number) => string;
const formatoPorDefecto: Formato = (v) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(v);

/** Marcas de eje "redondas" (1, 2, 2,5, 5 × 10ⁿ). */
function marcas(maximo: number, minimo = 0, cantidad = 4) {
  const rango = Math.max(maximo - minimo, 1e-9);
  const paso0 = rango / cantidad;
  const potencia = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= paso0) ?? 10 * potencia;
  const inicio = Math.floor(minimo / paso) * paso;
  const fin = Math.ceil(maximo / paso) * paso;
  const lista: number[] = [];
  for (let v = inicio; v <= fin + paso / 2; v += paso) lista.push(Number(v.toFixed(10)));
  return lista;
}

function Leyenda({ series, forma }: { series: { nombre: string; color: string }[]; forma: 'barra' | 'linea' }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gris">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          {forma === 'barra' ? <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> : <span className="h-0.5 w-3.5 rounded" style={{ background: s.color }} />}
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

function Globo({ x, y, ancho, titulo, filas }: { x: number; y: number; ancho: number; titulo: string; filas: { nombre: string; valor: string; color: string; forma: 'barra' | 'linea' | 'meta' }[] }) {
  // Se posiciona en porcentaje del ancho del SVG para que funcione con viewBox responsivo.
  const izquierda = x / ancho > 0.6;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg bg-white px-3 py-2 text-[13px] shadow-lg ring-1 ring-linea"
      style={{ left: `${(x / ancho) * 100}%`, top: y, transform: `translate(${izquierda ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}
    >
      <p className="mb-1 font-semibold text-tinta">{titulo}</p>
      {filas.map((f) => (
        <p key={f.nombre} className="flex items-center gap-2 whitespace-nowrap">
          <span className="h-0.5 w-3 rounded" style={{ background: f.color, opacity: f.forma === 'meta' ? 0.9 : 1 }} />
          <strong className="text-tinta">{f.valor}</strong>
          <span className="text-gris">{f.nombre}</span>
        </p>
      ))}
    </div>
  );
}

function TablaDatos({ categorias, series, formato, meta }: { categorias: string[]; series: { nombre: string; valores: (number | null)[] }[]; formato: Formato; meta?: { nombre: string; valores: (number | null)[] } }) {
  const columnas = meta ? [...series, meta] : series;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="text-gris">
            <th className="py-1.5 pr-3 font-semibold">Periodo</th>
            {columnas.map((s) => <th key={s.nombre} className="py-1.5 pr-3 text-right font-semibold">{s.nombre}</th>)}
          </tr>
        </thead>
        <tbody>
          {categorias.map((c, i) => (
            <tr key={c} className="border-t border-linea">
              <td className="py-1.5 pr-3">{c}</td>
              {columnas.map((s) => <td key={s.nombre} className="py-1.5 pr-3 text-right tabular-nums">{s.valores[i] == null ? '—' : formato(s.valores[i]!)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Marco común: título, leyenda, conmutador gráfica/tabla. */
function Marco({ titulo, descripcion, leyenda, tabla, children }: { titulo: string; descripcion?: ReactNode; leyenda: ReactNode; tabla: ReactNode; children: ReactNode }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-noche">{titulo}</p>
          {descripcion && <p className="text-[13px] text-gris">{descripcion}</p>}
        </div>
        <button type="button" className="text-[13px] font-semibold text-[#1d4e89] underline-offset-2 hover:underline" aria-pressed={verTabla} onClick={() => setVerTabla(!verTabla)}>
          {verTabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </figcaption>
      {leyenda}
      {verTabla ? tabla : children}
    </figure>
  );
}

const ALTO = 220;
const M = { arriba: 12, derecha: 12, abajo: 28, izquierda: 40 };

/** Columnas agrupadas por categoría (por ejemplo, programado vs. ejecutado por mes). */
export function GraficaBarras({
  titulo,
  descripcion,
  categorias,
  series,
  formato = formatoPorDefecto,
  ancho = 640,
}: {
  titulo: string;
  descripcion?: ReactNode;
  categorias: string[];
  series: Serie[];
  formato?: Formato;
  ancho?: number;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const conColor = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  const maximo = Math.max(1, ...conColor.flatMap((s) => s.valores.map((v) => v ?? 0)));
  const ticks = marcas(maximo);
  const tope = ticks[ticks.length - 1]!;
  const interior = { ancho: ancho - M.izquierda - M.derecha, alto: ALTO - M.arriba - M.abajo };
  const banda = interior.ancho / Math.max(categorias.length, 1);
  const grosor = Math.min(24, (banda * 0.7 - 2 * (conColor.length - 1)) / conColor.length);
  const grupo = grosor * conColor.length + 2 * (conColor.length - 1);
  const y = (v: number) => M.arriba + interior.alto - (v / tope) * interior.alto;
  const idTitulo = useId();

  return (
    <Marco
      titulo={titulo}
      descripcion={descripcion}
      leyenda={<Leyenda series={conColor} forma="barra" />}
      tabla={<TablaDatos categorias={categorias} series={conColor} formato={formato} />}
    >
      <div className="relative">
        <svg viewBox={`0 0 ${ancho} ${ALTO}`} className="h-auto w-full" role="img" aria-labelledby={idTitulo} onPointerLeave={() => setActiva(null)}>
          <title id={idTitulo}>{titulo}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.izquierda} x2={ancho - M.derecha} y1={y(t)} y2={y(t)} stroke={REJILLA} strokeWidth={1} />
              <text x={M.izquierda - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXTO_SECUNDARIO}>{formato(t)}</text>
            </g>
          ))}
          {categorias.map((c, i) => {
            const x0 = M.izquierda + banda * i + (banda - grupo) / 2;
            return (
              <g
                key={c}
                tabIndex={0}
                role="listitem"
                aria-label={`${c}: ${conColor.map((s) => `${s.nombre} ${s.valores[i] == null ? 'sin dato' : formato(s.valores[i]!)}`).join(', ')}`}
                onPointerEnter={() => setActiva(i)}
                onFocus={() => setActiva(i)}
                onBlur={() => setActiva(null)}
                className="outline-none"
              >
                <rect x={M.izquierda + banda * i} y={M.arriba} width={banda} height={interior.alto} fill={activa === i ? '#f5f6f8' : 'transparent'} />
                {conColor.map((s, k) => {
                  const v = s.valores[i];
                  if (v == null || v <= 0) return null;
                  const alto = Math.max(1, (v / tope) * interior.alto);
                  const x = x0 + k * (grosor + 2);
                  const r = Math.min(4, grosor / 2, alto);
                  const base = M.arriba + interior.alto;
                  // Punta redondeada de 4 px, base recta.
                  const d = `M${x},${base} V${base - alto + r} Q${x},${base - alto} ${x + r},${base - alto} H${x + grosor - r} Q${x + grosor},${base - alto} ${x + grosor},${base - alto + r} V${base} Z`;
                  return <path key={s.nombre} d={d} fill={s.color} />;
                })}
                <text x={M.izquierda + banda * i + banda / 2} y={ALTO - 8} textAnchor="middle" fontSize={11} fill={activa === i ? TEXTO : TEXTO_SECUNDARIO} fontWeight={activa === i ? 600 : 400}>{c}</text>
              </g>
            );
          })}
          <line x1={M.izquierda} x2={ancho - M.derecha} y1={M.arriba + interior.alto} y2={M.arriba + interior.alto} stroke="#c5cbd3" strokeWidth={1} />
        </svg>
        {activa !== null && (
          <Globo
            x={M.izquierda + banda * activa + banda / 2}
            y={(M.arriba + interior.alto / 2) * 1}
            ancho={ancho}
            titulo={categorias[activa]!}
            filas={conColor.map((s) => ({ nombre: s.nombre, valor: s.valores[activa] == null ? '—' : formato(s.valores[activa]!), color: s.color, forma: 'barra' }))}
          />
        )}
      </div>
    </Marco>
  );
}

/** Líneas por periodo con una meta opcional (línea de referencia en el mismo eje). */
export function GraficaLinea({
  titulo,
  descripcion,
  categorias,
  series,
  meta,
  formato = formatoPorDefecto,
  ancho = 640,
  desdeCero = true,
}: {
  titulo: string;
  descripcion?: ReactNode;
  categorias: string[];
  series: Serie[];
  meta?: { nombre: string; valores: (number | null)[] };
  formato?: Formato;
  ancho?: number;
  desdeCero?: boolean;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const conColor = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  const todos = [...conColor.flatMap((s) => s.valores), ...(meta?.valores ?? [])].filter((v): v is number => v != null);
  const max = todos.length ? Math.max(...todos) : 1;
  const min = todos.length ? (desdeCero ? Math.min(0, ...todos) : Math.min(...todos)) : 0;
  const ticks = marcas(max === min ? max + 1 : max, min);
  const piso = ticks[0]!;
  const tope = ticks[ticks.length - 1]!;
  const interior = { ancho: ancho - M.izquierda - M.derecha, alto: ALTO - M.arriba - M.abajo };
  const paso = categorias.length > 1 ? interior.ancho / (categorias.length - 1) : 0;
  const x = (i: number) => (categorias.length > 1 ? M.izquierda + paso * i : M.izquierda + interior.ancho / 2);
  const y = (v: number) => M.arriba + interior.alto - ((v - piso) / (tope - piso || 1)) * interior.alto;
  const trazo = (valores: (number | null)[]) => {
    let d = '';
    let abierto = false;
    valores.forEach((v, i) => {
      if (v == null) { abierto = false; return; }
      d += `${abierto ? 'L' : 'M'}${x(i)},${y(v)} `;
      abierto = true;
    });
    return d.trim();
  };
  const idTitulo = useId();

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const caja = svg.current?.getBoundingClientRect();
    if (!caja || categorias.length === 0) return;
    const px = ((e.clientX - caja.left) / caja.width) * ancho;
    const i = categorias.length > 1 ? Math.round((px - M.izquierda) / paso) : 0;
    setActiva(Math.max(0, Math.min(categorias.length - 1, i)));
  };

  const leyenda = [...conColor.map((s) => ({ nombre: s.nombre, color: s.color })), ...(meta ? [{ nombre: meta.nombre, color: TEXTO_SECUNDARIO }] : [])];
  return (
    <Marco
      titulo={titulo}
      descripcion={descripcion}
      leyenda={<Leyenda series={leyenda} forma="linea" />}
      tabla={<TablaDatos categorias={categorias} series={conColor} meta={meta} formato={formato} />}
    >
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${ancho} ${ALTO}`}
          className="h-auto w-full touch-pan-y"
          role="img"
          aria-labelledby={idTitulo}
          tabIndex={0}
          onPointerMove={alMover}
          onPointerLeave={() => setActiva(null)}
          onFocus={() => setActiva(categorias.length - 1)}
          onBlur={() => setActiva(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setActiva((a) => Math.max(0, (a ?? 0) - 1));
            if (e.key === 'ArrowRight') setActiva((a) => Math.min(categorias.length - 1, (a ?? -1) + 1));
          }}
        >
          <title id={idTitulo}>{titulo}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.izquierda} x2={ancho - M.derecha} y1={y(t)} y2={y(t)} stroke={REJILLA} strokeWidth={1} />
              <text x={M.izquierda - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXTO_SECUNDARIO}>{formato(t)}</text>
            </g>
          ))}
          {categorias.map((c, i) => (
            <text key={c} x={x(i)} y={ALTO - 8} textAnchor="middle" fontSize={11} fill={activa === i ? TEXTO : TEXTO_SECUNDARIO} fontWeight={activa === i ? 600 : 400}>
              {categorias.length > 8 && i % 2 === 1 && activa !== i ? '' : c}
            </text>
          ))}
          {meta && <path d={trazo(meta.valores)} fill="none" stroke={TEXTO_SECUNDARIO} strokeWidth={1.5} strokeDasharray="5 4" />}
          {activa !== null && <line x1={x(activa)} x2={x(activa)} y1={M.arriba} y2={M.arriba + interior.alto} stroke="#c5cbd3" strokeWidth={1} />}
          {conColor.map((s) => (
            <g key={s.nombre}>
              <path d={trazo(s.valores)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.valores.map((v, i) =>
                v == null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={activa === i ? 5 : 4} fill={s.color} stroke="#fff" strokeWidth={2} />
                ),
              )}
            </g>
          ))}
        </svg>
        {activa !== null && (
          <Globo
            x={x(activa)}
            y={M.arriba + interior.alto / 2}
            ancho={ancho}
            titulo={categorias[activa]!}
            filas={[
              ...conColor.map((s) => ({ nombre: s.nombre, valor: s.valores[activa] == null ? 'Sin medición' : formato(s.valores[activa]!), color: s.color, forma: 'linea' as const })),
              ...(meta ? [{ nombre: meta.nombre, valor: meta.valores[activa] == null ? '—' : formato(meta.valores[activa]!), color: TEXTO_SECUNDARIO, forma: 'meta' as const }] : []),
            ]}
          />
        )}
      </div>
    </Marco>
  );
}

/** Barra de avance con texto; el color indica el estado frente a la meta. */
export function Avance({ etiqueta, valor, meta, detalle }: { etiqueta: string; valor: number | null; meta?: number; detalle?: ReactNode }) {
  const pct = valor == null ? 0 : Math.max(0, Math.min(100, valor));
  const color = valor == null ? '#c5cbd3' : meta == null ? '#2a78d6' : valor >= meta ? '#1f7a4d' : valor >= meta * 0.8 ? '#b58100' : '#b42318';
  const estado = valor == null ? 'Sin datos' : meta == null ? null : valor >= meta ? 'Cumple' : valor >= meta * 0.8 ? 'En riesgo' : 'No cumple';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-tinta">{etiqueta}</span>
        <span className="tabular-nums text-tinta">
          <strong>{valor == null ? '—' : `${Math.round(valor)} %`}</strong>
          {estado && <span className="ml-1.5 text-[12px] text-gris">{estado}</span>}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[#e8edf3]" role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor ?? undefined}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
        {meta != null && <div className="absolute -top-1 h-4 w-0.5 rounded bg-tinta/70" style={{ left: `${Math.min(100, meta)}%` }} title={`Meta ${meta} %`} />}
      </div>
      {detalle && <p className="text-[12px] text-gris">{detalle}</p>}
    </div>
  );
}
