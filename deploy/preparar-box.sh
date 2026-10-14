#!/usr/bin/env bash
# Deja lista una Oído Box (Raspberry Pi) recién grabada: servicio de impresión, portal WiFi,
# credencial del canal, certificado de su nombre y modo local. Se corre desde el Mac, en la raíz
# de este repo, con la Box en la misma red:
#
#   bash deploy/preparar-box.sh                  # usa oido@oido.local
#   bash deploy/preparar-box.sh oido@10.0.1.23   # otra dirección
#
# La tarjeta tiene que estar grabada con Raspberry Pi OS Lite (64-bit), usuario "oido" y SSH con la
# clave de este Mac. Se puede repetir: lo que ya está hecho no se rehace (salvo copiar el programa).
#
# Lo único que no hace solo: crear la credencial del canal, que necesita root en el VPS. El script
# dice el comando exacto y pide pegar la clave que muestra.
#
# Variables opcionales: PRINTER_SERVER (carpeta del servicio de impresión, por defecto
# ~/Desktop/dev/printer-server), VPS (por defecto eze@82.165.93.34), SIN_MODO_LOCAL=1.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# El Terminal del Mac manda LC_CTYPE=UTF-8, que Linux no entiende (avisos de perl en cada comando)
unset LC_CTYPE LC_ALL

BOX="${1:-oido@oido.local}"
PS_LOCAL="${PRINTER_SERVER:-$HOME/Desktop/dev/printer-server}"
VPS="${VPS:-eze@82.165.93.34}"
DOMINIO_BOX=box.oidoops.ezeangeloni.xyz
SSH_OPC=(-o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)

paso() { printf '\n\033[1m%s\033[0m\n' "$1"; }
bien() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
aviso() { printf '  \033[33m⚠\033[0m %s\n' "$1"; }
mal() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
box() { ssh "${SSH_OPC[@]}" "$BOX" "$@"; }

# ── 1 ──────────────────────────────────────────────────────────────────────────────────────────
paso "1/7 · Llegar a la Box ($BOX)"
box true 2>/dev/null || mal "No respondo por SSH. ¿Está encendida, en la misma red y con la clave de este Mac?"
[ "$(box whoami)" = oido ] || mal "El usuario tiene que ser 'oido' (los servicios lo esperan así)."
# Raspberry Pi OS reciente pide contraseña para sudo. Los servicios se instalan por SSH sin nadie
# delante, así que se le quita una vez (la Box solo acepta entrar con la clave de este Mac).
if ! box sudo -n true 2>/dev/null; then
  echo "  La Box pide contraseña para sudo. Escribe la del usuario oido (solo esta vez):"
  ssh -t "${SSH_OPC[@]}" "$BOX" "echo 'oido ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/010_oido-nopasswd > /dev/null && sudo chmod 440 /etc/sudoers.d/010_oido-nopasswd && sudo visudo -cq" \
    || mal "No se pudo. ¿Era la contraseña que pusiste en Raspberry Pi Imager?"
  box sudo -n true 2>/dev/null || mal "Sigue pidiendo contraseña para sudo."
  bien "sudo sin contraseña para oido"
fi
bien "$(box '. /etc/os-release; echo "$PRETTY_NAME · $(uname -m)"')"
CODIGO=$(box 'tr -d "\0" < /proc/device-tree/serial-number 2>/dev/null' | tr -d '\n' | tail -c 6 | tr a-f A-F)
[[ "$CODIGO" =~ ^[0-9A-F]{6}$ ]] || mal "No pude leer el número de serie de la Pi."
CODIGO="OIDO-$CODIGO"
NOMBRE="$(echo "${CODIGO#OIDO-}" | tr A-F a-f).$DOMINIO_BOX"
bien "Código de esta Box: $CODIGO"
[ -d "$PS_LOCAL" ] || mal "No encuentro el servicio de impresión en $PS_LOCAL"

# ── 2 ──────────────────────────────────────────────────────────────────────────────────────────
paso "2/7 · Paquetes del sistema (la primera vez tarda varios minutos)"
box 'sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv python3-dev build-essential libjpeg-dev zlib1g-dev libfreetype-dev fonts-dejavu-core nodejs npm postgresql rsync > /dev/null' \
  || mal "Falló apt-get. Reintentar; si sigue, mirar la conexión a internet de la Box."
bien "Python $(box 'python3 -V | cut -d" " -f2') · Node $(box 'node -v') · $(box 'psql -V | cut -d" " -f3' | sed 's/^/Postgres /')"

# ── 3 ──────────────────────────────────────────────────────────────────────────────────────────
paso "3/7 · Servicio de impresión y portal WiFi"
rsync -az --delete --exclude venv/ --exclude __pycache__/ --exclude .git/ --exclude .env \
  --exclude '*.db*' --exclude enlace.json --exclude .DS_Store --exclude '*.bak' \
  -e "ssh ${SSH_OPC[*]}" "$PS_LOCAL/" "$BOX:printer-server/"
bien "Programa copiado ($(cd "$PS_LOCAL" && git log -1 --format='%h %s' 2>/dev/null || echo 'sin git'))"
box 'cd ~/printer-server && { [ -x venv/bin/python3 ] || python3 -m venv venv; } && venv/bin/pip install -q --disable-pip-version-check -r requirements.txt' \
  || mal "Falló la instalación de las librerías de Python."
# Con WiFi y cable a la vez, Linux sale a internet por el cable. El router del kit puede no tener
# internet (las impresoras van por ahí): que gane el WiFi, y el cable solo si no hay WiFi.
box 'printf "[connection-oido-cable]\nmatch-device=type:ethernet\nipv4.route-metric=700\nipv6.route-metric=700\n" | sudo tee /etc/NetworkManager/conf.d/oido-cable.conf > /dev/null && sudo systemctl reload NetworkManager && { c=$(nmcli -g GENERAL.CONNECTION device show eth0 2>/dev/null); [ -z "$c" ] || sudo nmcli con up "$c" > /dev/null; }' \
  && bien "Internet por WiFi primero; el cable, de respaldo" || aviso "No pude ajustar la prioridad del cable"
box 'sudo tee /usr/local/bin/oido > /dev/null && sudo chmod 755 /usr/local/bin/oido' < deploy/oido-box.sh
bien "Comando oido instalado (oido estado | corte | vuelve | sin-wifi | clave | registro)"
bien "Librerías:$(box '~/printer-server/venv/bin/pip list 2>/dev/null | grep -iE "^(paho-mqtt|python-escpos|pillow) " | tr -s " " | paste -sd, -')"

# ── 4 ──────────────────────────────────────────────────────────────────────────────────────────
paso "4/7 · Credencial del canal (MQTT)"
if box "grep -q '^MQTT_PASS=..' ~/printer-server/.env 2>/dev/null && grep -q '^MQTT_USER=$CODIGO\$' ~/printer-server/.env"; then
  bien "La Box ya tiene su credencial (no la toco)"
else
  echo "  Esta Box necesita su credencial. En otra terminal, en el VPS como root, corre:"
  echo
  echo "      bash /root/almacen/deploy/mqtt.sh pi $CODIGO"
  echo
  echo "  Muestra MQTT_USER y MQTT_PASS. Pega aquí solo la clave (lo que va después de MQTT_PASS=)."
  read -rsp "  MQTT_PASS: " CLAVE; echo
  CLAVE="${CLAVE#MQTT_PASS=}"; CLAVE="$(echo "$CLAVE" | tr -d '[:space:]')"
  [[ "$CLAVE" =~ ^[0-9a-f]{20,}$ ]] || mal "Eso no parece la clave (son letras a-f y números). Vuelve a correr el script."
  box "umask 077; cd ~/printer-server; { grep -vE '^MQTT_(USER|PASS)=' .env 2>/dev/null || grep -vE '^MQTT_(USER|PASS)=' .env.example; echo MQTT_USER=$CODIGO; echo MQTT_PASS=$CLAVE; } > .env.nuevo && mv .env.nuevo .env"
  bien "Credencial guardada en ~/printer-server/.env"
fi
DESDE=$(box "date '+%Y-%m-%d %H:%M:%S'")
box 'sudo cp ~/printer-server/printer-server.service ~/printer-server/oido-portal.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable -q printer-server oido-portal && sudo systemctl restart printer-server oido-portal'
echo "  esperando a que conecte…"
for _ in $(seq 1 20); do
  sleep 2
  REG=$(box "sudo journalctl -u printer-server --since '$DESDE' --no-pager -o cat" || true)
  grep -q "Conectado al broker" <<< "$REG" && break
  grep -q "rc=5" <<< "$REG" && mal "El canal rechaza la clave (rc=5). Vuelve a generarla con mqtt.sh pi $CODIGO, borra las dos líneas MQTT de ~/printer-server/.env en la Box y repite."
done
grep -q "Conectado al broker" <<< "$REG" || mal "No conecta al canal en 40 s. Mira: journalctl -u printer-server -n 30 --no-pager"
bien "printer-server: conectado al canal"
[ "$(box systemctl is-active oido-portal)" = active ] && bien "oido-portal: activo" || aviso "oido-portal no está activo"

# ── 5 ──────────────────────────────────────────────────────────────────────────────────────────
paso "5/7 · Certificado de $NOMBRE"
ORIGEN="box-certs/config/live/$NOMBRE"
if ssh "${SSH_OPC[@]}" "$VPS" "test -r $ORIGEN/privkey.pem"; then
  box 'mkdir -p ~/oidoops/cert && chmod 700 ~/oidoops/cert'
  ssh "$VPS" "cat $ORIGEN/fullchain.pem" | box 'cat > ~/oidoops/cert/fullchain.pem'
  ssh "$VPS" "cat $ORIGEN/privkey.pem" | box 'umask 077; cat > ~/oidoops/cert/privkey.pem'
  bien "Copiado. Caduca: $(box 'openssl x509 -enddate -noout -in ~/oidoops/cert/fullchain.pem | cut -d= -f2')"
else
  aviso "No hay certificado para $NOMBRE en el VPS: el modo local irá solo por http://<ip>:8080/sala"
fi

# ── 6 ──────────────────────────────────────────────────────────────────────────────────────────
paso "6/7 · Modo local"
if [ "${SIN_MODO_LOCAL:-}" = 1 ]; then
  aviso "Saltado (SIN_MODO_LOCAL=1)"
else
  bash deploy/box.sh "$BOX"
fi

# ── 7 ──────────────────────────────────────────────────────────────────────────────────────────
paso "7/7 · Comprobación final"
for s in printer-server oido-portal oidoops-local; do
  [ "$(box systemctl is-active "$s" 2>/dev/null || true)" = active ] && bien "$s activo" || aviso "$s NO está activo"
done
IPS=$(box hostname -I)
DNS=$(dig +short "$NOMBRE" | tail -1)
bien "IPs de la Box: $IPS"
if [ -z "$DNS" ]; then
  aviso "$NOMBRE no existe en el DNS: los teléfonos no encontrarán la Box sin internet"
elif grep -qwF "$DNS" <<< "$IPS"; then
  bien "$NOMBRE → $DNS (coincide con la Box)"
else
  aviso "$NOMBRE apunta a $DNS, pero la Box tiene $IPS. Hay que reservarle $DNS en el router o cambiar el registro en IONOS"
fi
box 'test -f ~/printer-server/enlace.json' && bien "Enlace con la instalación recibido" \
  || aviso "Todavía sin enlace con ninguna instalación: asígnala a un local en HQ (llega en segundos)"
echo
echo "Listo. Código de la Box: $CODIGO"
