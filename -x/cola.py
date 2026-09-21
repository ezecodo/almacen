"""
Cola local persistente en SQLite.

Regla de oro: todo ticket que llega por MQTT se guarda ACÁ antes de intentar
imprimirse. Así, si la Pi se reinicia a mitad de una impresión, o la
impresora está caída, o se corta la luz, ningún ticket se pierde — queda
"pendiente" y el worker lo vuelve a intentar.

Nota: este módulo se llama `cola.py` (no `queue.py`) a propósito — un archivo
`queue.py` tapa al módulo `queue` de la librería estándar, y eso rompe
`concurrent.futures.ThreadPoolExecutor` (que main.py usa para el despacho en
paralelo), porque internamente hace `import queue` y encuentra el nuestro en
vez del real. Confirmado con un crash real al probar esto localmente.
"""
import json
import sqlite3
import time
from contextlib import contextmanager

import config


@contextmanager
def _conn():
    conn = sqlite3.connect(config.DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")  # permite leer/escribir desde varios hilos sin bloquearse
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS trabajos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT NOT NULL,
                impresora TEXT NOT NULL,
                copias INTEGER NOT NULL DEFAULT 1,
                payload TEXT NOT NULL,                     -- JSON del sub-ticket a imprimir
                estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | en_progreso | impreso | fallido
                intentos INTEGER NOT NULL DEFAULT 0,
                sincronizado INTEGER NOT NULL DEFAULT 0,   -- ¿ya le avisamos el resultado al cloud?
                creado_en REAL NOT NULL,
                actualizado_en REAL NOT NULL
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_estado ON trabajos(estado)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_sync ON trabajos(sincronizado)")


def encolar(ticket_id: str, impresora: str, copias: int, payload: dict) -> int:
    """Guarda un trabajo de impresión pendiente. Se llama ANTES de imprimir."""
    ahora = time.time()
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO trabajos (ticket_id, impresora, copias, payload, creado_en, actualizado_en) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (ticket_id, impresora, copias, json.dumps(payload), ahora, ahora),
        )
        return cur.lastrowid


def marcar_en_progreso(trabajo_id: int):
    """Se llama justo antes de despachar una impresión inmediata (al llegar el MQTT),
    para que el worker periódico no agarre el mismo trabajo dos veces en paralelo."""
    with _conn() as c:
        c.execute(
            "UPDATE trabajos SET estado='en_progreso', actualizado_en=? WHERE id=?",
            (time.time(), trabajo_id),
        )


def requeue_en_progreso():
    """Al arrancar el proceso, cualquier trabajo que haya quedado 'en_progreso' es de
    una corrida anterior que se cortó a mitad de camino (crash, corte de luz) — se
    devuelve a 'pendiente' para que el worker lo retome."""
    with _conn() as c:
        cur = c.execute(
            "UPDATE trabajos SET estado='pendiente', actualizado_en=? WHERE estado='en_progreso'",
            (time.time(),),
        )
        return cur.rowcount


def marcar_impreso(trabajo_id: int):
    with _conn() as c:
        c.execute(
            "UPDATE trabajos SET estado='impreso', actualizado_en=? WHERE id=?",
            (time.time(), trabajo_id),
        )


def marcar_fallido(trabajo_id: int):
    """Suma un intento fallido. El trabajo sigue en estado 'fallido' hasta agotar
    MAX_REINTENTOS_IMPRESORA — mientras tanto, obtener_pendientes() lo sigue devolviendo."""
    with _conn() as c:
        c.execute(
            "UPDATE trabajos SET estado='fallido', intentos=intentos+1, actualizado_en=? WHERE id=?",
            (time.time(), trabajo_id),
        )


def obtener_pendientes(max_intentos: int):
    """Trabajos a intentar ahora: los nuevos + los fallidos que no agotaron reintentos."""
    with _conn() as c:
        cur = c.execute(
            "SELECT id, ticket_id, impresora, copias, payload, intentos FROM trabajos "
            "WHERE estado='pendiente' OR (estado='fallido' AND intentos < ?) "
            "ORDER BY creado_en ASC",
            (max_intentos,),
        )
        return cur.fetchall()


def obtener_no_sincronizados():
    """Trabajos ya resueltos (impreso o con reintentos agotados) que el cloud todavía no conoce."""
    with _conn() as c:
        cur = c.execute(
            "SELECT id, ticket_id, estado, intentos FROM trabajos "
            "WHERE sincronizado = 0 AND ("
            "  estado = 'impreso' OR (estado = 'fallido' AND intentos >= ?)"
            ")",
            (config.MAX_REINTENTOS_IMPRESORA,),
        )
        return cur.fetchall()


def marcar_sincronizado(trabajo_id: int):
    with _conn() as c:
        c.execute("UPDATE trabajos SET sincronizado=1 WHERE id=?", (trabajo_id,))
