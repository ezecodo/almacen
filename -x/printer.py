"""
Envío de tickets a las impresoras térmicas ESC/POS por TCP (puerto 9100).

Cada llamada a imprimir() abre una conexión nueva, imprime y cierra —
no mantenemos sockets abiertos entre tickets porque las Epson TM-T20II
no lo requieren y evita arrastrar una conexión zombie si la impresora
se reinició.
"""
import logging
from datetime import datetime

from escpos.exceptions import Error as EscposError
from escpos.printer import Network

import config

log = logging.getLogger("printer")


def _construir_ticket(printer: Network, ticket: dict, impresora_nombre: str):
    """Arma el contenido del ticket: cabecera (mesa/camarero/hora), items, pie."""
    printer.set(align="center", bold=True, width=2, height=2)
    printer.text(f"{ticket.get('zona', '')} - MESA {ticket.get('mesa', '?')}\n")

    printer.set(align="left", bold=False, width=1, height=1)
    printer.text(f"Camarero: {ticket.get('camarero', '-')}\n")
    printer.text(f"Hora: {ticket.get('timestamp', datetime.now().isoformat())}\n")
    printer.text("-" * 32 + "\n")

    for item in ticket.get("items", []):
        cantidad = item.get("cantidad", 1)
        nombre = item.get("nombre", "?")
        printer.set(bold=True, width=1, height=1)
        printer.text(f"{cantidad}x {nombre}\n")
        if item.get("notas"):
            printer.set(bold=False)
            printer.text(f"   * {item['notas']}\n")

    printer.text("-" * 32 + "\n")
    printer.set(align="center", bold=False)
    printer.text(f"[{impresora_nombre}]\n")
    printer.cut()


def imprimir(impresora_nombre: str, copias: int, ticket: dict) -> bool:
    """
    Intenta imprimir `copias` copias del ticket en la impresora dada.
    Devuelve True si salió bien, False si falló — el llamador (main.py)
    decide qué hacer con el fallo (reintentar vía la cola).
    """
    destino = config.IMPRESORAS.get(impresora_nombre)
    if destino is None:
        log.error("Impresora desconocida en config.IMPRESORAS: %s", impresora_nombre)
        return False

    printer = None
    try:
        # timeout corto: si la impresora está apagada/caída, no queremos
        # que un solo trabajo bloquee el resto de la cola por mucho tiempo
        printer = Network(destino["ip"], port=destino["puerto"], timeout=5)
        for _ in range(max(1, copias)):
            _construir_ticket(printer, ticket, impresora_nombre)
        return True
    except (EscposError, OSError, TimeoutError) as e:
        log.warning("Fallo imprimiendo en %s (%s:%s): %s", impresora_nombre, destino["ip"], destino["puerto"], e)
        return False
    except Exception:
        # cualquier otro error (payload raro, etc.) no debe tirar abajo el worker
        log.exception("Error inesperado imprimiendo en %s", impresora_nombre)
        return False
    finally:
        if printer is not None:
            try:
                printer.close()
            except Exception:
                pass  # si la conexión ya se cayó, no hay nada que cerrar
