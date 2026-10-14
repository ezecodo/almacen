#!/usr/bin/env bash
# Comando "oido" de la Oído Box: atajos para mirarla y para probar. Lo instala
# deploy/preparar-box.sh en /usr/local/bin/oido. Desde el Mac:
#
#   ssh oido@oido.local oido estado      cómo está: servicios, redes, canal, corte
#   ssh oido@oido.local oido corte       la Box deja de llegar a la nube (simula que se cayó internet)
#   ssh oido@oido.local oido vuelve      quita el corte
#   ssh oido@oido.local oido sin-wifi    olvida el WiFi y reinicia: arranca como recién sacada de la caja
#   ssh -t oido@oido.local oido clave    pega una credencial nueva del canal (tras mqtt.sh pi en el VPS)
#   ssh oido@oido.local oido registro    últimas líneas de los tres servicios
#
# El corte no sobrevive a un reinicio (a propósito: una Box reiniciada nunca queda cortada).

set -uo pipefail
PS="$HOME/printer-server"
[ "$(id -un)" = root ] && PS=/home/oido/printer-server

# IPs de la nube: el canal y la instalación a la que late la Box (hoy las dos son el mismo VPS)
ips_nube() {
  local hosts h
  hosts="$(grep -h '^MQTT_HOST=' "$PS/.env" 2>/dev/null | cut -d= -f2)"
  h=$(python3 -c 'import json,sys,urllib.parse;print(urllib.parse.urlparse(json.load(open(sys.argv[1]))["latido_url"]).hostname)' "$PS/enlace.json" 2>/dev/null) && hosts="$hosts $h"
  for h in ${hosts:-mqtt.ezeangeloni.xyz}; do getent ahostsv4 "$h" | awk '{print $1}'; done | sort -u
}
cortadas() { ip route show type blackhole | awk '{print $2}' | sed 's#/32##'; }

case "${1:-estado}" in
  estado)
    echo "Box $(cd "$PS" && venv/bin/python3 -c 'import config; print(config.PI_CODIGO)' 2>/dev/null)"
    for s in printer-server oido-portal oidoops-local; do printf '  %-15s %s\n' "$s" "$(systemctl is-active "$s")"; done
    echo "  redes:"; ip -br -4 addr | grep -v '^lo' | sed 's/^/    /'
    echo "  sale a internet por: $(ip route get 1.1.1.1 2>/dev/null | grep -o 'dev [^ ]*' | cut -d' ' -f2)"
    if journalctl -u printer-server -n 200 --no-pager -o cat 2>/dev/null | grep -E 'Conectado al broker|Desconectado del broker|Fallo al conectar' | tail -1 | grep -q Conectado; then
      echo "  canal: conectado"; else echo "  canal: SIN CONEXIÓN"; fi
    [ -f "$PS/enlace.json" ] && echo "  enlace: $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["latido_url"])' "$PS/enlace.json")" || echo "  enlace: ninguno (asígnala a un local en HQ)"
    c=$(cortadas); [ -n "$c" ] && echo "  ⚠ CORTE ACTIVO hacia: $c  (quitar: oido vuelve)" || echo "  corte: no"
    ;;
  corte)
    for ip in $(ips_nube); do sudo ip route replace blackhole "$ip/32"; done
    echo "Corte activo hacia: $(cortadas | paste -sd' ' -). La Box ya no llega a la nube."
    echo "Quitar con: oido vuelve  (o reiniciando la Box)"
    ;;
  vuelve)
    for ip in $(cortadas); do sudo ip route del blackhole "$ip/32"; done
    echo "Sin corte. En unos segundos la Box sube lo que tenga pendiente."
    ;;
  sin-wifi)
    echo "Olvido el WiFi y reinicio. Si no hay cable con internet, en 1-2 min aparece la red $(cd "$PS" && venv/bin/python3 -c 'import config; print(config.PI_CODIGO)' 2>/dev/null) para configurarla desde el teléfono."
    for c in $(nmcli -t -f UUID,TYPE con show | grep wireless | cut -d: -f1); do sudo nmcli con delete "$c" > /dev/null; done
    sudo systemctl reboot
    ;;
  clave)
    read -rsp "MQTT_PASS: " CLAVE; echo
    CLAVE="$(echo "${CLAVE#MQTT_PASS=}" | tr -d '[:space:]')"
    [[ "$CLAVE" =~ ^[0-9a-f]{20,}$ ]] || { echo "Eso no parece la clave."; exit 1; }
    CODIGO=$(cd "$PS" && venv/bin/python3 -c 'import config; print(config.PI_CODIGO)')
    ( umask 077; cd "$PS" && { grep -vE '^MQTT_(USER|PASS)=' .env; echo "MQTT_USER=$CODIGO"; echo "MQTT_PASS=$CLAVE"; } > .env.nuevo && mv .env.nuevo .env )
    DESDE=$(date '+%Y-%m-%d %H:%M:%S'); sudo systemctl restart printer-server
    for _ in $(seq 1 15); do
      sleep 2; R=$(sudo journalctl -u printer-server --since "$DESDE" --no-pager -o cat)
      grep -q "Conectado al broker" <<< "$R" && { echo "✓ Conectado al canal con la clave nueva"; exit 0; }
      grep -q "rc=5" <<< "$R" && { echo "✗ El canal rechaza la clave"; exit 1; }
    done
    echo "✗ No conecta en 30 s: oido registro"; exit 1
    ;;
  registro)
    for s in printer-server oido-portal oidoops-local; do echo "── $s"; sudo journalctl -u "$s" -n 8 --no-pager -o cat; done
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1
    ;;
esac
