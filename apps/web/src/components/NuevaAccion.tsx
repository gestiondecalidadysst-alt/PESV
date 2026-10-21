import { zodResolver } from '@hookform/resolvers/zod';
import { accionSchema, type AccionInput } from '@pesv/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { api } from '../lib/api';
import { useAccion } from '../lib/consultas';
import { Aviso, Boton, Campo, Selector } from './ui';

/** Formulario corto para agregar una acción (correctiva, preventiva, de mejora o compromiso). */
export function NuevaAccion({ ruta, tipoPorDefecto = 'correctiva', alTerminar }: { ruta: string; tipoPorDefecto?: AccionInput['tipo']; alTerminar?: () => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.input<typeof accionSchema>, unknown, AccionInput>({ resolver: zodResolver(accionSchema), defaultValues: { tipo: tipoPorDefecto } });
  const crear = useAccion((d: AccionInput) => api.post(ruta, d), {
    alTerminar: () => {
      reset({ tipo: tipoPorDefecto, descripcion: '', responsable: '', venceEl: '' });
      alTerminar?.();
    },
  });
  return (
    <form noValidate className="flex flex-col gap-3 rounded-xl bg-papel p-4" onSubmit={handleSubmit((d) => crear.mutate(d))}>
      <Campo id={`a-desc-${ruta}`} etiqueta="Acción" error={errors.descripcion?.message} {...register('descripcion')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id={`a-resp-${ruta}`} etiqueta="Responsable" error={errors.responsable?.message} {...register('responsable')} />
        <Campo id={`a-fecha-${ruta}`} etiqueta="Fecha límite" type="date" error={errors.venceEl?.message} {...register('venceEl')} />
        <Selector id={`a-tipo-${ruta}`} etiqueta="Tipo" {...register('tipo')}>
          <option value="correctiva">Correctiva</option>
          <option value="preventiva">Preventiva</option>
          <option value="mejora">Mejora</option>
          <option value="compromiso">Compromiso</option>
        </Selector>
      </div>
      <Aviso error={crear.error} />
      <Boton type="submit" className="self-start" cargando={crear.isPending}>Agregar acción</Boton>
    </form>
  );
}
