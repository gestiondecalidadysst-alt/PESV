import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { simularApi, YO } from '../test-utils';
import { ProveedorSesion, useSesion } from './sesion';

function Estado() {
  const { yo, salir } = useSesion();
  return (
    <div>
      <p>{yo ? `Sesión de ${yo.usuario.nombre}` : 'Sin sesión'}</p>
      <button type="button" onClick={() => void salir()}>Salir</button>
    </div>
  );
}

describe('sesión', () => {
  it('al salir, la pantalla deja de mostrar la sesión aunque haya otras consultas activas', async () => {
    simularApi({ 'GET /auth/yo': { body: YO }, 'POST /auth/salir': { status: 204 } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProveedorSesion>
          <Estado />
        </ProveedorSesion>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Sesión de Laura Líder')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByText('Sin sesión')).toBeInTheDocument();
  });

  it('abre la organización indicada en el enlace de un correo (?org=)', async () => {
    const otra = { id: '22222222-2222-4222-8222-222222222222', nombre: 'Otra Empresa', nit: '900999888', roles: ['lider_pesv'] };
    simularApi({ 'GET /auth/yo': { body: { ...YO, organizaciones: [...YO.organizaciones, otra] } } });
    window.history.replaceState(null, '', `/siniestros/1?org=${otra.id}`);
    function Org() {
      const { organizacion } = useSesion();
      return <p>{organizacion?.nombre ?? '…'}</p>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProveedorSesion>
          <Org />
        </ProveedorSesion>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Otra Empresa')).toBeInTheDocument();
    window.history.replaceState(null, '', '/');
  });
});
