# printer-server

Servidor de impresión local para Raspberry Pi: recibe tickets por MQTT desde
la app en la nube y los imprime en las impresoras térmicas ESC/POS de la LAN
del restaurante. Sigue funcionando si se cae internet (cola local en SQLite)
y sincroniza el estado al reconectar.

## Formato del ticket (lo que el cloud publica por MQTT)

Topic: `restaurante/{RESTAURANTE_ID}/ticket/{ticket_id}`

```json
{
  "ticket_id": "cmd-8231-n1",
  "zona": "PA",
  "mesa": "12",
  "camarero": "Juan",
  "timestamp": "2026-09-18T20:15:00Z",
  "items": [
    { "nombre": "Coca-Cola", "cantidad": 2, "tipo": "Bebida", "notas": null },
    { "nombre": "Paella", "cantidad": 1, "tipo": "Comida", "notas": "sin marisco" }
  ]
}
```

- `zona`: `"PB"` o `"PA"` — determina el enrutamiento (ver `config.ENRUTAMIENTO`).
- `tipo` por item: `"Bebida"` o `"Comida"` — el ticket se descompone en un
  sub-ticket por tipo, y cada uno va a las impresoras que le correspondan.

La Pi responde el resultado en `restaurante/{RESTAURANTE_ID}/ticket/{ticket_id}/status`:

```json
{ "estado": "impreso", "intentos": 0 }
```

## Instalación en la Pi

```bash
# 1. Dependencias del sistema (Raspberry Pi OS Lite)
sudo apt update && sudo apt install -y python3-venv

# 2. Clonar/copiar el proyecto a la Pi
#    (scp -r printer-server/ pi@<ip-de-la-pi>:/home/pi/)

cd /home/pi/printer-server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Configurar credenciales
cp .env.example .env
nano .env   # completar MQTT_HOST, MQTT_USER, MQTT_PASS, RESTAURANTE_ID reales

# 4. Ajustar IPs de impresoras y tabla de enrutamiento en config.py
nano config.py

# 5. Instalar el servicio systemd
sudo cp printer-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now printer-server

# 6. Ver logs en vivo
sudo journalctl -u printer-server -f
```

## Notas

- `config.py` no debe llevar credenciales reales hardcodeadas — todo lo
  sensible va por `.env` (que no se versiona).
- El módulo de la cola se llama `cola.py`, no `queue.py` — un archivo
  `queue.py` tapa al módulo `queue` de la librería estándar y rompe
  `ThreadPoolExecutor` (usa `import queue` internamente). Se probó y confirmó
  el crash localmente antes de nombrarlo así.
- Pendiente de definir (no cubierto en este esqueleto): si el heartbeat /
  estado del kiosco de la Pi (parte del roadmap más amplio) viaja por este
  mismo broker MQTT o por otro canal — ver conversación de arquitectura.
