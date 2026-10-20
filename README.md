# PESV

Plataforma SaaS para gestionar el Plan Estratégico de Seguridad Vial (Resolución 40595 de 2022) e ISO 39001 en
organizaciones colombianas de cualquier misionalidad y tamaño, con inteligencia artificial elegida por cada cliente
e integración con n8n.

> Estado: **Fase 2 completa**. Sobre el MVP (cuentas y roles, evidencias, flota, preoperacional sin conexión, IA
> elegida por el cliente, n8n) se suman mantenimiento, siniestros con investigación, comité con acta en vivo y firmas,
> planificación, desplazamientos y formularios de VIGIA 2. Ver [Hoja de ruta](#hoja-de-ruta).

## Qué hace hoy

- **Clasifica la organización** según misionalidad, modalidad, vehículos y conductores: calcula si está obligada,
  su nivel (básico, estándar o avanzado), qué criterio lo definió y si reporta a Supertransporte.
- **Activa solo los pasos que aplican**: 18, 22 o 24 de los 24 pasos, y deja los demás como "no aplica".
- **Relaciona cada paso con ISO 39001**, para que una misma evidencia sirva a las dos normas.
- **Aísla los datos de cada empresa** en PostgreSQL con Row Level Security.
- **Mantenimiento**: planes preventivos por kilometraje o tiempo (lo que ocurra primero) y órdenes de trabajo; cada
  falla del preoperacional abre una orden correctiva y el vehículo vuelve a "apto" al cerrarla.
- **Siniestros** con los datos del registro oficial, nivel según víctimas, investigación interna obligatoria en
  estándar y avanzado, borrador de causas con IA y acciones correctivas.
- **Comité de seguridad vial**: agenda sugerida con los pendientes, modo reunión con asistencia, notas por punto que
  se guardan solas, decisiones con votación y quórum, compromisos, borrador del acta con IA, PDF como evidencia del
  paso 2 y firma de cada asistente con su contraseña.
- **Planificación**: matriz de riesgos 5×5 con riesgo residual, metas, plan anual y capacitaciones con asistencia.
- **Desplazamientos**: rutas con límite de velocidad y viajes que no se asignan con documentos vencidos.
- **VIGIA 2**: calendario de plazos, indicadores de los formularios A–D, datos faltantes y archivo Excel para cargar.

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

## API

Rutas públicas: `/api/health`, `/api/catalog/*`, `/api/classification/preview`, `/api/auth/registro`,
`/api/auth/ingresar`. El resto exige sesión (cookie `pesv_sesion`, httpOnly) o un token de API (`Bearer pesv_…`),
y las rutas `/api/org/*` trabajan sobre la organización del encabezado `x-organization-id`, verificando la
membresía y el permiso del rol.

| Módulo | Rutas principales |
| --- | --- |
| Autenticación | `POST /auth/registro`, `POST /auth/ingresar`, `POST /auth/salir`, `GET /auth/yo` |
| Organización | `GET /org`, `GET /org/pasos`, `PATCH /org/pasos/:n`, `GET/POST /org/reclasificacion`, `POST /organizations` |
| Miembros | `GET/POST /org/miembros`, `DELETE /org/miembros/:id` |
| Evidencias | `GET/POST /org/evidencias`, `POST /org/evidencias/:id/decision`, `GET /org/evidencias/:id/archivo` |
| Flota | `GET/POST/PATCH /org/vehiculos`, `GET/POST/PATCH /org/conductores`, `GET /org/alertas` |
| Preoperacional | `GET /org/inspecciones/plantilla/:vehiculo`, `POST /org/inspecciones`, `GET /org/inspecciones` |
| Tablero | `GET /org/tablero` |
| IA | `GET/PUT /org/ia/config`, `POST /org/ia/probar`, `POST /org/ia/copiloto`, `POST /org/ia/redactar`, `POST /org/ia/diagnostico`, `POST /org/ia/lector` |
| Integraciones | `/org/integraciones/webhooks`, `/org/integraciones/tokens`, `GET /org/integraciones/entregas` |
| Mantenimiento | `/org/mantenimiento/planes`, `/org/mantenimiento/ordenes`, `POST /org/mantenimiento/ordenes/:id/cerrar` |
| Siniestros | `GET/POST /org/siniestros`, `PATCH /org/siniestros/:id/investigacion`, `POST /org/siniestros/:id/acciones`, `POST /org/siniestros/:id/borrador-ia` |
| Comité | `/org/comite/miembros`, `GET /org/comite/agenda-sugerida`, `/org/comite/reuniones/:id` (`iniciar`, `puntos`, `asistencia`, `llegada`, `decisiones`, `compromisos`, `transcripcion`, `borrador-acta`, `cerrar`, `firmar`, `acta`) |
| Acciones | `GET/POST /org/acciones`, `POST /org/acciones/:id/cerrar` |
| Planificación | `/org/riesgos`, `/org/metas`, `/org/plan`, `/org/capacitaciones`, `PUT /org/capacitaciones/:id/asistentes` |
| Desplazamientos | `/org/rutas`, `GET/POST /org/viajes`, `POST /org/viajes/:id/terminar` |
| VIGIA 2 | `GET /org/vigia/calendario`, `GET /org/vigia/:formulario/:periodo`, `POST …/generar`, `POST …/enviado`, `GET …/archivo` |

### Fase 0 (referencia)

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
