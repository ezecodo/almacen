#!/usr/bin/env bash
# Publica la vidriera: la presentación de OidoOps, con el "Acceder" que pregunta el grupo
# y manda a <grupo>.<dominio de la vidriera>. Se corre una sola vez, como root, en el VPS:
#
#   bash /root/almacen/deploy/vidriera.sh oidoops.ezeangeloni.xyz
#
# Es el mismo frontend de cualquier instalación, servido sin API: sin API detrás, la raíz
# muestra la presentación en vez de ir al acceso. Después cada deploy la mantiene al día.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

main() {
  local dominio="${1:-}"
  [ -n "$dominio" ] || morir "Uso: vidriera.sh <dominio>"
  [ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
  asegurar_registro
  instalaciones | awk '{print $6}' | grep -qx "$dominio" && morir "El dominio $dominio ya es el de una instalación: primero múdala con mover-dominio.sh"

  # Se copia el frontend ya publicado de la primera instalación del registro
  local origen
  origen=$(instalaciones | awk 'NR == 1 { print $5 }')
  [ -f "$origen/index.html" ] || morir "No encuentro un frontend publicado en $origen"
  mkdir -p "$WEB_VIDRIERA"
  cp -r "$origen"/* "$WEB_VIDRIERA"/

  cat > "$NGINX/sites-available/oidoops-vidriera" <<NGINX_SITIO
server {
    listen 80;
    server_name $dominio;

    # Sin API: así el frontend sabe que está en la vidriera y no en la instalación de un cliente
    location /api {
        return 404;
    }

    location / {
        root $WEB_VIDRIERA;
        try_files \$uri \$uri/ /index.html;
        location = /index.html {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
    }
}
NGINX_SITIO
  activar_sitio oidoops-vidriera

  echo
  if certificado "$dominio"; then
    echo "Vidriera publicada en https://$dominio"
  else
    echo "⚠️  Sitio creado pero sin certificado (¿el DNS de $dominio ya apunta acá?)."
    echo "   Cuando apunte:  certbot --nginx -d $dominio --redirect"
  fi
}

main "$@"
