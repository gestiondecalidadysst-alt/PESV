#!/usr/bin/env bash
# Instalación inicial en un VPS con Ubuntu o Debian. Ejecútalo desde la carpeta del repositorio:
#   sudo ./deploy/instalar.sh
# 1. Instala Docker si falta.  2. Crea deploy/.env con secretos aleatorios.  3. Arranca la plataforma.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
ENV="deploy/.env"

if [ "$(id -u)" -ne 0 ] && ! docker info >/dev/null 2>&1; then
  echo "Ejecútalo con sudo (o con un usuario del grupo docker)."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "Falta el complemento docker compose. Instálalo y vuelve a ejecutar."; exit 1; }

aleatorio() { openssl rand -base64 "$1" | tr -d '\n'; }
clave_simple() { openssl rand -hex "$1"; }

if [ -f "$ENV" ]; then
  echo "Ya existe $ENV; se conserva (los secretos no se deben cambiar)."
else
  cp deploy/env.ejemplo "$ENV"
  read -r -p "Dominio de la plataforma (ej. pesv.tuempresa.co): " dominio
  read -r -p "Correo para el certificado HTTPS: " acme
  read -r -p "Servidor SMTP (Enter para configurarlo después): " smtp
  sed -i "s|^DOMINIO=.*|DOMINIO=$dominio|; s|^ACME_EMAIL=.*|ACME_EMAIL=$acme|" "$ENV"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(clave_simple 24)|; s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$(clave_simple 24)|" "$ENV"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(aleatorio 48)|; s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(aleatorio 32)|" "$ENV"
  if [ -n "$smtp" ]; then
    read -r -p "Puerto SMTP [587]: " puerto
    read -r -p "Usuario SMTP: " usuario
    read -r -s -p "Contraseña SMTP: " clave; echo
    read -r -p "Remitente (ej. PESV <no-responder@$dominio>): " remitente
    puerto="${puerto:-587}"
    seguro=false; [ "$puerto" = "465" ] && seguro=true
    sed -i "s|^SMTP_HOST=.*|SMTP_HOST=$smtp|; s|^SMTP_PORT=.*|SMTP_PORT=$puerto|; s|^SMTP_SECURE=.*|SMTP_SECURE=$seguro|; s|^SMTP_USER=.*|SMTP_USER=$usuario|" "$ENV"
    # La contraseña puede tener símbolos: se escribe con printf para no interpretarlos.
    grep -v '^SMTP_PASS=' "$ENV" > "$ENV.tmp" && printf "SMTP_PASS='%s'\n" "$clave" >> "$ENV.tmp" && mv "$ENV.tmp" "$ENV"
    [ -n "$remitente" ] && sed -i "s|^MAIL_FROM=.*|MAIL_FROM=$remitente|" "$ENV"
  fi
  chmod 600 "$ENV"
  echo "Configuración guardada en $ENV. Guarda una copia segura de ese archivo fuera del servidor."
fi

mkdir -p respaldos
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
  echo "Firewall: abiertos los puertos 80 y 443."
fi

./deploy/pesv.sh iniciar
echo
echo "Siguiente paso: abre https://$(grep -E '^DOMINIO=' "$ENV" | cut -d= -f2-)/registro, crea tu cuenta y luego:"
echo "  ./deploy/pesv.sh admin tu-correo@empresa.co"
