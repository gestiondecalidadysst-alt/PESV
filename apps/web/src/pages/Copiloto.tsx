import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Aviso, Boton, Cargando, Encabezado, Insignia, Pagina, Tarjeta, Vacio } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

interface Mensaje {
  id: string;
  rol: 'user' | 'assistant';
  texto: string;
  fuentes: { id: string; titulo: string }[];
}

/** Párrafos y viñetas simples, sin interpretar HTML. */
function TextoIa({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-2 leading-relaxed">
      {texto.split(/\n{2,}/).map((bloque, i) => {
        const lineas = bloque.split('\n');
        if (lineas.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l))) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {lineas.map((l, j) => <li key={j}>{l.replace(/^\s*([-*•]|\d+\.)\s/, '').replace(/\*\*/g, '')}</li>)}
            </ul>
          );
        }
        return <p key={i}>{bloque.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')}</p>;
      })}
    </div>
  );
}

export function Copiloto() {
  const { puede } = useSesion();
  const estado = useConsulta<{ activa: boolean; agentes: string[] }>(['ia-estado'], '/org/ia/estado');
  const historial = useConsulta<Mensaje[]>(['copiloto'], '/org/ia/copiloto', { enabled: !!estado.data?.agentes.includes('copiloto') });
  const [pregunta, setPregunta] = useState('');
  const fin = useRef<HTMLDivElement>(null);
  const preguntar = useAccion((p: string) => api.post('/org/ia/copiloto', { pregunta: p }), { alTerminar: () => setPregunta('') });
  const diagnostico = useAccion(() => api.post<{ diagnostico: string; fuentes: Mensaje['fuentes'] }>('/org/ia/diagnostico'));

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' });
  }, [historial.data?.length]);

  if (estado.isPending) return <Cargando />;
  if (!estado.data?.activa || !estado.data.agentes.includes('copiloto')) {
    return (
      <Pagina ancho="max-w-3xl">
        <Encabezado titulo="Copiloto IA" />
        <Vacio
          titulo="El copiloto aún no está activo"
          accion={puede('configurar') && <Link to="/configuracion/ia" className="text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Configurar el proveedor de IA</Link>}
        >
          La organización debe elegir su proveedor de IA y activar el copiloto. Mientras tanto, la plataforma funciona completa en modo manual.
        </Vacio>
      </Pagina>
    );
  }

  return (
    <Pagina ancho="max-w-3xl">
      <Encabezado
        titulo="Copiloto IA"
        descripcion="Pregunta sobre el PESV de tu organización. Las respuestas citan el paso o el dato del que salen y son orientación: verifícalas antes de actuar."
        acciones={estado.data.agentes.includes('diagnostico') && (
          <Boton variante="secundario" cargando={diagnostico.isPending} onClick={() => diagnostico.mutate(undefined)}>Diagnóstico del avance</Boton>
        )}
      />
      <Aviso error={diagnostico.error} />
      {diagnostico.data && (
        <Tarjeta>
          <p className="font-bold text-noche">Diagnóstico del avance</p>
          <TextoIa texto={diagnostico.data.diagnostico} />
        </Tarjeta>
      )}
      <Tarjeta>
        <div className="flex max-h-[60vh] min-h-48 flex-col gap-4 overflow-y-auto" aria-live="polite">
          {historial.isPending ? (
            <Cargando />
          ) : historial.data?.length ? (
            historial.data.map((m) => (
              <div key={m.id} className={`flex max-w-[90%] flex-col gap-2 rounded-2xl px-4 py-3 text-[15px] ${m.rol === 'user' ? 'self-end bg-noche text-white' : 'self-start bg-papel'}`}>
                {m.rol === 'user' ? <p>{m.texto}</p> : <TextoIa texto={m.texto} />}
                {m.fuentes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.fuentes.map((f) => (
                      <span key={f.id} title={f.titulo}><Insignia tono="info">{f.id}</Insignia></span>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-gris">Prueba con: «¿Qué me falta para el paso 13?» o «¿Qué documentos vencen este mes?»</p>
          )}
          {preguntar.isPending && <p className="self-start text-gris">Pensando…</p>}
          <div ref={fin} />
        </div>
        <form
          className="flex flex-col gap-2 border-t border-linea pt-4 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (pregunta.trim().length >= 3) preguntar.mutate(pregunta.trim());
          }}
        >
          <label htmlFor="pregunta" className="sr-only">Tu pregunta</label>
          <input
            id="pregunta"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="Escribe tu pregunta"
            className="h-12 min-w-0 flex-1 rounded-lg border border-[#d5dae1] px-3.5 text-[15px]"
          />
          <Boton type="submit" className="h-12" cargando={preguntar.isPending} disabled={pregunta.trim().length < 3}>Preguntar</Boton>
        </form>
        <Aviso error={preguntar.error} />
      </Tarjeta>
    </Pagina>
  );
}
