#!/usr/bin/env bash
# Una vez, como root en el VPS:  bash /root/almacen/deploy/permitir-claves-box.sh
#
# Deja que el usuario eze cree la clave del canal de una Box sin contraseña, y nada más:
# solo "mqtt.sh pi OIDO-XXXXXX". Con eso deploy/preparar-box.sh la pide solo desde el Mac
# (ssh eze@… sudo -n …) y nadie tiene que entrar al VPS a copiar y pegar claves.
# Quitarlo: rm /etc/sudoers.d/oidoops-box

set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Correr como root" >&2; exit 1; }
REGLA=/etc/sudoers.d/oidoops-box
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mqtt.sh"
[ -f "$SCRIPT" ] || { echo "No encuentro $SCRIPT" >&2; exit 1; }

echo "eze ALL=(root) NOPASSWD: /usr/bin/bash $SCRIPT pi OIDO-*" > "$REGLA.nuevo"
chmod 440 "$REGLA.nuevo"
visudo -cqf "$REGLA.nuevo" || { rm -f "$REGLA.nuevo"; echo "Regla inválida, no se instaló" >&2; exit 1; }
mv "$REGLA.nuevo" "$REGLA"
echo "✓ eze puede crear claves de Box: sudo -n bash $SCRIPT pi OIDO-XXXXXX"
