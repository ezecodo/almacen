#!/usr/bin/env bash
# Da de alta un cliente nuevo de la suite: una instalación completa de OidoOps para él.
# Se corre a mano, como root, en el VPS:
#
#   bash /root/almacen/deploy/alta-cliente.sh <codigo> <dominio>
#   bash /root/almacen/deploy/alta-cliente.sh bodega bodega.oidoops.ezeangeloni.xyz
#
# <codigo>  el identificador del cliente en el back-office (minúsculas, números y guiones)
# <dominio> la dirección donde va a entrar; su DNS ya tiene que apuntar a este servidor
#
# Crea: base de datos y usuario propios, clon del repo en /root/oidoops/<codigo>, .env con
# secretos y PIN nuevos, proceso PM2 oidoops-<codigo> en un puerto libre, sitio de Nginx y
# certificado. No toca ninguna otra instalación. La base arranca vacía.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

# De acá se copian los datos del broker MQTT de las Pi (hoy lo comparten todas las instalaciones)
ENV_REFERENCIA="${OIDOOPS_ENV_REFERENCIA:-/root/almacen/apps/api/.env}"
REPO_REFERENCIA="${OIDOOPS_REPO_REFERENCIA:-/root/almacen}"
RAIZ="${OIDOOPS_RAIZ:-/root/oidoops}"
PRIMER_PUERTO=3101

sql() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -tAc "$1"; }

main() {
  local codigo="${1:-}" dominio="${2:-}"
  [ -n "$codigo" ] && [ -n "$dominio" ] || morir "Uso: alta-cliente.sh <codigo> <dominio>"
  [[ "$codigo" =~ ^[a-z][a-z0-9-]{1,29}$ ]] || morir "Identificador no válido: 2 a 30 caracteres, minúsculas, números y guiones, empezando por letra"
  [[ "$dominio" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || morir "Dominio no válido: $dominio"
  [ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
  case "$codigo" in hq|www|api|admin|app|mail|oido|oidoops|talent) morir "El identificador '$codigo' está reservado" ;; esac

  local carpeta="$RAIZ/$codigo" proceso="oidoops-$codigo" web="/var/www/oidoops-$codigo"
  local base="oidoops_${codigo//-/_}" sitio="$NGINX/sites-available/oidoops-$codigo"

  # Nada de esto puede existir ya: si algo quedó a medias de un intento anterior, se limpia a mano
  asegurar_registro
  instalaciones | awk '{print $1}' | grep -qx "$codigo" && morir "Ya hay una instalación '$codigo' en $REGISTRO"
  instalaciones | awk '{print $6}' | grep -qx "$dominio" && morir "El dominio $dominio ya lo usa otra instalación"
  [ -e "$carpeta" ] && morir "Ya existe $carpeta"
  [ -e "$sitio" ] && morir "Ya existe $sitio"
  [ -n "$(sql "SELECT 1 FROM pg_database WHERE datname='$base'")" ] && morir "Ya existe la base $base"
  [ -n "$(sql "SELECT 1 FROM pg_roles WHERE rolname='$base'")" ] && morir "Ya existe el usuario de Postgres $base"
  pm2 describe "$proceso" > /dev/null 2>&1 && morir "Ya existe el proceso PM2 $proceso"

  # Antes de crear nada: ¿se puede bajar el código? (si falla acá no queda nada a medias)
  local repo
  repo=$(git -C "$REPO_REFERENCIA" remote get-url origin)
  git ls-remote --exit-code "$repo" main > /dev/null 2>&1 || morir "No puedo leer el repositorio $repo desde este servidor"

  # Puerto: el siguiente al más alto del registro, saltando los que estén ocupados
  local puerto
  puerto=$(instalaciones | awk -v min="$PRIMER_PUERTO" '$4 >= min && $4 >= max { max = $4 + 1 } END { print (max ? max : min) }')
  while [ -n "$(ss -ltnH "sport = :$puerto")" ]; do puerto=$((puerto + 1)); done

  local clave_db jwt sync pin_admin pin_pulso
  clave_db=$(openssl rand -hex 16)
  jwt=$(openssl rand -hex 32)
  sync=$(openssl rand -hex 24)
  pin_admin=$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom) % 1000000 )))
  pin_pulso=$(printf '%06d' $(( $(od -An -N4 -tu4 /dev/urandom) % 1000000 )))

  echo "→ Base de datos $base"
  sql "CREATE USER \"$base\" WITH PASSWORD '$clave_db'" > /dev/null
  sql "CREATE DATABASE \"$base\" OWNER \"$base\"" > /dev/null

  echo "→ Código en $carpeta"
  mkdir -p "$RAIZ"
  git clone --branch main "$repo" "$carpeta"

  echo "→ Configuración (.env)"
  (
    umask 077
    {
      echo "DATABASE_URL=\"postgresql://$base:$clave_db@localhost:5432/$base\""
      echo "JWT_SECRET=\"$jwt\""
      echo "FRONTEND_URL=\"https://$dominio\""
      echo "PORT=$puerto"
      echo "HOST=127.0.0.1"
      echo "ADMIN_PIN=$pin_admin"
      echo "PULSO_PIN=$pin_pulso"
      echo "SYNC_SECRET=\"$sync\""
      grep -E '^MQTT_(HOST|PORT|USER|PASS|USE_TLS)=' "$ENV_REFERENCIA" || true
    } > "$carpeta/apps/api/.env"
  )

  echo "→ API (dependencias, tablas, build)"
  cd "$carpeta/apps/api"
  npm install
  npx prisma db push
  npm run build
  pm2 start dist/server.js --name "$proceso" --cwd "$carpeta/apps/api"
  pm2 save

  echo "→ Frontend"
  cd "$carpeta/apps/web"
  npm install
  npm run build
  mkdir -p "$web"
  cp -r dist/* "$web"/

  # Desde acá la instalación ya entra en los deploys, aunque falle el certificado
  echo "$codigo $carpeta $proceso $puerto $web $dominio" >> "$REGISTRO"

  echo "→ Nginx"
  escribir_sitio "oidoops-$codigo" "$dominio" "$puerto" "$web"
  activar_sitio "oidoops-$codigo"

  local https="pendiente"
  if certificado "$dominio"; then https="ok"; fi

  echo
  echo "════════ Instalación '$codigo' creada ════════"
  echo "Dirección:   https://$dominio"
  echo "PIN admin:   $pin_admin"
  echo "PIN pulso:   $pin_pulso"
  echo "(los PIN no se vuelven a mostrar; quedan en $carpeta/apps/api/.env)"
  echo "Puerto $puerto · proceso $proceso · base $base"
  if [ "$https" != "ok" ]; then
    echo
    echo "⚠️  No se pudo sacar el certificado (¿el DNS de $dominio ya apunta acá?)."
    echo "   Cuando apunte:  certbot --nginx -d $dominio --redirect"
  fi
  echo
  echo "Falta, a mano:"
  echo " · Cargar https://$dominio en la ficha del cliente del back-office"
  echo " · Entrar a https://$dominio/admin y crear sus restaurantes (la base está vacía)"
  echo " · Reviews de Google y hoja de propinas: no vienen configuradas"
}

main "$@"
