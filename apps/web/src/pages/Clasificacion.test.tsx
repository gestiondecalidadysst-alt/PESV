import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Clasificacion } from './Clasificacion';

function renderizar() {
  const router = createMemoryRouter([{ path: '/', element: <Clasificacion /> }]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Clasificación', () => {
  it('muestra el nivel en vivo mientras se escriben flota y conductores', async () => {
    const user = userEvent.setup();
    renderizar();
    expect(screen.getByText(/aquí verás su nivel/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Vehículos'), '64');
    await user.type(screen.getByLabelText('Conductores'), '30');

    expect(screen.getByText('Estándar')).toBeInTheDocument();
    expect(screen.getByText('22 de 24 pasos')).toBeInTheDocument();
    expect(screen.getByText(/Lo definen los vehículos/)).toBeInTheDocument();
  });

  it('avisa cuando la organización no está obligada y bloquea el registro', async () => {
    const user = userEvent.setup();
    renderizar();
    await user.type(screen.getByLabelText('Vehículos'), '4');
    await user.type(screen.getByLabelText('Conductores'), '1');
    expect(screen.getByText('No está obligada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar organización' })).toBeDisabled();
  });

  it('pide la modalidad solo para empresas de transporte', async () => {
    const user = userEvent.setup();
    renderizar();
    expect(screen.queryByLabelText('Modalidad de transporte')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Transporte/ }));
    expect(screen.getByLabelText('Modalidad de transporte')).toBeInTheDocument();
  });
});
