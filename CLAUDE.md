# Guía para trabajar en este repositorio

- Monorepo pnpm + Turborepo: `apps/api` (NestJS 12, ESM, Drizzle sobre PostgreSQL), `apps/web` (React 19, Vite,
  Tailwind 4, React Router, TanStack Query), `packages/shared` (catálogos, motor de clasificación, esquemas Zod).
- Idioma: interfaz, mensajes de error, nombres de dominio y documentación en español de Colombia. Las tablas de la
  base de datos usan nombres en inglés.
- La normativa es dato, no código: los catálogos viven en `packages/shared/src/catalog`. Una nueva resolución se
  agrega como versión nueva; no se edita la existente.
- El esquema de base de datos lo definen las migraciones SQL de `apps/api/db/migrations` (incluyen RLS y permisos).
  `src/db/schema.ts` solo tipa las consultas y debe mantenerse en espejo. Nunca se modifica una migración aplicada:
  se agrega una nueva.
- Todo acceso a datos de una organización pasa por `DatabaseService.withTenant()`. La API se conecta con el rol
  `pesv_app`, nunca con el dueño del esquema.
- Validación con los esquemas Zod de `@pesv/shared`, compartidos entre la API y la web.
- Reglas de negocio en `docs/reglas-de-negocio.md`; al implementar una, actualiza su estado.
- Antes de entregar: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- TypeScript fijado en 6.0 (typescript-eslint aún no soporta 7).
