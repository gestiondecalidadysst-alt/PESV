import type { ReactNode } from 'react';

/** Negritas **así** dentro de una línea. */
function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t, i) => (t.startsWith('**') && t.endsWith('**') ? <strong key={i}>{t.slice(2, -2)}</strong> : t));
}

/**
 * Vista previa del mismo subconjunto de Markdown que se imprime en el PDF: # títulos, - viñetas,
 * 1. listas numeradas y **negrita**. Así lo que se ve aquí es lo que sale en el documento.
 */
export function TextoFormateado({ texto }: { texto: string }) {
  return <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-tinta">{bloquesDe(texto)}</div>;
}

function bloquesDe(texto: string): ReactNode[] {
  const bloques: ReactNode[] = [];
  let lista: { tipo: 'ul' | 'ol'; items: ReactNode[] } | null = null;
  const cerrarLista = () => {
    if (!lista) return;
    const Tag = lista.tipo;
    bloques.push(<Tag key={bloques.length} className={`${lista.tipo === 'ul' ? 'list-disc' : 'list-decimal'} flex flex-col gap-1 pl-6`}>{lista.items}</Tag>);
    lista = null;
  };
  texto.replace(/\r/g, '').split('\n').forEach((bruta, n) => {
    const linea = bruta.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(linea);
    const vineta = /^\s*[-*]\s+(.*)$/.exec(linea);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (vineta || numero) {
      const tipo = vineta ? 'ul' : 'ol';
      if (lista && lista.tipo !== tipo) cerrarLista();
      lista ??= { tipo, items: [] };
      lista.items.push(<li key={n}>{enLinea((vineta ?? numero)![1]!)}</li>);
      return;
    }
    cerrarLista();
    if (!linea.trim()) return;
    if (h) {
      const nivel = h[1]!.length;
      bloques.push(
        nivel === 1 ? <h2 key={n} className="text-xl font-extrabold text-noche">{enLinea(h[2]!)}</h2>
          : nivel === 2 ? <h3 key={n} className="pt-1 text-base font-bold text-noche">{enLinea(h[2]!)}</h3>
            : <h4 key={n} className="font-bold text-noche">{enLinea(h[2]!)}</h4>,
      );
      return;
    }
    bloques.push(<p key={n} className="text-justify">{enLinea(linea)}</p>);
  });
  cerrarLista();
  return bloques;
}
