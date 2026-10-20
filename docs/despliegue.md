# Despliegue en un VPS

Guía para instalar la plataforma en un servidor propio (VPS) con Docker. Todo corre en el mismo servidor: base de
datos PostgreSQL, API, aplicación web, Caddy (HTTPS automático) y copias de seguridad diarias.

## Qué necesitas

| Recurso | Mínimo | Recomendado |
| --- | --- | --- |
| Sistema operativo | Ubuntu 22.04 o Debian 12 | Ubuntu 24.04 LTS |
| CPU y memoria | 2 vCPU, 2 GB de RAM | 2 vCPU, 4 GB de RAM |
| Disco | 30 GB | 60 GB o más (evidencias y copias de seguridad) |
| Red | IP pública con los puertos 80 y 443 abiertos | |

Además:

- **Un dominio o subdominio** (por ejemplo `pesv.tuempresa.co`) con un registro **A** que apunte a la IP del servidor.
  Para probar sin dominio propio puedes usar `203-0-113-10.sslip.io` (cambia por tu IP con guiones): apunta solo a
  esa IP y permite obtener el certificado HTTPS.
- **Una cuenta de correo SMTP** para enviar recuperaciones de contraseña, invitaciones y alertas (Google Workspace,
  Zoho, Brevo, Amazon SES u otro). Sin ella la plataforma funciona, pero no envía correos.

## Instalación

Conéctate al servidor por SSH y ejecuta:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/gestiondecalidadysst-alt/PESV.git /opt/pesv
cd /opt/pesv
sudo ./deploy/instalar.sh
```

Si el repositorio es **privado**, crea en el servidor una llave (`ssh-keygen -t ed25519`), agrégala en GitHub ›
Settings › Deploy keys (solo lectura) y clona con `git clone git@github.com:gestiondecalidadysst-alt/PESV.git /opt/pesv`.

El instalador:

1. Instala Docker si no está.
2. Pregunta el dominio, el correo para el certificado y, si quieres, los datos SMTP.
3. Crea `deploy/.env` con contraseñas y claves aleatorias (permisos 600).
4. Abre los puertos 80 y 443 si el firewall `ufw` está activo.
5. Construye las imágenes, aplica las migraciones y arranca todo.

Cuando termine, abre `https://tu-dominio/registro`, crea tu cuenta y dale acceso al panel de la plataforma:

```bash
sudo ./deploy/pesv.sh admin tu-correo@empresa.co
```

> **Guarda una copia de `deploy/.env` fuera del servidor** (en un gestor de contraseñas). Contiene la clave que cifra
> las credenciales de IA y los secretos de los webhooks: si se pierde, hay que volver a escribirlas.

## Operación diaria

Todos los comandos se ejecutan desde `/opt/pesv`:

| Comando | Para qué |
| --- | --- |
| `./deploy/pesv.sh estado` | Ver los servicios y si la plataforma responde |
| `./deploy/pesv.sh actualizar` | Descargar la última versión, migrar y reiniciar |
| `./deploy/pesv.sh registros api` | Seguir los registros de la API (también `web`, `caddy`, `db`, `respaldos`) |
| `./deploy/pesv.sh errores` | Últimos errores en los registros de la API |
| `./deploy/pesv.sh respaldo` | Hacer una copia de seguridad ahora |
| `./deploy/pesv.sh respaldos` | Listar las copias guardadas |
| `./deploy/pesv.sh restaurar respaldos/pesv-AAAAMMDD-HHMM.dump [respaldos/archivos-….tar.gz]` | Restaurar una copia |
| `./deploy/pesv.sh probar-correo tu@correo.co` | Probar la configuración SMTP |
| `./deploy/pesv.sh monitoreo` | Arrancar Uptime Kuma (monitoreo de disponibilidad) |

Los servicios se reinician solos si fallan o si el servidor se reinicia.

## Correo

Configura el SMTP en `deploy/.env` y aplica con `./deploy/pesv.sh iniciar`. Valores habituales:

| Proveedor | SMTP_HOST | SMTP_PORT | SMTP_SECURE | Nota |
| --- | --- | --- | --- | --- |
| Google Workspace / Gmail | smtp.gmail.com | 587 | false | Usa una contraseña de aplicación (requiere verificación en dos pasos) |
| Zoho Mail | smtp.zoho.com | 465 | true | |
| Brevo | smtp-relay.brevo.com | 587 | false | Plan gratuito con límite diario |
| Amazon SES | email-smtp.us-east-1.amazonaws.com | 587 | false | Requiere verificar el dominio |

Para que los correos no lleguen a spam, configura en el DNS del dominio del remitente los registros **SPF**, **DKIM**
y **DMARC** que indique tu proveedor.

La plataforma envía:

- Enlaces de recuperación de contraseña (vencen en 1 hora, un solo uso).
- Invitaciones a miembros nuevos para crear su contraseña (vencen en 7 días). Sin SMTP, la pantalla de Miembros
  muestra el enlace para compartirlo por otro medio.
- Aviso de cambio de contraseña.
- Alertas por evento (documentos por vencer, fallas en preoperacionales, siniestros, reuniones del comité…), según
  lo que cada organización configure en **Configuración › Notificaciones por correo**. Los envíos fallidos se
  reintentan hasta 5 veces.
- Avisos de errores nuevos a los administradores de la plataforma.

## Registro de errores y monitoreo

- **Panel de la plataforma › Errores**: errores inesperados de la API, de la aplicación web (pantallas que fallan)
  y de las tareas programadas, agrupados por causa, con la pila, la ruta, el código de solicitud y el navegador.
  Los administradores de la plataforma reciben un correo cuando aparece un error nuevo o vuelve uno resuelto (como
  máximo uno por hora por error). Las ocurrencias se guardan 30 días.
- **Código de solicitud**: cada respuesta de la API lleva el encabezado `x-request-id`. Si una persona reporta un
  error, el mensaje en pantalla incluye ese código; búscalo en el panel o con
  `./deploy/pesv.sh registros api | grep <código>`.
- **Registros**: la API escribe una línea JSON por evento y por solicitud. Docker los rota (5 archivos de 10 MB por
  servicio). Caddy registra los accesos sin cookies, encabezados de autorización ni tokens de enlaces.
- **Disponibilidad**: `./deploy/pesv.sh monitoreo` arranca Uptime Kuma, que solo escucha dentro del servidor.
  Ábrelo con un túnel SSH (`ssh -L 3001:localhost:3001 usuario@servidor` y luego `http://localhost:3001`) y crea:
  - Un monitor **HTTP** a `https://tu-dominio/api/health` (responde `{"estado":"ok"}` si la API y la base de datos
    están bien).
  - Un monitor **Push** y pon su URL en `RESPALDO_AVISO_URL` de `deploy/.env`: te avisa si un día no se hizo la
    copia de seguridad.
  - Las notificaciones que prefieras (correo, Telegram, WhatsApp…).

## Copias de seguridad

El servicio `respaldos` hace cada día, a la hora de `RESPALDO_HORA`:

- `respaldos/pesv-AAAAMMDD-HHMM.dump`: la base de datos completa (formato de `pg_dump`).
- `respaldos/archivos-AAAAMMDD-HHMM.tar.gz`: evidencias, actas y reportes subidos.

Conserva `RESPALDO_DIAS` días (14 por defecto). **Copia la carpeta `respaldos/` fuera del servidor** con
regularidad (por ejemplo con `rclone` a un almacenamiento en la nube o con `rsync` a otro equipo): si el servidor se
pierde, las copias que están en él también.

Para restaurar:

```bash
./deploy/pesv.sh restaurar respaldos/pesv-20261020-0230.dump respaldos/archivos-20261020-0230.tar.gz
```

Antes de restaurar se hace una copia del estado actual por si hay que deshacer.

## Actualizaciones

Manual: `./deploy/pesv.sh actualizar`.

Automática desde GitHub: el flujo **Desplegar** (`.github/workflows/desplegar.yml`) se conecta por SSH al servidor y
ejecuta la actualización. Configúralo en GitHub › Settings:

1. Crea en el servidor un usuario para despliegues con acceso a Docker y dueño de la carpeta, y una llave SSH para él:
   ```bash
   sudo adduser --disabled-password despliegue
   sudo usermod -aG docker despliegue
   sudo chown -R despliegue:despliegue /opt/pesv
   ```
   Agrega la llave pública en `/home/despliegue/.ssh/authorized_keys`.
2. En **Secrets and variables › Actions › Secrets** agrega:
   - `VPS_HOST`: IP o dominio del servidor.
   - `VPS_USUARIO`: usuario SSH.
   - `VPS_CLAVE_SSH`: llave privada SSH (completa).
   - `VPS_HUELLA`: la línea de `ssh-keyscan tu-servidor` (verifica la identidad del servidor).
   - `VPS_RUTA` (opcional): carpeta del repositorio; por defecto `/opt/pesv`.
3. Para desplegar cada vez que el CI pasa en `main`, crea la variable `DESPLIEGUE_AUTOMATICO` con el valor `true`.
   Sin ella, el despliegue se lanza a mano desde la pestaña Actions.

## Seguridad

- Solo los puertos 80 y 443 quedan expuestos; la base de datos y la API no se publican fuera de Docker.
- HTTPS con renovación automática, HSTS, y encabezados `X-Frame-Options`, `X-Content-Type-Options` y
  `Referrer-Policy: no-referrer`.
- Cookies de sesión `HttpOnly`, `Secure` y `SameSite=Lax`. Cambiar la contraseña cierra las demás sesiones.
- Límite de intentos para ingresar (10 cada 15 minutos por correo e IP) y para recuperar la contraseña (5 cada 15
  minutos por IP).
- Recomendado en el servidor: acceso SSH solo con llave, `ufw` activo y actualizaciones automáticas de seguridad
  (`sudo apt-get install unattended-upgrades`).
