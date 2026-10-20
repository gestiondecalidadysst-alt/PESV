#!/bin/sh
# Copias de seguridad diarias de la base de datos y de los archivos subidos (evidencias, actas,
# reportes). Corre dentro del contenedor «respaldos». Uso manual: sh /respaldo.sh ahora
#
# Variables: RESPALDO_HORA (HH:MM, hora local), RESPALDO_DIAS (días que se conservan) y
# RESPALDO_AVISO_URL (opcional: URL que se llama tras cada copia exitosa, por ejemplo un
# monitor «push» de Uptime Kuma, para enterarte si un día no se hizo).
set -eu

DESTINO="${RESPALDO_DESTINO:-/respaldos}"
ARCHIVOS="${RESPALDO_ARCHIVOS:-/archivos}"
HORA="${RESPALDO_HORA:-02:30}"
DIAS="${RESPALDO_DIAS:-14}"

registrar() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') respaldos: $*"; }

respaldar() {
  marca="$(date +%Y%m%d-%H%M)"
  mkdir -p "$DESTINO"
  pg_dump --format=custom --file="$DESTINO/pesv-$marca.dump.parcial"
  mv "$DESTINO/pesv-$marca.dump.parcial" "$DESTINO/pesv-$marca.dump"
  if [ -d "$ARCHIVOS" ]; then
    tar -czf "$DESTINO/archivos-$marca.tar.gz.parcial" -C "$ARCHIVOS" .
    mv "$DESTINO/archivos-$marca.tar.gz.parcial" "$DESTINO/archivos-$marca.tar.gz"
  fi
  find "$DESTINO" -maxdepth 1 \( -name 'pesv-*.dump' -o -name 'archivos-*.tar.gz' \) -mtime +"$DIAS" -delete
  find "$DESTINO" -maxdepth 1 -name '*.parcial' -delete
  registrar "copia $marca lista ($(du -sh "$DESTINO" | cut -f1) en total)"
  if [ -n "${RESPALDO_AVISO_URL:-}" ]; then wget -q -O /dev/null "$RESPALDO_AVISO_URL" || registrar "no se pudo avisar a $RESPALDO_AVISO_URL"; fi
}

if [ "${1:-}" = "ahora" ]; then
  respaldar
  exit 0
fi

registrar "copias diarias a las $HORA, se conservan $DIAS días"
while true; do
  ahora="$(date +%s)"
  objetivo="$(date -d "$(date +%Y-%m-%d) $HORA" +%s)"
  if [ "$objetivo" -le "$ahora" ]; then objetivo=$((objetivo + 86400)); fi
  sleep $((objetivo - ahora))
  respaldar || registrar "ERROR: la copia de seguridad falló"
done
