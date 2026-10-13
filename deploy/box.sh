#!/usr/bin/env bash
# Instala o actualiza el modo local dentro de una Oído Box (la Raspberry Pi del local).
# Se corre desde el Mac, en la raíz del repo, con la Box en la misma red:
#
#   bash deploy/box.sh                  # usa oido@oido.local
#   bash deploy/box.sh oido@10.0.1.23   # otra dirección
#
# Antes, una vez, en la Box:  sudo apt-get install -y nodejs npm postgresql
#
# Qué hace: compila la API y la web aquí, las copia a ~/oidoops de la Box y allí instala
# dependencias, crea (la primera vez) la base, el .env y el servicio "oidoops-local", y lo reinicia.
# La Box queda sirviendo la sala en http://<su ip>:8080/sala con la copia de su local.
# No toca el servicio de impresión (printer-server). Diseño: docs/modo-local.md.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

BOX="${1:-oido@oido.local}"
DESTINO=oidoops

echo "→ Compilando la API y la web"
(cd apps/api && npx tsc)
(cd apps/web && npm run build > /dev/null)

echo "→ Copiando a $BOX:~/$DESTINO"
ssh "$BOX" "mkdir -p $DESTINO/apps/api $DESTINO/apps/web"
rsync -az package.json package-lock.json "$BOX:$DESTINO/"
rsync -az --delete apps/api/dist apps/api/prisma apps/api/package.json "$BOX:$DESTINO/apps/api/"
rsync -az apps/web/package.json "$BOX:$DESTINO/apps/web/"
rsync -az --delete apps/web/dist "$BOX:$DESTINO/apps/web/"

echo "→ Instalando en la Box"
ssh "$BOX" "bash -s" <<'REMOTO'
set -euo pipefail
cd ~/oidoops
CARPETA="$PWD"
ENV="$CARPETA/apps/api/.env"

if [ ! -f "$ENV" ]; then
  echo "  primera vez: base de datos y configuración"
  CLAVE=$(openssl rand -hex 16)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oidoops') THEN CREATE ROLE oidoops LOGIN; END IF;
END \$\$;
ALTER ROLE oidoops PASSWORD '$CLAVE';
SQL
  sudo -u postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname='oidoops'" | grep -q 1 || sudo -u postgres createdb -O oidoops oidoops
  umask 077
  {
    echo "DATABASE_URL=\"postgresql://oidoops:$CLAVE@127.0.0.1:5432/oidoops\""
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "MODO_LOCAL=1"
    echo "PORT=8080"
    echo "HOST=0.0.0.0"
    echo "WEB_DIST=$CARPETA/apps/web/dist"
  } > "$ENV"
fi

echo "  dependencias"
npm ci --workspace=apps/api --include-workspace-root=false --no-audit --no-fund 2>&1 | tail -1
cd apps/api
set -a; . ./.env; set +a
npx prisma generate > /dev/null
npx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -1

sudo tee /etc/systemd/system/oidoops-local.service > /dev/null <<UNIDAD
[Unit]
Description=OidoOps en modo local (la sala sigue sin internet)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$CARPETA/apps/api
EnvironmentFile=$ENV
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
MemoryMax=400M

[Install]
WantedBy=multi-user.target
UNIDAD
sudo systemctl daemon-reload
sudo systemctl enable -q oidoops-local
sudo systemctl restart oidoops-local
sleep 6
systemctl is-active oidoops-local
journalctl -u oidoops-local -n 6 --no-pager -o cat | grep -v '"level":30' || true
echo "  memoria:"; free -m | sed -n 2p
echo "  sala en: http://$(hostname -I | awk '{print $1}'):8080/sala"
REMOTO
