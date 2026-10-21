import { Fragment, useState, useEffect, useRef, createContext, useContext } from 'react'

const ThemeCtx = createContext<boolean>(true) // true = dark
// Puesto TPV (/tpv, tablet compartida): el PIN vale para una sola acción. Cobrar llama a esta
// función, que devuelve la tablet al PIN; fuera del TPV es null y no hace nada.
const TpvCtx = createContext<(() => void) | null>(null)
import CheckOverlay from '../components/CheckOverlay'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Alergeno, Comanda, ComandaItem, FloorPlan, GrupoAgendado, GrupoMenuTemplate, InventarioCategoria, Mesa, MenuCategoria, MenuItem, MermaMotivo, MiTurno, ItemAgotado, Reserva, Turno, WikiCategoria, WikiArticulo, ChecklistSector, sugerirCantidadesMenu, totalComanda, valorItem, waLink, esAvisoBox } from '../api'
import { speak, VozSelector, LANGS, Lang } from '../lib/tts'
import { alternarCorteSimulado } from '../lib/conexion'
import { useSalaEnModoLocal } from '../lib/instalacion'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'
import { usePoolEvents } from '../hooks/usePoolEvents'
import FacturasSala from '../components/FacturasSala'
import GastosSala from '../components/GastosSala'
import PropinasSala, { QK_PROPINAS_ENC } from '../components/PropinasSala'
import MaridajeSheet from '../components/MaridajeSheet'
import BotonVino from '../components/BotonVino'
import NivelEtiqueta, { bloqueDePlato, nombreNivel, tituloNivel } from '../components/NivelEtiqueta'

const POOL_LOCK_TIMEOUT_MS = 10 * 60 * 1000 // debe coincidir con POOL_LOCK_TIMEOUT_MS del backend
function lockActivoPool(r: Reserva) {
  if (!r.poolGestionandoPor || !r.poolGestionandoDesde) return false
  return Date.now() - new Date(r.poolGestionandoDesde).getTime() < POOL_LOCK_TIMEOUT_MS
}

const SQUARE_SIZE = 80
const RECT_W = 160
const RECT_H = 80
const SILLA_ALTA_SIZE = 56

const ELEM_DECO = ['pared', 'columna', 'ventana', 'entrada'] as const
const isElemDeco = (tipo: string) => (ELEM_DECO as readonly string[]).includes(tipo)

const ELEM_STYLES: Record<string, { bg: string; border: string; label: string }> = {
  pared:   { bg: '#111827', border: '#4b5563', label: 'PARED' },
  columna: { bg: '#0d1117', border: '#374151', label: 'COLUMNA' },
  ventana: { bg: '#0c1a2e', border: '#1d4ed8', label: 'VENTANA' },
  entrada: { bg: '#0f1c0d', border: '#4d7c0f', label: 'ENTRADA' },
}

function mesaWidth(mesa: Mesa): number {
  if (mesa.tipo === 'barra' || isElemDeco(mesa.tipo)) return mesa.ancho ?? 240
  if (mesa.tipo === 'silla_alta')  return mesa.ancho ?? SILLA_ALTA_SIZE
  if (mesa.tipo === 'rectangular') return mesa.ancho ?? RECT_W
  return mesa.ancho ?? SQUARE_SIZE
}
function mesaHeight(mesa: Mesa): number {
  if (mesa.tipo === 'barra' || isElemDeco(mesa.tipo)) return mesa.alto ?? 80
  if (mesa.tipo === 'silla_alta')  return mesa.ancho ?? SILLA_ALTA_SIZE  // siempre cuadrada
  if (mesa.tipo === 'rectangular') return mesa.alto ?? RECT_H
  return mesa.ancho ?? SQUARE_SIZE  // round/square siempre cuadrada
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// Sugerencia de nivel de salida por categoría — matching tolerante (regex, NO nombres exactos):
// sobrevive a renombres ES/EN, mayúsculas y variantes ('Classic Tapas', 'CLASICAS', 'Carnes'…)
const NIVEL_PATTERNS: Array<[RegExp, number]> = [
  [/clasic|classic/i,   1],
  [/veget/i,            2],
  [/pescad|fish/i,      3],
  [/carne|meat/i,       4],
  [/arroz|rice/i,       4],
  [/pasta/i,            5],
]
const COLD_KEYWORDS = ['tartare','tatar','tártar','burrata','stracciatella','carpaccio','anchovies','anchoa','ham','cheese','queso','salchichón','jamón','crudo']

// Secciones cuyo contenido sale por barra (no cocina). Matching tolerante:
// cubre 'Bebidas', 'Vinos', 'Vinos Botella', 'VINOS'… sin depender del nombre exacto.
const esGrupoBarra = (g: string) => /vino|bebida/i.test(g)

// Umbrales de swipe relativos al tamaño real de pantalla (no px fijos) — un mismo gesto
// físico cubre una fracción de pantalla muy distinta en un teléfono que en una tablet
// grande tipo SUNMI, así que un valor fijo (ej: 80px) queda mal calibrado en una u otra.
function swipeThresholds() {
  return {
    dx: Math.max(60, window.innerWidth * 0.12),
    dy: Math.max(50, window.innerHeight * 0.08),
  }
}

function suggestNivel(nombre: string, menu: MenuItem[]): number {
  const categoria = menu.find(m => m.nombre === nombre)?.categoria ?? ''
  const base = NIVEL_PATTERNS.find(([re]) => re.test(categoria))?.[1] ?? 3
  const isCold = COLD_KEYWORDS.some(kw => nombre.toLowerCase().includes(kw))
  return isCold && base > 1 ? base - 1 : base
}

// Niveles de salida propuestos para los platos de una mesa: los ya comandados conservan el suyo;
// los nuevos, el sugerido por su categoría. Los de "bloque propio" (POSTRES) van detrás de todo,
// un nivel por bloque. En una mesa sin nada comandado los niveles quedan seguidos desde PRIMEROS.
// Lo usan el orden de salida (al dar Oído) y la columna de la mesa del TPV, que lo enseña en vivo.
function nivelesPropuestos(items: ComandaItem[], menu: MenuItem[], categorias: MenuCategoria[]): Record<number, number> {
  const r: Record<number, number> = {}
  items.forEach(i => { r[i.id] = i.nivel ?? suggestNivel(i.nombre, menu) })
  const cocina = items.filter(i => i.tipo !== 'barra' && !i.autoGenerado)
  const bloqueDe = (nombre: string) => bloqueDePlato(nombre, menu, categorias)
  const pendientesBloque = cocina.filter(i => i.nivel == null && bloqueDe(i.nombre))
  if (pendientesBloque.length) {
    const deBloque = new Set(pendientesBloque.map(i => i.id))
    const ultimo = Math.max(0, ...cocina.filter(i => !deBloque.has(i.id)).map(i => r[i.id]))
    const bloques = [...new Set(pendientesBloque.map(i => bloqueDe(i.nombre) as string))]
    for (const i of pendientesBloque) r[i.id] = ultimo + 1 + bloques.indexOf(bloqueDe(i.nombre) as string)
  }
  if (!cocina.some(i => i.nivel != null)) {
    const usados = [...new Set(cocina.map(i => r[i.id]))].sort((a, b) => a - b)
    for (const i of cocina) r[i.id] = usados.indexOf(r[i.id]) + 1
  }
  return r
}

// Colores de cada estado de mesa, como un semáforo (idea de Eze, 2026-10-21): libre verde, comandada
// ámbar, cuenta impresa rojo. La abierta sin comandar queda aparte, verde agua sobre azul. Los usan
// el mapa (MesaBtn) y el panel del encargado del TPV.
function coloresMesa(estado: 'libre' | Comanda['estado'], isDark: boolean) {
  if (estado === 'enviada') return { bg: isDark ? '#3a2a08' : '#fef3c7', borde: '#f59e0b', texto: isDark ? '#fbbf24' : '#b45309' }
  if (estado === 'abierta') return { bg: isDark ? '#0f2240' : '#dbeafe', borde: '#4CC8A0', texto: isDark ? '#4CC8A0' : '#0d9488' }
  if (estado === 'facturada') return { bg: isDark ? '#3a1414' : '#fee2e2', borde: '#ef4444', texto: isDark ? '#f87171' : '#dc2626' }
  return { bg: isDark ? '#1a3828' : '#dcfce7', borde: '#22c55e', texto: '#16a34a' } // libre, liberada, cerrada
}
// Marco interior "falta cobrar" (cuenta impresa de los de antes): rojo, como la cuenta impresa
const COLOR_SIN_COBRAR = '#ef4444'

// Iconos de línea de la esquina de la mesa (en vez de los emoji 📅 / 🚶): heredan el color del texto
function IconoReserva({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
      <path d="m8.5 15 2.5 2.5 4.5-4.5" />
    </svg>
  )
}
function IconoWalkin({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="13.5" cy="4" r="2" fill="currentColor" stroke="none" />
      <path d="M9 21l2.5-6 2.5 2.5V21" />
      <path d="M11.5 15l1-6.5 3 3 3 1" />
      <path d="M12.5 8.5L9 10l-1.5 3.5" />
    </svg>
  )
}

// ── Mesa visual ───────────────────────────────────────────────────────────────
// pendienteCobro: la mesa tiene además una cuenta impresa sin cobrar (los de antes) mientras ya se
// sentaron otros → un segundo marco rojo por dentro, más chico, con su aureola.
function MesaBtn({ mesa, comanda, pendienteCobro = false, onClick }: { mesa: Mesa; comanda?: Comanda; pendienteCobro?: boolean; onClick: () => void }) {
  const isDark = useContext(ThemeCtx)
  const w = mesaWidth(mesa)
  const h = mesaHeight(mesa)

  // Elementos decorativos — no interactivos, solo referencia visual
  if (isElemDeco(mesa.tipo)) {
    const def = ELEM_STYLES[mesa.tipo]
    return (
      <div style={{
        position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
        borderRadius: 6, background: def.bg, border: `2px solid ${def.border}`,
        opacity: 0.7, pointerEvents: 'none', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: def.border, fontWeight: 800, fontSize: 10, letterSpacing: '0.1em' }}>{def.label}</span>
      </div>
    )
  }

  const libre      = !comanda
  const facturada  = comanda?.estado === 'facturada'
  const isRound    = mesa.tipo === 'round' || mesa.tipo === 'silla_alta'

  const isSillaAlta = mesa.tipo === 'silla_alta'

  // Semáforo: libre verde, comandada ámbar, cuenta impresa rojo (abierta sin comandar, verde agua)
  const { bg, borde: border, texto } = coloresMesa(comanda?.estado ?? 'libre', isDark)
  const glow   = isDark
    ? (libre ? `0 0 16px ${border}88, 0 0 32px ${border}22` : `0 0 20px ${border}99, 0 0 40px ${border}33`)
    : 'none'

  return (
    <div onClick={onClick} style={{
      position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
      borderRadius: isRound ? '50%' : '6px',
      background: bg, border: `2px solid ${border}`, boxShadow: glow,
      cursor: 'pointer', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', userSelect: 'none',
      transition: 'all 0.2s',
      transform: mesa.rotacion ? `rotate(${mesa.rotacion}deg)` : undefined,
      transformOrigin: 'center center',
    }}>
      {comanda?.reserva && (
        <span title={comanda.reserva.origen === 'walkin' ? 'Walk-in' : `Reserva ${comanda.reserva.nombre ?? ''} ${comanda.reserva.hora}`} style={{
          position: 'absolute', top: -9, right: -9, width: 20, height: 20, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          color: comanda.reserva.origen === 'walkin' ? '#94a3b8' : '#38bdf8',
          background: isDark ? '#0b1220' : '#ffffff', border: '1.5px solid currentColor',
          transform: mesa.rotacion ? `rotate(${-mesa.rotacion}deg)` : undefined, pointerEvents: 'none', zIndex: 1,
        }}>{comanda.reserva.origen === 'walkin' ? <IconoWalkin /> : <IconoReserva />}</span>
      )}
      {pendienteCobro && (
        <div title="Cuenta sin cobrar" style={{
          position: 'absolute', inset: 4, borderRadius: isRound ? '50%' : '4px',
          border: `2px solid ${COLOR_SIN_COBRAR}`, pointerEvents: 'none',
          boxShadow: isDark ? `0 0 10px ${COLOR_SIN_COBRAR}cc, inset 0 0 8px ${COLOR_SIN_COBRAR}66` : `0 0 6px ${COLOR_SIN_COBRAR}99, inset 0 0 5px ${COLOR_SIN_COBRAR}55`,
        }} />
      )}
      <div style={{ transform: mesa.rotacion ? `rotate(${-mesa.rotacion}deg)` : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{
          color: texto,
          fontWeight: 800, fontSize: isSillaAlta ? 14 : 18,
        }}>
          {mesa.numero}
        </span>
        {!libre && !facturada && (
          <span style={{
            color: texto, opacity: 0.85,
            fontSize: 9, marginTop: 1,
          }}>{timeAgo(comanda!.createdAt)}</span>
        )}
      </div>
    </div>
  )
}

// ── Modal abrir mesa ──────────────────────────────────────────────────────────
// Encargado: en vez de "Abrir mesa" elige 🚶 Walk-in (queda en el libro de reservas del día) o
// 📅 Tiene reserva (lista de las de hoy sin sentar → se sienta esa). El camarero abre como siempre.
function AbrirMesaModal({ mesa, onConfirm, onMenuGrupo, onClose, reservas, onWalkin, onReserva }: {
  mesa: Mesa; onConfirm: (pax: number) => void; onMenuGrupo?: (pax: number) => void; onClose: () => void
  reservas?: Reserva[]; onWalkin?: (pax: number) => void; onReserva?: (reserva: Reserva, pax: number) => void
}) {
  const [pax, setPax] = useState(2)
  const [paxTocado, setPaxTocado] = useState(false)
  const [eligiendoReserva, setEligiendoReserva] = useState(false)
  const cambiarPax = (n: number) => { setPax(n); setPaxTocado(true) }

  // Primero las que ya tenían esta mesa asignada; después, la más cercana a la hora de ahora
  const ahora = new Date().getHours() * 60 + new Date().getMinutes()
  const minutos = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + (mm || 0) }
  const pendientes = (reservas ?? [])
    .filter(r => r.estado === 'confirmada' && !r.enPool)
    .sort((a, b) => (Number(b.mesaId === mesa.id) - Number(a.mesaId === mesa.id))
      || Math.abs(minutos(a.hora) - ahora) - Math.abs(minutos(b.hora) - ahora))

  if (eligiendoReserva && onReserva) return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[var(--sala-srf)] rounded-2xl p-5 w-full max-w-sm shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setEligiendoReserva(false)} className="text-[var(--sala-tx2)] text-sm font-bold">← Volver</button>
          <h3 className="text-[var(--sala-txt)] font-bold text-lg flex-1 text-right">Mesa {mesa.numero} · 📅 ¿Qué reserva?</h3>
        </div>
        <div className="overflow-y-auto space-y-2">
          {pendientes.length === 0 && (
            <p className="text-center text-[var(--sala-tx4)] text-sm py-8">No quedan reservas por sentar hoy</p>
          )}
          {pendientes.map(r => (
            <button key={r.id} onClick={() => onReserva(r, paxTocado ? pax : r.pax)}
              className={`w-full flex items-stretch text-left bg-[var(--sala-btn)] rounded-xl overflow-hidden border-2 active:scale-[0.98] transition-transform ${r.mesaId === mesa.id ? 'border-emerald-500' : 'border-transparent'}`}>
              <BloqueHoraPax hora={r.hora} pax={r.pax} />
              <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                <span className="text-[var(--sala-txt)] font-black truncate">{r.nombre}</span>
                {r.mesaId === mesa.id && <span className="text-emerald-500 text-xs font-bold">🪑 Era para esta mesa</span>}
                {r.notas && <span className="text-amber-500 text-xs font-bold truncate">📝 {r.notas}</span>}
              </div>
            </button>
          ))}
        </div>
        {paxTocado && pendientes.length > 0 && (
          <p className="text-[var(--sala-tx4)] text-xs mt-3 text-center">Se abre con {pax} pax, los que pusiste</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-[var(--sala-txt)] font-bold text-lg mb-1">Mesa {mesa.numero}</h3>
        <p className="text-[var(--sala-tx2)] text-sm mb-6">¿Cuántos PAX?</p>
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => cambiarPax(Math.max(1, pax - 1))} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl hover:bg-gray-600">−</button>
          <span className="flex-1 text-center text-[var(--sala-txt)] text-5xl font-bold">{pax}</span>
          <button onClick={() => cambiarPax(pax + 1)} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl hover:bg-gray-600">+</button>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] font-medium">Cancelar</button>
          {onWalkin
            ? <button onClick={() => onWalkin(pax)} className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold">🚶 Walk-in</button>
            : <button onClick={() => onConfirm(pax)} className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold">Abrir mesa</button>}
        </div>
        {onReserva && (
          <button onClick={() => setEligiendoReserva(true)}
            className="w-full mt-3 py-3 rounded-xl border-2 border-sky-400/60 bg-sky-500/10 text-sky-500 font-bold active:scale-95 transition-transform">
            📅 Tiene reserva{pendientes.length ? ` (${pendientes.length})` : ''}
          </button>
        )}
        {/* Grupo grande: armar menú degustación desde plantilla */}
        {onMenuGrupo && (
          <button onClick={() => onMenuGrupo(pax)}
            className="w-full mt-3 py-3 rounded-xl border-2 border-indigo-400/60 bg-indigo-500/10 text-indigo-300 font-bold active:scale-95 transition-transform">
            🍽 Menú grupo ({pax} PAX)
          </button>
        )}
      </div>
    </div>
  )
}

// ── Modal ver cuenta (para el camarero, sin cobrar) ───────────────────────────
function VerCuentaModal({ comanda, onClose, onFacturar }: { comanda: Comanda; onClose: () => void; onFacturar: () => void }) {
  const total = totalComanda(comanda.items)
  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--sala-hdr)] w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <div>
            <h3 className="text-[var(--sala-txt)] font-bold text-lg">Mesa {comanda.mesa.numero}</h3>
            <p className="text-[var(--sala-tx2)] text-sm">{comanda.pax} pax</p>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
        </div>
        <div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
          {comanda.items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2">
              <span className="text-[var(--sala-tx1)] text-sm min-w-0">
                {item.cantidad > 1 && <span className="text-cyan-400 font-bold mr-1">{item.cantidad}×</span>}{item.nombre}
                {item.invitacion && <span className="ml-1.5 text-xs bg-amber-500/15 text-amber-500 font-bold px-1.5 py-0.5 rounded whitespace-nowrap">🎁 Invitación</span>}
              </span>
              {item.invitacion ? (
                <span className="font-semibold text-sm shrink-0">
                  <s className="text-[var(--sala-tx4)] mr-1.5">{(item.precio * item.cantidad).toFixed(2)}</s>
                  <span className="text-amber-500">0,00 €</span>
                </span>
              ) : (
                <span className="text-[var(--sala-txt)] font-semibold text-sm shrink-0">{(item.precio * item.cantidad).toFixed(2)} €</span>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-[var(--sala-brd)] flex items-center justify-between">
          <span className="text-[var(--sala-tx2)] font-medium">Total</span>
          <span className="text-[var(--sala-txt)] text-3xl font-black">{total.toFixed(2)} €</span>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onFacturar} className="w-full py-4 rounded-2xl bg-[#f59e0b] text-[var(--sala-txt)] font-bold text-lg">
            🧾 Entregar cuenta
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal ordenar ─────────────────────────────────────────────────────────────
// ── Alergias de la mesa ───────────────────────────────────────────────────────
// Se guardan en la comanda (las ve cualquier dispositivo y salen en los tickets como
// COM: ALÉRGICO: …). Estado local para que el toque se vea al instante.
function useAlergiasMesa(comanda: Comanda) {
  const queryClient = useQueryClient()
  const { data: alergenos = [] } = useQuery({ queryKey: ['alergenos'], queryFn: api.alergenos.list, staleTime: 5 * 60_000 })
  const deServidor = comanda.alergenoIds ?? []
  const [ids, setIds] = useState<number[]>(deServidor)
  const claveServidor = deServidor.join(',')
  useEffect(() => { setIds(claveServidor ? claveServidor.split(',').map(Number) : []) }, [claveServidor])
  const guardarMut = useMutation({
    mutationFn: (nuevos: number[]) => api.comandas.paraCocina(comanda.id, { alergenoIds: nuevos }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
    },
  })
  const guardar = (nuevos: number[]) => { setIds(nuevos); guardarMut.mutate(nuevos) }
  return { alergenos, ids, guardar }
}

function AlergiasSheet({ alergenos, ids, onCambiar, onClose }: {
  alergenos: Alergeno[]; ids: number[]; onCambiar: (ids: number[]) => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={e => { e.stopPropagation(); onClose() }}>
      <div className="w-full sm:max-w-lg bg-[var(--sala-hdr)] border-t sm:border border-[var(--sala-brd2)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[var(--sala-txt)] font-black text-xl">⚠️ Alguien es alérgico a…</h3>
          {ids.length > 0 && (
            <button onClick={() => onCambiar([])} className="text-[var(--sala-tx3)] text-sm underline">Quitar todo</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {alergenos.map(a => {
              const on = ids.includes(a.id)
              return (
                <button key={a.id}
                  onClick={() => onCambiar(on ? ids.filter(i => i !== a.id) : [...ids, a.id])}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3.5 text-left font-bold text-base transition-colors active:scale-95 ${
                    on ? 'bg-red-500 text-white' : 'bg-[var(--sala-srf)] text-[var(--sala-tx1)]'
                  }`}>
                  <span className="text-2xl leading-none">{a.icono}</span>
                  <span className="min-w-0 truncate">{a.nombre}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[var(--sala-tx3)] text-xs leading-snug mt-3">
            Sale en el ticket de cocina como <b>COM: ALÉRGICO: …</b> en esta comanda y las siguientes de la mesa.
            En la carta, lo que lleva alguno de estos se ve tachado y en rojo (se puede pedir igual, para el resto de la mesa).
            Cocina y equipos compartidos: no se puede garantizar la ausencia total de trazas.
          </p>
        </div>
        <button onClick={onClose}
          className="mt-3 w-full py-3.5 rounded-xl text-white text-base font-black"
          style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
          Listo
        </button>
      </div>
    </div>
  )
}

function OrdenarModal({ comanda, menu, categorias, onEnviar, onClose, marchaPasa = false, nivelesIniciales }: {
  comanda: Comanda; menu: MenuItem[]; categorias: MenuCategoria[]
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[]) => void
  onClose: () => void
  marchaPasa?: boolean
  // TPV: los niveles que ya se ajustaron con ▲▼ en la columna de la mesa
  nivelesIniciales?: Record<number, number>
}) {
  const queryClient = useQueryClient()
  const catMeta: Record<string, string> = {}
  for (const c of categorias) catMeta[c.nombre] = c.grupo || ''

  const [notas, setNotas] = useState<Record<number, string>>(() => {
    const r: Record<number, string> = {}
    comanda.items.forEach(i => { r[i.id] = i.nota ?? '' })
    return r
  })
  // Categorías de "bloque propio" (🎫 Nombre en ticket en /admin/menu, ej. POSTRES): sus platos van
  // juntos en un solo nivel, el último, y en el ticket salen con el nombre de la categoría.
  const bloqueDe = (nombre: string) => bloqueDePlato(nombre, menu, categorias)
  const [niveles, setNiveles] = useState<Record<number, number>>(() => ({ ...nivelesPropuestos(comanda.items, menu, categorias), ...nivelesIniciales }))
  const [notaModal, setNotaModal] = useState<{ itemId: number; value: string } | null>(null)
  // Información de la mesa para cocina: si no comparte (cocina emplata individual) y una nota
  // general. Se guarda en la mesa (vale para esta comandada y las siguientes) y sale como COM:
  // al final de los tickets. La nota se escribe manteniendo apretado "Oído" (como el comentario
  // de un plato): toque corto = enviar; apretado = recuadro de nota y "Oído" con la nota.
  const [noComparten, setNoComparten] = useState(!!comanda.noComparten)
  const [notaMesa, setNotaMesa] = useState(comanda.notaMesa ?? '')
  const [notaMesaBox, setNotaMesaBox] = useState<string | null>(null)
  const oidoLp = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })
  const cancelarOidoLp = () => { if (oidoLp.current.timer) { clearTimeout(oidoLp.current.timer); oidoLp.current.timer = null } }
  // conNota: la nota recién escrita en el recuadro (undefined = se envía sin tocar la nota)
  const enviarConOido = (conNota?: string) => {
    if (oidoAnim) return
    setOidoAnim(true)
    setTimeout(async () => {
      if (conNota !== undefined && conNota !== (comanda.notaMesa ?? '')) {
        // que la nota llegue antes que el ticket
        await api.comandas.paraCocina(comanda.id, { notaMesa: conNota }).catch(() => {})
        queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      }
      setOidoAnim(false)
      const nivelesArray = Object.entries(nivelesActivos).map(([id, nivel]) => ({ itemId: Number(id), nivel, nota: notas[Number(id)] ?? '' }))
      const barraArray  = itemsBarra.map(i => ({ itemId: i.id, nivel: 1, nota: notas[i.id] ?? '' }))
      const autoArray   = autoItemsPendientes.map(i => ({ itemId: i.id, nivel: 1, nota: '' }))
      onEnviar([...nivelesArray, ...barraArray, ...autoArray])
    }, 500)
  }
  const cambiarNoComparten = useMutation({
    mutationFn: (v: boolean) => api.comandas.paraCocina(comanda.id, { noComparten: v }),
    onMutate: v => setNoComparten(v),
    onError: (_e, v) => setNoComparten(!v),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const [oidoAnim, setOidoAnim] = useState(false)
  const [barraOpen, setBarraOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [buscando, setBuscando] = useState(false)
  // 🍷 Asistente de vinos: el mejor momento para ofrecerlo es aquí, con toda la comida ya pedida.
  // La copa late si la mesa todavía no tiene ninguna botella; el vino elegido sale con este mismo Oído.
  const [verVinos, setVerVinos] = useState(false)
  // ⚠️ Alergias de la mesa (las mismas que se marcaron en la carta): último vistazo antes de mandar
  const { alergenos, ids: alergiasMesa, guardar: guardarAlergias } = useAlergiasMesa(comanda)
  const [verAlergias, setVerAlergias] = useState(false)
  const alergiasActivas = alergenos.filter(a => alergiasMesa.includes(a.id))
  const hayAlergenosCarta = alergenos.length > 0 && menu.some(mi => (mi.alergenoIds ?? []).length > 0)
  const chocaCon = (nombre: string) => {
    const ids = menu.find(mi => mi.nombre === nombre)?.alergenoIds ?? []
    return alergiasActivas.filter(a => ids.includes(a.id))
  }
  const { data: maridajes } = useQuery({
    queryKey: ['maridajes', comanda.restaurantId],
    queryFn: () => api.maridajes.sala(comanda.restaurantId),
    staleTime: 5 * 60_000,
  })
  const { data: agotadosLista = [] } = useQuery({
    queryKey: ['agotados', comanda.restaurantId],
    queryFn: () => api.agotados.list(comanda.restaurantId),
    staleTime: 30_000,
  })
  const idsVino = new Set(maridajes?.vinos.map(v => v.id))
  const nombresVino = new Set(menu.filter(m => idsVino.has(m.id)).map(m => m.nombre))
  const mesaSinBotella = !comanda.items.some(i => nombresVino.has(i.nombre))
  // Swipe horizontal = salir del modal sin enviar (los niveles locales se descartan, como la ✕)
  const swipeSalirRef = useRef<{ x: number; y: number } | null>(null)

  const addItem = useMutation({
    mutationFn: (item: MenuItem) => {
      const tipo: 'cocina' | 'barra' = esGrupoBarra(catMeta[item.categoria] ?? '') ? 'barra' : 'cocina'
      return api.comandas.addItem(comanda.id, { nombre: item.nombre, precio: item.precio, cantidad: 1, tipo })
    },
    onSuccess: () => {
      setSearch('')
      setBuscando(false)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
    },
  })

  const updateItem = useMutation({
    mutationFn: ({ itemId, cantidad }: { itemId: number; cantidad: number }) =>
      api.comandas.updateItem(comanda.id, itemId, { cantidad }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api.comandas.deleteItem(comanda.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })

  useEffect(() => {
    setNiveles(prev => {
      const next = { ...prev }
      let changed = false
      const nuevos = new Set<number>()
      comanda.items.forEach(item => {
        if (!(item.id in next)) { next[item.id] = item.nivel ?? suggestNivel(item.nombre, menu); nuevos.add(item.id); changed = true }
      })
      if (!changed) return prev
      // Un plato de bloque recién añadido va con los de su bloque (o detrás de todo si es el primero)
      for (const id of nuevos) {
        const item = comanda.items.find(i => i.id === id)
        const bloque = item && item.nivel == null ? bloqueDe(item.nombre) : null
        if (!bloque) continue
        const companero = comanda.items.find(i => i.id !== id && !nuevos.has(i.id) && i.nivel == null && bloqueDe(i.nombre) === bloque)
        if (companero) next[id] = next[companero.id]
        else {
          const resto = comanda.items.filter(i => i.id !== id && i.tipo !== 'barra' && !i.autoGenerado)
          next[id] = Math.max(0, ...resto.map(i => next[i.id] ?? i.nivel ?? 0)) + 1
        }
      }
      return next
    })
    setNotas(prev => {
      const next = { ...prev }
      let changed = false
      comanda.items.forEach(item => {
        if (!(item.id in next)) { next[item.id] = item.nota ?? ''; changed = true }
      })
      return changed ? next : prev
    })
  }, [comanda.items])

  const moveItem = (itemId: number, dir: -1 | 1) => {
    setNiveles(prev => {
      const item = comanda.items.find(i => i.id === itemId)
      const current = prev[itemId] ?? (item ? suggestNivel(item.nombre, menu) : 1)
      return { ...prev, [itemId]: Math.max(1, current + dir) }
    })
  }

  // En marcha pasa solo mostramos los items nuevos (sin nivel asignado aún)
  // Los autoGenerados (ej. pan por pax) nunca se muestran en el modal de envío
  const todosPendientes = marchaPasa
    ? comanda.items.filter(i => i.nivel == null && !i.autoGenerado)
    : comanda.items.filter(i => !i.autoGenerado)
  // Solo los items de cocina necesitan asignación de nivel
  const itemsActivos = todosPendientes.filter(i => i.tipo !== 'barra')
  const itemsBarra   = todosPendientes.filter(i => i.tipo === 'barra').sort((a, b) => a.id - b.id)
  // Auto-items pendientes: se envían solos con nivel=1 sin mostrarse
  const autoItemsPendientes = comanda.items.filter(i => i.autoGenerado && i.nivel == null)

  const sorted = [...itemsActivos].sort((a, b) => {
    const diff = (niveles[a.id] ?? suggestNivel(a.nombre, menu)) - (niveles[b.id] ?? suggestNivel(b.nombre, menu))
    return diff !== 0 ? diff : a.id - b.id  // mismo nivel → mantener orden de inserción
  })
  const nivelesActivos = Object.fromEntries(itemsActivos.map(i => [i.id, niveles[i.id] ?? suggestNivel(i.nombre, menu)]))
  const maxNivel = Math.max(...Object.values(nivelesActivos), 1)

  return (
    <>
    <div className="fixed inset-0 bg-black/80 flex items-stretch sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--sala-hdr)] w-full sm:max-w-md sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]" onClick={e => e.stopPropagation()}
        onTouchStart={e => { swipeSalirRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const st = swipeSalirRef.current
          swipeSalirRef.current = null
          if (!st) return
          const dx = e.changedTouches[0].clientX - st.x
          const dy = e.changedTouches[0].clientY - st.y
          const th = swipeThresholds()
          if (Math.abs(dx) > th.dx && Math.abs(dy) < th.dy) onClose()
        }}>
        <div className="px-4 pt-3 pb-2 border-b border-[var(--sala-brd)]">
          {/* Cabecera como en el ticket: la mesa grande a la izquierda y lo demás chico.
              A la derecha, arriba los botones y debajo "No comparten". */}
          <div className="flex items-stretch justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[var(--sala-tx3)] text-[10px] font-black uppercase tracking-widest">
                {marchaPasa ? '🔁 Marcha pasa' : 'Orden de salida'}
              </p>
              <p className="text-[var(--sala-txt)] font-black text-5xl leading-none tabular-nums mt-0.5">{comanda.mesa.numero}</p>
              <p className="text-[var(--sala-tx2)] text-[11px] font-semibold mt-1 truncate">
                {comanda.pax} pax · {itemsActivos.length} cocina{itemsBarra.length > 0 ? ` · ${itemsBarra.length} barra` : ''}
              </p>
              {alergiasActivas.length > 0 && (
                <button onClick={() => setVerAlergias(true)} className="block text-left text-red-400 text-[11px] font-black mt-0.5">
                  🚫 ALÉRGICO: {alergiasActivas.map(a => a.nombre.toUpperCase()).join(', ')}
                </button>
              )}
            </div>
            <div className="flex flex-col items-end justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {(hayAlergenosCarta || alergiasActivas.length > 0) && (
                  <button onClick={() => setVerAlergias(true)} title="Alergias de la mesa" aria-label="Alergias de la mesa"
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-base active:scale-90 transition-colors ${
                      alergiasActivas.length > 0 ? 'bg-red-500 text-white' : 'bg-[var(--sala-btn2)] grayscale'}`}>
                    ⚠️
                  </button>
                )}
                {/* 🔍 Añadir algo más: la búsqueda solo aparece al tocar la lupa */}
                <button onClick={() => { setBuscando(b => !b); setSearch('') }} title="Añadir algo más" aria-label="Buscar plato o bebida"
                  className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-colors ${
                    buscando ? 'bg-cyan-600 text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx1)]'}`}>
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" />
                  </svg>
                </button>
                {itemsActivos.length > 0 && idsVino.size > 0 && (
                  <BotonVino chico onClick={() => setVerVinos(true)} invita={mesaSinBotella} titulo="¿Y de vino?" />
                )}
                {/* la ✕ bien separada de los botones, para no cerrar sin querer */}
                <button onClick={onClose} aria-label="Cerrar" className="ml-4 w-8 h-9 flex items-center justify-center text-[var(--sala-tx3)] text-lg">✕</button>
              </div>
              {itemsActivos.length > 0 && (
                // 🍽 No comparten: interruptor con un plato individual (cubiertos a los lados) en la bolita
                <button onClick={() => cambiarNoComparten.mutate(!noComparten)} disabled={cambiarNoComparten.isPending}
                  role="switch" aria-checked={noComparten} className="flex items-center gap-2 active:scale-95 transition-transform">
                  <span className={`text-[10px] font-black uppercase tracking-wide ${noComparten ? 'text-[var(--sala-txt)]' : 'text-[var(--sala-tx3)]'}`}>No comparten</span>
                  <span className={`w-11 h-6 rounded-full relative transition-colors ${noComparten ? 'bg-[#4CC8A0]' : 'bg-[var(--sala-btn)]'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center transition-all ${noComparten ? 'left-[22px]' : 'left-0.5'}`}>
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" strokeLinecap="round" strokeLinejoin="round"
                        stroke={noComparten ? '#1f9e78' : '#9ca3af'} strokeWidth="1.8">
                        <circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2.8" />
                        <path d="M3 4v4.5a1.2 1.2 0 0 0 2.4 0V4M4.2 9.7V20" />
                        <path d="M20.5 20V4c-1.6 1-2.3 3-2.3 5.5 0 1.3.9 2 2.3 2" />
                      </svg>
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
          {notaMesa && (
            <button onClick={() => setNotaMesaBox(notaMesa)}
              className="w-full mt-2 text-left text-xs text-[var(--sala-tx2)] bg-[var(--sala-btn2)] rounded-xl px-4 py-2 truncate">
              📝 {notaMesa}
            </button>
          )}
          {/* Search rápido para añadir items (se abre con la lupa) */}
          {buscando && (
            <div className="relative mt-2">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Añadir algo más… buscar plato o bebida"
                className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-[var(--sala-tx4)] pr-8" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-sm">✕</button>
              )}
            </div>
          )}
          {/* Resultados del search */}
          {search.trim().length > 0 && (
            <div className="mt-1.5 bg-[var(--sala-btn2)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {menu.filter(m => m.activo && !m.ocultoEnCarta && normTxt(m.nombre).includes(normTxt(search))).slice(0, 8).map(item => (
                <button key={item.id} onClick={() => addItem.mutate(item)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 active:bg-gray-600 border-b border-[var(--sala-brd)]/50 last:border-0">
                  <span className="text-[var(--sala-txt)] text-sm text-left">{item.nombre}</span>
                  <span className="text-[var(--sala-tx2)] text-xs shrink-0 ml-2">{item.precio.toFixed(2)} €</span>
                </button>
              ))}
              {menu.filter(m => m.activo && !m.ocultoEnCarta && normTxt(m.nombre).includes(normTxt(search))).length === 0 && (
                <p className="text-[var(--sala-tx4)] text-sm px-4 py-3">Sin resultados</p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {Array.from({ length: maxNivel }, (_, i) => i + 1).map(nv => {
            const itemsEnNivel = sorted.filter(i => (niveles[i.id] ?? suggestNivel(i.nombre, menu)) === nv)
            if (itemsEnNivel.length === 0) return null
            return (
              <div key={nv}>
                <NivelEtiqueta titulo={tituloNivel(nv, itemsEnNivel.map(i => i.nombre), menu, categorias)}>
                  {/* ▲▼ mueven el nivel entero */}
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); if (nv > 1) itemsEnNivel.forEach(i => moveItem(i.id, -1)) }} disabled={nv <= 1}
                      className="w-8 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-sm font-black hover:bg-cyan-600/60 disabled:opacity-20 flex items-center justify-center">▲</button>
                    <button onClick={e => { e.stopPropagation(); itemsEnNivel.forEach(i => moveItem(i.id, 1)) }}
                      className="w-8 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-sm font-black hover:bg-cyan-600/60 flex items-center justify-center">▼</button>
                  </div>
                </NivelEtiqueta>
                {/* Platos como en el ticket de cocina: cantidad en columna fija, nombre en negrita y
                    mayúsculas a todo lo ancho (sin cortarse) y la nota con » alineada con el nombre.
                    Debajo, los controles de ordenar siempre a la vista. */}
                <div className="divide-y divide-dashed divide-[var(--sala-brd2)]">
                  {itemsEnNivel.map(item => (
                    <div key={item.id} className={`py-1.5 ${notaModal?.itemId === item.id ? 'bg-cyan-500/10 -mx-2 px-2 rounded-xl' : ''}`}>
                      <div className="flex items-baseline gap-3">
                        <span className="w-6 shrink-0 text-right text-[var(--sala-txt)] font-black text-base tabular-nums leading-tight">{item.cantidad}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--sala-txt)] font-black text-sm uppercase leading-tight break-words">{item.nombre}</p>
                          {notas[item.id] && <p className="text-[var(--sala-txt)] font-bold text-xs mt-0.5 break-words">» {notas[item.id]}</p>}
                          {chocaCon(item.nombre).length > 0 && (
                            <p className="text-red-400 font-black text-xs mt-0.5">🚫 Lleva {chocaCon(item.nombre).map(a => `${a.icono} ${a.nombre}`).join(' · ')}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-1 pl-9">
                        <button onClick={e => { e.stopPropagation(); if (item.cantidad > 1) updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 }); else deleteItem.mutate(item.id) }}
                          aria-label="Uno menos"
                          className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-base font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">−</button>
                        <button onClick={e => { e.stopPropagation(); updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 }) }}
                          aria-label="Uno más"
                          className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-base font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">+</button>
                        <button onClick={e => { e.stopPropagation(); setNotaModal(m => m?.itemId === item.id ? null : { itemId: item.id, value: notas[item.id] ?? '' }) }}
                          aria-label="Nota del plato"
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${notas[item.id] ? 'bg-cyan-600' : 'bg-[var(--sala-btn)] hover:bg-gray-600'}`}>
                          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                            <path d="M4 2 L20 2 Q22 2 22 4 L22 15 Q22 17 20 17 L14 17 L11 21 L8 17 L4 17 Q2 17 2 15 L2 4 Q2 2 4 2 Z" fill={notas[item.id] ? 'white' : '#9ca3af'} />
                            <path d="M7 10 L11 14 L17 6" stroke={notas[item.id] ? '#06b6d4' : '#374151'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        </button>
                        <span className="flex-1" />
                        <button onClick={e => { e.stopPropagation(); moveItem(item.id, -1) }} disabled={(niveles[item.id] ?? 1) <= 1}
                          aria-label="Subir de nivel"
                          className="w-9 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-sm font-black hover:bg-gray-500 disabled:opacity-20 flex items-center justify-center active:scale-90">▲</button>
                        <button onClick={e => { e.stopPropagation(); moveItem(item.id, 1) }}
                          aria-label="Bajar de nivel"
                          className="w-9 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-sm font-black hover:bg-gray-500 flex items-center justify-center active:scale-90">▼</button>
                      </div>
                      {notaModal?.itemId === item.id && (
                        <div className="pt-2 pl-9">
                          <input autoFocus value={notaModal.value}
                            onChange={e => setNotaModal(m => m ? { ...m, value: e.target.value } : null)}
                            onKeyDown={e => { if (e.key === 'Enter') { setNotas(prev => ({ ...prev, [item.id]: notaModal.value })); setNotaModal(null) } }}
                            placeholder="Sin gluten, sin cebolla…"
                            className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-4 py-3 rounded-xl outline-none placeholder:text-[var(--sala-tx4)]" />
                          <div className="flex gap-2 mt-2">
                            <button onClick={e => { e.stopPropagation(); setNotaModal(null) }} className="flex-1 py-2 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx2)] text-sm">Cancelar</button>
                            <button onClick={e => { e.stopPropagation(); setNotas(prev => ({ ...prev, [item.id]: notaModal.value })); setNotaModal(null) }} className="flex-1 py-2 rounded-xl bg-cyan-600 text-[var(--sala-txt)] text-sm font-bold">Guardar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Barra — colapsable, comprimida por defecto */}
        {itemsBarra.length > 0 && (
          <div className="border-t border-[var(--sala-brd)]">
            <button onClick={() => setBarraOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--sala-btn2)]/40 transition-colors">
              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">🍺 Barra ({itemsBarra.length})</span>
              <div className="flex-1 h-px bg-[var(--sala-btn2)]" />
              <span className="text-[var(--sala-tx3)] text-xs">{barraOpen ? '▲' : '▼'}</span>
            </button>
            {barraOpen && (
              <div className="px-4 pb-3 space-y-1.5">
                {itemsBarra.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-[var(--sala-btn2)]/60 rounded-xl px-3 py-2">
                    <span className="text-[var(--sala-tx1)] text-sm flex-1 truncate">{item.nombre}</span>
                    <button onClick={e => { e.stopPropagation(); if (item.cantidad > 1) updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 }); else deleteItem.mutate(item.id) }}
                      className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">−</button>
                    <span className="text-[var(--sala-txt)] font-black w-5 text-center">{item.cantidad}</span>
                    <button onClick={e => { e.stopPropagation(); updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 }) }}
                      className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">+</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-1.5 border-t border-[var(--sala-brd)]">
          <button
            onPointerDown={() => {
              oidoLp.current.fired = false
              oidoLp.current.timer = setTimeout(() => {
                oidoLp.current.fired = true
                navigator.vibrate?.(30)
                setNotaMesaBox(notaMesa)
              }, 450)
            }}
            onPointerUp={cancelarOidoLp} onPointerLeave={cancelarOidoLp} onContextMenu={e => e.preventDefault()}
            onClick={e => {
              e.stopPropagation()
              if (oidoLp.current.fired) { oidoLp.current.fired = false; return } // el apretado ya abrió la nota
              enviarConOido()
            }} className="w-full rounded-2xl flex items-center justify-center py-0.5 active:scale-95 transition-all">
            {/* Solo la viñeta con la tilde siempre a la vista, como en el pie de la carta */}
            <svg viewBox="0 0 68 72" className={`w-11 h-11 transition-transform ${oidoAnim ? 'scale-125' : ''}`} style={{ filter: 'drop-shadow(0 0 10px rgba(76,200,160,0.55))' }}>
              <defs>
                <linearGradient id="oido-modal-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4B9EDF" />
                  <stop offset="100%" stopColor="#4CC8A0" />
                </linearGradient>
              </defs>
              <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#oido-modal-grad)" />
              <path d="M15 34 L29 48 L55 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
        </div>
      </div>

      {verAlergias && (
        <AlergiasSheet alergenos={alergenos} ids={alergiasMesa} onCambiar={guardarAlergias} onClose={() => setVerAlergias(false)} />
      )}

      {notaMesaBox !== null && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6" onClick={e => { e.stopPropagation(); setNotaMesaBox(null) }}>
          <div className="w-full max-w-sm bg-[var(--sala-hdr)] border border-[var(--sala-brd2)] rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider mb-1">📝 Nota para cocina</p>
            <h3 className="text-[var(--sala-txt)] font-bold text-lg mb-3">Mesa {comanda.mesa.numero} · toda la mesa</h3>
            <textarea autoFocus value={notaMesaBox} maxLength={200} rows={3}
              onChange={e => setNotaMesaBox(e.target.value)}
              placeholder="Cumpleaños, tienen prisa, una embarazada…"
              className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-3 py-2.5 rounded-xl outline-none placeholder:text-[var(--sala-tx4)] resize-none" />
            <p className="text-[var(--sala-tx4)] text-[11px] mt-1">Sale como COM: al final de esta comanda y de las siguientes de la mesa.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setNotaMesaBox(null)}
                className="px-4 py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
                Cancelar
              </button>
              <button onClick={() => { const v = notaMesaBox.trim(); setNotaMesa(v); setNotaMesaBox(null); enviarConOido(v) }}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                Oído con nota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    {/* Fuera del modal: así sus toques y swipes no lo cierran */}
    {verVinos && (
      <MaridajeSheet comanda={comanda} menu={menu} agotadoIds={new Set(agotadosLista.map(a => a.menuItemId))}
        onAdd={vino => { addItem.mutate(vino); setBarraOpen(true) }}
        onClose={() => setVerVinos(false)} />
    )}
    </>
  )
}

// ── Modal merma ───────────────────────────────────────────────────────────────
const MOTIVOS: { value: MermaMotivo; label: string; desc: string }[] = [
  { value: 'no_servido',    label: 'No se sirvió',      desc: 'Se preparó pero no llegó al cliente' },
  { value: 'queja_cliente', label: 'Queja de cliente',  desc: 'El cliente lo rechazó o se quejó' },
  { value: 'otro',          label: 'Otro',              desc: 'Especifica el motivo abajo' },
]

function MermaModal({ item, onConfirm, onClose, onInvitar }: {
  item: ComandaItem
  onConfirm: (motivo: MermaMotivo, descripcion?: string, cantidad?: number) => void
  onClose: () => void
  onInvitar?: (motivo?: string) => void // solo encargado: marcar/quitar invitación de la casa
}) {
  const [motivo, setMotivo] = useState<MermaMotivo | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState(item.cantidad)
  const [invitando, setInvitando] = useState(false)   // opción 🎁 seleccionada
  const [motivoInv, setMotivoInv] = useState('')      // por qué se invita (opcional)

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end z-[70]" onClick={onClose}>
      <div className="bg-[var(--sala-hdr)] w-full rounded-t-3xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[var(--sala-txt)] font-bold text-base">Registrar merma</h3>
            <p className="text-[var(--sala-tx2)] text-xs mt-0.5">{item.nombre}</p>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
        </div>

        {item.cantidad > 1 && (
          <div className="flex items-center justify-between bg-[var(--sala-srf)] rounded-2xl px-4 py-3 mb-4">
            <span className="text-[var(--sala-tx2)] text-sm">Cantidad a mermar</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setCantidad(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-full bg-[var(--sala-btn)] text-[var(--sala-txt)] font-bold text-lg flex items-center justify-center active:scale-90">−</button>
              <span className="text-[var(--sala-txt)] font-bold text-lg w-6 text-center">{cantidad}</span>
              <button onClick={() => setCantidad(c => Math.min(item.cantidad, c + 1))}
                className="w-8 h-8 rounded-full bg-[var(--sala-btn)] text-[var(--sala-txt)] font-bold text-lg flex items-center justify-center active:scale-90">+</button>
            </div>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {MOTIVOS.map(m => (
            <button key={m.value} onClick={() => { setMotivo(m.value); setInvitando(false) }}
              className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                motivo === m.value
                  ? 'bg-red-900/40 border-red-500'
                  : 'bg-[var(--sala-srf)] border-transparent hover:border-[var(--sala-brd2)]'
              }`}>
              <p className={`font-semibold text-sm ${motivo === m.value ? 'text-red-300' : 'text-[var(--sala-txt)]'}`}>{m.label}</p>
              <p className="text-[var(--sala-tx3)] text-xs mt-0.5">{m.desc}</p>
            </button>
          ))}
          {/* Invitación de la casa — solo encargado. No es merma: el item queda en cuenta a 0 € */}
          {onInvitar && (
            <button onClick={() => {
                if (item.invitacion) { onInvitar(); onClose(); return } // quitar: acción directa
                setInvitando(v => !v)
                setMotivo(null)
              }}
              className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                invitando ? 'bg-amber-500/25 border-amber-500' : 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
              }`}>
              <p className="font-semibold text-sm text-amber-400">
                🎁 {item.invitacion ? 'Quitar invitación de la casa' : 'Invitación de la casa'}
              </p>
              <p className="text-[var(--sala-tx3)] text-xs mt-0.5">
                {item.invitacion
                  ? 'El item vuelve a cobrarse a su precio normal'
                  : 'El item queda visible en la cuenta a 0 € — no es una merma'}
              </p>
            </button>
          )}
        </div>

        {invitando && (
          <input
            autoFocus
            value={motivoInv}
            onChange={e => setMotivoInv(e.target.value)}
            placeholder="¿Por qué se invita? (opcional — ej: espera larga, cumpleaños…)"
            className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-4 py-3 rounded-xl outline-none mb-4"
          />
        )}

        {motivo === 'otro' && (
          <input
            autoFocus
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Describe el motivo…"
            className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-4 py-3 rounded-xl outline-none mb-4"
          />
        )}

        {invitando ? (
          <button
            onClick={() => { onInvitar?.(motivoInv.trim() || undefined); onClose() }}
            className="w-full py-4 rounded-2xl bg-amber-500 text-black font-black text-base active:scale-95 transition-all"
          >
            🎁 Marcar invitación de la casa
          </button>
        ) : (
          <button
            onClick={() => motivo && onConfirm(motivo, descripcion || undefined, cantidad)}
            disabled={!motivo || (motivo === 'otro' && !descripcion.trim())}
            className="w-full py-4 rounded-2xl bg-red-600 text-[var(--sala-txt)] font-bold text-base disabled:opacity-30 active:scale-95 transition-all"
          >
            Confirmar merma {item.cantidad > 1 && `(${cantidad}×)`}
          </button>
        )}
      </div>
    </div>
  )
}

// Nombre de categoría dentro de su cuadrado: puede partir después de una "/" (PASTA/ARROZ no tiene
// espacios y se salía por los lados); nunca en medio de una palabra
function NombreTile({ nombre }: { nombre: string }) {
  return (
    <span className="text-[var(--sala-txt)] text-lg font-black uppercase tracking-wide text-center leading-tight px-0.5"
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      {nombre.replace(/\//g, '/\u200B')}
    </span>
  )
}

// ── Fila de item reutilizable ─────────────────────────────────────────────────
// ── Franja de altos al pie del mapa ───────────────────────────────────────────
// Lo que se acabó en el servicio, a la vista antes de llegar a la mesa. Solo aparece si hay algo.
// De a uno, entrando desde abajo y quieto unos segundos (se lee mejor que una marquesina); con un
// solo plato no se mueve. Lo repuesto simplemente desaparece. Tocarla = la lista.
const ALTO_SEGUNDOS = 3
function FranjaAltos({ restaurantId }: { restaurantId: number }) {
  const { data: agotados = [] } = useQuery({
    queryKey: ['agotados', restaurantId],
    queryFn: () => api.agotados.list(restaurantId),
    staleTime: 30_000,
  })

  const [paso, setPaso] = useState(0)
  const [verLista, setVerLista] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setPaso(p => p + 1), ALTO_SEGUNDOS * 1000)
    return () => window.clearInterval(id)
  }, [])

  if (agotados.length === 0) return null
  const i = paso % agotados.length
  const actual = agotados[i]

  return (
    <>
      <button onClick={() => setVerLista(true)} aria-label="Ver los platos agotados"
        className="shrink-0 h-12 w-full overflow-hidden flex items-center gap-3 px-4 text-white bg-red-600">
        {/* key = vuelve a entrar desde abajo cada vez que cambia el plato (con uno solo, queda quieto) */}
        <span key={agotados.length > 1 ? `${actual.menuItemId}-${paso}` : actual.menuItemId}
          className="flex-1 min-w-0 text-left font-black uppercase tracking-wide truncate"
          style={agotados.length > 1 ? { animation: 'altoSube 0.35s ease-out' } : undefined}>
          🚫 ALTO · {actual.menuItem.nombre}
        </span>
        {agotados.length > 1 && <span className="shrink-0 text-sm font-bold tabular-nums opacity-80">{i + 1}/{agotados.length}</span>}
      </button>

      {verLista && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={() => setVerLista(false)}>
          <div className="w-full sm:max-w-md bg-[var(--sala-hdr)] border-t sm:border border-[var(--sala-brd2)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-[var(--sala-txt)] font-black text-xl mb-3">🚫 Se acabó</h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {agotados.map(a => (
                <div key={a.menuItemId} className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
                  <p className="text-[var(--sala-txt)] font-black uppercase">{a.menuItem.nombre}</p>
                  <p className="text-[var(--sala-tx3)] text-xs mt-0.5">
                    desde las {new Date(a.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}{a.marcadoPor ? ` · ${a.marcadoPor}` : ''}
                  </p>
                </div>
              ))}
            </div>
            <button onClick={() => setVerLista(false)}
              className="mt-3 w-full py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Plato que se acabó en este servicio: en su sitio, apagado y sin poder tocarlo
function PlatoAgotado({ nombre, detalle }: { nombre: string; detalle?: string }) {
  return (
    <div aria-disabled className="w-full text-left rounded-xl px-4 py-2 relative select-none bg-[var(--sala-srf)] opacity-40 cursor-not-allowed">
      <span className="block pr-20 text-[var(--sala-txt)] text-[1.7rem] font-bold leading-tight line-through">{nombre}</span>
      {detalle ? <p className="text-[var(--sala-tx3)] text-sm leading-tight mt-0.5 truncate">{detalle}</p> : null}
      <span className="absolute right-3 inset-y-0 flex items-center text-red-400 text-xs font-black tracking-wider">AGOTADO</span>
    </div>
  )
}

function ItemRow({ item, nota, setNota, onUpdate, onDelete, onSaveNota, onMerma, onRepeat, onInvitar, agotado }: {
  item: ComandaItem
  agotado?: boolean
  nota: { itemId: number; value: string } | null
  setNota: (v: { itemId: number; value: string } | null) => void
  onUpdate: (cantidad: number) => void
  onDelete: () => void
  onSaveNota: (v: string) => void
  onMerma?: () => void
  onRepeat?: () => void
  onInvitar?: () => void
}) {
  return (
    <div className={`bg-[var(--sala-srf)] rounded-xl p-3 ${item.invitacion ? 'border border-amber-500/40' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => item.cantidad > 1 ? onUpdate(item.cantidad - 1) : onDelete()}
            className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm hover:bg-gray-600 flex items-center justify-center">−</button>
          <span className="text-[var(--sala-txt)] font-bold w-5 text-center">{item.cantidad}</span>
          <button onClick={() => onUpdate(item.cantidad + 1)}
            className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm hover:bg-gray-600 flex items-center justify-center">+</button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--sala-txt)] text-sm font-medium truncate">
            {item.nombre}
            {item.autoGenerado && <span className="ml-1.5 text-[10px] font-bold text-[var(--sala-tx4)] uppercase">🔇 sin cocina</span>}
          </p>
          {agotado && <p className="text-red-400 text-xs font-bold">⚠ Agotado — quítalo antes de comandar</p>}
          {item.invitacion && (
            <p className="text-amber-500 text-xs font-bold truncate">
              🎁 Invitación{item.invitadoPor ? ` · ${item.invitadoPor}` : ''}{item.invitacionMotivo ? ` — ${item.invitacionMotivo}` : ''}
            </p>
          )}
          {item.nota && <p className="text-[var(--sala-tx3)] text-xs truncate">{item.nota}</p>}
        </div>
        {onInvitar && item.invitacion && (
          <button onClick={onInvitar}
            className="text-base shrink-0 scale-110 transition-all"
            title="Quitar invitación de la casa">
            🎁
          </button>
        )}
        <button onClick={() => setNota(nota?.itemId === item.id ? null : { itemId: item.id, value: item.nota ?? '' })}
          className="text-[var(--sala-tx4)] text-xs hover:text-[var(--sala-tx2)] shrink-0">nota</button>
        {onRepeat && (
          <button onClick={onRepeat}
            className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 text-lg font-bold flex items-center justify-center shrink-0 transition-colors"
            title="Repetir">
            +
          </button>
        )}
        {onMerma && (
          <button onClick={onMerma}
            className="text-red-800 hover:text-red-500 text-xs shrink-0 transition-colors" title="Registrar merma">
            ▼
          </button>
        )}
      </div>
      {nota?.itemId === item.id && (
        <div className="flex gap-2 mt-2">
          <input autoFocus value={nota.value} onChange={e => setNota({ itemId: item.id, value: e.target.value })}
            placeholder="Sin gluten, sin cebolla…"
            className="flex-1 bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xs px-3 py-1.5 rounded-lg outline-none" />
          <button onClick={() => onSaveNota(nota.value)} className="text-xs px-3 py-1.5 bg-cyan-600 text-[var(--sala-txt)] rounded-lg">OK</button>
          <button onClick={() => setNota(null)} className="text-xs text-[var(--sala-tx3)]">✕</button>
        </div>
      )}
    </div>
  )
}

// ── Teclado en pantalla del puesto TPV (buscar en la carta) ───────────────────
// Teclas grandes dentro de la columna de la carta: los resultados se ven justo encima y la mesa
// sigue a la derecha (el teclado del sistema tapaba media tablet). Con Ñ y fila de números.
const FILAS_TECLADO = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM']
function TecladoTpv({ onTecla, onBorrar, onLimpiar, onCerrar }: {
  onTecla: (t: string) => void; onBorrar: () => void; onLimpiar: () => void; onCerrar: () => void
}) {
  const pulsar = (fn: () => void) => () => { navigator.vibrate?.(8); fn() }
  // Grande pero sin tapar los resultados: el 45 % de la columna de la carta (encima caben dos filas
  // de platos sin desplazar) y cada tecla se estira a lo ancho y a lo alto (filas flex-1)
  const tecla = 'h-full flex-1 rounded-2xl bg-[var(--sala-srf)] text-[var(--sala-txt)] font-black shadow-sm active:scale-95 active:bg-[#4CC8A0] active:text-white transition-transform select-none flex items-center justify-center'
  return (
    <div className="h-[45%] shrink-0 flex flex-col gap-1.5 border-t border-[var(--sala-brd)] bg-[var(--sala-bg)] p-3">
      {FILAS_TECLADO.map((fila, i) => (
        <div key={fila} className={`flex gap-1.5 ${i === 0 ? 'flex-[0.75]' : 'flex-1'}`}>
          {[...fila].map(t => (
            <button key={t} onClick={pulsar(() => onTecla(t))} className={`${tecla} ${i === 0 ? 'text-xl text-[var(--sala-tx2)]' : 'text-2xl'}`}>{t}</button>
          ))}
          {i === 3 && (
            <button onClick={pulsar(onBorrar)} aria-label="Borrar letra" className={`${tecla} !flex-[2.2]`}>
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" /><path d="m17 9-6 6M11 9l6 6" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-1.5 flex-1">
        <button onClick={pulsar(onCerrar)} className={`${tecla} text-base uppercase`}>✕ Cerrar</button>
        <button onClick={pulsar(() => onTecla(' '))} className={`${tecla} !flex-[3] text-base uppercase text-[var(--sala-tx3)]`}>espacio</button>
        <button onClick={pulsar(onLimpiar)} className={`${tecla} text-base uppercase`}>Borrar todo</button>
      </div>
    </div>
  )
}

// ── Panel comanda (modo camarero) ─────────────────────────────────────────────
function ComandaPanel({ comanda, menu, categorias, onClose, onEnviar, onLiberar, onCambiarMesa, onFacturar, esEncargado, ancho = false }: {
  comanda: Comanda; menu: MenuItem[]; categorias: MenuCategoria[]
  onClose: () => void
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[], silent?: boolean) => void
  onLiberar: () => void
  onCambiarMesa?: () => void
  onFacturar?: () => void
  esEncargado?: boolean
  // Puesto TPV (tablet): pantalla completa en dos columnas, la carta a la izquierda y la mesa a la
  // derecha, sin pestañas ni gestos de deslizar (en una tablet sobra sitio para verlas a la vez)
  ancho?: boolean
}) {
  const queryClient = useQueryClient()
  // Pestaña inicial: si la mesa ya está toda comandada (sin pendientes), se entra para pedir
  // algo más → directo a la carta. Con pendientes sin enviar o cuenta impresa → vista del pedido.
  const [quienEsta, setQuienEsta] = useState(false)
  const [tab, setTab] = useState<'pedido' | 'menu'>(() => {
    if (comanda.estado === 'facturada' || comanda.estado === 'liberada') return 'pedido'
    const hayPendientesSinEnviar = comanda.items.some(i => i.nivel == null && !i.autoGenerado)
    return hayPendientesSinEnviar ? 'pedido' : 'menu'
  })
  const [searchMenu, setSearchMenu] = useState('')
  // TPV: teclado propio en pantalla para buscar (el del sistema tapaba media tablet)
  const [tecladoTpv, setTecladoTpv] = useState(false)
  const [grupoTab, setGrupoTab] = useState<string | null>(null)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const swipeRef = useRef<number | null>(null)
  const [nota, setNota] = useState<{ itemId: number; value: string } | null>(null)
  // Aviso de "añadido" abajo a la derecha: no tapa nada, así se pueden seguir tocando platos
  // rápido (antes un check tapaba el plato un segundo). Se apilan y se van solos.
  const [avisosAnadido, setAvisosAnadido] = useState<{ id: number; texto: string }[]>([])
  const avisarAnadido = (texto: string) => {
    const id = Date.now() + Math.random()
    setAvisosAnadido(a => [...a.slice(-2), { id, texto }])
    setTimeout(() => setAvisosAnadido(a => a.filter(x => x.id !== id)), 1800)
  }
  const [qtyPending, setQtyPending] = useState<{ id: number; qty: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notaNueva, setNotaNueva] = useState<{ item: MenuItem; qty: number; value: string } | null>(null)
  const [mixerPick, setMixerPick] = useState<MenuItem | null>(null)
  const [verVinos, setVerVinos] = useState(false) // 🍷 ¿Qué vino? con lo que pidió la mesa
  const { data: maridajes } = useQuery({
    queryKey: ['maridajes', comanda.restaurantId],
    queryFn: () => api.maridajes.sala(comanda.restaurantId),
    staleTime: 5 * 60_000,
  })
  const idsVino = new Set(maridajes?.vinos.map(v => v.id))
  const hayVinos = idsVino.size > 0
  const nombresVino = new Set(menu.filter(m => idsVino.has(m.id)).map(m => m.nombre))
  const mesaSinBotella = !comanda.items.some(i => nombresVino.has(i.nombre))
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const [ordenando, setOrdenando] = useState(false)
  // Reordenar TODOS los niveles (no solo pendientes) — comandas ya enviadas / menús de grupo
  const [ordenarFull, setOrdenarFull] = useState(false)
  const [verCuenta, setVerCuenta] = useState(false)
  const [mermaItem, setMermaItem] = useState<ComandaItem | null>(null)
  // Sin internet (la sala trabaja contra la Box) no hay mermas, invitaciones ni cobros
  const enLocal = useSalaEnModoLocal()
  // Platos que se acabaron en este servicio: se ven apagados y no se pueden pedir
  const { data: agotadosLista = [] } = useQuery({
    queryKey: ['agotados', comanda.restaurantId],
    queryFn: () => api.agotados.list(comanda.restaurantId),
    staleTime: 30_000,
  })
  const agotadoIds = new Set(agotadosLista.map(a => a.menuItemId))
  // ⚠️ Alergias de la mesa: "alguien es alérgico a…" marca en la carta de comida lo que no puede
  // comer y sale en los tickets (COM: ALÉRGICO: …). Se guarda en la comanda.
  const { alergenos, ids: alergiasMesa, guardar: setAlergiasMesa } = useAlergiasMesa(comanda)
  const [verAlergias, setVerAlergias] = useState(false)
  const agotadoNombres = new Set(agotadosLista.map(a => a.menuItem.nombre))
  // Línea sin comandar de un plato que ya no hay: aviso para quitarla antes de enviar
  const sinComandarAgotada = (i: ComandaItem) => i.nivel == null && !i.autoGenerado && agotadoNombres.has(i.nombre)
  const [confirmarCerrar, setConfirmarCerrar] = useState(false)
  const [oidoAnim, setOidoAnim] = useState(false)
  const [dotsAnim, setDotsAnim] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Swipe → derecha sobre el panel = volver al mapa ("ahh, no era esta mesa").
  // Solo en la vista del pedido o en el primer nivel de la carta (más adentro, el swipe ya navega niveles).
  const swipeCloseRef = useRef<{ x: number; y: number } | null>(null)

  const yaEnviada    = comanda.estado === 'enviada'
  const yaFacturada  = comanda.estado === 'facturada'
  const itemsNuevos         = comanda.items.filter(i => i.nivel == null && !i.autoGenerado)
  const itemsNuevosCocina   = itemsNuevos.filter(i => i.tipo !== 'barra')
  const itemsNuevosBarra    = itemsNuevos.filter(i => i.tipo === 'barra')
  const autoItemsPendientes = comanda.items.filter(i => i.autoGenerado && i.nivel == null)
  const esMarchaPasa  = !yaEnviada && !yaFacturada && itemsNuevosCocina.length > 0 && comanda.items.some(i => i.nivel != null && !i.autoGenerado)
  const hayPendientes = itemsNuevos.length > 0 || autoItemsPendientes.length > 0

  // TPV: niveles de los platos sin comandar, propuestos en vivo y ajustables con ▲▼ en la columna
  // de la mesa; el Oído abre el orden de salida con estos mismos niveles
  const [ajusteNiveles, setAjusteNiveles] = useState<Record<number, number>>({})
  const propuestosTpv: Record<number, number> = ancho ? { ...nivelesPropuestos(comanda.items, menu, categorias), ...ajusteNiveles } : {}
  const moverNivelTpv = (ids: number[], dir: -1 | 1) => setAjusteNiveles(prev => {
    const next = { ...prev }
    for (const id of ids) next[id] = Math.max(1, (propuestosTpv[id] ?? 1) + dir)
    return next
  })

  // TPV: Bloq Num (en Mac, "Clear") o Esc salen de la mesa, como la ✕ (con platos sin comandar
  // pregunta Descartar / Comandar). Si hay otra ventana abierta dentro de la mesa no hace nada, y
  // si está abierto el teclado de búsqueda, primero lo cierra.
  const teclaSalir = useRef<(e: KeyboardEvent) => void>(() => {})
  teclaSalir.current = e => {
    if (!ancho) return
    if (!(e.key === 'Escape' || e.code === 'NumLock' || e.key === 'NumLock' || e.key === 'Clear')) return
    if (confirmarCerrar) { e.preventDefault(); setConfirmarCerrar(false); return }
    if (tecladoTpv) { e.preventDefault(); setTecladoTpv(false); setSearchMenu(''); return }
    if (ordenando || ordenarFull || verCuenta || mermaItem || notaNueva || mixerPick || verVinos || showCobro || nota) return
    e.preventDefault()
    if (itemsNuevos.length > 0) setConfirmarCerrar(true)
    else onClose()
  }
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => teclaSalir.current(e)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])

  const handleOido = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (oidoAnim) return
    setOidoAnim(true)
    setTimeout(() => {
      setOidoAnim(false)
      if (itemsNuevosCocina.length > 0) {
        setOrdenando(true)
      } else {
        // Solo barra y/o auto-items → enviar todo y volver al mapa
        const toSend = [
          ...itemsNuevosBarra.map(i => ({ itemId: i.id, nivel: 1 })),
          ...autoItemsPendientes.map(i => ({ itemId: i.id, nivel: 1 })),
        ]
        if (toSend.length > 0) onEnviar(toSend, false)
      }
    }, 500)
  }

  const camareroSesion = (() => {
    try { return JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '') }
    catch { return null }
  })()


  const registrarMerma = useMutation({
    mutationFn: ({ motivo, descripcion, cantidad }: { motivo: MermaMotivo; descripcion?: string; cantidad: number }) =>
      api.mermas.create({
        restaurantId:   comanda.restaurantId,
        mesaNumero:     comanda.mesa.numero,
        planNombre:     undefined,
        comandaId:      comanda.id,
        itemNombre:     mermaItem!.nombre,
        cantidad,
        precio:         mermaItem!.precio,
        itemNivel:      mermaItem!.nivel,
        itemRonda:      mermaItem!.ronda,
        camareroNombre: camareroSesion?.nombre ?? undefined,
        motivo,
        descripcion,
      }),
    onSuccess: async (_, { cantidad }) => {
      const restante = mermaItem!.cantidad - cantidad
      if (restante > 0) {
        await api.comandas.updateItem(comanda.id, mermaItem!.id, { cantidad: restante })
      } else {
        await api.comandas.deleteItem(comanda.id, mermaItem!.id)
      }
      setMermaItem(null)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      onClose()
    },
  })

  const facturarComanda = useMutation({
    mutationFn: () => api.comandas.facturar(comanda.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
      setVerCuenta(false)
      onFacturar?.()
      onClose()
    },
  })

  const total = totalComanda(comanda.items)

  const getTipo = (item: MenuItem): 'cocina' | 'barra' =>
    esGrupoBarra(catMeta[item.categoria]?.grupo ?? '') ? 'barra' : 'cocina'

  const addItem = useMutation({
    mutationFn: ({ item, cantidad, nota: notaItem }: { item: MenuItem; cantidad: number; nota?: string }) =>
      api.comandas.addItem(comanda.id, { nombre: item.nombre, precio: item.precio, cantidad, tipo: getTipo(item), ...(notaItem ? { nota: notaItem } : {}), ...(modoSinCocina ? { directo: true } : {}) }),
    onSuccess: (_, { item, cantidad }) => {
      avisarAnadido(`${cantidad}× ${item.nombre}`)
      setDotsAnim(true)
      setTimeout(() => setDotsAnim(false), 1600)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
    },
  })

  // Combinado: destilado + mixer en un solo renglón ("Vodka Absolut + Coca-Cola")
  const addCombinado = useMutation({
    mutationFn: ({ item, mixer }: { item: MenuItem; mixer: MenuItem | null }) => {
      const nombre = mixer ? `${item.nombre} + ${mixer.nombre}` : item.nombre
      const precio = mixer
        ? (item.precioCombinado ?? item.precio) + (mixer.suplementoMixer || 0)
        : item.precio
      return api.comandas.addItem(comanda.id, { nombre, precio, cantidad: 1, tipo: getTipo(item), ...(modoSinCocina ? { directo: true } : {}) })
    },
    onSuccess: (_, { item, mixer }) => {
      avisarAnadido(mixer ? `1× ${item.nombre} + ${mixer.nombre}` : `1× ${item.nombre}`)
      setDotsAnim(true)
      setTimeout(() => setDotsAnim(false), 1600)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      // Combinado en modo sin cocina: volver a la vista del pedido para ver el resultado
      if (modoSinCocina) setTimeout(() => setTab('pedido'), 600)
    },
  })

  // Encargado: cobrar la mesa directamente desde el panel (abre el CobroSheet)
  const [showCobro, setShowCobro] = useState(false)
  // Encargado: modo "sin cocina" — los items añadidos entran ya servidos (se cobran pero no
  // pasan por el flujo de envío a cocina/barra; ej: se decidió servir algo directamente)
  const [modoSinCocina, setModoSinCocina] = useState(false)

  const commitQty = (item: MenuItem, qty: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setQtyPending(null)
    addItem.mutate({ item, cantidad: qty })
  }

  // Tiempo que se esperan más toques del mismo plato antes de mandarlo: en el TPV, más corto,
  // para que aparezca enseguida en la columna de la mesa
  const esperaCantidad = ancho ? 700 : 1500
  const handleMenuItemTap = (item: MenuItem) => {
    if (qtyPending?.id === item.id) {
      const newQty = qtyPending.qty + 1
      setQtyPending({ id: item.id, qty: newQty })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => commitQty(item, newQty), esperaCantidad)
    } else {
      if (qtyPending && timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        addItem.mutate({ item: menu.find(m => m.id === qtyPending.id)!, cantidad: qtyPending.qty })
        setQtyPending(null)
      }
      setQtyPending({ id: item.id, qty: 1 })
      timerRef.current = setTimeout(() => commitQty(item, 1), esperaCantidad)
    }
  }

  // ── Long-press sobre un plato → box de comentario antes de añadir ──
  const startLongPress = (item: MenuItem) => {
    lpFired.current = false
    if (agotadoIds.has(item.id)) return
    if (lpTimer.current) clearTimeout(lpTimer.current)
    lpTimer.current = setTimeout(() => {
      lpFired.current = true
      navigator.vibrate?.(30)
      let qty = 1
      if (qtyPending && timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        if (qtyPending.id === item.id) {
          qty = qtyPending.qty // absorbe los taps previos del mismo plato
        } else {
          const prevItem = menu.find(m => m.id === qtyPending.id)
          if (prevItem) addItem.mutate({ item: prevItem, cantidad: qtyPending.qty })
        }
        setQtyPending(null)
      }
      setNotaNueva({ item, qty, value: '' })
    }, 450)
  }
  const cancelLongPress = () => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
  }
  const tapItem = (item: MenuItem) => {
    if (lpFired.current) { lpFired.current = false; return } // el long-press ya abrió el box
    if (agotadoIds.has(item.id)) return // se acabó: apagado, sin efecto
    // Modo sin cocina: añade al instante (sin timer de cantidad) y vuelve a la vista del pedido
    if (modoSinCocina && !item.combinable) {
      addItem.mutate({ item, cantidad: 1 }, { onSuccess: () => setTimeout(() => setTab('pedido'), 600) })
      return
    }
    if (item.combinable) {
      // Antes de abrir el picker, committea la cantidad pendiente de otro item
      if (qtyPending && timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const prevItem = menu.find(m => m.id === qtyPending.id)
        if (prevItem) addItem.mutate({ item: prevItem, cantidad: qtyPending.qty })
        setQtyPending(null)
      }
      setMixerPick(item)
      return
    }
    handleMenuItemTap(item)
  }

  const updateItem = useMutation({
    mutationFn: ({ itemId, cantidad }: { itemId: number; cantidad: number }) =>
      api.comandas.updateItem(comanda.id, itemId, { cantidad }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api.comandas.deleteItem(comanda.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  // Deshacer una merma: elimina el registro y el item vuelve a la comanda (se cobra normal)
  const restituirMerma = useMutation({
    mutationFn: (id: number) => api.mermas.restituir(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
    },
  })

  // 🎁 Invitación de la casa (solo encargado): toggle a 0 € en cuenta, registra quién y por qué
  const invitarItem = useMutation({
    mutationFn: ({ item, motivo }: { item: ComandaItem; motivo?: string }) => {
      const quien = (() => {
        try { return JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '').nombre as string }
        catch { return undefined }
      })()
      return api.comandas.updateItem(comanda.id, item.id, { invitacion: !item.invitacion, invitadoPor: quien, invitacionMotivo: motivo })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const cambiarPax = useMutation({
    mutationFn: (pax: number) => api.comandas.cambiarPax(comanda.id, pax),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const repeatItem = useMutation({
    mutationFn: (item: ComandaItem) =>
      api.comandas.addItem(comanda.id, { nombre: item.nombre, precio: item.precio, cantidad: 1, tipo: item.tipo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const saveNota = useMutation({
    mutationFn: ({ itemId, value }: { itemId: number; value: string }) =>
      api.comandas.updateItem(comanda.id, itemId, { nota: value }),
    onSuccess: () => { setNota(null); queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }) },
  })

  // Mapa categoria → grupo y orden
  const catMeta: Record<string, { grupo: string; orden: number }> = {}
  for (const c of categorias) catMeta[c.nombre] = { grupo: c.grupo || 'Otros', orden: c.orden }

  // Subcategorías: mapa nombre-hija → nombre-padre. Los items de una subcategoría
  // se muestran dentro del tile de su padre, agrupados con encabezado.
  const padreDe: Record<string, string> = {}
  for (const c of categorias) {
    if (c.parentId) {
      const p = categorias.find(x => x.id === c.parentId)
      if (p) padreDe[c.nombre] = p.nombre
    }
  }
  const catTop = (nombre: string) => padreDe[nombre] ?? nombre
  const subcatsDe = (nombre: string) =>
    categorias.filter(c => padreDe[c.nombre] === nombre).sort((a, b) => a.orden - b.orden)

  // Alergias: solo se miran los platos de comida (en bebidas no hay alérgenos cargados y "sin
  // marcar" se leería como apto). Si la carta no tiene ningún alérgeno cargado, no se ofrece.
  const esComida = (m: MenuItem) => !esGrupoBarra(catMeta[catTop(m.categoria)]?.grupo ?? catMeta[m.categoria]?.grupo ?? '')
  const hayAlergenosCarta = alergenos.length > 0 && menu.some(m => (m.alergenoIds ?? []).length > 0 && esComida(m))
  const filtroAlergias = hayAlergenosCarta ? alergiasMesa.filter(id => alergenos.some(a => a.id === id)) : []
  const chocaCon = (m: MenuItem) =>
    filtroAlergias.length === 0 || !esComida(m) ? [] : alergenos.filter(a => filtroAlergias.includes(a.id) && (m.alergenoIds ?? []).includes(a.id))
  // Marca dentro del botón del plato: rojo con lo que choca, o ✓ verde si se puede comer
  const marcaAlergia = (m: MenuItem) => {
    if (filtroAlergias.length === 0 || !esComida(m)) return null
    const c = chocaCon(m)
    return c.length > 0
      ? <span className="block text-red-400 text-xs font-black mt-0.5 truncate">🚫 {c.map(a => `${a.icono} ${a.nombre}`).join(' · ')}</span>
      : <span className="block text-emerald-400 text-xs font-black mt-0.5">✓ Puede comer</span>
  }
  const aptosDe = (items: MenuItem[]) => items.filter(m => esComida(m) && chocaCon(m).length === 0).length

  // Items activos de una categoría, respetando su flag ordenAlfabetico
  // (apagado = orden manual de la carta física, que ya viene de la API)
  const itemsDeCat = (catNombre: string) => {
    const arr = menu.filter(m => m.activo && !m.ocultoEnCarta && m.categoria === catNombre)
    return categorias.find(c => c.nombre === catNombre)?.ordenAlfabetico
      ? [...arr].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      : arr
  }

  // Grupos únicos ordenados
  const grupos = [...new Set(categorias.map(c => c.grupo || 'Otros'))]
  // Navegación por niveles: grupos → categorías → platos.
  // Sin grupo elegido se muestran los tiles de grupo (si solo hay uno, se entra directo).
  const grupoActivo = grupoTab ?? (grupos.length === 1 ? grupos[0] : null)

  const searchQ = normTxt(searchMenu.trim())
  const filteredMenu = menu.filter(m => {
    if (!m.activo || m.ocultoEnCarta) return false
    // Búsqueda global: ignora el grupo activo y matchea nombre o categoría
    if (searchQ) return normTxt(m.nombre).includes(searchQ) || normTxt(m.categoria).includes(searchQ)
    return !grupoActivo || (catMeta[m.categoria]?.grupo ?? 'Otros') === grupoActivo
  })
  const menuByCategoria = filteredMenu.reduce<Record<string, MenuItem[]>>((acc, m) => {
    const top = catTop(m.categoria)
    if (!acc[top]) acc[top] = []
    acc[top].push(m)
    return acc
  }, {})
  const categoriasSorted = Object.keys(menuByCategoria).sort((a, b) =>
    (catMeta[a]?.orden ?? 99) - (catMeta[b]?.orden ?? 99)
  )

  // Botón de plato (vista de categoría) — tap añade, long-press abre comentario
  const renderItemBtn = (item: MenuItem) => {
    const isPending = qtyPending?.id === item.id
    if (agotadoIds.has(item.id)) return <PlatoAgotado key={item.id} nombre={item.nombre} detalle={item.descripcion} />
    return (
      <button key={item.id} onClick={() => tapItem(item)}
        onPointerDown={() => startLongPress(item)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress}
        onTouchMove={cancelLongPress} onContextMenu={e => e.preventDefault()}
        className={`w-full text-left rounded-xl px-4 py-2 transition-colors relative overflow-hidden select-none ${isPending ? 'bg-[var(--sala-srf2)] border-2 border-[#4CC8A0]' : 'bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'} ${chocaCon(item).length > 0 && !isPending ? 'opacity-50' : ''}`}>
        {/* Letra grande dentro del mismo rectángulo: el relleno baja lo que sube el texto */}
        <span className={`block ${isPending || item.combinable ? 'pr-14' : ''} text-[var(--sala-txt)] text-[1.7rem] font-bold leading-tight ${chocaCon(item).length > 0 ? 'line-through decoration-red-400/70' : ''}`}>{item.nombre}</span>
        {item.descripcion ? <p className="text-[var(--sala-tx3)] text-sm leading-tight mt-0.5 truncate">{item.descripcion}</p> : null}
        {marcaAlergia(item)}
        {item.combinable && !isPending && (
          <span className="absolute right-3 inset-y-0 flex items-center text-[var(--sala-tx3)] text-sm font-bold">🥤+</span>
        )}
        {isPending && <span className="absolute right-3 inset-y-0 flex items-center"><span className="text-[#4CC8A0] font-black text-2xl">{qtyPending!.qty}×</span></span>}
      </button>
    )
  }

  // ── Carta del puesto TPV (tablet): todo a la vista, sin entrar y salir de niveles ──
  // Grupos y categorías como pestañas fijas arriba; los platos en cuadrados grandes. Una categoría
  // con subcategorías muestra todas sus subcategorías seguidas, cada una con su título.
  const tpvGrupo = grupoTab ?? grupos[0] ?? null
  const tpvCats = categorias
    .filter(c => !c.parentId && (c.grupo || 'Otros') === tpvGrupo)
    .filter(c => itemsDeCat(c.nombre).length > 0 || subcatsDe(c.nombre).some(sc => itemsDeCat(sc.nombre).length > 0))
    .sort((a, b) => a.orden - b.orden)
  const tpvCat = tpvCats.find(c => c.nombre === selectedCat) ?? tpvCats[0] ?? null
  const tpvBloques = !tpvCat ? [] : [
    { titulo: null as string | null, items: itemsDeCat(tpvCat.nombre) },
    ...subcatsDe(tpvCat.nombre).map(sc => ({ titulo: sc.nombre as string | null, items: itemsDeCat(sc.nombre) })),
  ].filter(b => b.items.length > 0)
  const tpvBarra = esGrupoBarra(tpvGrupo ?? '')
  const tileTpv = (item: MenuItem) => {
    const isPending = qtyPending?.id === item.id
    const barra = esGrupoBarra(catMeta[catTop(item.categoria)]?.grupo ?? '')
    if (agotadoIds.has(item.id)) return (
      <div key={item.id} aria-disabled className="aspect-square rounded-2xl p-3 flex flex-col justify-between bg-[var(--sala-srf)] opacity-40 select-none">
        <span className="text-[var(--sala-txt)] text-lg font-black uppercase leading-tight line-through break-words">{item.nombre}</span>
        <span className="text-red-400 text-xs font-black tracking-wider">AGOTADO</span>
      </div>
    )
    return (
      <button key={item.id} onClick={() => tapItem(item)}
        onPointerDown={() => startLongPress(item)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress}
        onTouchMove={cancelLongPress} onContextMenu={e => e.preventDefault()}
        className={`aspect-square rounded-2xl p-3 flex flex-col text-center relative overflow-hidden select-none active:scale-95 transition-all border-2 ${
          isPending ? 'border-[#4CC8A0] bg-[var(--sala-srf2)]'
          : barra ? 'border-transparent bg-amber-500/10 hover:bg-amber-500/15'
          : 'border-transparent bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'} ${chocaCon(item).length > 0 && !isPending ? 'opacity-50' : ''}`}>
        {/* Con una palabra muy larga (VALDELACIERVA) la letra baja un punto para no partirla */}
        {/* Nombre (y descripción) centrados en el cuadrado; el precio abajo */}
        <span className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1">
          <span className={`text-[var(--sala-txt)] font-black uppercase leading-tight break-words line-clamp-4 ${
            item.nombre.split(/\s+/).some(w => w.length >= 10) ? 'text-[15px]' : 'text-lg'}`}>{item.nombre}</span>
          {item.descripcion && <span className="text-[var(--sala-tx3)] text-[11px] leading-tight line-clamp-2">{item.descripcion}</span>}
          {marcaAlergia(item)}
        </span>
        <span className="text-[var(--sala-tx2)] text-sm font-bold tabular-nums">{item.combinable ? '🥤+' : `${item.precio.toFixed(2)} €`}</span>
        {isPending && (
          <span className="absolute top-2 right-2 min-w-9 h-9 px-2 rounded-full bg-[#4CC8A0] text-white font-black text-lg flex items-center justify-center">{qtyPending!.qty}×</span>
        )}
      </button>
    )
  }
  // Pie con el botón de comandar (viñeta en el centro), no el de cuenta impresa / ver cuenta
  const pieOido = !yaFacturada && !(!hayPendientes && (yaEnviada || comanda.items.some(i => i.nivel != null)))
  const puedeVolver = tab === 'menu' && !ancho && !searchMenu.trim() && !!(selectedSub || selectedCat || (grupoTab && grupos.length > 1))
  const rejillaTpv = 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5'
  const cartaTpv = (
    <div className="flex-1 min-h-0 flex flex-col">
      {!searchMenu.trim() && !tecladoTpv && (
        <div className="px-3 pt-3 pb-2 space-y-2 border-b border-[var(--sala-brd)]">
          {grupos.length > 1 && (
            <div className="flex gap-2">
              {grupos.map(g => (
                <button key={g} onClick={() => { setGrupoTab(g); setSelectedCat(null); setSelectedSub(null) }}
                  className={`flex-1 h-12 rounded-xl text-base font-black uppercase tracking-wide active:scale-95 transition-all ${
                    g === tpvGrupo ? 'text-white shadow-lg' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'}`}
                  style={g === tpvGrupo ? { background: esGrupoBarra(g) ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' } : undefined}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {tpvCats.map(c => (
              <button key={c.id} onClick={() => { setSelectedCat(c.nombre); setSelectedSub(null) }}
                className={`h-12 px-4 rounded-xl text-sm font-black uppercase tracking-wide active:scale-95 transition-all border-2 ${
                  c.id === tpvCat?.id
                    ? (tpvBarra ? 'border-amber-500 bg-amber-500/20 text-[var(--sala-txt)]' : 'border-[#4CC8A0] bg-[#4CC8A0]/15 text-[var(--sala-txt)]')
                    : 'border-transparent bg-[var(--sala-srf)] text-[var(--sala-tx2)]'}`}>
                {c.icono ? <span className="mr-1.5">{c.icono}</span> : null}{c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {searchMenu.trim() ? (
          <>
            <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase tracking-wide">
              {filteredMenu.length === 0 ? 'Sin resultados' : filteredMenu.length === 1 ? '1 resultado' : `${filteredMenu.length} resultados`} para «{searchMenu.trim()}»
            </p>
            {filteredMenu.length > 0 && <div className={rejillaTpv}>{filteredMenu.map(tileTpv)}</div>}
          </>
        ) : tecladoTpv ? (
          <p className="text-[var(--sala-tx3)] text-lg font-bold text-center py-10">Escribe el nombre del plato o la bebida</p>
        ) : tpvBloques.map((b, i) => (
          <div key={b.titulo ?? i}>
            {b.titulo && <NivelEtiqueta titulo={b.titulo} />}
            <div className={rejillaTpv}>{b.items.map(tileTpv)}</div>
          </div>
        ))}
      </div>
      {tecladoTpv && <TecladoTpv
        onTecla={t => setSearchMenu(v => (v + t).replace(/^ +/, '').slice(0, 30))}
        onBorrar={() => setSearchMenu(v => v.slice(0, -1))}
        onLimpiar={() => setSearchMenu('')}
        onCerrar={() => { setTecladoTpv(false); setSearchMenu('') }} />}
    </div>
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div ref={panelRef} className={`relative w-full bg-[var(--sala-hdr)] h-full shadow-2xl ${ancho
          ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,40%)] grid-rows-[auto_minmax(0,1fr)_auto]'
          : 'sm:max-w-md flex flex-col border-l border-[var(--sala-brd)]'}`} onClick={e => e.stopPropagation()}
        onTouchStart={e => { if (!ancho) swipeCloseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const s = swipeCloseRef.current
          swipeCloseRef.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x
          const dy = e.changedTouches[0].clientY - s.y
          const th = swipeThresholds()
          // Cualquier dirección horizontal (como el swipe de niveles de la carta)
          if (Math.abs(dx) <= th.dx || Math.abs(dy) >= th.dy) return
          // Progresión del gesto: Pedido → Carta (categorías) → Mapa
          if (tab === 'pedido') {
            // Entró a mirar el pedido → seguir a la carta para agregar cosas
            setTab('menu')
            setSelectedCat(null); setSelectedSub(null); setGrupoTab(null); setSearchMenu('')
            return
          }
          // En el primer nivel de la carta (sin categoría abierta ni búsqueda) → salir al mapa
          if (!selectedCat && grupoTab === null && !searchMenu.trim()) {
            // Con items ingresados sin comandar → alerta de descarte (igual que la ✕)
            if (itemsNuevos.length > 0) setConfirmarCerrar(true)
            else onClose()
          }
        }}>
        {/* Header */}
        <div className={`px-5 pt-5 pb-3 border-b border-[var(--sala-brd)] ${ancho ? 'col-start-2 row-start-1 border-l' : ''}`}>
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[var(--sala-txt)] font-bold text-xl">
                Mesa {comanda.mesa.numero}
                <span className="ml-2 text-sm font-bold text-amber-400 tabular-nums align-middle">
                  🕐 {fmtHora(comanda.enviadaAt ?? comanda.createdAt)}
                </span>
                {comanda.noComparten && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-[var(--sala-txt)] text-[var(--sala-bg)] text-[10px] font-black uppercase tracking-wide align-middle">🍽 No comparten</span>
                )}
              </h2>
              {comanda.notaMesa && <p className="text-[var(--sala-tx2)] text-xs truncate">📝 {comanda.notaMesa}</p>}
              {/* De dónde vino la gente; el encargado lo toca para corregirlo ("No era esta reserva") */}
              {(comanda.reserva || esEncargado) && (
                <button type="button" disabled={!esEncargado} onClick={() => setQuienEsta(true)}
                  className="block max-w-full text-left disabled:cursor-default">
                  {!comanda.reserva
                    ? <span className="text-[var(--sala-tx4)] text-xs font-bold">📅 ¿Reserva o walk-in?</span>
                    : comanda.reserva.origen === 'walkin'
                      ? <span className="text-[var(--sala-tx2)] text-xs font-bold">🚶 Walk-in · llegó {comanda.reserva.hora}{esEncargado ? ' ›' : ''}</span>
                      : <span className="block text-sky-400 text-xs font-bold truncate">
                          📅 {comanda.reserva.nombre ?? 'Reserva'} · {comanda.reserva.hora}
                          {comanda.reserva.notas && <span className="font-normal text-[var(--sala-tx2)]"> · {comanda.reserva.notas}</span>}
                          {esEncargado ? ' ›' : ''}
                        </span>}
                </button>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <button onClick={() => cambiarPax.mutate(Math.max(1, comanda.pax - 1))}
                  className="w-6 h-6 rounded-md bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm font-bold hover:bg-gray-600 flex items-center justify-center leading-none">−</button>
                <span className="text-[var(--sala-tx2)] text-sm">{comanda.pax} pax</span>
                <button onClick={() => cambiarPax.mutate(comanda.pax + 1)}
                  className="w-6 h-6 rounded-md bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm font-bold hover:bg-gray-600 flex items-center justify-center leading-none">+</button>
                <span className="text-[var(--sala-tx4)] text-xs">·</span>
                <button onClick={() => setVerCuenta(true)} title="Ver cuenta"
                  className="text-xl leading-none hover:scale-110 transition-transform active:scale-95">
                  🧾
                </button>
                <span className="text-[var(--sala-tx4)] text-xs">· {timeAgo(comanda.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {onCambiarMesa && (
                <button onClick={onCambiarMesa} title="Cambiar mesa"
                  className="text-[var(--sala-tx3)] hover:text-cyan-400 text-sm px-2 py-1 rounded-lg bg-[var(--sala-btn2)] hover:bg-gray-700 transition-colors">
                  ↔
                </button>
              )}
              <button onClick={() => itemsNuevos.length > 0 ? setConfirmarCerrar(true) : onClose()} className="text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-xl">✕</button>
            </div>
          </div>
          {!ancho && <div className="flex gap-1.5 mt-3 items-stretch">
            {/* Tabs gemelos: mismo fondo de marca + contenido blanco gordo; el activo brilla, el inactivo se atenúa */}
            <button onClick={() => setTab('pedido')}
              className={`flex-1 py-2 rounded-lg text-base font-black uppercase tracking-wide text-white transition-all active:scale-95 ${tab === 'pedido' ? 'shadow-lg' : 'opacity-45'}`}
              style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
              Comanda ({comanda.items.length})
            </button>
            {/* Añadir: el + bien tocho */}
            <button onClick={() => setTab('menu')} aria-label="Añadir items" title="Añadir items"
              className={`flex-1 py-2 rounded-lg text-white transition-all flex items-center justify-center active:scale-95 ${tab === 'menu' ? 'shadow-lg' : 'opacity-45'}`}
              style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>}
        </div>

        {/* Contenido (en el TPV, 'contents': cada columna es una celda de la rejilla del panel) */}
        <div className={ancho ? 'contents' : 'flex-1 overflow-y-auto'}>
          {(tab === 'pedido' || ancho) && (
            <div className={ancho ? 'col-start-2 row-start-2 overflow-y-auto border-l border-[var(--sala-brd)]' : ''}>
            {/* Marcha pasa sticky — visible mientras scrolleas el pedido */}
            {comanda.items.some(i => i.nivel != null) && itemsNuevos.length > 0 && (
              <div className="sticky top-0 z-10 px-4 pt-3 pb-2 border-b border-amber-900/40 bg-amber-950/95 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[var(--sala-txt)] text-xs font-black shrink-0">+</div>
                  <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Marcha pasa</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {itemsNuevos.map(i => (
                    <span key={i.id} className="flex items-center gap-1 bg-amber-900/40 border border-amber-700/40 rounded-lg px-2 py-1">
                      <span className="text-amber-200 text-xs font-medium">{i.nombre}</span>
                      {i.cantidad > 1 && !(i.tipo === 'barra' && i.ronda > 0) && <span className="text-amber-400 text-xs font-black">×{i.cantidad}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="p-4">
              {comanda.items.length === 0 && (
                <div className="text-center py-12 text-[var(--sala-tx4)]">
                  <p className="text-3xl mb-2">🍽</p>
                  <p className="text-sm">{ancho ? 'Sin items. Toca los platos de la carta.' : 'Sin items. Ve a "Añadir".'}</p>
                </div>
              )}
              {(() => {
                const itemsCocina = comanda.items.filter(i => i.tipo !== 'barra').sort((a, b) => a.id - b.id)
                const itemsBarra  = comanda.items.filter(i => i.tipo === 'barra').sort((a, b) => a.id - b.id)
                const tienenNivel = itemsCocina.some(i => i.nivel != null)
                // TPV: los platos sin comandar se ven ya agrupados por el nivel que propondrá el Oído
                const propuestos = propuestosTpv
                const filas = (lista: ComandaItem[]) => lista.map((item: ComandaItem) => (
                  <ItemRow key={item.id} agotado={sinComandarAgotada(item)} item={item} nota={nota} setNota={setNota}
                    onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                    onDelete={() => deleteItem.mutate(item.id)}
                    onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                    onMerma={enLocal ? undefined : () => setMermaItem(item)}
                    onInvitar={esEncargado ? () => invitarItem.mutate({ item }) : undefined} />
                ))
                const flecha = 'w-10 h-10 shrink-0 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-base font-black flex items-center justify-center active:scale-90 disabled:opacity-20'
                const porNivelPropuesto = (lista: ComandaItem[]) => {
                  const conNivel = lista.filter(i => !i.autoGenerado)
                  const nivelesUsados = [...new Set(conNivel.map(i => propuestos[i.id]))].sort((a, b) => a - b)
                  return (
                    <>
                      {nivelesUsados.map(nv => {
                        const enNivel = conNivel.filter(i => propuestos[i.id] === nv)
                        return (
                          <div key={nv}>
                            <NivelEtiqueta titulo={tituloNivel(nv, enNivel.map(i => i.nombre), menu, categorias)}>
                              {/* ▲▼ mueven el nivel entero, como en el orden de salida */}
                              <div className="flex gap-1">
                                <button onClick={() => moverNivelTpv(enNivel.map(i => i.id), -1)} disabled={nv <= 1} aria-label="Subir el nivel"
                                  className="w-8 h-8 rounded-lg bg-cyan-600/30 text-cyan-500 text-xs font-black disabled:opacity-20 flex items-center justify-center">▲</button>
                                <button onClick={() => moverNivelTpv(enNivel.map(i => i.id), 1)} aria-label="Bajar el nivel"
                                  className="w-8 h-8 rounded-lg bg-cyan-600/30 text-cyan-500 text-xs font-black flex items-center justify-center">▼</button>
                              </div>
                            </NivelEtiqueta>
                            <div className="space-y-2">
                              {enNivel.map(item => (
                                <div key={item.id} className="flex items-center gap-1.5">
                                  <div className="flex-1 min-w-0">{filas([item])}</div>
                                  <button onClick={() => moverNivelTpv([item.id], -1)} disabled={nv <= 1} aria-label="Subir de nivel" className={flecha}>▲</button>
                                  <button onClick={() => moverNivelTpv([item.id], 1)} aria-label="Bajar de nivel" className={flecha}>▼</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {lista.some(i => i.autoGenerado) && <div className="space-y-2">{filas(lista.filter(i => i.autoGenerado))}</div>}
                    </>
                  )
                }

                return (
                  <div className="space-y-4">
                    {!yaFacturada && (
                      <div className="flex items-center gap-3">
                        {/* 🍷 Asistente de vinos (con la comida de la mesa o, si piden el vino antes, por gusto).
                            La copa late si la mesa todavía no tiene ninguna botella. */}
                        {hayVinos && <BotonVino onClick={() => setVerVinos(true)} invita={mesaSinBotella} />}
                        {/* Reordenar niveles — mismas herramientas que el orden de salida original */}
                        {tienenNivel && (
                          <button onClick={() => setOrdenarFull(true)}
                            className="flex-1 py-2.5 rounded-xl border-2 border-dashed border-cyan-700/50 text-cyan-400 text-sm font-bold active:scale-[0.98] transition-transform hover:border-cyan-500/70">
                            🔀 Ordenar salidas
                          </button>
                        )}
                      </div>
                    )}
                    {/* ── Cocina ── */}
                    {!tienenNivel && ancho ? (
                      // TPV, comanda nueva: ya ordenada por niveles mientras se pica
                      <div className="space-y-4">{porNivelPropuesto(itemsCocina)}</div>
                    ) : !tienenNivel ? (
                      // Comanda nueva: lista plana
                      <div className="space-y-2">
                        {itemsCocina.map((item: ComandaItem) => (
                          <ItemRow key={item.id} agotado={sinComandarAgotada(item)} item={item} nota={nota} setNota={setNota}
                            onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                            onDelete={() => deleteItem.mutate(item.id)}
                            onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                            onMerma={enLocal ? undefined : () => setMermaItem(item)}
                                    onInvitar={esEncargado ? () => invitarItem.mutate({ item }) : undefined} />
                        ))}
                      </div>
                    ) : (
                      // Comanda enviada: marcha pasa pendiente arriba + confirmados por nivel abajo
                      (() => {
                        const pendientesCocina = itemsCocina.filter(i => i.nivel == null)
                        const enviados = itemsCocina.filter(i => i.nivel != null)
                        const maxNivel = enviados.length > 0 ? Math.max(...enviados.map(i => i.nivel!)) : 1
                        return (
                          <div className="space-y-4">
                            {/* Marcha pasa pendiente — primero */}
                            {pendientesCocina.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-[var(--sala-txt)] text-xs font-black shrink-0">+</div>
                                  <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Marcha pasa</span>
                                  <div className="flex-1 h-px bg-amber-900/40" />
                                </div>
                                {ancho ? <div className="space-y-3 pl-2 border-l-2 border-amber-500/40">{porNivelPropuesto(pendientesCocina)}</div> : <div className="space-y-2">
                                  {pendientesCocina.map((item: ComandaItem) => (
                                    <ItemRow key={item.id} agotado={sinComandarAgotada(item)} item={item} nota={nota} setNota={setNota}
                                      onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                                      onDelete={() => deleteItem.mutate(item.id)}
                                      onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                                      onMerma={enLocal ? undefined : () => setMermaItem(item)}
                                    onInvitar={esEncargado ? () => invitarItem.mutate({ item }) : undefined} />
                                  ))}
                                </div>}
                              </div>
                            )}
                            {/* Confirmados por nivel — debajo */}
                            {Array.from({ length: maxNivel }, (_, i) => i + 1).map(nv => {
                              const items = enviados.filter(i => i.nivel === nv)
                              if (!items.length) return null
                              return (
                                <div key={nv}>
                                    <NivelEtiqueta titulo={tituloNivel(nv, items.map(i => i.nombre), menu, categorias)} />
                                  <div className="space-y-2">
                                    {items.map((item: ComandaItem) => (
                                      <ItemRow key={item.id} agotado={sinComandarAgotada(item)} item={item} nota={nota} setNota={setNota}
                                        onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                                        onDelete={() => deleteItem.mutate(item.id)}
                                        onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                                        onMerma={enLocal ? undefined : () => setMermaItem(item)}
                                        onInvitar={esEncargado ? () => invitarItem.mutate({ item }) : undefined}
                                        onRepeat={() => repeatItem.mutate(item)} />
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()
                    )}

                    {/* ── Barra ya enviada (agrupada por nombre) ── */}
                    {(() => {
                      const barraEnviada = tienenNivel ? itemsBarra.filter(i => i.nivel != null) : itemsBarra
                      if (!barraEnviada.length) return null
                      const grouped = barraEnviada.reduce<{ firstItem: ComandaItem; cantidad: number }[]>((acc, item) => {
                        const found = acc.find(g => g.firstItem.nombre === item.nombre)
                        if (found) { found.cantidad += item.cantidad } else { acc.push({ firstItem: item, cantidad: item.cantidad }) }
                        return acc
                      }, [])
                      return (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">🍺 Barra</span>
                            <div className="flex-1 h-px bg-[var(--sala-btn)]" />
                          </div>
                          <div className="space-y-2">
                            {grouped.map(({ firstItem, cantidad }) => (
                              <ItemRow key={firstItem.id} agotado={sinComandarAgotada(firstItem)} item={{ ...firstItem, cantidad }} nota={nota} setNota={setNota}
                                onUpdate={newQty => updateItem.mutate({ itemId: firstItem.id, cantidad: firstItem.cantidad + (newQty - cantidad) })}
                                onDelete={() => deleteItem.mutate(firstItem.id)}
                                onSaveNota={v => saveNota.mutate({ itemId: firstItem.id, value: v })}
                                onMerma={enLocal ? undefined : () => setMermaItem(firstItem)}
                                onInvitar={esEncargado ? () => invitarItem.mutate({ item: firstItem }) : undefined} />
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* ── Mermas de esta mesa — se pueden deshacer (restituir) ── */}
                    {comanda.mermas.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-red-400 text-xs font-semibold uppercase tracking-wide">🗑 Mermas</span>
                          <div className="flex-1 h-px bg-red-900/40" />
                        </div>
                        <div className="space-y-1.5">
                          {comanda.mermas.map(m => (
                            <div key={m.id} className="flex items-center gap-3 bg-red-900/15 border border-red-900/30 rounded-xl px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-[var(--sala-tx1)] text-sm truncate">
                                  {m.cantidad > 1 ? `${m.cantidad}× ` : ''}{m.itemNombre}
                                </p>
                                <p className="text-[var(--sala-tx3)] text-xs truncate">
                                  {MOTIVO_MERMA_LABEL[m.motivo] ?? m.motivo}
                                  {m.descripcion ? ` — ${m.descripcion}` : ''}
                                  {m.camareroNombre ? ` · ${m.camareroNombre}` : ''}
                                </p>
                              </div>
                              <button onClick={() => restituirMerma.mutate(m.id)} disabled={restituirMerma.isPending}
                                title="Deshacer la merma: el item vuelve a la comanda y se cobra normal"
                                className="text-xs font-bold text-red-300 bg-red-900/40 hover:bg-red-900/60 px-3 py-2 rounded-lg shrink-0 disabled:opacity-50 active:scale-95 transition-transform">
                                ↩ Deshacer
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            </div>
          )}

          {(tab === 'menu' || ancho) && (
            <div className={ancho ? 'col-start-1 row-start-1 row-span-3 flex flex-col min-h-0 relative' : 'flex flex-col h-full'}>
              {/* Marcha pasa en curso — visible mientras se añaden items (en el TPV ya se ve en la columna de la mesa) */}
              {!ancho && comanda.items.some(i => i.nivel != null) && itemsNuevos.length > 0 && (
                <div className="sticky top-0 z-10 px-4 pt-3 pb-2 border-b border-amber-900/40 bg-amber-950/95 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[var(--sala-txt)] text-xs font-black shrink-0">+</div>
                    <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Marcha pasa</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {itemsNuevos.map(i => (
                      <span key={i.id} className="flex items-center gap-1 bg-amber-900/40 border border-amber-700/40 rounded-lg px-2 py-1">
                        <span className="text-amber-200 text-xs font-medium">{i.nombre}</span>
                        {i.cantidad > 1 && !(i.tipo === 'barra' && i.ronda > 0) && <span className="text-amber-400 text-xs font-black">×{i.cantidad}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Search global + modo sin cocina (encargado) */}
              <div className={`px-2.5 pt-2 pb-1.5 border-b border-[var(--sala-brd)] ${modoSinCocina ? 'bg-amber-500/10' : ''}`}>
                <div className="flex items-center gap-2">
                  {/* En el TPV, inputMode none: no sale el teclado del sistema (sí funciona uno físico)
                      y al tocarlo se abre el teclado propio de abajo */}
                  <input ref={searchInputRef} value={searchMenu}
                    onChange={e => { setSearchMenu(e.target.value); if (!ancho) { setSelectedCat(null); setSelectedSub(null) } }}
                    inputMode={ancho ? 'none' : undefined}
                    onPointerDown={() => { if (ancho) setTecladoTpv(true) }}
                    placeholder={ancho ? '🔍 Buscar en toda la carta…' : 'Buscar en todo el menú…'}
                    className={`flex-1 bg-[var(--sala-btn2)] text-[var(--sala-txt)] rounded-lg outline-none placeholder:text-[var(--sala-tx4)] ${ancho
                      ? `text-lg font-bold uppercase px-4 py-3 ${tecladoTpv ? 'ring-2 ring-[#4CC8A0]' : ''}` : 'text-xs px-3 py-1.5'}`} />
                  {hayAlergenosCarta && (
                    <button onClick={() => setVerAlergias(true)}
                      className={`shrink-0 font-black rounded-lg border transition-all active:scale-95 ${ancho ? 'text-base px-4 py-3' : 'text-[11px] px-2.5 py-1.5'} ${
                        filtroAlergias.length > 0
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-transparent border-[var(--sala-brd2)] text-[var(--sala-tx3)]'
                      }`}>
                      ⚠️ Alergias{filtroAlergias.length > 0 ? ` (${filtroAlergias.length})` : ''}
                    </button>
                  )}
                  {esEncargado && (
                    <button onClick={() => setModoSinCocina(v => !v)}
                      title={modoSinCocina
                        ? 'Modo sin cocina ACTIVO: los items que añadas entran ya servidos (se cobran, no se imprimen en cocina). Tocá para desactivar.'
                        : 'Añadir sin cocina: los items entran ya servidos — se cobran pero no salen por la impresora de cocina'}
                      className={`shrink-0 text-[11px] font-black px-2.5 py-1.5 rounded-lg border transition-all ${
                        modoSinCocina
                          ? 'bg-amber-500 border-amber-500 text-black'
                          : 'bg-transparent border-[var(--sala-brd2)] text-[var(--sala-tx3)]'
                      }`}>
                      🔇 sin cocina{modoSinCocina ? ' ON' : ''}
                    </button>
                  )}
                </div>
                {filtroAlergias.length > 0 && (
                  <button onClick={() => setVerAlergias(true)}
                    className={`mt-1.5 w-full text-left text-red-400 font-bold truncate ${ancho ? 'text-sm' : 'text-[11px]'}`}>
                    🚫 Alérgico a: {alergenos.filter(a => filtroAlergias.includes(a.id)).map(a => `${a.icono} ${a.nombre}`).join(' · ')}
                    <span className="text-[var(--sala-tx3)] font-semibold"> · avisa a cocina</span>
                  </button>
                )}
                {modoSinCocina && (
                  <p className="text-amber-500 text-[11px] font-bold mt-1.5">
                    ⚠️ Los items que añadas NO saldrán por cocina/barra — entran directo a la cuenta
                  </p>
                )}
              </div>

              {ancho ? cartaTpv : searchMenu.trim() ? (
                /* ── Resultados de búsqueda (lista plana) ── */
                <div className={`flex-1 overflow-y-auto ${ancho ? 'p-3 grid grid-cols-2 gap-2 content-start' : 'p-4 space-y-1.5'}`}>
                  {filteredMenu.map((item: MenuItem) => {
                    const isPending = qtyPending?.id === item.id
                    if (agotadoIds.has(item.id)) return <PlatoAgotado key={item.id} nombre={item.nombre} detalle={item.categoria} />
                    return (
                      <button key={item.id} onClick={() => tapItem(item)}
                        onPointerDown={() => startLongPress(item)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress}
                        onTouchMove={cancelLongPress} onContextMenu={e => e.preventDefault()}
                        className={`w-full text-left rounded-xl px-4 py-1.5 transition-colors relative overflow-hidden select-none ${isPending ? 'bg-[var(--sala-srf2)] border-2 border-[#4CC8A0]' : 'bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'}`}>
                        <p className={`${isPending ? 'pr-14' : ''} text-[var(--sala-txt)] text-2xl font-bold leading-tight ${chocaCon(item).length > 0 ? 'line-through decoration-red-400/70 opacity-60' : ''}`}>{item.nombre}</p>
                        <p className="text-[var(--sala-tx3)] text-xs">{item.categoria}</p>
                        {marcaAlergia(item)}
                        {isPending && <span className="absolute right-3 inset-y-0 flex items-center"><span className="text-[#4CC8A0] font-black text-2xl">{qtyPending!.qty}×</span></span>}
                      </button>
                    )
                  })}
                  {filteredMenu.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-8">Sin resultados</p>}
                </div>
              ) : selectedCat ? (
                /* ── Dentro de una categoría: tiles de subcategoría o items ── */
                <div className="flex-1 overflow-y-auto"
                  onTouchStart={e => { swipeRef.current = e.touches[0].clientX }}
                  onTouchEnd={e => {
                    // Swipe horizontal en cualquier dirección → un nivel atrás
                    if (swipeRef.current !== null && Math.abs(e.changedTouches[0].clientX - swipeRef.current) > swipeThresholds().dx)
                      selectedSub ? setSelectedSub(null) : setSelectedCat(null)
                    swipeRef.current = null
                  }}>
                  <button onClick={() => selectedSub ? setSelectedSub(null) : setSelectedCat(null)}
                    className="flex items-center gap-2 px-4 py-3 text-cyan-400 text-sm font-semibold w-full border-b border-[var(--sala-brd)] hover:bg-[var(--sala-btn2)]/40">
                    ← {selectedSub ?? selectedCat}
                  </button>
                  {selectedSub ? (
                    /* ── Nivel 4: items de la subcategoría ── */
                    <div className={ancho ? 'p-3 grid grid-cols-2 gap-2' : 'p-4 space-y-1.5'}>
                      {itemsDeCat(selectedSub).map(renderItemBtn)}
                    </div>
                  ) : (
                    <>
                      {/* Tiles de subcategoría (mismo diseño que las categorías) */}
                      {subcatsDe(selectedCat).length > 0 && (
                        <div className={`p-2 grid ${ancho ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                          {subcatsDe(selectedCat).map(sc => {
                            const count = filtroAlergias.length && !esGrupoBarra(sc.grupo || catMeta[selectedCat]?.grupo || '')
                              ? `✓${aptosDe(itemsDeCat(sc.nombre))}` : itemsDeCat(sc.nombre).length
                            const esBarra = esGrupoBarra(sc.grupo || catMeta[selectedCat]?.grupo || '')
                            return (
                              <button key={sc.id} onClick={() => setSelectedSub(sc.nombre)}
                                className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1.5 p-2 active:scale-95 transition-all border ${
                                  esBarra
                                    ? 'bg-amber-500/[0.06] border-amber-600/25 hover:bg-amber-500/10 hover:border-amber-500/40'
                                    : 'bg-[var(--sala-srf)] border-[var(--sala-brd)]/50 hover:bg-[var(--sala-srf2)] hover:border-cyan-700/40'
                                }`}>
                                <span className={`absolute top-1.5 right-2 text-xs font-semibold tabular-nums ${esBarra ? 'text-amber-500/80' : 'text-[var(--sala-tx4)]'}`}>{count}</span>
                                <span className="text-4xl leading-none">{sc.icono || '🍽'}</span>
                                <NombreTile nombre={sc.nombre} />
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {/* Items directos de la categoría */}
                      <div className={ancho ? 'p-3 pt-2 grid grid-cols-2 gap-2' : 'p-4 pt-2 space-y-1.5'}>
                        {itemsDeCat(selectedCat).map(renderItemBtn)}
                      </div>
                    </>
                  )}
                </div>
              ) : grupoActivo ? (
                /* ── Nivel 2: grid de categorías del grupo (tiles cuadrados) ── */
                <div className="flex-1 overflow-y-auto p-2"
                  onTouchStart={e => { swipeRef.current = e.touches[0].clientX }}
                  onTouchEnd={e => {
                    if (swipeRef.current !== null && Math.abs(e.changedTouches[0].clientX - swipeRef.current) > swipeThresholds().dx && grupos.length > 1)
                      setGrupoTab(null)
                    swipeRef.current = null
                  }}>
                  <div className={`grid ${ancho ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                    {categoriasSorted.map(cat => {
                      const meta = categorias.find(c => c.nombre === cat)
                      const esBarra = esGrupoBarra(meta?.grupo ?? '')
                      const count = filtroAlergias.length && !esBarra ? `✓${aptosDe(menuByCategoria[cat] ?? [])}` : menuByCategoria[cat]?.length ?? 0
                      return (
                        <button key={cat} onClick={() => { setSelectedCat(cat); setSelectedSub(null) }}
                          className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1.5 p-2 active:scale-95 transition-all border ${
                            esBarra
                              ? 'bg-amber-500/[0.06] border-amber-600/25 hover:bg-amber-500/10 hover:border-amber-500/40'
                              : 'bg-[var(--sala-srf)] border-[var(--sala-brd)]/50 hover:bg-[var(--sala-srf2)] hover:border-cyan-700/40'
                          }`}>
                          <span className={`absolute top-1.5 right-2 text-xs font-semibold tabular-nums ${esBarra ? 'text-amber-500/80' : 'text-[var(--sala-tx4)]'}`}>{count}</span>
                          <span className="text-4xl leading-none">{meta?.icono ?? '🍽'}</span>
                          <NombreTile nombre={cat} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* ── Nivel 1: tiles de grupo (COMIDA / BEBIDAS / VINOS) ── */
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {grupos.map(g => {
                    const esBarra = esGrupoBarra(g)
                    const nCats = categorias.filter(c => (c.grupo || 'Otros') === g).length
                    const icono = /vino/i.test(g) ? '🍷' : /bebida/i.test(g) ? '🍹' : /comida/i.test(g) ? '🍽️' : '📋'
                    return (
                      <button key={g} onClick={() => { setGrupoTab(g); setSelectedCat(null); setSelectedSub(null) }}
                        className={`w-full h-24 rounded-2xl flex items-center gap-4 px-5 active:scale-[0.97] transition-all border ${
                          esBarra
                            ? 'bg-amber-500/[0.06] border-amber-600/25 hover:bg-amber-500/10 hover:border-amber-500/40'
                            : 'bg-[var(--sala-srf)] border-[var(--sala-brd)]/50 hover:bg-[var(--sala-srf2)] hover:border-cyan-700/40'
                        }`}>
                        <span className="text-4xl leading-none">{icono}</span>
                        <span className="flex-1 text-left text-[var(--sala-txt)] text-2xl font-black uppercase tracking-wide truncate">{g}</span>
                        <span className={`text-xs font-semibold tabular-nums ${esBarra ? 'text-amber-500/80' : 'text-[var(--sala-tx4)]'}`}>{nCats}</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--sala-tx4)] shrink-0">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Box de comentario (long-press sobre un plato) */}
        {notaNueva && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setNotaNueva(null)}>
            <div className="w-full max-w-sm bg-[var(--sala-hdr)] border border-[var(--sala-brd2)] rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider mb-1">💬 Comentario</p>
              <h3 className="text-[var(--sala-txt)] font-bold text-lg mb-3">
                {notaNueva.item.nombre}{notaNueva.qty > 1 && <span className="text-[#4CC8A0]"> ×{notaNueva.qty}</span>}
              </h3>
              <textarea
                autoFocus
                value={notaNueva.value}
                onChange={e => setNotaNueva({ ...notaNueva, value: e.target.value })}
                placeholder="Sin cebolla, poco hecho, alergia…"
                rows={3}
                className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-3 py-2.5 rounded-xl outline-none placeholder:text-[var(--sala-tx4)] resize-none"
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setNotaNueva(null)}
                  className="px-4 py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
                  Cancelar
                </button>
                <button
                  onClick={() => { addItem.mutate({ item: notaNueva.item, cantidad: notaNueva.qty, nota: notaNueva.value.trim() || undefined }); setNotaNueva(null) }}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}
                >
                  Añadir{notaNueva.value.trim() ? ' con comentario' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sheet de cobro (encargado, mismo flujo que el dashboard) */}
        {showCobro && (
          <CobroSheet comanda={comanda} onClose={() => setShowCobro(false)} onDone={onClose} />
        )}

        {verVinos && (
          <MaridajeSheet comanda={comanda} menu={menu} agotadoIds={agotadoIds}
            onAdd={vino => addItem.mutate({ item: vino, cantidad: 1 })}
            onClose={() => setVerVinos(false)} />
        )}

        {/* ⚠️ Alergias de la mesa: qué alérgenos hay que evitar */}
        {verAlergias && (
          <AlergiasSheet alergenos={alergenos} ids={filtroAlergias} onCambiar={setAlergiasMesa} onClose={() => setVerAlergias(false)} />
        )}

        {/* Picker de mixer (item combinable) */}
        {mixerPick && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={() => setMixerPick(null)}>
            <div className="w-full sm:max-w-md bg-[var(--sala-hdr)] border-t sm:border border-[var(--sala-brd2)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider mb-1">🥃 Combinado</p>
              <h3 className="text-[var(--sala-txt)] font-black text-xl uppercase mb-3">{mixerPick.nombre}</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                <button
                  onClick={() => { addCombinado.mutate({ item: mixerPick, mixer: null }); setMixerPick(null) }}
                  className="w-full flex items-center justify-between rounded-xl px-4 py-4 bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)] active:scale-[0.98] transition-all">
                  <span className="text-[var(--sala-txt)] text-base font-bold uppercase">Solo · sin mezclar</span>
                  <span className="text-[var(--sala-tx2)] text-sm font-bold tabular-nums">{mixerPick.precio.toFixed(2)} €</span>
                </button>
                {menu.filter(m => m.esMixer && m.activo).map(mx => {
                  const precioTotal = (mixerPick.precioCombinado ?? mixerPick.precio) + (mx.suplementoMixer || 0)
                  if (agotadoIds.has(mx.id)) return <PlatoAgotado key={mx.id} nombre={`+ ${mx.nombre}`} />
                  return (
                    <button key={mx.id}
                      onClick={() => { addCombinado.mutate({ item: mixerPick, mixer: mx }); setMixerPick(null) }}
                      className="w-full flex items-center justify-between rounded-xl px-4 py-4 bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)] active:scale-[0.98] transition-all">
                      <span className="text-[var(--sala-txt)] text-base font-bold uppercase">+ {mx.nombre}</span>
                      <span className="text-[#4CC8A0] text-sm font-bold tabular-nums">
                        {precioTotal.toFixed(2)} €{mx.suplementoMixer ? <span className="text-amber-400 text-xs font-semibold"> ★</span> : null}
                      </span>
                    </button>
                  )
                })}
                {menu.filter(m => m.esMixer && m.activo).length === 0 && (
                  <p className="text-center text-[var(--sala-tx4)] text-sm py-6">
                    No hay mixers cargados todavía.<br />Marcá los refrescos con "MIX" en el admin del menú.
                  </p>
                )}
              </div>
              <button onClick={() => setMixerPick(null)}
                className="mt-3 w-full py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={`relative px-3 py-2 border-t border-[var(--sala-brd)] flex items-end gap-2 ${ancho ? 'col-start-2 row-start-3 border-l' : ''}`}>
          {/* Izquierda: volver un nivel en la carta (también con deslizar y el "← nombre" de arriba) y la lupa.
              Con el botón de comandar flotan sin ocupar sitio: la viñeta queda siempre en el centro */}
          {!ancho && (
          <div className={pieOido ? 'absolute left-3 top-1/2 -translate-y-1/2 z-10 flex gap-2' : 'shrink-0 flex gap-2'}>
          {puedeVolver && (
            <button
              onClick={() => selectedSub ? setSelectedSub(null) : selectedCat ? setSelectedCat(null) : setGrupoTab(null)}
              aria-label="Volver"
              className={`shrink-0 w-14 h-14 rounded-xl grid place-items-center text-white active:scale-90 transition-transform`}
              style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)', boxShadow: '0 4px 14px rgba(76,200,160,0.4)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          )}
            <button
              onClick={() => { if (tab !== 'menu') setTab('menu'); setTimeout(() => searchInputRef.current?.focus(), 60) }}
              aria-label="Buscar en la carta"
              className="shrink-0 w-14 h-14 rounded-xl grid place-items-center bg-[var(--sala-srf)] border-2 border-[#4CC8A0] text-[#4CC8A0] active:scale-90 transition-transform">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </div>
          )}
          <div className="flex-1 min-w-0">
          {yaFacturada ? (
            <div className="space-y-1.5">
              <div className={`flex items-center justify-center gap-2 py-1.5 rounded-lg ${comanda.cuentaDesactualizada ? 'bg-red-500/15' : 'bg-amber-500/10'}`}>
                <span className={`text-xs font-bold ${comanda.cuentaDesactualizada ? 'text-red-400' : 'text-amber-400'}`}>
                  {comanda.cuentaDesactualizada ? '⚠️ La cuenta cambió después de imprimirse' : '🧾 Cuenta impresa — pendiente de cobro'}
                </span>
              </div>
              <button onClick={e => { e.stopPropagation(); onLiberar() }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold text-base active:scale-95 transition-all flex items-center justify-between">
                <span>Mesa libre 🔓</span>
                <span className="tabular-nums">{total.toFixed(2)} €</span>
              </button>
              {comanda.cuentaDesactualizada ? (
                <button
                  onClick={e => { e.stopPropagation(); setVerCuenta(true) }}
                  className="w-full py-2.5 rounded-xl bg-amber-500/20 border-2 border-amber-500 text-amber-400 text-sm font-black active:scale-95 transition-transform">
                  🧾 Reimprimir cuenta ({total.toFixed(2)} €)
                </button>
              ) : esEncargado && !enLocal && (
                <button
                  onClick={e => { e.stopPropagation(); setShowCobro(true) }}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-sm font-black active:scale-95 transition-transform hover:bg-amber-400">
                  💶 Cobrar mesa
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); setVerCuenta(true) }}
                className="w-full py-1.5 rounded-xl bg-[var(--sala-srf)] border border-[var(--sala-brd2)] text-[var(--sala-tx2)] font-medium text-xs">
                Ver cuenta de nuevo
              </button>
            </div>
          ) : !hayPendientes && (yaEnviada || comanda.items.some(i => i.nivel != null)) ? (
            <div className="space-y-1.5">
              <button onClick={e => { e.stopPropagation(); setVerCuenta(true) }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#f59e0b] text-[var(--sala-txt)] font-bold text-base active:scale-95 transition-all flex items-center justify-between">
                <span>Ver cuenta 🧾</span>
                <span className="tabular-nums">{total.toFixed(2)} €</span>
              </button>
              {yaEnviada && (
                <button onClick={() => setOrdenando(true)} className="w-full py-1 text-[var(--sala-tx3)] text-[11px] underline">
                  re-enviar comanda
                </button>
              )}
            </div>
          ) : (
            <button onClick={hayPendientes ? handleOido : undefined}
              disabled={comanda.items.length === 0}
              className={`w-full rounded-xl grid grid-cols-3 items-center py-0.5 px-4 transition-all active:scale-95 ${hayPendientes ? '' : 'opacity-25 cursor-default'}`}>
              {/* Izquierda libre: ahí va el botón de volver de la carta */}
              <span />
              {/* Viñeta — centro (target del tap) */}
              <svg viewBox="0 0 68 72" className="w-14 h-14 justify-self-center" style={{ filter: hayPendientes ? 'drop-shadow(0 0 8px rgba(76,200,160,0.55))' : 'none' }}>
                <defs>
                  <linearGradient id="oido-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={hayPendientes ? '#4B9EDF' : '#374151'} />
                    <stop offset="100%" stopColor={hayPendientes ? '#4CC8A0' : '#374151'} />
                  </linearGradient>
                </defs>
                {/* Exacta misma viñeta que /oidoops.svg */}
                <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#oido-grad)" />
                {/* Tres puntos — feedback visual al agregar item */}
                {dotsAnim && !oidoAnim && (<>
                  <circle cx="22" cy="32" r="4.5" fill="white" style={{ animation: 'dot-pulse 0.9s ease-in-out infinite', animationDelay: '0s' }} />
                  <circle cx="34" cy="32" r="4.5" fill="white" style={{ animation: 'dot-pulse 0.9s ease-in-out infinite', animationDelay: '0.18s' }} />
                  <circle cx="46" cy="32" r="4.5" fill="white" style={{ animation: 'dot-pulse 0.9s ease-in-out infinite', animationDelay: '0.36s' }} />
                </>)}
                {/* Check — siempre a la vista (el camarero ve bien dónde comandar); solo deja sitio
                    a los tres puntos un momento al añadir un plato. Mismas coordenadas que el logo */}
                {!(dotsAnim && !oidoAnim) && (
                  <path d="M15 34 L29 48 L55 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                )}
              </svg>
              {/* Euros — derecha */}
              <span className="justify-self-end text-[var(--sala-txt)] text-lg font-bold tabular-nums">{total.toFixed(2)} €</span>
            </button>
          )}
          </div>
        </div>


        {/* Avisos de "añadido" (no reciben toques: se puede seguir pidiendo por debajo) */}
        {avisosAnadido.length > 0 && (
          <div className={`absolute z-30 pointer-events-none flex flex-col items-end gap-1.5 ${ancho ? 'bottom-4 right-[calc(40%+1rem)]' : 'bottom-24 right-4'}`}>
            {avisosAnadido.map(a => (
              <span key={a.id} className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full text-white text-sm font-black uppercase shadow-lg max-w-[18rem]"
                style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)', animation: 'avisoAnadido 1.8s ease forwards' }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                <span className="truncate">{a.texto}</span>
              </span>
            ))}
          </div>
        )}

      </div>

      {(ordenando || ordenarFull) && (
        <OrdenarModal comanda={comanda} menu={menu} categorias={categorias}
          nivelesIniciales={ancho && !ordenarFull ? propuestosTpv : undefined}
          marchaPasa={ordenarFull ? false : esMarchaPasa}
          onClose={() => { setOrdenando(false); setOrdenarFull(false) }}
          onEnviar={niveles => { onEnviar(niveles); setOrdenando(false); setOrdenarFull(false) }} />
      )}
      {confirmarCerrar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6" onClick={() => setConfirmarCerrar(false)}>
          <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[var(--sala-txt)] font-bold text-base mb-1">
              {itemsNuevos.length === 1 ? 'Hay 1 item sin comandar' : `Hay ${itemsNuevos.length} items sin comandar`}
            </p>
            <p className="text-[var(--sala-tx2)] text-sm mb-5">
              ¿Los descartás o los comandás a cocina? (tocá afuera para seguir en la mesa)
            </p>
            <div className="flex gap-3">
              <button onClick={async () => {
                await Promise.all(itemsNuevos.map(i => api.comandas.deleteItem(comanda.id, i.id)))
                setConfirmarCerrar(false)
                onClose()
              }} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold active:scale-95 transition-transform">
                Descartar
              </button>
              <button onClick={() => {
                setConfirmarCerrar(false)
                if (itemsNuevosCocina.length > 0) {
                  setOrdenando(true) // asignar niveles → Oído
                } else {
                  const toSend = [
                    ...itemsNuevosBarra.map(i => ({ itemId: i.id, nivel: 1 })),
                    ...autoItemsPendientes.map(i => ({ itemId: i.id, nivel: 1 })),
                  ]
                  if (toSend.length > 0) onEnviar(toSend, false)
                }
              }} className="flex-1 py-3 rounded-xl text-white font-black active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                Comandar
              </button>
            </div>
          </div>
        </div>
      )}

      {mermaItem && (
        <MermaModal
          item={mermaItem}
          onClose={() => setMermaItem(null)}
          onConfirm={(motivo, descripcion, cantidad) => registrarMerma.mutate({ motivo, descripcion, cantidad: cantidad ?? mermaItem!.cantidad })}
          onInvitar={esEncargado ? (motivo?: string) => { invitarItem.mutate({ item: mermaItem, motivo }); setMermaItem(null) } : undefined}
        />
      )}

      {quienEsta && <QuienEstaSheet comanda={comanda} onClose={() => setQuienEsta(false)} />}
      {verCuenta && <VerCuentaModal comanda={comanda} onClose={() => setVerCuenta(false)} onFacturar={() => facturarComanda.mutate()} />}
    </div>
  )
}

// ── Modal mover / unir mesa ───────────────────────────────────────────────────
function MoverMesaModal({ comanda, planes, comandas, onMoverALibre, onMerge, onClose }: {
  comanda: Comanda
  planes: FloorPlan[]
  comandas: Comanda[]
  onMoverALibre: (mesaId: number) => void
  onMerge: (targetComandaId: number, itemIds?: number[]) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'select' | 'confirm-libre' | 'confirm-merge' | 'select-items'>('select')
  const [targetMesa, setTargetMesa] = useState<Mesa | null>(null)
  const [targetComanda, setTargetComanda] = useState<Comanda | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set(comanda.items.map(i => i.id)))

  const comandaByMesa = (mesaId: number) => comandas.find(c => c.mesaId === mesaId && c.id !== comanda.id)

  const handleMesaClick = (mesa: Mesa) => {
    if (mesa.id === comanda.mesaId) return
    const existing = comandaByMesa(mesa.id)
    if (!existing) {
      setTargetMesa(mesa)
      setStep('confirm-libre')
    } else {
      setTargetMesa(mesa)
      setTargetComanda(existing)
      setSelectedItemIds(new Set(comanda.items.map(i => i.id)))
      setStep('confirm-merge')
    }
  }

  const toggleItem = (id: number) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (step === 'confirm-libre' && targetMesa) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-end z-[60]" onClick={onClose}>
        <div className="bg-[var(--sala-hdr)] w-full rounded-t-3xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
          <h3 className="text-[var(--sala-txt)] font-bold text-base mb-1">Mover a mesa {targetMesa.numero}</h3>
          <p className="text-[var(--sala-tx2)] text-sm mb-5">
            Toda la comanda de la mesa <strong className="text-[var(--sala-txt)]">{comanda.mesa.numero}</strong> se trasladará a la mesa <strong className="text-[var(--sala-txt)]">{targetMesa.numero}</strong> (libre).
          </p>
          <div className="flex gap-3">
            <button onClick={() => setStep('select')} className="flex-1 py-3 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] font-medium">Cancelar</button>
            <button onClick={() => onMoverALibre(targetMesa.id)} className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold">Confirmar</button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm-merge' && targetMesa && targetComanda) {
    const targetFacturada = targetComanda.estado === 'facturada'
    const targetTotal = totalComanda(targetComanda.items)
    return (
      <div className="fixed inset-0 bg-black/80 flex items-end z-[60]" onClick={onClose}>
        <div className="bg-[var(--sala-hdr)] w-full rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
            <h3 className="text-[var(--sala-txt)] font-bold text-base">Unir con mesa {targetMesa.numero}</h3>
            <p className="text-[var(--sala-tx2)] text-xs mt-0.5">Mesa {comanda.mesa.numero} → Mesa {targetMesa.numero}</p>
          </div>

          {/* Aviso si ya está facturada */}
          {targetFacturada && (
            <div className="mx-5 mt-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <span className="text-amber-400 text-base shrink-0">⚠️</span>
              <p className="text-amber-300 text-sm">
                La mesa {targetMesa.numero} ya tiene la cuenta impresa y pendiente de cierre. Se creará una comanda nueva con los items movidos — la factura anterior queda en cola para el encargado.
              </p>
            </div>
          )}

          {/* Items que ya hay en la mesa destino */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wide mb-2">
              Ya en mesa {targetMesa.numero} ({targetComanda.items.length} items · {targetTotal.toFixed(2)} €)
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {targetComanda.items.map(item => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--sala-tx2)]">{item.cantidad > 1 ? <span className="text-cyan-600 font-bold">{item.cantidad}× </span> : null}{item.nombre}</span>
                  <span className="text-[var(--sala-tx4)]">{valorItem(item).toFixed(2)} €{item.invitacion ? " 🎁" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-2 pt-3 border-t border-[var(--sala-brd)] space-y-2">
            <button onClick={() => onMerge(targetComanda.id)}
              className="w-full py-3.5 rounded-xl bg-[var(--sala-srf)] border border-cyan-700/50 text-cyan-400 font-semibold text-sm text-left px-4">
              Mover todos los items de mesa {comanda.mesa.numero} → {targetMesa.numero}
            </button>
            <button onClick={() => setStep('select-items')}
              className="w-full py-3.5 rounded-xl bg-[var(--sala-srf)] border border-[var(--sala-brd2)] text-[var(--sala-tx1)] font-semibold text-sm text-left px-4">
              Elegir qué items mover…
            </button>
          </div>
          <button onClick={() => setStep('select')} className="w-full py-3 text-[var(--sala-tx4)] text-sm">Volver</button>
        </div>
      </div>
    )
  }

  if (step === 'select-items' && targetComanda) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-end z-[60]" onClick={onClose}>
        <div className="bg-[var(--sala-hdr)] w-full rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)] flex items-center justify-between">
            <div>
              <h3 className="text-[var(--sala-txt)] font-bold text-base">Selecciona items a mover</h3>
              <p className="text-[var(--sala-tx2)] text-xs mt-0.5">Mesa {comanda.mesa.numero} → Mesa {targetMesa!.numero}</p>
            </div>
            <button onClick={() => setStep('confirm-merge')} className="text-[var(--sala-tx3)] text-sm">Volver</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {comanda.items.map(item => (
              <button key={item.id} onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  selectedItemIds.has(item.id)
                    ? 'bg-cyan-900/30 border-cyan-700/50'
                    : 'bg-[var(--sala-srf)] border-transparent'
                }`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  selectedItemIds.has(item.id) ? 'bg-[#4CC8A0] border-[#4CC8A0]' : 'border-[var(--sala-brd2)]'
                }`}>
                  {selectedItemIds.has(item.id) && <span className="text-[var(--sala-txt)] text-xs font-black">✓</span>}
                </div>
                <span className="text-[var(--sala-txt)] text-sm flex-1 text-left">
                  {item.cantidad > 1 ? <span className="text-cyan-400 font-bold mr-1">{item.cantidad}×</span> : null}{item.nombre}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4 border-t border-[var(--sala-brd)]">
            <button
              onClick={() => onMerge(targetComanda.id, [...selectedItemIds])}
              disabled={selectedItemIds.size === 0}
              className="w-full py-4 rounded-2xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold text-base disabled:opacity-30 active:scale-95 transition-all">
              Mover {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // step === 'select' — mesa picker
  return (
    <div className="fixed inset-0 bg-black/80 flex items-end z-[60]" onClick={onClose}>
      <div className="bg-[var(--sala-hdr)] w-full rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <div>
            <h3 className="text-[var(--sala-txt)] font-bold text-base">↔ Cambiar mesa</h3>
            <p className="text-[var(--sala-tx2)] text-xs mt-0.5">Selecciona la mesa destino</p>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {planes.map(plan => {
            const mesas = plan.mesas.filter(m => m.tipo !== 'barra' && !isElemDeco(m.tipo)).sort((a, b) => a.numero - b.numero)
            if (!mesas.length) return null
            return (
              <div key={plan.id}>
                {planes.length > 1 && <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wide mb-2">{plan.nombre}</p>}
                <div className="grid grid-cols-4 gap-2">
                  {mesas.map(mesa => {
                    const esCurrent = mesa.id === comanda.mesaId
                    const existing = comandaByMesa(mesa.id)
                    const libre = !existing
                    return (
                      <button key={mesa.id} onClick={() => !esCurrent && handleMesaClick(mesa)}
                        disabled={esCurrent}
                        className={`rounded-xl py-3 flex flex-col items-center gap-0.5 transition-colors ${
                          esCurrent
                            ? 'bg-[var(--sala-btn2)] opacity-40 cursor-default'
                            : libre
                            ? 'bg-[#1a3828] border border-[#22c55e] active:scale-95'
                            : 'bg-[#0f2240] border border-[#4CC8A0] active:scale-95'
                        }`}>
                        <span className={`font-black text-lg ${esCurrent ? 'text-[var(--sala-tx3)]' : libre ? 'text-[#22c55e]' : 'text-[#4CC8A0]'}`}>
                          {mesa.numero}
                        </span>
                        <span className={`text-xs ${libre ? 'text-green-700' : 'text-cyan-700'}`}>
                          {libre ? 'libre' : `${existing!.items.length}i`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Panel perfil + propinas del camarero ──────────────────────────────────────
// ── Panel Checklists (apertura/cierre por sector) ──────────────────────────────
function ChecklistPanel({
  restaurantId,
  camareroNombre,
  onClose,
}: {
  restaurantId: number
  camareroNombre: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [activo, setActivo] = useState<{ sector: ChecklistSector; momento: 'apertura' | 'cierre' } | null>(null)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [guardado, setGuardado] = useState(false)

  const { data: sectores, isLoading } = useQuery({
    queryKey: ['checklist-sala', restaurantId],
    queryFn: () => api.checklists.contenido(restaurantId),
  })

  const registrar = useMutation({
    mutationFn: () => {
      const items = (activo!.sector.items ?? []).filter(i => i.momento === activo!.momento)
      return api.checklists.registrar({
        sectorId: activo!.sector.id,
        momento: activo!.momento,
        completadoPor: camareroNombre,
        itemsMarcados: items.map(it => ({ texto: it.texto, marcado: marcados.has(it.id) })),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-sala', restaurantId] })
      setGuardado(true)
      setTimeout(() => { setGuardado(false); setActivo(null); setMarcados(new Set()) }, 1200)
    },
  })

  const abrir = (sector: ChecklistSector, momento: 'apertura' | 'cierre') => {
    setActivo({ sector, momento })
    setMarcados(new Set())
  }
  const toggle = (id: number) =>
    setMarcados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Ejecución de hoy para un sector+momento (si existe)
  const ejecHoy = (sector: ChecklistSector, momento: 'apertura' | 'cierre') =>
    (sector.ejecuciones ?? []).find(e => e.momento === momento)

  const items = activo ? (activo.sector.items ?? []).filter(i => i.momento === activo.momento) : []

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div className="w-full bg-[var(--sala-hdr)] rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--sala-btna)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activo && (
              <button onClick={() => setActivo(null)} className="text-[var(--sala-tx3)] text-lg">←</button>
            )}
            <div>
              <h2 className="text-[var(--sala-txt)] font-bold text-lg">
                {activo ? `${activo.momento === 'apertura' ? '🔓 Apertura' : '🔒 Cierre'} · ${activo.sector.nombre}` : '✅ Checklists'}
              </h2>
              {!activo && <p className="text-[var(--sala-tx3)] text-xs mt-0.5">Apertura y cierre por sector</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
        </div>

        {/* Vista lista de sectores */}
        {!activo && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {isLoading && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Cargando…</p>}
            {!isLoading && (sectores?.length ?? 0) === 0 && (
              <p className="text-[var(--sala-tx4)] text-sm text-center py-6">No hay sectores configurados.</p>
            )}
            {sectores?.map((s: ChecklistSector) => (
              <div key={s.id} className="bg-[var(--sala-srf)] rounded-2xl p-4">
                <p className="text-[var(--sala-txt)] font-bold text-sm mb-3">📍 {s.nombre}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['apertura', 'cierre'] as const).map(m => {
                    const ej = ejecHoy(s, m)
                    const nItems = (s.items ?? []).filter(i => i.momento === m).length
                    return (
                      <button
                        key={m}
                        onClick={() => abrir(s, m)}
                        disabled={nItems === 0}
                        className={`rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-30 ${
                          ej ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-[var(--sala-btn2)] border border-[var(--sala-brd)]'
                        }`}
                      >
                        <p className="text-[var(--sala-txt)] text-sm font-semibold">
                          {m === 'apertura' ? '🔓 Apertura' : '🔒 Cierre'}
                        </p>
                        {ej ? (
                          <p className="text-emerald-500 text-[11px] mt-0.5">
                            ✓ {ej.completadoPor} · {new Date(ej.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        ) : (
                          <p className="text-[var(--sala-tx4)] text-[11px] mt-0.5">{nItems} ítems</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vista ítems marcables */}
        {activo && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {items.length === 0 && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Sin ítems.</p>}
              {items.map(it => {
                const on = marcados.has(it.id)
                return (
                  <button
                    key={it.id}
                    onClick={() => toggle(it.id)}
                    className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                      on ? 'bg-emerald-500/15 border border-emerald-500/40' : 'bg-[var(--sala-srf)] border border-[var(--sala-brd)]'
                    }`}
                  >
                    <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold ${
                      on ? 'bg-emerald-500 text-white' : 'bg-[var(--sala-btn2)] text-transparent'
                    }`}>✓</span>
                    <span className={`text-sm ${on ? 'text-[var(--sala-txt)]' : 'text-[var(--sala-tx1)]'}`}>{it.texto}</span>
                  </button>
                )
              })}
            </div>
            {/* Footer completar */}
            <div className="px-5 py-4 border-t border-[var(--sala-brd)]">
              <button
                onClick={() => registrar.mutate()}
                disabled={registrar.isPending || guardado}
                className="w-full bg-[#4CC8A0] text-white font-bold py-3 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {guardado ? '✓ Registrado' : `Completar (${marcados.size}/${items.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Tarjeta de artículo Wiki (con chips de idioma escuchables) ─────────────────
function WikiArticuloCard({ art }: { art: WikiArticulo }) {
  const idiomas = LANGS.filter(l => (art.guiones?.[l.code] ?? '').trim())
  const [activo, setActivo] = useState<Lang | null>(idiomas[0]?.code ?? null)
  const texto = activo ? (art.guiones[activo] ?? '') : ''

  const tocar = (l: Lang) => { setActivo(l); speak(art.guiones[l] ?? '', l) }

  return (
    <div className="bg-[var(--sala-srf)] rounded-2xl p-4">
      <h3 className="text-[var(--sala-txt)] font-bold text-sm mb-2">{art.titulo}</h3>
      {idiomas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {idiomas.map(l => (
            <button
              key={l.code}
              onClick={() => tocar(l.code)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full active:scale-95 transition-transform ${
                activo === l.code ? 'bg-[#4CC8A0] text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'
              }`}
            >
              {l.flag} 🔊
            </button>
          ))}
        </div>
      )}
      {texto && (
        <p className="text-[var(--sala-tx1)] text-sm leading-relaxed whitespace-pre-wrap">{texto}</p>
      )}
      {art.notas && (
        <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <p className="text-amber-500 text-xs leading-relaxed whitespace-pre-wrap">📝 {art.notas}</p>
        </div>
      )}
    </div>
  )
}

// ── Fichas de la carta (Wiki → sección de estudio, ej. Carta de vinos) ─────────
// No son artículos de la Wiki: se arman solas con los items del menú que tienen
// `ficha` cargada, agrupados por categoría. Cambia la carta → cambia la Wiki.
type SeccionFichas = {
  nombre: string
  icono: string
  total: number
  grupos: { nombre: string; label: string; items: MenuItem[] }[]
}

const fmtPrecioFicha = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

function armarSeccionesFichas(menu: MenuItem[], cats: MenuCategoria[]): SeccionFichas[] {
  const porNombre = new Map(cats.map(c => [c.nombre, c]))
  const porId = new Map(cats.map(c => [c.id, c]))
  const secciones = new Map<string, SeccionFichas & { orden: number }>()

  const conFicha = menu
    .filter(m => m.activo && m.ficha?.trim())
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))

  for (const m of conFicha) {
    // Sección = la categoría padre si el item cuelga de una subcategoría (VINOS BOTELLA →
    // pestañas TINTO/BLANCO…); si no, la sección del menú (Comida → pestañas CLASICAS/PESCADO…)
    const cat = porNombre.get(m.categoria)
    const padre = cat?.parentId ? porId.get(cat.parentId) ?? null : null
    const topNombre = padre?.nombre ?? (cat?.grupo || m.categoria)
    if (!secciones.has(topNombre)) {
      secciones.set(topNombre, { nombre: topNombre, icono: padre ? (padre.icono || '📋') : '🍽️', total: 0, grupos: [], orden: padre ? padre.orden : -1 })
    }
    const sec = secciones.get(topNombre)!
    let grupo = sec.grupos.find(g => g.nombre === m.categoria)
    if (!grupo) {
      // Pestaña corta: se le quitan las palabras que repite del padre ("TINTO BOTELLA" → "TINTO")
      const delPadre = new Set(topNombre.split(/\s+/))
      const corto = m.categoria.split(/\s+/).filter(w => !delPadre.has(w)).join(' ')
      grupo = { nombre: m.categoria, label: corto || m.categoria, items: [] }
      sec.grupos.push(grupo)
    }
    grupo.items.push(m)
    sec.total++
  }

  for (const sec of secciones.values()) {
    sec.grupos.sort((a, b) => (porNombre.get(a.nombre)?.orden ?? 99) - (porNombre.get(b.nombre)?.orden ?? 99))
  }
  return [...secciones.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
}

function FichasSeccion({ seccion, alergenos, itemId, onItem }: {
  seccion: SeccionFichas
  alergenos: Alergeno[]
  itemId: number | null
  onItem: (id: number | null) => void
}) {
  const [tab, setTab] = useState(seccion.grupos[0]?.nombre ?? '')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<number[]>([])   // "cliente alérgico a…"
  const [showFiltro, setShowFiltro] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const todos = seccion.grupos.flatMap(g => g.items)
  // El filtro solo se ofrece si la sección tiene alérgenos cargados: sin datos, un plato
  // "sin marcar" se leería como apto (ej. vinos y sulfitos) y eso sería peligroso.
  const hayAlergenos = alergenos.length > 0 && todos.some(m => (m.alergenoIds ?? []).length > 0)
  const delItem = (m: MenuItem) => alergenos.filter(a => (m.alergenoIds ?? []).includes(a.id))
  const choca = (m: MenuItem) => filtro.some(id => (m.alergenoIds ?? []).includes(id))

  // Con texto en el buscador se busca en toda la sección (nombre, D.O., uvas, notas).
  // Con filtro de alergias también se mira toda la sección: primero lo que puede comer.
  const nq = normTxt(q.trim())
  const base = nq
    ? todos.filter(m => normTxt(`${m.nombre} ${m.descripcion} ${m.ficha}`).includes(nq))
    : filtro.length > 0 ? todos : (seccion.grupos.find(g => g.nombre === tab)?.items ?? [])
  const aptos = filtro.length > 0 ? base.filter(m => !choca(m)) : base
  const noAptos = filtro.length > 0 ? base.filter(choca) : []
  const visibles = [...aptos, ...noAptos]

  const idx = itemId === null ? -1 : visibles.findIndex(m => m.id === itemId)
  const item = idx >= 0 ? visibles[idx] : null

  const ir = (d: number) => {
    const destino = visibles[idx + d]
    if (!destino) return
    window.speechSynthesis?.cancel()
    onItem(destino.id)
  }

  // ── Detalle: una ficha a pantalla completa, se pasa a la siguiente como un mazo
  if (item) {
    const [cabecera, ...resto] = item.ficha.split('\n').map(l => l.trim()).filter(Boolean)
    return (
      <div
        className="flex-1 min-h-0 flex flex-col"
        onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          if (!touch.current) return
          const dx = e.changedTouches[0].clientX - touch.current.x
          const dy = e.changedTouches[0].clientY - touch.current.y
          touch.current = null
          if (Math.abs(dx) > swipeThresholds().dx && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1)
        }}
      >
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[var(--sala-txt)] font-black text-2xl leading-tight">{item.nombre}</h3>
              {item.descripcion && <p className="text-[#4CC8A0] font-semibold text-sm mt-1">{item.descripcion}</p>}
            </div>
            <p className="text-[var(--sala-txt)] font-black text-xl shrink-0">{fmtPrecioFicha(item.precio)}</p>
          </div>

          <div className="mt-4 bg-[var(--sala-srf)] rounded-2xl p-4 space-y-3">
            <p className="text-[var(--sala-txt)] font-semibold text-base leading-relaxed">{cabecera}</p>
            {resto.map((linea, i) => (
              <p key={i} className="text-[var(--sala-tx1)] text-base leading-relaxed">{linea}</p>
            ))}
          </div>

          {hayAlergenos && (
            <div className="mt-4">
              <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase tracking-wider mb-2">Alérgenos</p>
              {delItem(item).length === 0 ? (
                <p className="text-[var(--sala-tx2)] text-sm">Sin alérgenos declarados</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {delItem(item).map(a => (
                    <span
                      key={a.id}
                      className={`text-sm font-semibold px-3 py-1.5 rounded-full ${
                        filtro.includes(a.id) ? 'bg-red-500 text-white' : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                      }`}
                    >
                      {a.icono} {a.nombre}
                    </span>
                  ))}
                </div>
              )}
              {item.alergenosNota && (
                <p className="text-[var(--sala-tx2)] text-sm italic mt-2 leading-relaxed">{item.alergenosNota}</p>
              )}
            </div>
          )}

          <button
            onClick={() => speak(`${item.nombre.toLowerCase()}. ${item.ficha}`, 'en')}
            className="mt-4 w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-semibold text-sm py-3 rounded-2xl active:scale-[0.98] transition-transform"
          >
            🔊 Escuchar en inglés
          </button>
        </div>

        <div className="px-5 py-3 border-t border-[var(--sala-brd)] flex items-center justify-between">
          <button
            onClick={() => ir(-1)}
            disabled={idx === 0}
            className="w-16 h-12 rounded-2xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-2xl font-bold disabled:opacity-30 active:scale-95 transition-transform"
          >‹</button>
          <span className="text-[var(--sala-tx3)] text-sm font-semibold tabular-nums">{idx + 1} / {visibles.length}</span>
          <button
            onClick={() => ir(1)}
            disabled={idx === visibles.length - 1}
            className="w-16 h-12 rounded-2xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-2xl font-bold disabled:opacity-30 active:scale-95 transition-transform"
          >›</button>
        </div>
      </div>
    )
  }

  // ── Lista: pestañas + buscador + tarjetas que ya enseñan lo esencial
  const tarjeta = (m: MenuItem, noApto: boolean) => (
    <button
      key={m.id}
      onClick={() => onItem(m.id)}
      className={`w-full bg-[var(--sala-srf)] hover:bg-[var(--sala-btn2)] rounded-2xl px-4 py-3 text-left transition-colors active:scale-[0.99] ${noApto ? 'opacity-60' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[var(--sala-txt)] font-bold text-base min-w-0 truncate">{m.nombre}</p>
        <p className="text-[var(--sala-txt)] font-bold text-sm shrink-0 tabular-nums">{fmtPrecioFicha(m.precio)}</p>
      </div>
      {m.descripcion && <p className="text-[#4CC8A0] text-xs font-semibold mt-0.5">{m.descripcion}</p>}
      <p className="text-[var(--sala-tx2)] text-xs mt-1 truncate">{m.ficha.split('\n')[0]}</p>
      {noApto ? (
        <p className="text-red-400 text-xs font-bold mt-1.5">
          🚫 {delItem(m).filter(a => filtro.includes(a.id)).map(a => `${a.icono} ${a.nombre}`).join(' · ')}
        </p>
      ) : delItem(m).length > 0 && (
        <p className="text-sm mt-1.5 tracking-wider">{delItem(m).map(a => a.icono).join(' ')}</p>
      )}
    </button>
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-3 pb-2 space-y-2">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, ingrediente…"
            className="flex-1 min-w-0 bg-[var(--sala-srf)] text-[var(--sala-txt)] placeholder:text-[var(--sala-tx4)] text-sm rounded-xl px-4 py-2.5 outline-none border border-[var(--sala-brd)] focus:border-[#4CC8A0]"
          />
          {hayAlergenos && (
            <button
              onClick={() => setShowFiltro(v => !v)}
              className={`shrink-0 text-sm font-bold px-3 rounded-xl border transition-colors ${
                filtro.length > 0
                  ? 'bg-red-500 border-red-500 text-white'
                  : showFiltro
                    ? 'border-[#4CC8A0] text-[#4CC8A0]'
                    : 'border-[var(--sala-brd)] text-[var(--sala-tx2)] bg-[var(--sala-srf)]'
              }`}
            >
              ⚠️ Alergias{filtro.length > 0 ? ` (${filtro.length})` : ''}
            </button>
          )}
        </div>

        {showFiltro && hayAlergenos && (
          <div className="bg-[var(--sala-srf)] rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[var(--sala-txt)] text-sm font-bold">El cliente es alérgico a…</p>
              {filtro.length > 0 && (
                <button onClick={() => setFiltro([])} className="text-[var(--sala-tx3)] text-xs underline">Limpiar</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {alergenos.map(a => {
                const on = filtro.includes(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => setFiltro(f => (on ? f.filter(i => i !== a.id) : [...f, a.id]))}
                    className={`text-sm font-semibold px-3 py-2 rounded-full transition-colors active:scale-95 ${
                      on ? 'bg-red-500 text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx1)]'
                    }`}
                  >
                    {a.icono} {a.nombre}
                  </button>
                )
              })}
            </div>
            <p className="text-[var(--sala-tx3)] text-[11px] leading-snug">
              Cocina y equipos compartidos: no se puede garantizar la ausencia total de trazas (tampoco de gluten).
              Ante una alergia grave, avisa siempre a cocina.
            </p>
          </div>
        )}

        {!nq && filtro.length === 0 && seccion.grupos.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {seccion.grupos.map(g => (
              <button
                key={g.nombre}
                onClick={() => setTab(g.nombre)}
                className={`shrink-0 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-full transition-colors ${
                  tab === g.nombre ? 'bg-[#4CC8A0] text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'
                }`}
              >
                {g.label} <span className="opacity-70">{g.items.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2">
        {visibles.length === 0 && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Sin resultados.</p>}
        {filtro.length > 0 && aptos.length > 0 && (
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider pt-1">✅ Puede comer ({aptos.length})</p>
        )}
        {aptos.map(m => tarjeta(m, false))}
        {noAptos.length > 0 && (
          <p className="text-red-400 text-xs font-bold uppercase tracking-wider pt-3">🚫 No puede ({noAptos.length})</p>
        )}
        {noAptos.map(m => tarjeta(m, true))}
      </div>
    </div>
  )
}

// ── Panel Wiki (consulta camarero) ─────────────────────────────────────────────
function WikiPanel({ restaurantId, onClose }: { restaurantId: number; onClose: () => void }) {
  const [showVoz, setShowVoz] = useState(false)
  const [activo, setActivo] = useState<WikiArticulo | null>(null)
  const { data: categorias, isLoading } = useQuery({
    queryKey: ['wiki-sala', restaurantId],
    queryFn: () => api.wiki.contenido(restaurantId),
  })

  // Solo categorías con artículos activos
  const conContenido = (categorias ?? []).filter((c: WikiCategoria) => (c.articulos?.length ?? 0) > 0)

  // Secciones de estudio de la carta: mismas queries (y caché) que el picker de sala
  const { data: menu = [] } = useQuery({ queryKey: ['menu', restaurantId], queryFn: () => api.menu.list(restaurantId) })
  const { data: menuCats = [] } = useQuery({ queryKey: ['menu-cats', restaurantId], queryFn: () => api.menuCategorias.list(restaurantId) })
  const { data: alergenos = [] } = useQuery({ queryKey: ['alergenos'], queryFn: api.alergenos.list })
  const secciones = armarSeccionesFichas(menu, menuCats)
  const [seccionNombre, setSeccionNombre] = useState<string | null>(null)
  const [fichaId, setFichaId] = useState<number | null>(null)
  const seccion = secciones.find(s => s.nombre === seccionNombre) ?? null
  const fichaAbierta = fichaId !== null

  const volver = () => {
    window.speechSynthesis?.cancel()
    if (fichaAbierta) setFichaId(null)
    else if (seccion) setSeccionNombre(null)
    else setActivo(null)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div className={`w-full bg-[var(--sala-hdr)] rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col ${seccion ? 'h-[85vh]' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--sala-btna)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {(activo || seccion) && (
              <button onClick={volver} className="text-[var(--sala-tx3)] text-2xl leading-none px-1 shrink-0">←</button>
            )}
            <div className="min-w-0">
              <h2 className="text-[var(--sala-txt)] font-bold text-lg truncate">
                {seccion ? `${seccion.icono} ${seccion.nombre}` : activo ? activo.titulo : '📖 Wiki'}
              </h2>
              {!activo && !seccion && <p className="text-[var(--sala-tx3)] text-xs mt-0.5">Speeches, protocolos y carta</p>}
              {seccion && !fichaAbierta && <p className="text-[var(--sala-tx3)] text-xs mt-0.5">{seccion.total} fichas · toca una para estudiarla</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowVoz(v => !v)}
              title="Ajustes de voz"
              className={`text-lg transition-colors ${showVoz ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx3)] hover:text-[#4CC8A0]'}`}
            >
              🎚️
            </button>
            <button onClick={() => { window.speechSynthesis?.cancel(); onClose() }} className="text-[var(--sala-tx3)] text-xl">✕</button>
          </div>
        </div>

        {/* Ajustes de voz (desplegable) */}
        {showVoz && (
          <div className="px-5 py-3 border-b border-[var(--sala-brd)] bg-[var(--sala-srf)]">
            <VozSelector dark />
          </div>
        )}

        {/* Vista detalle: speech del artículo */}
        {activo && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <WikiArticuloCard art={activo} />
          </div>
        )}

        {/* Sección de estudio de la carta (fichas del menú) */}
        {seccion && (
          <FichasSeccion key={seccion.nombre} seccion={seccion} alergenos={alergenos} itemId={fichaId} onItem={setFichaId} />
        )}

        {/* Vista lista: artículos clicables agrupados por categoría */}
        {!activo && !seccion && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {secciones.length > 0 && (
              <div className="space-y-2">
                {secciones.map(sec => (
                  <button
                    key={sec.nombre}
                    onClick={() => setSeccionNombre(sec.nombre)}
                    className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left text-white bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] active:scale-[0.99] transition-transform"
                  >
                    <span className="text-3xl shrink-0">{sec.icono}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-base uppercase tracking-wide truncate">{sec.nombre}</p>
                      <p className="text-white/85 text-xs mt-0.5">{sec.total} fichas para estudiar</p>
                    </div>
                    <span className="text-2xl shrink-0">›</span>
                  </button>
                ))}
              </div>
            )}
            {isLoading && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Cargando…</p>}
            {!isLoading && conContenido.length === 0 && secciones.length === 0 && (
              <p className="text-[var(--sala-tx4)] text-sm text-center py-6">No hay contenido todavía.</p>
            )}
            {conContenido.map((cat: WikiCategoria) => (
              <div key={cat.id}>
                <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase tracking-wider mb-2">
                  {cat.icono || '📄'} {cat.nombre}
                </p>
                <div className="space-y-2">
                  {(cat.articulos ?? []).map(art => {
                    const idiomas = LANGS.filter(l => (art.guiones?.[l.code] ?? '').trim())
                    return (
                      <button
                        key={art.id}
                        onClick={() => setActivo(art)}
                        className="w-full flex items-center gap-3 bg-[var(--sala-srf)] hover:bg-[var(--sala-btn2)] rounded-2xl px-4 py-3 text-left transition-colors active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[var(--sala-txt)] font-semibold text-sm truncate">{art.titulo}</p>
                          {idiomas.length > 0 && (
                            <p className="text-[var(--sala-tx3)] text-xs mt-0.5">{idiomas.map(l => l.flag).join(' ')}</p>
                          )}
                        </div>
                        <span className="text-[var(--sala-tx3)] text-lg shrink-0">›</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PerfilPanel({ camarero, restaurantNombre, isDark, onToggleTheme, onClose, onOpenWiki, onOpenChecklist, onOpenProduccion }: {
  camarero: { id: number; nombre: string }
  restaurantNombre: string
  isDark: boolean
  onToggleTheme: () => void
  onClose: () => void
  onOpenWiki: () => void
  onOpenChecklist: () => void
  onOpenProduccion: () => void
}) {
  const ahora  = new Date()
  const desde  = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`

  const enLocal = useSalaEnModoLocal()
  const { data: turnos, isLoading } = useQuery({
    queryKey: ['mis-turnos', camarero.id],
    queryFn: () => api.propinas.misTurnos(camarero.id, desde),
    enabled: !enLocal,
  })

  const totalMes    = turnos?.reduce((s, t) => s + t.propina, 0) ?? 0
  const totalHoras  = turnos?.reduce((s, t) => s + t.horas,  0) ?? 0

  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  // Gesto oculto para probar y enseñar el modo local: mantener apretado el nombre del restaurante
  // ~1 s hace que este dispositivo se comporte como si no hubiera internet (y otra vez lo quita).
  const pulsacion = useRef<ReturnType<typeof setTimeout> | null>(null)
  const soltar = () => { if (pulsacion.current) clearTimeout(pulsacion.current); pulsacion.current = null }
  const apretar = () => {
    soltar()
    pulsacion.current = setTimeout(() => {
      alternarCorteSimulado()
      navigator.vibrate?.(60)
      onClose()
    }, 1000)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div className="w-full bg-[var(--sala-hdr)] rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--sala-btna)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <div>
            <p className="text-[#4CC8A0] text-xs font-semibold select-none" style={{ WebkitTouchCallout: 'none' }}
              onPointerDown={apretar} onPointerUp={soltar} onPointerLeave={soltar} onPointerCancel={soltar}
              onContextMenu={e => e.preventDefault()}>{restaurantNombre}</p>
            <h2 className="text-[var(--sala-txt)] font-bold text-lg">{camarero.nombre}</h2>
            <p className="text-[var(--sala-tx3)] text-xs mt-0.5">Propinas este mes</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Toggle claro/oscuro */}
            <button onClick={onToggleTheme} title={isDark ? 'Modo claro' : 'Modo oscuro'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: isDark ? '#1e2d45' : '#e2e8f0',
                border: `1.5px solid ${isDark ? '#374151' : '#cbd5e1'}`,
                borderRadius: 20, padding: '4px 8px', cursor: 'pointer',
                transition: 'all 0.25s',
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ opacity: isDark ? 1 : 0.35, transition: 'opacity 0.25s' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={isDark ? '#818cf8' : '#94a3b8'} />
              </svg>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: isDark ? '#818cf8' : '#f59e0b',
                boxShadow: isDark ? '0 0 8px #818cf866' : '0 0 8px #f59e0b99',
                transition: 'all 0.25s',
              }} />
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ opacity: isDark ? 0.35 : 1, transition: 'opacity 0.25s' }}>
                <circle cx="12" cy="12" r="4" fill={isDark ? '#94a3b8' : '#f59e0b'} />
                {[0,45,90,135,180,225,270,315].map(a => (
                  <line key={a}
                    x1={12 + 7 * Math.cos(a * Math.PI / 180)}
                    y1={12 + 7 * Math.sin(a * Math.PI / 180)}
                    x2={12 + 9.5 * Math.cos(a * Math.PI / 180)}
                    y2={12 + 9.5 * Math.sin(a * Math.PI / 180)}
                    stroke={isDark ? '#94a3b8' : '#f59e0b'} strokeWidth="2" strokeLinecap="round" />
                ))}
              </svg>
            </button>
            <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
          </div>
        </div>

        {enLocal ? (
          <p className="mx-5 my-4 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-500">
            Sin internet: propinas, producción, checklists y wiki vuelven cuando vuelva la conexión.
          </p>
        ) : (<>
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <div className="bg-[var(--sala-srf)] rounded-2xl p-4">
            <p className="text-[var(--sala-tx2)] text-xs mb-1">Total propinas</p>
            <p className="text-[#4CC8A0] text-2xl font-black">{fmt(totalMes)} €</p>
          </div>
          <div className="bg-[var(--sala-srf)] rounded-2xl p-4">
            <p className="text-[var(--sala-tx2)] text-xs mb-1">Horas trabajadas</p>
            <p className="text-[var(--sala-txt)] text-2xl font-black">{totalHoras}h</p>
          </div>
        </div>

        {/* Accesos: Checklists + Wiki + Producción */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-2">
          <button
            onClick={onOpenProduccion}
            className="group col-span-2 flex items-center gap-3 bg-[var(--sala-srf)] hover:bg-[var(--sala-btn2)] rounded-2xl px-4 py-3 transition-colors"
          >
            <span className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-purple-400/15 text-purple-400 transition-transform group-active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3h6" />
                <path d="M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" />
                <path d="M7.5 14h9" />
              </svg>
            </span>
            <div className="text-left">
              <p className="text-[var(--sala-txt)] text-sm font-semibold">Producción</p>
              <p className="text-[var(--sala-tx3)] text-[11px]">Registrar premixes de sala</p>
            </div>
          </button>
          <button
            onClick={onOpenChecklist}
            className="group flex items-center gap-3 bg-[var(--sala-srf)] hover:bg-[var(--sala-btn2)] rounded-2xl px-4 py-3 transition-colors"
          >
            <span className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-[#4CC8A0]/15 text-[#4CC8A0] transition-transform group-active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="3" width="16" height="18" rx="2.5" />
                <path d="M8 3.5h8v2.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" />
                <path d="m8.5 12.5 1.8 1.8 3.5-3.6" />
                <path d="M8.5 17.5h5" />
              </svg>
            </span>
            <div className="text-left">
              <p className="text-[var(--sala-txt)] text-sm font-semibold">Checklists</p>
              <p className="text-[var(--sala-tx3)] text-[11px]">Apertura y cierre</p>
            </div>
          </button>
          <button
            onClick={onOpenWiki}
            className="group flex items-center gap-3 bg-[var(--sala-srf)] hover:bg-[var(--sala-btn2)] rounded-2xl px-4 py-3 transition-colors"
          >
            <span className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-[#4C9EE0]/15 text-[#4C9EE0] transition-transform group-active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6.5C10.6 5.4 8.7 5 6.5 5H4v13h2.5c2.2 0 4.1.4 5.5 1.5" />
                <path d="M12 6.5C13.4 5.4 15.3 5 17.5 5H20v13h-2.5c-2.2 0-4.1.4-5.5 1.5" />
                <path d="M12 6.5v13" />
              </svg>
            </span>
            <div className="text-left">
              <p className="text-[var(--sala-txt)] text-sm font-semibold">Wiki</p>
              <p className="text-[var(--sala-tx3)] text-[11px]">Speeches y protocolos</p>
            </div>
          </button>
        </div>
        </>)}

        {/* Lista de turnos */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {isLoading && !enLocal && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Cargando…</p>}
          {!isLoading && !enLocal && !turnos?.length && (
            <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Sin propinas registradas este mes</p>
          )}
          {turnos?.map((t: MiTurno) => (
            <div key={t.id} className="flex items-center justify-between py-3 border-b border-[var(--sala-brd)]">
              <div>
                <p className="text-[var(--sala-txt)] text-sm font-medium">{fmtFecha(t.fecha)}</p>
                <p className="text-[var(--sala-tx3)] text-xs">{t.horas}h · {t.restaurante}</p>
              </div>
              <span className="text-[#4CC8A0] font-bold text-sm">{fmt(t.propina)} €</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Modal producción sala ─────────────────────────────────────────────────────
function ProduccionSalaModal({
  restaurantId,
  camareroNombre,
  onClose,
}: {
  restaurantId: number
  camareroNombre: string
  onClose: () => void
}) {
  const { data: categorias = [] } = useQuery({
    queryKey: ['inv-cats-sala', restaurantId],
    queryFn: () => api.inventario.getCategorias(restaurantId),
  })

  const productos = (categorias as InventarioCategoria[])
    .filter(c => c.personalProduccion === 'sala')
    .flatMap(c => c.productos)

  const [productoId, setProductoId] = useState<number>(productos[0]?.id ?? 0)
  const [cantidad, setCantidad]     = useState('')
  const [unidad, setUnidad]         = useState(productos[0]?.unidad ?? 'ud')
  const [notas, setNotas]           = useState('')
  const [saved, setSaved]           = useState(false)

  // sync productoId/unidad when productos loads
  useEffect(() => {
    if (productos.length > 0 && !productoId) {
      setProductoId(productos[0].id)
      setUnidad(productos[0].unidad)
    }
  }, [productos.length])

  const handleProductoChange = (id: number) => {
    setProductoId(id)
    const prod = productos.find(p => p.id === id)
    if (prod) setUnidad(prod.unidad)
  }

  const handleGuardar = async () => {
    if (!productoId || !cantidad) return
    await api.inventario.createProduccion({
      restaurantId,
      productoId,
      cantidad: parseFloat(cantidad),
      unidad,
      creadoPor: camareroNombre,
      notas: notas || undefined,
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      setCantidad('')
      setNotas('')
    }, 1500)
  }

  if (productos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-sm text-center space-y-3" onClick={e => e.stopPropagation()}>
          <p className="text-[var(--sala-txt)] font-bold text-lg">⚗️ Producción</p>
          <p className="text-[var(--sala-tx2)] text-sm">No hay productos de producción configurados para este restaurante.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-[var(--sala-brd)] text-[var(--sala-tx2)]">Cerrar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--sala-srf)] rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <p className="text-[var(--sala-txt)] font-bold text-base">⚗️ Registrar producción</p>
          <button onClick={onClose} className="text-[var(--sala-tx4)] hover:text-[var(--sala-tx2)] text-xl">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Producto */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--sala-tx2)]">Producto</label>
            <select
              value={productoId}
              onChange={e => handleProductoChange(Number(e.target.value))}
              className="w-full rounded-xl px-3 py-3 text-sm font-medium text-[var(--sala-txt)] bg-[var(--sala-bg)] border border-[var(--sala-brd)] focus:outline-none focus:border-[#4CC8A0]"
            >
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Cantidad + Unidad */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-semibold text-[var(--sala-tx2)]">Cantidad</label>
              <input
                type="number" min="0.1" step="0.5"
                value={cantidad} onChange={e => setCantidad(e.target.value)}
                placeholder="Ej: 5"
                className="w-full rounded-xl px-3 py-3 text-lg font-bold text-[var(--sala-txt)] bg-[var(--sala-bg)] border border-[var(--sala-brd)] focus:outline-none focus:border-[#4CC8A0]"
              />
            </div>
            <div className="w-28 space-y-1.5">
              <label className="text-xs font-semibold text-[var(--sala-tx2)]">Unidad</label>
              <select
                value={unidad} onChange={e => setUnidad(e.target.value)}
                className="w-full rounded-xl px-3 py-3 text-sm text-[var(--sala-txt)] bg-[var(--sala-bg)] border border-[var(--sala-brd)] focus:outline-none focus:border-[#4CC8A0]"
              >
                {['ud', 'botella', 'caja', 'l', 'kg'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--sala-tx2)]">Notas (opcional)</label>
            <input
              value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Ej: botella de 5L, lote especial…"
              className="w-full rounded-xl px-3 py-2.5 text-sm text-[var(--sala-txt)] bg-[var(--sala-bg)] border border-[var(--sala-brd)] focus:outline-none focus:border-[#4CC8A0]"
            />
          </div>

          <button
            onClick={handleGuardar}
            disabled={!productoId || !cantidad || saved}
            className={`w-full py-3.5 rounded-xl font-bold text-base transition-all ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-[#4CC8A0] text-gray-900 hover:bg-[#3ab890] disabled:opacity-40'
            }`}
          >
            {saved ? '✓ Registrado' : 'Registrar producción'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Menú grupo (camarero): armar comanda desde plantilla de menú degustación ──
function MenuGrupoSheet({
  restaurantId,
  mesa,
  pax,
  camareroNombre,
  menu,
  categorias = [],
  ancho = false,
  onClose,
  onDone,
}: {
  restaurantId: number
  mesa: Mesa
  pax: number
  camareroNombre?: string
  menu: MenuItem[]
  categorias?: MenuCategoria[]
  // Puesto TPV (tablet): pantalla completa, los cursos a la izquierda y la carta a la derecha
  ancho?: boolean
  onClose: () => void
  onDone: (comandaId: number) => void
}) {
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [incluyePostre, setPostre]  = useState(true)
  const [qtys, setQtys]             = useState<Record<string, number>>({}) // key `${nivel}|${nombre}`
  const [extras, setExtras]         = useState<Array<{ nombre: string; nivel: number }>>([])
  const [pickerNivel, setPickerNivel] = useState<number | null>(null)
  const [searchExtra, setSearchExtra] = useState('')

  const { data: templates = [] } = useQuery<GrupoMenuTemplate[]>({
    queryKey: ['grupo-menu', restaurantId],
    queryFn: () => api.grupoMenu.list(restaurantId),
  })
  const template = templates.find(t => t.id === templateId) ?? null

  const priceMap: Record<string, number> = {}
  for (const m of menu) priceMap[m.nombre] = m.precio
  const k = (nivel: number, nombre: string) => `${nivel}|${nombre}`

  // Cantidades sugeridas: tapeo compartido, ajustadas al presupuesto (precio del menú × pax):
  // ración base para todos + sube a la ración alta los platos más baratos mientras quepa.
  // Se recalcula al cambiar de menú y al poner o quitar el postre (el precio del menú es el
  // mismo: sin postre, su parte del presupuesto pasa a los demás platos)
  useEffect(() => {
    if (!template) return
    const platos = template.niveles
      .filter(nv => incluyePostre || !nv.esPostre)
      .flatMap(nv => (nv.platos ?? []).map(nombre => ({ nombre, nivel: nv.nivel })))
    const sugeridas = sugerirCantidadesMenu(platos, pax, template.paxPorRacion || 3, priceMap, template.precio)
    const init: Record<string, number> = {}
    for (const p of sugeridas) init[k(p.nivel, p.nombre)] = p.cantidad
    setQtys(init)
    setExtras([])
    setPickerNivel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, incluyePostre])
  const tienePostre = !!template?.niveles.some(nv => nv.esPostre)

  const nivelesFiltrados = [...(template?.niveles ?? [])]
    .filter(nv => incluyePostre || !nv.esPostre)
    .sort((a, b) => a.nivel - b.nivel)
  const platosDe = (nivel: number, platos: string[]) =>
    [...platos, ...extras.filter(e => e.nivel === nivel).map(e => e.nombre)]
  const todosPlatos = nivelesFiltrados.flatMap(nv =>
    platosDe(nv.nivel, nv.platos ?? []).map(nombre => ({ nombre, nivel: nv.nivel })))

  const budget = (template?.precio ?? 0) * pax
  const spent = todosPlatos.reduce((s, p) => s + (priceMap[p.nombre] ?? 0) * (qtys[k(p.nivel, p.nombre)] ?? 0), 0)
  const overBudget = spent > budget
  const setQty = (nivel: number, nombre: string, delta: number) =>
    setQtys(prev => ({ ...prev, [k(nivel, nombre)]: Math.max(0, (prev[k(nivel, nombre)] ?? 0) + delta) }))
  // Sumar un plato de la carta a un curso: si ya está en ese curso, una ración más
  const anadirACurso = (nivel: number, nombre: string) => {
    const nv = template?.niveles.find(n => n.nivel === nivel)
    if (!platosDe(nivel, nv?.platos ?? []).includes(nombre)) setExtras(prev => [...prev, { nombre, nivel }])
    setQty(nivel, nombre, +1)
  }

  const generar = useMutation({
    mutationFn: () => api.grupoMenu.generar(template!.id, {
      mesaId: mesa.id,
      pax,
      platosSeleccionados: todosPlatos
        .filter(p => (qtys[k(p.nivel, p.nombre)] ?? 0) > 0)
        .map(p => ({ nombre: p.nombre, nivel: p.nivel, cantidad: qtys[k(p.nivel, p.nombre)] ?? 0 })),
      camareroNombre,
    }),
    onSuccess: comanda => onDone(comanda.id),
  })

  if (ancho) return (
    <MenuGrupoTpv
      mesa={mesa} pax={pax} menu={menu} categorias={categorias} templates={templates} template={template}
      setTemplateId={setTemplateId} incluyePostre={incluyePostre} setPostre={setPostre} tienePostre={tienePostre}
      nivelesFiltrados={nivelesFiltrados} platosDe={platosDe} qtys={qtys} k={k} setQty={setQty}
      anadirACurso={anadirACurso} priceMap={priceMap} budget={budget} spent={spent} overBudget={overBudget}
      generar={() => generar.mutate()} generando={generar.isPending} errorGenerar={generar.isError}
      nadaElegido={todosPlatos.every(p => (qtys[k(p.nivel, p.nombre)] ?? 0) === 0)}
      onClose={onClose} />
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="relative w-full sm:max-w-md bg-[var(--sala-hdr)] h-full flex flex-col shadow-2xl border-l border-[var(--sala-brd)]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">🍽 Menú grupo · Mesa {mesa.numero}</p>
              <h2 className="text-[var(--sala-txt)] font-black text-xl">{pax} PAX{template ? ` · ${template.nombre}` : ''}</h2>
            </div>
            <button onClick={onClose} className="text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-xl">✕</button>
          </div>
          {template && (
            <>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => setTemplateId(null)} className="text-cyan-400 text-xs font-semibold">← cambiar menú</button>
                {tienePostre && (
                  <label className="flex items-center gap-1.5 text-xs text-[var(--sala-tx2)] ml-auto">
                    <input type="checkbox" checked={incluyePostre} onChange={e => setPostre(e.target.checked)} className="accent-[#4CC8A0]" />
                    incluir postre
                  </label>
                )}
              </div>
              {/* Presupuesto: precio del menú × pax vs coste en carta de lo seleccionado */}
              <div className="mt-2">
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className={overBudget ? 'text-red-400' : 'text-[var(--sala-tx3)]'}>
                    {overBudget ? '⚠️ Se pasa del menú' : 'Valor en carta'}: {spent.toFixed(2)} €
                  </span>
                  {/* Lo que se cobra: precio del menú × pax (el valor en carta solo sirve de tope) */}
                  <span className="text-[var(--sala-txt)] font-black">Se cobra: {pax} × {template.precio.toFixed(2)} € = {budget.toFixed(2)} €</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--sala-btn2)] overflow-hidden">
                  <div className={`h-full transition-all ${overBudget ? 'bg-red-500' : 'bg-[#4CC8A0]'}`}
                    style={{ width: `${Math.min(100, budget ? (spent / budget) * 100 : 0)}%` }} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Paso 1: elegir plantilla */}
          {!template && (
            <>
              {templates.length === 0 && (
                <p className="text-center text-[var(--sala-tx4)] text-sm py-10">Este restaurante no tiene menús de grupo configurados</p>
              )}
              {templates.map(t => (
                <button key={t.id} onClick={() => setTemplateId(t.id)}
                  className="w-full bg-[var(--sala-srf)] rounded-xl p-4 text-left active:scale-[0.98] transition-transform">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[var(--sala-txt)] font-black text-lg">{t.nombre}</p>
                      <p className="text-[var(--sala-tx3)] text-xs">
                        {t.precio.toFixed(2)} €/pax · 1 ración cada {t.paxPorRacion || 3} pax · {t.niveles.length} cursos
                      </p>
                    </div>
                    <span className="text-[#4CC8A0] font-black text-2xl tabular-nums">{(t.precio * pax).toFixed(2)} €</span>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Paso 2: revisión por cursos con cantidades ajustables */}
          {template && nivelesFiltrados.map(nv => (
            <div key={nv.nivel} className="bg-[var(--sala-srf)] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center text-white text-xs font-black shrink-0">{nv.nivel}</div>
                <span className="text-[var(--sala-tx2)] text-xs font-semibold uppercase tracking-wide">{nv.nombre || nombreNivel(nv.nivel)}</span>
                <div className="flex-1 h-px bg-[var(--sala-btn)]" />
                <button onClick={() => { setPickerNivel(pickerNivel === nv.nivel ? null : nv.nivel); setSearchExtra('') }}
                  className="text-cyan-400 text-xs font-bold">+ carta</button>
              </div>
              <div className="space-y-1.5">
                {platosDe(nv.nivel, nv.platos ?? []).map(nombre => {
                  const qty = qtys[k(nv.nivel, nombre)] ?? 0
                  return (
                    <div key={nombre} className={`flex items-center gap-2 ${qty === 0 ? 'opacity-40' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--sala-txt)] text-sm font-medium truncate">{nombre}</p>
                        {priceMap[nombre] !== undefined && (
                          <p className="text-[var(--sala-tx4)] text-[10px]">{priceMap[nombre].toFixed(2)} € en carta</p>
                        )}
                      </div>
                      <button onClick={() => setQty(nv.nivel, nombre, -1)}
                        className="w-9 h-9 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-lg font-bold flex items-center justify-center active:scale-90">−</button>
                      <span className="text-[var(--sala-txt)] font-black text-lg w-7 text-center tabular-nums">{qty}</span>
                      <button onClick={() => setQty(nv.nivel, nombre, +1)}
                        className="w-9 h-9 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-lg font-bold flex items-center justify-center active:scale-90">+</button>
                    </div>
                  )
                })}
              </div>
              {/* Picker de platos extra de la carta para este curso */}
              {pickerNivel === nv.nivel && (
                <div className="mt-2 bg-[var(--sala-btn2)]/50 rounded-lg p-2">
                  <input autoFocus value={searchExtra} onChange={e => setSearchExtra(e.target.value)}
                    placeholder="Buscar en la carta…"
                    className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xs px-3 py-1.5 rounded-lg outline-none mb-1.5" />
                  {searchExtra.trim() && menu
                    .filter(m => m.activo && !m.ocultoEnCarta && normTxt(m.nombre).includes(normTxt(searchExtra)))
                    .slice(0, 6)
                    .map(m => (
                      <button key={m.id}
                        onClick={() => {
                          setExtras(prev => [...prev, { nombre: m.nombre, nivel: nv.nivel }])
                          setQtys(prev => ({ ...prev, [k(nv.nivel, m.nombre)]: 1 }))
                          setPickerNivel(null)
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--sala-btn2)] text-left">
                        <span className="text-[var(--sala-txt)] text-xs">{m.nombre}</span>
                        <span className="text-[var(--sala-tx3)] text-xs">{m.precio.toFixed(2)} €</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer: confirmar */}
        {template && (
          <div className="px-4 py-3 border-t border-[var(--sala-brd)]">
            {generar.isError && (
              <p className="text-red-400 text-xs font-bold mb-2 text-center">
                No se pudo armar el menú — ¿la mesa ya tiene una comanda abierta?
              </p>
            )}
            <button
              onClick={() => generar.mutate()}
              disabled={generar.isPending || overBudget || todosPlatos.every(p => (qtys[k(p.nivel, p.nombre)] ?? 0) === 0)}
              className="w-full py-4 rounded-2xl text-white font-black text-base disabled:opacity-30 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
              {generar.isPending ? 'Armando…' : `🍽 Armar menú y enviar a cocina · ${budget.toFixed(2)} €`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Menú de grupo en el puesto TPV (tablet) ──────────────────────────────────
// Misma lógica que MenuGrupoSheet (el estado vive allí), con sitio para armarlo a medida: los
// cursos a la izquierda con filas grandes, y la carta de comida a la derecha para sumar platos al
// curso elegido (vegetarianos, alergias, alguien que quiere algo más). Arriba, el presupuesto.
function MenuGrupoTpv({ mesa, pax, menu, categorias, templates, template, setTemplateId, incluyePostre, setPostre, tienePostre,
  nivelesFiltrados, platosDe, qtys, k, setQty, anadirACurso, priceMap, budget, spent, overBudget,
  generar, generando, errorGenerar, nadaElegido, onClose }: {
  mesa: Mesa; pax: number; menu: MenuItem[]; categorias: MenuCategoria[]
  templates: GrupoMenuTemplate[]; template: GrupoMenuTemplate | null; setTemplateId: (id: number | null) => void
  incluyePostre: boolean; setPostre: (v: boolean) => void; tienePostre: boolean
  nivelesFiltrados: GrupoMenuTemplate['niveles']; platosDe: (nivel: number, platos: string[]) => string[]
  qtys: Record<string, number>; k: (nivel: number, nombre: string) => string
  setQty: (nivel: number, nombre: string, delta: number) => void; anadirACurso: (nivel: number, nombre: string) => void
  priceMap: Record<string, number>; budget: number; spent: number; overBudget: boolean
  generar: () => void; generando: boolean; errorGenerar: boolean; nadaElegido: boolean; onClose: () => void
}) {
  const [cursoDestino, setCursoDestino] = useState<number | null>(null)
  const [catSel, setCatSel] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [teclado, setTeclado] = useState(false)
  const destino = cursoDestino ?? nivelesFiltrados[0]?.nivel ?? null

  // Carta de comida: categorías de primer nivel de los grupos que no son de barra (con sus subcategorías)
  const padre = (c: MenuCategoria) => c.parentId ? categorias.find(x => x.id === c.parentId) : undefined
  const catsComida = categorias
    .filter(c => !c.parentId && !esGrupoBarra(c.grupo || ''))
    .sort((a, b) => a.orden - b.orden)
  const deCat = (nombre: string) => menu.filter(m => m.activo && !m.ocultoEnCarta && (m.categoria === nombre
    || padre(categorias.find(c => c.nombre === m.categoria) ?? ({} as MenuCategoria))?.nombre === nombre))
  const catsConPlatos = catsComida.filter(c => deCat(c.nombre).length > 0)
  const cat = catsConPlatos.find(c => c.nombre === catSel) ?? catsConPlatos[0] ?? null
  const q = normTxt(busca.trim())
  const platosCarta = q
    ? menu.filter(m => m.activo && !m.ocultoEnCarta && normTxt(m.nombre).includes(q))
    : cat ? deCat(cat.nombre) : []

  const marco = (hijos: React.ReactNode) => (
    <div className="fixed inset-0 z-50 bg-[var(--sala-hdr)] flex flex-col">
      <div className="px-5 py-3 border-b border-[var(--sala-brd)] flex items-center gap-4">
        <div className="min-w-0">
          <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wider">🍽 Menú de grupo · Mesa {mesa.numero}</p>
          <h2 className="text-[var(--sala-txt)] font-black text-2xl truncate">{pax} PAX{template ? ` · ${template.nombre}` : ''}</h2>
        </div>
        {template && (
          <>
            <button onClick={() => setTemplateId(null)} className="h-11 px-4 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx1)] text-sm font-bold shrink-0">← Cambiar menú</button>
            {tienePostre && <button onClick={() => setPostre(!incluyePostre)} role="switch" aria-checked={incluyePostre}
              className={`h-11 px-4 rounded-xl text-sm font-black uppercase shrink-0 border-2 ${incluyePostre ? 'border-[#4CC8A0] bg-[#4CC8A0]/15 text-[var(--sala-txt)]' : 'border-transparent bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
              🍰 {incluyePostre ? 'Con postre' : 'Sin postre'}
            </button>}
            {/* Presupuesto: valor en carta de lo elegido frente al precio del menú × pax */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-sm font-black mb-1">
                <span className={overBudget ? 'text-red-400' : 'text-[var(--sala-tx2)]'}>
                  {overBudget ? '⚠️ Se pasa del menú' : 'Valor en carta'}: {spent.toFixed(2)} €
                </span>
                {/* Lo que se cobra: precio del menú × pax (el valor en carta solo sirve de tope) */}
                <span className="text-[var(--sala-txt)] text-base">Se cobra: {pax} × {template.precio.toFixed(2)} € = {budget.toFixed(2)} €</span>
              </div>
              <div className="h-3 rounded-full bg-[var(--sala-btn2)] overflow-hidden">
                <div className={`h-full transition-all ${overBudget ? 'bg-red-500' : 'bg-[#4CC8A0]'}`}
                  style={{ width: `${Math.min(100, budget ? (spent / budget) * 100 : 0)}%` }} />
              </div>
            </div>
          </>
        )}
        <button onClick={onClose} aria-label="Cerrar" className="ml-auto w-11 h-11 shrink-0 flex items-center justify-center text-[var(--sala-tx3)] text-2xl">✕</button>
      </div>
      {hijos}
    </div>
  )

  // Paso 1: elegir el menú, en tarjetas grandes
  if (!template) return marco(
    <div className="flex-1 overflow-y-auto p-5">
      {templates.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-lg py-16">Este restaurante no tiene menús de grupo configurados</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {templates.map(t => (
          <button key={t.id} onClick={() => setTemplateId(t.id)}
            className="rounded-2xl p-5 bg-[var(--sala-srf)] text-left flex flex-col gap-2 min-h-40 active:scale-[0.98] transition-transform border-2 border-transparent hover:border-[#4CC8A0]">
            <span className="text-[var(--sala-txt)] font-black text-2xl uppercase">{t.nombre}</span>
            <span className="text-[var(--sala-tx3)] text-sm">{t.precio.toFixed(2)} €/pax · {t.niveles.length} cursos · 1 ración cada {t.paxPorRacion || 3} pax</span>
            <span className="mt-auto text-[#4CC8A0] font-black text-3xl tabular-nums">{(t.precio * pax).toFixed(2)} €</span>
          </button>
        ))}
      </div>
    </div>
  )

  // Paso 2: cursos | carta
  return marco(
    <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,42%)]">
      {/* Cursos */}
      <div className="flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {nivelesFiltrados.map(nv => {
            const esDestino = nv.nivel === destino
            return (
              <div key={nv.nivel} onClick={() => setCursoDestino(nv.nivel)}
                className={`rounded-2xl p-3 border-2 transition-colors ${esDestino ? 'border-[#4CC8A0] bg-[#4CC8A0]/5' : 'border-transparent bg-[var(--sala-srf)]'}`}>
                <NivelEtiqueta titulo={nv.nombre || nombreNivel(nv.nivel)}>
                  {esDestino
                    ? <span className="text-[#4CC8A0] text-xs font-black uppercase shrink-0">← aquí entra lo de la carta</span>
                    : <span className="text-[var(--sala-tx4)] text-xs font-bold uppercase shrink-0">tocar para añadir aquí</span>}
                </NivelEtiqueta>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2">
                  {platosDe(nv.nivel, nv.platos ?? []).map(nombre => {
                    const qty = qtys[k(nv.nivel, nombre)] ?? 0
                    return (
                      <div key={nombre} className={`flex items-center gap-2 rounded-xl px-3 py-2 bg-[var(--sala-bg)] ${qty === 0 ? 'opacity-45' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--sala-txt)] text-base font-black uppercase leading-tight">{nombre}</p>
                          {priceMap[nombre] !== undefined && <p className="text-[var(--sala-tx3)] text-xs">{priceMap[nombre].toFixed(2)} € en carta</p>}
                        </div>
                        <button onClick={e => { e.stopPropagation(); setQty(nv.nivel, nombre, -1) }}
                          className="w-12 h-12 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-2xl font-black flex items-center justify-center active:scale-90">−</button>
                        <span className="text-[var(--sala-txt)] font-black text-2xl w-8 text-center tabular-nums">{qty}</span>
                        <button onClick={e => { e.stopPropagation(); setQty(nv.nivel, nombre, +1) }}
                          className="w-12 h-12 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-2xl font-black flex items-center justify-center active:scale-90">+</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="px-4 py-3 border-t border-[var(--sala-brd)]">
          {errorGenerar && <p className="text-red-400 text-sm font-bold mb-2 text-center">No se pudo armar el menú — ¿la mesa ya tiene una comanda abierta?</p>}
          <button onClick={generar} disabled={generando || overBudget || nadaElegido}
            className="w-full py-4 rounded-2xl text-white font-black text-lg disabled:opacity-30 active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
            {generando ? 'Armando…' : overBudget ? '⚠️ Se pasa del precio del menú' : `🍽 Armar menú y enviar a cocina · ${budget.toFixed(2)} €`}
          </button>
        </div>
      </div>

      {/* Carta: se suma al curso marcado */}
      <div className="flex flex-col min-h-0 border-l border-[var(--sala-brd)] bg-[var(--sala-bg)]">
        <div className="p-3 space-y-2 border-b border-[var(--sala-brd)]">
          <p className="text-[var(--sala-tx3)] text-xs font-black uppercase tracking-wide">
            Añadir de la carta a <span className="text-[#4CC8A0]">{(() => { const nv = nivelesFiltrados.find(n => n.nivel === destino); return nv ? (nv.nombre || nombreNivel(nv.nivel)) : '—' })()}</span>
          </p>
          <input value={busca} onChange={e => setBusca(e.target.value)} inputMode="none" onPointerDown={() => setTeclado(true)}
            placeholder="🔍 Buscar en la carta…"
            className={`w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-lg font-bold uppercase px-4 py-3 rounded-xl outline-none placeholder:text-[var(--sala-tx4)] ${teclado ? 'ring-2 ring-[#4CC8A0]' : ''}`} />
          {!q && !teclado && (
            <div className="flex flex-wrap gap-2">
              {catsConPlatos.map(c => (
                <button key={c.id} onClick={() => setCatSel(c.nombre)}
                  className={`h-11 px-3 rounded-xl text-xs font-black uppercase border-2 ${c.id === cat?.id ? 'border-[#4CC8A0] bg-[#4CC8A0]/15 text-[var(--sala-txt)]' : 'border-transparent bg-[var(--sala-srf)] text-[var(--sala-tx2)]'}`}>
                  {c.icono ? <span className="mr-1">{c.icono}</span> : null}{c.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {platosCarta.map(m => (
              <button key={m.id} onClick={() => destino != null && anadirACurso(destino, m.nombre)}
                className="aspect-[4/3] rounded-2xl p-2 bg-[var(--sala-srf)] flex flex-col items-center justify-center text-center gap-1 active:scale-95 transition-transform select-none">
                <span className="text-[var(--sala-txt)] text-sm font-black uppercase leading-tight line-clamp-3 break-words">{m.nombre}</span>
                <span className="text-[var(--sala-tx3)] text-xs font-bold tabular-nums">{m.precio.toFixed(2)} €</span>
              </button>
            ))}
          </div>
          {q && platosCarta.length === 0 && <p className="text-[var(--sala-tx4)] text-sm text-center py-8">Sin resultados</p>}
        </div>
        {teclado && <TecladoTpv
          onTecla={t => setBusca(v => (v + t).replace(/^ +/, '').slice(0, 30))}
          onBorrar={() => setBusca(v => v.slice(0, -1))}
          onLimpiar={() => setBusca('')}
          onCerrar={() => { setTeclado(false); setBusca('') }} />}
      </div>
    </div>
  )
}

// ── Panel Encargado (modo admin en sala) ─────────────────────────────────────
const MOTIVO_MERMA_LABEL: Record<string, string> = {
  no_servido: 'No servido', queja_cliente: 'Queja cliente', otro: 'Otro',
}

// Normaliza para búsqueda: minúsculas + sin acentos/composición Unicode ("CAÑA" con Ñ
// descompuesta, "café"/"cafe", etc. matchean igual)
const normTxt = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const transcurrido = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

// Reloj en vivo — componente aislado para que el tick no re-renderice el resto de la app
function RelojSala() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5_000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="text-[var(--sala-txt)] text-2xl font-black tabular-nums leading-none">
      {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

// Sheet de cobro — misma lógica que el panel de cobro del dashboard (MesasFeedPage):
// método de pago, importe recibido con cambio (efectivo) o propina (tarjeta = exceso sobre el total)
function CobroSheet({ comanda, onClose, onDone }: { comanda: Comanda; onClose: () => void; onDone?: () => void }) {
  const queryClient = useQueryClient()
  const [metodoPago, setMetodoPago] = useState<'cash' | 'tarjeta' | null>(null)
  const [importe, setImporte] = useState('')
  const total = totalComanda(comanda.items)

  const terminarTpv = useContext(TpvCtx)
  const cobrar = useMutation({
    mutationFn: ({ metodo, propina }: { metodo: 'cash' | 'tarjeta'; propina: number }) =>
      api.comandas.cerrar(comanda.id, metodo, propina),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enc-cobros'] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
      onDone?.()
      onClose()
      terminarTpv?.()
    },
  })

  const importeNum = parseFloat(importe.replace(',', '.')) || 0
  const cambio     = metodoPago === 'cash'    ? importeNum - total : null
  const propina    = metodoPago === 'tarjeta' ? Math.max(0, importeNum - total) : 0
  const canCobrar  = !!metodoPago && (importe === '' || importeNum >= total)

  // Teclado numérico en pantalla (estilo TPV — no usa el teclado del sistema)
  const tecla = (t: string) => {
    navigator.vibrate?.(10)
    if (t === '⌫') { setImporte(v => v.slice(0, -1)); return }
    if (t === ',') { setImporte(v => v.includes(',') ? v : (v || '0') + ','); return }
    setImporte(v => {
      if (v.length >= 7) return v
      const dec = v.split(',')[1]
      if (dec !== undefined && dec.length >= 2) return v // máx 2 decimales
      return v === '0' ? t : v + t
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[var(--sala-hdr)] border-t sm:border border-[var(--sala-brd2)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[96vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wider">
            💶 Cobrar · {comanda.pax} PAX · {comanda.items.length} items
            {comanda.camareroNombre ? <> · 👤 {comanda.camareroNombre}</> : null}
          </p>
          <button onClick={onClose} className="text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-2xl leading-none">✕</button>
        </div>

        {/* Mesa + total — gigantes, lado a lado, siempre visibles */}
        <div className="flex items-stretch gap-3 pt-3">
          <div className="shrink-0 rounded-2xl px-5 py-2 flex flex-col items-center justify-center text-white"
            style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
            <span className="text-[11px] font-black uppercase tracking-widest opacity-80 leading-none">Mesa</span>
            <span className="text-5xl font-black tabular-nums leading-none mt-1">{comanda.mesa.numero}</span>
          </div>
          <div className="flex-1 flex flex-col items-end justify-center">
            <p className="text-[var(--sala-tx4)] text-xs font-bold uppercase tracking-widest mb-1">Total cuenta</p>
            <p className="text-[var(--sala-txt)] text-5xl font-black tabular-nums leading-none">{total.toFixed(2)} €</p>
          </div>
        </div>

        {/* Hora de apertura — crucial para no cobrar una comanda vieja de la misma mesa */}
        <div className="flex items-center justify-between px-4 py-2.5 mt-3 mb-3 rounded-2xl bg-amber-500/15 border border-amber-500/40">
          <span className="text-amber-500 text-xs font-black uppercase tracking-widest">🕐 Mesa abierta</span>
          <span className="text-amber-400 font-black text-3xl tabular-nums leading-none">
            {fmtHora(comanda.createdAt)}
            <span className="text-sm font-bold text-amber-500/90 ml-2">hace {transcurrido(comanda.createdAt)}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => { setMetodoPago('cash'); setImporte('') }}
            className={`py-3.5 rounded-xl text-base font-black transition-all ${metodoPago === 'cash' ? 'bg-green-600 text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
            💵 Efectivo
          </button>
          <button onClick={() => { setMetodoPago('tarjeta'); setImporte('') }}
            className={`py-3.5 rounded-xl text-base font-black transition-all ${metodoPago === 'tarjeta' ? 'bg-blue-600 text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
            💳 Tarjeta
          </button>
        </div>

        {metodoPago && (
          <>
            {/* Display del importe — enorme */}
            <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase tracking-widest text-center mb-1">
              {metodoPago === 'cash' ? 'Importe recibido' : 'Importe en ticket'}
            </p>
            <div className={`rounded-2xl px-4 py-3 mb-2 text-center bg-[var(--sala-btn2)] border-2 ${importe ? (metodoPago === 'cash' ? 'border-green-600/60' : 'border-blue-600/60') : 'border-transparent'}`}>
              <span className={`text-5xl font-black tabular-nums leading-none ${importe ? 'text-[var(--sala-txt)]' : 'text-[var(--sala-tx4)]'}`}>
                {importe || total.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-[var(--sala-tx3)] text-2xl font-bold ml-2">€</span>
            </div>

            {/* Resultado del cálculo — cambio o propina, bien grande */}
            {metodoPago === 'cash' && importeNum > 0 && cambio !== null && (
              <div className={`mb-2 flex items-center justify-between px-5 py-3 rounded-2xl ${cambio >= 0 ? 'bg-green-900/40' : 'bg-red-900/40'}`}>
                <span className={`text-sm font-black uppercase tracking-wide ${cambio >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {cambio >= 0 ? 'Cambio a devolver' : 'Falta'}
                </span>
                <span className={`font-black text-4xl tabular-nums ${cambio >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {Math.abs(cambio).toFixed(2)} €
                </span>
              </div>
            )}
            {metodoPago === 'tarjeta' && importeNum > total && (
              <div className="mb-2 flex items-center justify-between px-5 py-3 rounded-2xl bg-amber-900/40">
                <span className="text-amber-400 text-sm font-black uppercase tracking-wide">🎉 Propina</span>
                <span className="text-amber-400 font-black text-4xl tabular-nums">{propina.toFixed(2)} €</span>
              </div>
            )}
            {metodoPago === 'tarjeta' && importeNum > 0 && importeNum < total && (
              <div className="mb-2 flex items-center justify-between px-5 py-3 rounded-2xl bg-red-900/40">
                <span className="text-red-400 text-sm font-black uppercase tracking-wide">Falta</span>
                <span className="text-red-400 font-black text-4xl tabular-nums">{(total - importeNum).toFixed(2)} €</span>
              </div>
            )}

            {/* Teclado numérico TPV */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(t => (
                <button key={t} onClick={() => tecla(t)}
                  className="h-14 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-2xl font-black active:scale-95 active:bg-[var(--sala-btn)] transition-all select-none">
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => metodoPago && cobrar.mutate({ metodo: metodoPago, propina })}
          disabled={!canCobrar || cobrar.isPending}
          className="w-full py-4 rounded-2xl bg-amber-500 text-black font-black text-xl disabled:opacity-30 hover:bg-amber-400 active:scale-[0.98] transition-all"
        >
          {cobrar.isPending
            ? 'Cobrando…'
            : !metodoPago
              ? 'Elegí el método de pago'
              : metodoPago === 'tarjeta' && propina > 0
                ? `Cobrar Mesa ${comanda.mesa.numero} · +${propina.toFixed(2)} € propina`
                : `Cobrar Mesa ${comanda.mesa.numero}`}
        </button>
      </div>
    </div>
  )
}

// Pestaña 🚫 Agotados del panel 💼: marcar un plato que se acabó (sale "ALTO" en las impresoras
// del local y en la sala se ve apagado) y reponerlo ("HAY"). Al cerrar el turno se reponen solos.
function AgotadosSala({ restaurantId, agotados }: { restaurantId: number; agotados: ItemAgotado[] }) {
  const queryClient = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [confirmar, setConfirmar] = useState<MenuItem | null>(null)
  const { data: menu = [] } = useQuery({ queryKey: ['menu', restaurantId], queryFn: () => api.menu.list(restaurantId) })
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['agotados', restaurantId] })
  const marcar = useMutation({
    mutationFn: (item: MenuItem) => api.agotados.marcar(restaurantId, item.id),
    onSuccess: () => { setConfirmar(null); setBuscar(''); refrescar() },
  })
  const reponer = useMutation({ mutationFn: (menuItemId: number) => api.agotados.reponer(restaurantId, menuItemId), onSuccess: refrescar })
  const ids = new Set(agotados.map(a => a.menuItemId))
  const q = normTxt(buscar.trim())
  const resultados = q
    ? menu.filter(m => m.activo && !m.ocultoEnCarta && !m.autoPorPax && !ids.has(m.id) && normTxt(m.nombre).includes(q)).slice(0, 12)
    : []
  const error = (marcar.error ?? reponer.error) as Error | null

  return (
    <>
      <p className="text-[var(--sala-tx3)] text-xs px-1">
        Al marcar un plato sale <b>ALTO</b> en todas las impresoras del local y en la sala se ve apagado. Al cerrar el turno vuelve todo.
      </p>
      {error && <p className="text-red-400 text-sm font-bold px-1">{error.message}</p>}

      {agotados.length > 0 && (
        <div className="space-y-2">
          {agotados.map(a => (
            <div key={a.menuItemId} className="bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center gap-3 border border-red-500/30">
              <div className="flex-1 min-w-0">
                <p className="text-[var(--sala-txt)] text-base font-black uppercase truncate">{a.menuItem.nombre}</p>
                <p className="text-[var(--sala-tx3)] text-xs">Agotado · {a.marcadoPor} · {fmtHora(a.createdAt)}</p>
              </div>
              <button onClick={() => reponer.mutate(a.menuItemId)} disabled={reponer.isPending}
                className="shrink-0 px-3 py-2 rounded-lg bg-[#4CC8A0] text-white text-sm font-black active:scale-95 disabled:opacity-50">
                Vuelve a haber
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmar ? (
        <div className="bg-[var(--sala-srf)] rounded-xl p-4 border-2 border-red-500/60">
          <p className="text-[var(--sala-tx2)] text-sm">¿Se acabó?</p>
          <p className="text-[var(--sala-txt)] text-xl font-black uppercase mt-0.5">{confirmar.nombre}</p>
          <p className="text-[var(--sala-tx3)] text-xs mt-1">Sale ALTO en las impresoras y nadie más lo puede pedir.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => marcar.mutate(confirmar)} disabled={marcar.isPending}
              className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black active:scale-95 disabled:opacity-50">
              {marcar.isPending ? 'Avisando…' : 'Sí, se acabó'}
            </button>
            <button onClick={() => setConfirmar(null)} className="px-4 py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] font-bold">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 ¿Qué se acabó? (ej. carrillera)"
            className="w-full bg-[var(--sala-srf)] text-[var(--sala-txt)] text-base px-4 py-3 rounded-xl outline-none border border-[var(--sala-brd)] focus:border-red-400" />
          {resultados.map(m => (
            <button key={m.id} onClick={() => setConfirmar(m)}
              className="w-full text-left bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.98]">
              <span className="min-w-0">
                <span className="block text-[var(--sala-txt)] text-sm font-bold truncate">{m.nombre}</span>
                <span className="block text-[var(--sala-tx3)] text-xs truncate">{m.categoria}</span>
              </span>
              <span className="shrink-0 text-red-400 text-xs font-black">SE ACABÓ</span>
            </button>
          ))}
          {q && resultados.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-4">Sin resultados</p>}
          {!q && agotados.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-6">No hay nada agotado 👌</p>}
        </div>
      )}
    </>
  )
}

// ── Reservas: piezas compartidas por el panel 💼, el plano y la mesa ─────────────

// Minutos desde ahora hasta la hora de una reserva de hoy (negativo = ya pasó)
function minutosHasta(hora: string) {
  return minutosHora(hora) - minutosAhora()
}
function minutosAhora() {
  const ahora = new Date()
  const min = ahora.getHours() * 60 + ahora.getMinutes()
  // Pasada la medianoche seguimos en el día de servicio de ayer: las 00:30 son "24:30"
  return ahora.getHours() < CORTE_DIA_HORAS ? min + 24 * 60 : min
}

// Qué tan cerca está una reserva por llegar: de 30 a 15 min antes "próxima", de 15 antes a 15
// después "llegando", y a partir de ahí "tarde". Las mismas ventanas en la lista del 💼 y en el plano.
type NivelReserva = 'proxima' | 'llega' | 'tarde'
function nivelReserva(hora: string, ahoraMin: number): { nivel: NivelReserva; faltan: number } | null {
  const faltan = minutosHora(hora) - ahoraMin
  if (faltan <= -15) return { nivel: 'tarde', faltan }
  if (faltan <= 15) return { nivel: 'llega', faltan }
  if (faltan <= 30) return { nivel: 'proxima', faltan }
  return null
}
const GRAVEDAD_RESERVA: Record<NivelReserva, number> = { proxima: 1, llega: 2, tarde: 3 }
// Color y ritmo del latido de cada nivel en el plano (más rápido cuanto más urgente)
const ESTILO_RESERVA: Record<NivelReserva, { color: string; ritmo: string }> = {
  proxima: { color: '#facc15', ritmo: '2s' },
  llega:   { color: '#f97316', ritmo: '1s' },
  tarde:   { color: '#ef4444', ritmo: '0.7s' },
}
const textoNivelReserva = ({ nivel, faltan }: { nivel: NivelReserva; faltan: number }) =>
  nivel === 'tarde' ? `+${-faltan} min` : faltan > 0 ? `${nivel === 'llega' ? '⏰ ' : ''}en ${faltan}′` : '⏰ ya'

// La hora y los pax, grandes: lo primero que se lee de una reserva
function BloqueHoraPax({ hora, pax, walkin = false, tono }: { hora: string; pax: number; walkin?: boolean; tono?: string }) {
  return (
    <div className="w-[88px] shrink-0 flex flex-col items-center justify-center gap-0.5 py-3 bg-[var(--sala-btn2)]">
      {walkin && <span className="text-[10px] font-black uppercase tracking-wider text-[var(--sala-tx3)]">🚶 llegó</span>}
      <span className={`font-mono font-black text-[26px] leading-none tabular-nums ${tono ?? 'text-[var(--sala-txt)]'}`}>{hora}</span>
      <span className="text-[var(--sala-txt)] font-black text-xl leading-none mt-1 tabular-nums">
        {pax}<span className="text-[var(--sala-tx3)] text-xs font-bold ml-0.5">pax</span>
      </span>
    </div>
  )
}

// Llamar / WhatsApp: botones de verdad, no enlaces chiquitos
function ContactoReserva({ telefono }: { telefono: string }) {
  return (
    <div className="flex gap-1.5">
      <a href={`tel:${telefono}`} title={telefono}
        className="h-9 px-3 rounded-lg bg-[var(--sala-btn2)] text-[#4B9EDF] text-sm font-bold flex items-center gap-1.5">📞 <span className="tabular-nums">{telefono}</span></a>
      <a href={waLink(telefono)} target="_blank" rel="noopener noreferrer" title="WhatsApp"
        className="h-9 w-9 rounded-lg bg-[var(--sala-btn2)] text-base flex items-center justify-center">💬</a>
    </div>
  )
}

// Encargado, desde la cabecera de la mesa: quién está sentado de verdad. Corrige un "Sentar"
// equivocado (la reserva vuelve a "por llegar") y marca una mesa que abrió un camarero.
function QuienEstaSheet({ comanda, onClose }: { comanda: Comanda; onClose: () => void }) {
  const queryClient = useQueryClient()
  const rid = comanda.restaurantId
  const hoy = diaServicio()
  const { data: reservas = [] } = useQuery({ queryKey: ['reservas', rid, hoy], queryFn: () => api.reservas.list(rid, hoy) })
  const cambiar = useMutation({
    mutationFn: (reservaId: number | null) => api.comandas.cambiarReserva(comanda.id, reservaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', rid] })
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      queryClient.invalidateQueries({ queryKey: ['reservas', rid] })
      onClose()
    },
  })
  const actual = comanda.reserva ?? null
  const pendientes = reservas
    .filter(r => r.estado === 'confirmada' && !r.enPool)
    .sort((a, b) => Math.abs(minutosHasta(a.hora)) - Math.abs(minutosHasta(b.hora)))
  const opcion = 'w-full flex items-stretch rounded-xl overflow-hidden bg-[var(--sala-srf)] border-2 text-left active:scale-[0.98] transition-transform disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--sala-hdr)] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase tracking-wider">Mesa {comanda.mesa.numero} · {comanda.pax} pax</p>
            <h3 className="text-[var(--sala-txt)] font-black text-xl">¿Quién está sentado?</h3>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-2xl leading-none px-1">✕</button>
        </div>
        {actual && actual.origen !== 'walkin' && (
          <p className="text-[var(--sala-tx3)] text-xs mb-3">Si no era <b className="text-[var(--sala-txt)]">{actual.nombre}</b>, elige quién es: esa reserva vuelve a "por llegar", sin mesa.</p>
        )}
        <div className="overflow-y-auto space-y-2 mt-2">
          <button disabled={cambiar.isPending} onClick={() => cambiar.mutate(null)}
            className={`${opcion} ${actual?.origen === 'walkin' ? 'border-[#4CC8A0]' : 'border-transparent'}`}>
            <div className="w-[88px] shrink-0 flex items-center justify-center bg-[var(--sala-btn2)] text-3xl py-3">🚶</div>
            <div className="flex-1 p-3 flex flex-col justify-center">
              <span className="text-[var(--sala-txt)] font-black">Walk-in</span>
              <span className="text-[var(--sala-tx3)] text-xs">Sin reserva</span>
            </div>
            {actual?.origen === 'walkin' && <span className="self-center pr-4 text-[#4CC8A0] font-black">✓</span>}
          </button>
          {actual && actual.origen !== 'walkin' && (
            <div className={`${opcion} border-[#4CC8A0]`}>
              <BloqueHoraPax hora={actual.hora} pax={comanda.pax} />
              <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                <span className="text-[var(--sala-txt)] font-black truncate">{actual.nombre}</span>
                <span className="text-[#4CC8A0] text-xs font-bold">✓ Ahora en esta mesa</span>
              </div>
            </div>
          )}
          {pendientes.length > 0 && <p className="text-[var(--sala-tx3)] text-[11px] font-bold uppercase tracking-wider pt-2">Reservas por llegar</p>}
          {pendientes.map(r => (
            <button key={r.id} disabled={cambiar.isPending} onClick={() => cambiar.mutate(r.id)} className={`${opcion} border-transparent`}>
              <BloqueHoraPax hora={r.hora} pax={r.pax} />
              <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                <span className="text-[var(--sala-txt)] font-black truncate">{r.nombre}</span>
                {r.notas && <span className="text-amber-500 text-xs font-bold truncate">📝 {r.notas}</span>}
              </div>
            </button>
          ))}
        </div>
        {cambiar.isError && <p className="text-red-400 text-sm font-bold mt-3">{(cambiar.error as Error).message}</p>}
      </div>
    </div>
  )
}

// ── Plano de reservas (💼 → Reservas → 🗺 Plano) ──────────────────────────────
// El mismo dibujo del salón, pero cada mesa enseña las horas de sus reservas del día. Se asigna en
// dos toques: una reserva (de la tira "sin mesa" o una hora dentro de una mesa) y luego la mesa.
// No bloquea nada: si dos reservas de la misma mesa se pisan (según la duración de la config de
// reservas) o la mesa es chica, solo avisa en ámbar.
const DURACION_RESERVA_DEFECTO = 90

// Lo que cabe en la mesa del plano: el apellido. "Juan García López" → GARCÍA (el primero, el que
// se usa al llamar); con una sola palabra, esa. El nombre entero sale al tocar la reserva.
function apellidoReserva(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return partes.length > 1 ? partes[1] : partes[0]
}

function fechaLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// "Hoy" para las reservas es el día de servicio, que corta a las 06:00 (como el servidor,
// dia-servicio.ts): a las 00:30 el turno de noche sigue viendo sus reservas
const CORTE_DIA_HORAS = 6
function diaServicio(desplazamiento = 0) {
  const d = new Date(Date.now() - CORTE_DIA_HORAS * 3600_000)
  d.setDate(d.getDate() + desplazamiento)
  return fechaLocal(d)
}
function minutosHora(h: string) {
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + (mm || 0)
}

function PlanoReservas({ restaurantId, reservaInicial, fechaInicial, camareroNombre, onClose }: {
  restaurantId: number
  reservaInicial?: number
  fechaInicial?: string
  camareroNombre?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isDark = useContext(ThemeCtx)
  const hoy = diaServicio()
  const [fecha, setFecha] = useState(fechaInicial ?? hoy)
  const [elegida, setElegida] = useState<number | null>(reservaInicial ?? null)
  const [planId, setPlanId] = useState<number | null>(null)

  const { data: planes = [] } = useQuery({ queryKey: ['salon-planes', restaurantId], queryFn: () => api.salon.list(restaurantId) })
  const { data: reservas = [] } = useQuery({
    queryKey: ['reservas', restaurantId, fecha],
    queryFn: () => api.reservas.list(restaurantId, fecha),
    refetchInterval: 30_000,
  })
  const asignar = useMutation({
    mutationFn: ({ id, mesaId }: { id: number; mesaId: number | null }) => api.reservas.asignarMesa(id, mesaId),
    onSuccess: () => { setElegida(null); queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] }) },
  })

  // Al abrir desde "Asignar mesa" de una reserva que ya tiene mesa: su salón
  const reservaElegida = reservas.find(r => r.id === elegida) ?? null
  useEffect(() => {
    if (planId || !planes.length) return
    const mesaIni = reservas.find(r => r.id === reservaInicial)?.mesaId
    setPlanId(planes.find(p => p.mesas.some(m => m.id === mesaIni))?.id ?? planes[0].id)
  }, [planes, reservas])
  const plan = planes.find(p => p.id === planId) ?? planes[0] ?? null

  // Deslizar como en el mapa de la sala: a la izquierda el salón siguiente, a la derecha el anterior;
  // desde el primero, a la derecha se vuelve a la lista. El nombre del salón sale un momento en grande.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const irASalon = (paso: number) => {
    const i = planes.findIndex(p => p.id === plan?.id)
    const destino = planes[i + paso]
    if (!destino) { if (paso < 0) onClose(); return }
    setPlanId(destino.id)
    setAviso(destino.nombre)
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = setTimeout(() => setAviso(null), 1100)
  }

  // Hoy, el plano sabe qué mesas tienen gente ahora (las mismas comandas que el mapa de la sala)
  const esHoyPlano = fecha === hoy
  const { data: comandasAhora = [] } = useQuery({
    queryKey: ['comandas-sala', restaurantId],
    queryFn: () => api.comandas.list(restaurantId),
    enabled: esHoyPlano,
    refetchInterval: 15_000,
  })

  // Hoy, una reserva sentada solo cuenta mientras siguen en la mesa (su comanda sigue activa):
  // los que ya se fueron no ensucian el plano con horas tachadas
  const sigueEnLaMesa = (r: Reserva) => !esHoyPlano || comandasAhora.some(c => c.id === r.comandaId)
  const vivas = reservas.filter(r => r.estado === 'confirmada' || (r.estado === 'sentada' && sigueEnLaMesa(r)))
  const sinMesa = vivas.filter(r => !r.mesaId && r.estado === 'confirmada')
  const duracion = (r: Reserva) => r.config?.duracionMin ?? DURACION_RESERVA_DEFECTO
  const deMesa = (mesaId: number) => vivas.filter(r => r.mesaId === mesaId).sort((a, b) => minutosHora(a.hora) - minutosHora(b.hora))
  // Dos reservas de la misma mesa se pisan si la segunda llega antes de que termine la primera
  const sePisan = (a: Reserva, b: Reserva) => {
    const [antes, despues] = minutosHora(a.hora) <= minutosHora(b.hora) ? [a, b] : [b, a]
    return minutosHora(despues.hora) - minutosHora(antes.hora) < duracion(antes)
  }
  const pisadas = new Set<number>()
  for (const p of planes) for (const m of p.mesas) {
    const lista = deMesa(m.id)
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      if (sePisan(lista[i], lista[j])) { pisadas.add(lista[i].id); pisadas.add(lista[j].id) }
    }
  }
  const todasMesas = planes.flatMap(p => p.mesas)
  const mesaDe = (r: Reserva) => todasMesas.find(m => m.id === r.mesaId)
  const chica = (r: Reserva) => { const m = mesaDe(r); return !!m && m.capacidad > 0 && r.pax > m.capacidad }

  const ocupada = (mesaId: number) => esHoyPlano && comandasAhora.some(c => c.mesaId === mesaId)

  // Hoy, cada mesa avisa de su reserva por llegar más urgente (próxima / llegando / tarde).
  // Un solo reloj cada 30 s para todo el plano.
  // Mesas donde no entra el apellido bajo la hora: la línea alterna hora ↔ apellido
  // (la hora más rato, que es lo primero que se mira)
  const [verApellido, setVerApellido] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVerApellido(v => !v), verApellido ? 1500 : 2500)
    return () => clearTimeout(t)
  }, [verApellido])
  const [ahoraMin, setAhoraMin] = useState(minutosAhora)
  useEffect(() => {
    const t = setInterval(() => setAhoraMin(minutosAhora()), 30_000)
    return () => clearInterval(t)
  }, [])
  const alertaDe = (mesaId: number) => {
    if (!esHoyPlano) return null
    let peor: { r: Reserva; nivel: NivelReserva; faltan: number } | null = null
    for (const r of deMesa(mesaId)) {
      if (r.estado !== 'confirmada') continue
      const n = nivelReserva(r.hora, ahoraMin)
      if (n && (!peor || GRAVEDAD_RESERVA[n.nivel] > GRAVEDAD_RESERVA[peor.nivel])) peor = { r, ...n }
    }
    return peor
  }

  // Tocar una mesa que está llegando o tarde: qué hacer con esa reserva (llamar, sentar, no vino)
  const [menuDe, setMenuDe] = useState<{ reserva: Reserva; mesa: Mesa } | null>(null)
  const sentarAqui = useMutation({
    mutationFn: ({ reserva, mesa }: { reserva: Reserva; mesa: Mesa }) => api.reservas.sentar(reserva.id, mesa.id, camareroNombre),
    onSuccess: () => {
      setMenuDe(null)
      queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurantId] })
    },
  })
  const noVino = useMutation({
    mutationFn: (id: number) => api.reservas.updateEstado(id, 'no_show'),
    onSuccess: () => { setMenuDe(null); queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] }) },
  })

  // Walk-in desde el plano: sin reserva elegida, tocar una mesa libre → pax → se sienta y se sigue en el plano
  const [walkinEn, setWalkinEn] = useState<Mesa | null>(null)
  const [paxWalkin, setPaxWalkin] = useState(2)
  const sentarWalkin = useMutation({
    mutationFn: ({ mesa, pax }: { mesa: Mesa; pax: number }) => api.comandas.abrir(restaurantId, mesa.id, pax, camareroNombre, true),
    onSuccess: () => {
      setWalkinEn(null)
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] })
    },
  })

  const tocarMesa = (mesa: Mesa) => {
    if (!reservaElegida) {
      const alerta = alertaDe(mesa.id)
      if (alerta && alerta.nivel !== 'proxima') { sentarAqui.reset(); noVino.reset(); setMenuDe({ reserva: alerta.r, mesa }); return }
      if (esHoyPlano && !ocupada(mesa.id)) { setPaxWalkin(2); sentarWalkin.reset(); setWalkinEn(mesa) }
      return
    }
    if (asignar.isPending) return
    if (reservaElegida.mesaId === mesa.id) { setElegida(null); return }
    asignar.mutate({ id: reservaElegida.id, mesaId: mesa.id })
  }

  const moverDia = (n: number) => {
    const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + n)
    setFecha(fechaLocal(d)); setElegida(null)
  }
  const manana = diaServicio(1)
  const etiquetaFecha = fecha === hoy ? 'Hoy' : fecha === manana ? 'Mañana'
    : new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric' })

  const nombreDe = (r: Reserva) => r.origen === 'walkin' ? '🚶 Walk-in' : (r.nombre ?? '')

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--sala-bg)] flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Cabecera: volver, fecha y salones */}
      <div className="px-4 pt-4 pb-2 border-b border-[var(--sala-brd)] bg-[var(--sala-hdr)]">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-[var(--sala-tx2)] text-sm font-bold px-2 py-1">← Volver</button>
          <h2 className="flex-1 text-[var(--sala-txt)] font-black text-lg">🗺 Plano de reservas</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => moverDia(-1)} className="w-9 h-9 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-bold">‹</button>
            <button onClick={() => { setFecha(hoy); setElegida(null) }}
              className="min-w-[84px] h-9 px-2 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm font-bold capitalize">{etiquetaFecha}</button>
            <button onClick={() => moverDia(1)} className="w-9 h-9 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-bold">›</button>
          </div>
        </div>
        {planes.length > 1 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto">
            {planes.map(p => (
              <button key={p.id} onClick={() => setPlanId(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${plan?.id === p.id ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
                {p.nombre} {p.mesas.some(m => deMesa(m.id).length) ? `· ${p.mesas.reduce((n, m) => n + deMesa(m.id).length, 0)}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* El plano, escalado a la pantalla como el mapa de la sala */}
      {plan && plan.mesas.length > 0 ? (
        <div className="flex-1 overflow-hidden relative"
          onTouchStart={e => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={e => {
            const ini = swipe.current
            swipe.current = null
            if (!ini) return
            const dx = e.changedTouches[0].clientX - ini.x, dy = e.changedTouches[0].clientY - ini.y
            const th = swipeThresholds()
            if (Math.abs(dx) > th.dx && Math.abs(dy) < th.dy) irASalon(dx < 0 ? 1 : -1)
          }}
          ref={el => {
          if (!el) return
          const aplicar = () => {
            const PAD = 24
            const ms = plan.mesas
            const minX = Math.min(...ms.map(m => m.x)) - PAD
            const minY = Math.min(...ms.map(m => m.y)) - PAD
            const w = Math.max(...ms.map(m => m.x + mesaWidth(m))) + PAD - minX
            const h = Math.max(...ms.map(m => m.y + mesaHeight(m))) + PAD - minY
            const scale = Math.min(el.clientWidth / w, el.clientHeight / h)
            const canvas = el.querySelector('.plano-canvas') as HTMLElement | null
            if (canvas) {
              canvas.style.transformOrigin = '0 0'
              canvas.style.transform = `translate(${(el.clientWidth - w * scale) / 2}px, ${(el.clientHeight - h * scale) / 2}px) scale(${scale}) translate(${-minX}px, ${-minY}px)`
            }
          }
          aplicar()
          const ro = new ResizeObserver(aplicar)
          ro.observe(el)
          ;(el as HTMLElement & { _ro?: ResizeObserver })._ro?.disconnect()
          ;(el as HTMLElement & { _ro?: ResizeObserver })._ro = ro
        }}>
          {aviso && (
            <div key={aviso} className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
              <span className="px-6 py-3 rounded-2xl text-white text-2xl font-black uppercase tracking-wide shadow-2xl"
                style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)', animation: 'fadeInOut 1.1s ease forwards' }}>
                {aviso}
              </span>
            </div>
          )}
          {/* Puntitos: en qué salón estás (deslizar para cambiar) */}
          {planes.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 pointer-events-none">
              {planes.map(p => (
                <span key={p.id} className={`h-2 rounded-full transition-all ${p.id === plan.id ? 'w-5 bg-[#4CC8A0]' : 'w-2 bg-[var(--sala-tx4)]'}`} />
              ))}
            </div>
          )}
          <div className="plano-canvas" style={{ position: 'absolute', top: 0, left: 0 }}>
            {plan.mesas.map(mesa => {
              const w = mesaWidth(mesa), h = mesaHeight(mesa)
              if (mesa.tipo === 'barra' || isElemDeco(mesa.tipo)) {
                const def = mesa.tipo === 'barra' ? { bg: '#130e08', border: '#92400e', label: 'BARRA' } : ELEM_STYLES[mesa.tipo]
                return (
                  <div key={mesa.id} style={{
                    position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h, borderRadius: 6,
                    background: def.bg, border: `2px solid ${def.border}`, opacity: 0.6, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: def.border, fontWeight: 800, fontSize: 10, letterSpacing: '0.1em' }}>{def.label}</span>
                  </div>
                )
              }
              const lista = deMesa(mesa.id)
              const isRound = mesa.tipo === 'round' || mesa.tipo === 'silla_alta'
              const chicaMesa = mesa.tipo === 'silla_alta'
              // Con sitio para todas, cada reserva lleva su apellido bajo la hora (como Zenchef);
              // si no entran, solo las horas
              // Con reservas, el número de la mesa pasa a la esquina y deja el centro para horas y nombres
              const numEnEsquina = !chicaMesa && lista.length > 0
              // Con reservas, "OCUPADA" no se escribe (el fondo morado ya lo dice) y deja sitio a los nombres
              const conGenteSinReserva = ocupada(mesa.id) && lista.length === 0
              const alto = h - (numEnEsquina ? 8 : 26) - (conGenteSinReserva ? 11 : 0)
              const conNombre = numEnEsquina && lista.length <= Math.floor((alto + 3) / 30)
              const caben = chicaMesa ? 1 : Math.max(1, Math.floor((alto + 3) / 18))
              const visibles = lista.length > caben ? lista.slice(0, caben - 1 || 1) : lista
              const resto = lista.length - visibles.length
              const conAviso = (r: Reserva) => pisadas.has(r.id) || chica(r)
              const hayAviso = lista.some(conAviso)
              const esDestino = !!reservaElegida
              const esLaDeElegida = reservaElegida?.mesaId === mesa.id
              const conGente = ocupada(mesa.id)
              const alerta = alertaDe(mesa.id)
              const estiloAlerta = alerta ? ESTILO_RESERVA[alerta.nivel] : null
              const border = esLaDeElegida ? '#38bdf8' : estiloAlerta ? estiloAlerta.color : hayAviso ? '#f59e0b' : lista.length ? '#4B9EDF' : conGente ? '#a855f7' : (isDark ? '#334155' : '#cbd5e1')
              return (
                <Fragment key={mesa.id}>
                {/* Aureola que late por fuera de la mesa: solo cambia opacidad y escala (barato en una tablet) */}
                {estiloAlerta && (
                  <div className="reserva-latido" style={{
                    position: 'absolute', left: mesa.x - 7, top: mesa.y - 7, width: w + 14, height: h + 14,
                    borderRadius: isRound ? '50%' : 10, border: `4px solid ${estiloAlerta.color}`,
                    boxShadow: `0 0 14px ${estiloAlerta.color}`, pointerEvents: 'none',
                    animationDuration: estiloAlerta.ritmo,
                    // rotate aparte: la animación usa transform (escala) y lo pisaría
                    rotate: mesa.rotacion ? `${mesa.rotacion}deg` : undefined,
                  }} />
                )}
                <div onClick={() => tocarMesa(mesa)} style={{
                  position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
                  borderRadius: isRound ? '50%' : 6,
                  background: conGente ? (isDark ? '#2d1a3a' : '#f3e8ff') : lista.length ? (isDark ? '#0f2240' : '#e0f2fe') : (isDark ? '#111827' : '#f8fafc'),
                  border: `2px ${esDestino && !esLaDeElegida ? 'dashed' : 'solid'} ${border}`,
                  boxShadow: esLaDeElegida ? '0 0 16px #38bdf899' : undefined,
                  cursor: esDestino || (esHoyPlano && !conGente) ? 'pointer' : 'default', userSelect: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: mesa.rotacion ? `rotate(${mesa.rotacion}deg)` : undefined,
                }}>
                  <div style={{ transform: mesa.rotacion ? `rotate(${-mesa.rotacion}deg)` : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    {!numEnEsquina && <span style={{ color: isDark ? '#e2e8f0' : '#0f172a', fontWeight: 800, fontSize: chicaMesa ? 12 : 16, lineHeight: 1.1 }}>{mesa.numero}</span>}
                    {conGente && !chicaMesa && lista.length === 0 && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', color: isDark ? '#c084fc' : '#9333ea' }}>OCUPADA</span>}
                    {visibles.map((r, i) => (
                      <span key={r.id} onClick={e => {
                        // Con otra reserva elegida, tocar esta hora es tocar la mesa (asignarla aquí también):
                        // con la hora y el apellido, la reserva que ya está ocupa casi toda la mesa
                        if (r.estado !== 'confirmada' || (elegida && elegida !== r.id)) return
                        e.stopPropagation(); setElegida(elegida === r.id ? null : r.id)
                      }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: chicaMesa ? 9 : 12, lineHeight: 1.15, whiteSpace: 'nowrap',
                          padding: '0 3px', borderRadius: 4,
                          // Entre una reserva y la siguiente, una raya punteada: dos apellidos seguidos
                          // ("MARTIN" / "GÓMEZ") se leían como un solo nombre
                          ...(i > 0 ? { borderTop: `2px dashed ${isDark ? '#94a3b8' : '#475569'}`, marginTop: 2, paddingTop: 2, borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
                          color: r.id === elegida ? '#fff' : alerta?.r.id === r.id ? alerta.nivel === 'proxima' ? (isDark ? '#facc15' : '#a16207') : alerta.nivel === 'llega' ? '#f97316' : '#ef4444' : conAviso(r) ? '#d97706' : r.estado === 'sentada' ? (isDark ? '#64748b' : '#94a3b8') : (isDark ? '#7dd3fc' : '#0369a1'),
                          background: r.id === elegida ? '#0ea5e9' : 'transparent',
                          textDecoration: r.estado === 'sentada' ? 'line-through' : undefined,
                        }}>
                        {!conNombre && verApellido && r.origen !== 'walkin' && r.nombre ? (
                          <span key="apellido" style={{
                            fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: chicaMesa ? 8 : 10.5, fontWeight: 800, textTransform: 'uppercase',
                            lineHeight: chicaMesa ? 1.35 : 1.3, maxWidth: w - 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            animation: 'altoSube 0.25s ease-out',
                          }}>{apellidoReserva(r.nombre)}</span>
                        ) : (
                          <span key="hora" style={!conNombre ? { animation: 'altoSube 0.25s ease-out' } : undefined}>{r.origen === 'walkin' ? '🚶' : ''}{r.hora}</span>
                        )}
                        {conNombre && r.origen !== 'walkin' && r.nombre && (
                          <span style={{
                            fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                            maxWidth: w - 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{apellidoReserva(r.nombre)}</span>
                        )}
                      </span>
                    ))}
                    {resto > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>+{resto}</span>}
                  </div>
                </div>
                {numEnEsquina && (
                  // Número montado sobre el borde, mitad dentro y mitad fuera de la mesa (como la etiqueta de
                  // un plano). Fuera de la mesa girada, para que siempre quede arriba a la izquierda.
                  <span style={{
                    position: 'absolute', top: mesa.y - 9, left: isRound ? mesa.x + w / 2 : mesa.x - 9,
                    translate: isRound ? '-50% 0' : undefined,
                    minWidth: 20, height: 18, padding: '0 4px', borderRadius: 9, zIndex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDark ? '#0b1220' : '#ffffff', border: `1.5px solid ${border}`,
                    color: isDark ? '#e2e8f0' : '#0f172a', fontWeight: 900, fontSize: 11, lineHeight: 1, pointerEvents: 'none',
                  }}>{mesa.numero}</span>
                )}
                {/* Pastilla encima de la mesa: cuánto falta o cuánto lleva de retraso */}
                {alerta && estiloAlerta && (
                  <span onClick={() => tocarMesa(mesa)} style={{
                    position: 'absolute', left: mesa.x + w / 2, top: mesa.y - 11, transform: 'translate(-50%, -50%)',
                    zIndex: 2, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                    background: estiloAlerta.color, color: alerta.nivel === 'proxima' ? '#1c1917' : '#fff',
                    fontWeight: 900, fontSize: 12, lineHeight: 1.4, boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                    cursor: 'pointer',
                  }}>
                    {textoNivelReserva(alerta)}
                  </span>
                )}
                </Fragment>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--sala-tx4)] text-sm">No hay mesas configuradas</div>
      )}

      {menuDe && (() => {
        const { reserva, mesa } = menuDe
        const n = nivelReserva(reserva.hora, ahoraMin)
        const conGenteAhi = ocupada(mesa.id)
        return (
          <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setMenuDe(null)}>
            <div className="bg-[var(--sala-srf)] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex">
                <BloqueHoraPax hora={reserva.hora} pax={reserva.pax}
                  tono={n?.nivel === 'tarde' ? 'text-red-500' : 'text-orange-500'} />
                <div className="flex-1 min-w-0 p-4">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 min-w-0 text-[var(--sala-txt)] font-black text-lg leading-tight truncate">{nombreDe(reserva)}</p>
                    <button onClick={() => setMenuDe(null)} className="text-[var(--sala-tx3)] text-lg px-1 -mt-1">✕</button>
                  </div>
                  <p className={`text-sm font-black mt-0.5 ${n?.nivel === 'tarde' ? 'text-red-500' : 'text-orange-500'}`}>
                    Mesa {mesa.numero} · {n?.nivel === 'tarde' ? `⏰ ${-n.faltan} min tarde` : n && n.faltan > 0 ? `llega en ${n.faltan} min` : 'ya deberían estar'}
                  </p>
                  {reserva.notas && <p className="text-amber-500 text-xs font-bold mt-1">📝 {reserva.notas}</p>}
                </div>
              </div>
              <div className="p-4 pt-1 space-y-2">
                {reserva.telefono && <ContactoReserva telefono={reserva.telefono} />}
                {conGenteAhi && <p className="text-purple-400 text-xs font-bold">La mesa {mesa.numero} tiene gente ahora: toca "Cambiar de mesa" para sentarlos en otra.</p>}
                <button onClick={() => sentarAqui.mutate({ reserva, mesa })} disabled={sentarAqui.isPending || conGenteAhi}
                  className="w-full py-3 rounded-xl text-white font-black disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                  {sentarAqui.isPending ? 'Sentando…' : `✅ Sentar en ${mesa.numero}`}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setMenuDe(null); setElegida(reserva.id) }}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm font-bold">🪑 Cambiar de mesa</button>
                  <button onClick={() => noVino.mutate(reserva.id)} disabled={noVino.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/15 text-red-500 text-sm font-black disabled:opacity-50">🚫 No vino</button>
                </div>
                {(sentarAqui.error || noVino.error) && <p className="text-red-400 text-xs font-bold">{((sentarAqui.error || noVino.error) as Error).message}</p>}
              </div>
            </div>
          </div>
        )
      })()}

      {walkinEn && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center px-4" onClick={() => setWalkinEn(null)}>
          <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-xs shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase tracking-wider">🚶 Walk-in</p>
            <h3 className="text-[var(--sala-txt)] font-black text-xl mb-4">Mesa {walkinEn.numero} · ¿cuántos?</h3>
            <div className="flex items-center gap-4 mb-6">
              <button onClick={() => setPaxWalkin(p => Math.max(1, p - 1))} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl">−</button>
              <span className="flex-1 text-center text-[var(--sala-txt)] text-5xl font-black tabular-nums">{paxWalkin}</span>
              <button onClick={() => setPaxWalkin(p => p + 1)} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl">+</button>
            </div>
            {(() => {
              const prox = deMesa(walkinEn.id).find(r => r.estado === 'confirmada' && minutosHora(r.hora) > ahoraMin)
              return prox && (
                <p className="text-amber-500 text-xs font-bold mb-3 text-center">
                  ⚠ Esta mesa tiene reserva a las {prox.hora} (en {minutosHora(prox.hora) - ahoraMin} min)
                </p>
              )
            })()}
            {walkinEn.capacidad > 0 && paxWalkin > walkinEn.capacidad && (
              <p className="text-amber-500 text-xs font-bold mb-3 text-center">⚠ La mesa es para {walkinEn.capacidad}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setWalkinEn(null)} className="flex-1 py-3 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] font-medium">Cancelar</button>
              <button onClick={() => sentarWalkin.mutate({ mesa: walkinEn, pax: paxWalkin })} disabled={sentarWalkin.isPending}
                className="flex-1 py-3 rounded-xl text-white font-black disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                {sentarWalkin.isPending ? 'Sentando…' : 'Sentar'}
              </button>
            </div>
            {sentarWalkin.isError && <p className="text-red-400 text-xs font-bold mt-3">{(sentarWalkin.error as Error).message}</p>}
          </div>
        </div>
      )}

      {/* Abajo: la reserva elegida (qué hacer con ella) o la tira de las que no tienen mesa */}
      <div className="border-t border-[var(--sala-brd)] bg-[var(--sala-hdr)] px-4 py-3">
        {reservaElegida ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--sala-txt)] font-mono font-black text-xl tabular-nums">{reservaElegida.hora}</span>
              <span className="text-[var(--sala-txt)] font-black text-xl tabular-nums">{reservaElegida.pax}<span className="text-[var(--sala-tx3)] text-xs ml-0.5">pax</span></span>
              <span className="text-[var(--sala-txt)] font-bold flex-1 truncate">{nombreDe(reservaElegida)}</span>
              {reservaElegida.mesaId && (
                <button onClick={() => asignar.mutate({ id: reservaElegida.id, mesaId: null })}
                  className="px-2.5 py-1 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-xs font-bold">Sin mesa</button>
              )}
              <button onClick={() => setElegida(null)} className="text-[var(--sala-tx3)] text-lg px-1">✕</button>
            </div>
            <p className="text-sky-500 text-xs font-bold mt-1">
              {reservaElegida.mesaId ? `En la mesa ${mesaDe(reservaElegida)?.numero ?? '?'} · toca otra mesa para cambiarla` : 'Toca la mesa donde va'}
            </p>
            {reservaElegida.notas && <p className="text-[var(--sala-tx3)] text-xs mt-0.5 truncate">📝 {reservaElegida.notas}</p>}
            {pisadas.has(reservaElegida.id) && (
              <p className="text-amber-500 text-xs font-bold mt-0.5">
                ⚠ Se pisa con {deMesa(reservaElegida.mesaId!).filter(o => o.id !== reservaElegida.id && sePisan(o, reservaElegida)).map(o => o.hora).join(', ')} (cada reserva ocupa {duracion(reservaElegida)} min)
              </p>
            )}
            {chica(reservaElegida) && <p className="text-amber-500 text-xs font-bold mt-0.5">⚠ Son {reservaElegida.pax} y la mesa es para {mesaDe(reservaElegida)?.capacidad}</p>}
            {asignar.isError && <p className="text-red-400 text-xs mt-0.5">{(asignar.error as Error).message}</p>}
          </div>
        ) : (
          <>
            <p className="text-[var(--sala-tx3)] text-[11px] font-bold uppercase tracking-wider mb-1.5">
              {sinMesa.length ? `Sin mesa (${sinMesa.length}) · toca una y después su mesa` : vivas.length ? 'Todas las reservas tienen mesa' : 'No hay reservas este día'}
              {esHoyPlano && ' · 🚶 toca una mesa libre para sentar un walk-in'}
            </p>
            {sinMesa.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sinMesa.map(r => (
                  <button key={r.id} onClick={() => setElegida(r.id)}
                    className="shrink-0 px-3 py-2 rounded-xl bg-[var(--sala-srf)] border border-[var(--sala-brd)] text-left">
                    <span className="text-[var(--sala-txt)] font-mono font-black text-lg tabular-nums">{r.hora}</span>
                    <span className="text-[var(--sala-txt)] font-black text-lg ml-2 tabular-nums">{r.pax}<span className="text-[var(--sala-tx3)] text-xs ml-0.5">pax</span></span>
                    <span className="block text-[var(--sala-tx2)] font-bold text-xs truncate max-w-[140px]">{nombreDe(r)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EncargadoPanel({
  restaurant,
  camarero,
  turnoActivo,
  onClose,
  onAbrirComanda,
  soloConsulta = false,
  tabInicial,
  soloCobros: soloCobrosInicial = false,
}: {
  restaurant: { id: number; nombre: string }
  camarero: { id?: number; nombre: string }
  turnoActivo: Turno | null
  onClose: () => void
  onAbrirComanda?: (comandaId: number) => void
  // Fuera del local: solo lo que se puede mirar desde cualquier lado (reviews y reservas)
  soloConsulta?: boolean
  // Panel del TPV: abrir directamente en una pestaña (los accesos rápidos)
  tabInicial?: TabEncargado
  // Llegando deslizando el mapa desde el último salón: solo el cobro, sin las pestañas de herramientas
  // (es lo que más usa el encargado). Deslizar hacia la derecha vuelve al mapa.
  soloCobros?: boolean
}) {
  const queryClient = useQueryClient()
  const rid = restaurant.id
  const [soloCobros, setSoloCobros] = useState(soloCobrosInicial)
  const swipeCobros = useRef<{ x: number; y: number } | null>(null)
  // Propinas: los turnos cerrados sin repartir (aviso en la pestaña) y el recién cerrado
  const { data: turnosPropina = [] } = useQuery({ queryKey: QK_PROPINAS_ENC, queryFn: api.propinas.encargado.turnos, refetchInterval: 120_000 })
  const sinRepartir = turnosPropina.filter(t => !t.propina).length
  const [propinasTurnoId, setPropinasTurnoId] = useState<number | undefined>(undefined)
  const [repartiendo, setRepartiendo] = useState(false)
  // Lo que sigue a los salones al deslizar, en orden: hacia la izquierda el siguiente, hacia la
  // derecha el anterior (desde el primero, vuelta al mapa)
  const DESLIZAR: TabEncargado[] = ['cobros', 'reservas']
  const [tab, setTab] = useState<TabEncargado>(tabInicial ?? (soloConsulta ? 'reservas' : 'cobros'))
  const { data: agotados = [] } = useQuery({
    queryKey: ['agotados', restaurant.id],
    queryFn: () => api.agotados.list(restaurant.id),
    enabled: !soloConsulta,
  })
  const [armadoCierre, setArmadoCierre] = useState(false)
  const [resumenCierre, setResumenCierre] = useState<Turno | null>(null)
  const [cobroDe, setCobroDe] = useState<Comanda | null>(null)
  const [reservasSub, setReservasSub] = useState<'hoy' | 'pool'>('hoy')
  // Lista de reservas: el día que se mira (‹ Hoy ›) y si se ven las que no vinieron / se cancelaron
  const [fechaReservas, setFechaReservas] = useState(() => diaServicio())
  const [verDescartadas, setVerDescartadas] = useState(false)
  const [enviandoPoolId, setEnviandoPoolId] = useState<number | null>(null)
  const [motivoPool, setMotivoPool] = useState('')
  const [poolError, setPoolError] = useState<{ id: number; msg: string } | null>(null)

  usePoolEvents(rid)

  const { data: reviewsList = [] } = useQuery({
    queryKey: ['reviews-dashboard'],
    queryFn: () => api.reviews.list(),
    enabled: tab === 'reviews',
    refetchInterval: 60_000,
  })
  const reviewData = reviewsList.find(r => r.restaurantId === rid) ?? null

  const { data: reviewHistorial = [] } = useQuery({
    queryKey: ['reviews-historial', rid],
    queryFn: () => api.reviews.historial(rid),
    enabled: tab === 'reviews' && !!reviewData?.activo,
  })

  // Progreso del objetivo — pax y reviews desde que se abrió ESTE turno, no desde las 17:44
  const { data: reviewTurno } = useQuery({
    queryKey: ['reviews-turno', rid, turnoActivo?.id],
    queryFn: () => api.reviews.turno(rid, turnoActivo!.aperturaAt),
    enabled: tab === 'reviews' && !!reviewData?.activo && !!turnoActivo,
    refetchInterval: 60_000,
  })
  const fmtDiaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  const { data: facturadas = [] } = useQuery({
    queryKey: ['enc-cobros', rid, 'facturada'],
    queryFn: () => api.comandas.list(rid, 'facturada'),
    refetchInterval: 15_000,
  })
  const { data: liberadas = [] } = useQuery({
    queryKey: ['enc-cobros', rid, 'liberada'],
    queryFn: () => api.comandas.list(rid, 'liberada'),
    refetchInterval: 15_000,
  })
  const pendientes = [...facturadas, ...liberadas].filter(c => c.items.length > 0)
  const totalDe = (c: Comanda) => totalComanda(c.items)

  const { data: comandasActivas = [] } = useQuery({
    queryKey: ['comandas-sala', rid],
    queryFn: () => api.comandas.list(rid),
  })
  const mesasAbiertas = comandasActivas.filter(c => c.estado === 'abierta' || c.estado === 'enviada').length

  const abrirTurno = useMutation({
    mutationFn: () => api.turnos.abrir(rid, camarero.nombre),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turno-activo', rid] }),
  })
  const cerrarTurno = useMutation({
    mutationFn: (forzar: boolean) => api.turnos.cerrar(turnoActivo!.id, forzar),
    onSuccess: t => {
      setArmadoCierre(false)
      setResumenCierre(t)
      queryClient.invalidateQueries({ queryKey: ['turno-activo', rid] })
      queryClient.invalidateQueries({ queryKey: QK_PROPINAS_ENC })
    },
  })

  const { data: sectores = [] } = useQuery({
    queryKey: ['enc-checklists', rid],
    queryFn: () => api.checklists.contenido(rid),
    enabled: tab === 'checklists',
    refetchInterval: 60_000,
  })

  const hoy = new Date()
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const { data: mermasHoy } = useQuery({
    queryKey: ['enc-mermas', rid, hoyStr],
    queryFn: () => api.mermas.list(rid, hoyStr, hoyStr),
    enabled: tab === 'mermas',
    refetchInterval: 60_000,
  })
  const totalMermas = (mermasHoy?.mermas ?? []).reduce((s, m) => s + (m.precio ?? 0) * m.cantidad, 0)

  // ── Reservas + pool entre restaurantes ──
  // "Hoy" solo se pide al abrir esa sub-vista; el pool se pide siempre para el badge de la pestaña (como Cobros)
  const { data: reservasHoy = [] } = useQuery({
    queryKey: ['reservas', rid, fechaReservas],
    queryFn: () => api.reservas.list(rid, fechaReservas),
    enabled: tab === 'reservas' && reservasSub === 'hoy',
    refetchInterval: 30_000,
  })
  const { data: pool = [] } = useQuery({
    queryKey: ['reservas-pool'],
    queryFn: () => api.reservas.poolList(),
    refetchInterval: 30_000,
  })

  const invalidarReservas = () => {
    queryClient.invalidateQueries({ queryKey: ['reservas', rid] })
    queryClient.invalidateQueries({ queryKey: ['reservas-pool'] })
  }

  // No vino / canceló / volver a por llegar
  const estadoReservaMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: 'confirmada' | 'cancelada' | 'no_show' }) => api.reservas.updateEstado(id, estado),
    onSuccess: invalidarReservas,
  })
  const poolEnviarMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) => api.reservas.poolEnviar(id, motivo),
    onSuccess: () => { invalidarReservas(); setEnviandoPoolId(null); setMotivoPool('') },
  })
  const poolCancelarMut = useMutation({
    mutationFn: (id: number) => api.reservas.poolCancelar(id),
    onSuccess: invalidarReservas,
  })
  const gestionarPoolMut = useMutation({
    mutationFn: (id: number) => api.reservas.poolGestionar(id, camarero.nombre),
    onSuccess: () => { setPoolError(null); queryClient.invalidateQueries({ queryKey: ['reservas-pool'] }) },
    onError: (e: Error, id) => setPoolError({ id, msg: e.message }),
  })
  const liberarPoolMut = useMutation({
    mutationFn: (id: number) => api.reservas.poolLiberar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservas-pool'] }),
  })
  const tomarPoolMut = useMutation({
    mutationFn: (id: number) => api.reservas.poolTomar(id, rid, camarero.nombre),
    onSuccess: () => { setPoolError(null); invalidarReservas() },
    onError: (e: Error, id) => setPoolError({ id, msg: e.message }),
  })

  // Asignar mesa (informativo) + sentar (activa la mesa con el pax de la reserva)
  const { data: planesReserva } = useQuery({
    queryKey: ['salon-planes', rid],
    queryFn: () => api.salon.list(rid),
    enabled: tab === 'reservas' && reservasSub === 'hoy',
  })
  const mesasReserva = (planesReserva ?? []).flatMap(p => p.mesas.map(m => ({ ...m, planNombre: p.nombre })))
  // Plano de reservas: abierto (con la reserva a la que se le busca mesa, si se abrió desde "Asignar mesa")
  const [plano, setPlano] = useState<{ reservaId?: number; fecha?: string } | null>(null)
  const [sentarError, setSentarError] = useState<{ id: number; msg: string } | null>(null)

  const sentarMut = useMutation({
    mutationFn: ({ id, mesaId }: { id: number; mesaId?: number }) => api.reservas.sentar(id, mesaId, camarero.nombre),
    // Sentar no abre la mesa: la tarjeta pasa a "✅ Sentados · Mesa X" con su "Ver mesa"
    onSuccess: () => {
      setSentarError(null)
      invalidarReservas()
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', rid] })
    },
    onError: (e: Error, { id }) => setSentarError({ id, msg: e.message }),
  })

  const TABS = [
    { key: 'cobros' as const, icon: '💶', label: 'Cobros', badge: pendientes.length },
    { key: 'turno' as const, icon: '⏱', label: 'Turno', badge: 0 },
    { key: 'agotados' as const, icon: '🚫', label: 'Agotados', badge: agotados.length },
    { key: 'gastos' as const, icon: '🥖', label: 'Gastos', badge: 0 },
    { key: 'checklists' as const, icon: '✅', label: 'Checklists', badge: 0 },
    { key: 'mermas' as const, icon: '🗑', label: 'Mermas', badge: 0 },
    { key: 'reservas' as const, icon: '📅', label: 'Reservas', badge: pool.length },
    { key: 'reviews' as const, icon: '⭐', label: 'Reviews', badge: 0 },
    { key: 'facturas' as const, icon: '🧾', label: 'Facturas', badge: 0 },
    { key: 'propinas' as const, icon: '💰', label: 'Propinas', badge: sinRepartir },
  ]

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      {plano && <PlanoReservas restaurantId={rid} reservaInicial={plano.reservaId} fechaInicial={plano.fecha ?? fechaReservas} camareroNombre={camarero.nombre} onClose={() => setPlano(null)} />}
      <div className="relative w-full sm:max-w-md bg-[var(--sala-hdr)] h-full flex flex-col shadow-2xl border-l border-[var(--sala-brd)]" onClick={e => e.stopPropagation()}
        onTouchStart={e => { if (soloCobros) swipeCobros.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const ini = swipeCobros.current
          swipeCobros.current = null
          if (!ini || !soloCobros || cobroDe) return
          const dx = e.changedTouches[0].clientX - ini.x, dy = e.changedTouches[0].clientY - ini.y
          const th = swipeThresholds()
          if (Math.abs(dx) < th.dx || Math.abs(dy) > th.dy) return
          const i = DESLIZAR.indexOf(tab)
          const destino = DESLIZAR[i + (dx < 0 ? 1 : -1)]
          if (destino) setTab(destino)
          else if (dx > 0) onClose()
        }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-start justify-between">
            {repartiendo ? (
              <div>
                <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">💼 {camarero.nombre}</p>
                <h2 className="text-[var(--sala-txt)] font-black text-2xl">💰 Repartir propinas</h2>
              </div>
            ) : soloCobros ? (
              <div>
                <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">
                  {tab === 'reservas' ? `Reservas de hoy${pool.length ? ` · ${pool.length} en el pool` : ''}` : `${pendientes.length} por cobrar`}
                </p>
                <h2 className="text-[var(--sala-txt)] font-black text-2xl">{tab === 'reservas' ? '📅 Reservas' : '💶 Cobros'}</h2>
                {/* En qué paso del deslizamiento estás */}
                <div className="flex gap-1.5 mt-1.5">
                  {DESLIZAR.map(t => (
                    <button key={t} onClick={() => setTab(t)} aria-label={t}
                      className={`h-1.5 rounded-full transition-all ${tab === t ? 'w-5 bg-[#4CC8A0]' : 'w-1.5 bg-[var(--sala-tx4)]'}`} />
                  ))}
                </div>
              </div>
            ) : (
            <div>
              <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">💼 Modo encargado</p>
              <h2 className="text-[var(--sala-txt)] font-bold text-xl">{camarero.nombre}</h2>
            </div>
            )}
            <div className="flex items-center gap-4">
              <RelojSala />
              <button onClick={onClose} className="text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-xl">✕</button>
            </div>
          </div>
          {repartiendo ? null : soloCobros ? (
            <button onClick={() => setSoloCobros(false)}
              className="mt-2 text-[var(--sala-tx3)] text-xs font-semibold underline underline-offset-2">
              💼 Ver las demás herramientas
            </button>
          ) : (
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            {TABS.filter(t => !soloConsulta || t.key === 'reviews' || t.key === 'reservas' || t.key === 'propinas').map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[11px] font-bold transition-colors ${
                  tab === t.key ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'
                }`}>
                <span className="text-base leading-none">{t.icon}</span>
                <span className="truncate max-w-full px-1">{t.label}</span>
                {t.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-[var(--sala-txt)] text-[10px] font-black">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* ── Cobros pendientes ── */}
          {tab === 'cobros' && (
            <>
              {pendientes.length === 0 && (
                <p className="text-center text-[var(--sala-tx4)] text-sm py-10">No hay mesas pendientes de cobro 👌</p>
              )}
              {pendientes.map(c => (
                <div key={c.id} className="bg-[var(--sala-srf)] rounded-xl p-4">
                  {/* Zona clickeable: abre la vista completa de la mesa (mermas, invitaciones, cuenta…) */}
                  <button type="button" onClick={() => onAbrirComanda?.(c.id)}
                    title="Ver la mesa completa (items, mermas…)"
                    className="w-full flex items-center justify-between mb-2 text-left active:scale-[0.99] transition-transform">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 rounded-xl px-4 py-2 flex flex-col items-center justify-center text-white"
                        style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none">Mesa</span>
                        <span className="text-4xl font-black tabular-nums leading-none mt-0.5">{c.mesa.numero}</span>
                      </div>
                      <div className="shrink-0 rounded-xl px-3 py-2 flex flex-col items-center justify-center bg-amber-500/15 border border-amber-500/40">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 leading-none">Abierta</span>
                        <span className="text-2xl font-black tabular-nums leading-none mt-0.5 text-amber-400">{fmtHora(c.createdAt)}</span>
                        <span className="text-[10px] font-bold text-amber-500/80 leading-none mt-0.5">hace {transcurrido(c.createdAt)}</span>
                      </div>
                      <p className="text-[var(--sala-tx3)] text-xs min-w-0">
                        {c.pax} PAX · {c.items.length} items<br />
                        {c.estado === 'facturada' ? '🧾 Cuenta impresa' : '🔓 Mesa liberada'}
                      </p>
                    </div>
                    <span className="text-[#4CC8A0] font-black text-2xl tabular-nums shrink-0">{totalDe(c).toFixed(2)} €</span>
                  </button>
                  {c.cuentaDesactualizada ? (
                    <button
                      onClick={() => onAbrirComanda?.(c.id)}
                      className="w-full py-2.5 rounded-xl bg-amber-500/20 border-2 border-amber-500 text-amber-400 text-sm font-black active:scale-95 transition-transform">
                      ⚠️ El total cambió — reimprimir cuenta
                    </button>
                  ) : (
                    <button
                      onClick={() => setCobroDe(c)}
                      className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-sm font-black active:scale-95 transition-transform hover:bg-amber-400">
                      Cobrar mesa
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ── Turno ── */}
          {tab === 'turno' && (
            <div className="space-y-3">
              {resumenCierre ? (
                <div className="bg-[var(--sala-srf)] rounded-xl p-5 space-y-2">
                  <p className="text-[#4CC8A0] font-black text-lg">✓ Turno cerrado</p>
                  {[
                    ['Ventas', resumenCierre.totalVentas],
                    ['Efectivo', resumenCierre.totalEfectivo],
                    ['Tarjeta', resumenCierre.totalTarjeta],
                    ['Mermas', resumenCierre.totalMermas],
                    ['🎁 Invitaciones', resumenCierre.totalInvitaciones],
                    ['🥖 Gastos en efectivo', resumenCierre.totalGastos],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-sm">
                      <span className="text-[var(--sala-tx3)]">{label}</span>
                      <span className="text-[var(--sala-txt)] font-bold tabular-nums">{Number(val ?? 0).toFixed(2)} €</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--sala-tx3)]">Comandas</span>
                    <span className="text-[var(--sala-txt)] font-bold">{resumenCierre.numComandas ?? 0}</span>
                  </div>
                  {!!resumenCierre.reservasNoVinieron && (
                    <p className="text-amber-500 text-xs font-bold pt-1">
                      📅 {resumenCierre.reservasNoVinieron === 1 ? '1 reserva quedó' : `${resumenCierre.reservasNoVinieron} reservas quedaron`} como "No vino" (se deshace en 📅 Reservas)
                    </p>
                  )}
                  {/* Cerrado el turno, toca repartir: se puede ahora o después desde el teléfono (💰 Propinas) */}
                  <button onClick={() => { setPropinasTurnoId(resumenCierre.id); setTab('propinas') }}
                    className="w-full mt-3 py-3.5 rounded-xl text-white font-black active:scale-[0.98] transition-transform"
                    style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                    💰 Repartir propinas
                  </button>
                  <p className="text-[var(--sala-tx3)] text-xs text-center">También después, desde el teléfono: 💼 → 💰 Propinas</p>
                </div>
              ) : turnoActivo ? (
                <>
                  <div className="bg-[var(--sala-srf)] rounded-xl p-5">
                    <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wider mb-1">Turno abierto</p>
                    <p className="text-[var(--sala-txt)] font-bold text-lg">
                      {turnoActivo.encargadoNombre ? `👤 ${turnoActivo.encargadoNombre}` : 'Sin encargado asignado'}
                    </p>
                    <p className="text-[var(--sala-tx2)] text-sm mt-1">
                      Desde las {fmtHora(turnoActivo.aperturaAt)} · lleva {transcurrido(turnoActivo.aperturaAt)}
                    </p>
                  </div>
                  {(mesasAbiertas > 0 || pendientes.length > 0) && (
                    <div className="bg-amber-500/10 rounded-xl px-4 py-3">
                      <p className="text-amber-400 text-xs font-bold">
                        ⚠️ Antes de cerrar: {mesasAbiertas > 0 ? `${mesasAbiertas} mesa${mesasAbiertas > 1 ? 's' : ''} activa${mesasAbiertas > 1 ? 's' : ''}` : ''}
                        {mesasAbiertas > 0 && pendientes.length > 0 ? ' y ' : ''}
                        {pendientes.length > 0 ? `${pendientes.length} pendiente${pendientes.length > 1 ? 's' : ''} de cobro` : ''}
                      </p>
                    </div>
                  )}
                  {cerrarTurno.error instanceof Error && (
                    <div className="bg-red-500/10 rounded-xl px-4 py-3">
                      <p className="text-red-400 text-xs font-bold">{cerrarTurno.error.message}</p>
                    </div>
                  )}
                  {armadoCierre ? (
                    <div className="flex gap-2">
                      <button onClick={() => { setArmadoCierre(false); cerrarTurno.reset() }}
                        className="flex-1 py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
                        Cancelar
                      </button>
                      <button onClick={() => cerrarTurno.mutate(esAvisoBox(cerrarTurno.error))} disabled={cerrarTurno.isPending}
                        className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-black active:scale-95 transition-transform disabled:opacity-50">
                        {cerrarTurno.isPending ? 'Cerrando…' : esAvisoBox(cerrarTurno.error) ? 'Cerrar igual' : '¿Seguro? Cerrar turno'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setArmadoCierre(true)}
                      className="w-full py-3 rounded-xl bg-red-600/80 text-white text-sm font-bold active:scale-95 transition-transform">
                      🔒 Cerrar turno
                    </button>
                  )}
                </>
              ) : (
                <button onClick={() => abrirTurno.mutate()} disabled={abrirTurno.isPending}
                  className="w-full py-4 rounded-xl text-white font-black text-base active:scale-95 transition-transform disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                  {abrirTurno.isPending ? 'Abriendo…' : `▶ Abrir turno como ${camarero.nombre}`}
                </button>
              )}
            </div>
          )}

          {/* ── Checklists de hoy ── */}
          {tab === 'checklists' && (
            <>
              {sectores.length === 0 && (
                <p className="text-center text-[var(--sala-tx4)] text-sm py-10">Este restaurante no tiene checklists configurados</p>
              )}
              {sectores.map(sector => (
                <div key={sector.id} className="bg-[var(--sala-srf)] rounded-xl p-4">
                  <p className="text-[var(--sala-txt)] font-bold text-sm mb-2">{sector.nombre}</p>
                  <div className="flex flex-col gap-1.5">
                    {(['apertura', 'cierre'] as const).map(momento => {
                      const ej = (sector.ejecuciones ?? []).find(e => e.momento === momento)
                      const totalItems = (sector.items ?? []).filter(i => i.momento === momento).length
                      if (!ej) return (
                        <div key={momento} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--sala-btn2)]/50">
                          <span className="text-[var(--sala-tx3)] text-xs font-semibold">{momento === 'apertura' ? '🔓 Apertura' : '🔒 Cierre'}</span>
                          <span className="text-[var(--sala-tx4)] text-xs">Pendiente</span>
                        </div>
                      )
                      const marcados = ej.itemsMarcados.filter(m => m.marcado).length
                      const completo = marcados === ej.itemsMarcados.length
                      return (
                        <div key={momento} className={`flex items-center justify-between px-3 py-2 rounded-lg ${completo ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                          <span className={`text-xs font-semibold ${completo ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {momento === 'apertura' ? '🔓 Apertura' : '🔒 Cierre'} {completo ? '✓' : '⚠️'}
                          </span>
                          <span className="text-[var(--sala-tx2)] text-xs">
                            {ej.completadoPor} · {fmtHora(ej.fecha)} · {marcados}/{ej.itemsMarcados.length || totalItems}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Facturas de proveedor ── */}
          {tab === 'gastos' && <GastosSala restaurantId={rid} />}
          {tab === 'facturas' && <FacturasSala restaurantId={rid} empleadoId={camarero.id} />}
          {tab === 'propinas' && <PropinasSala key={propinasTurnoId ?? 0} turnoInicialId={propinasTurnoId} onEnfoque={setRepartiendo} />}

          {tab === 'agotados' && <AgotadosSala restaurantId={rid} agotados={agotados} />}

          {/* ── Mermas de hoy ── */}
          {tab === 'mermas' && (
            <>
              <div className="bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-[var(--sala-tx2)] text-sm font-semibold">Mermas de hoy</span>
                <span className="text-red-400 font-black tabular-nums">{totalMermas.toFixed(2)} €</span>
              </div>
              {(mermasHoy?.mermas ?? []).length === 0 && (
                <p className="text-center text-[var(--sala-tx4)] text-sm py-10">Sin mermas hoy 👌</p>
              )}
              {(mermasHoy?.mermas ?? []).map(m => (
                <div key={m.id} className="bg-[var(--sala-srf)] rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[var(--sala-txt)] text-sm font-bold">
                      {m.cantidad > 1 ? `${m.cantidad}× ` : ''}{m.itemNombre}
                    </p>
                    <span className="text-[var(--sala-tx2)] text-sm font-bold tabular-nums">{((m.precio ?? 0) * m.cantidad).toFixed(2)} €</span>
                  </div>
                  <p className="text-[var(--sala-tx3)] text-xs mt-0.5">
                    {MOTIVO_MERMA_LABEL[m.motivo] ?? m.motivo}
                    {m.mesaNumero ? ` · Mesa ${m.mesaNumero}` : ''}
                    {m.camareroNombre ? ` · ${m.camareroNombre}` : ''}
                    {' · '}{fmtHora(m.createdAt)}
                    {m.descripcion ? ` — ${m.descripcion}` : ''}
                  </p>
                </div>
              ))}
            </>
          )}

          {/* ── Reservas de hoy + pool entre restaurantes ── */}
          {tab === 'reservas' && (
            <>
              <div className="flex gap-1.5 mb-1">
                <button onClick={() => setReservasSub('hoy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${reservasSub === 'hoy' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
                  📋 Lista
                </button>
                <button onClick={() => setReservasSub('pool')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${reservasSub === 'pool' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
                  🔄 Pool{pool.length ? ` (${pool.length})` : ''}
                </button>
                <button onClick={() => setPlano({ fecha: fechaReservas })}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--sala-btn2)] text-[var(--sala-txt)]">
                  🗺 Plano
                </button>
              </div>

              {reservasSub === 'hoy' ? (() => {
                const esHoy = fechaReservas === diaServicio()
                const numMesa = (id: number | null) => id ? (mesasReserva.find(m => m.id === id)?.numero ?? id) : null
                const porLlegar = reservasHoy.filter(r => r.estado === 'confirmada')
                const sentadas = reservasHoy.filter(r => r.estado === 'sentada')
                const descartadas = reservasHoy.filter(r => r.estado === 'cancelada' || r.estado === 'no_show')
                const reservasVivas = [...porLlegar, ...sentadas.filter(r => r.origen !== 'walkin')]
                const sinMesa = porLlegar.filter(r => !r.mesaId && !r.enPool).length
                const moverDia = (n: number) => { const d = new Date(fechaReservas + 'T12:00:00'); d.setDate(d.getDate() + n); setFechaReservas(fechaLocal(d)) }
                const manana = diaServicio(1)
                const etiquetaDia = esHoy ? 'Hoy' : fechaReservas === manana ? 'Mañana'
                  : new Date(fechaReservas + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
                const titulo = (t: string, n: number) => (
                  <p className="text-[var(--sala-tx3)] text-[11px] font-black uppercase tracking-wider px-1 pt-2">{t} · {n}</p>
                )

                const tarjeta = (r: Reserva) => {
                  const walkin = r.origen === 'walkin'
                  const faltan = esHoy && r.estado === 'confirmada' ? minutosHasta(r.hora) : null
                  const nivel = faltan !== null ? nivelReserva(r.hora, minutosAhora())?.nivel : undefined
                  const tarde = nivel === 'tarde'
                  const pronto = nivel === 'proxima' || nivel === 'llega'
                  const descartada = r.estado === 'cancelada' || r.estado === 'no_show'
                  const borde = descartada ? 'border-[var(--sala-brd)]' : r.estado === 'sentada' ? 'border-emerald-500'
                    : tarde ? 'border-red-500' : pronto ? 'border-amber-400' : 'border-sky-400'
                  const mesa = numMesa(r.mesaId)
                  return (
                    <div key={r.id} className={`flex rounded-2xl overflow-hidden bg-[var(--sala-srf)] border-l-4 ${borde} ${descartada ? 'opacity-60' : ''}`}>
                      <BloqueHoraPax hora={r.hora} pax={r.pax} walkin={walkin}
                        tono={tarde ? 'text-red-500' : pronto ? 'text-amber-500' : undefined} />
                      <div className="flex-1 min-w-0 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 min-w-0 text-[var(--sala-txt)] font-black text-base leading-tight truncate">{walkin ? 'Walk-in' : r.nombre}</p>
                          {tarde && <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[11px] font-black">⏰ {-faltan!} min tarde</span>}
                          {pronto && <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-500 text-[11px] font-black">{faltan! <= 0 ? 'Ya es la hora' : `en ${faltan} min`}</span>}
                          {r.estado === 'sentada' && <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[11px] font-black">✓ Mesa {mesa ?? '?'}</span>}
                          {r.estado === 'no_show' && <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 text-[11px] font-black">No vino</span>}
                          {r.estado === 'cancelada' && <span className="shrink-0 px-2 py-0.5 rounded-full bg-[var(--sala-btn2)] text-[var(--sala-tx3)] text-[11px] font-black">Cancelada</span>}
                          {r.enPool && <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-500 text-[11px] font-black">🔄 En el pool</span>}
                        </div>
                        {r.notas && <p className="px-2 py-1 rounded-lg bg-amber-400/10 text-amber-500 text-sm font-bold">📝 {r.notas}</p>}
                        {r.telefono && !descartada && r.estado !== 'sentada' && <ContactoReserva telefono={r.telefono} />}

                        {/* Acciones según el estado */}
                        {r.enPool ? (
                          <button onClick={() => poolCancelarMut.mutate(r.id)}
                            className="h-9 px-3 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-bold">Sacar del pool</button>
                        ) : r.estado === 'sentada' ? (
                          r.comandaId ? <button onClick={() => onAbrirComanda?.(r.comandaId!)}
                            className="h-9 px-3 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx1)] text-sm font-bold">Ver mesa ›</button> : null
                        ) : descartada ? (
                          <button onClick={() => estadoReservaMut.mutate({ id: r.id, estado: 'confirmada' })}
                            className="h-9 px-3 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx1)] text-sm font-bold">↩ Volver a por llegar</button>
                        ) : (
                          <>
                            <div className="flex gap-2">
                              {mesa && esHoy ? (
                                <>
                                  <button onClick={() => sentarMut.mutate({ id: r.id, mesaId: r.mesaId! })} disabled={sentarMut.isPending}
                                    className="flex-1 h-11 rounded-xl text-white text-base font-black disabled:opacity-50 active:scale-[0.98] transition-transform"
                                    style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
                                    {sentarMut.isPending && sentarMut.variables?.id === r.id ? 'Sentando…' : `✅ Sentar en ${mesa}`}
                                  </button>
                                  <button onClick={() => setPlano({ reservaId: r.id, fecha: fechaReservas })} title="Cambiar de mesa"
                                    className="h-11 px-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx1)] text-sm font-bold">🪑 Cambiar</button>
                                </>
                              ) : (
                                <button onClick={() => setPlano({ reservaId: r.id, fecha: fechaReservas })}
                                  className={`flex-1 h-11 rounded-xl text-base font-black active:scale-[0.98] transition-transform ${mesa ? 'bg-[var(--sala-btn2)] text-[var(--sala-txt)]' : 'bg-sky-500/15 text-sky-500 border-2 border-sky-400/50'}`}>
                                  {mesa ? `🪑 Mesa ${mesa} · cambiar` : '🪑 Elegir mesa'}
                                </button>
                              )}
                            </div>
                            {sentarError?.id === r.id && <p className="text-red-400 text-xs font-bold">{sentarError.msg}</p>}
                            {enviandoPoolId === r.id ? (
                              <div className="space-y-2">
                                <input value={motivoPool} onChange={e => setMotivoPool(e.target.value)} autoFocus
                                  placeholder="¿Por qué no entra? (opcional)"
                                  className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] placeholder-[var(--sala-tx4)] rounded-lg px-3 py-2 text-sm outline-none" />
                                <div className="flex gap-2">
                                  <button onClick={() => poolEnviarMut.mutate({ id: r.id, motivo: motivoPool || undefined })} disabled={poolEnviarMut.isPending}
                                    className="h-9 px-3 rounded-lg bg-[var(--sala-btna)] text-[var(--sala-txt)] text-sm font-bold disabled:opacity-50">
                                    {poolEnviarMut.isPending ? 'Enviando…' : 'Ofrecer a los otros locales'}
                                  </button>
                                  <button onClick={() => { setEnviandoPoolId(null); setMotivoPool('') }}
                                    className="h-9 px-3 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-bold">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-1.5 flex-wrap">
                                {esHoy && faltan !== null && faltan <= 0 && (
                                  <button onClick={() => estadoReservaMut.mutate({ id: r.id, estado: 'no_show' })}
                                    className="h-8 px-2.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold">🚫 No vino</button>
                                )}
                                <button onClick={() => estadoReservaMut.mutate({ id: r.id, estado: 'cancelada' })}
                                  className="h-8 px-2.5 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx3)] text-xs font-bold">✕ Canceló</button>
                                <button onClick={() => setEnviandoPoolId(r.id)}
                                  className="h-8 px-2.5 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx3)] text-xs font-bold">🔄 Al pool</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                }

                return (
                  <>
                    {/* Día */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => moverDia(-1)} className="w-10 h-10 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-lg font-black">‹</button>
                      <button onClick={() => setFechaReservas(diaServicio())}
                        className="flex-1 h-10 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-black capitalize">{etiquetaDia}</button>
                      <button onClick={() => moverDia(1)} className="w-10 h-10 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-lg font-black">›</button>
                    </div>

                    {/* Resumen del día */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { n: reservasVivas.length, t: 'reservas' },
                        { n: reservasVivas.reduce((s, r) => s + r.pax, 0), t: 'pax' },
                        { n: sentadas.length, t: 'sentadas' },
                        { n: sinMesa, t: 'sin mesa', aviso: sinMesa > 0 },
                      ].map(c => (
                        <button key={c.t} onClick={c.t === 'sin mesa' && sinMesa ? () => setPlano({ fecha: fechaReservas }) : undefined}
                          className={`rounded-xl py-2 text-center ${c.aviso ? 'bg-amber-400/15' : 'bg-[var(--sala-srf)]'}`}>
                          <p className={`font-black text-2xl leading-none tabular-nums ${c.aviso ? 'text-amber-500' : 'text-[var(--sala-txt)]'}`}>{c.n}</p>
                          <p className="text-[var(--sala-tx3)] text-[10px] font-bold uppercase tracking-wide mt-1">{c.t}</p>
                        </button>
                      ))}
                    </div>

                    {reservasHoy.length === 0 && (
                      <p className="text-center text-[var(--sala-tx4)] text-sm py-10">No hay reservas {esHoy ? 'para hoy' : 'ese día'}</p>
                    )}
                    {porLlegar.length > 0 && <>{titulo('Por llegar', porLlegar.length)}{porLlegar.map(tarjeta)}</>}
                    {sentadas.length > 0 && <>{titulo('Sentadas', sentadas.length)}{sentadas.map(tarjeta)}</>}
                    {descartadas.length > 0 && (
                      <>
                        <button onClick={() => setVerDescartadas(v => !v)}
                          className="w-full text-left text-[var(--sala-tx3)] text-[11px] font-black uppercase tracking-wider px-1 pt-2">
                          {verDescartadas ? '▾' : '▸'} No vinieron / canceladas · {descartadas.length}
                        </button>
                        {verDescartadas && descartadas.map(tarjeta)}
                      </>
                    )}
                  </>
                )
              })() : (
                <>
                  <p className="text-[var(--sala-tx3)] text-xs px-1 mb-1">
                    Reservas que otros restaurantes no pudieron aceptar. Llamá, confirmá con el cliente y tomala para {restaurant.nombre}.
                  </p>
                  {pool.length === 0 && (
                    <p className="text-center text-[var(--sala-tx4)] text-sm py-10">No hay reservas en el pool ahora mismo</p>
                  )}
                  {pool.map(r => {
                    const locked = lockActivoPool(r)
                    const esMiLock = locked && r.poolGestionandoPor === camarero.nombre
                    const errorAqui = poolError?.id === r.id ? poolError.msg : null
                    return (
                      <div key={r.id} className="flex rounded-2xl overflow-hidden bg-[var(--sala-srf)] border-l-4 border-amber-400">
                        <BloqueHoraPax hora={r.hora} pax={r.pax} />
                        <div className="flex-1 min-w-0 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 min-w-0 text-[var(--sala-txt)] font-black text-base leading-tight truncate">{r.nombre}</p>
                          <span className="shrink-0 text-[11px] font-black px-2 py-0.5 rounded-full bg-[var(--sala-btn2)] text-[var(--sala-tx3)] whitespace-nowrap">
                            de {r.restaurant?.nombre ?? '?'}
                          </span>
                        </div>
                        <p className="text-[var(--sala-tx3)] text-xs font-bold capitalize">{new Date(r.fecha.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                        {r.notas && <p className="px-2 py-1 rounded-lg bg-amber-400/10 text-amber-500 text-sm font-bold">📝 {r.notas}</p>}
                        {r.poolMotivo && <p className="text-[var(--sala-tx3)] text-xs italic">“{r.poolMotivo}”</p>}
                        {r.telefono && <ContactoReserva telefono={r.telefono} />}

                        <div>
                          {locked && !esMiLock && (
                            <p className="text-amber-400 text-xs font-bold">🔒 {r.poolGestionandoPor} la está gestionando</p>
                          )}
                          {!locked && (
                            <button onClick={() => gestionarPoolMut.mutate(r.id)} disabled={gestionarPoolMut.isPending}
                              className="px-3 py-1.5 rounded-lg bg-[var(--sala-btna)] text-[var(--sala-txt)] text-xs font-bold disabled:opacity-50">
                              📞 Voy a gestionarla
                            </button>
                          )}
                          {esMiLock && (
                            <div className="flex gap-2">
                              <button onClick={() => tomarPoolMut.mutate(r.id)} disabled={tomarPoolMut.isPending}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">
                                {tomarPoolMut.isPending ? 'Tomando...' : `✓ Cliente confirmó, tomar`}
                              </button>
                              <button onClick={() => liberarPoolMut.mutate(r.id)}
                                className="px-3 py-1.5 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-xs font-bold">
                                Soltar
                              </button>
                            </div>
                          )}
                          {errorAqui && <p className="text-red-400 text-xs font-bold mt-1.5">{errorAqui}</p>}
                        </div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}

          {/* ── Google Reviews en vivo ── */}
          {tab === 'reviews' && (
            <div className="space-y-3">
              {!reviewData?.activo ? (
                <p className="text-center text-[var(--sala-tx4)] text-sm py-6">La consulta automática de reviews no está activada para este restaurante</p>
              ) : (
                <>
                  <div className="bg-[var(--sala-srf)] rounded-3xl p-6 text-center">
                    <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wider">Reviews nuevas</p>

                    {reviewData?.fecha ? (
                      <>
                        <p className={`font-black text-8xl leading-none my-2 tabular-nums ${reviewData.diff && reviewData.diff > 0 ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx3)]'}`}>
                          {reviewData.diff !== null ? (reviewData.diff > 0 ? `+${reviewData.diff}` : reviewData.diff) : '—'}
                        </p>
                        <p className="text-[var(--sala-tx2)] text-sm">
                          {reviewData.ventanaInicio ? `desde ${fmtDiaHora(reviewData.ventanaInicio)}` : ''} · última consulta {fmtHora(reviewData.fecha)}
                        </p>
                        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-[var(--sala-brd)]">
                          <span className="text-[var(--sala-tx1)] text-sm font-bold">{reviewData.total} total</span>
                          <div className="flex items-center gap-1">
                            <span className="text-amber-400">★</span>
                            <span className="text-[var(--sala-tx1)] text-sm font-bold">{reviewData.rating?.toFixed(1)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-[var(--sala-tx4)] text-sm py-6">Todavía no hay ninguna consulta registrada</p>
                    )}
                  </div>

                  {reviewTurno?.objetivo !== null && reviewTurno?.objetivo !== undefined && reviewTurno.diff !== null && (
                    <div className="bg-[var(--sala-srf)] rounded-2xl p-4">
                      {(() => {
                        const pct = Math.min(100, Math.round((reviewTurno.diff! / reviewTurno.objetivo!) * 100))
                        return (
                          <>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wider">Cómo va el turno</span>
                              <span className={`text-xs font-bold ${pct >= 100 ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx2)]'}`}>{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-[#4CC8A0]' : 'bg-[#4B9EDF]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-[var(--sala-tx3)] text-xs mt-1.5">
                              {reviewTurno.diff} / {reviewTurno.objetivo} reviews ({reviewTurno.pax} pax en este turno)
                            </p>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {reviewData && reviewData.negativasNuevas.length > 0 && (
                    <div className="space-y-2">
                      {reviewData.negativasNuevas.map((n, i) => (
                        <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3">
                          <p className="text-sm font-bold text-red-400">
                            {'★'.repeat(n.rating)}{'☆'.repeat(5 - n.rating)} · {n.author}
                          </p>
                          {n.text && <p className="text-xs text-red-300 mt-1">"{n.text}"</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {reviewData?.posibleOculta && (
                    <p className="text-center text-amber-400 text-xs">
                      ⚠️ Entraron más reviews de las que se pueden mostrar en detalle — revisá Google Maps directamente
                    </p>
                  )}

                  {reviewHistorial.length > 0 && (
                    <div className="bg-[var(--sala-srf)] rounded-2xl p-4">
                      <p className="text-[var(--sala-tx3)] text-xs font-semibold uppercase tracking-wider mb-2">Días anteriores</p>
                      <div className="space-y-1.5">
                        {reviewHistorial.map(h => (
                          <div key={h.fecha} className="flex items-center justify-between text-sm">
                            <span className="text-[var(--sala-tx2)]">{fmtDia(h.fecha)}</span>
                            <span className={`font-bold tabular-nums ${h.diff > 0 ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx3)]'}`}>
                              {h.diff > 0 ? `+${h.diff}` : h.diff}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Sheet de cobro (mismo flujo que el dashboard) */}
        {cobroDe && (
          <CobroSheet comanda={cobroDe} onClose={() => setCobroDe(null)} />
        )}
      </div>
    </div>
  )
}

type TabEncargado = 'cobros' | 'turno' | 'agotados' | 'checklists' | 'mermas' | 'reviews' | 'reservas' | 'facturas' | 'gastos' | 'propinas'

// ── Panel del encargado en el puesto TPV ─────────────────────────────────────
// Lo primero que ve un encargado en la tablet (el camarero va al mapa): todas las mesas en
// tarjetas, ordenadas por urgencia (por cobrar → en servicio, la que más lleva arriba → sin
// comandar), con sus horas, total y avisos; y a la derecha los accesos a las pestañas del 💼.
// Todo sale de lo que la sala ya recibe; se actualiza solo por SSE como el mapa.
const ACCESOS_ENCARGADO: { tab: TabEncargado; icono: string; nombre: string }[] = [
  { tab: 'cobros', icono: '💶', nombre: 'Cobros' }, { tab: 'turno', icono: '⏱', nombre: 'Turno' },
  { tab: 'gastos', icono: '🥖', nombre: 'Gastos' }, { tab: 'agotados', icono: '🚫', nombre: 'Agotados' },
  { tab: 'mermas', icono: '🗑', nombre: 'Mermas' }, { tab: 'reservas', icono: '📅', nombre: 'Reservas' },
  { tab: 'reviews', icono: '⭐', nombre: 'Reviews' }, { tab: 'checklists', icono: '✅', nombre: 'Checklists' },
  { tab: 'facturas', icono: '🧾', nombre: 'Facturas' }, { tab: 'propinas', icono: '💰', nombre: 'Propinas' },
]
function PanelEncargadoTpv({ restaurantId, comandas, turnoActivo, onAbrirMesa, onCobrar, onAcceso }: {
  restaurantId: number
  comandas: Comanda[]
  turnoActivo: Turno | null
  onAbrirMesa: (comandaId: number) => void
  onCobrar: (comanda: Comanda) => void
  onAcceso: (tab: TabEncargado) => void
}) {
  const isDark = useContext(ThemeCtx)
  // La lista normal no trae las liberadas (mesa ya libre, cuenta sin cobrar)
  const { data: liberadas = [] } = useQuery({
    queryKey: ['enc-cobros', restaurantId, 'liberada'],
    queryFn: () => api.comandas.list(restaurantId, 'liberada'),
    refetchInterval: 15_000,
  })
  const hoy = new Date()
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const { data: mermasHoy } = useQuery({
    queryKey: ['enc-mermas', restaurantId, hoyStr],
    queryFn: () => api.mermas.list(restaurantId, hoyStr, hoyStr),
    refetchInterval: 60_000,
  })
  const totalMermas = (mermasHoy?.mermas ?? []).reduce((s, m) => s + (m.precio ?? 0) * m.cantidad, 0)
  // Cobradas en este turno (por si hay que revisar algo); la clave empieza por 'enc-cobros' para que
  // un cobro la refresque al momento
  const { data: cobradas = [] } = useQuery({
    queryKey: ['enc-cobros', restaurantId, 'cerrada', turnoActivo?.id],
    queryFn: () => api.comandas.list(restaurantId, 'cerrada', turnoActivo!.aperturaAt),
    enabled: !!turnoActivo,
    refetchInterval: 30_000,
  })
  const cobradasOrden = [...cobradas].sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime())
  const cobradoEfectivo = cobradas.filter(c => c.metodoPago === 'cash').reduce((s, c) => s + totalComanda(c.items), 0)
  const cobradoTarjeta = cobradas.filter(c => c.metodoPago === 'tarjeta').reduce((s, c) => s + totalComanda(c.items), 0)
  const [verCobrada, setVerCobrada] = useState<Comanda | null>(null)

  const porCobrar = [...comandas.filter(c => c.estado === 'facturada'), ...liberadas]
    .filter(c => c.items.length > 0)
  // En servicio = ya se mandó algo a cocina o barra (aunque luego le añadieran platos y siga "abierta")
  const yaComandada = (c: Comanda) => c.items.some(i => i.nivel != null && !i.autoGenerado)
  const enServicio = comandas.filter(c => c.estado !== 'facturada' && yaComandada(c))
    .sort((a, b) => new Date(a.enviadaAt ?? a.createdAt).getTime() - new Date(b.enviadaAt ?? b.createdAt).getTime())
  const sinComandar = comandas.filter(c => c.estado !== 'facturada' && !yaComandada(c))
  const sumar = (lista: Comanda[]) => lista.reduce((s, c) => s + totalComanda(c.items), 0)
  const eur = (n: number) => `${n.toFixed(2)} €`

  const tarjeta = (c: Comanda) => {
    const cobrar = c.estado === 'facturada' || c.estado === 'liberada'
    const sinMandar = c.items.filter(i => i.nivel == null && !i.autoGenerado).length
    const invitaciones = c.items.filter(i => i.invitacion).length
    const platos = c.items.filter(i => !i.autoGenerado).reduce((s, i) => s + i.cantidad, 0)
    // Mismo color que la mesa en el mapa
    const col = coloresMesa(c.estado, isDark)
    return (
      <div key={c.id} onClick={() => onAbrirMesa(c.id)}
        style={{ background: col.bg, borderColor: c.cuentaDesactualizada ? '#ef4444' : col.borde }}
        className="rounded-md p-3 flex flex-col gap-1.5 cursor-pointer active:scale-[0.98] transition-transform border-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-black" style={{ color: col.texto }}>Mesa {c.mesa.numero}</span>
          <span className="text-[var(--sala-txt)] text-lg font-black tabular-nums">{eur(totalComanda(c.items))}</span>
        </div>
        <p className="text-[var(--sala-tx2)] text-xs">
          {c.pax} pax{c.camareroNombre ? ` · ${c.camareroNombre.split(' ')[0]}` : ''} · {platos} platos
        </p>
        <p className="text-[var(--sala-tx2)] text-xs tabular-nums">
          abierta {fmtHora(c.createdAt)}{c.enviadaAt ? ` · 1ª comanda ${fmtHora(c.enviadaAt)}` : ''} · <b className="text-[var(--sala-txt)]">{transcurrido(c.enviadaAt ?? c.createdAt)}</b>
        </p>
        <div className="flex flex-wrap gap-1 text-[11px] font-bold">
          {c.estado === 'facturada' && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">🧾 Cuenta impresa</span>}
          {c.estado === 'liberada' && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">🔓 Mesa libre · sin cobrar</span>}
          {c.cuentaDesactualizada && <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-500">⚠️ La cuenta cambió</span>}
          {sinMandar > 0 && <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-600">✋ {sinMandar} sin comandar</span>}
          {c.mermas.length > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--sala-btn2)] text-[var(--sala-tx2)]">🗑 {c.mermas.length} merma{c.mermas.length > 1 ? 's' : ''}</span>}
          {invitaciones > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--sala-btn2)] text-[var(--sala-tx2)]">🎁 {invitaciones}</span>}
          {c.noComparten && <span className="px-1.5 py-0.5 rounded bg-[var(--sala-btn2)] text-[var(--sala-tx2)]">🍽 No comparten</span>}
        </div>
        {cobrar && (
          c.cuentaDesactualizada
            ? <button onClick={e => { e.stopPropagation(); onAbrirMesa(c.id) }}
                className="mt-1 py-2.5 rounded-xl border-2 border-red-500 text-red-500 text-sm font-black active:scale-95">🧾 Reimprimir cuenta</button>
            : <button onClick={e => { e.stopPropagation(); onCobrar(c) }}
                className="mt-1 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-black active:scale-95">💶 Cobrar</button>
        )}
      </div>
    )
  }
  const tarjetaCobrada = (c: Comanda) => (
    <div key={c.id} onClick={() => setVerCobrada(c)}
      style={{ background: coloresMesa('cerrada', isDark).bg, borderColor: coloresMesa('cerrada', isDark).borde }}
      className="rounded-md p-3 flex flex-col gap-1 cursor-pointer active:scale-[0.98] transition-transform opacity-70 border-2 hover:opacity-100">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-black" style={{ color: coloresMesa('cerrada', isDark).texto }}>Mesa {c.mesa.numero}</span>
        <span className="text-[var(--sala-txt)] text-lg font-black tabular-nums">{eur(totalComanda(c.items))}</span>
      </div>
      <p className="text-[var(--sala-tx2)] text-xs tabular-nums">
        ✅ cobrada {c.closedAt ? fmtHora(c.closedAt) : ''} · {c.metodoPago === 'cash' ? '💶 efectivo' : '💳 tarjeta'}{c.propina > 0 ? ` · propina ${eur(c.propina)}` : ''}
      </p>
      <p className="text-[var(--sala-tx3)] text-xs">{c.pax} pax{c.camareroNombre ? ` · ${c.camareroNombre.split(' ')[0]}` : ''}{c.mermas.length ? ` · 🗑 ${c.mermas.length}` : ''}</p>
    </div>
  )
  const seccion = (titulo: string, lista: Comanda[]) => lista.length > 0 && (
    <div>
      <NivelEtiqueta titulo={`${titulo} · ${lista.length}`} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5">{lista.map(tarjeta)}</div>
    </div>
  )

  const cifra = (etiqueta: string, valor: string, color = 'text-[var(--sala-txt)]') => (
    <div className="flex-1 min-w-0 rounded-xl bg-[var(--sala-srf)] px-3 py-2">
      <p className="text-[var(--sala-tx3)] text-[11px] font-bold uppercase tracking-wide truncate">{etiqueta}</p>
      <p className={`text-xl font-black tabular-nums truncate ${color}`}>{valor}</p>
    </div>
  )

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_15rem]">
      <div className="flex flex-col min-h-0">
        <div className="flex gap-2 p-3 border-b border-[var(--sala-brd)]">
          {cifra('Turno', turnoActivo ? `desde ${fmtHora(turnoActivo.aperturaAt)}` : 'sin abrir')}
          {cifra('Cobrado', eur(cobradoEfectivo + cobradoTarjeta), 'text-[#1f9e78]')}
          {cifra('Mesas abiertas', String(comandas.length))}
          {cifra('Por cobrar', `${porCobrar.length} · ${eur(sumar(porCobrar))}`, porCobrar.length ? 'text-amber-500' : undefined)}
          {cifra('En mesas ahora', eur(sumar([...comandas, ...liberadas])))}
          {cifra('Mermas hoy', eur(totalMermas), totalMermas ? 'text-red-500' : undefined)}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {seccion('💶 Por cobrar', porCobrar)}
          {seccion('🍽 En servicio', enServicio)}
          {seccion('✋ Abiertas sin comandar', sinComandar)}
          {comandas.length === 0 && porCobrar.length === 0 && (
            <p className="text-center text-[var(--sala-tx4)] text-lg py-10">No hay mesas abiertas</p>
          )}
          {cobradasOrden.length > 0 && (
            <div>
              <NivelEtiqueta titulo={`✅ Cobradas en este turno · ${cobradasOrden.length}`}>
                <span className="text-[var(--sala-tx3)] text-xs font-bold shrink-0 tabular-nums">💶 {eur(cobradoEfectivo)} · 💳 {eur(cobradoTarjeta)}</span>
              </NivelEtiqueta>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5">{cobradasOrden.map(tarjetaCobrada)}</div>
            </div>
          )}
        </div>
      </div>
      {verCobrada && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setVerCobrada(null)}>
          <div className="w-full max-w-md max-h-[85vh] flex flex-col bg-[var(--sala-hdr)] rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--sala-brd)] flex items-start justify-between">
              <div>
                <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase">✅ Cobrada {verCobrada.closedAt ? fmtHora(verCobrada.closedAt) : ''}</p>
                <h3 className="text-[var(--sala-txt)] text-2xl font-black">Mesa {verCobrada.mesa.numero}</h3>
                <p className="text-[var(--sala-tx2)] text-sm">{verCobrada.pax} pax{verCobrada.camareroNombre ? ` · ${verCobrada.camareroNombre}` : ''} · abierta {fmtHora(verCobrada.createdAt)}</p>
              </div>
              <button onClick={() => setVerCobrada(null)} aria-label="Cerrar" className="text-[var(--sala-tx3)] text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
              {verCobrada.items.map(i => (
                <div key={i.id} className="flex items-baseline gap-2 text-sm">
                  <span className="w-7 text-right font-black text-[var(--sala-txt)] tabular-nums">{i.cantidad}</span>
                  <span className="flex-1 text-[var(--sala-txt)]">{i.nombre}{i.invitacion ? ' 🎁' : ''}</span>
                  <span className="text-[var(--sala-tx2)] tabular-nums">{eur(valorItem(i))}</span>
                </div>
              ))}
              {verCobrada.mermas.length > 0 && (
                <div className="pt-3">
                  <p className="text-[var(--sala-tx3)] text-xs font-bold uppercase mb-1">🗑 Mermas</p>
                  {verCobrada.mermas.map(m => (
                    <p key={m.id} className="text-sm text-[var(--sala-tx2)]">{m.cantidad} × {m.itemNombre} · {MOTIVO_MERMA_LABEL[m.motivo] ?? m.motivo}{m.camareroNombre ? ` · ${m.camareroNombre}` : ''}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-[var(--sala-brd)] space-y-1">
              <div className="flex justify-between text-[var(--sala-txt)] text-xl font-black"><span>Total</span><span className="tabular-nums">{eur(totalComanda(verCobrada.items))}</span></div>
              <p className="text-[var(--sala-tx2)] text-sm">{verCobrada.metodoPago === 'cash' ? '💶 Efectivo' : '💳 Tarjeta'}{verCobrada.propina > 0 ? ` · propina ${eur(verCobrada.propina)}` : ''}</p>
            </div>
          </div>
        </div>
      )}
      <div className="border-l border-[var(--sala-brd)] p-3 overflow-y-auto space-y-2">
        <p className="text-[var(--sala-tx3)] text-[11px] font-black uppercase tracking-wide px-1">Accesos rápidos</p>
        {ACCESOS_ENCARGADO.map(a => (
          <button key={a.tab} onClick={() => onAcceso(a.tab)}
            className="w-full h-14 rounded-xl bg-[var(--sala-srf)] text-[var(--sala-txt)] text-base font-black flex items-center gap-3 px-4 active:scale-95 transition-transform">
            <span className="text-xl">{a.icono}</span>{a.nombre}
            {a.tab === 'cobros' && porCobrar.length > 0 && (
              <span className="ml-auto min-w-7 h-7 px-2 rounded-full bg-amber-500 text-black text-sm flex items-center justify-center">{porCobrar.length}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Página principal camarero ─────────────────────────────────────────────────
// tpv = puesto TPV (/tpv/mesas): tablet compartida del local. Mismo funcionamiento y mismos permisos
// que el PAD (los da el PIN: camarero o encargado), pero el PIN vale para una sola acción: tras el
// Oído, tras un cobro o tras un minuto sin tocar la pantalla, vuelve al PIN para el siguiente.
const TPV_INACTIVIDAD_MS = 60_000
export default function SalaMesasPage({ tpv = false }: { tpv?: boolean }) {
  const navigate   = useNavigate()
  const queryClient = useQueryClient()

  const restaurant = (() => {
    try { return JSON.parse(localStorage.getItem('oidoops_restaurant') ?? '') }
    catch { return null }
  })()
  const camarero = (() => {
    try { return JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '') }
    catch { return null }
  })()
  // Modo encargado: rol 'encargado' o superpoder accesoEncargadoApp (toggle 💼 en /admin/empleados,
  // independiente de puedeEncargado que es un concepto del planning)
  const esEncargado = camarero?.rol === 'encargado' || camarero?.accesoEncargadoApp === true
  const enLocal = useSalaEnModoLocal()
  const pantallaPin = tpv ? '/tpv' : '/sala'
  const salir = () => { sessionStorage.removeItem('oidoops_camarero'); navigate(pantallaPin, { replace: true }) }
  // TPV: la viñeta de "hecho" y de vuelta al PIN
  const terminarTpv = (oido = false) => {
    setAnimOido(oido)
    setAnimFacturada(true)
    setTimeout(salir, 1500)
  }

  // TPV: un minuto sin tocar la pantalla = vuelve al PIN (lo que quedó sin mandar sigue en la mesa)
  useEffect(() => {
    if (!tpv) return
    let timer = setTimeout(salir, TPV_INACTIVIDAD_MS)
    const tocar = () => { clearTimeout(timer); timer = setTimeout(salir, TPV_INACTIVIDAD_MS) }
    window.addEventListener('pointerdown', tocar)
    window.addEventListener('keydown', tocar)
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', tocar); window.removeEventListener('keydown', tocar) }
  }, [tpv])

  useRestaurantEvents(restaurant?.id ?? null)

  useEffect(() => {
    if (!restaurant) navigate(tpv ? '/sala/setup?volver=/tpv' : '/sala/setup', { replace: true })
    else if (!camarero) navigate(pantallaPin, { replace: true })
  }, [])

  const [planId, setPlanId]               = useState<number | null>(null)
  const [abrirMesa, setAbrirMesa]         = useState<Mesa | null>(null)
  const [comandaAbierta, setComandaAbierta] = useState<number | null>(null)
  // En el TPV el encargado entra al panel de mesas; el camarero, al mapa
  const [view, setView] = useState<'mapa' | 'mesas' | 'nueva' | 'panel'>(tpv && esEncargado ? 'panel' : 'mapa')
  const [tabEncargado, setTabEncargado] = useState<TabEncargado | undefined>(undefined)
  const [encargadoSoloCobros, setEncargadoSoloCobros] = useState(false)
  const [cobroPanel, setCobroPanel] = useState<Comanda | null>(null)
  const [showPerfil, setShowPerfil]       = useState(false)
  const [showMoverMesa, setShowMoverMesa] = useState(false)
  const [animFacturada, setAnimFacturada] = useState(false)
  // Al comandar la viñeta dice "Oído" (confirmación de que salió a cocina); en lo demás, la marca
  const [animOido, setAnimOido] = useState(false)
  const [showProduccion, setShowProduccion] = useState(false)
  const [showWiki, setShowWiki] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showEncargado, setShowEncargado] = useState(false)
  // ¿El dispositivo está en la red del local? Solo importa si el local la exige (ver /admin/red)
  const { data: redEstado } = useQuery({ queryKey: ['red-estado'], queryFn: api.red.estado, enabled: !!camarero, refetchInterval: 60_000 })
  const fueraDelLocal = redEstado?.restringido === true && !redEstado.enLocal
  const [menuGrupo, setMenuGrupo] = useState<{ mesa: Mesa; pax: number } | null>(null)
  const [isDark, setIsDark] = useState(() => localStorage.getItem('sala_theme') !== 'light')
  const toggleTheme = () => setIsDark(d => {
    const next = !d
    localStorage.setItem('sala_theme', next ? 'dark' : 'light')
    return next
  })

  const { data: turnoActivo, isLoading: turnoLoading } = useQuery({
    queryKey: ['turno-activo', restaurant?.id],
    queryFn: () => api.turnos.getActivo(restaurant!.id),
    enabled: !!restaurant,
    refetchInterval: 30_000,
  })

  const { data: planes } = useQuery({
    queryKey: ['salon-planes', restaurant?.id],
    queryFn: () => api.salon.list(restaurant!.id),
    enabled: !!restaurant,
  })
  const { data: comandas } = useQuery({
    queryKey: ['comandas-sala', restaurant?.id],
    queryFn: () => api.comandas.list(restaurant!.id),
    enabled: !!restaurant,
    refetchInterval: 15_000,
  })
  const { data: comandaDetalle } = useQuery({
    queryKey: ['comanda-sala', comandaAbierta],
    queryFn: () => api.comandas.get(comandaAbierta!),
    enabled: !!comandaAbierta,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  })
  const { data: menu } = useQuery({
    queryKey: ['menu', restaurant?.id],
    queryFn: () => api.menu.list(restaurant!.id),
    enabled: !!restaurant,
  })
  const { data: menuCategorias = [] } = useQuery({
    queryKey: ['menu-cats', restaurant?.id],
    queryFn: () => api.menuCategorias.list(restaurant!.id),
    enabled: !!restaurant,
  })

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const { data: gruposHoy = [] } = useQuery({
    queryKey: ['grupo-agendados-hoy', restaurant?.id],
    queryFn: () => api.grupoMenu.agendados.list(restaurant!.id, todayStr),
    enabled: !!restaurant,
    refetchInterval: 60_000,
  })
  const gruposPendientesHoy = (gruposHoy as GrupoAgendado[]).filter(g => g.estado === 'pendiente')

  const activePlan = planes?.find(p => p.id === planId) ?? planes?.[0] ?? null

  useEffect(() => {
    if (planes?.length && !planId) setPlanId(planes[0].id)
  }, [planes])

  const abrirComanda = useMutation({
    mutationFn: ({ mesaId, pax, walkin }: { mesaId: number; pax: number; walkin?: boolean }) =>
      api.comandas.abrir(restaurant!.id, mesaId, pax, camarero?.nombre, walkin),
    onSuccess: (comanda, { walkin }) => {
      setAbrirMesa(null)
      setComandaAbierta(comanda.id)
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
      if (walkin) queryClient.invalidateQueries({ queryKey: ['reservas', restaurant?.id] })
    },
  })

  // Encargado al abrir una mesa libre: las reservas de hoy, para sentar una desde el mapa
  const hoyReservas = diaServicio()
  const { data: reservasHoyMapa } = useQuery({
    queryKey: ['reservas', restaurant?.id, hoyReservas],
    queryFn: () => api.reservas.list(restaurant!.id, hoyReservas),
    enabled: !!restaurant && esEncargado && !!abrirMesa && !enLocal,
  })
  const sentarReserva = useMutation({
    mutationFn: ({ reserva, mesaId, pax }: { reserva: Reserva; mesaId: number; pax: number }) =>
      api.reservas.sentar(reserva.id, mesaId, camarero?.nombre, pax),
    // Sentar no abre la mesa: el encargado sienta y sigue; la mesa queda con su 📅 en el mapa
    onSuccess: () => {
      setAbrirMesa(null)
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
      queryClient.invalidateQueries({ queryKey: ['reservas', restaurant?.id] })
    },
  })

  // Encargado: abrir turno directamente desde la pantalla de bloqueo
  const abrirTurnoEncargado = useMutation({
    mutationFn: () => api.turnos.abrir(restaurant!.id, camarero?.nombre),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turno-activo', restaurant?.id] }),
  })

  const liberarMesa = useMutation({
    mutationFn: (id: number) => api.comandas.liberar(id),
    onSuccess: comanda => {
      setComandaAbierta(null)
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
      setAbrirMesa(comanda.mesa)
    },
  })

  const enviarComanda = useMutation({
    mutationFn: ({ id, niveles }: { id: number; niveles: { itemId: number; nivel: number; nota?: string }[]; silent?: boolean }) =>
      api.comandas.enviar(id, niveles),
    onSuccess: (_, { silent }) => {
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comandaAbierta] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
      if (!silent) {
        setComandaAbierta(null)
        setView('mapa')
        // Comandada exitosa → viñeta OidoOps central con la tilde animada (en el TPV, y vuelta al PIN)
        if (tpv) { terminarTpv(true); return }
        setAnimOido(true)
        setAnimFacturada(true)
        setTimeout(() => setAnimFacturada(false), 1800)
      }
    },
  })

  const moverMesa = useMutation({
    mutationFn: ({ id, mesaId }: { id: number; mesaId: number }) => api.comandas.moverMesa(id, mesaId),
    onSuccess: () => {
      setShowMoverMesa(false)
      setComandaAbierta(null)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comandaAbierta] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
    },
  })

  const mergeMesas = useMutation({
    mutationFn: ({ sourceId, targetId, itemIds }: { sourceId: number; targetId: number; itemIds?: number[] }) =>
      api.comandas.merge(sourceId, targetId, itemIds),
    onSuccess: (targetComanda) => {
      setShowMoverMesa(false)
      setComandaAbierta(null)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comandaAbierta] })
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', targetComanda.id] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
    },
  })

  // Una mesa puede tener dos comandas: la cuenta de los de antes sin cobrar (facturada o liberada) y
  // la de los que se acaban de sentar. Manda la de ahora (es la que se abre y da el color); la otra
  // se marca con el marco rojo interior.
  const { data: liberadasMapa = [] } = useQuery({
    queryKey: ['enc-cobros', restaurant?.id, 'liberada'],
    queryFn: () => api.comandas.list(restaurant!.id, 'liberada'),
    enabled: !!restaurant && !enLocal,
    refetchInterval: 15_000,
  })
  const comandaByMesa = (mesaId: number) =>
    comandas?.find(c => c.mesaId === mesaId && (c.estado === 'abierta' || c.estado === 'enviada'))
    ?? comandas?.find(c => c.mesaId === mesaId)
  const pendienteCobroEn = (mesaId: number) => {
    const principal = comandaByMesa(mesaId)
    return [...(comandas ?? []), ...liberadasMapa].some(c =>
      c.mesaId === mesaId && c.id !== principal?.id && (c.estado === 'facturada' || c.estado === 'liberada') && c.items.length > 0)
  }

  const handleMesaClick = (mesa: Mesa) => {
    const comanda = comandaByMesa(mesa.id)
    if (comanda) setComandaAbierta(comanda.id)
    else setAbrirMesa(mesa)
  }

  const todasLasMesas = planes?.flatMap(p => p.mesas.map(m => ({ ...m, planNombre: p.nombre }))) ?? []
  const mesasLibres   = todasLasMesas.filter(m => !comandaByMesa(m.id))

  // Deslizar el mapa de lado: siguiente / anterior salón. Desde el último salón, el encargado pasa a
  // cobrar (en el PAD abre 💼 → Cobros; en el TPV, su panel). Al cambiar se ve un momento el nombre.
  const swipeMapa = useRef<{ x: number; y: number } | null>(null)
  const [avisoSalon, setAvisoSalon] = useState<string | null>(null)
  const avisoSalonTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const irASalon = (dir: 1 | -1) => {
    if (!planes?.length || !activePlan) return
    const i = planes.findIndex(p => p.id === activePlan.id)
    const destino = planes[i + dir]
    if (destino) {
      setPlanId(destino.id)
      setAvisoSalon(destino.nombre)
      if (avisoSalonTimer.current) clearTimeout(avisoSalonTimer.current)
      avisoSalonTimer.current = setTimeout(() => setAvisoSalon(null), 1100)
      return
    }
    if (dir === 1 && esEncargado && !enLocal) {
      if (tpv) setView('panel')
      else { setTabEncargado('cobros'); setEncargadoSoloCobros(true); setShowEncargado(true) }
    }
  }

  // TPV: abrir una mesa tecleando (teclado físico o numérico Bluetooth). Con alguien logueado y sin
  // ninguna ventana abierta: se teclea el número de mesa y Enter; si está ocupada se abre, si está
  // libre pide los PAX y Enter. Lo tecleado se ve en el visor de abajo. ⌫ borra, Esc cancela.
  const [atajo, setAtajo] = useState<{ paso: 'mesa' | 'pax'; mesa: string; pax: string; mesaId?: number; error?: string } | null>(null)
  const teclaAtajo = useRef<(e: KeyboardEvent) => void>(() => {})
  teclaAtajo.current = e => {
    const libreDeVentanas = !comandaAbierta && !abrirMesa && !menuGrupo && !showEncargado && !cobroPanel && !showPerfil
      && !showMoverMesa && !showWiki && !showChecklist && !showProduccion
    const enCampo = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
    if (!tpv || !libreDeVentanas || enCampo || !turnoActivo || fueraDelLocal) return
    const digito = /^Numpad([0-9])$/.exec(e.code)?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null)
    if (digito) {
      e.preventDefault()
      setAtajo(a => {
        const actual = a ?? { paso: 'mesa' as const, mesa: '', pax: '' }
        const campo = actual.paso === 'mesa' ? 'mesa' : 'pax'
        if (actual[campo].length >= (campo === 'mesa' ? 4 : 2)) return actual
        return { ...actual, [campo]: actual[campo] + digito, error: undefined }
      })
      return
    }
    if (!atajo) return
    if (e.key === 'Escape') { e.preventDefault(); setAtajo(null); return }
    if (e.key === 'Backspace') {
      e.preventDefault()
      setAtajo(a => !a ? a
        : a.paso === 'pax' ? (a.pax ? { ...a, pax: a.pax.slice(0, -1) } : { paso: 'mesa', mesa: a.mesa, pax: '' })
        : a.mesa.length > 1 ? { ...a, mesa: a.mesa.slice(0, -1), error: undefined } : null)
      return
    }
    if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault()
      if (atajo.paso === 'mesa') {
        const mesa = todasLasMesas.find(m => String(m.numero) === atajo.mesa && m.tipo !== 'barra' && !isElemDeco(m.tipo))
        if (!mesa) { setAtajo({ ...atajo, error: `La mesa ${atajo.mesa} no existe` }); return }
        const comanda = comandaByMesa(mesa.id)
        if (comanda) { setComandaAbierta(comanda.id); setAtajo(null); return }
        setAtajo({ paso: 'pax', mesa: atajo.mesa, pax: '', mesaId: mesa.id })
        return
      }
      const pax = Number(atajo.pax)
      if (!pax) { setAtajo({ ...atajo, error: '¿Cuántos PAX?' }); return }
      abrirComanda.mutate({ mesaId: atajo.mesaId!, pax })
      setAtajo(null)
    }
  }
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => teclaAtajo.current(e)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])

  const estadoBadge = (c: Comanda) => {
    if (c.estado === 'facturada') return { label: '🧾 Cuenta', color: 'text-amber-400 bg-amber-500/10' }
    if (c.estado === 'enviada')   return { label: '🚀 Enviada', color: 'text-purple-400 bg-purple-500/10' }
    return { label: '● Abierta', color: 'text-[#4CC8A0] bg-[#4CC8A0]/10' }
  }

  if (!restaurant || !camarero) return null

  // Fuera de la red del local (y el local la exige): modo consulta. Se puede estudiar la carta y la
  // wiki y ver las propinas; el encargado, además, reviews y reservas. Operar pide estar en el local.
  if (fueraDelLocal) {
    return (
      <div data-sala-theme={isDark ? 'dark' : 'light'} className="flex flex-col h-screen bg-[var(--sala-bg)] items-center justify-center px-8 text-center">
        <p className="text-5xl mb-4">📍</p>
        <p className="text-[var(--sala-txt)] font-black text-xl mb-2">Estás fuera del local</p>
        <p className="text-[var(--sala-tx3)] text-sm mb-8 max-w-xs">
          Para tomar pedidos y cobrar conéctate a la red de {restaurant.nombre}. Desde aquí puedes consultar:
        </p>
        <div className="w-full max-w-xs space-y-3">
          <button onClick={() => setShowWiki(true)}
            className="w-full py-4 rounded-2xl text-white font-black text-base active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
            📖 Wiki y carta
          </button>
          <button onClick={() => setShowPerfil(true)}
            className="w-full py-4 rounded-2xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-black text-base active:scale-95 transition-transform">
            💰 Mis propinas
          </button>
          {esEncargado && (
            <button onClick={() => { setEncargadoSoloCobros(false); setShowEncargado(true) }}
              className="w-full py-4 rounded-2xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-black text-base active:scale-95 transition-transform">
              📅 Reservas y ⭐ reviews
            </button>
          )}
          <button onClick={salir}
            className="w-full py-3 text-[var(--sala-tx3)] text-sm font-semibold">
            Salir
          </button>
        </div>
        {showWiki && <WikiPanel restaurantId={restaurant.id} onClose={() => setShowWiki(false)} />}
        {showPerfil && (
          <PerfilPanel
            camarero={camarero}
            restaurantNombre={restaurant.nombre}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onClose={() => setShowPerfil(false)}
            onOpenWiki={() => { setShowPerfil(false); setShowWiki(true) }}
            onOpenChecklist={() => setShowPerfil(false)}
            onOpenProduccion={() => setShowPerfil(false)}
          />
        )}
        {showEncargado && esEncargado && (
          <EncargadoPanel restaurant={restaurant} camarero={camarero} turnoActivo={turnoActivo ?? null} onClose={() => setShowEncargado(false)} soloConsulta />
        )}
      </div>
    )
  }

  // Bloqueo si el turno no está iniciado
  if (!turnoLoading && turnoActivo === null) {
    return (
      <div className="flex flex-col h-screen bg-[var(--sala-bg)] items-center justify-center px-8 text-center">
        <div className="flex items-center gap-3 mb-8 opacity-60">
          <svg width="52" height="55" viewBox="0 0 68 72">
            <defs>
              <linearGradient id="og-lock" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4B9EDF"/>
                <stop offset="100%" stopColor="#4CC8A0"/>
              </linearGradient>
            </defs>
            <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#og-lock)" />
            <path d="M15 34 L29 48 L55 18" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
            <span className="text-[var(--sala-txt)]">Oido</span><span className="text-[#4CC8A0]">Ops</span>
          </span>
        </div>
        <p className="text-[var(--sala-txt)] font-black text-xl mb-2">Turno no iniciado</p>
        {enLocal ? (
          <p className="text-[var(--sala-tx3)] text-sm">Sin internet no se puede abrir el turno: la sala sigue en cuanto vuelva la conexión.</p>
        ) : esEncargado ? (
          <>
            <p className="text-[var(--sala-tx3)] text-sm mb-6">Sos encargado — podés abrir el turno ahora mismo.</p>
            <button
              onClick={() => abrirTurnoEncargado.mutate()}
              disabled={abrirTurnoEncargado.isPending}
              className="px-8 py-4 rounded-2xl text-white font-black text-base active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
              {abrirTurnoEncargado.isPending ? 'Abriendo…' : `▶ Abrir turno como ${camarero.nombre}`}
            </button>
          </>
        ) : (
          <p className="text-[var(--sala-tx3)] text-sm">El encargado debe abrir el turno desde el panel de sala antes de que puedas usar las mesas.</p>
        )}
        {tpv && <button onClick={salir} className="mt-8 py-3 px-6 text-[var(--sala-tx3)] text-sm font-semibold">Salir</button>}
      </div>
    )
  }

  return (
    <ThemeCtx.Provider value={isDark}>
    {/* Tras cobrar vuelve al PIN, salvo el encargado, que suele encadenar varios cobros */}
    <TpvCtx.Provider value={tpv && !esEncargado ? terminarTpv : null}>
    <div data-sala-theme={isDark ? 'dark' : 'light'} className="flex flex-col h-screen bg-[var(--sala-bg)]">
      {/* Header */}
      <div className="bg-[var(--sala-hdr)] border-b border-[var(--sala-brd)] px-3 py-1.5">
        <div className="flex items-stretch gap-2">
          {/* Perfil: viñeta OidoOps + primer nombre, ocupa toda la altura del header
              (abre restaurante, nombre completo, propinas, producción, wiki, checklists, tema) */}
          <button onClick={() => setShowPerfil(true)} title={`${restaurant.nombre} · ${camarero.nombre}`}
            className="w-16 self-stretch shrink-0 rounded-xl bg-[var(--sala-btn2)] hover:bg-[var(--sala-btn)] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all">
            <svg viewBox="0 0 68 72" className="w-9 h-9">
              <defs>
                <linearGradient id="og-hdr" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4B9EDF"/>
                  <stop offset="100%" stopColor="#4CC8A0"/>
                </linearGradient>
              </defs>
              <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#og-hdr)" />
              <path d="M15 34 L29 48 L55 18" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[11px] font-bold text-[var(--sala-tx2)] leading-none truncate max-w-[56px]">
              {camarero.nombre.split(' ')[0]}
            </span>
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          <div className="order-2 ml-auto flex items-center gap-3">
            {/* Modo encargado (sin internet no hay nada de lo que tiene dentro) */}
            {esEncargado && !enLocal && (
              <button
                onClick={() => { setTabEncargado(undefined); setEncargadoSoloCobros(false); setShowEncargado(true) }}
                aria-label="Modo encargado" title="Modo encargado: cobros, turno, checklists, mermas"
                className="text-[var(--sala-tx3)] hover:text-[#4CC8A0] transition-colors active:scale-90"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  <path d="M2 13h20" />
                  <path d="M12 11.5v3" />
                </svg>
              </button>
            )}
            {/* En el TPV, "Salir" bien visible: devuelve la tablet al PIN para el siguiente */}
            <button onClick={salir}
              aria-label="Salir" title="Salir (cerrar sesión)"
              className={`text-[var(--sala-tx3)] hover:text-red-400 transition-colors active:scale-90 ${tpv
                ? 'flex items-center gap-2 h-12 px-4 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] font-black text-sm uppercase' : ''}`}>
              {tpv && <span>Salir</span>}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        {/* Vista tabs — botones cuadrados continuos */}
        <div className="order-1 flex items-center gap-1.5">
          {/* TPV, encargado: su panel de mesas */}
          {tpv && esEncargado && (
            <button onClick={() => setView('panel')} aria-label="Panel" title="Panel del encargado"
              className={`h-12 px-4 rounded-xl text-sm font-black uppercase inline-flex items-center gap-2 active:scale-95 transition-all ${
                view === 'panel' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
              📊 Panel
            </button>
          )}
          {/* Plantas: siempre visibles, llevan al mapa de esa planta */}
          {planes && planes.map(p => {
            const lower = p.nombre.toLowerCase()
            const isAlta = lower.includes('alta')
            const isBaja = lower.includes('baja')
            const showIcon = isAlta || isBaja
            return (
              <button key={p.id} onClick={() => { setPlanId(p.id); setView('mapa') }}
                aria-label={p.nombre} title={p.nombre}
                className={`w-12 h-12 rounded-xl text-xs font-medium inline-flex items-center justify-center active:scale-95 transition-all ${view === 'mapa' && activePlan?.id === p.id ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
                {showIcon ? (
                  isAlta ? (
                    <svg width="22" height="22" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      {/* Escalera ascendente (izquierda) */}
                      <path d="M1 21h2.5v-2.5h2.5v-2.5h2.5v-2.5h2.5v-2.5" strokeWidth="1.6" />
                      {/* Flecha arriba (derecha, separada del cuerpo de la escalera) */}
                      <path d="M21 21V4" strokeWidth="2.4" />
                      <path d="M16 8l5-5 5 5" strokeWidth="2.4" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      {/* Escalera descendente (izquierda) */}
                      <path d="M1 3h2.5v2.5h2.5v2.5h2.5v2.5h2.5v2.5" strokeWidth="1.6" />
                      {/* Flecha abajo (derecha, separada del cuerpo de la escalera) */}
                      <path d="M21 3v17" strokeWidth="2.4" />
                      <path d="M16 16l5 5 5-5" strokeWidth="2.4" />
                    </svg>
                  )
                ) : (
                  <span className="text-[10px] font-bold truncate px-1">{p.nombre}</span>
                )}
              </button>
            )
          })}

          {/* Mesas */}
          <button onClick={() => setView('mesas')}
            aria-label="Mesas" title="Mesas activas"
            className={`w-12 h-12 rounded-xl inline-flex items-center justify-center active:scale-95 transition-all ${
              view === 'mesas' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)] hover:bg-gray-700'
            }`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10h18" />
              <path d="M4 10V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
              <path d="M7 10v9" />
              <path d="M17 10v9" />
            </svg>
          </button>
        </div>
          </div>
        </div>
      </div>

      {/* Banner grupos programados hoy */}
      {gruposPendientesHoy.length > 0 && (
        <div className="bg-indigo-600 text-white px-4 py-2 flex items-center gap-3">
          <span className="text-base shrink-0">📅</span>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-sm">
              {gruposPendientesHoy.length === 1
                ? `Grupo programado hoy: ${gruposPendientesHoy[0].template.nombre} · ${Object.values(gruposPendientesHoy[0].restricciones).reduce((s, v) => s + v, 0)} pax`
                : `${gruposPendientesHoy.length} grupos programados para hoy`}
            </span>
            {gruposPendientesHoy[0].notas && (
              <span className="text-indigo-200 text-xs ml-2">"{gruposPendientesHoy[0].notas}"</span>
            )}
          </div>
          <span className="text-indigo-200 text-xs shrink-0">Asignar desde Grupos</span>
        </div>
      )}

      {/* Vista: Panel del encargado (TPV) */}
      {view === 'panel' && (
        <PanelEncargadoTpv restaurantId={restaurant.id} comandas={comandas ?? []} turnoActivo={turnoActivo ?? null}
          onAbrirMesa={id => setComandaAbierta(id)}
          onCobrar={c => setCobroPanel(c)}
          onAcceso={t => { setTabEncargado(t); setEncargadoSoloCobros(false); setShowEncargado(true) }} />
      )}
      {cobroPanel && <CobroSheet comanda={cobroPanel} onClose={() => setCobroPanel(null)} />}

      {/* Vista: Mapa — escala bounding box para llenar ancho y alto */}
      {view === 'mapa' && (activePlan ? (
        <div className="flex-1 overflow-hidden relative"
          onTouchStart={e => { swipeMapa.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
          onTouchEnd={e => {
            const st = swipeMapa.current
            swipeMapa.current = null
            if (!st) return
            const dx = e.changedTouches[0].clientX - st.x
            const dy = e.changedTouches[0].clientY - st.y
            const th = swipeThresholds()
            if (Math.abs(dx) > th.dx && Math.abs(dy) < th.dy) irASalon(dx < 0 ? 1 : -1)
          }}
          ref={el => {
          if (!el || !activePlan.mesas.length) return
          const applyScale = () => {
            const PAD = 24
            const ms = activePlan.mesas
            const minX = Math.min(...ms.map(m => m.x)) - PAD
            const minY = Math.min(...ms.map(m => m.y)) - PAD
            const contentW = Math.max(...ms.map(m => m.x + mesaWidth(m)))  + PAD - minX
            const contentH = Math.max(...ms.map(m => m.y + mesaHeight(m))) + PAD - minY
            const scale   = Math.min(el.clientWidth / contentW, el.clientHeight / contentH)
            const offsetX = (el.clientWidth  - contentW * scale) / 2
            const offsetY = (el.clientHeight - contentH * scale) / 2
            const canvas  = el.querySelector('.plan-canvas') as HTMLElement
            if (canvas) {
              canvas.style.transformOrigin = '0 0'
              canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale}) translate(${-minX}px, ${-minY}px)`
            }
          }
          applyScale()
          const ro = new ResizeObserver(applyScale)
          ro.observe(el)
          ;(el as HTMLElement & { _ro?: ResizeObserver })._ro?.disconnect()
          ;(el as HTMLElement & { _ro?: ResizeObserver })._ro = ro
        }}>
          {/* Reloj flotante — margen superior del mapa, centrado */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none px-4 py-1 rounded-full bg-[var(--sala-hdr)]/85 border border-[var(--sala-brd)] backdrop-blur-sm shadow-lg">
            <RelojSala />
          </div>
          {avisoSalon && (
            <div key={avisoSalon} className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
              <span className="px-6 py-3 rounded-2xl text-white text-2xl font-black uppercase tracking-wide shadow-2xl"
                style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)', animation: 'fadeInOut 1.1s ease forwards' }}>
                {avisoSalon}
              </span>
            </div>
          )}
          <div className="plan-canvas" style={{
            position: 'absolute', top: 0, left: 0,
            backgroundImage: `linear-gradient(to right, var(--sala-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--sala-grid) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            width: Math.max(...(activePlan.mesas.map(m => m.x + mesaWidth(m))), 400) + 40,
            height: Math.max(...(activePlan.mesas.map(m => m.y + mesaHeight(m))), 400) + 40,
          }}>
            {/* Barras — decorativas, no interactivas */}
            {activePlan.mesas.filter(m => m.tipo === 'barra').map((mesa: Mesa) => (
              <div key={mesa.id} style={{
                position: 'absolute', left: mesa.x, top: mesa.y,
                width: mesaWidth(mesa), height: mesaHeight(mesa),
                background: '#130e08', border: '2px solid #92400e',
                borderRadius: 6, zIndex: 0, pointerEvents: 'none',
                boxShadow: '0 0 20px #92400e99, 0 0 40px #92400e33',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#d97706', fontWeight: 900, fontSize: 10, letterSpacing: '0.15em' }}>BARRA</span>
              </div>
            ))}
            {/* Mesas y sillas altas — interactivas */}
            {activePlan.mesas.filter(m => m.tipo !== 'barra').map((mesa: Mesa) => (
              <MesaBtn key={mesa.id} mesa={mesa} comanda={comandaByMesa(mesa.id)} pendienteCobro={pendienteCobroEn(mesa.id)} onClick={() => handleMesaClick(mesa)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--sala-tx4)] text-sm">No hay planos configurados.</p>
        </div>
      ))}
      {view === 'mapa' && activePlan && <FranjaAltos restaurantId={restaurant.id} />}

      {/* Vista: Mesas abiertas */}
      {view === 'mesas' && (
        <div className="flex-1 overflow-y-auto p-4">
          {!comandas?.length ? (
            <div className="text-center py-16 text-[var(--sala-tx4)]">
              <p className="text-4xl mb-3">🍽</p>
              <p className="text-sm">No hay mesas abiertas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comandas.map(c => {
                const badge = estadoBadge(c)
                return (
                  <button key={c.id} onClick={() => setComandaAbierta(c.id)}
                    className="w-full bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)] rounded-2xl p-4 text-left transition-colors active:scale-95">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[var(--sala-txt)] text-2xl font-black">Mesa {c.mesa.numero}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge.color}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--sala-tx2)]">{c.pax} pax · {c.items.length} items</span>
                      <span className="text-[var(--sala-tx3)] text-xs">{timeAgo(c.createdAt)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Vista: Nueva mesa */}
      {view === 'nueva' && (
        <div className="flex-1 overflow-y-auto p-4">
          {!mesasLibres.length ? (
            <div className="text-center py-16 text-[var(--sala-tx4)]">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-sm">Todas las mesas están ocupadas</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {mesasLibres.map(m => (
                <button key={m.id} onClick={() => { setAbrirMesa(m); setView('mapa') }}
                  className="bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)] border border-[var(--sala-brd)] rounded-2xl p-5 flex flex-col items-center gap-1 transition-colors active:scale-95">
                  <span className="text-[var(--sala-txt)] text-3xl font-black">{m.numero}</span>
                  <span className="text-[var(--sala-tx3)] text-xs">{m.planNombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {abrirMesa && (
        <AbrirMesaModal mesa={abrirMesa} onClose={() => setAbrirMesa(null)}
          onConfirm={pax => abrirComanda.mutate({ mesaId: abrirMesa.id, pax })}
          {...(esEncargado && !enLocal ? {
            reservas: reservasHoyMapa,
            onWalkin: (pax: number) => abrirComanda.mutate({ mesaId: abrirMesa.id, pax, walkin: true }),
            onReserva: (reserva: Reserva, pax: number) => sentarReserva.mutate({ reserva, mesaId: abrirMesa.id, pax }),
          } : {})}
          onMenuGrupo={pax => { setMenuGrupo({ mesa: abrirMesa, pax }); setAbrirMesa(null) }} />
      )}

      {menuGrupo && (
        <MenuGrupoSheet
          restaurantId={restaurant.id}
          mesa={menuGrupo.mesa}
          pax={menuGrupo.pax}
          camareroNombre={camarero?.nombre}
          menu={menu ?? []}
          categorias={menuCategorias}
          ancho={tpv}
          onClose={() => setMenuGrupo(null)}
          onDone={comandaId => {
            setMenuGrupo(null)
            queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
            setComandaAbierta(comandaId)
          }}
        />
      )}

      {comandaAbierta && comandaDetalle && (
        <ComandaPanel comanda={comandaDetalle} menu={menu ?? []} categorias={menuCategorias}
          onClose={() => {
            setComandaAbierta(null)
            // Se abrió y no se pidió nada (pax puesto por error): la mesa vuelve a estar libre.
            // Con reserva o walk-in no: esa gente está sentada esperando. El servidor comprueba que esté vacía.
            if (comandaDetalle.estado === 'abierta' && !comandaDetalle.reserva) {
              api.comandas.liberarSiVacia(comandaDetalle.id)
                .then(() => queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] }))
                .catch(() => {})
            }
          }}
          onEnviar={(niveles, silent) => enviarComanda.mutate({ id: comandaAbierta, niveles, silent })}
          onLiberar={() => liberarMesa.mutate(comandaAbierta)}
          onCambiarMesa={comandaDetalle.estado !== 'facturada' ? () => setShowMoverMesa(true) : undefined}
          onFacturar={() => { setAnimOido(false); setAnimFacturada(true); setTimeout(() => setAnimFacturada(false), 1800) }}
          esEncargado={esEncargado} ancho={tpv} />
      )}

      {animFacturada && <CheckOverlay texto={animOido ? 'Oído' : undefined} />}

      {/* Visor del atajo de teclado (TPV): estilo display de caja, dígitos verdes encendidos */}
      {atajo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none select-none">
          <div className="rounded-xl px-8 py-4 shadow-2xl border-4 border-[#1f2937] min-w-[22rem]"
            style={{ background: 'linear-gradient(180deg, #06140c, #0b1f14)', boxShadow: 'inset 0 2px 12px rgba(0,0,0,.8), 0 10px 30px rgba(0,0,0,.4)' }}>
            <div className="flex items-baseline gap-5" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: '#6dff9e', textShadow: '0 0 8px rgba(109,255,158,.75)' }}>
              <span className="text-lg font-bold tracking-[0.3em] opacity-70">MESA</span>
              <span className="text-6xl font-bold tabular-nums tracking-widest">{atajo.mesa || ' '}{atajo.paso === 'mesa' && <span className="animate-pulse">▌</span>}</span>
              {atajo.paso === 'pax' && (
                <>
                  <span className="text-lg font-bold tracking-[0.3em] opacity-70 ml-4">PAX</span>
                  <span className="text-6xl font-bold tabular-nums">{atajo.pax}<span className="animate-pulse">▌</span></span>
                </>
              )}
            </div>
            <p className="mt-2 text-sm font-bold tracking-wide" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", color: atajo.error ? '#ff6b6b' : 'rgba(109,255,158,.55)' }}>
              {atajo.error ?? (atajo.paso === 'mesa' ? '↵ abrir · ⌫ borrar · Esc cancelar' : 'Mesa libre: ¿cuántos PAX? ↵ abrir')}
            </p>
          </div>
        </div>
      )}

      {showMoverMesa && comandaDetalle && planes && (
        <MoverMesaModal
          comanda={comandaDetalle}
          planes={planes}
          comandas={comandas ?? []}
          onMoverALibre={mesaId => moverMesa.mutate({ id: comandaAbierta!, mesaId })}
          onMerge={(targetComandaId, itemIds) => mergeMesas.mutate({ sourceId: comandaAbierta!, targetId: targetComandaId, itemIds })}
          onClose={() => setShowMoverMesa(false)}
        />
      )}

      {showPerfil && camarero && (
        <PerfilPanel
          camarero={camarero}
          restaurantNombre={restaurant.nombre}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onClose={() => setShowPerfil(false)}
          onOpenWiki={() => { setShowPerfil(false); setShowWiki(true) }}
          onOpenChecklist={() => { setShowPerfil(false); setShowChecklist(true) }}
          onOpenProduccion={() => { setShowPerfil(false); setShowProduccion(true) }}
        />
      )}
      {showProduccion && (
        <ProduccionSalaModal
          restaurantId={restaurant.id}
          camareroNombre={camarero.nombre}
          onClose={() => setShowProduccion(false)}
        />
      )}
      {showWiki && (
        <WikiPanel restaurantId={restaurant.id} onClose={() => setShowWiki(false)} />
      )}
      {showChecklist && (
        <ChecklistPanel restaurantId={restaurant.id} camareroNombre={camarero.nombre} onClose={() => setShowChecklist(false)} />
      )}
      {showEncargado && esEncargado && (
        <EncargadoPanel
          restaurant={restaurant}
          camarero={camarero}
          turnoActivo={turnoActivo ?? null}
          onClose={() => setShowEncargado(false)}
          onAbrirComanda={id => { setShowEncargado(false); setComandaAbierta(id) }}
          tabInicial={tabEncargado}
          soloCobros={encargadoSoloCobros}
        />
      )}
    </div>
    </TpvCtx.Provider>
    </ThemeCtx.Provider>
  )
}
