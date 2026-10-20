#!/usr/bin/env bash
# Administración de la plataforma PESV en el servidor. Ejecútalo desde la carpeta del repositorio:
#   ./deploy/pesv.sh <comando>
#
# Comandos:
#   iniciar               Construye las imágenes y arranca todo (también tras reiniciar el servidor).
#   actualizar            Descarga la última versión de GitHub, aplica migraciones y reinicia.
#   estado                Muestra los servicios y si la plataforma responde.
#   registros [servicio]  Sigue los registros (api, web, caddy, db, respaldos). Ctrl+C para salir.
#   errores               Últimos errores de la API en los registros.
#   respaldo              Hace una copia de seguridad ahora mismo.
#   respaldos             Lista las copias de seguridad guardadas.
#   restaurar <copia.dump> [archivos.tar.gz]
#                         Restaura la base de datos (y los archivos) desde una copia. ¡Reemplaza los datos actuales!
#   admin <correo>        Da acceso al panel de la plataforma a una cuenta ya registrada.
#   probar-correo <correo>  Envía un correo de prueba con la configuración SMTP de deploy/.env.
#   monitoreo             Arranca Uptime Kuma (monitoreo de disponibilidad) en el puerto 3001 local.
#   detener               Detiene todos los servicios (los datos se conservan).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
ENV="deploy/.env"
dc() { docker compose -f docker-compose.prod.yml --env-file "$ENV" "$@"; }

[ -f "$ENV" ] || { echo "Falta $ENV. Ejecuta primero ./deploy/instalar.sh"; exit 1; }
DOMINIO="$(grep -E '^DOMINIO=' "$ENV" | cut -d= -f2-)"

esperar() {
  echo "Esperando a que la API responda…"
  for _ in $(seq 1 60); do
    if dc exec -T api node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      echo "Listo: https://$DOMINIO"
      return 0
    fi
    sleep 3
  done
  echo "La API no respondió a tiempo. Revisa: ./deploy/pesv.sh registros api"
  return 1
}

comando="${1:-ayuda}"
shift || true
case "$comando" in
  iniciar)
    dc build
    dc up -d --remove-orphans
    esperar
    ;;
  actualizar)
    git pull --ff-only
    dc build
    dc up -d --remove-orphans
    esperar
    docker image prune -f >/dev/null
    ;;
  estado)
    dc ps
    if curl -fsS --max-time 10 "https://$DOMINIO/api/health"; then echo; else echo "No responde https://$DOMINIO/api/health"; fi
    ;;
  registros)
    dc logs -f --tail 200 "$@"
    ;;
  errores)
    dc logs --no-log-prefix --tail 2000 api | grep -E '"nivel":"(error|fatal)"' | tail -n 30 || echo "Sin errores recientes en los registros de la API."
    ;;
  respaldo)
    dc exec -T respaldos sh /respaldo.sh ahora
    ;;
  respaldos)
    ls -lh respaldos/ 2>/dev/null || echo "Aún no hay copias en ./respaldos"
    ;;
  restaurar)
    copia="${1:?Indica el archivo .dump, por ejemplo respaldos/pesv-20261020-0230.dump}"
    archivos="${2:-}"
    [ -f "$copia" ] || { echo "No existe $copia"; exit 1; }
    read -r -p "Esto REEMPLAZA los datos actuales por los de $copia. Escribe RESTAURAR para continuar: " ok
    [ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
    echo "Haciendo una copia de seguridad del estado actual por si acaso…"
    dc exec -T respaldos sh /respaldo.sh ahora
    dc stop api caddy
    dc exec -T db pg_restore --clean --if-exists --no-owner --role=pesv_owner -U pesv_owner -d pesv < "$copia"
    if [ -n "$archivos" ]; then
      [ -f "$archivos" ] || { echo "No existe $archivos"; exit 1; }
      dc run --rm -T --no-deps --entrypoint sh -v "$RAIZ/$(dirname "$archivos"):/origen:ro" -v pesv_archivos:/data/storage api \
        -c "find /data/storage -mindepth 1 -delete && tar -xzf /origen/$(basename "$archivos") -C /data/storage"
    fi
    dc up -d
    esperar
    ;;
  admin)
    correo="${1:?Indica el correo de la cuenta}"
    dc run --rm migrar node scripts/admin-plataforma.mjs "$correo"
    ;;
  probar-correo)
    correo="${1:?Indica el correo de destino}"
    dc exec -T -e PARA="$correo" api node -e "
      const n = require('nodemailer');
      const t = n.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
      if (!process.env.SMTP_HOST) { console.error('SMTP_HOST está vacío en deploy/.env'); process.exit(1); }
      t.sendMail({ from: process.env.MAIL_FROM, to: process.env.PARA, subject: 'Prueba de correo PESV', text: 'El correo de la plataforma funciona.' })
        .then(i => console.log('Enviado:', i.messageId)).catch(e => { console.error('Error:', e.message); process.exit(1); });"
    ;;
  monitoreo)
    dc --profile monitoreo up -d monitoreo
    echo "Uptime Kuma escucha en el puerto 3001 del servidor. Ábrelo con un túnel SSH desde tu equipo:"
    echo "  ssh -L 3001:localhost:3001 usuario@tu-servidor   y luego  http://localhost:3001"
    echo "Crea un monitor HTTP para https://$DOMINIO/api/health."
    ;;
  detener)
    dc down
    ;;
  *)
    sed -n '2,24p' "$0"
    ;;
esac
