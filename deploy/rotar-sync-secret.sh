#!/usr/bin/env bash
# Cambia el secreto de la tarea que revisa las reviews de Google por uno largo y aleatorio.
# Lo cambia a la vez en el .env de la instalación y en el cron de root. Una vez, como root:
#
#   bash /root/almacen/deploy/rotar-sync-secret.sh
#
# Vale para la instalación que tiene esa tarea programada (hoy solo la primera del registro).

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
[ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
asegurar_registro

read -r _codigo carpeta proceso puerto _resto < <(instalaciones | head -1)
crontab -l 2>/dev/null | grep -q "localhost:$puerto/api/reviews/sync" || morir "No encuentro la tarea de reviews en el cron de root"

nuevo=$(openssl rand -hex 32)
poner_env "$carpeta/apps/api/.env" SYNC_SECRET "$nuevo" || true
crontab -l | sed -E "s|(localhost:$puerto/api/reviews/sync -H \"Authorization: Bearer )[^\"]*\"|\1$nuevo\"|" | crontab -
pm2 restart "$proceso" --update-env > /dev/null

sleep 3
codigo=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "http://localhost:$puerto/api/reviews/sync" -H "Authorization: Bearer $nuevo")
viejo=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "http://localhost:$puerto/api/reviews/sync" -H "Authorization: Bearer sync-secret-2026")
echo "Secreto cambiado. Con el nuevo responde $codigo (200 = bien); con el viejo, $viejo (401 = bien)."
