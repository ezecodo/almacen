# Compartido por actualizar.sh y alta-cliente.sh. Se carga con `source`, no se ejecuta.
#
# Cada cliente de la suite es una instalación completa: su propio clon de este repo,
# su base de datos, su proceso PM2 y su dirección. El registro dice cuáles existen.
# Una línea por instalación, seis campos separados por espacios:
#
#   codigo  carpeta  proceso_pm2  puerto  carpeta_web  dominio
#
# `codigo` es el identificador del cliente en el back-office (oido-talent → /admin → Suite OidoOps).

REGISTRO="${OIDOOPS_REGISTRO:-/root/oidoops/instalaciones}"
# La vidriera (presentación del producto) es el mismo frontend servido sin API detrás
WEB_VIDRIERA="${OIDOOPS_WEB_VIDRIERA:-/var/www/oidoops-vidriera}"
NGINX="${OIDOOPS_NGINX:-/etc/nginx}"

morir() { echo "✗ $*" >&2; exit 1; }

# La primera vez no hay registro: se crea con la instalación que ya existía (Sensi),
# apuntando a donde vive hoy. No se mueve ni se renombra nada suyo.
asegurar_registro() {
  [ -f "$REGISTRO" ] && return 0
  mkdir -p "$(dirname "$REGISTRO")"
  {
    echo "# codigo carpeta proceso_pm2 puerto carpeta_web dominio"
    echo "sensi /root/almacen almacen-api 3001 /var/www/almacen almacen.ezeangeloni.xyz"
  } > "$REGISTRO"
  echo "→ Registro de instalaciones creado en $REGISTRO"
}

# Líneas útiles del registro (sin comentarios ni vacías)
instalaciones() {
  grep -vE '^[[:space:]]*(#|$)' "$REGISTRO" || true
}

# Sitio de Nginx de una instalación: la dirección del cliente → su frontend y su API.
#   escribir_sitio <nombre-del-sitio> <dominio> <puerto> <carpeta_web>
escribir_sitio() {
  cat > "$NGINX/sites-available/$1" <<NGINX_SITIO
server {
    listen 80;
    server_name $2;

    location /api {
        proxy_pass http://127.0.0.1:$3;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        root $4;
        try_files \$uri \$uri/ /index.html;
        # index.html nunca se cachea
        location = /index.html {
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
    }
}
NGINX_SITIO
}

# Activa un sitio ya escrito. Si la configuración no es válida lo desactiva y corta,
# para no dejar a Nginx sin poder recargar (afectaría a todos los sitios del servidor).
activar_sitio() {
  ln -sfn "$NGINX/sites-available/$1" "$NGINX/sites-enabled/$1"
  if ! nginx -t; then
    rm -f "$NGINX/sites-enabled/$1"
    morir "La configuración de Nginx no es válida; desactivé el sitio $1. Revisar $NGINX/sites-available/$1"
  fi
  systemctl reload nginx
}

# Devuelve 0 si consiguió el certificado
certificado() {
  certbot --nginx -d "$1" --non-interactive --redirect
}
