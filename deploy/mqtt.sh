#!/usr/bin/env bash
# Credenciales y reglas del canal MQTT de las Pi. Antes había un único usuario para todo y ninguna
# regla: quien tuviera esa credencial (está en la tarjeta de cada Pi) podía imprimir en cualquiera.
# Ahora:
#   · cada Pi entra con su propio usuario (su código, OIDO-XXXXXX) y solo puede hablar de sí misma
#   · cada instalación entra como inst-<codigo> y solo llega a las Pi de los locales de su cliente,
#     según lo que diga el back-office (HQ)
#   · HQ entra como "hq" y solo lee estado e impresoras
#
# Como root, en el VPS:
#   bash deploy/mqtt.sh instalar          una vez: crea usuarios, reglas y reinicia el canal.
#                                         El usuario viejo sigue valiendo hasta "cerrar".
#   bash deploy/mqtt.sh pi OIDO-XXXXXX    crea (o renueva) la credencial de una Pi y la muestra una vez
#   bash deploy/mqtt.sh cerrar            elimina el usuario viejo compartido (cuando todas las Pi ya
#                                         usan su credencial propia)
#   bash deploy/mqtt.sh sincronizar       rehace las reglas con lo que dice HQ (lo llama runner.sh)

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

MOSQ="${OIDOOPS_MOSQUITTO:-/etc/mosquitto}"
CLAVES="$MOSQ/passwd"
ACL="$MOSQ/acl"
CONF="$MOSQ/conf.d/production.conf"
# Mientras exista este archivo, el usuario compartido de antes conserva acceso a todo
VIEJO="${OIDOOPS_RAIZ:-/root/oidoops}/mqtt-usuario-viejo"

existe_usuario() { grep -q "^$1:" "$CLAVES"; }
recargar() { systemctl reload mosquitto 2>/dev/null || pkill -HUP -x mosquitto; }

# Rehace el archivo de reglas. Devuelve 0 si cambió.
escribir_reglas() {
  # shellcheck disable=SC1090
  source "$RUNNER_CONF"
  local json nuevo
  json=$(curl -sf -m 10 -H "X-Runner-Token: $RUNNER_TOKEN" "$HQ_URL/api/interno/pis-por-cliente") || { echo "✗ HQ no responde: no toco las reglas" >&2; return 2; }
  nuevo=$(VIEJO_USUARIO="$( [ -f "$VIEJO" ] && cat "$VIEJO" || true )" python3 -c '
import sys, json, os, re
print("# Generado por deploy/mqtt.sh a partir del back-office. No editar a mano: se pisa.")
print("# Cada Pi entra con su código como usuario y solo puede hablar de sí misma")
print("pattern readwrite pi/%u/#\n")
print("user hq\ntopic read pi/+/estado\ntopic read pi/+/impresoras\n")
for c in json.load(sys.stdin):
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,29}", c["codigo"]): continue
    print("user inst-" + c["codigo"])
    for pi in c["pis"]:
        if re.fullmatch(r"OIDO-[0-9A-F]{6}", pi or ""): print("topic readwrite pi/" + pi + "/#")
    print()
viejo = os.environ.get("VIEJO_USUARIO", "").strip()
if viejo:
    print("# Usuario compartido de antes: vale hasta `mqtt.sh cerrar`")
    print("user " + viejo + "\ntopic readwrite pi/#")
' <<< "$json")
  if [ -f "$ACL" ] && [ "$nuevo" = "$(cat "$ACL")" ]; then return 1; fi
  printf '%s\n' "$nuevo" > "$ACL"
  chmod 644 "$ACL"
  return 0
}

# Crea un usuario con clave nueva si no existe. Imprime la clave (vacío si ya existía).
crear_usuario() {
  existe_usuario "$1" && return 0
  local clave
  clave=$(openssl rand -hex 24)
  mosquitto_passwd -b "$CLAVES" "$1" "$clave"
  echo "$clave"
}

# Usuario propio para una instalación nueva, escrito en su .env (lo llama el alta). Siempre con
# clave nueva: si quedó un usuario de un alta fallida, se le cambia.
#   usuario_de_instalacion <codigo> <carpeta>
usuario_de_instalacion() {
  [ -f "$ACL" ] || return 0   # el canal todavía no tiene reglas: sigue con lo que haya
  local clave env="$2/apps/api/.env"
  clave=$(openssl rand -hex 24)
  mosquitto_passwd -b "$CLAVES" "inst-$1" "$clave"
  poner_env "$env" MQTT_USER "inst-$1" || true
  poner_env "$env" MQTT_PASS "$clave" || true
  recargar
}

instalar() {
  [ -f "$RUNNER_CONF" ] || morir "Primero hay que poner el instalador: bash deploy/instalar-runner.sh"
  [ -f "$CONF" ] || morir "No encuentro $CONF"
  asegurar_registro
  local respaldo="/root/mosquitto-backup-$(date +%F-%H%M)"
  cp -a "$MOSQ" "$respaldo"
  echo "→ Copia de la configuración actual en $respaldo"

  local primera viejo
  primera=$(instalaciones | awk 'NR == 1 { print $2 }')
  viejo=$(grep -m1 '^MQTT_USER=' "$primera/apps/api/.env" | cut -d= -f2- | tr -d '"')
  if [ ! -f "$VIEJO" ] && [ -n "$viejo" ] && [[ "$viejo" != inst-* ]]; then echo "$viejo" > "$VIEJO"; fi

  echo "→ Usuarios"
  local clave
  while read -r codigo carpeta _resto; do
    clave=$(crear_usuario "inst-$codigo")
    if [ -n "$clave" ]; then
      poner_env "$carpeta/apps/api/.env" MQTT_USER "inst-$codigo" || true
      poner_env "$carpeta/apps/api/.env" MQTT_PASS "$clave" || true
      echo "   inst-$codigo"
    fi
  done < <(instalaciones)
  clave=$(crear_usuario hq)
  if [ -n "$clave" ] && [ -f "$HQ_DIR/apps/api/.env" ]; then
    poner_env "$HQ_DIR/apps/api/.env" MQTT_USER hq || true
    poner_env "$HQ_DIR/apps/api/.env" MQTT_PASS "$clave" || true
    chown --reference="$HQ_DIR/apps/api" "$HQ_DIR/apps/api/.env"
    echo "   hq"
  fi

  echo "→ Reglas"
  escribir_reglas || [ $? -eq 1 ] || morir "No pude armar las reglas; no cambié la configuración del canal"
  if ! grep -q "^acl_file " "$CONF"; then
    # una línea acl_file debajo de cada password_file (hay una por puerto de escucha)
    awk -v regla="acl_file $ACL" '{ print } /^password_file / { print regla }' "$CONF" > "$CONF.nuevo" && mv "$CONF.nuevo" "$CONF"
  fi

  echo "→ Reinicio del canal"
  systemctl restart mosquitto
  sleep 2
  if ! systemctl is-active --quiet mosquitto; then
    cp -a "$respaldo/conf.d/production.conf" "$CONF"
    systemctl restart mosquitto
    morir "El canal no arrancó con la configuración nueva: restauré la anterior. Ver: journalctl -u mosquitto -n 30"
  fi

  echo "→ Reinicio de las instalaciones y de HQ"
  while read -r _codigo _carpeta proceso _resto; do pm2 restart "$proceso" --update-env > /dev/null; done < <(instalaciones)
  ( cd "$HQ_DIR" && docker compose up -d --force-recreate api 2>&1 | tail -1 )

  echo
  echo "Canal con reglas. Las Pi siguen entrando con el usuario de antes ($(cat "$VIEJO" 2>/dev/null || echo ninguno)) hasta 'cerrar'."
  echo "Siguiente: por cada Pi,  bash deploy/mqtt.sh pi OIDO-XXXXXX"
}

pi() {
  local codigo="${1:-}"
  [[ "$codigo" =~ ^OIDO-[0-9A-F]{6}$ ]] || morir "Uso: mqtt.sh pi OIDO-XXXXXX"
  local clave
  clave=$(openssl rand -hex 24)
  mosquitto_passwd -b "$CLAVES" "$codigo" "$clave"
  recargar
  echo "Credencial de la Pi $codigo (no se vuelve a mostrar). En su archivo .env:"
  echo
  echo "MQTT_USER=$codigo"
  echo "MQTT_PASS=$clave"
}

# Usuarios del esquema anterior: todo lo que no sea hq, una instalación (inst-…) o una Pi (OIDO-…).
# Había dos: el de la API y el que usaban las Pi.
usuarios_viejos() { cut -d: -f1 "$CLAVES" | grep -vE '^(hq|inst-[a-z0-9-]+|OIDO-[0-9A-F]{6})$' || true; }

cerrar() {
  local viejos
  viejos=$(usuarios_viejos)
  [ -n "$viejos" ] || [ -f "$VIEJO" ] || morir "No queda ningún usuario viejo que cerrar"
  local u
  for u in $viejos; do mosquitto_passwd -D "$CLAVES" "$u" && echo "   eliminado: $u"; done
  rm -f "$VIEJO"
  escribir_reglas || true
  recargar
  echo "Usuarios del esquema anterior eliminados. Una Pi que todavía use uno deja de conectar."
}

sincronizar() {
  [ -f "$ACL" ] && [ -f "$RUNNER_CONF" ] || return 0
  if escribir_reglas; then recargar; echo "$(date '+%F %T') reglas MQTT actualizadas"; fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$(id -u)" -eq 0 ] || morir "Hay que correrlo como root"
  case "${1:-}" in
    instalar) instalar ;;
    pi) pi "${2:-}" ;;
    cerrar) cerrar ;;
    sincronizar) sincronizar || true ;;
    *) morir "Uso: mqtt.sh instalar | pi OIDO-XXXXXX | cerrar | sincronizar" ;;
  esac
fi
