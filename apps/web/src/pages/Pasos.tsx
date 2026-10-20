import {
  CLAUSULAS_ISO_39001,
  CORRESPONDENCIA_PESV_ISO,
  FASE_LABEL,
  NIVEL_LABEL,
  NIVELES,
  PASOS_PESV,
  type Nivel,
} from '@pesv/shared';
import { useState } from 'react';

const tituloClausula = new Map(CLAUSULAS_ISO_39001.map((c) => [c.codigo, c.titulo]));

export function Pasos() {
  const [nivel, setNivel] = useState<Nivel | 'todos'>('todos');
  const visibles = PASOS_PESV.filter((p) => nivel === 'todos' || p.niveles.includes(nivel));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-noche">
          Los 24 pasos del PESV
        </h1>
        <p className="text-[15px] leading-relaxed text-gris">
          Metodología de la Resolución 40595 de 2022, con la cláusula de ISO 39001 que cubre cada
          paso. Una misma evidencia sirve para las dos.
        </p>
      </header>

      <div role="group" aria-label="Filtrar por nivel" className="flex flex-wrap gap-2">
        {(['todos', ...NIVELES] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={nivel === n}
            onClick={() => setNivel(n)}
            className="h-11 rounded-lg px-4 text-sm font-semibold ring-1 ring-linea aria-pressed:bg-noche aria-pressed:text-white aria-pressed:ring-noche bg-white text-tinta"
          >
            {n === 'todos' ? 'Todos los niveles' : `Nivel ${NIVEL_LABEL[n].toLowerCase()}`}
          </button>
        ))}
      </div>
      <p className="text-sm text-gris" aria-live="polite">
        {visibles.length} pasos
      </p>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-linea">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead>
            <tr className="text-gris">
              <th scope="col" className="px-4 py-3 font-semibold">
                Paso
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Fase
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Aplica en
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                ISO 39001
              </th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.numero} className="border-t border-linea align-top">
                <td className="px-4 py-3">
                  <span className="mr-2 font-extrabold text-noche">{p.numero}</span>
                  <span className="text-tinta">{p.nombre}</span>
                </td>
                <td className="px-4 py-3 text-gris">{FASE_LABEL[p.fase]}</td>
                <td className="px-4 py-3 text-gris">
                  {p.niveles.length === 3
                    ? 'Todos'
                    : p.niveles.map((n) => NIVEL_LABEL[n]).join(' y ')}
                </td>
                <td className="px-4 py-3">
                  <ul className="flex flex-col gap-0.5">
                    {(CORRESPONDENCIA_PESV_ISO[p.numero] ?? []).map((c) => (
                      <li key={c} className="text-gris">
                        <span className="font-semibold text-tinta">{c}</span>{' '}
                        {tituloClausula.get(c)}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-gris">
        La correspondencia con ISO 39001 es una propuesta de trabajo y debe validarla un auditor.
        Los requisitos completos de la norma se cargan desde la copia licenciada de cada
        organización.
      </p>
    </div>
  );
}
