import { BANDAS_PUNTAJE, type BandaPuntaje, type CumplimientoClausula, type FactorPuntaje } from '@pesv/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Aviso, Cargando, Cifra, Encabezado, Insignia, Pagina, Pestanas, Tabla, Vacio, td, th } from '../components/ui';
import { useConsulta } from '../lib/consultas';

interface Puntuado {
  id: string;
  puntaje: number;
  banda: BandaPuntaje;
  factores: FactorPuntaje[];
}
interface ConductorPuntuado extends Puntuado {
  nombre: string;
  documento: string;
}
interface VehiculoPuntuado extends Puntuado {
  placa: string;
  tipo: string;
  estado: string;
}

const TONO_BANDA = { bajo: 'exito', medio: 'info', alto: 'aviso', critico: 'peligro' } as const;
const COLOR_BARRA = { bajo: 'bg-[#2f8f5b]', medio: 'bg-[#1d4e89]', alto: 'bg-[#d97706]', critico: 'bg-[#b42318]' } as const;

function Barra({ puntaje, banda }: { puntaje: number; banda: BandaPuntaje }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-linea" role="img" aria-label={`Puntaje ${puntaje} de 100`}>
        <div className={`h-full ${COLOR_BARRA[banda]}`} style={{ width: `${puntaje}%` }} />
      </div>
      <span className="w-8 text-right font-bold tabular-nums text-noche">{puntaje}</span>
      <Insignia tono={TONO_BANDA[banda]}>{BANDAS_PUNTAJE[banda].nombre}</Insignia>
    </div>
  );
}

function Factores({ factores }: { factores: FactorPuntaje[] }) {
  if (!factores.length) return <span className="text-gris">Sin novedades</span>;
  return (
    <ul className="flex flex-col gap-0.5 text-[13px]">
      {factores.map((f) => (
        <li key={f.factor}><strong className="tabular-nums">+{f.puntos}</strong> {f.factor}{f.detalle && <span className="text-gris"> · {f.detalle}</span>}</li>
      ))}
    </ul>
  );
}

function Resumen({ lista }: { lista: Puntuado[] }) {
  const cuenta = (b: BandaPuntaje) => lista.filter((x) => x.banda === b).length;
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      {(Object.keys(BANDAS_PUNTAJE) as BandaPuntaje[]).map((b) => (
        <Cifra key={b} etiqueta={`Riesgo ${BANDAS_PUNTAJE[b].nombre.toLowerCase()}`} valor={cuenta(b)} />
      ))}
    </div>
  );
}

export function Riesgo() {
  const [pestana, setPestana] = useState<'conductores' | 'vehiculos'>('conductores');
  const conductores = useConsulta<ConductorPuntuado[]>(['riesgo', 'conductores'], '/org/riesgo/conductores', { enabled: pestana === 'conductores' });
  const vehiculos = useConsulta<VehiculoPuntuado[]>(['riesgo', 'vehiculos'], '/org/riesgo/vehiculos', { enabled: pestana === 'vehiculos' });
  const consulta = pestana === 'conductores' ? conductores : vehiculos;
  return (
    <Pagina>
      <Encabezado
        titulo="Puntaje de riesgo"
        descripcion="De 0 a 100 por conductor y por vehículo, con reglas fijas sobre siniestros, excesos, documentos, fallas, mantenimiento y capacitación. Cada punto muestra de dónde sale; la IA no lo decide."
      />
      <Pestanas valor={pestana} alCambiar={setPestana} opciones={[{ id: 'conductores', nombre: 'Conductores' }, { id: 'vehiculos', nombre: 'Vehículos' }]} />
      {consulta.isPending ? <Cargando /> : consulta.data?.length ? (
        <>
          <Resumen lista={consulta.data} />
          <Tabla minimo="46rem">
            <thead>
              <tr>
                <th className={th}>{pestana === 'conductores' ? 'Conductor' : 'Vehículo'}</th>
                <th className={th}>Puntaje</th>
                <th className={th}>De dónde sale</th>
              </tr>
            </thead>
            <tbody>
              {pestana === 'conductores'
                ? conductores.data!.map((c) => (
                    <tr key={c.id}>
                      <td className={td}><strong className="text-noche">{c.nombre}</strong><span className="block text-[13px] text-gris">CC {c.documento}</span></td>
                      <td className={td}><Barra puntaje={c.puntaje} banda={c.banda} /></td>
                      <td className={td}><Factores factores={c.factores} /></td>
                    </tr>
                  ))
                : vehiculos.data!.map((v) => (
                    <tr key={v.id}>
                      <td className={td}><strong className="text-noche">{v.placa}</strong><span className="block text-[13px] text-gris">{v.tipo}{v.estado === 'no_apto' ? ' · no apto' : ''}</span></td>
                      <td className={td}><Barra puntaje={v.puntaje} banda={v.banda} /></td>
                      <td className={td}><Factores factores={v.factores} /></td>
                    </tr>
                  ))}
            </tbody>
          </Tabla>
          <p className="text-[13px] text-gris">Los conductores o vehículos en riesgo crítico generan el evento <code>riesgo.critico</code> para n8n una vez al mes.</p>
        </>
      ) : (
        <Vacio titulo={pestana === 'conductores' ? 'Sin conductores activos' : 'Sin vehículos activos'} />
      )}
      <Aviso error={consulta.error} />
    </Pagina>
  );
}

const ESTADO_CLAUSULA = {
  cubierta: { t: 'Cubierta', tono: 'exito' },
  en_progreso: { t: 'En progreso', tono: 'aviso' },
  sin_cubrir: { t: 'Sin cubrir', tono: 'neutro' },
  fuera_de_alcance: { t: 'Fuera de alcance', tono: 'neutro' },
} as const;

export function Iso() {
  const iso = useConsulta<{ clausulas: CumplimientoClausula[]; cubiertas: number; evaluables: number; porcentaje: number }>(['iso'], '/org/tablero/iso');
  return (
    <Pagina ancho="max-w-5xl">
      <Encabezado
        titulo="ISO 39001"
        descripcion="Cumplimiento por cláusula, calculado con el estado de los pasos del PESV que la soportan. Una cláusula queda cubierta cuando todos sus pasos aplicables están hechos."
      />
      {iso.isPending ? <Cargando /> : iso.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Cifra etiqueta="Cumplimiento ISO 39001" valor={`${iso.data.porcentaje} %`} barra={iso.data.porcentaje} />
            <Cifra etiqueta="Cláusulas cubiertas" valor={`${iso.data.cubiertas} de ${iso.data.evaluables}`} />
            <Cifra etiqueta="Sin correspondencia con el PESV" valor={iso.data.clausulas.filter((c) => c.pasos.length === 0).length} detalle="Se gestionan aparte del PESV" />
          </div>
          <Tabla>
            <thead>
              <tr>
                <th className={th}>Cláusula</th>
                <th className={th}>Pasos del PESV</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {iso.data.clausulas.map((c) => (
                <tr key={c.codigo}>
                  <td className={td}><strong className="text-noche">{c.codigo}</strong> {c.titulo}</td>
                  <td className={td}>
                    {c.pasos.length ? (
                      <span className="flex flex-wrap gap-1">
                        {c.pasos.map((p) => <Link key={p} to={`/pasos/${p}`} className="font-semibold text-[#1d4e89] underline-offset-4 hover:underline">{p}</Link>)}
                      </span>
                    ) : <span className="text-gris">—</span>}
                  </td>
                  <td className={td}><Insignia tono={ESTADO_CLAUSULA[c.estado].tono}>{ESTADO_CLAUSULA[c.estado].t}</Insignia></td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}
      <Aviso error={iso.error} />
    </Pagina>
  );
}
