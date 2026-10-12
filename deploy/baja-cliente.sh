#!/usr/bin/env bash
# Elimina por completo la instalación de un cliente: proceso, sitio de Nginx, certificado,
# BASE DE DATOS (con todos sus datos), código y frontend. No tiene vuelta atrás.
# A mano, como root, en el VPS:
#
#   bash /root/almacen/deploy/baja-cliente.sh <codigo> --borrar-todo
#
# Sirve también para limpiar un alta que quedó a medias: cada paso se salta si no hay nada.
# Nunca lo llama el instalador. La instalación original (/root/almacen) no se puede borrar con esto.

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

RAIZ="${OIDOOPS_RAIZ:-/root/oidoops}"
codigo="${1:-}"
[ "${2:-}" = "--borrar-todo" ] && [ -n "$codigo" ] || morir "Uso: baja-cliente.sh <codigo> --borrar-todo   (borra también su base de datos)"
[[ "$codigo" =~ ^[a-z][a-z0-9-]{1,29}$ ]] || morir "Identificador no válido"
[ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
asegurar_registro

carpeta="$RAIZ/$codigo" proceso="oidoops-$codigo" web="/var/www/oidoops-$codigo" base="oidoops_${codigo//-/_}"
linea=$(instalaciones | awk -v c="$codigo" '$1 == c')
dominio=$(awk '{print $6}' <<< "$linea")
[ -z "$linea" ] || [ "$(awk '{print $2}' <<< "$linea")" = "$carpeta" ] || morir "'$codigo' no es una instalación creada con alta-cliente.sh: no la toco"

echo "→ Proceso";      pm2 delete "$proceso" > /dev/null 2>&1 && pm2 save > /dev/null 2>&1 || echo "   (no había)"
echo "→ Nginx"
if [ -e "$NGINX/sites-enabled/oidoops-$codigo" ] || [ -e "$NGINX/sites-available/oidoops-$codigo" ]; then
  rm -f "$NGINX/sites-enabled/oidoops-$codigo" "$NGINX/sites-available/oidoops-$codigo"
  nginx -t && systemctl reload nginx
else echo "   (no había)"; fi
echo "→ Certificado";  [ -n "$dominio" ] && certbot delete --cert-name "$dominio" --non-interactive > /dev/null 2>&1 || echo "   (no había)"
echo "→ Base de datos"
runuser -u postgres -- psql -q -c "DROP DATABASE IF EXISTS \"$base\"" -c "DROP ROLE IF EXISTS \"$base\""
echo "→ Archivos";     rm -rf "$carpeta" "$web"
grep -vE "^$codigo " "$REGISTRO" > "$REGISTRO.tmp"; mv "$REGISTRO.tmp" "$REGISTRO"

echo
echo "Instalación '$codigo' eliminada."
