import { CLASES_DOCUMENTO, PASOS_PESV, PLANTILLAS_DOCUMENTO, type ClaseDocumento } from '@pesv/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { TextoFormateado } from '../components/TextoFormateado';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Cifra, Encabezado, Insignia, Pagina, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, fechaHora, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { useSesion } from '../lib/sesion';

type EstadoVersion = 'borrador' | 'en_revision' | 'aprobado' | 'obsoleto';

interface Version {
  id: string;
  version: number;
  estado: EstadoVersion;
  contenido?: string | null;
  tieneContenido: boolean;
  archivo: { nombre: string | null; tipo: string | null } | null;
  resumenCambios: string | null;
  elaboro: string | null;
  enviadaEl: string | null;
  reviso: string | null;
  revisadaEl: string | null;
  aprobo: string | null;
  aprobadaEl: string | null;
  vigenteDesde: string | null;
  notaDevolucion: string | null;
  divulgacion: { fecha: string; medio: string | null } | null;
  evidenciaId: string | null;
  creadaEl: string;
}

interface Documento {
  id: string;
  codigo: string;
  titulo: string;
  clase: ClaseDocumento;
  pasoNumero: number | null;
  responsable: string | null;
  retencion: string | null;
  vigente: Version | null;
  enCurso: Version | null;
  versiones: number;
  revisionVencida: boolean;
  sinDivulgar: boolean;
  actualizadoEl: string;
}

interface Listado {
  documentos: Documento[];
  resumen: { total: number; vigentes: number; enRevision: number; borradores: number; revisionVencida: number; sinDivulgar: number };
  tienePolitica: boolean;
  prefijo: string;
}

const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? '—';
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea';
const ESTADO = { borrador: { texto: 'Borrador', tono: 'neutro' }, en_revision: { texto: 'En revisión', tono: 'aviso' }, aprobado: { texto: 'Vigente', tono: 'exito' }, obsoleto: { texto: 'Obsoleta', tono: 'neutro' } } as const;

function EstadoDocumento({ d }: { d: Documento }) {
  return (
    <div className="flex flex-wrap gap-1">
      {d.vigente ? <Insignia tono="exito">Vigente v{d.vigente.version}</Insignia> : <Insignia>Sin versión aprobada</Insignia>}
      {d.enCurso && <Insignia tono={ESTADO[d.enCurso.estado].tono}>v{d.enCurso.version} {ESTADO[d.enCurso.estado].texto.toLowerCase()}</Insignia>}
      {d.revisionVencida && <Insignia tono="peligro">Revisar (más de un año)</Insignia>}
      {d.sinDivulgar && <Insignia tono="aviso">Sin divulgar</Insignia>}
    </div>
  );
}

// Lista maestra ---------------------------------------------------------------------

export function Documentos() {
  const { puede } = useSesion();
  const datos = useConsulta<Listado>(['documentos'], '/org/documentos');
  const [creando, setCreando] = useState(false);
  const [filtro, setFiltro] = useState({ texto: '', clase: '' });
  const evidencia = useAccion(() => api.post('/org/documentos/lista-maestra/evidencia'));
  const gestiona = puede('gestionar_pesv');
  const lista = (datos.data?.documentos ?? []).filter(
    (d) => (!filtro.clase || d.clase === filtro.clase) && (!filtro.texto || `${d.codigo} ${d.titulo}`.toLowerCase().includes(filtro.texto.toLowerCase())),
  );
  const r = datos.data?.resumen;

  return (
    <Pagina ancho="max-w-7xl">
      <Encabezado
        titulo="Documentos del PESV"
        descripcion="Pasos 3 y 19 · Política, procedimientos, programas y demás documentos controlados: se redactan aquí (o se adjuntan), pasan por revisión y aprobación con firma, se divulgan y quedan en la lista maestra con su historial de versiones."
        acciones={
          <div className="flex flex-wrap gap-2">
            <a href={urlApi('/org/documentos/lista-maestra')} className={enlaceBoton}>Lista maestra PDF</a>
            <a href={urlApi('/org/documentos/lista-maestra?formato=xlsx')} className={enlaceBoton}>Excel</a>
            {gestiona && !!datos.data?.documentos.length && <Boton variante="secundario" cargando={evidencia.isPending} onClick={() => evidencia.mutate(undefined)}>Evidencia del paso 19</Boton>}
          </div>
        }
      />
      {evidencia.isSuccess && <Aviso tono="exito">La lista maestra quedó como evidencia del paso 19, pendiente de aprobación.</Aviso>}
      <Aviso error={evidencia.error ?? datos.error} />
      {datos.isPending ? <Cargando /> : (
        <>
          {!datos.data?.tienePolitica && (
            <Aviso tono="info">
              Aún no hay una <strong>política de seguridad vial</strong> aprobada (paso 3). {gestiona && <button type="button" className="font-semibold underline" onClick={() => setCreando(true)}>Redáctala desde la plantilla</button>}
            </Aviso>
          )}
          {r && r.total > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra etiqueta="Documentos" valor={r.total} detalle={`${r.vigentes} con versión vigente`} />
              <Cifra etiqueta="En revisión" valor={r.enRevision} detalle={`${r.borradores} en borrador`} />
              <Cifra etiqueta="Por revisar (más de un año)" valor={r.revisionVencida} detalle="La política y los documentos se revisan al menos una vez al año" />
              <Cifra etiqueta="Sin divulgar" valor={r.sinDivulgar} detalle="Versiones vigentes sin registro de divulgación" />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {gestiona && !creando && <Boton onClick={() => setCreando(true)}>Nuevo documento</Boton>}
            {!!datos.data?.documentos.length && (
              <>
                <Campo id="dc-buscar" etiqueta="Buscar" className="w-56" placeholder="Código o título" value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
                <Selector id="dc-clase" etiqueta="Tipo" className="w-48" value={filtro.clase} onChange={(e) => setFiltro({ ...filtro, clase: e.target.value })}>
                  <option value="">Todos</option>
                  {CLASES_DOCUMENTO.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Selector>
              </>
            )}
          </div>
          {creando && <NuevoDocumento prefijo={datos.data?.prefijo ?? 'PESV'} sugerirPolitica={!datos.data?.tienePolitica} alTerminar={() => setCreando(false)} />}
          {!datos.data?.documentos.length ? (
            <Vacio titulo="Aún no hay documentos">Empieza por la política de seguridad vial y la designación del líder del PESV; hay plantillas para ambas.</Vacio>
          ) : (
            <Tabla minimo="56rem">
              <thead>
                <tr>
                  <th className={th}>Código</th>
                  <th className={th}>Documento</th>
                  <th className={th}>Paso</th>
                  <th className={th}>Vigente desde</th>
                  <th className={th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.id}>
                    <td className={`${td} whitespace-nowrap font-mono text-[13px]`}>{d.codigo}</td>
                    <td className={td}>
                      <Link to={`/documentos/${d.id}`} className="font-semibold text-noche underline-offset-2 hover:underline">{d.titulo}</Link>
                      <span className="block text-[12px] text-gris">{nombreDe(CLASES_DOCUMENTO, d.clase)}{d.responsable ? ` · ${d.responsable}` : ''}</span>
                    </td>
                    <td className={td}>{d.pasoNumero ?? '—'}</td>
                    <td className={td}>{d.vigente?.vigenteDesde ? fecha(d.vigente.vigenteDesde) : '—'}</td>
                    <td className={td}><EstadoDocumento d={d} /></td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </>
      )}
    </Pagina>
  );
}

function NuevoDocumento({ prefijo, sugerirPolitica, alTerminar }: { prefijo: string; sugerirPolitica: boolean; alTerminar: () => void }) {
  const navigate = useNavigate();
  const [plantilla, setPlantilla] = useState(sugerirPolitica ? 'politica_seguridad_vial' : '');
  const p = PLANTILLAS_DOCUMENTO.find((x) => x.id === plantilla);
  const [clase, setClase] = useState<ClaseDocumento>(p?.clase ?? 'procedimiento');
  const [titulo, setTitulo] = useState(p?.nombre ?? '');
  const [paso, setPaso] = useState(p ? String(p.paso) : '');
  const [codigo, setCodigo] = useState('');
  const [responsable, setResponsable] = useState('Líder del PESV');
  const [retencion, setRetencion] = useState('5 años');
  const [datosPlantilla, setDatos] = useState({ representante: '', lider: '', municipio: '' });
  const crear = useAccion(
    () =>
      api.post<{ id: string }>('/org/documentos', {
        clase,
        titulo,
        codigo: codigo || undefined,
        pasoNumero: paso ? Number(paso) : null,
        responsable: responsable || undefined,
        retencion: retencion || undefined,
        plantilla: plantilla || undefined,
        datosPlantilla: plantilla ? Object.fromEntries(Object.entries(datosPlantilla).filter(([, v]) => v.trim())) : undefined,
      }),
    { alTerminar: (r) => navigate(`/documentos/${r.id}`) },
  );
  const sigla = CLASES_DOCUMENTO.find((c) => c.id === clase)!.sigla;
  return (
    <Tarjeta>
      <Subtitulo>Nuevo documento</Subtitulo>
      <Selector
        id="nd-plantilla"
        etiqueta="Partir de"
        value={plantilla}
        ayuda={p?.descripcion}
        onChange={(e) => {
          const nueva = PLANTILLAS_DOCUMENTO.find((x) => x.id === e.target.value);
          setPlantilla(e.target.value);
          if (nueva) {
            setClase(nueva.clase);
            setTitulo(nueva.nombre === 'Procedimiento (estructura base)' ? '' : nueva.nombre);
            setPaso(String(nueva.paso));
          }
        }}
      >
        <option value="">Documento en blanco</option>
        {PLANTILLAS_DOCUMENTO.map((x) => <option key={x.id} value={x.id}>Plantilla: {x.nombre}</option>)}
      </Selector>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="nd-titulo" etiqueta="Título" className="sm:col-span-2" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Selector id="nd-clase" etiqueta="Tipo" value={clase} onChange={(e) => setClase(e.target.value as ClaseDocumento)}>
          {CLASES_DOCUMENTO.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selector>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Campo id="nd-codigo" etiqueta="Código" placeholder={`${prefijo}-${sigla}-01`} ayuda="Si lo dejas vacío se asigna el siguiente consecutivo." value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
        <Selector id="nd-paso" etiqueta="Paso del PESV" value={paso} onChange={(e) => setPaso(e.target.value)}>
          <option value="">Sin paso</option>
          {PASOS_PESV.map((x) => <option key={x.numero} value={x.numero}>{x.numero}. {x.nombre}</option>)}
        </Selector>
        <Campo id="nd-resp" etiqueta="Responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
        <Campo id="nd-ret" etiqueta="Tiempo de retención" value={retencion} onChange={(e) => setRetencion(e.target.value)} />
      </div>
      {p && /\{\{(representante|lider|municipio)\}\}/.test(p.contenido) && (
        <div className="grid gap-4 rounded-xl bg-papel p-4 sm:grid-cols-3">
          <p className="text-sm text-gris sm:col-span-3">Datos para completar la plantilla (puedes editarlos después):</p>
          <Campo id="nd-rep" etiqueta="Representante legal" value={datosPlantilla.representante} onChange={(e) => setDatos({ ...datosPlantilla, representante: e.target.value })} />
          {p.contenido.includes('{{lider}}') && <Campo id="nd-lider" etiqueta="Líder del PESV" value={datosPlantilla.lider} onChange={(e) => setDatos({ ...datosPlantilla, lider: e.target.value })} />}
          <Campo id="nd-mun" etiqueta="Municipio" value={datosPlantilla.municipio} onChange={(e) => setDatos({ ...datosPlantilla, municipio: e.target.value })} />
        </div>
      )}
      <Aviso error={crear.error} />
      <div className="flex gap-2">
        <Boton cargando={crear.isPending} disabled={titulo.trim().length < 3} onClick={() => crear.mutate(undefined)}>Crear y redactar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </Tarjeta>
  );
}

// Detalle --------------------------------------------------------------------------

interface DetalleDoc extends Documento {
  historial: Version[];
}

export function DocumentoDetalle() {
  const { id = '' } = useParams();
  const { puede } = useSesion();
  const datos = useConsulta<DetalleDoc>(['documentos', id], `/org/documentos/${id}`);
  const gestiona = puede('gestionar_pesv');
  const aprueba = puede('aprobar_evidencias');
  if (datos.isPending) return <Pagina><Cargando /></Pagina>;
  if (!datos.data) return <Pagina><Aviso error={datos.error} /></Pagina>;
  const d = datos.data;
  const enCurso = d.historial.find((v) => v.estado === 'borrador' || v.estado === 'en_revision') ?? null;

  return (
    <Pagina ancho="max-w-5xl">
      <Link to="/documentos" className="self-start text-sm font-semibold text-[#1d4e89] underline">← Documentos del PESV</Link>
      <Encabezado
        titulo={d.titulo}
        descripcion={<><span className="font-mono">{d.codigo}</span> · {nombreDe(CLASES_DOCUMENTO, d.clase)}{d.pasoNumero ? ` · paso ${d.pasoNumero}` : ''}{d.responsable ? ` · responsable: ${d.responsable}` : ''}{d.retencion ? ` · retención: ${d.retencion}` : ''}</>}
      />
      <EstadoDocumento d={d} />
      {enCurso ? (
        <VersionEnCurso key={`${enCurso.id}-${enCurso.estado}`} d={d} v={enCurso} gestiona={gestiona} aprueba={aprueba} />
      ) : (
        gestiona && <NuevaVersion id={d.id} />
      )}
      {d.vigente && <Vigente d={d} v={d.historial.find((v) => v.estado === 'aprobado')!} gestiona={gestiona} />}
      <Tarjeta>
        <Subtitulo>Historial de versiones</Subtitulo>
        <Tabla minimo="44rem">
          <thead>
            <tr>
              <th className={th}>Versión</th>
              <th className={th}>Estado</th>
              <th className={th}>Cambios</th>
              <th className={th}>Elaboró · revisó · aprobó</th>
              <th className={th}>Archivos</th>
            </tr>
          </thead>
          <tbody>
            {d.historial.map((v) => (
              <tr key={v.id}>
                <td className={td}>{v.version}</td>
                <td className={td}><Insignia tono={ESTADO[v.estado].tono}>{ESTADO[v.estado].texto}</Insignia>{v.vigenteDesde && <span className="block text-[12px] text-gris">desde {fecha(v.vigenteDesde)}</span>}</td>
                <td className={td}>{v.resumenCambios ?? '—'}</td>
                <td className={td}><span className="text-[13px]">{[v.elaboro, v.reviso, v.aprobo].map((x) => x ?? '—').join(' · ')}</span></td>
                <td className={td}>
                  <div className="flex flex-col gap-1 text-[13px]">
                    {v.tieneContenido && <a href={urlApi(`/org/documentos/${d.id}/versiones/${v.version}/pdf`)} className="font-semibold text-[#1d4e89] underline">PDF</a>}
                    {v.archivo && <a href={urlApi(`/org/documentos/${d.id}/versiones/${v.version}/archivo`)} className="font-semibold text-[#1d4e89] underline">{v.archivo.nombre}</a>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>
      <Aviso error={datos.error} />
    </Pagina>
  );
}

function NuevaVersion({ id }: { id: string }) {
  const crear = useAccion(() => api.post(`/org/documentos/${id}/nueva-version`));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Boton cargando={crear.isPending} onClick={() => crear.mutate(undefined)}>Crear nueva versión</Boton>
      <p className="text-sm text-gris">Parte del contenido vigente; la versión actual sigue vigente hasta que se apruebe la nueva.</p>
      <Aviso error={crear.error} />
    </div>
  );
}

function VersionEnCurso({ d, v, gestiona, aprueba }: { d: DetalleDoc; v: Version; gestiona: boolean; aprueba: boolean }) {
  const [contenido, setContenido] = useState(v.contenido ?? '');
  const [resumen, setResumen] = useState(v.resumenCambios ?? '');
  const [vista, setVista] = useState<'editar' | 'previa'>(v.estado === 'borrador' && gestiona ? 'editar' : 'previa');
  const [devolviendo, setDevolviendo] = useState(false);
  const [nota, setNota] = useState('');
  const [aprobando, setAprobando] = useState(false);
  const [clave, setClave] = useState('');
  const [vigenteDesde, setVigenteDesde] = useState(new Date().toISOString().slice(0, 10));
  const sinGuardar = contenido !== (v.contenido ?? '') || resumen !== (v.resumenCambios ?? '');
  const guardar = useAccion(() => api.put(`/org/documentos/${d.id}/borrador`, { contenido, resumenCambios: resumen || undefined }));
  const adjuntar = useAccion((f: File) => {
    const datos = new FormData();
    datos.set('archivo', f);
    return api.post(`/org/documentos/${d.id}/borrador/archivo`, datos);
  });
  const quitarArchivo = useAccion(() => api.delete(`/org/documentos/${d.id}/borrador/archivo`));
  const enviar = useAccion(async () => {
    if (sinGuardar) await api.put(`/org/documentos/${d.id}/borrador`, { contenido, resumenCambios: resumen || undefined });
    return api.post(`/org/documentos/${d.id}/enviar`);
  });
  const revisar = useAccion(() => api.post(`/org/documentos/${d.id}/revisar`));
  const devolver = useAccion(() => api.post(`/org/documentos/${d.id}/devolver`, { nota }), { alTerminar: () => setDevolviendo(false) });
  const aprobar = useAccion(() => api.post<{ evidenciaId: string | null }>(`/org/documentos/${d.id}/aprobar`, { password: clave, vigenteDesde }), { alTerminar: () => setAprobando(false) });
  const borrador = v.estado === 'borrador';
  const eliminar = useAccion(() => api.delete(`/org/documentos/${d.id}`));
  const navigate = useNavigate();

  return (
    <Tarjeta>
      <Subtitulo acciones={<Insignia tono={ESTADO[v.estado].tono}>Versión {v.version} · {ESTADO[v.estado].texto.toLowerCase()}</Insignia>}>
        {borrador ? 'Redacción' : 'Revisión y aprobación'}
      </Subtitulo>
      {v.notaDevolucion && borrador && <Aviso>Devuelto con observaciones: {v.notaDevolucion}</Aviso>}
      {v.estado === 'en_revision' && (
        <p className="text-sm text-gris">
          Enviado por {v.elaboro ?? '—'} el {v.enviadaEl ? fechaHora(v.enviadaEl) : '—'}.{v.reviso ? ` Revisado por ${v.reviso}.` : ' Pendiente de revisión.'}
        </p>
      )}
      <div role="tablist" className="flex gap-1 self-start rounded-lg bg-papel p-1">
        {borrador && gestiona && (
          <button type="button" role="tab" aria-selected={vista === 'editar'} onClick={() => setVista('editar')} className="min-h-9 rounded-md px-3 text-sm font-semibold text-gris aria-selected:bg-white aria-selected:text-noche aria-selected:shadow-sm">Editar</button>
        )}
        <button type="button" role="tab" aria-selected={vista === 'previa'} onClick={() => setVista('previa')} className="min-h-9 rounded-md px-3 text-sm font-semibold text-gris aria-selected:bg-white aria-selected:text-noche aria-selected:shadow-sm">Vista previa</button>
      </div>
      {vista === 'editar' && borrador ? (
        <>
          <AreaTexto
            id="dd-contenido"
            etiqueta="Contenido"
            ayuda="Formato: # título, ## subtítulo, - viñeta, 1. lista numerada y **negrita**. Así sale en el PDF con el encabezado del sistema de gestión."
            className="[&_textarea]:min-h-[28rem] [&_textarea]:font-mono [&_textarea]:text-[13px]"
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
          />
          {v.version > 1 && <Campo id="dd-resumen" etiqueta="Descripción de los cambios de esta versión" value={resumen} onChange={(e) => setResumen(e.target.value)} />}
        </>
      ) : contenido.trim() ? (
        <div className="max-h-[36rem] overflow-y-auto rounded-xl bg-papel p-6"><TextoFormateado texto={contenido} /></div>
      ) : (
        <p className="text-sm text-gris">Sin contenido redactado{v.archivo ? ': el documento es el archivo adjunto.' : '.'}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel/60 px-4 py-3 text-sm">
        <span className="font-semibold">Archivo adjunto:</span>
        {v.archivo ? <a href={urlApi(`/org/documentos/${d.id}/versiones/${v.version}/archivo`)} className="text-[#1d4e89] underline">{v.archivo.nombre}</a> : <span className="text-gris">ninguno (opcional si redactas el contenido aquí)</span>}
        {borrador && gestiona && (
          <>
            <label className="cursor-pointer font-semibold text-[#1d4e89] underline">
              {v.archivo ? 'Reemplazar' : 'Adjuntar PDF o Word'}
              <input type="file" className="sr-only" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) adjuntar.mutate(f); }} />
            </label>
            {v.archivo && <Boton variante="texto" onClick={() => quitarArchivo.mutate(undefined)}>Quitar</Boton>}
          </>
        )}
      </div>
      {v.tieneContenido && <a href={urlApi(`/org/documentos/${d.id}/versiones/${v.version}/pdf`)} className="self-start text-sm font-semibold text-[#1d4e89] underline">Ver PDF del borrador</a>}

      {devolviendo && (
        <div className="flex flex-col gap-2 rounded-xl bg-papel p-4">
          <AreaTexto id="dd-nota" etiqueta="¿Qué hay que corregir?" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex gap-2">
            <Boton cargando={devolver.isPending} disabled={nota.trim().length < 5} onClick={() => devolver.mutate(undefined)}>Devolver al borrador</Boton>
            <Boton variante="secundario" onClick={() => setDevolviendo(false)}>Cancelar</Boton>
          </div>
        </div>
      )}
      {aprobando && (
        <div className="flex flex-col gap-3 rounded-xl bg-papel p-4">
          <p className="text-sm">Al aprobar, firmas electrónicamente la versión {v.version}. {d.vigente ? `La versión ${d.vigente.version} quedará obsoleta.` : ''} El PDF aprobado queda como evidencia del paso {d.pasoNumero ?? '—'}.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Campo id="dd-vigente" etiqueta="Vigente desde" type="date" className="w-44" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
            <Campo id="dd-clave" etiqueta="Tu contraseña" type="password" autoComplete="current-password" className="w-56" value={clave} onChange={(e) => setClave(e.target.value)} />
            <Boton cargando={aprobar.isPending} disabled={!clave} onClick={() => aprobar.mutate(undefined)}>Firmar y aprobar</Boton>
            <Boton variante="secundario" onClick={() => setAprobando(false)}>Cancelar</Boton>
          </div>
        </div>
      )}
      <Aviso error={guardar.error ?? adjuntar.error ?? quitarArchivo.error ?? enviar.error ?? revisar.error ?? devolver.error ?? aprobar.error ?? eliminar.error} />
      {guardar.isSuccess && !sinGuardar && <Aviso tono="exito">Borrador guardado.</Aviso>}
      <div className="flex flex-wrap gap-2 border-t border-linea pt-3">
        {borrador && gestiona && (
          <>
            <Boton variante="secundario" cargando={guardar.isPending} disabled={!sinGuardar} onClick={() => guardar.mutate(undefined)}>Guardar borrador</Boton>
            <Boton cargando={enviar.isPending} onClick={() => enviar.mutate(undefined)}>Enviar a revisión</Boton>
            {!d.vigente && d.historial.length === 1 && (
              <Boton variante="texto" className="ml-auto" cargando={eliminar.isPending} onClick={async () => { if (window.confirm('¿Eliminar este documento?')) { await eliminar.mutateAsync(undefined); navigate('/documentos'); } }}>Eliminar documento</Boton>
            )}
          </>
        )}
        {v.estado === 'en_revision' && (
          <>
            {gestiona && !v.reviso && <Boton variante="secundario" cargando={revisar.isPending} onClick={() => revisar.mutate(undefined)}>Marcar como revisado</Boton>}
            {aprueba && !aprobando && <Boton onClick={() => setAprobando(true)}>Aprobar</Boton>}
            {gestiona && !devolviendo && <Boton variante="texto" onClick={() => setDevolviendo(true)}>Devolver con observaciones</Boton>}
            {!aprueba && <p className="self-center text-sm text-gris">La aprobación la hace quien tenga el permiso de aprobar (líder PESV o alta dirección).</p>}
          </>
        )}
      </div>
    </Tarjeta>
  );
}

function Vigente({ d, v, gestiona }: { d: DetalleDoc; v: Version; gestiona: boolean }) {
  const [divulgando, setDivulgando] = useState(false);
  const [f, setF] = useState(new Date().toISOString().slice(0, 10));
  const [medio, setMedio] = useState('');
  const divulgar = useAccion(() => api.post(`/org/documentos/${d.id}/divulgacion`, { fecha: f, medio }), { alTerminar: () => setDivulgando(false) });
  return (
    <Tarjeta>
      <Subtitulo acciones={<Insignia tono="exito">Versión {v.version} vigente</Insignia>}>Versión vigente</Subtitulo>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Elaboró</dt><dd>{v.elaboro ?? '—'}</dd></div>
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Revisó</dt><dd>{v.reviso ?? '—'}{v.revisadaEl ? ` · ${fecha(v.revisadaEl)}` : ''}</dd></div>
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Aprobó (firma electrónica)</dt><dd>{v.aprobo ?? '—'}{v.aprobadaEl ? ` · ${fechaHora(v.aprobadaEl)}` : ''}</dd></div>
        <div><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Vigente desde</dt><dd>{v.vigenteDesde ? fecha(v.vigenteDesde) : '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[12px] font-semibold uppercase tracking-wide text-gris">Divulgación</dt><dd>{v.divulgacion ? `${fecha(v.divulgacion.fecha)} · ${v.divulgacion.medio}` : <span className="text-alerta">Sin registrar</span>}</dd></div>
      </dl>
      {v.evidenciaId && d.pasoNumero && <p className="text-sm">Quedó como evidencia aprobada del <Link to={`/pasos/${d.pasoNumero}`} className="font-semibold text-[#1d4e89] underline">paso {d.pasoNumero}</Link>.</p>}
      <div className="flex flex-wrap gap-2">
        {v.tieneContenido && <a href={urlApi(`/org/documentos/${d.id}/versiones/${v.version}/pdf`)} className={enlaceBoton}>Descargar PDF</a>}
        {v.archivo && <a href={urlApi(`/org/documentos/${d.id}/versiones/${v.version}/archivo`)} className={enlaceBoton}>Descargar archivo</a>}
        {gestiona && !divulgando && <Boton variante="secundario" onClick={() => setDivulgando(true)}>{v.divulgacion ? 'Actualizar divulgación' : 'Registrar divulgación'}</Boton>}
      </div>
      {divulgando && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-papel p-4">
          <Campo id="dv-fecha" etiqueta="Fecha" type="date" className="w-44" min={v.vigenteDesde ?? undefined} max={new Date().toISOString().slice(0, 10)} value={f} onChange={(e) => setF(e.target.value)} />
          <Campo id="dv-medio" etiqueta="Cómo se divulgó" className="min-w-64 flex-1" placeholder="Ej.: correo a todos, cartelera e inducción" value={medio} onChange={(e) => setMedio(e.target.value)} />
          <Boton cargando={divulgar.isPending} disabled={medio.trim().length < 3} onClick={() => divulgar.mutate(undefined)}>Guardar</Boton>
          <Boton variante="secundario" onClick={() => setDivulgando(false)}>Cancelar</Boton>
          <Aviso error={divulgar.error} />
        </div>
      )}
    </Tarjeta>
  );
}
