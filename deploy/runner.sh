#!/usr/bin/env bash
# El instalador: ejecuta las altas de cliente que se piden desde el back-office (botón
# "Instalar su OidoOps"). Corre como root por cron, una vez por minuto (lo deja puesto
# deploy/instalar-runner.sh). El back-office no tiene permisos en el servidor: solo anota el
# pedido, y este script pregunta si hay alguno.
#
# Del back-office solo se acepta el identificador del cliente, que se valida acá otra vez;
# la dirección se arma con el dominio base de este servidor, no con lo que diga el pedido.

set -uo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${OIDOOPS_RUNNER_CONF:-/root/oidoops/runner.env}"

[ -f "$CONF" ] || exit 0
# shellcheck disable=SC1090
source "$CONF"   # HQ_URL, RUNNER_TOKEN, DOMINIO_BASE

# Las reglas del canal MQTT siguen lo que diga HQ (qué Pi es de qué cliente). No hace nada si
# el canal todavía no tiene reglas (deploy/mqtt.sh instalar).
bash "$DIR/mqtt.sh" sincronizar || true

# Oído Box que alguien activó en HQ: se le crea su clave del canal y se devuelve a HQ, que se la da
# a la Box (ver oido-talent → src/boxes.ts). Lo único que llega de HQ es el código, validado aquí.
activar_box() {
  local r codigo salida clave
  r=$(curl -s -m 10 -w '\n%{http_code}' -H "X-Runner-Token: $RUNNER_TOKEN" "$HQ_URL/api/interno/boxes/siguiente") || return 0
  [ "$(tail -n1 <<< "$r")" = "200" ] || return 0
  codigo=$(sed '$d' <<< "$r" | python3 -c 'import sys,json; print(json.load(sys.stdin)["codigo"])') || return 0
  [[ "$codigo" =~ ^OIDO-[0-9A-F]{6}$ ]] || { echo "$(date '+%F %T') código de Box no válido: $codigo"; return 0; }
  echo "$(date '+%F %T') clave del canal para $codigo"
  salida=$(bash "$DIR/mqtt.sh" pi "$codigo" 2>&1)
  clave=$(sed -n 's/^MQTT_PASS=//p' <<< "$salida")
  python3 - "$clave" "$salida" <<'PY' | curl -s -m 20 -o /dev/null -X POST -H "X-Runner-Token: $RUNNER_TOKEN" -H 'Content-Type: application/json' --data-binary @- "$HQ_URL/api/interno/boxes/$codigo/clave"
import sys, json
clave, salida = sys.argv[1], sys.argv[2]
print(json.dumps({'ok': True, 'clave': clave} if clave else {'ok': False, 'log': salida[-4000:]}))
PY
  [ -n "$clave" ] || echo "$salida" | tail -n 5
}
activar_box

respuesta=$(curl -s -m 10 -w '\n%{http_code}' -H "X-Runner-Token: $RUNNER_TOKEN" "$HQ_URL/api/interno/instalaciones/siguiente") || exit 0
[ "$(tail -n1 <<< "$respuesta")" = "200" ] || exit 0   # 204 = no hay pedidos
pedido=$(sed '$d' <<< "$respuesta")
id=$(python3 -c 'import sys,json; print(int(json.load(sys.stdin)["id"]))' <<< "$pedido") || exit 1
codigo=$(python3 -c 'import sys,json; print(json.load(sys.stdin)["codigo"])' <<< "$pedido") || exit 1

log=$(mktemp) resultado=$(mktemp)
trap 'rm -f "$log" "$resultado"' EXIT

echo "$(date '+%F %T') instalando '$codigo' (pedido $id)"
if [[ "$codigo" =~ ^[a-z][a-z0-9-]{1,29}$ ]]; then
  OIDOOPS_RESULTADO="$resultado" bash "$DIR/alta-cliente.sh" "$codigo" "$codigo.$DOMINIO_BASE" > "$log" 2>&1
  rc=$?
else
  echo "Identificador no válido: $codigo" > "$log"
  rc=1
fi
echo "$(date '+%F %T') '$codigo' terminó con código $rc"
[ "$rc" -eq 0 ] || tail -n 40 "$log"

# El resultado vuelve al back-office: dirección y PIN si salió bien, la salida del script si no
python3 - "$rc" "$log" "$resultado" <<'PY' | curl -s -m 20 -o /dev/null -X POST -H "X-Runner-Token: $RUNNER_TOKEN" -H 'Content-Type: application/json' --data-binary @- "$HQ_URL/api/interno/instalaciones/$id/resultado"
import sys, json, re
rc, log, resultado = int(sys.argv[1]), sys.argv[2], sys.argv[3]
datos = dict(l.strip().split('=', 1) for l in open(resultado) if '=' in l)
# Sin colores ni barras de progreso
texto = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', open(log, errors='replace').read())
ok = rc == 0 and all(k in datos for k in ('url', 'pin_admin', 'pin_pulso'))
body = {'ok': ok, 'log': texto[-20000:]}
if ok:
    body.update(url=datos['url'], pinAdmin=datos['pin_admin'], pinPulso=datos['pin_pulso'])
print(json.dumps(body))
PY
