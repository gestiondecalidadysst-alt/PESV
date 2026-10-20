import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderizar, simularApi } from '../test-utils';
import { Registro } from './Registro';

describe('Registro', () => {
  beforeEach(() => simularApi({ 'GET /auth/yo': { status: 401, body: { message: 'Sin sesión' } } }));

  it('muestra el nivel en vivo mientras se escriben flota y conductores', async () => {
    const user = userEvent.setup();
    renderizar(<Registro />);
    expect(screen.getByText(/aquí verás su nivel/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Vehículos'), '64');
    await user.type(screen.getByLabelText('Conductores'), '30');
    expect(screen.getByText('Estándar')).toBeInTheDocument();
    expect(screen.getByText('22 de 24 pasos')).toBeInTheDocument();
    expect(screen.getByText(/Lo definen los vehículos/)).toBeInTheDocument();
  });

  it('avisa cuando la organización no está obligada y bloquea el registro', async () => {
    const user = userEvent.setup();
    renderizar(<Registro />);
    await user.type(screen.getByLabelText('Vehículos'), '4');
    await user.type(screen.getByLabelText('Conductores'), '1');
    expect(screen.getByText('No está obligada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
  });

  it('pide la modalidad solo para empresas de transporte', async () => {
    const user = userEvent.setup();
    renderizar(<Registro />);
    expect(screen.queryByLabelText('Modalidad de transporte')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Transporte/ }));
    expect(screen.getByLabelText('Modalidad de transporte')).toBeInTheDocument();
  });

  it('valida la contraseña antes de enviar', async () => {
    const user = userEvent.setup();
    renderizar(<Registro />);
    await user.type(screen.getByLabelText('Contraseña'), 'corta');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText(/al menos 10 caracteres/)).toBeInTheDocument();
  });
});
