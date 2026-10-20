import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AGENTES_IA, iaConfigSchema, PROVEEDORES_IA, type IaConfigInput } from '@pesv/shared';
import { useForm, useWatch } from 'react-hook-form';
import { Aviso, Boton, Campo, Cargando, Casilla, Encabezado, Insignia, Pagina, Subtitulo, Tabla, Tarjeta, fechaHora, td, th } from '../components/ui';
import { api } from '../lib/api';
import { useAccion, useConsulta } from '../lib/consultas';

interface ConfigIa {
  configurado: boolean;
  proveedor?: IaConfigInput['proveedor'];
  modelo?: string;
  modeloEconomico?: string | null;
  urlBase?: string | null;
  despliegue?: string | null;
  versionApi?: string | null;
  tieneClave?: boolean;
  claveTermina?: string | null;
  presupuestoMensualUsd?: number | null;
  precioEntradaPorMillon?: number;
  precioSalidaPorMillon?: number;
  umbralAlertaPct?: number;
  agentes?: IaConfigInput['agentes'];
  verificadoEn?: string | null;
  gastoMesUsd: number;
}

const numeroONulo = (v: string) => (v === '' ? null : Number(v));
const usd = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n);

export function ConfigIa() {
  const config = useConsulta<ConfigIa>(['ia-config'], '/org/ia/config');
  if (config.isPending) return <Cargando />;
  if (config.error) return <Aviso error={config.error} />;
  return <Formulario config={config.data!} />;
}

function Formulario({ config }: { config: ConfigIa }) {
  const uso = useConsulta<{ agente: string; llamadas: number; tokensEntrada: number; tokensSalida: number; costoUsd: number }[]>(['ia-uso'], '/org/ia/uso');
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<z.input<typeof iaConfigSchema>, unknown, IaConfigInput>({
    resolver: zodResolver(iaConfigSchema),
    defaultValues: config.configurado
      ? {
          proveedor: config.proveedor,
          modelo: config.modelo,
          modeloEconomico: config.modeloEconomico ?? undefined,
          urlBase: config.urlBase ?? undefined,
          despliegue: config.despliegue ?? undefined,
          versionApi: config.versionApi ?? undefined,
          presupuestoMensualUsd: config.presupuestoMensualUsd,
          precioEntradaPorMillon: config.precioEntradaPorMillon,
          precioSalidaPorMillon: config.precioSalidaPorMillon,
          umbralAlertaPct: config.umbralAlertaPct,
          agentes: config.agentes,
        }
      : { proveedor: 'anthropic', agentes: ['copiloto', 'redactor', 'diagnostico', 'lector'], precioEntradaPorMillon: 0, precioSalidaPorMillon: 0, umbralAlertaPct: 80 },
  });
  const proveedor = useWatch({ control, name: 'proveedor' });
  const def = PROVEEDORES_IA.find((p) => p.id === proveedor)!;
  const guardar = useAccion((d: IaConfigInput) => api.put('/org/ia/config', d), { alTerminar: () => setValue('claveApi', undefined) });
  const probar = useAccion(() => api.post<{ modelo: string; milisegundos: number }>('/org/ia/probar'));

  return (
    <Pagina ancho="max-w-4xl">
      <Encabezado
        titulo="Proveedor de IA"
        descripcion="Tu organización elige y paga su propio proveedor. Las credenciales se guardan cifradas y nunca se muestran completas. Sin proveedor, la plataforma funciona completa en modo manual."
      />
      <form noValidate className="flex flex-col gap-6" onSubmit={handleSubmit((d) => guardar.mutate(d))}>
        <Tarjeta>
          <Subtitulo>1. Proveedor</Subtitulo>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Proveedor de IA">
            {PROVEEDORES_IA.map((p) => (
              <label key={p.id} className="flex cursor-pointer flex-col gap-1 rounded-xl border border-linea p-4 has-[:checked]:border-noche has-[:checked]:bg-[#f3f7fc] has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-noche)]">
                <span className="flex items-center gap-2">
                  <input type="radio" value={p.id} className="size-4 accent-noche" {...register('proveedor')} />
                  <span className="font-bold text-noche">{p.nombre}</span>
                </span>
                <span className="text-[13px] text-gris">{p.descripcion}</span>
              </label>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta>
          <Subtitulo acciones={config.verificadoEn ? <Insignia tono="exito">Conexión verificada {fechaHora(config.verificadoEn)}</Insignia> : config.configurado ? <Insignia tono="aviso">Sin verificar</Insignia> : null}>
            2. Credenciales y modelo
          </Subtitulo>
          <div className="grid gap-4 sm:grid-cols-2">
            {def.pideClave && (
              <Campo
                id="clave"
                etiqueta="Clave de API"
                type="password"
                autoComplete="off"
                placeholder={config.tieneClave && config.proveedor === proveedor ? `Guardada, termina en ${config.claveTermina}` : 'Pega la clave del proveedor'}
                ayuda={config.tieneClave && config.proveedor === proveedor ? 'Déjala vacía para conservar la clave guardada.' : undefined}
                error={errors.claveApi?.message}
                {...register('claveApi', { setValueAs: (v) => v || undefined })}
              />
            )}
            {def.pideUrl && (
              <Campo
                id="url"
                etiqueta={proveedor === 'azure' ? 'URL del recurso de Azure' : 'URL del servicio'}
                placeholder={def.urlPorDefecto || 'https://'}
                error={errors.urlBase?.message}
                {...register('urlBase')}
              />
            )}
            {proveedor === 'azure' && (
              <>
                <Campo id="despliegue" etiqueta="Nombre del despliegue" error={errors.despliegue?.message} {...register('despliegue', { setValueAs: (v) => v || undefined })} />
                <Campo id="version" etiqueta="Versión de la API (opcional)" placeholder="2024-10-21" {...register('versionApi', { setValueAs: (v) => v || undefined })} />
              </>
            )}
            <Campo id="modelo" etiqueta="Modelo principal" ayuda="El que tu cuenta tenga habilitado; se usa para redactar y analizar." error={errors.modelo?.message} {...register('modelo')} />
            <Campo id="economico" etiqueta="Modelo económico (opcional)" ayuda="Más pequeño, para leer documentos y clasificar." {...register('modeloEconomico', { setValueAs: (v) => v || undefined })} />
          </div>
        </Tarjeta>

        <Tarjeta>
          <Subtitulo>3. Agentes activos</Subtitulo>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {AGENTES_IA.map((a) => (
              <Casilla key={a.id} etiqueta={a.nombre} descripcion={a.descripcion} value={a.id} {...register('agentes')} />
            ))}
          </div>
          {errors.agentes && <p className="text-[13px] text-alerta">{errors.agentes.message}</p>}
        </Tarjeta>

        <Tarjeta>
          <Subtitulo>4. Costos y tope de gasto</Subtitulo>
          <p className="text-sm text-gris">Escribe los precios de tu plan con el proveedor para calcular el gasto. Al llegar al tope, la IA se pausa hasta el mes siguiente.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo id="p-in" etiqueta="USD por millón de tokens de entrada" type="number" step="0.0001" min={0} {...register('precioEntradaPorMillon', { valueAsNumber: true })} />
            <Campo id="p-out" etiqueta="USD por millón de tokens de salida" type="number" step="0.0001" min={0} {...register('precioSalidaPorMillon', { valueAsNumber: true })} />
            <Campo id="tope" etiqueta="Tope mensual (USD)" type="number" step="0.01" min={0} ayuda="Vacío = sin tope." {...register('presupuestoMensualUsd', { setValueAs: numeroONulo })} />
            <Campo id="umbral" etiqueta="Avisar al llegar al (%)" type="number" min={1} max={100} {...register('umbralAlertaPct', { valueAsNumber: true })} />
          </div>
          <p className="text-sm">Gasto de este mes: <strong>{usd(config.gastoMesUsd)}</strong>{config.presupuestoMensualUsd ? ` de ${usd(config.presupuestoMensualUsd)}` : ''}</p>
        </Tarjeta>

        <Aviso error={guardar.error} />
        {guardar.isSuccess && <Aviso tono="exito">Configuración guardada. Prueba la conexión para verificar las credenciales.</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.isPending}>Guardar configuración</Boton>
          {config.configurado && (
            <Boton variante="secundario" cargando={probar.isPending} onClick={() => probar.mutate(undefined)}>Probar conexión</Boton>
          )}
        </div>
        <Aviso error={probar.error} />
        {probar.data && <Aviso tono="exito">Conexión verificada con {probar.data.modelo} en {(probar.data.milisegundos / 1000).toFixed(1)} s.</Aviso>}
      </form>

      {uso.data && uso.data.length > 0 && (
        <Tarjeta>
          <Subtitulo>Uso de este mes</Subtitulo>
          <Tabla minimo="32rem">
            <thead>
              <tr>
                <th className={th}>Agente</th>
                <th className={th}>Llamadas</th>
                <th className={th}>Tokens (entrada / salida)</th>
                <th className={th}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {uso.data.map((u) => (
                <tr key={u.agente}>
                  <td className={td}>{AGENTES_IA.find((a) => a.id === u.agente)?.nombre ?? u.agente}</td>
                  <td className={td}>{u.llamadas}</td>
                  <td className={td}>{u.tokensEntrada.toLocaleString('es-CO')} / {u.tokensSalida.toLocaleString('es-CO')}</td>
                  <td className={td}>{usd(u.costoUsd)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Tarjeta>
      )}
    </Pagina>
  );
}
