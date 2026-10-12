#!/usr/bin/env bash
# Deja funcionando el instalador (runner.sh). Una sola vez, como root, en el VPS:
#
#   bash /root/almacen/deploy/instalar-runner.sh
#
# 1) Genera el secreto que comparten el instalador y el back-office, y lo guarda en los dos lados.
# 2) Cierra en Nginx las rutas /api/interno del back-office (solo se usan desde este servidor).
# 3) Programa runner.sh cada minuto en el cron de root.
# Se puede volver a correr: no cambia el secreto si ya existe.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

DOMINIO_BASE="${1:-oidoops.ezeangeloni.xyz}"
HQ=/home/eze/oido-talent
CONF=/root/oidoops/runner.env
SITIO="$NGINX/sites-available/oido-hq"

[ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
[ -f "$HQ/apps/api/.env" ] || morir "No encuentro el back-office en $HQ"
[ -f "$SITIO" ] || morir "No encuentro el sitio de Nginx del back-office ($SITIO)"
asegurar_registro

echo "→ Secreto compartido"
if [ ! -f "$CONF" ]; then
  ( umask 077; printf 'HQ_URL=http://127.0.0.1:3100\nRUNNER_TOKEN=%s\nDOMINIO_BASE=%s\n' "$(openssl rand -hex 32)" "$DOMINIO_BASE" > "$CONF" )
fi
# shellcheck disable=SC1090
source "$CONF"
sed -i '/^RUNNER_TOKEN=/d; /^SUITE_DOMINIO_BASE=/d' "$HQ/apps/api/.env"
printf 'RUNNER_TOKEN=%s\nSUITE_DOMINIO_BASE=%s\n' "$RUNNER_TOKEN" "$DOMINIO_BASE" >> "$HQ/apps/api/.env"
( cd "$HQ" && docker compose up -d --force-recreate api 2>&1 | tail -2 )

echo "→ Nginx: /api/interno cerrado al exterior"
if ! grep -q 'location /api/interno' "$SITIO"; then
  cp "$SITIO" "$SITIO.antes-del-runner"
  sed -i 's|^\(\s*\)location /api {|\1location /api/interno { return 404; }\n\n\1location /api {|' "$SITIO"
  if ! nginx -t; then
    cp "$SITIO.antes-del-runner" "$SITIO"
    morir "La configuración de Nginx no quedó válida; la dejé como estaba"
  fi
  systemctl reload nginx
fi

echo "→ Cron"
( crontab -l 2>/dev/null | grep -v 'deploy/runner.sh' || true
  echo "* * * * * flock -n /root/oidoops/runner.lock bash /root/almacen/deploy/runner.sh >> /root/oidoops/runner.log 2>&1" ) | crontab -

echo
echo "Instalador en marcha. Consulta cada minuto; su registro está en /root/oidoops/runner.log"
