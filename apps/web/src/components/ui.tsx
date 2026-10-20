import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { mensajeError } from '../lib/api';

const unir = (...clases: (string | false | null | undefined)[]) => clases.filter(Boolean).join(' ');

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-noche">{titulo}</h1>
        {descripcion && <p className="text-[15px] leading-relaxed text-gris">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}

export function Pagina({ children, ancho = 'max-w-6xl' }: { children: ReactNode; ancho?: string }) {
  return <div className={unir('mx-auto flex flex-col gap-7', ancho)}>{children}</div>;
}

export function Tarjeta({ children, className, oscura }: { children: ReactNode; className?: string; oscura?: boolean }) {
  return (
    <section className={unir('flex flex-col gap-4 rounded-2xl p-6', oscura ? 'bg-noche text-white' : 'bg-white ring-1 ring-linea', className)}>
      {children}
    </section>
  );
}

export function Subtitulo({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-bold text-noche">{children}</h2>
      {acciones}
    </div>
  );
}

type Variante = 'principal' | 'secundario' | 'peligro' | 'texto';

export const Boton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }>(
  function Boton({ variante = 'principal', cargando, className, children, disabled, ...props }, ref) {
    const estilos: Record<Variante, string> = {
      principal: 'bg-senal text-noche font-bold',
      secundario: 'bg-white text-tinta font-semibold ring-1 ring-[#d5dae1]',
      peligro: 'bg-white text-alerta font-semibold ring-1 ring-alerta/40',
      texto: 'text-[#1d4e89] font-semibold underline-offset-4 hover:underline px-1',
    };
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || cargando}
        className={unir(
          'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
          estilos[variante],
          variante === 'texto' && 'min-h-0',
          className,
        )}
        {...props}
      >
        {cargando ? 'Procesando…' : children}
      </button>
    );
  },
);

export const claseCampo =
  'h-12 w-full rounded-lg border border-[#d5dae1] bg-white px-3.5 text-[15px] text-tinta placeholder:text-gris/70 aria-[invalid=true]:border-alerta disabled:bg-papel';

interface PropsCampo {
  etiqueta: string;
  id: string;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
}

function Envoltura({ etiqueta, id, error, ayuda, className, children }: PropsCampo & { children: ReactNode }) {
  return (
    <div className={unir('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && <p id={`${id}-ayuda`} className="text-[13px] text-gris">{ayuda}</p>}
      {error && <p className="text-[13px] font-medium text-alerta">{error}</p>}
    </div>
  );
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo & InputHTMLAttributes<HTMLInputElement>>(function Campo(
  { etiqueta, id, error, ayuda, className, ...props },
  ref,
) {
  return (
    <Envoltura etiqueta={etiqueta} id={id} error={error} ayuda={ayuda} className={className}>
      <input ref={ref} id={id} className={claseCampo} aria-invalid={!!error} aria-describedby={ayuda ? `${id}-ayuda` : undefined} {...props} />
    </Envoltura>
  );
});

export const Selector = forwardRef<HTMLSelectElement, PropsCampo & SelectHTMLAttributes<HTMLSelectElement>>(function Selector(
  { etiqueta, id, error, ayuda, className, children, ...props },
  ref,
) {
  return (
    <Envoltura etiqueta={etiqueta} id={id} error={error} ayuda={ayuda} className={className}>
      <select ref={ref} id={id} className={claseCampo} aria-invalid={!!error} {...props}>
        {children}
      </select>
    </Envoltura>
  );
});

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>>(function AreaTexto(
  { etiqueta, id, error, ayuda, className, ...props },
  ref,
) {
  return (
    <Envoltura etiqueta={etiqueta} id={id} error={error} ayuda={ayuda} className={className}>
      <textarea
        ref={ref}
        id={id}
        className={unir(claseCampo, 'h-auto min-h-24 py-3 leading-relaxed')}
        aria-invalid={!!error}
        {...props}
      />
    </Envoltura>
  );
});

export function Casilla({ etiqueta, descripcion, ...props }: { etiqueta: string; descripcion?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-noche" {...props} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-tinta">{etiqueta}</span>
        {descripcion && <span className="text-[13px] text-gris">{descripcion}</span>}
      </span>
    </label>
  );
}

type Tono = 'neutro' | 'exito' | 'aviso' | 'peligro' | 'oscuro' | 'info';
const TONOS: Record<Tono, string> = {
  neutro: 'bg-papel text-gris ring-1 ring-linea',
  exito: 'bg-via-suave text-via',
  aviso: 'bg-senal-suave text-senal-tinta',
  peligro: 'bg-alerta-suave text-alerta',
  oscuro: 'bg-noche text-white',
  info: 'bg-[#eef2f8] text-[#1d4e89]',
};

export function Insignia({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return <span className={unir('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold', TONOS[tono])}>{children}</span>;
}

export function Aviso({ error, children, tono = 'peligro' }: { error?: unknown; children?: ReactNode; tono?: 'peligro' | 'exito' | 'info' }) {
  if (!error && !children) return null;
  const estilos = {
    peligro: 'border-alerta/30 bg-alerta-suave text-alerta',
    exito: 'border-via/30 bg-via-suave text-via',
    info: 'border-[#1d4e89]/20 bg-[#eef2f8] text-[#1d4e89]',
  };
  return (
    <div role={tono === 'peligro' ? 'alert' : 'status'} className={unir('rounded-lg border px-4 py-3 text-sm', estilos[tono])}>
      {children ?? mensajeError(error)}
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-linea bg-papel/60 px-5 py-6">
      <p className="font-bold text-noche">{titulo}</p>
      {children && <p className="max-w-xl text-sm text-gris">{children}</p>}
      {accion}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="text-gris" aria-live="polite">{texto}</p>;
}

export function Tabla({ children, minimo = '44rem' }: { children: ReactNode; minimo?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-linea">
      <table className="w-full border-collapse bg-white text-left text-sm" style={{ minWidth: minimo }}>
        {children}
      </table>
    </div>
  );
}

export const th = 'px-4 py-3 text-[13px] font-semibold text-gris';
export const td = 'border-t border-linea px-4 py-3 align-top';

export function Pestanas<T extends string>({ opciones, valor, alCambiar }: { opciones: { id: T; nombre: string }[]; valor: T; alCambiar: (v: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-linea self-start">
      {opciones.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={valor === o.id}
          onClick={() => alCambiar(o.id)}
          className="min-h-10 rounded-lg px-4 text-sm font-semibold text-gris aria-selected:bg-noche aria-selected:text-white"
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

export function Cifra({ etiqueta, valor, detalle, barra }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; barra?: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-6 ring-1 ring-linea">
      <p className="text-sm font-semibold text-gris">{etiqueta}</p>
      <p className="text-[36px] font-extrabold leading-none text-noche">{valor}</p>
      {barra !== undefined && (
        <div className="h-2 rounded-full bg-papel" role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={100} aria-valuenow={barra}>
          <div className="h-2 rounded-full bg-via" style={{ width: `${Math.min(100, Math.max(0, barra))}%` }} />
        </div>
      )}
      {detalle && <p className="text-[13px] text-gris">{detalle}</p>}
    </div>
  );
}

export const fecha = (valor: string | Date | null | undefined) =>
  valor ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(typeof valor === 'string' && valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor)) : '—';

export const fechaHora = (valor: string | Date | null | undefined) =>
  valor ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor)) : '—';

export const TONO_DOCUMENTO = { vencido: 'peligro', por_vencer: 'aviso', vigente: 'exito', sin_dato: 'neutro' } as const;
export const TEXTO_DOCUMENTO = { vencido: 'Vencido', por_vencer: 'Por vencer', vigente: 'Vigente', sin_dato: 'Sin dato' } as const;
