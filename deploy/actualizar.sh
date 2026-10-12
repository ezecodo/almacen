#!/usr/bin/env bash
# Actualiza las instalaciones de OidoOps al último `main`. Lo corre el deploy (GitHub Actions)
# como root en el VPS; también se puede correr a mano.
#
#   bash deploy/actualizar.sh            todas
#   bash deploy/actualizar.sh bodega     solo esa (para probar un cambio en un cliente antes que en el resto)
#
# Por instalación hace lo mismo que hacía el deploy cuando había una sola: git pull, API
# (dependencias, schema, build, reinicio) y frontend (build y copia a la carpeta que sirve Nginx).
# Si una falla se informa y se sigue con las demás; al final sale con error si alguna falló.

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"

actualizar_una() {
  local carpeta="$1" proceso="$2" web="$3"
  cd "$carpeta" || return 1
  git pull origin main || return 1
  cd "$carpeta/apps/api" || return 1
  npm install || return 1
  npx prisma db push --accept-data-loss || return 1
  npm run build || return 1
  pm2 restart "$proceso" || return 1
  cd "$carpeta/apps/web" || return 1
  npm install || return 1
  npm run build || return 1
  mkdir -p "$web" && cp -r dist/* "$web"/ || return 1
}

main() {
  local solo="${1:-}" hechas=() fallidas=() build_listo=""
  asegurar_registro
  asegurar_suite_token

  while read -r codigo carpeta proceso _puerto web _dominio; do
    [ -n "$solo" ] && [ "$solo" != "$codigo" ] && continue
    echo
    echo "════════ $codigo ($carpeta) ════════"
    enlazar_instalacion "$codigo" "$carpeta"   # antes de actualizar: el reinicio ya lo toma
    # En subshell: un fallo corta esta instalación, no el recorrido
    if (actualizar_una "$carpeta" "$proceso" "$web") < /dev/null; then
      hechas+=("$codigo")
      [ -z "$build_listo" ] && build_listo="$carpeta/apps/web/dist"
    else
      fallidas+=("$codigo")
      echo "✗ $codigo falló — sigue con la versión que tenía si no llegó a reiniciar"
    fi
  done < <(instalaciones)

  # La vidriera es el mismo frontend: se refresca con el build de la primera que salió bien
  if [ -d "$WEB_VIDRIERA" ] && [ -n "$build_listo" ]; then
    cp -r "$build_listo"/* "$WEB_VIDRIERA"/ && echo && echo "Vidriera actualizada"
  fi

  echo
  echo "Actualizadas: ${hechas[*]:-ninguna}"
  if [ -n "$solo" ] && [ ${#hechas[@]} -eq 0 ] && [ ${#fallidas[@]} -eq 0 ]; then
    echo "No hay ninguna instalación con el identificador '$solo'"
    return 1
  fi
  if [ ${#fallidas[@]} -gt 0 ]; then
    echo "FALLARON: ${fallidas[*]}"
    return 1
  fi
}

# Todo dentro de main y `exit` al final: el propio git pull puede reescribir este archivo
# mientras corre, y bash lo lee a medida que avanza.
main "$@"; exit
