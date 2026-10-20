# PESV

Plataforma SaaS para gestionar el Plan Estratégico de Seguridad Vial (Resolución 40595 de 2022) e ISO 39001 en
organizaciones colombianas de cualquier misionalidad y tamaño, con inteligencia artificial elegida por cada cliente
e integración con n8n.

> Estado: **Fase 0** (cimientos). Incluye el catálogo normativo, el motor de clasificación, la base de datos
> multiempresa y el asistente de clasificación de punta a punta. Ver [Hoja de ruta](#hoja-de-ruta).

## Qué hace hoy

- **Clasifica la organización** según misionalidad, modalidad, vehículos y conductores: calcula si está obligada,
  su nivel (básico, estándar o avanzado), qué criterio lo definió y si reporta a Supertransporte.
- **Activa solo los pasos que aplican**: 18, 22 o 24 de los 24 pasos, y deja los demás como "no aplica".
- **Relaciona cada paso con ISO 39001**, para que una misma evidencia sirva a las dos normas.
- **Aísla los datos de cada empresa** en PostgreSQL con Row Level Security.

## Estructura

```
apps/
  api/        API NestJS + PostgreSQL (Drizzle). Migraciones SQL en db/migrations
  web/        Aplicación React + Vite + Tailwind
packages/
  shared/     Catálogos normativos, motor de clasificación y esquemas Zod (compartidos por API y web)
docs/
  reglas-de-negocio.md
```

El catálogo normativo vive en `packages/shared/src/catalog` y es la única fuente de verdad: la base de datos se
siembra desde ahí y el frontend lo usa para calcular el nivel en vivo, con exactamente la misma lógica que la API.

## Requisitos

- Node.js 22 o superior y pnpm 10 (`corepack enable`)
- PostgreSQL 16, o Docker

## Arranque rápido con Docker

```bash
docker compose up --build
```

Abre http://localhost:8080. La API queda en http://localhost:3000/api.

## Desarrollo local

```bash
pnpm install
cp .env.example .env            # ajusta las URLs de la base de datos
export $(grep -v '^#' .env | xargs)

# Base de datos (rol dueño + base); en Docker: docker compose up db
createuser -s pesv_owner && createdb -O pesv_owner pesv   # o con psql

pnpm --filter @pesv/shared build
pnpm db:migrate                 # crea el rol pesv_app y aplica las migraciones
pnpm db:seed                    # siembra el catálogo normativo

pnpm dev                        # API en :3000 y web en :5173
```

## Pruebas

```bash
pnpm lint
pnpm typecheck
pnpm test        # motor de clasificación, API de punta a punta y asistente web
```

Las pruebas de la API necesitan una base migrada y sembrada, indicada con `DATABASE_URL` y `DATABASE_ADMIN_URL`
(apunta a una base de pruebas, por ejemplo `pesv_test`). Sin esas variables se omiten.

## API (Fase 0)

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/health` | Estado de la API y de la base de datos |
| GET | `/api/catalog/pesv?nivel=estandar` | Los 24 pasos, reglas de nivel y cláusulas ISO relacionadas |
| GET | `/api/catalog/iso39001` | Estructura de ISO 39001 y correspondencia con el PESV |
| GET | `/api/catalog/modalidades` | Modalidades y radios de acción |
| POST | `/api/classification/preview` | Calcula nivel y pasos aplicables sin guardar |
| POST | `/api/organizations` | Registra la organización, su clasificación y el estado inicial de los pasos |
| GET | `/api/organizations/:id` | Organización, clasificación vigente y resumen de cumplimiento |
| GET | `/api/organizations/:id/steps` | Estado de los 24 pasos |

Las rutas de una organización exigen el encabezado `x-organization-id`. **Es un mecanismo provisional de la
Fase 0**: en la Fase 1 se reemplaza por autenticación OIDC y verificación de membresía.

## Seguridad de los datos

- La API se conecta con el rol `pesv_app`, que no es dueño de las tablas, así que las políticas RLS siempre aplican.
- Cada petición abre una transacción y fija `app.current_org`; PostgreSQL solo deja ver y escribir filas de esa
  organización.
- El registro de auditoría solo admite inserciones, y las evidencias no se pueden borrar (se reemplazan por una
  nueva versión).

## Hoja de ruta

| Fase | Alcance |
| --- | --- |
| 0 · Cimientos | Monorepo, esquema multiempresa, catálogos PESV e ISO 39001, asistente de clasificación |
| 1 · MVP | Autenticación y roles, evidencias por paso, flota y conductores, preoperacional móvil, tablero, copiloto de IA, proveedor de IA configurable por el cliente |
| 2 · Operación | Mantenimiento, siniestros, comité con acta en vivo, plan anual, formularios de VIGIA 2, integración con n8n, OCR |
| 3 · Escala | Auditor simulado, predicción de riesgo, telemática GPS, web services de VIGIA 2, planes y facturación configurables |

## Notas normativas

- Los umbrales de nivel y la aplicabilidad de los pasos siguen la Resolución 40595 de 2022.
- De ISO 39001 solo se incluyen números y títulos de cláusula; los requisitos completos se cargan desde la copia
  licenciada de cada organización. La correspondencia PESV–ISO es una propuesta que debe validar un auditor.
- Las modalidades que no reportan a Supertransporte siguen el manual del módulo PESV de SINST-VIGIA 2.
