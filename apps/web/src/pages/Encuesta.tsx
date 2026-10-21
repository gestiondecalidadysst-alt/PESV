import { cuestionarioPorId } from '@pesv/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { FormularioEncuesta } from '../components/FormularioEncuesta';
import { Logo } from '../components/Logo';
import { Cargando } from '../components/ui';
import { api, mensajeError, urlApi } from '../lib/api';

interface EncuestaPublica {
  organizacion: string;
  titulo: string;
  cuestionario: string;
  anonima: boolean;
  abierta: boolean;
  cierraEl: string | null;
  tieneLogo: boolean;
}

/** Encuesta de perfil por enlace: se responde sin cuenta, pensada para el celular. */
export function Encuesta() {
  const { token = '' } = useParams();
  const datos = useQuery({ queryKey: ['encuesta', token], queryFn: () => api.get<EncuestaPublica>(`/encuesta/${encodeURIComponent(token)}`), retry: false });
  const [enviada, setEnviada] = useState(false);
  const cuestionario = datos.data ? cuestionarioPorId(datos.data.cuestionario) : null;

  return (
    <div className="min-h-dvh bg-papel">
      <header className="border-b border-linea bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          {datos.data?.tieneLogo ? (
            <img src={urlApi(`/encuesta/${encodeURIComponent(token)}/logo`)} alt="" className="h-10 max-w-32 object-contain" />
          ) : (
            <Logo />
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-noche">{datos.data?.organizacion ?? 'Encuesta'}</p>
            <p className="text-[13px] text-gris">Plan Estratégico de Seguridad Vial</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6">
        {datos.isPending ? (
          <Cargando />
        ) : datos.error || !datos.data || !cuestionario ? (
          <Mensaje titulo="No encontramos esta encuesta">{datos.error ? mensajeError(datos.error) : 'Revisa el enlace que te enviaron.'}</Mensaje>
        ) : enviada ? (
          <Mensaje titulo="¡Gracias por responder!">Tus respuestas ayudan a {datos.data.organizacion} a planear acciones para que llegues seguro a tu destino. Ya puedes cerrar esta página.</Mensaje>
        ) : !datos.data.abierta ? (
          <Mensaje titulo="Esta encuesta ya cerró">Si aún necesitas responderla, comunícate con el líder del PESV de tu organización.</Mensaje>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-extrabold text-noche">{datos.data.titulo}</h1>
              <p className="mt-1 text-sm text-gris">
                Toma unos 5 minutos. {datos.data.anonima ? 'Es anónima: no te pedimos nombre ni cédula.' : 'Te pedimos tu nombre y cédula para no contar dos veces la misma respuesta.'}
                {datos.data.cierraEl ? ` Disponible hasta el ${new Date(`${datos.data.cierraEl}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}.` : ''}
              </p>
            </div>
            <section className="rounded-2xl bg-white p-5 ring-1 ring-linea sm:p-6">
              <FormularioEncuesta
                cuestionario={cuestionario}
                identificacion={datos.data.anonima ? 'anonima' : 'pedir'}
                organizacion={datos.data.organizacion}
                alEnviar={async (d) => {
                  await api.post(`/encuesta/${encodeURIComponent(token)}`, d);
                  setEnviada(true);
                  window.scrollTo({ top: 0 });
                }}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Mensaje({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-linea">
      <h1 className="text-xl font-extrabold text-noche">{titulo}</h1>
      <p className="mt-2 text-sm text-gris">{children}</p>
    </section>
  );
}
