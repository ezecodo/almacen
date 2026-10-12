#!/usr/bin/env bash
# Cambia la dirección de una instalación que ya existe. Como root, en el VPS:
#
#   bash /root/almacen/deploy/mover-dominio.sh sensi sensi.oidoops.ezeangeloni.xyz
#
# Crea el sitio de Nginx de la dirección nueva con su certificado, actualiza FRONTEND_URL en el
# .env de esa instalación, reinicia su proceso y corrige el registro. Solo cuando la dirección
# nueva ya tiene certificado desactiva el sitio de la vieja (el archivo queda en sites-available).
# No toca código, base de datos ni datos.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

main() {
  local codigo="${1:-}" nuevo="${2:-}"
  [ -n "$codigo" ] && [ -n "$nuevo" ] || morir "Uso: mover-dominio.sh <codigo> <dominio-nuevo>"
  [[ "$nuevo" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || morir "Dominio no válido: $nuevo"
  [ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
  asegurar_registro

  local linea carpeta proceso puerto web viejo
  linea=$(instalaciones | awk -v c="$codigo" '$1 == c')
  [ -n "$linea" ] || morir "No hay ninguna instalación '$codigo' en $REGISTRO"
  read -r _ carpeta proceso puerto web viejo <<< "$linea"
  [ "$viejo" != "$nuevo" ] || morir "'$codigo' ya está en $nuevo"
  instalaciones | awk '{print $6}' | grep -qx "$nuevo" && morir "El dominio $nuevo ya lo usa otra instalación"
  [ -e "$NGINX/sites-available/oidoops-$codigo" ] && [ "$(grep -c "server_name $viejo;" "$NGINX/sites-available/oidoops-$codigo")" -gt 0 ] \
    && morir "El sitio oidoops-$codigo ya existe y es el de la dirección vieja: renómbralo a mano antes de seguir"

  echo "→ Sitio de Nginx para $nuevo"
  escribir_sitio "oidoops-$codigo" "$nuevo" "$puerto" "$web"
  activar_sitio "oidoops-$codigo"

  if ! certificado "$nuevo"; then
    echo
    echo "⚠️  No se pudo sacar el certificado de $nuevo (¿su DNS ya apunta acá?)."
    echo "   No cambié nada más: '$codigo' sigue funcionando en $viejo."
    echo "   Cuando el DNS apunte, vuelve a correr este mismo comando."
    exit 1
  fi

  echo "→ Configuración y registro"
  local env="$carpeta/apps/api/.env"
  if grep -q '^FRONTEND_URL=' "$env"; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=\"https://$nuevo\"|" "$env"
  else
    echo "FRONTEND_URL=\"https://$nuevo\"" >> "$env"
  fi
  pm2 restart "$proceso" --update-env
  awk -v c="$codigo" -v d="$nuevo" '$1 == c { $6 = d } { print }' "$REGISTRO" > "$REGISTRO.tmp" && mv "$REGISTRO.tmp" "$REGISTRO"

  echo "→ Desactivando la dirección vieja ($viejo)"
  local sitio
  for sitio in "$NGINX"/sites-enabled/*; do
    [ "$(basename "$sitio")" = "oidoops-$codigo" ] && continue
    if grep -qE "server_name[[:space:]]+$viejo;" "$sitio"; then
      rm -f "$sitio"
      echo "   desactivado: $(basename "$sitio") (el archivo sigue en sites-available)"
    fi
  done
  nginx -t && systemctl reload nginx

  echo
  echo "'$codigo' ahora está en https://$nuevo"
  echo "Falta, a mano: actualizar la dirección en la ficha del cliente del back-office."
}

main "$@"
