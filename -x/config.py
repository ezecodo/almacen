"""
Configuración del servidor de impresión: identidad del restaurante,
credenciales del broker MQTT, IPs de las impresoras y tabla de enrutamiento.

Los valores sensibles (host, usuario, contraseña) se leen de variables de
entorno (ver .env.example) — nunca hardcodeados en este archivo.
"""
import os

# --- Identidad de este restaurante/local ---
# Cada Pi/local tiene su propio RESTAURANTE_ID, que define su topic MQTT.
RESTAURANTE_ID = os.getenv("RESTAURANTE_ID", "sensi-tapas-pb")

# --- Broker MQTT ---
MQTT_HOST = os.getenv("MQTT_HOST", "82.165.93.34")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))  # 8883 = MQTT sobre TLS (recomendado)
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
MQTT_USE_TLS = os.getenv("MQTT_USE_TLS", "true").lower() == "true"
MQTT_CLIENT_ID = f"printer-server-{RESTAURANTE_ID}"

# --- Topics ---
# El cloud publica cada ticket en restaurante/{id}/ticket/{ticket_id}
TOPIC_TICKETS = f"restaurante/{RESTAURANTE_ID}/ticket/#"
# La Pi publica acá el resultado (impreso/fallido) de cada trabajo
TOPIC_STATUS = f"restaurante/{RESTAURANTE_ID}/ticket/{{ticket_id}}/status"
# Last Will & Testament: el broker publica "offline" acá solo si la Pi
# se cae sin desconectarse prolijamente (corte de luz, crash, etc.)
TOPIC_LWT = f"restaurante/{RESTAURANTE_ID}/printer-server/status"

# --- Impresoras térmicas (IP:puerto ESC/POS, siempre 9100) ---
# Deben tener IP fija por reserva DHCP en el router del local.
IMPRESORAS = {
    "barra_pb": {"ip": "192.168.1.101", "puerto": 9100},
    "cocina_pb": {"ip": "192.168.1.102", "puerto": 9100},
    "planta_alta": {"ip": "192.168.1.103", "puerto": 9100},
}

# --- Enrutamiento: (zona, tipo_item) -> [(impresora, copias), ...] ---
# Ej: una Comida de Planta Alta sale 2 copias en cocina (cocina + pase)
# y 1 copia arriba (aviso al camarero de esa planta).
ENRUTAMIENTO = {
    ("PB", "Bebida"): [("barra_pb", 1)],
    ("PB", "Comida"): [("cocina_pb", 2)],
    ("PA", "Bebida"): [("planta_alta", 1)],
    ("PA", "Comida"): [("cocina_pb", 2), ("planta_alta", 1)],
}

# --- Cola local (SQLite) ---
DB_PATH = os.getenv("DB_PATH", "/home/pi/printer-server/cola.db")

# --- Reintentos e intervalos ---
MAX_REINTENTOS_IMPRESORA = 5
INTERVALO_WORKER_SEG = 3  # cada cuánto el worker revisa la cola
