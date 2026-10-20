import { zodResolver } from '@hookform/resolvers/zod';
import { formatoDocumentoSchema, formatoGeneralSchema, type FormatoDocumentoInput, type FormatoGeneralInput, type TipoDocumento } from '@pesv/shared';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Aviso, Boton, Campo, Cargando, Encabezado, Insignia, Pagina, Subtitulo, Tabla, Tarjeta, fecha, td, th } from '../components/ui';
import { api, urlApi } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';
import { EVENTO_LOGO } from '../lib/marca';
import { useSesion } from '../lib/sesion';

interface Firmante {
  nombre: string | null;
  cargo: string | null;
}
interface DocFormato {
  tipo: TipoDocumento;
  nombre: string;
  paso: number;
  codigo: string;
  version: number;
  fechaVersion: string | null;
  personalizado: boolean;
  elaboro: Firmante;
  reviso: Firmante;
  aprobo: Firmante;
}
interface Formato {
  tieneLogo: boolean;
  logoActualizado: string | null;
  general: { prefijo: string; pieTexto: string | null; colorPrimario: string; elaboro: Firmante; reviso: Firmante; aprobo: Firmante };
  documentos: DocFormato[];
}

const hoy = () => new Date().toISOString().slice(0, 10);
const enlaceBoton = 'inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[#1d4e89] ring-1 ring-linea hover:bg-papel';

export function FormatoDocumentos() {
  const { puede } = useSesion();
  const formato = useConsulta<Formato>(['formato'], '/org/formato');
  if (formato.isPending) return <Cargando />;
  if (!formato.data) return <Aviso error={formato.error} />;
  const d = formato.data;
  return (
    <Pagina ancho="max-w-5xl">
      <Encabezado
        titulo="Formato de documentos"
        descripcion="Logo, encabezado y pie de página del sistema de gestión. Se aplican a todos los PDF y Excel que genera la plataforma: matriz de riesgos, planes, actas, indicadores y documentos."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Logo tieneLogo={d.tieneLogo} version={d.logoActualizado} puedeEditar={puede('configurar')} />
        <VistaEncabezado formato={d} />
      </div>
      <General formato={d} puedeEditar={puede('configurar')} />
      <Documentos documentos={d.documentos} puedeEditar={puede('gestionar_pesv')} />
    </Pagina>
  );
}

function Logo({ tieneLogo, version, puedeEditar }: { tieneLogo: boolean; version: string | null; puedeEditar: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const avisar = () => window.dispatchEvent(new Event(EVENTO_LOGO));
  const subir = useAccion(
    (archivo: File) => {
      const f = new FormData();
      f.append('logo', archivo);
      return api.post('/org/logo', f);
    },
    { alTerminar: avisar },
  );
  const quitar = useAccion(() => api.delete('/org/logo'), { alTerminar: avisar });
  return (
    <Tarjeta>
      <Subtitulo>Logo de la empresa</Subtitulo>
      <div className="grid h-32 place-items-center rounded-xl border border-dashed border-linea bg-papel p-3">
        {tieneLogo ? (
          <img src={urlApi(`/org/logo?v=${encodeURIComponent(version ?? '')}`)} alt="Logo de la empresa" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-gris">Sin logo</span>
        )}
      </div>
      <p className="text-[13px] text-gris">PNG o JPG de máximo 1 MB. Mejor horizontal y con fondo blanco o transparente.</p>
      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            aria-label="Elegir logo"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) subir.mutate(archivo);
              e.target.value = '';
            }}
          />
          <Boton cargando={subir.isPending} onClick={() => entrada.current?.click()}>{tieneLogo ? 'Cambiar logo' : 'Subir logo'}</Boton>
          {tieneLogo && <Boton variante="secundario" cargando={quitar.isPending} onClick={() => quitar.mutate(undefined)}>Quitar</Boton>}
        </div>
      )}
      <Aviso error={subir.error ?? quitar.error} />
    </Tarjeta>
  );
}

/** Representación del encabezado y el pie tal como salen en el PDF. */
function VistaEncabezado({ formato }: { formato: Formato }) {
  const { organizacion } = useSesion();
  const doc = formato.documentos.find((x) => x.tipo === 'matriz_riesgos')!;
  const color = formato.general.colorPrimario;
  const firma = (f: Firmante, g: Firmante) => ({ nombre: f.nombre || g.nombre, cargo: f.cargo || g.cargo });
  return (
    <Tarjeta>
      <Subtitulo>Así se ve en los documentos</Subtitulo>
      <div className="flex flex-col gap-3 rounded-lg border border-linea bg-white p-3 text-[11px]">
        <div className="grid grid-cols-[5.5rem_1fr_8rem] border" style={{ borderColor: color }}>
          <div className="grid place-items-center border-r p-1" style={{ borderColor: color }}>
            {formato.tieneLogo ? (
              <img src={urlApi(`/org/logo?v=${encodeURIComponent(formato.logoActualizado ?? '')}`)} alt="" className="max-h-10 max-w-full object-contain" />
            ) : (
              <span className="text-center font-bold" style={{ color }}>{organizacion?.nombre}</span>
            )}
          </div>
          <div className="grid grid-rows-2 border-r text-center" style={{ borderColor: color }}>
            <div className="border-b px-1 py-1" style={{ borderColor: color }}>
              <p className="font-bold text-tinta">{organizacion?.nombre}</p>
              <p className="text-gris">NIT {organizacion?.nit}</p>
            </div>
            <p className="grid place-items-center px-1 font-bold uppercase" style={{ color }}>{doc.nombre}</p>
          </div>
          <dl className="grid grid-rows-3">
            {([['Código', doc.codigo], ['Versión', doc.version], ['Fecha', doc.fechaVersion ?? hoy()]] as const).map(([k, v], i) => (
              <div key={k} className={`flex gap-1 px-1.5 py-1 ${i ? 'border-t' : ''}`} style={{ borderColor: color }}>
                <dt className="font-bold text-gris">{k}:</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="h-10 rounded bg-papel" aria-hidden="true" />
        <div className="grid grid-cols-3 border border-linea">
          {(
            [
              ['Elaboró', firma(doc.elaboro, formato.general.elaboro)],
              ['Revisó', firma(doc.reviso, formato.general.reviso)],
              ['Aprobó', firma(doc.aprobo, formato.general.aprobo)],
            ] as const
          ).map(([rol, f], i) => (
            <div key={rol} className={`px-1.5 py-1 ${i ? 'border-l border-linea' : ''}`}>
              <p className="font-bold text-gris">{rol}</p>
              <p>{f.nombre ?? '—'}</p>
              <p className="text-gris">{f.cargo ?? ''}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-gris">
          <span>{formato.general.pieTexto}</span>
          <span className="font-bold text-tinta">Página 1 de 1</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={urlApi('/org/formato/vista-previa?tipo=matriz_riesgos')} className={enlaceBoton}>Descargar PDF de muestra</a>
        <a href={urlApi('/org/formato/vista-previa?tipo=matriz_riesgos&formato=xlsx')} className={enlaceBoton}>Descargar Excel de muestra</a>
      </div>
    </Tarjeta>
  );
}

function CamposFirmantes({ registrar, prefijo }: { registrar: (n: string) => object; prefijo: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {(['elaboro', 'reviso', 'aprobo'] as const).map((rol) => (
        <fieldset key={rol} className="flex flex-col gap-2 rounded-lg bg-papel p-3">
          <legend className="sr-only">{rol}</legend>
          <p className="text-sm font-bold text-noche">{rol === 'elaboro' ? 'Elaboró' : rol === 'reviso' ? 'Revisó' : 'Aprobó'}</p>
          <Campo id={`${prefijo}-${rol}-nombre`} etiqueta="Nombre" {...registrar(`${rol}.nombre`)} />
          <Campo id={`${prefijo}-${rol}-cargo`} etiqueta="Cargo" {...registrar(`${rol}.cargo`)} />
        </fieldset>
      ))}
    </div>
  );
}

const vacio = (f: Firmante) => ({ nombre: f.nombre ?? '', cargo: f.cargo ?? '' });

function General({ formato, puedeEditar }: { formato: Formato; puedeEditar: boolean }) {
  const g = formato.general;
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof formatoGeneralSchema>, unknown, FormatoGeneralInput>({
    resolver: zodResolver(formatoGeneralSchema),
    defaultValues: { prefijo: g.prefijo, pieTexto: g.pieTexto ?? '', colorPrimario: g.colorPrimario, elaboro: vacio(g.elaboro), reviso: vacio(g.reviso), aprobo: vacio(g.aprobo) },
  });
  const guardar = useAccion((d: FormatoGeneralInput) => api.put('/org/formato', d));
  return (
    <Tarjeta>
      <Subtitulo>Valores generales</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <fieldset disabled={!puedeEditar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[10rem_10rem_1fr]">
            <Campo id="prefijo" etiqueta="Prefijo de códigos" ayuda="Ej.: PESV, SST, SG" error={errors.prefijo?.message} {...register('prefijo')} />
            <Campo id="color" etiqueta="Color del formato" type="color" className="[&_input]:h-11 [&_input]:p-1" error={errors.colorPrimario?.message} {...register('colorPrimario')} />
            <Campo id="pie" etiqueta="Texto del pie de página" error={errors.pieTexto?.message} {...register('pieTexto')} />
          </div>
          <p className="text-sm text-gris">Responsables por defecto (cada documento puede tener los suyos):</p>
          <CamposFirmantes registrar={register as unknown as (n: string) => object} prefijo="g" />
        </fieldset>
        <Aviso error={guardar.error} />
        {guardar.isSuccess && <Aviso tono="exito">Formato guardado.</Aviso>}
        {puedeEditar && <Boton type="submit" className="self-start" cargando={guardar.isPending}>Guardar formato</Boton>}
      </form>
    </Tarjeta>
  );
}

function Documentos({ documentos, puedeEditar }: { documentos: DocFormato[]; puedeEditar: boolean }) {
  const [editando, setEditando] = useState<TipoDocumento | null>(null);
  return (
    <Tarjeta>
      <Subtitulo>Código y versión de cada documento</Subtitulo>
      <Tabla minimo="46rem">
        <thead>
          <tr>
            <th className={th}>Documento</th>
            <th className={th}>Paso</th>
            <th className={th}>Código</th>
            <th className={th}>Versión</th>
            <th className={th}>Fecha</th>
            <th className={th}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {documentos.map((d) => (
            <tr key={d.tipo}>
              <td className={td}>{d.nombre}{d.personalizado && <> <Insignia tono="info">Personalizado</Insignia></>}</td>
              <td className={td}>{d.paso}</td>
              <td className={td}><code>{d.codigo}</code></td>
              <td className={td}>{d.version}</td>
              <td className={td}>{d.fechaVersion ? fecha(d.fechaVersion) : 'La de generación'}</td>
              <td className={td}>{puedeEditar && <Boton variante="texto" onClick={() => setEditando(editando === d.tipo ? null : d.tipo)}>{editando === d.tipo ? 'Cerrar' : 'Editar'}</Boton>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {editando && <EditarDocumento key={editando} doc={documentos.find((d) => d.tipo === editando)!} alTerminar={() => setEditando(null)} />}
    </Tarjeta>
  );
}

function EditarDocumento({ doc, alTerminar }: { doc: DocFormato; alTerminar: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof formatoDocumentoSchema>, unknown, FormatoDocumentoInput>({
    resolver: zodResolver(formatoDocumentoSchema),
    defaultValues: { tipo: doc.tipo, codigo: doc.codigo, version: doc.version, fechaVersion: doc.fechaVersion ?? hoy(), elaboro: vacio(doc.elaboro), reviso: vacio(doc.reviso), aprobo: vacio(doc.aprobo) },
  });
  const guardar = useAccion((d: FormatoDocumentoInput) => api.put('/org/formato/documentos', d), { alTerminar });
  return (
    <form noValidate className="flex flex-col gap-4 rounded-xl border border-linea p-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
      <p className="font-bold text-noche">{doc.nombre}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="d-codigo" etiqueta="Código" error={errors.codigo?.message} {...register('codigo')} />
        <Campo id="d-version" etiqueta="Versión" type="number" min={1} error={errors.version?.message} {...register('version', { valueAsNumber: true })} />
        <Campo id="d-fecha" etiqueta="Fecha de la versión" type="date" error={errors.fechaVersion?.message} {...register('fechaVersion')} />
      </div>
      <p className="text-sm text-gris">Responsables de este documento (vacío = los generales):</p>
      <CamposFirmantes registrar={register as unknown as (n: string) => object} prefijo="d" />
      <Aviso error={guardar.error} />
      <div className="flex gap-2">
        <Boton type="submit" cargando={guardar.isPending}>Guardar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </form>
  );
}
