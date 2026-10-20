import { zodResolver } from '@hookform/resolvers/zod';
import { auditoriaSchema, exigeAccionCorrectiva, hallazgoSchema, TIPOS_HALLAZGO, type AuditoriaInput, type HallazgoInput, type TipoHallazgo } from '@pesv/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';
import { ListaAcciones, type Accion } from './Acciones';
import { NuevaAccion } from './Siniestros';

type EstadoAuditoria = 'planeada' | 'en_curso' | 'cerrada';
interface Auditoria {
  id: string;
  tipo: AuditoriaInput['tipo'];
  alcance: string;
  auditor: string;
  auditorIndependiente: boolean;
  incluyeIso: boolean;
  programadaEl: string;
  ejecutadaEl: string | null;
  estado: EstadoAuditoria;
  conclusiones: string | null;
  hallazgosAbiertos?: number;
  hallazgosCerrados?: number;
}
interface Hallazgo {
  id: string;
  tipo: TipoHallazgo;
  pasoNumero: number | null;
  clausulaIso: string | null;
  descripcion: string;
  evidencia: string | null;
  causa: string | null;
  generadoPorIa: boolean;
  estado: 'abierto' | 'cerrado';
  verificacion: string | null;
  acciones: Accion[];
}

const ESTADO = { planeada: { t: 'Planeada', tono: 'neutro' }, en_curso: { t: 'En curso', tono: 'aviso' }, cerrada: { t: 'Cerrada', tono: 'exito' } } as const;
const TIPO_AUDITORIA = { interna: 'Interna', externa: 'Externa', simulada: 'Preauditoría' } as const;
const TONO_HALLAZGO = { no_conformidad_mayor: 'peligro', no_conformidad_menor: 'aviso', observacion: 'info', oportunidad_mejora: 'neutro' } as const;
const nombreHallazgo = (t: TipoHallazgo) => TIPOS_HALLAZGO.find((x) => x.id === t)?.nombre ?? t;

export function Auditorias() {
  const { puede } = useSesion();
  const auditorias = useConsulta<Auditoria[]>(['auditorias'], '/org/auditorias');
  const [creando, setCreando] = useState(false);
  return (
    <Pagina>
      <Encabezado
        titulo="Auditorías"
        descripcion="Auditoría anual del PESV (paso 22) y mejora continua (paso 23). Cada no conformidad necesita acciones correctivas y verificación de eficacia para cerrarse."
        acciones={puede('auditar') && !creando && <Boton onClick={() => setCreando(true)}>Programar auditoría</Boton>}
      />
      {creando && <FormularioAuditoria alTerminar={() => setCreando(false)} />}
      {auditorias.isPending ? <Cargando /> : auditorias.data?.length ? (
        <Tabla>
          <thead>
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Tipo y alcance</th>
              <th className={th}>Auditor</th>
              <th className={th}>Hallazgos</th>
              <th className={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {auditorias.data.map((a) => (
              <tr key={a.id}>
                <td className={td}><Link to={`/auditorias/${a.id}`} className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">{fecha(a.ejecutadaEl ?? a.programadaEl)}</Link></td>
                <td className={td}><strong className="text-noche">{TIPO_AUDITORIA[a.tipo]}</strong>{a.incluyeIso && ' · PESV e ISO 39001'}<span className="block text-[13px] text-gris">{a.alcance}</span></td>
                <td className={td}>{a.auditor}</td>
                <td className={td}>{a.hallazgosAbiertos} abiertos · {a.hallazgosCerrados} cerrados</td>
                <td className={td}><Insignia tono={ESTADO[a.estado].tono}>{ESTADO[a.estado].t}</Insignia></td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        <Vacio titulo="Sin auditorías">Programa la auditoría anual. Antes puedes hacer una preauditoría con el auditor simulado de IA.</Vacio>
      )}
      <Aviso error={auditorias.error} />
    </Pagina>
  );
}

function FormularioAuditoria({ alTerminar }: { alTerminar: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof auditoriaSchema>, unknown, AuditoriaInput>({
    resolver: zodResolver(auditoriaSchema),
    defaultValues: { tipo: 'interna', auditorIndependiente: true, incluyeIso: false, alcance: 'Pasos del PESV que aplican a la organización' },
  });
  const crear = useAccion((d: AuditoriaInput) => api.post('/org/auditorias', d), { alTerminar });
  return (
    <Tarjeta>
      <Subtitulo>Programar auditoría</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector id="au-tipo" etiqueta="Tipo" {...register('tipo')}>
            <option value="interna">Interna</option>
            <option value="externa">Externa</option>
            <option value="simulada">Preauditoría</option>
          </Selector>
          <Campo id="au-auditor" etiqueta="Auditor" error={errors.auditor?.message} {...register('auditor')} />
          <Campo id="au-fecha" etiqueta="Fecha programada" type="date" error={errors.programadaEl?.message} {...register('programadaEl')} />
        </div>
        <AreaTexto id="au-alcance" etiqueta="Alcance" error={errors.alcance?.message} {...register('alcance')} />
        <Casilla etiqueta="El auditor es independiente del trabajo auditado" descripcion="ISO 39001 (9.2): nadie audita su propio trabajo." {...register('auditorIndependiente')} />
        <Casilla etiqueta="Incluye ISO 39001" {...register('incluyeIso')} />
        <Aviso error={crear.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={crear.isPending}>Programar</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

export function AuditoriaDetalle() {
  const { id } = useParams();
  const { puede } = useSesion();
  const a = useConsulta<Auditoria & { hallazgos: Hallazgo[] }>(['auditoria', id], `/org/auditorias/${id}`);
  const ia = useConsulta<{ agentes: string[] }>(['ia-estado'], '/org/ia/estado');
  if (a.isPending) return <Cargando />;
  if (a.error || !a.data) return <Aviso error={a.error} />;
  const d = a.data;
  const abierta = d.estado !== 'cerrada';
  return (
    <Pagina ancho="max-w-5xl">
      <Link to="/auditorias" className="self-start text-sm font-semibold text-[#1d4e89] underline-offset-4 hover:underline">Auditorías</Link>
      <Encabezado
        titulo={`${TIPO_AUDITORIA[d.tipo]} del ${fecha(d.ejecutadaEl ?? d.programadaEl)}`}
        descripcion={`${d.alcance} · Auditor: ${d.auditor}${d.auditorIndependiente ? '' : ' (no independiente)'}`}
        acciones={<Insignia tono={ESTADO[d.estado].tono}>{ESTADO[d.estado].t}</Insignia>}
      />
      {abierta && puede('auditar') && ia.data?.agentes.includes('auditor') && <Simulacro auditoriaId={d.id} />}
      <Tarjeta>
        <Subtitulo>Hallazgos</Subtitulo>
        {d.hallazgos.length ? (
          <ul className="flex flex-col gap-4">
            {d.hallazgos.map((h) => <ItemHallazgo key={h.id} h={h} />)}
          </ul>
        ) : <p className="text-sm text-gris">Sin hallazgos registrados.</p>}
        {abierta && puede('auditar') && <NuevoHallazgo auditoriaId={d.id} />}
      </Tarjeta>
      {abierta && puede('auditar') ? <CerrarAuditoria auditoriaId={d.id} /> : d.conclusiones && (
        <Tarjeta>
          <Subtitulo>Conclusiones</Subtitulo>
          <p className="whitespace-pre-wrap text-sm">{d.conclusiones}</p>
        </Tarjeta>
      )}
    </Pagina>
  );
}

function ItemHallazgo({ h }: { h: Hallazgo }) {
  const { puede } = useSesion();
  const [verificacion, setVerificacion] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const cerrar = useAccion(() => api.post(`/org/auditorias/hallazgos/${h.id}/cerrar`, { verificacion }), { alTerminar: () => setCerrando(false) });
  const exige = exigeAccionCorrectiva(h.tipo);
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-linea p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono={TONO_HALLAZGO[h.tipo]}>{nombreHallazgo(h.tipo)}</Insignia>
        {h.pasoNumero && <Insignia>Paso {h.pasoNumero}</Insignia>}
        {h.clausulaIso && <Insignia>ISO {h.clausulaIso}</Insignia>}
        {h.generadoPorIa && <Insignia tono="info">Propuesto por IA</Insignia>}
        <Insignia tono={h.estado === 'cerrado' ? 'exito' : 'aviso'}>{h.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}</Insignia>
      </div>
      <p className="text-sm font-semibold text-noche">{h.descripcion}</p>
      {h.evidencia && <p className="text-[13px] text-gris">Evidencia: {h.evidencia}</p>}
      {h.verificacion && <p className="text-[13px] text-gris">Verificación de eficacia: {h.verificacion}</p>}
      {(h.acciones.length > 0 || h.estado === 'abierto') && (
        <div className="flex flex-col gap-2 border-t border-linea pt-2">
          <p className="text-[13px] font-semibold">{exige ? 'Acciones correctivas' : 'Acciones'}</p>
          {h.acciones.length > 0 && <ListaAcciones acciones={h.acciones} />}
          {h.estado === 'abierto' && puede('gestionar_pesv') && <NuevaAccion ruta={`/org/auditorias/hallazgos/${h.id}/acciones`} tipoPorDefecto={exige ? 'correctiva' : 'mejora'} />}
        </div>
      )}
      {h.estado === 'abierto' && puede('auditar') && (cerrando ? (
        <div className="flex flex-col gap-2">
          <AreaTexto id={`verif-${h.id}`} etiqueta="¿Cómo se verificó que la acción fue eficaz?" value={verificacion} onChange={(e) => setVerificacion(e.target.value)} />
          <Aviso error={cerrar.error} />
          <div className="flex gap-2">
            <Boton cargando={cerrar.isPending} disabled={verificacion.trim().length < 10} onClick={() => cerrar.mutate(undefined)}>Cerrar hallazgo</Boton>
            <Boton variante="secundario" onClick={() => setCerrando(false)}>Cancelar</Boton>
          </div>
        </div>
      ) : (
        <Boton variante="texto" className="self-start" onClick={() => setCerrando(true)}>Cerrar hallazgo</Boton>
      ))}
    </li>
  );
}

function NuevoHallazgo({ auditoriaId }: { auditoriaId: string }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof hallazgoSchema>, unknown, HallazgoInput>({
    resolver: zodResolver(hallazgoSchema),
    defaultValues: { tipo: 'no_conformidad_menor' },
  });
  const vacio = { tipo: 'no_conformidad_menor' as const, pasoNumero: null, clausulaIso: '', descripcion: '', evidencia: '' };
  const crear = useAccion((d: HallazgoInput) => api.post(`/org/auditorias/${auditoriaId}/hallazgos`, d), { alTerminar: () => reset(vacio) });
  return (
    <form noValidate className="flex flex-col gap-3 rounded-xl bg-papel p-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
      <p className="font-bold text-noche">Registrar hallazgo</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Selector id="hz-tipo" etiqueta="Tipo" {...register('tipo')}>
          {TIPOS_HALLAZGO.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </Selector>
        <Campo id="hz-paso" etiqueta="Paso PESV" type="number" min={1} max={24} {...register('pasoNumero', { setValueAs: (v) => (v === '' ? null : Number(v)) })} />
        <Campo id="hz-iso" etiqueta="Cláusula ISO 39001" placeholder="9.2" error={errors.clausulaIso?.message} {...register('clausulaIso')} />
      </div>
      <AreaTexto id="hz-desc" etiqueta="Descripción" error={errors.descripcion?.message} {...register('descripcion')} />
      <AreaTexto id="hz-ev" etiqueta="Evidencia" {...register('evidencia')} />
      <Aviso error={crear.error} />
      <Boton type="submit" className="self-start" cargando={crear.isPending}>Registrar hallazgo</Boton>
    </form>
  );
}

function Simulacro({ auditoriaId }: { auditoriaId: string }) {
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const simular = useAccion(() => api.post<{ resumen: string; hallazgos: HallazgoInput[] }>('/org/auditorias/simulacro'), {
    alTerminar: (r) => setElegidos(new Set(r.hallazgos.map((_, i) => i))),
  });
  const importar = useAccion(
    () => api.post(`/org/auditorias/${auditoriaId}/hallazgos/importar`, { hallazgos: (simular.data?.hallazgos ?? []).filter((_, i) => elegidos.has(i)) }),
    { alTerminar: () => simular.reset() },
  );
  return (
    <Tarjeta oscura>
      <Subtitulo>Auditor simulado con IA</Subtitulo>
      <p className="text-sm text-[#c9d2de]">Revisa el estado de los pasos, las evidencias y los registros operativos y propone hallazgos. Nada se registra hasta que eliges cuáles agregar.</p>
      {!simular.data && <Boton className="self-start" cargando={simular.isPending} onClick={() => simular.mutate(undefined)}>Hacer preauditoría</Boton>}
      <Aviso error={simular.error ?? importar.error} />
      {simular.data && (
        <div className="flex flex-col gap-3">
          {simular.data.resumen && <p className="text-sm text-white">{simular.data.resumen}</p>}
          {simular.data.hallazgos.length === 0 ? <p className="text-sm text-[#c9d2de]">La IA no propuso hallazgos válidos.</p> : (
            <ul className="flex flex-col gap-2">
              {simular.data.hallazgos.map((h, i) => (
                <li key={i} className="rounded-lg bg-white p-3 text-tinta">
                  <Casilla
                    etiqueta={`${nombreHallazgo(h.tipo)}${h.pasoNumero ? ` · paso ${h.pasoNumero}` : ''}: ${h.descripcion}`}
                    descripcion={h.evidencia ? `Evidencia: ${h.evidencia}` : undefined}
                    checked={elegidos.has(i)}
                    onChange={(e) => {
                      const n = new Set(elegidos);
                      if (e.target.checked) n.add(i);
                      else n.delete(i);
                      setElegidos(n);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Boton cargando={importar.isPending} disabled={elegidos.size === 0} onClick={() => importar.mutate(undefined)}>Registrar {elegidos.size} hallazgos</Boton>
            <Boton variante="secundario" onClick={() => simular.reset()}>Descartar</Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

function CerrarAuditoria({ auditoriaId }: { auditoriaId: string }) {
  const [conclusiones, setConclusiones] = useState('');
  const cerrar = useAccion(() => api.post(`/org/auditorias/${auditoriaId}/cerrar`, { conclusiones }));
  return (
    <Tarjeta>
      <Subtitulo>Cerrar auditoría</Subtitulo>
      <AreaTexto id="conclusiones" etiqueta="Conclusiones" rows={6} value={conclusiones} onChange={(e) => setConclusiones(e.target.value)} />
      <p className="text-[13px] text-gris">Los hallazgos abiertos siguen su curso en el plan de mejora (paso 23) después del cierre.</p>
      <Aviso error={cerrar.error} />
      <Boton className="self-start" cargando={cerrar.isPending} disabled={conclusiones.trim().length < 10} onClick={() => cerrar.mutate(undefined)}>Cerrar auditoría</Boton>
    </Tarjeta>
  );
}
