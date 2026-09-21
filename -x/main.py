"""
Punto de entrada del servidor de impresión.

Arma tres piezas que corren en paralelo:
  1. Cliente MQTT — conexión saliente al broker. Apenas llega un ticket, lo
     encola Y lo manda a imprimir de inmediato (sin esperar ningún ciclo).
  2. Worker de impresión periódico — es solo una RED DE SEGURIDAD: reintenta
     lo que falló y recupera lo que quedó a medio camino si el proceso se
     reinició. El camino feliz (impresora respondiendo) no pasa por acá.
  3. Loop de sync — cuando hay conexión, avisa al cloud el resultado
     (impreso/fallido) de los trabajos ya resueltos.
"""
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import paho.mqtt.client as mqtt

import cola
import config
import printer
import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("main")

# Un hilo por impresora alcanza y sobra para despachar en paralelo sin saturar la Pi
_pool = ThreadPoolExecutor(max_workers=max(1, len(config.IMPRESORAS)))
_mqtt_conectado = threading.Event()


# --------------------------------------------------------------------------
# Cliente MQTT
# --------------------------------------------------------------------------

def _on_connect(client, userdata, flags, rc):
    if rc == 0:
        log.info("Conectado al broker MQTT (%s)", config.MQTT_HOST)
        _mqtt_conectado.set()
        client.subscribe(config.TOPIC_TICKETS, qos=1)
        client.publish(config.TOPIC_LWT, payload="online", qos=1, retain=True)
    else:
        log.error("Fallo al conectar al broker MQTT (rc=%s)", rc)


def _on_disconnect(client, userdata, rc):
    _mqtt_conectado.clear()
    log.warning("Desconectado del broker MQTT (rc=%s) — se sigue imprimiendo desde la cola local", rc)


def _on_message(client, userdata, msg):
    """
    Llega un ticket nuevo del cloud: se descompone por impresora, se guarda
    en la cola (ANTES de intentar imprimir nada — así nada se pierde si la Pi
    se cae a mitad de camino) y se despacha a imprimir DE INMEDIATO, en
    paralelo por impresora. El camarero no tiene que esperar el próximo tick
    del worker periódico para ver salir el ticket.
    """
    try:
        ticket = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        log.error("Mensaje MQTT inválido en %s, se descarta: %s", msg.topic, e)
        return

    ticket_id = ticket.get("ticket_id") or f"sin-id-{int(time.time() * 1000)}"
    trabajos = router.descomponer_ticket(ticket)

    if not trabajos:
        log.warning("Ticket %s sin ruta de impresión (zona=%s), se descarta", ticket_id, ticket.get("zona"))
        return

    for impresora, copias, sub_ticket in trabajos:
        trabajo_id = cola.encolar(ticket_id, impresora, copias, sub_ticket)
        # se marca 'en_progreso' para que el worker periódico no lo vuelva a
        # tomar en paralelo mientras este despacho inmediato está en curso
        cola.marcar_en_progreso(trabajo_id)
        _pool.submit(_imprimir_y_actualizar, trabajo_id, ticket_id, impresora, copias, sub_ticket, 0)

    log.info("Ticket %s encolado y despachado en %d trabajo(s)", ticket_id, len(trabajos))


def _construir_cliente_mqtt() -> mqtt.Client:
    client = mqtt.Client(client_id=config.MQTT_CLIENT_ID, protocol=mqtt.MQTTv311, clean_session=False)

    if config.MQTT_USER:
        client.username_pw_set(config.MQTT_USER, config.MQTT_PASS)
    if config.MQTT_USE_TLS:
        client.tls_set()  # usa los certificados CA del sistema (funciona con Let's Encrypt)

    # Last Will & Testament: si la Pi se cae sin desconectarse prolijamente
    # (corte de luz, crash), el BROKER publica esto en su nombre.
    client.will_set(config.TOPIC_LWT, payload="offline", qos=1, retain=True)

    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message

    # backoff exponencial entre reintentos de reconexión (1s -> 60s tope)
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    return client


# --------------------------------------------------------------------------
# Worker de impresión — corre siempre, con o sin internet
# --------------------------------------------------------------------------

def _imprimir_y_actualizar(trabajo_id: int, ticket_id: str, impresora: str, copias: int, payload: dict, intentos: int):
    """Núcleo compartido: imprime un trabajo y actualiza su estado en la cola.
    Lo llaman tanto el despacho inmediato (_on_message) como el worker periódico."""
    ok = printer.imprimir(impresora, copias, payload)
    if ok:
        cola.marcar_impreso(trabajo_id)
        log.info("Ticket %s impreso en %s", ticket_id, impresora)
        return

    cola.marcar_fallido(trabajo_id)
    if intentos + 1 >= config.MAX_REINTENTOS_IMPRESORA:
        log.error("Ticket %s: reintentos agotados en %s — queda como fallido definitivo", ticket_id, impresora)
    else:
        log.warning(
            "Ticket %s: fallo en %s (intento %d/%d), se reintenta",
            ticket_id, impresora, intentos + 1, config.MAX_REINTENTOS_IMPRESORA,
        )


def _procesar_trabajo(row):
    trabajo_id, ticket_id, impresora, copias, payload_json, intentos = row
    payload = json.loads(payload_json)
    _imprimir_y_actualizar(trabajo_id, ticket_id, impresora, copias, payload, intentos)


def _loop_worker():
    """Red de seguridad, NO el camino principal: recoge lo que el despacho
    inmediato no pudo resolver (reintentos de fallidos) o lo que quedó
    'en_progreso' de una corrida anterior que se cortó a mitad de camino."""
    while True:
        try:
            pendientes = cola.obtener_pendientes(config.MAX_REINTENTOS_IMPRESORA)
            if pendientes:
                # despacha todos los trabajos pendientes en paralelo (uno por impresora libre)
                list(_pool.map(_procesar_trabajo, pendientes))
        except Exception:
            log.exception("Error inesperado en el worker de impresión")
        time.sleep(config.INTERVALO_WORKER_SEG)


# --------------------------------------------------------------------------
# Sync de estado con el cloud — solo cuando hay conexión
# --------------------------------------------------------------------------

def _loop_sync(client: mqtt.Client):
    while True:
        if _mqtt_conectado.is_set():
            try:
                for trabajo_id, ticket_id, estado, intentos in cola.obtener_no_sincronizados():
                    topic = config.TOPIC_STATUS.format(ticket_id=ticket_id)
                    payload = json.dumps({"estado": estado, "intentos": intentos})
                    info = client.publish(topic, payload=payload, qos=1)
                    info.wait_for_publish(timeout=5)
                    cola.marcar_sincronizado(trabajo_id)
            except Exception:
                log.exception("Error sincronizando estado con el cloud")
        time.sleep(config.INTERVALO_WORKER_SEG)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    cola.init_db()
    recuperados = cola.requeue_en_progreso()
    if recuperados:
        log.warning("%d trabajo(s) quedaron 'en_progreso' de una corrida anterior, se reencolan", recuperados)

    client = _construir_cliente_mqtt()

    threading.Thread(target=_loop_worker, daemon=True, name="worker-impresion").start()
    threading.Thread(target=_loop_sync, args=(client,), daemon=True, name="sync-cloud").start()

    # loop de conexión: si el broker no está disponible al arrancar (ej. la Pi
    # bootea antes que la red esté lista), reintenta cada 10s en vez de morir
    while True:
        try:
            log.info("Conectando a %s:%s ...", config.MQTT_HOST, config.MQTT_PORT)
            client.connect(config.MQTT_HOST, config.MQTT_PORT, keepalive=30)
            client.loop_forever(retry_first_connection=True)
        except Exception:
            log.exception("No se pudo conectar al broker MQTT, reintentando en 10s")
            time.sleep(10)


if __name__ == "__main__":
    main()
