import { FASE_LABEL, FASES, PASOS_PESV, type EstadoPaso } from '@pesv/shared';
import { Link } from 'react-router';

const ESTILO: Record<EstadoPaso, { caja: string; texto: string; etiqueta: string }> = {
  pendiente: { caja: 'bg-white border-noche/25', texto: 'text-noche', etiqueta: 'Pendiente' },
  en_curso: {
    caja: 'bg-senal-suave border-senal',
    texto: 'text-senal-tinta',
    etiqueta: 'En curso',
  },
  hecho: { caja: 'bg-via-suave border-via/40', texto: 'text-via', etiqueta: 'Hecho' },
  no_aplica: {
    caja: 'bg-papel border-dashed border-linea',
    texto: 'text-gris',
    etiqueta: 'No aplica',
  },
};

interface Props {
  /** Estado por número de paso. Los pasos sin estado se muestran como "no aplica". */
  estados: Partial<Record<number, EstadoPaso>>;
  /** Etiqueta del estado "pendiente" (en el asistente, un paso aplicable aún no tiene avance). */
  etiquetaPendiente?: string;
  /** Pinta los pasos pendientes en azul noche (en el asistente, para que los que aplican salten a la vista). */
  resaltarPendientes?: boolean;
  /** Si se indica, los pasos que aplican enlazan a su detalle. */
  enlace?: (numero: number) => string;
}

/** Los 24 pasos agrupados por fase PHVA. Es el elemento visual central de la plataforma. */
export function CuadriculaPasos({ estados, etiquetaPendiente, resaltarPendientes, enlace }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {FASES.map((fase) => {
        const pasos = PASOS_PESV.filter((p) => p.fase === fase);
        return (
          <section
            key={fase}
            aria-label={`Fase ${FASE_LABEL[fase]}`}
            className="flex flex-col gap-2"
          >
            <h3 className="text-[13px] font-bold text-gris">{FASE_LABEL[fase]}</h3>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {pasos.map((p) => {
                const estado = estados[p.numero] ?? 'no_aplica';
                const e =
                  estado === 'pendiente' && resaltarPendientes
                    ? { ...ESTILO.pendiente, caja: 'bg-noche border-noche', texto: 'text-white' }
                    : ESTILO[estado];
                const etiqueta =
                  estado === 'pendiente' && etiquetaPendiente ? etiquetaPendiente : e.etiqueta;
                const clases = `flex min-h-[4.5rem] flex-col justify-between rounded-lg border px-2.5 py-2 transition-colors duration-300 ${e.caja} ${e.texto}`;
                const contenido = (
                  <>
                    <span className="text-xl font-extrabold leading-none">{p.numero}</span>
                    <span className="text-[11px] font-semibold leading-tight">{etiqueta}</span>
                    <span className="sr-only">{p.nombre}</span>
                  </>
                );
                return (
                  <li key={p.numero} title={`${p.numero}. ${p.nombre}`} className="flex">
                    {enlace && estado !== 'no_aplica' ? (
                      <Link to={enlace(p.numero)} className={`${clases} w-full hover:border-noche`}>
                        {contenido}
                      </Link>
                    ) : (
                      <div className={`${clases} w-full`}>{contenido}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
