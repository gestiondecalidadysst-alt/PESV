import { FORMULARIOS_VIGIA, periodoDesdeId, type FormularioVigia, type Periodo } from '@pesv/shared';
import { useState } from 'react';
import { Aviso, Boton, Cargando, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tarjeta, fecha, fechaHora } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

interface Calendario {
  reportaASupertransporte: boolean;
  formularios: {
    formulario: FormularioVigia;
    nombre: string;
    periodicidad: 'mensual' | 'trimestral';
    periodo: Periodo;
    diasParaPlazo: number;
    estado: 'pendiente' | 'generado' | 'enviado';
    generadoEn: string | null;
    enviadoEn: string | null;
    problemas: number;
  }[];
}
interface DetalleFormulario {
  formulario: FormularioVigia;
  periodo: Periodo;
  indicadores: { clave: string; nombre: string; valor: number | string }[];
  problemas: string[];
  detalle: { nombre: string; filas: number }[];
  estado: 'pendiente' | 'generado' | 'enviado';
  generadoEn: string | null;
  enviadoEn: string | null;
}

const TONO_ESTADO = { pendiente: 'aviso', generado: 'info', enviado: 'exito' } as const;
const TEXTO_ESTADO = { pendiente: 'Pendiente', generado: 'Archivo generado', enviado: 'Cargado en VIGIA 2' } as const;

/** Últimos periodos cerrados del formulario: 12 meses o 6 trimestres. */
function periodosRecientes(periodicidad: 'mensual' | 'trimestral', hoy = new Date()): Periodo[] {
  const lista: Periodo[] = [];
  const a = hoy.getFullYear();
  const m = hoy.getMonth() + 1;
  if (periodicidad === 'mensual') {
    for (let i = 1; i <= 12; i++) {
      const d = new Date(a, m - 1 - i, 1);
      lista.push(periodoDesdeId(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)!);
    }
  } else {
    let t = Math.ceil(m / 3);
    let anio = a;
    for (let i = 0; i < 6; i++) {
      t -= 1;
      if (t === 0) {
        t = 4;
        anio -= 1;
      }
      lista.push(periodoDesdeId(`${anio}-T${t}`)!);
    }
  }
  return lista;
}

export function Vigia() {
  const calendario = useConsulta<Calendario>(['vigia', 'calendario'], '/org/vigia/calendario');
  const [elegido, setElegido] = useState<{ formulario: FormularioVigia; periodo: string } | null>(null);
  return (
    <Pagina>
      <Encabezado
        titulo="Reporte VIGIA 2"
        descripcion="Indicadores que se cargan en el sistema VIGIA 2 de la Superintendencia de Transporte. La plataforma los calcula con tus datos, señala lo que falta y genera el archivo para cargarlo."
      />
      {calendario.data && !calendario.data.reportaASupertransporte && (
        <Aviso tono="info">Por tu clasificación no estás obligado a reportar a Supertransporte. Puedes generar los formularios como control interno.</Aviso>
      )}
      {calendario.isPending ? <Cargando /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {(calendario.data?.formularios ?? []).map((f) => {
            const activo = elegido?.formulario === f.formulario && elegido.periodo === f.periodo.id;
            return (
              <Tarjeta key={f.formulario} className={activo ? 'ring-2 ring-[#1d4e89]' : ''}>
                <Subtitulo acciones={<Insignia tono={TONO_ESTADO[f.estado]}>{TEXTO_ESTADO[f.estado]}</Insignia>}>{f.nombre}</Subtitulo>
                <p className="text-sm text-gris">{FORMULARIOS_VIGIA.find((x) => x.id === f.formulario)?.descripcion}</p>
                <p className="text-sm">
                  Periodo {f.periodo.etiqueta} · plazo de referencia {fecha(f.periodo.plazo)}{' '}
                  {f.estado !== 'enviado' && (f.diasParaPlazo < 0 ? <Insignia tono="peligro">Vencido hace {-f.diasParaPlazo} días</Insignia> : <Insignia tono={f.diasParaPlazo <= 7 ? 'aviso' : 'neutro'}>Faltan {f.diasParaPlazo} días</Insignia>)}
                </p>
                {f.problemas > 0 && <p className="text-sm text-[#9a3412]">{f.problemas === 1 ? '1 dato por completar' : `${f.problemas} datos por completar`}</p>}
                <Boton variante="secundario" className="self-start" onClick={() => setElegido({ formulario: f.formulario, periodo: f.periodo.id })}>Revisar formulario</Boton>
              </Tarjeta>
            );
          })}
        </div>
      )}
      <Aviso error={calendario.error} />
      {elegido && <Formulario key={`${elegido.formulario}-${elegido.periodo}`} formulario={elegido.formulario} periodo={elegido.periodo} alCambiarPeriodo={(p) => setElegido({ ...elegido, periodo: p })} />}
    </Pagina>
  );
}

function Formulario({ formulario, periodo, alCambiarPeriodo }: { formulario: FormularioVigia; periodo: string; alCambiarPeriodo: (p: string) => void }) {
  const { puede } = useSesion();
  const def = FORMULARIOS_VIGIA.find((f) => f.id === formulario)!;
  const d = useConsulta<DetalleFormulario>(['vigia', formulario, periodo], `/org/vigia/${formulario}/${periodo}`, { staleTime: 0 });
  const generar = useAccion(() => api.post<{ archivo: string; problemas: string[] }>(`/org/vigia/${formulario}/${periodo}/generar`));
  const enviado = useAccion(() => api.post(`/org/vigia/${formulario}/${periodo}/enviado`));
  return (
    <Tarjeta>
      <Subtitulo>Formulario {def.nombre}</Subtitulo>
      <Selector id="vigia-periodo" etiqueta="Periodo" className="max-w-60" value={periodo} onChange={(e) => alCambiarPeriodo(e.target.value)}>
        {periodosRecientes(def.periodicidad).map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
      </Selector>
      {d.isPending ? <Cargando texto="Calculando indicadores…" /> : d.data && (
        <>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {d.data.indicadores.map((i) => (
              <div key={i.clave} className="flex justify-between gap-4 border-b border-linea py-1.5">
                <dt>{i.nombre}</dt>
                <dd className="font-bold text-noche">{typeof i.valor === 'number' ? i.valor.toLocaleString('es-CO') : i.valor}</dd>
              </div>
            ))}
          </dl>
          {d.data.problemas.length > 0 ? (
            <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm">
              <p className="font-semibold">Completa estos datos antes de cargar el reporte:</p>
              <ul className="mt-1 list-disc pl-5">
                {d.data.problemas.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          ) : (
            <Aviso tono="exito">No hay datos faltantes para este periodo.</Aviso>
          )}
          <p className="text-[13px] text-gris">
            El archivo incluye las hojas: {d.data.detalle.map((h) => `${h.nombre} (${h.filas} filas)`).join(', ')}.
            {d.data.generadoEn && ` Generado el ${fechaHora(d.data.generadoEn)}.`}
            {d.data.enviadoEn && ` Marcado como cargado el ${fechaHora(d.data.enviadoEn)}.`}
          </p>
          <Aviso error={generar.error ?? enviado.error} />
          <div className="flex flex-wrap gap-2">
            {puede('gestionar_pesv') && <Boton cargando={generar.isPending} onClick={() => generar.mutate(undefined)}>{d.data.generadoEn ? 'Volver a generar' : 'Generar archivo'}</Boton>}
            {d.data.generadoEn && (
              <a href={urlApi(`/org/vigia/${formulario}/${periodo}/archivo`)} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea">Descargar Excel</a>
            )}
            {puede('gestionar_pesv') && d.data.generadoEn && d.data.estado !== 'enviado' && (
              <Boton variante="secundario" cargando={enviado.isPending} onClick={() => enviado.mutate(undefined)}>Marcar como cargado en VIGIA 2</Boton>
            )}
          </div>
        </>
      )}
      <Aviso error={d.error} />
    </Tarjeta>
  );
}
