# PESV

Plataforma SaaS para gestionar el Plan Estratégico de Seguridad Vial (Resolución 40595 de 2022) e ISO 39001 en
organizaciones colombianas de cualquier misionalidad y tamaño, con inteligencia artificial elegida por cada cliente
e integración con n8n.

> Estado: **Fases 0 a 3 completas**. Gestión de los 24 pasos con evidencias, operación de flota, comité, siniestros,
> planificación, VIGIA 2, auditorías con auditor simulado de IA, puntaje de riesgo, telemática GPS, ISO 39001 y
> planes configurables desde un panel de la plataforma. Lista para producción en un VPS: recuperación de contraseña e
> invitaciones por correo, notificaciones por correo, registro de errores y despliegue con HTTPS y copias de seguridad
> ([guía de despliegue](docs/despliegue.md)).

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
- **Auditorías** (pasos 22 y 23): hallazgos por paso y cláusula ISO, acciones correctivas y verificación de eficacia;
  una no conformidad no se cierra con acciones abiertas. El **auditor simulado** de IA hace una preauditoría y la
  persona elige qué hallazgos registrar.
- **Puntaje de riesgo** de 0 a 100 por conductor y vehículo, con reglas fijas y cada punto explicado.
- **Telemática GPS**: recepción de viajes por token de API (directo o vía n8n), sin duplicados, con exceso de
  velocidad según la ruta y actualización del kilometraje.
- **ISO 39001**: cumplimiento por cláusula derivado del estado de los pasos del PESV.
- **Adopción voluntaria**: organizaciones no obligadas pueden implementar el nivel básico.
- **Planes y suscripciones** configurables desde el panel de la plataforma: límites, funciones, precio y días de
  prueba. Con mora la cuenta queda en solo lectura, sin perder acceso a la información.
- **Cuentas**: recuperación de contraseña por correo, invitaciones con enlace para crear la contraseña, cambio de
  contraseña y cierre de sesiones en otros dispositivos.
- **Correo**: notificaciones por evento a los roles que cada organización elija, con reintentos e historial.
- **Registro de errores**: errores de la API, la web y las tareas agrupados por causa, con código de solicitud y aviso
  por correo a los administradores de la plataforma.

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

## Producción

Para instalar en un servidor propio (VPS) con HTTPS automático, copias de seguridad diarias y monitoreo, sigue la
[guía de despliegue](docs/despliegue.md). En resumen:

```bash
sudo git clone https://github.com/gestiondecalidadysst-alt/PESV.git /opt/pesv && cd /opt/pesv
sudo ./deploy/instalar.sh
```

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

Para administrar planes y suscripciones, registra una cuenta y dale acceso a la plataforma:

```bash
pnpm --filter @pesv/api admin:plataforma tu-correo@empresa.co
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
| Autenticación | `POST /auth/registro`, `POST /auth/ingresar`, `POST /auth/salir`, `GET /auth/yo`, `POST /auth/recuperar`, `GET /auth/enlace`, `POST /auth/restablecer`, `POST /auth/cambiar-clave`, `POST /auth/cerrar-sesiones` |
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
| Auditorías | `GET/POST /org/auditorias`, `GET/PATCH /org/auditorias/:id`, `POST …/hallazgos`, `POST …/hallazgos/importar`, `POST …/cerrar`, `POST /org/auditorias/simulacro`, `POST /org/auditorias/hallazgos/:id/acciones`, `POST /org/auditorias/hallazgos/:id/cerrar` |
| Riesgo | `GET /org/riesgo/conductores`, `GET /org/riesgo/vehiculos` |
| ISO 39001 | `GET /org/tablero/iso` |
| Telemática | `POST /telematica/viajes` (token con alcance `telematica`) |
| Suscripción | `GET /org/suscripcion` |
| Notificaciones | `GET/PUT /org/notificaciones`, `GET /org/notificaciones/historial`, `POST /org/notificaciones/prueba` |
| Errores | `POST /errores/web` (público, con límite), `GET /plataforma/errores`, `GET/PATCH /plataforma/errores/:huella` |
| Plataforma | `/plataforma/planes`, `GET /plataforma/organizaciones`, `PUT /plataforma/organizaciones/:id/suscripcion`, `/plataforma/administradores` (solo administradores de la plataforma) |

Las funciones de IA, n8n, telemática, ISO 39001 y auditor simulado se habilitan según el plan de la organización;
sin plan asignado todas están disponibles. Con la suscripción en mora o cancelada solo se aceptan consultas (402 en
cualquier escritura).

## Seguridad de los datos

- La API se conecta con el rol `pesv_app`, que no es dueño de las tablas, así que las políticas RLS siempre aplican.
- Cada petición abre una transacción y fija `app.current_org`; PostgreSQL solo deja ver y escribir filas de esa
  organización.
- El registro de auditoría solo admite inserciones, y las evidencias no se pueden borrar (se reemplazan por una
  nueva versión).
- Las claves de IA y los secretos de webhooks se guardan cifrados (AES-256-GCM). Los tokens de API se guardan como
  hash y solo tienen los permisos de sus alcances; un token nunca hereda permisos de «cualquier miembro».

## Hoja de ruta

| Fase | Alcance | Estado |
| --- | --- | --- |
| 0 · Cimientos | Monorepo, esquema multiempresa con RLS, catálogos PESV e ISO 39001, asistente de clasificación | Completa |
| 1 · MVP | Autenticación y roles, evidencias por paso, flota y conductores, preoperacional sin conexión, tablero, copiloto e IA elegida por el cliente, n8n | Completa |
| 2 · Operación | Mantenimiento, siniestros, comité con acta en vivo y firmas, planificación, desplazamientos, VIGIA 2 | Completa |
| 3 · Escala | Auditorías y auditor simulado, puntaje de riesgo, telemática GPS, ISO 39001, adopción voluntaria, planes y suscripciones | Completa |

Pendiente, fuera del alcance actual:

- **Web services de VIGIA 2**: la carga directa requiere la autorización de Supertransporte y su especificación
  técnica oficial. Mientras tanto la plataforma genera los archivos para cargarlos manualmente.
- **Cobro en línea**: los planes y estados de suscripción se gestionan desde el panel; la pasarela de pagos se
  conectará cuando se definan los precios.
- **Requisitos completos de ISO 39001**: se cargan desde la copia licenciada de cada organización.

## Notas normativas

- Los umbrales de nivel y la aplicabilidad de los pasos siguen la Resolución 40595 de 2022.
- De ISO 39001 solo se incluyen números y títulos de cláusula; los requisitos completos se cargan desde la copia
  licenciada de cada organización. La correspondencia PESV–ISO es una propuesta que debe validar un auditor.
- Las modalidades que no reportan a Supertransporte siguen el manual del módulo PESV de SINST-VIGIA 2.
