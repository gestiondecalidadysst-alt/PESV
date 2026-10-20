import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderizar, simularApi, YO } from '../test-utils';
import { ReunionComite } from './Comite';

const ID = '22222222-2222-4222-8222-222222222222';
const reunion = (presentes: number) => ({
  id: ID,
  fecha: '2026-10-21T14:00:00.000Z',
  lugar: 'Sala de juntas',
  tipo: 'ordinaria',
  estado: 'en_curso',
  quorumRequerido: 2,
  presentes,
  hayQuorum: presentes >= 2,
  tieneActa: false,
  transcripcion: null,
  agenda: [{ id: 'p1', titulo: 'Verificación del quórum', notas: '' }],
  asistencia: [
    { miembroId: 'm1', usuarioId: 'u1', nombre: 'Laura Líder', cargo: null, rolComite: 'presidente', presente: presentes >= 1, llegada: null, firmadoEn: null },
    { miembroId: 'm2', usuarioId: null, nombre: 'Jorge Díaz', cargo: null, rolComite: 'integrante', presente: presentes >= 2, llegada: null, firmadoEn: null },
  ],
  decisiones: [],
  compromisos: [],
});

describe('Reunión del comité', () => {
  it('propone como votos a favor a los presentes aunque lleguen después de abrir la reunión', async () => {
    let presentes = 0;
    const llamadas = simularApi({
      'GET /auth/yo': { body: YO },
      'GET /org/ia/estado': { body: { activa: false, agentes: [] } },
      [`GET /org/comite/reuniones/${ID}`]: () => ({ body: reunion(presentes) }),
      [`POST /org/comite/reuniones/${ID}/llegada`]: () => {
        presentes = 1;
        return { body: { presente: true } };
      },
      [`POST /org/comite/reuniones/${ID}/asistencia`]: () => {
        presentes = 2;
        return { body: { presente: true } };
      },
      [`POST /org/comite/reuniones/${ID}/decisiones`]: { status: 201, body: {} },
    });
    const user = userEvent.setup();
    renderizar(<ReunionComite />, `/comite/${ID}`, '/comite/:id');

    expect(await screen.findByText('Faltan 2 para quórum')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar decisión' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Registrar mi llegada' }));
    await screen.findByText('Faltan 1 para quórum');
    await user.click(screen.getAllByRole('checkbox')[1]!);
    expect(await screen.findByText('Hay quórum')).toBeInTheDocument();

    expect(screen.getByLabelText('A favor')).toHaveValue(2);
    await user.type(screen.getByLabelText('Decisión'), 'Aprobar el plan de capacitación');
    await user.click(screen.getByRole('button', { name: 'Registrar decisión' }));
    await waitFor(() => expect(llamadas.some((l) => l.ruta.endsWith('/decisiones'))).toBe(true));
    const cuerpo = JSON.parse(llamadas.find((l) => l.ruta.endsWith('/decisiones'))!.init!.body as string);
    expect(cuerpo).toMatchObject({ texto: 'Aprobar el plan de capacitación', votosAFavor: 2, votosEnContra: 0 });
  });
});
