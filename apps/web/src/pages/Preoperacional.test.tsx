import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderizar, simularApi, YO } from '../test-utils';
import { Preoperacional } from './Preoperacional';

const VEHICULO = { id: 'v1', placa: 'ABC123', tipo: 'bicicleta', estado: 'apto', motorizado: false, documentos: {} };
const PLANTILLA = {
  vehiculo: { id: 'v1', placa: 'ABC123' },
  plantilla: {
    id: 'bicicleta',
    nombre: 'Bicicleta',
    items: [
      { codigo: 'frenos', nombre: 'Frenos', critico: true },
      { codigo: 'casco', nombre: 'Casco', critico: true },
    ],
  },
};

describe('Preoperacional', () => {
  beforeEach(() => localStorage.clear());

  it('guarda en el celular si no hay conexión y lo reenvía al volver la señal', async () => {
    let enLinea = false;
    const llamadas = simularApi({
      'GET /auth/yo': { body: YO },
      'GET /org/vehiculos': { body: [VEHICULO] },
      'GET /org/inspecciones/plantilla/v1': { body: PLANTILLA },
      'POST /org/inspecciones': () => (enLinea ? { status: 201, body: { duplicada: false } } : { status: -1 }),
    });
    const user = userEvent.setup();
    renderizar(<Preoperacional />);
    await user.selectOptions(await screen.findByLabelText('Vehículo'), 'v1');
    await user.click(await screen.findByRole('button', { name: /Faltan 2/ }).then(() => screen.getAllByRole('button', { name: 'Bien' })[0]!));
    await user.click(screen.getAllByRole('button', { name: 'Falla' })[1]!);
    expect(screen.getByText(/quedará no apto/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar preoperacional' }));
    expect(await screen.findByText(/Sin conexión: el preoperacional de ABC123 quedó guardado/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('pesv.colaPreoperacionales')!)).toHaveLength(1);

    enLinea = true;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('pesv.colaPreoperacionales')!)).toHaveLength(0));
    const envios = llamadas.filter((l) => l.ruta === 'POST /org/inspecciones');
    expect(envios).toHaveLength(2);
    const cuerpos = envios.map((e) => JSON.parse(String(e.init!.body)));
    expect(cuerpos[0].clientId).toBe(cuerpos[1].clientId);
    expect(cuerpos[1].items).toEqual([{ codigo: 'frenos', ok: true }, { codigo: 'casco', ok: false }]);
  });
});
