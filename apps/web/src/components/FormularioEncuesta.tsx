import { aplica, type Cuestionario, type Pregunta, type Respuestas } from '@pesv/shared';
import { useState, type FormEvent } from 'react';
import { mensajeError } from '../lib/api';
import { Boton, Campo } from './ui';

/**
 * Formulario de la encuesta de perfil. Lo usan el enlace público (en el celular) y el registro
 * desde la plataforma. Las preguntas que no aplican según las respuestas anteriores se ocultan.
 */
export function FormularioEncuesta({
  cuestionario,
  identificacion,
  organizacion,
  alEnviar,
  textoEnviar = 'Enviar encuesta',
}: {
  cuestionario: Cuestionario;
  /** 'pedir': nombre y cédula; 'anonima': no se piden; 'conductor': ya se sabe quién responde. */
  identificacion: 'pedir' | 'anonima' | 'conductor';
  organizacion: string;
  alEnviar: (datos: { documento?: string; nombre?: string; consentimiento: true; respuestas: Respuestas }) => Promise<unknown>;
  textoEnviar?: string;
}) {
  const [r, setR] = useState<Respuestas>({});
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const visibles = cuestionario.preguntas.filter((p) => aplica(p, r));
  const cambiar = (id: string, v: string | string[]) => {
    setR({ ...r, [id]: v });
    if (errores[id]) setErrores({ ...errores, [id]: '' });
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const faltan: Record<string, string> = {};
    for (const p of visibles) {
      const v = r[p.id];
      if (p.obligatoria && (v == null || v === '' || (Array.isArray(v) && v.length === 0))) faltan[p.id] = 'Responde esta pregunta';
    }
    if (identificacion === 'pedir') {
      if (nombre.trim().length < 3) faltan._nombre = 'Escribe tu nombre completo';
      if (!/^\d{5,12}$/.test(documento)) faltan._documento = 'Escribe tu cédula sin puntos';
    }
    if (!consentimiento) faltan._consentimiento = 'Debes autorizar el tratamiento de los datos';
    setErrores(faltan);
    if (Object.keys(faltan).length) {
      setError('Hay preguntas sin responder. Revisa las marcadas en rojo.');
      document.getElementById(`pregunta-${Object.keys(faltan)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Solo se envían las respuestas de las preguntas que aplican.
    const limpias: Respuestas = {};
    for (const p of visibles) if (r[p.id] != null && r[p.id] !== '') limpias[p.id] = r[p.id]!;
    setEnviando(true);
    setError(null);
    try {
      await alEnviar({ ...(identificacion === 'pedir' ? { nombre: nombre.trim(), documento } : {}), consentimiento: true, respuestas: limpias });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-5">
      {identificacion === 'pedir' && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-base font-bold text-noche">Tus datos</legend>
          <div id="pregunta-_nombre"><Campo id="en-nombre" etiqueta="Nombre completo" autoComplete="name" value={nombre} error={errores._nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div id="pregunta-_documento"><Campo id="en-documento" etiqueta="Cédula" inputMode="numeric" autoComplete="off" value={documento} error={errores._documento} onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} /></div>
        </fieldset>
      )}
      {visibles.map((p, i) => {
        const titulo = i === 0 || visibles[i - 1]!.seccion !== p.seccion ? p.seccion : null;
        return (
          <div key={p.id} className="flex flex-col gap-5">
            {titulo && <h2 className="border-t border-linea pt-5 text-base font-bold text-noche first:border-0 first:pt-0">{titulo}</h2>}
            <PreguntaEncuesta p={p} valor={r[p.id]} error={errores[p.id]} alCambiar={(v) => cambiar(p.id, v)} />
          </div>
        );
      })}
      <div id="pregunta-_consentimiento" className="rounded-xl bg-papel p-4 text-sm">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-noche" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} />
          <span>
            Autorizo a <strong>{organizacion}</strong> a tratar mis datos para el diagnóstico y la gestión del Plan Estratégico de Seguridad Vial, conforme a la Ley 1581 de 2012. Conozco que puedo consultar, actualizar o pedir que se supriman mis datos.
          </span>
        </label>
        {errores._consentimiento && <p className="mt-2 text-[13px] font-medium text-alerta">{errores._consentimiento}</p>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-alerta/30 bg-alerta-suave px-4 py-3 text-sm text-alerta">{error}</p>}
      <Boton type="submit" cargando={enviando} className="w-full sm:w-auto sm:self-start">{textoEnviar}</Boton>
    </form>
  );
}

function PreguntaEncuesta({ p, valor, error, alCambiar }: { p: Pregunta; valor: string | string[] | undefined; error?: string; alCambiar: (v: string | string[]) => void }) {
  const idAyuda = `${p.id}-ayuda`;
  if (p.tipo === 'texto') {
    return (
      <div id={`pregunta-${p.id}`} className="flex flex-col gap-1.5">
        <label htmlFor={`pr-${p.id}`} className="text-[15px] font-semibold text-tinta">{p.texto}{!p.obligatoria && <span className="font-normal text-gris"> (opcional)</span>}</label>
        <textarea id={`pr-${p.id}`} maxLength={500} className="min-h-20 rounded-lg border border-[#d5dae1] bg-white px-3.5 py-3 text-[15px]" value={(valor as string) ?? ''} onChange={(e) => alCambiar(e.target.value)} />
        {error && <p className="text-[13px] font-medium text-alerta">{error}</p>}
      </div>
    );
  }
  const multiple = p.tipo === 'multiple';
  const actual = multiple ? ((valor as string[]) ?? []) : (valor as string | undefined);
  return (
    <fieldset id={`pregunta-${p.id}`} aria-describedby={p.ayuda ? idAyuda : undefined} aria-invalid={!!error}>
      <legend className="mb-2 text-[15px] font-semibold text-tinta">{p.texto}</legend>
      {p.ayuda && <p id={idAyuda} className="-mt-1 mb-2 text-[13px] text-gris">{p.ayuda}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {p.opciones!.map((o) => {
          const marcada = multiple ? (actual as string[]).includes(o.id) : actual === o.id;
          return (
            <label
              key={o.id}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3.5 py-2.5 text-[15px] ring-1 ${marcada ? 'bg-noche/5 font-semibold ring-2 ring-noche' : 'bg-white ring-[#d5dae1]'} ${error ? 'ring-alerta' : ''}`}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={p.id}
                className="size-5 shrink-0 accent-noche"
                checked={marcada}
                onChange={(e) => {
                  if (!multiple) return alCambiar(o.id);
                  const lista = actual as string[];
                  alCambiar(e.target.checked ? [...lista, o.id] : lista.filter((x) => x !== o.id));
                }}
              />
              {o.nombre}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[13px] font-medium text-alerta">{error}</p>}
    </fieldset>
  );
}
