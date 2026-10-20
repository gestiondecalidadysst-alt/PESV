import { Link } from 'react-router';

export function Logo({ claro }: { claro?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 self-start">
      <span aria-hidden="true" className="grid size-8 rotate-45 place-items-center rounded-md bg-senal">
        <span className="-rotate-45 text-sm font-extrabold text-noche">P</span>
      </span>
      <span className={`text-lg font-bold ${claro ? 'text-white' : 'text-noche'}`}>PESV</span>
    </Link>
  );
}
