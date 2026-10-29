import { useEffect, useRef, useState } from 'react'
import type { Comanda, ComandaItem } from '../api'
import {
  alPasarEnPractica, cambiarLeccion, CLAVE_EVENTOS, dbPractica, entrarPractica, guardarLeccion, leccionEnCurso,
  practicaActiva, salirPractica, type DbPractica, type EventoPractica, type Gesto,
} from '../lib/practica'

// Asistente para aprender a usar la sala: lecciones cortas que se hacen en la sala de verdad en modo
// práctica (lib/practica.ts). Cada paso dice qué hacer, ilumina el botón (data-guia="…" en la
// pantalla) y pasa solo cuando el camarero lo hizo: lo sabe por lo que le llega al simulador o
// porque apareció en pantalla lo que abre ese botón.

interface Contexto {
  db: DbPractica
  eventos: EventoPractica[]          // lo que pasó desde que empezó este paso
  visible: (guia: string) => boolean // hay en pantalla un elemento con ese data-guia
  item: (e: EventoPractica) => ComandaItem | undefined
  comanda: (e: EventoPractica) => Comanda | undefined
}

interface Paso {
  texto: string | ((db: DbPractica) => string) // con función, puede nombrar algo de la práctica (el plato del alto)
  guia?: string | string[] // botón que se ilumina; con varios, el primero que esté en pantalla (ej. la copa, o si aún no se ve, la pestaña donde está)
  hecho: (c: Contexto) => boolean
}

export interface Leccion {
  id: string
  icono: string
  titulo: string
  resumen: string
  pasos: Paso[]
  final: string // lo que se le dice al terminar
}

const activa = (c: Comanda) => c.estado === 'abierta' || c.estado === 'enviada'
const yaComandado = (c: Comanda) => c.items.some(i => i.ronda >= 1 && !i.autoGenerado)
const hubo = (c: Contexto, tipo: EventoPractica['tipo']) => c.eventos.some(e => e.tipo === tipo)
const deslizo = (c: Contexto, nombre: Gesto) => c.eventos.some(e => e.tipo === 'gesto' && e.nombre === nombre)
// Locales con un solo salón: el paso de cambiar de salón no aplica
const unSoloSalon = () => document.querySelector('[data-salones="1"]') !== null

export const LECCIONES: Leccion[] = [
  {
    id: 'abrir',
    icono: '🪑',
    titulo: 'Abrir una mesa',
    resumen: 'Sentar a la gente y abrir su mesa',
    pasos: [
      {
        texto: 'Toca una mesa libre del mapa (las verdes).',
        hecho: c => c.visible('abrir-mesa') || hubo(c, 'abrir'),
      },
      {
        texto: 'Elige cuántas personas son con − y +, y toca «Abrir mesa» (si eres encargado, «Walk-in»).',
        guia: 'abrir-mesa',
        hecho: c => hubo(c, 'abrir'),
      },
      {
        texto: '¡Mesa abierta! Ahora se pediría. Como no vas a pedir nada, sal con la ✕ de arriba: la mesa vuelve a quedar libre sola.',
        guia: 'cerrar-mesa',
        hecho: c => hubo(c, 'vacia'),
      },
    ],
    final: 'Así se abre una mesa. Si la abres por error, sales sin pedir nada y vuelve a quedar libre.',
  },
  {
    id: 'pedir',
    icono: '🍽',
    titulo: 'Pedir platos',
    resumen: 'Cantidades, notas y quitar lo que sobra',
    pasos: [
      {
        texto: 'Abre una mesa libre para empezar.',
        hecho: c => c.db.comandas.some(activa),
      },
      {
        texto: 'En la carta, entra en una categoría y toca un plato DOS veces seguidas: así se piden 2.',
        hecho: c => c.eventos.some(e => (e.tipo === 'item' || e.tipo === 'itemEditado') && (c.item(e)?.cantidad ?? 0) >= 2 && c.item(e)?.nivel === null),
      },
      {
        texto: 'Ahora mantén apretado otro plato hasta que vibre, escribe una nota (por ejemplo «sin cebolla») y confírmala.',
        hecho: c => c.eventos.some(e => e.tipo === 'item' && !!c.item(e)?.nota),
      },
      {
        texto: 'Toca «COMANDA» arriba para ver lo pedido. Quita un plato con el −.',
        guia: 'pestana-comanda',
        hecho: c => hubo(c, 'itemEditado') || hubo(c, 'itemBorrado'),
      },
    ],
    final: 'Ya sabes pedir. Ojo: todavía no se mandó nada a cocina. Eso es el «Oído», un poco más adelante.',
  },
  {
    id: 'deslizar',
    icono: '👆',
    titulo: 'Deslizar para ir más rápido',
    resumen: 'Moverse por el mapa y la carta sin buscar botones',
    pasos: [
      {
        texto: 'En el mapa, desliza el dedo de lado (sobre un hueco, no sobre una mesa): cambias de salón. Desliza al otro lado para volver.',
        hecho: c => deslizo(c, 'salon') || unSoloSalon(),
      },
      {
        texto: 'Abre una mesa, entra en COMIDA y en una categoría. Ahora desliza hacia la IZQUIERDA: pasas a la siguiente categoría sin volver atrás.',
        hecho: c => deslizo(c, 'categoria-siguiente'),
      },
      {
        texto: 'Desliza hacia la DERECHA: vuelves un nivel, a las categorías.',
        hecho: c => deslizo(c, 'categoria-atras'),
      },
      {
        texto: 'Desliza otra vez de lado: vuelves a COMIDA / BEBIDAS.',
        hecho: c => deslizo(c, 'grupos-atras'),
      },
      {
        texto: 'Pide algo y toca «COMANDA» para verlo. Desde ahí, desliza de lado: vuelves a la carta sin buscar el botón.',
        guia: 'pestana-comanda',
        hecho: c => deslizo(c, 'pedido-carta'),
      },
      {
        texto: 'Ya en COMIDA / BEBIDAS, desliza una vez más: sales al mapa. Como hay algo sin comandar, te pregunta si lo descartas o lo comandas.',
        hecho: c => deslizo(c, 'salir-mapa'),
      },
    ],
    final: 'Resumen: a la izquierda avanzas (siguiente salón, siguiente categoría), a la derecha vuelves. Desde COMANDA, deslizar te lleva a la carta, y desde el primer nivel de la carta, al mapa. En el orden de salida, deslizar de lado lo cierra.',
  },
  {
    id: 'oido',
    icono: '✅',
    titulo: 'Mandar a cocina (Oído)',
    resumen: 'El orden de salida y el Oído',
    pasos: [
      {
        texto: 'Abre una mesa y pide un par de platos de comida.',
        hecho: c => c.db.comandas.some(x => activa(x) && x.items.some(i => i.nivel === null && !i.autoGenerado && i.tipo === 'cocina')),
      },
      {
        texto: 'Entra en la mesa y toca la viñeta verde de abajo: es el «Oído».',
        guia: 'oido',
        hecho: c => c.visible('ordenar-oido') || hubo(c, 'enviar'),
      },
      {
        texto: 'Este es el orden de salida: lo de arriba sale primero. Mueve un plato con ▲▼ si quieres y toca la viñeta para mandarlo.',
        guia: 'ordenar-oido',
        hecho: c => hubo(c, 'enviar'),
      },
    ],
    final: '¡Oído! En un servicio de verdad ahora sale el ticket en cocina. En la práctica no se imprime nada.',
  },
  {
    id: 'marcha',
    icono: '🔁',
    titulo: 'Marcha pasa',
    resumen: 'Cuando la mesa vuelve a pedir',
    pasos: [
      {
        texto: 'Necesitas una mesa ya comandada. Si no tienes, abre una, pide algo y da el Oído.',
        hecho: c => c.db.comandas.some(x => activa(x) && yaComandado(x)),
      },
      {
        texto: 'La mesa vuelve a pedir: entra en ella y añade algo más.',
        hecho: c => c.eventos.some(e => e.tipo === 'item' && !!c.comanda(e) && yaComandado(c.comanda(e)!)),
      },
      {
        texto: 'Toca el Oído (la viñeta verde) otra vez. En cocina sale solo lo nuevo, como «marcha pasa».',
        guia: 'oido',
        hecho: c => c.eventos.some(e => e.tipo === 'enviar' && !!c.comanda(e)?.items.some(i => i.ronda >= 2)),
      },
    ],
    final: 'Cada Oído manda solo lo que faltaba. Lo que ya salió no se repite.',
  },
  {
    id: 'cuenta',
    icono: '🧾',
    titulo: 'La cuenta',
    resumen: 'Imprimir la cuenta y dejar la mesa libre',
    pasos: [
      {
        texto: 'Necesitas una mesa comandada y sin nada pendiente. Si no tienes, abre una, pide y da el Oído.',
        hecho: c => c.db.comandas.some(x => x.estado === 'enviada' && yaComandado(x)),
      },
      {
        texto: 'Piden la cuenta: entra en la mesa y toca «Ver cuenta».',
        guia: 'ver-cuenta',
        hecho: c => c.visible('entregar-cuenta') || hubo(c, 'facturar'),
      },
      {
        texto: 'Revisa que esté todo y toca «Entregar cuenta». La mesa se pone roja: cuenta entregada, falta que el encargado la cobre.',
        guia: 'entregar-cuenta',
        hecho: c => hubo(c, 'facturar'),
      },
      {
        texto: 'Los de esta mesa se van y ya se sientan otros, pero el encargado todavía no la cobró. Entra en la mesa roja y toca «Mesa libre».',
        guia: 'mesa-libre',
        hecho: c => hubo(c, 'liberar'),
      },
      {
        texto: 'La cuenta de los de antes no se pierde: pasa a los cobros del encargado. Ahora abre la mesa para los nuevos: elige cuántos son y toca «Abrir mesa».',
        guia: 'abrir-mesa',
        // En la misma mesa que se acaba de dejar libre con la cuenta sin cobrar
        hecho: c => c.eventos.some(e => e.tipo === 'abrir'
          && c.db.comandas.some(x => x.estado === 'liberada' && x.mesaId === c.comanda(e)?.mesaId)),
      },
    ],
    final: 'Al tocar esa mesa se abre la de los nuevos. El marco rojo de dentro avisa de que los de antes siguen sin cobrar, hasta que el encargado lo cierre.',
  },
  {
    id: 'altos',
    icono: '🚫',
    titulo: 'Platos agotados (ALTO)',
    resumen: 'Cuando se acaba un plato en pleno servicio',
    pasos: [
      {
        texto: db => `Se acabó ${db.alto ? `«${db.alto.nombre}»` : 'un plato'} y el encargado lo marcó como ALTO. Mira la franja roja de abajo del mapa y tócala: ahí está todo lo que se acabó.`,
        guia: 'franja-altos',
        hecho: c => c.visible('lista-altos') || c.visible('plato-agotado'),
      },
      {
        texto: db => `Abre una mesa y busca ${db.alto ? `«${db.alto.nombre}» (está en ${db.alto.categoria})` : 'ese plato'} en la carta: sale tachado y no se puede pedir.`,
        guia: 'plato-agotado',
        hecho: c => c.visible('plato-agotado'),
      },
    ],
    final: 'Mientras dure el alto, ese plato no se puede pedir desde ningún teléfono, y si alguien ya lo tenía sin comandar, la mesa avisa para quitarlo antes del Oído. Cuando cocina lo repone, el encargado lo quita (y al cerrar el turno vuelve toda la carta).',
  },
  {
    id: 'vinos',
    icono: '🍷',
    titulo: 'El asistente de vinos',
    resumen: 'Recomendar una botella que vaya con lo que comen',
    pasos: [
      {
        texto: 'Abre una mesa y pide un par de platos de comida: el asistente recomienda según lo que comen.',
        hecho: c => c.db.comandas.some(x => activa(x) && x.items.some(i => i.tipo === 'cocina' && !i.autoGenerado)),
      },
      {
        texto: 'Entra en la mesa, ve a COMANDA y toca la copa granate. Late mientras la mesa no tiene botella, para que no se te olvide ofrecer vino.',
        guia: ['boton-vino', 'pestana-comanda'],
        hecho: c => c.visible('asistente-vinos'),
      },
      {
        texto: 'Elige el color que quieren (tinto, blanco…). Si el cliente pide algo concreto («con cuerpo», «seco»…), márcalo también.',
        hecho: c => c.visible('vino-sugerido') || c.visible('vinos-sin-calcular'),
      },
      {
        texto: 'Primero salen los más caros que encajan; con ⭐ el que mejor va. Con «🔊 English» se lo lees al cliente. Toca «+ Añadir a la mesa» en uno.',
        guia: 'vino-anadir',
        hecho: c => c.visible('vinos-sin-calcular') || c.eventos.some(e => e.tipo === 'item' && c.item(e)?.tipo === 'barra'),
      },
    ],
    final: 'La botella entra en barra y sale con el próximo Oído. Las recomendaciones salen de cruzar lo que comen con la carta de vinos: siempre son vinos que hay.',
  },
]

// ── Progreso (por ahora en el teléfono, por empleado) ──────────────────────────────────────

const claveProgreso = (empleadoId: number) => `oidoops_lecciones_${empleadoId}`

export function leccionesHechas(empleadoId: number): string[] {
  try { return JSON.parse(localStorage.getItem(claveProgreso(empleadoId)) ?? '[]') as string[] } catch { return [] }
}
function marcarHecha(empleadoId: number, id: string) {
  const hechas = leccionesHechas(empleadoId)
  if (hechas.includes(id)) return
  try { localStorage.setItem(claveProgreso(empleadoId), JSON.stringify([...hechas, id])) } catch { /* nada */ }
}

function empleadoSesion(): number | null {
  try {
    const s = JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? 'null') as { id?: number } | null
    return s?.id ?? null
  } catch { return null }
}

// ── Lista de lecciones (se abre desde el perfil) ─────────────────────────────────────────

export function LeccionesPanel({ empleadoId, onClose }: { empleadoId: number; onClose: () => void }) {
  const hechas = leccionesHechas(empleadoId)
  const enPractica = practicaActiva()
  const actual = leccionEnCurso()?.leccion
  const siguiente = LECCIONES.find(l => !hechas.includes(l.id))

  const empezar = (id: string) => enPractica ? cambiarLeccion(id) : entrarPractica(id)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-[75]" onClick={onClose}>
      <div className="w-full text-left bg-[var(--sala-hdr)] rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--sala-btna)]" />
        </div>
        <div className="px-5 pt-2 pb-4 border-b border-[var(--sala-brd)] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[var(--sala-txt)] font-bold text-lg">🎓 Aprender a usar OidoOps</h2>
            <p className="text-[var(--sala-tx3)] text-xs mt-0.5">
              Se practica en la sala de verdad, pero nada es real: no se imprime nada ni cuenta en la caja.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
          <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wide">
            Camarero · básico · {hechas.filter(h => LECCIONES.some(l => l.id === h)).length}/{LECCIONES.length}
          </p>
          {LECCIONES.map((l, n) => {
            const hecha = hechas.includes(l.id)
            const esSiguiente = siguiente?.id === l.id
            return (
              <button key={l.id} onClick={() => empezar(l.id)}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-transform ${esSiguiente ? 'border-2 border-[#4CC8A0] bg-[#4CC8A0]/10' : 'bg-[var(--sala-srf)] border-2 border-transparent'}`}>
                <span className={`shrink-0 grid place-items-center w-11 h-11 rounded-xl text-xl ${hecha ? 'bg-[#4CC8A0]/20' : 'bg-[var(--sala-btn2)]'}`}>
                  {hecha ? '✓' : l.icono}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[var(--sala-txt)] font-bold">{n + 1}. {l.titulo}</span>
                  <span className="block text-[var(--sala-tx3)] text-xs">{l.resumen}</span>
                </span>
                <span className={`shrink-0 text-xs font-bold ${esSiguiente ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx3)]'}`}>
                  {actual === l.id ? 'En curso' : hecha ? 'Repetir' : esSiguiente ? 'Empezar ›' : '›'}
                </span>
              </button>
            )
          })}
        </div>

        {enPractica && (
          <div className="px-5 pb-5 pt-2">
            <button onClick={salirPractica}
              className="w-full py-3 rounded-2xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-bold">
              Salir de la práctica
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Guía durante la práctica ─────────────────────────────────────────────────────────────

function existe(guia: string): Element | null {
  const el = document.querySelector(`[data-guia="${guia}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? el : null
}

export function GuiaPractica({ onVerLecciones }: { onVerLecciones: () => void }) {
  const [estado, setEstado] = useState(leccionEnCurso)
  const [marco, setMarco] = useState<DOMRect | null>(null)
  const [plegada, setPlegada] = useState(false)
  // Eventos del paso en curso (sobreviven a una recarga dentro de la lección)
  const eventos = useRef<EventoPractica[]>((() => {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_EVENTOS) ?? '[]') as EventoPractica[] } catch { return [] }
  })())

  const leccion = LECCIONES.find(l => l.id === estado?.leccion)
  const indice = leccion ? LECCIONES.indexOf(leccion) : -1
  const siguiente = indice >= 0 ? LECCIONES[indice + 1] : undefined
  const terminada = !!leccion && !!estado && estado.paso >= leccion.pasos.length
  const paso = leccion && estado && !terminada ? leccion.pasos[estado.paso] : undefined
  // El texto puede depender de la práctica (el plato del alto lo elige el simulador al cargar el mapa)
  const textoDe = (p?: Paso) => typeof p?.texto === 'function' ? p.texto(dbPractica()) : p?.texto ?? ''
  const [texto, setTexto] = useState(() => textoDe(paso))

  // Revisa si el paso en curso (y los siguientes) ya se hicieron
  const revisar = useRef<() => void>(() => {})
  revisar.current = () => {
    if (!leccion || !estado || terminada) return
    const db = dbPractica()
    const comanda = (e: EventoPractica) => db.comandas.find(c => c.id === e.comandaId)
    let n = estado.paso
    while (n < leccion.pasos.length) {
      const ctx: Contexto = {
        db, eventos: eventos.current, visible: g => !!existe(g), comanda,
        item: e => 'itemId' in e ? comanda(e)?.items.find(i => i.id === e.itemId) : undefined,
      }
      if (!leccion.pasos[n].hecho(ctx)) break
      n++
    }
    if (n === estado.paso) return
    // El paso nuevo solo mira lo que pase desde ahora (lo que acaba de pasar sí vale para encadenar
    // varios pasos de golpe, como un Oído directo que se salta el orden de salida)
    eventos.current = []
    try { sessionStorage.setItem(CLAVE_EVENTOS, JSON.stringify(eventos.current)) } catch { /* nada */ }
    const nuevo = { ...estado, paso: n }
    guardarLeccion(nuevo)
    setEstado(nuevo)
    setPlegada(false)
    navigator.vibrate?.(n >= leccion.pasos.length ? [40, 60, 40] : 25)
    if (n >= leccion.pasos.length) {
      const emp = empleadoSesion()
      if (emp) marcarHecha(emp, leccion.id)
    }
  }

  useEffect(() => alPasarEnPractica(e => {
    eventos.current = [...eventos.current, e]
    try { sessionStorage.setItem(CLAVE_EVENTOS, JSON.stringify(eventos.current)) } catch { /* nada */ }
    revisar.current()
  }), [])

  // Algunos pasos se cumplen al aparecer algo en pantalla, y el marco sigue al botón si se mueve
  useEffect(() => {
    const medir = () => {
      const guias = paso?.guia ? [paso.guia].flat() : []
      const el = guias.map(existe).find(Boolean) ?? null
      const r = el?.getBoundingClientRect() ?? null
      setMarco(m => (!r && !m) || (r && m && r.x === m.x && r.y === m.y && r.width === m.width && r.height === m.height) ? m : r)
    }
    const escribir = () => { const t = textoDe(paso); setTexto(v => v === t ? v : t) }
    medir() // al cambiar de paso, sin esperar: el marco del paso anterior no se queda colgado
    escribir()
    const t = setInterval(() => { revisar.current(); medir(); escribir() }, 300)
    return () => clearInterval(t)
  }, [paso])

  if (!leccion || !estado) return null

  // La tarjeta va en la mitad de la pantalla contraria al botón iluminado, para no taparlo
  // (al terminar se queda arriba: que no salte justo cuando se va a tocar "Siguiente")
  const abajo = !terminada && !!marco && marco.top + marco.height / 2 < window.innerHeight / 2

  return (
    <>
      {/* Marco de toda la pantalla: se ve siempre que no es de verdad */}
      <div className="fixed inset-0 z-[280] pointer-events-none border-[3px] border-amber-400/80" />

      {marco && !terminada && (
        <div className="fixed z-[290] pointer-events-none rounded-2xl border-[3px] border-amber-400 guia-latido"
          style={{ left: marco.left - 6, top: marco.top - 6, width: marco.width + 12, height: marco.height + 12 }} />
      )}

      {plegada && !terminada ? (
        <button onClick={() => setPlegada(false)}
          className={`fixed z-[300] left-1/2 -translate-x-1/2 ${abajo ? 'bottom-3' : 'top-3'} px-4 py-2 rounded-full bg-amber-400 text-black text-sm font-black shadow-xl`}>
          🎓 Paso {estado.paso + 1}/{leccion.pasos.length} · ver
        </button>
      ) : (
        <div className={`fixed z-[300] inset-x-2 ${abajo ? 'bottom-3' : 'top-3'} mx-auto max-w-md rounded-2xl bg-[#111827] text-white shadow-2xl border-2 border-amber-400`}>
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <span className="text-amber-400 text-[11px] font-black uppercase tracking-wider truncate">
              🎓 Práctica · {leccion.titulo}
            </span>
            <span className="flex items-center gap-3 shrink-0">
              {!terminada && <button onClick={() => setPlegada(true)} className="text-white/60 text-xs font-bold">Ocultar</button>}
              <button onClick={salirPractica} className="text-white/60 text-xs font-bold">Salir</button>
            </span>
          </div>

          {terminada ? (
            <div className="px-4 pt-2 pb-4">
              <p className="text-xl font-black">✓ ¡Lección hecha!</p>
              <p className="text-white/80 text-sm mt-1">{leccion.final}</p>
              <div className="flex gap-2 mt-3">
                {siguiente ? (
                  <button onClick={() => cambiarLeccion(siguiente.id)}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-black"
                    style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                    Siguiente: {siguiente.titulo} ›
                  </button>
                ) : (
                  <button onClick={salirPractica}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-black"
                    style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                    Terminar la práctica
                  </button>
                )}
                <button onClick={onVerLecciones} className="px-4 py-2.5 rounded-xl bg-white/10 text-sm font-bold">Lecciones</button>
              </div>
            </div>
          ) : (
            <div className="px-4 pt-2 pb-3">
              <p className="text-base font-bold leading-snug">{texto}</p>
              <div className="flex gap-1.5 mt-3">
                {leccion.pasos.map((_, n) => (
                  <span key={n} className={`h-1.5 rounded-full transition-all ${n < estado.paso ? 'w-4 bg-[#4CC8A0]' : n === estado.paso ? 'w-8 bg-amber-400' : 'w-4 bg-white/20'}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
