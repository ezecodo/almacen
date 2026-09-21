"""
Lógica de enrutamiento: traduce un ticket (con items de una o varias zonas/tipos)
en la lista concreta de trabajos de impresión a despachar.
"""
import config


def enrutar(zona: str, tipo: str):
    """
    Devuelve [(impresora, copias), ...] para una zona + tipo de item dados.
    Ej: enrutar("PA", "Comida") -> [("cocina_pb", 2), ("planta_alta", 1)]
    Si no hay ruta configurada, devuelve lista vacía (no se imprime en ningún lado).
    """
    return config.ENRUTAMIENTO.get((zona, tipo), [])


def descomponer_ticket(ticket: dict):
    """
    Agrupa los items del ticket por tipo (Bebida/Comida) y genera un trabajo
    de impresión por cada (impresora, sub-ticket) que corresponda según la
    tabla de enrutamiento. Devuelve una lista de tuplas (impresora, copias, sub_ticket).
    """
    zona = ticket.get("zona")
    items_por_tipo = {}
    for item in ticket.get("items", []):
        tipo = item.get("tipo", "Comida")
        items_por_tipo.setdefault(tipo, []).append(item)

    trabajos = []
    for tipo, items in items_por_tipo.items():
        destinos = enrutar(zona, tipo)
        if not destinos:
            continue  # zona/tipo sin ruta configurada
        sub_ticket = {**ticket, "items": items}
        for impresora, copias in destinos:
            trabajos.append((impresora, copias, sub_ticket))
    return trabajos
