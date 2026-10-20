import { CORRESPONDENCIA_PESV_ISO, CLAUSULAS_ISO_39001, FASE_LABEL, NIVEL_LABEL, PASOS_PESV } from '@pesv/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  AreaTexto,
  Aviso,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Insignia,
  Pagina,
  Subtitulo,
  Tarjeta,
  Vacio,
  fechaHora,
} from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import type { EstadoDePaso, Evidencia } from '../lib/tipos';
import { TEXTO_ESTADO, TONO_ESTADO } from './Pasos';

const titulosIso = new Map(CLAUSULAS_ISO_39001.map((c) => [c.codigo, c.titulo]));
const TONO_EVIDENCIA = { borrador: 'aviso', aprobada: 'exito', rechazada: 'peligro' } as const;
const TEXTO_EVIDENCIA = { borrador: 'En revisión', aprobada: 'Aprobada', rechazada: 'Rechazada' } as const;

export function PasoDetalle() {
  const numero = Number(useParams().numero);
  const definicion = PASOS_PESV.find((p) => p.numero === numero);
  const { puede } = useSesion();
  const pasos = useConsulta<EstadoDePaso[]>(['pasos'], '/org/pasos');
  const evidencias = useConsulta<Evidencia[]>(['evidencias', numero], `/org/evidencias?paso=${numero}`);
  const ia = useConsulta<{ activa: boolean; agentes: string[] }>(['ia-estado'], '/org/ia/estado');
  const cambiarEstado = useAccion((estado: string) => api.patch(`/org/pasos/${numero}`, { estado }));

  if (!definicion) return <Aviso>Ese paso no existe.</Aviso>;
  if (pasos.isPending) return <Cargando />;
  const paso = pasos.data?.find((p) => p.numero === numero);
  if (!paso) return <Aviso error={pasos.error} />;
  const aplica = paso.estado !== 'no_aplica';

  return (
    <Pagina ancho="max-w-5xl">
      <Link to="/pasos" className="self-start text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Los 24 pasos</Link>
      <Encabezado
        titulo={`${numero}. ${definicion.nombre}`}
        descripcion={`Fase ${FASE_LABEL[definicion.fase]} · aplica en ${definicion.niveles.length === 3 ? 'todos los niveles' : definicion.niveles.map((n) => NIVEL_LABEL[n].toLowerCase()).join(' y ')}`}
        acciones={<Insignia tono={TONO_ESTADO[paso.estado]}>{TEXTO_ESTADO[paso.estado]}</Insignia>}
      />

      {!aplica ? (
        <Vacio titulo="Este paso no aplica a tu nivel">Si la organización cambia de nivel, el paso se abrirá automáticamente y podrás cargar evidencias.</Vacio>
      ) : (
        <>
          <Tarjeta>
            <Subtitulo>Estado del paso</Subtitulo>
            <p className="text-sm text-gris">
              {paso.evidencias.aprobadas
                ? `Tiene ${paso.evidencias.aprobadas} evidencia(s) aprobada(s). Puedes marcarlo como hecho.`
                : 'Necesita al menos una evidencia aprobada para marcarse como hecho.'}
            </p>
            {puede('gestionar_pesv') && (
              <div className="flex flex-wrap gap-2">
                {(['pendiente', 'en_curso', 'hecho'] as const).map((e) => (
                  <Boton
                    key={e}
                    variante={paso.estado === e ? 'principal' : 'secundario'}
                    aria-pressed={paso.estado === e}
                    disabled={cambiarEstado.isPending || (e === 'hecho' && !paso.evidencias.aprobadas)}
                    onClick={() => cambiarEstado.mutate(e)}
                  >
                    {TEXTO_ESTADO[e]}
                  </Boton>
                ))}
              </div>
            )}
            <Aviso error={cambiarEstado.error} />
            <div className="flex flex-col gap-1 border-t border-linea pt-4">
              <p className="text-sm font-semibold">Cubre en ISO 39001</p>
              <ul className="text-sm text-gris">
                {(CORRESPONDENCIA_PESV_ISO[numero] ?? []).map((c) => (
                  <li key={c}><strong className="text-tinta">{c}</strong> {titulosIso.get(c)}</li>
                ))}
              </ul>
            </div>
          </Tarjeta>

          <Tarjeta>
            <Subtitulo>Evidencias</Subtitulo>
            {evidencias.isPending ? (
              <Cargando />
            ) : evidencias.data?.length ? (
              <ul className="flex flex-col">
                {evidencias.data.map((ev) => (
                  <FilaEvidencia key={ev.id} evidencia={ev} numero={numero} />
                ))}
              </ul>
            ) : (
              <Vacio titulo="Aún no hay evidencias">Sube el documento, acta, registro o foto que demuestra el cumplimiento de este paso.</Vacio>
            )}
          </Tarjeta>

          {puede('gestionar_pesv') && <SubirEvidencia numero={numero} evidencias={evidencias.data ?? []} />}
          {puede('gestionar_pesv') && ia.data?.agentes.includes('redactor') && <Redactor numero={numero} nombre={definicion.nombre} />}
        </>
      )}
    </Pagina>
  );
}

function FilaEvidencia({ evidencia: ev, numero }: { evidencia: Evidencia; numero: number }) {
  const { puede } = useSesion();
  const [motivo, setMotivo] = useState('');
  const [rechazando, setRechazando] = useState(false);
  const decidir = useAccion((d: { decision: 'aprobar' | 'rechazar'; motivo?: string }) => api.post(`/org/evidencias/${ev.id}/decision`, d), {
    alTerminar: () => setRechazando(false),
  });
  return (
    <li className="flex flex-col gap-2 border-t border-linea py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-noche">{ev.titulo}</span>
        <Insignia tono={TONO_EVIDENCIA[ev.estado]}>{TEXTO_EVIDENCIA[ev.estado]}</Insignia>
        {ev.generadaPorIa && <Insignia tono="info">Borrador de IA</Insignia>}
        {ev.versiones > 1 && <Insignia>Versión {ev.version}</Insignia>}
      </div>
      <p className="text-[13px] text-gris">
        {ev.archivo} · subida por {ev.subidaPor ?? 'usuario retirado'} el {fechaHora(ev.creadaEn)}
        {ev.clausulasIso.length ? ` · también cubre ISO 39001 ${ev.clausulasIso.join(', ')}` : ''}
      </p>
      {ev.descripcion && <p className="text-sm">{ev.descripcion}</p>}
      {ev.estado === 'rechazada' && ev.motivoRechazo && <p className="text-sm text-alerta">Motivo del rechazo: {ev.motivoRechazo}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <a href={urlApi(`/org/evidencias/${ev.id}/archivo`)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea">
          Descargar
        </a>
        {ev.estado === 'borrador' && puede('aprobar_evidencias') && (
          <>
            <Boton cargando={decidir.isPending && !rechazando} onClick={() => decidir.mutate({ decision: 'aprobar' })}>Aprobar</Boton>
            <Boton variante="peligro" onClick={() => setRechazando((v) => !v)} aria-expanded={rechazando}>Rechazar</Boton>
          </>
        )}
      </div>
      {rechazando && (
        <div className="flex flex-col gap-2">
          <AreaTexto id={`motivo-${ev.id}`} etiqueta="¿Por qué se rechaza?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Boton variante="peligro" className="self-start" cargando={decidir.isPending} onClick={() => decidir.mutate({ decision: 'rechazar', motivo })}>
            Confirmar rechazo
          </Boton>
        </div>
      )}
      <Aviso error={decidir.error} />
      <span className="sr-only">Paso {numero}</span>
    </li>
  );
}

function SubirEvidencia({ numero, evidencias }: { numero: number; evidencias: Evidencia[] }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reemplaza, setReemplaza] = useState('');
  const [clave, setClave] = useState(0);
  const subir = useAccion(
    () => {
      const datos = new FormData();
      datos.set('titulo', titulo);
      datos.set('pasoNumero', String(numero));
      if (descripcion) datos.set('descripcion', descripcion);
      if (reemplaza) datos.set('reemplazaId', reemplaza);
      if (archivo) datos.set('archivo', archivo);
      return api.post('/org/evidencias', datos);
    },
    {
      alTerminar: () => {
        setTitulo('');
        setDescripcion('');
        setArchivo(null);
        setReemplaza('');
        setClave((k) => k + 1);
      },
    },
  );
  return (
    <Tarjeta>
      <Subtitulo>Subir evidencia</Subtitulo>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          subir.mutate(undefined);
        }}
      >
        <Campo id="ev-titulo" etiqueta="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Acta de designación del líder PESV" />
        <AreaTexto id="ev-desc" etiqueta="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <Campo
          key={clave}
          id="ev-archivo"
          etiqueta="Archivo"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.md,.txt"
          ayuda="PDF, imagen, Word o Excel de máximo 15 MB."
          className="[&_input]:pt-2.5"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
        {evidencias.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            ¿Es una nueva versión de una evidencia existente?
            <select value={reemplaza} onChange={(e) => setReemplaza(e.target.value)} className="h-12 rounded-lg border border-[#d5dae1] bg-white px-3 font-normal">
              <option value="">No, es una evidencia nueva</option>
              {evidencias.map((ev) => (
                <option key={ev.id} value={ev.id}>Reemplaza a: {ev.titulo}</option>
              ))}
            </select>
          </label>
        )}
        <Aviso error={subir.error} />
        <Boton type="submit" className="self-start" cargando={subir.isPending} disabled={!titulo || !archivo}>Subir evidencia</Boton>
      </form>
    </Tarjeta>
  );
}

function Redactor({ numero, nombre }: { numero: number; nombre: string }) {
  const [documento, setDocumento] = useState('');
  const [instrucciones, setInstrucciones] = useState('');
  const redactar = useAccion(() => api.post<{ evidenciaId: string }>('/org/ia/redactar', { pasoNumero: numero, documento, instrucciones: instrucciones || undefined }), {
    alTerminar: () => {
      setDocumento('');
      setInstrucciones('');
    },
  });
  return (
    <Tarjeta>
      <Subtitulo>Redactar un borrador con IA</Subtitulo>
      <p className="text-sm text-gris">
        La IA prepara un borrador adaptado a tu organización para el paso «{nombre}». Queda como evidencia en revisión hasta que lo apruebes.
      </p>
      <Campo id="ia-doc" etiqueta="¿Qué documento necesitas?" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Ej.: Política de seguridad vial" />
      <AreaTexto id="ia-inst" etiqueta="Indicaciones (opcional)" value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} placeholder="Ej.: incluye el uso obligatorio de casco para motociclistas" />
      {redactar.isSuccess && <Aviso tono="exito">Borrador listo. Lo encuentras arriba, en las evidencias del paso.</Aviso>}
      <Aviso error={redactar.error} />
      <Boton className="self-start" cargando={redactar.isPending} disabled={documento.trim().length < 3} onClick={() => redactar.mutate(undefined)}>
        Redactar borrador
      </Boton>
    </Tarjeta>
  );
}
