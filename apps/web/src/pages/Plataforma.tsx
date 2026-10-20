import { zodResolver } from '@hookform/resolvers/zod';
import { ESTADOS_SUSCRIPCION, FUNCIONES_PLAN, NIVEL_LABEL, NIVELES, planSchema, type EstadoSuscripcion, type FuncionPlan, type Nivel, type PlanInput } from '@pesv/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AreaTexto, Aviso, Boton, Campo, Cargando, Casilla, Cifra, Encabezado, Insignia, Pagina, Pestanas, Selector, Subtitulo, Tabla, Tarjeta, Vacio, fecha, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';

export interface Plan {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  niveles: Nivel[];
  maxVehiculos: number | null;
  maxConductores: number | null;
  maxUsuarios: number | null;
  funciones: FuncionPlan[];
  precioMensual: number | null;
  moneda: string;
  diasPrueba: number;
  activo: boolean;
  porDefecto: boolean;
}

export const TEXTO_ESTADO_SUSCRIPCION: Record<EstadoSuscripcion, string> = { prueba: 'Prueba', activa: 'Activa', mora: 'En mora (solo lectura)', cancelada: 'Cancelada (solo lectura)' };
export const TONO_ESTADO_SUSCRIPCION = { prueba: 'info', activa: 'exito', mora: 'peligro', cancelada: 'neutro' } as const;
const precio = (p: Plan) => (p.precioMensual === null ? 'Se cotiza' : `${p.precioMensual.toLocaleString('es-CO')} ${p.moneda} al mes`);
const limite = (n: number | null) => (n === null ? 'Sin límite' : n.toLocaleString('es-CO'));

/** Lo que ve la organización: su plan, sus límites y el uso actual. */
export function Suscripcion() {
  const s = useConsulta<{
    estado: EstadoSuscripcion;
    soloLectura: boolean;
    finPrueba: string | null;
    vencePeriodoEl: string | null;
    plan: Plan | null;
    funciones: FuncionPlan[];
    uso: { vehiculos: number; conductores: number; usuarios: number };
  }>(['suscripcion'], '/org/suscripcion');
  return (
    <Pagina ancho="max-w-4xl">
      <Encabezado titulo="Suscripción" descripcion="Tu plan, sus límites y las funciones incluidas. Para cambiar de plan escribe al equipo de la plataforma." />
      {s.isPending ? <Cargando /> : s.data && (
        <>
          {s.data.soloLectura && (
            <Aviso>La cuenta está en solo lectura por un pago pendiente. Puedes consultar y descargar tu información, pero no registrar cambios.</Aviso>
          )}
          <Tarjeta>
            <Subtitulo acciones={<Insignia tono={TONO_ESTADO_SUSCRIPCION[s.data.estado]}>{TEXTO_ESTADO_SUSCRIPCION[s.data.estado]}</Insignia>}>
              {s.data.plan ? s.data.plan.nombre : 'Sin plan asignado'}
            </Subtitulo>
            {s.data.plan?.descripcion && <p className="text-sm text-gris">{s.data.plan.descripcion}</p>}
            <p className="text-sm">
              {s.data.plan ? precio(s.data.plan) : 'Todas las funciones están disponibles mientras la plataforma te asigna un plan.'}
              {s.data.finPrueba && ` · prueba hasta el ${fecha(s.data.finPrueba)}`}
              {s.data.vencePeriodoEl && ` · periodo pagado hasta el ${fecha(s.data.vencePeriodoEl)}`}
            </p>
          </Tarjeta>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              ['Vehículos', s.data.uso.vehiculos, s.data.plan?.maxVehiculos ?? null],
              ['Conductores activos', s.data.uso.conductores, s.data.plan?.maxConductores ?? null],
              ['Usuarios', s.data.uso.usuarios, s.data.plan?.maxUsuarios ?? null],
            ] as const).map(([nombre, uso, max]) => (
              <Cifra key={nombre} etiqueta={nombre} valor={uso} detalle={max === null ? 'Sin límite' : `de ${max}`} barra={max ? Math.min(100, Math.round((uso / max) * 100)) : undefined} />
            ))}
          </div>
          <Tarjeta>
            <Subtitulo>Funciones</Subtitulo>
            <ul className="grid gap-2 sm:grid-cols-2">
              {FUNCIONES_PLAN.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <Insignia tono={s.data.funciones.includes(f.id) ? 'exito' : 'neutro'}>{s.data.funciones.includes(f.id) ? 'Incluida' : 'No incluida'}</Insignia>
                  {f.nombre}
                </li>
              ))}
            </ul>
          </Tarjeta>
        </>
      )}
      <Aviso error={s.error} />
    </Pagina>
  );
}

// Panel de la plataforma --------------------------------------------------------

export function Plataforma() {
  const [pestana, setPestana] = useState<'organizaciones' | 'planes' | 'administradores'>('organizaciones');
  return (
    <Pagina>
      <Encabezado
        titulo="Panel de la plataforma"
        descripcion="Planes, límites y precios configurables (nada está fijo en el código), suscripción de cada organización y administradores."
      />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: 'organizaciones', nombre: 'Organizaciones' },
          { id: 'planes', nombre: 'Planes' },
          { id: 'administradores', nombre: 'Administradores' },
        ]}
      />
      {pestana === 'organizaciones' && <Organizaciones />}
      {pestana === 'planes' && <Planes />}
      {pestana === 'administradores' && <Administradores />}
    </Pagina>
  );
}

interface OrgPlataforma {
  id: string;
  nombre: string;
  nit: string;
  creadaEn: string;
  nivel: Nivel | null;
  voluntaria: boolean;
  planId: string | null;
  plan: string | null;
  estado: EstadoSuscripcion;
  vencePeriodoEl: string | null;
  finPrueba: string | null;
  vehiculos: number;
  conductores: number;
  usuarios: number;
}

function Organizaciones() {
  const orgs = useConsulta<OrgPlataforma[]>(['plataforma', 'organizaciones'], '/plataforma/organizaciones');
  const planes = useConsulta<Plan[]>(['plataforma', 'planes'], '/plataforma/planes');
  const [editando, setEditando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const lista = (orgs.data ?? []).filter((o) => `${o.nombre} ${o.nit}`.toLowerCase().includes(filtro.toLowerCase()));
  const cuenta = (e: EstadoSuscripcion) => (orgs.data ?? []).filter((o) => o.estado === e).length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        {ESTADOS_SUSCRIPCION.map((e) => <Cifra key={e} etiqueta={TEXTO_ESTADO_SUSCRIPCION[e]} valor={cuenta(e)} />)}
      </div>
      <Campo id="buscar-org" etiqueta="Buscar por nombre o NIT" className="max-w-md" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      {orgs.isPending ? <Cargando /> : lista.length ? (
        <Tabla minimo="60rem">
          <thead>
            <tr>
              <th className={th}>Organización</th>
              <th className={th}>Nivel</th>
              <th className={th}>Uso</th>
              <th className={th}>Plan</th>
              <th className={th}>Estado</th>
              <th className={th}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o.id}>
                <td className={td}><strong className="text-noche">{o.nombre}</strong><span className="block text-[13px] text-gris">NIT {o.nit} · desde {fecha(o.creadaEn)}</span></td>
                <td className={td}>{o.nivel ? NIVEL_LABEL[o.nivel] : '—'}{o.voluntaria && ' (voluntaria)'}</td>
                <td className={td}>{o.vehiculos} veh. · {o.conductores} cond. · {o.usuarios} usu.</td>
                <td className={td}>{o.plan ?? <span className="text-gris">Sin plan</span>}</td>
                <td className={td}>
                  <Insignia tono={TONO_ESTADO_SUSCRIPCION[o.estado]}>{TEXTO_ESTADO_SUSCRIPCION[o.estado]}</Insignia>
                  {o.vencePeriodoEl && <span className="block text-[13px] text-gris">hasta {fecha(o.vencePeriodoEl)}</span>}
                </td>
                <td className={td}>
                  {editando === o.id ? (
                    <EditarSuscripcion org={o} planes={planes.data ?? []} alTerminar={() => setEditando(null)} />
                  ) : (
                    <Boton variante="texto" onClick={() => setEditando(o.id)}>Cambiar</Boton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : <Vacio titulo="Sin organizaciones" />}
      <Aviso error={orgs.error} />
    </>
  );
}

function EditarSuscripcion({ org, planes, alTerminar }: { org: OrgPlataforma; planes: Plan[]; alTerminar: () => void }) {
  const [planId, setPlanId] = useState(org.planId ?? '');
  const [estado, setEstado] = useState<EstadoSuscripcion>(org.estado);
  const [vence, setVence] = useState(org.vencePeriodoEl ?? '');
  const [notas, setNotas] = useState('');
  const guardar = useAccion(
    () => api.put(`/plataforma/organizaciones/${org.id}/suscripcion`, { planId: planId || null, estado, vencePeriodoEl: vence || null, notas: notas || undefined }),
    { alTerminar },
  );
  return (
    <div className="flex min-w-64 flex-col gap-2">
      <Selector id={`plan-${org.id}`} etiqueta="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
        <option value="">Sin plan</option>
        {planes.filter((p) => p.activo || p.id === org.planId).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </Selector>
      <Selector id={`estado-${org.id}`} etiqueta="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoSuscripcion)}>
        {ESTADOS_SUSCRIPCION.map((e) => <option key={e} value={e}>{TEXTO_ESTADO_SUSCRIPCION[e]}</option>)}
      </Selector>
      <Campo id={`vence-${org.id}`} etiqueta="Periodo pagado hasta" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
      <Campo id={`notas-${org.id}`} etiqueta="Nota interna" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <Aviso error={guardar.error} />
      <div className="flex gap-2">
        <Boton cargando={guardar.isPending} onClick={() => guardar.mutate(undefined)}>Guardar</Boton>
        <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
      </div>
    </div>
  );
}

function Planes() {
  const planes = useConsulta<Plan[]>(['plataforma', 'planes'], '/plataforma/planes');
  const [editando, setEditando] = useState<Plan | 'nuevo' | null>(null);
  return (
    <>
      {!editando && <Boton className="self-start" onClick={() => setEditando('nuevo')}>Crear plan</Boton>}
      {editando && <FormularioPlan key={editando === 'nuevo' ? 'nuevo' : editando.id} plan={editando === 'nuevo' ? undefined : editando} alTerminar={() => setEditando(null)} />}
      {planes.isPending ? <Cargando /> : planes.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {planes.data.map((p) => (
            <Tarjeta key={p.id} className={p.activo ? '' : 'opacity-60'}>
              <Subtitulo acciones={<div className="flex gap-1">{p.porDefecto && <Insignia tono="info">Por defecto</Insignia>}{!p.activo && <Insignia>Inactivo</Insignia>}</div>}>{p.nombre}</Subtitulo>
              <p className="text-[13px] text-gris">Código {p.codigo}{p.niveles.length ? ` · nivel ${p.niveles.map((n) => NIVEL_LABEL[n]).join(', ')}` : ' · todos los niveles'}</p>
              <p className="text-xl font-extrabold text-noche">{precio(p)}</p>
              <dl className="grid grid-cols-3 gap-2 text-[13px]">
                <div><dt className="text-gris">Vehículos</dt><dd className="font-semibold">{limite(p.maxVehiculos)}</dd></div>
                <div><dt className="text-gris">Conductores</dt><dd className="font-semibold">{limite(p.maxConductores)}</dd></div>
                <div><dt className="text-gris">Usuarios</dt><dd className="font-semibold">{limite(p.maxUsuarios)}</dd></div>
              </dl>
              <p className="text-[13px]">{p.funciones.length ? p.funciones.map((f) => FUNCIONES_PLAN.find((x) => x.id === f)?.nombre).join(' · ') : 'Solo funciones básicas'}</p>
              {p.diasPrueba > 0 && <p className="text-[13px] text-gris">{p.diasPrueba} días de prueba</p>}
              <Boton variante="texto" className="self-start" onClick={() => setEditando(p)}>Editar</Boton>
            </Tarjeta>
          ))}
        </div>
      ) : (
        <Vacio titulo="Aún no hay planes">Sin planes, todas las organizaciones usan todas las funciones sin límites. Crea los planes cuando definas precios.</Vacio>
      )}
      <Aviso error={planes.error} />
    </>
  );
}

function FormularioPlan({ plan, alTerminar }: { plan?: Plan; alTerminar: () => void }) {
  const numero = (v: string) => (v === '' ? null : Number(v));
  const { register, handleSubmit, control, formState: { errors } } = useForm<z.input<typeof planSchema>, unknown, PlanInput>({
    resolver: zodResolver(planSchema),
    defaultValues: plan ? { ...plan, descripcion: plan.descripcion ?? '' } : { moneda: 'COP', niveles: [], funciones: [], diasPrueba: 0, activo: true, porDefecto: false },
  });
  const guardar = useAccion((d: PlanInput) => (plan ? api.patch(`/plataforma/planes/${plan.id}`, d) : api.post('/plataforma/planes', d)), { alTerminar });
  const listaDeCasillas = <T extends string>(nombre: 'niveles' | 'funciones', opciones: { id: T; nombre: string }[]) => (
    <Controller
      control={control}
      name={nombre}
      render={({ field }) => {
        const valor = (field.value ?? []) as T[];
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {opciones.map((o) => (
              <Casilla
                key={o.id}
                etiqueta={o.nombre}
                checked={valor.includes(o.id)}
                onChange={(e) => field.onChange(e.target.checked ? [...valor, o.id] : valor.filter((x) => x !== o.id))}
              />
            ))}
          </div>
        );
      }}
    />
  );
  return (
    <Tarjeta>
      <Subtitulo>{plan ? `Editar plan ${plan.nombre}` : 'Nuevo plan'}</Subtitulo>
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="pl-codigo" etiqueta="Código" placeholder="estandar-mensual" error={errors.codigo?.message} {...register('codigo')} />
          <Campo id="pl-nombre" etiqueta="Nombre" error={errors.nombre?.message} {...register('nombre')} />
          <Campo id="pl-dias" etiqueta="Días de prueba" type="number" min={0} {...register('diasPrueba', { setValueAs: (v) => (v === '' ? 0 : Number(v)) })} />
          <Campo id="pl-precio" etiqueta="Precio mensual" type="number" min={0} step="any" ayuda="Vacío = se cotiza." {...register('precioMensual', { setValueAs: numero })} />
          <Campo id="pl-moneda" etiqueta="Moneda" maxLength={3} error={errors.moneda?.message} {...register('moneda')} />
        </div>
        <AreaTexto id="pl-desc" etiqueta="Descripción" {...register('descripcion')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="pl-veh" etiqueta="Máximo de vehículos" type="number" min={1} ayuda="Vacío = sin límite." {...register('maxVehiculos', { setValueAs: numero })} />
          <Campo id="pl-cond" etiqueta="Máximo de conductores" type="number" min={1} {...register('maxConductores', { setValueAs: numero })} />
          <Campo id="pl-usu" etiqueta="Máximo de usuarios" type="number" min={1} {...register('maxUsuarios', { setValueAs: numero })} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Niveles PESV a los que se ofrece (ninguno = todos)</legend>
          {listaDeCasillas('niveles', NIVELES.map((n) => ({ id: n, nombre: NIVEL_LABEL[n] })))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Funciones incluidas</legend>
          {listaDeCasillas('funciones', [...FUNCIONES_PLAN])}
        </fieldset>
        <Casilla etiqueta="Plan activo (se puede asignar)" {...register('activo')} />
        <Casilla etiqueta="Plan por defecto para organizaciones nuevas" {...register('porDefecto')} />
        <Aviso error={guardar.error} />
        <div className="flex gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar plan</Boton>
          <Boton variante="secundario" onClick={alTerminar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

function Administradores() {
  const admins = useConsulta<{ id: string; email: string; nombre: string }[]>(['plataforma', 'administradores'], '/plataforma/administradores');
  const [email, setEmail] = useState('');
  const cambiar = useAccion((v: { email: string; activo: boolean }) => api.post('/plataforma/administradores', v), { alTerminar: () => setEmail('') });
  return (
    <Tarjeta>
      <Subtitulo>Administradores de la plataforma</Subtitulo>
      {admins.isPending ? <Cargando /> : (
        <ul className="flex flex-col">
          {(admins.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 border-t border-linea py-2 text-sm first:border-t-0">
              <span><strong className="text-noche">{a.nombre}</strong> · {a.email}</span>
              <Boton variante="texto" onClick={() => cambiar.mutate({ email: a.email, activo: false })}>Quitar</Boton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo id="admin-email" etiqueta="Correo de una cuenta existente" type="email" className="flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Boton cargando={cambiar.isPending} disabled={!email.includes('@')} onClick={() => cambiar.mutate({ email, activo: true })}>Dar acceso</Boton>
      </div>
      <Aviso error={cambiar.error ?? admins.error} />
    </Tarjeta>
  );
}
