import { useState, useEffect, useRef, createContext, useContext } from 'react'

const ThemeCtx = createContext<boolean>(true) // true = dark
import CheckOverlay from '../components/CheckOverlay'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem, FloorPlan, GrupoAgendado, GrupoMenuTemplate, InventarioCategoria, Mesa, MenuCategoria, MenuItem, MermaMotivo, MiTurno, Turno, WikiCategoria, WikiArticulo, ChecklistSector, sugerirCantidadesMenu, totalComanda, valorItem } from '../api'
import { speak, VozSelector, LANGS, Lang } from '../lib/tts'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'

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

function suggestNivel(nombre: string, menu: MenuItem[]): number {
  const categoria = menu.find(m => m.nombre === nombre)?.categoria ?? ''
  const base = NIVEL_PATTERNS.find(([re]) => re.test(categoria))?.[1] ?? 3
  const isCold = COLD_KEYWORDS.some(kw => nombre.toLowerCase().includes(kw))
  return isCold && base > 1 ? base - 1 : base
}

// ── Mesa visual ───────────────────────────────────────────────────────────────
function MesaBtn({ mesa, comanda, onClick }: { mesa: Mesa; comanda?: Comanda; onClick: () => void }) {
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
  const enviada    = comanda?.estado === 'enviada'
  const facturada  = comanda?.estado === 'facturada'
  const isRound    = mesa.tipo === 'round' || mesa.tipo === 'silla_alta'

  const isSillaAlta = mesa.tipo === 'silla_alta'

  // libre y facturada: fondo verde "space" — facturada añade borde ámbar
  const bg     = isDark
    ? (libre || facturada ? '#1a3828' : enviada ? '#2d1a3a' : isSillaAlta ? '#1a1000' : '#0f2240')
    : (libre || facturada ? '#dcfce7' : enviada ? '#f3e8ff' : isSillaAlta ? '#fef3c7' : '#dbeafe')

  const border = libre      ? '#22c55e'
               : facturada  ? '#f59e0b'
               : enviada    ? '#a855f7'
               : isSillaAlta ? '#d97706' : '#4CC8A0'

  const glow   = isDark
    ? (libre      ? '0 0 16px #22c55e88, 0 0 32px #22c55e22'
     : facturada  ? '0 0 20px #f59e0b99, 0 0 40px #f59e0b33'
     : enviada    ? '0 0 20px #a855f799, 0 0 40px #a855f733'
     : isSillaAlta ? '0 0 20px #d9770699, 0 0 40px #d9770633'
     :               '0 0 20px #4CC8A099, 0 0 40px #4CC8A033')
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
      <div style={{ transform: mesa.rotacion ? `rotate(${-mesa.rotacion}deg)` : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{
          color: libre      ? '#16a34a'
               : facturada  ? '#d97706'
               : enviada    ? (isDark ? '#c084fc' : '#9333ea')
               : isSillaAlta ? '#d97706' : (isDark ? '#4CC8A0' : '#0d9488'),
          fontWeight: 800, fontSize: isSillaAlta ? 14 : 18,
        }}>
          {mesa.numero}
        </span>
        {!libre && !facturada && (
          <span style={{
            color: enviada ? (isDark ? '#d8b4fe' : '#7c3aed') : isSillaAlta ? '#d97706' : (isDark ? '#6ee7b7' : '#059669'),
            fontSize: 9, marginTop: 1,
          }}>{timeAgo(comanda!.createdAt)}</span>
        )}
      </div>
    </div>
  )
}

// ── Modal abrir mesa ──────────────────────────────────────────────────────────
function AbrirMesaModal({ mesa, onConfirm, onMenuGrupo, onClose }: { mesa: Mesa; onConfirm: (pax: number) => void; onMenuGrupo?: (pax: number) => void; onClose: () => void }) {
  const [pax, setPax] = useState(2)
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-[var(--sala-txt)] font-bold text-lg mb-1">Mesa {mesa.numero}</h3>
        <p className="text-[var(--sala-tx2)] text-sm mb-6">¿Cuántos PAX?</p>
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setPax(p => Math.max(1, p - 1))} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl hover:bg-gray-600">−</button>
          <span className="flex-1 text-center text-[var(--sala-txt)] text-5xl font-bold">{pax}</span>
          <button onClick={() => setPax(p => p + 1)} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl hover:bg-gray-600">+</button>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] font-medium">Cancelar</button>
          <button onClick={() => onConfirm(pax)} className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold">Abrir mesa</button>
        </div>
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
function OrdenarModal({ comanda, menu, categorias, onEnviar, onClose, marchaPasa = false }: {
  comanda: Comanda; menu: MenuItem[]; categorias: MenuCategoria[]
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[]) => void
  onClose: () => void
  marchaPasa?: boolean
}) {
  const queryClient = useQueryClient()
  const catMeta: Record<string, string> = {}
  for (const c of categorias) catMeta[c.nombre] = c.grupo || ''

  const [notas, setNotas] = useState<Record<number, string>>(() => {
    const r: Record<number, string> = {}
    comanda.items.forEach(i => { r[i.id] = i.nota ?? '' })
    return r
  })
  const [niveles, setNiveles] = useState<Record<number, number>>(() => {
    const r: Record<number, number> = {}
    comanda.items.forEach(i => { r[i.id] = i.nivel ?? suggestNivel(i.nombre, menu) })
    return r
  })
  const [notaModal, setNotaModal] = useState<{ itemId: number; value: string } | null>(null)
  const [oidoAnim, setOidoAnim] = useState(false)
  const [barraOpen, setBarraOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Swipe horizontal = salir del modal sin enviar (los niveles locales se descartan, como la ✕)
  const swipeSalirRef = useRef<{ x: number; y: number } | null>(null)

  const addItem = useMutation({
    mutationFn: (item: MenuItem) => {
      const tipo: 'cocina' | 'barra' = esGrupoBarra(catMeta[item.categoria] ?? '') ? 'barra' : 'cocina'
      return api.comandas.addItem(comanda.id, { nombre: item.nombre, precio: item.precio, cantidad: 1, tipo })
    },
    onSuccess: () => {
      setSearch('')
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
      comanda.items.forEach(item => {
        if (!(item.id in next)) { next[item.id] = item.nivel ?? suggestNivel(item.nombre, menu); changed = true }
      })
      return changed ? next : prev
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
    <div className="fixed inset-0 bg-black/80 flex items-stretch sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--sala-hdr)] w-full sm:max-w-md sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]" onClick={e => e.stopPropagation()}
        onTouchStart={e => { swipeSalirRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const st = swipeSalirRef.current
          swipeSalirRef.current = null
          if (!st) return
          const dx = e.changedTouches[0].clientX - st.x
          const dy = e.changedTouches[0].clientY - st.y
          if (Math.abs(dx) > 90 && Math.abs(dy) < 70) onClose()
        }}>
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[var(--sala-txt)] font-bold text-lg">
                {marchaPasa ? '🔁 Marcha Pasa' : 'Orden de salida'}
              </h3>
              <p className="text-[var(--sala-tx2)] text-xs mt-0.5">Mesa {comanda.mesa.numero} · {itemsActivos.length} cocina · {itemsBarra.length} barra</p>
            </div>
            <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
          </div>
          {/* Search rápido para añadir items */}
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Añadir algo más… buscar plato o bebida"
              className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-[var(--sala-tx4)] pr-8" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-sm">✕</button>
            )}
          </div>
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
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-[var(--sala-txt)] text-sm font-black shrink-0">{nv}</div>
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); if (nv > 1) itemsEnNivel.forEach(i => moveItem(i.id, -1)) }} disabled={nv <= 1}
                      className="w-7 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-xs font-black hover:bg-cyan-600/60 disabled:opacity-20 flex items-center justify-center">▲</button>
                    <button onClick={e => { e.stopPropagation(); itemsEnNivel.forEach(i => moveItem(i.id, 1)) }}
                      className="w-7 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-xs font-black hover:bg-cyan-600/60 flex items-center justify-center">▼</button>
                  </div>
                  <span className="text-[var(--sala-tx2)] text-xs font-semibold uppercase tracking-wide">Salida {nv}</span>
                  <div className="flex-1 h-px bg-[var(--sala-btn)]" />
                </div>
                <div className="space-y-2">
                  {itemsEnNivel.map(item => (
                    <div key={item.id} className={`bg-[var(--sala-srf)] rounded-xl overflow-hidden ${notaModal?.itemId === item.id ? 'ring-2 ring-cyan-500' : ''}`}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-1.5 self-stretch rounded-full bg-cyan-600/40 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[var(--sala-txt)] font-medium text-sm">{item.nombre}</span>
                          {notas[item.id] && <p className="text-[var(--sala-tx2)] text-xs mt-0.5 truncate">{notas[item.id]}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={e => { e.stopPropagation(); if (item.cantidad > 1) updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 }); else deleteItem.mutate(item.id) }}
                            className="w-9 h-9 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">−</button>
                          <span className="text-[var(--sala-txt)] font-black text-lg w-6 text-center">{item.cantidad}</span>
                          <button onClick={e => { e.stopPropagation(); updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 }) }}
                            className="w-9 h-9 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">+</button>
                          <button onClick={e => { e.stopPropagation(); setNotaModal(m => m?.itemId === item.id ? null : { itemId: item.id, value: notas[item.id] ?? '' }) }}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center ${notas[item.id] ? 'bg-cyan-600' : 'bg-[var(--sala-btn)] hover:bg-gray-600'}`}>
                            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                              <path d="M4 2 L20 2 Q22 2 22 4 L22 15 Q22 17 20 17 L14 17 L11 21 L8 17 L4 17 Q2 17 2 15 L2 4 Q2 2 4 2 Z" fill={notas[item.id] ? 'white' : '#9ca3af'} />
                              <path d="M7 10 L11 14 L17 6" stroke={notas[item.id] ? '#06b6d4' : '#374151'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </button>
                          <button onClick={e => { e.stopPropagation(); moveItem(item.id, -1) }} disabled={(niveles[item.id] ?? 1) <= 1}
                            className="w-10 h-10 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-base font-black hover:bg-gray-500 disabled:opacity-20 flex items-center justify-center active:scale-90">▲</button>
                          <button onClick={e => { e.stopPropagation(); moveItem(item.id, 1) }}
                            className="w-10 h-10 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-txt)] text-base font-black hover:bg-gray-500 flex items-center justify-center active:scale-90">▼</button>
                        </div>
                      </div>
                      {notaModal?.itemId === item.id && (
                        <div className="px-4 pb-4">
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

        <div className="p-4 border-t border-[var(--sala-brd)]">
          <button onClick={e => {
            e.stopPropagation()
            if (oidoAnim) return
            setOidoAnim(true)
            setTimeout(() => {
              setOidoAnim(false)
              const nivelesArray = Object.entries(nivelesActivos).map(([id, nivel]) => ({ itemId: Number(id), nivel, nota: notas[Number(id)] ?? '' }))
              const barraArray  = itemsBarra.map(i => ({ itemId: i.id, nivel: 1, nota: notas[i.id] ?? '' }))
              const autoArray   = autoItemsPendientes.map(i => ({ itemId: i.id, nivel: 1, nota: '' }))
              onEnviar([...nivelesArray, ...barraArray, ...autoArray])
            }, 500)
          }} className="w-full rounded-2xl flex items-center justify-center gap-3 py-4 active:scale-95 transition-all">
            <span style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontWeight: 800, fontSize: '2rem', color: '#4CC8A0', opacity: oidoAnim ? 0 : 1, transition: 'opacity 0.15s' }}>
              Oído
            </span>
            <svg viewBox="0 0 68 72" className="w-14 h-14" style={{ filter: 'drop-shadow(0 0 10px rgba(76,200,160,0.55))' }}>
              <defs>
                <linearGradient id="oido-modal-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4B9EDF" />
                  <stop offset="100%" stopColor="#4CC8A0" />
                </linearGradient>
              </defs>
              <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#oido-modal-grad)" />
              <path d="M15 34 L29 48 L55 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"
                strokeDasharray={60} strokeDashoffset={oidoAnim ? 0 : 60}
                style={{ transition: oidoAnim ? 'stroke-dashoffset 0.4s ease-out' : 'none' }} />
            </svg>
          </button>
        </div>
      </div>
    </div>
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

// ── Fila de item reutilizable ─────────────────────────────────────────────────
function ItemRow({ item, nota, setNota, onUpdate, onDelete, onSaveNota, onMerma, onRepeat, onInvitar }: {
  item: ComandaItem
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

// ── Panel comanda (modo camarero) ─────────────────────────────────────────────
function ComandaPanel({ comanda, menu, categorias, onClose, onEnviar, onLiberar, onCambiarMesa, onFacturar, esEncargado }: {
  comanda: Comanda; menu: MenuItem[]; categorias: MenuCategoria[]
  onClose: () => void
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[], silent?: boolean) => void
  onLiberar: () => void
  onCambiarMesa?: () => void
  onFacturar?: () => void
  esEncargado?: boolean
}) {
  const queryClient = useQueryClient()
  // Pestaña inicial: si la mesa ya está toda comandada (sin pendientes), se entra para pedir
  // algo más → directo a la carta. Con pendientes sin enviar o cuenta impresa → vista del pedido.
  const [tab, setTab] = useState<'pedido' | 'menu'>(() => {
    if (comanda.estado === 'facturada' || comanda.estado === 'liberada') return 'pedido'
    const hayPendientesSinEnviar = comanda.items.some(i => i.nivel == null && !i.autoGenerado)
    return hayPendientesSinEnviar ? 'pedido' : 'menu'
  })
  const [searchMenu, setSearchMenu] = useState('')
  const [grupoTab, setGrupoTab] = useState<string | null>(null)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const swipeRef = useRef<number | null>(null)
  const [nota, setNota] = useState<{ itemId: number; value: string } | null>(null)
  const [addedId, setAddedId] = useState<number | null>(null)
  const [qtyPending, setQtyPending] = useState<{ id: number; qty: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notaNueva, setNotaNueva] = useState<{ item: MenuItem; qty: number; value: string } | null>(null)
  const [mixerPick, setMixerPick] = useState<MenuItem | null>(null)
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const [ordenando, setOrdenando] = useState(false)
  // Reordenar TODOS los niveles (no solo pendientes) — comandas ya enviadas / menús de grupo
  const [ordenarFull, setOrdenarFull] = useState(false)
  const [verCuenta, setVerCuenta] = useState(false)
  const [mermaItem, setMermaItem] = useState<ComandaItem | null>(null)
  const [confirmarCerrar, setConfirmarCerrar] = useState(false)
  const [oidoAnim, setOidoAnim] = useState(false)
  const [dotsAnim, setDotsAnim] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null)
  const [fabDragging, setFabDragging] = useState(false)

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

  const STORAGE_KEY_FAB = `sala_lupa_pos_${camareroSesion?.id ?? 'def'}`

  useEffect(() => {
    if (!panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    let pos = { x: rect.width - 68, y: rect.height - 180 }
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FAB)
      if (saved) {
        const parsed = JSON.parse(saved)
        pos = {
          x: Math.min(Math.max(8, parsed.x), rect.width - 56),
          y: Math.min(Math.max(8, parsed.y), rect.height - 56),
        }
      }
    } catch {}
    setFabPos(pos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (!panelRef.current) return
    const fabBtn = e.currentTarget
    const panelRect = panelRef.current.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startPos = fabPos ?? { x: 0, y: 0 }
    let dragActive = false
    let curX = startPos.x
    let curY = startPos.y

    const longPressId = setTimeout(() => {
      dragActive = true
      setFabDragging(true)
      try { fabBtn.setPointerCapture(e.pointerId) } catch {}
      if ('vibrate' in navigator) navigator.vibrate(40)
    }, 450)

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!dragActive) {
        if (Math.hypot(dx, dy) > 12) clearTimeout(longPressId)
        return
      }
      curX = Math.min(Math.max(8, startPos.x + dx), panelRect.width - 56)
      curY = Math.min(Math.max(8, startPos.y + dy), panelRect.height - 56)
      setFabPos({ x: curX, y: curY })
    }

    const onUp = () => {
      clearTimeout(longPressId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (dragActive) {
        setFabDragging(false)
        try { localStorage.setItem(STORAGE_KEY_FAB, JSON.stringify({ x: curX, y: curY })) } catch {}
      } else {
        // Tap corto → abre buscador
        if (tab !== 'menu') setTab('menu')
        setTimeout(() => searchInputRef.current?.focus(), 60)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

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
    onSuccess: (_, { item }) => {
      setAddedId(item.id)
      setTimeout(() => setAddedId(null), 1000)
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
    onSuccess: (_, { item }) => {
      setAddedId(item.id)
      setTimeout(() => setAddedId(null), 1000)
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

  const handleMenuItemTap = (item: MenuItem) => {
    if (qtyPending?.id === item.id) {
      const newQty = qtyPending.qty + 1
      setQtyPending({ id: item.id, qty: newQty })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => commitQty(item, newQty), 1500)
    } else {
      if (qtyPending && timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        addItem.mutate({ item: menu.find(m => m.id === qtyPending.id)!, cantidad: qtyPending.qty })
        setQtyPending(null)
      }
      setQtyPending({ id: item.id, qty: 1 })
      timerRef.current = setTimeout(() => commitQty(item, 1), 1500)
    }
  }

  // ── Long-press sobre un plato → box de comentario antes de añadir ──
  const startLongPress = (item: MenuItem) => {
    lpFired.current = false
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
    const isAdded   = addedId === item.id
    return (
      <button key={item.id} onClick={() => tapItem(item)}
        onPointerDown={() => startLongPress(item)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress}
        onTouchMove={cancelLongPress} onContextMenu={e => e.preventDefault()}
        className={`w-full text-left rounded-xl px-4 py-3.5 transition-colors relative overflow-hidden select-none ${isPending ? 'bg-[var(--sala-srf2)] border-2 border-[#4CC8A0]' : 'bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'}`}>
        <span className="text-[var(--sala-txt)] text-base font-medium">{item.nombre}</span>
        {item.descripcion ? <p className="text-[var(--sala-tx3)] text-xs mt-0.5 truncate">{item.descripcion}</p> : null}
        {item.combinable && !isPending && !isAdded && (
          <span className="absolute right-3 inset-y-0 flex items-center text-[var(--sala-tx3)] text-sm font-bold">🥤+</span>
        )}
        {isPending && <span className="absolute right-3 inset-y-0 flex items-center"><span className="text-[#4CC8A0] font-black text-2xl">{qtyPending!.qty}×</span></span>}
        {isAdded && (
          <span className="absolute inset-0 flex items-center justify-center bg-[var(--sala-srf)] rounded-xl" style={{ animation: 'fadeInOut 1s ease forwards' }}>
            <svg viewBox="0 0 52 58" className="h-8 w-8"><defs><linearGradient id="lgfbs3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4B9EDF"/><stop offset="100%" stopColor="#4CC8A0"/></linearGradient></defs><path d="M8 2 L44 2 Q50 2 50 8 L50 38 Q50 44 44 44 L32 44 L26 52 L20 44 L8 44 Q2 44 2 38 L2 8 Q2 2 8 2 Z" fill="url(#lgfbs3)"/><path d="M14 22 L23 31 L38 13" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div ref={panelRef} className="relative w-full sm:max-w-md bg-[var(--sala-hdr)] h-full flex flex-col shadow-2xl border-l border-[var(--sala-brd)]" onClick={e => e.stopPropagation()}
        onTouchStart={e => { swipeCloseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={e => {
          const s = swipeCloseRef.current
          swipeCloseRef.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x
          const dy = e.changedTouches[0].clientY - s.y
          // Cualquier dirección horizontal (como el swipe de niveles de la carta)
          if (Math.abs(dx) <= 90 || Math.abs(dy) >= 70) return
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
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[var(--sala-txt)] font-bold text-xl">
                Mesa {comanda.mesa.numero}
                <span className="ml-2 text-sm font-bold text-amber-400 tabular-nums align-middle">
                  🕐 {fmtHora(comanda.enviadaAt ?? comanda.createdAt)}
                </span>
              </h2>
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
          <div className="flex gap-1.5 mt-3 items-stretch">
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
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'pedido' && (
            <>
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
                  <p className="text-sm">Sin items. Ve a "Añadir".</p>
                </div>
              )}
              {(() => {
                const itemsCocina = comanda.items.filter(i => i.tipo !== 'barra').sort((a, b) => a.id - b.id)
                const itemsBarra  = comanda.items.filter(i => i.tipo === 'barra').sort((a, b) => a.id - b.id)
                const tienenNivel = itemsCocina.some(i => i.nivel != null)

                return (
                  <div className="space-y-4">
                    {/* Reordenar niveles — mismas herramientas que el orden de salida original */}
                    {tienenNivel && !yaFacturada && (
                      <button onClick={() => setOrdenarFull(true)}
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-cyan-700/50 text-cyan-400 text-sm font-bold active:scale-[0.98] transition-transform hover:border-cyan-500/70">
                        🔀 Ordenar salidas (mover platos y niveles)
                      </button>
                    )}
                    {/* ── Cocina ── */}
                    {!tienenNivel ? (
                      // Comanda nueva: lista plana
                      <div className="space-y-2">
                        {itemsCocina.map((item: ComandaItem) => (
                          <ItemRow key={item.id} item={item} nota={nota} setNota={setNota}
                            onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                            onDelete={() => deleteItem.mutate(item.id)}
                            onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                            onMerma={() => setMermaItem(item)}
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
                                <div className="space-y-2">
                                  {pendientesCocina.map((item: ComandaItem) => (
                                    <ItemRow key={item.id} item={item} nota={nota} setNota={setNota}
                                      onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                                      onDelete={() => deleteItem.mutate(item.id)}
                                      onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                                      onMerma={() => setMermaItem(item)}
                                    onInvitar={esEncargado ? () => invitarItem.mutate({ item }) : undefined} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Confirmados por nivel — debajo */}
                            {Array.from({ length: maxNivel }, (_, i) => i + 1).map(nv => {
                              const items = enviados.filter(i => i.nivel === nv)
                              if (!items.length) return null
                              return (
                                <div key={nv}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-full bg-cyan-600 flex items-center justify-center text-[var(--sala-txt)] text-xs font-black shrink-0">{nv}</div>
                                    <span className="text-[var(--sala-tx2)] text-xs font-semibold uppercase tracking-wide">Salida {nv}</span>
                                    <div className="flex-1 h-px bg-[var(--sala-btn)]" />
                                  </div>
                                  <div className="space-y-2">
                                    {items.map((item: ComandaItem) => (
                                      <ItemRow key={item.id} item={item} nota={nota} setNota={setNota}
                                        onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                                        onDelete={() => deleteItem.mutate(item.id)}
                                        onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                                        onMerma={() => setMermaItem(item)}
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
                              <ItemRow key={firstItem.id} item={{ ...firstItem, cantidad }} nota={nota} setNota={setNota}
                                onUpdate={newQty => updateItem.mutate({ itemId: firstItem.id, cantidad: firstItem.cantidad + (newQty - cantidad) })}
                                onDelete={() => deleteItem.mutate(firstItem.id)}
                                onSaveNota={v => saveNota.mutate({ itemId: firstItem.id, value: v })}
                                onMerma={() => setMermaItem(firstItem)}
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
            </>
          )}

          {tab === 'menu' && (
            <div className="flex flex-col h-full">
              {/* Marcha pasa en curso — visible mientras se añaden items */}
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
              {/* Search global + modo sin cocina (encargado) */}
              <div className={`px-2.5 pt-2 pb-1.5 border-b border-[var(--sala-brd)] ${modoSinCocina ? 'bg-amber-500/10' : ''}`}>
                <div className="flex items-center gap-2">
                  <input ref={searchInputRef} value={searchMenu} onChange={e => { setSearchMenu(e.target.value); setSelectedCat(null); setSelectedSub(null) }}
                    placeholder="Buscar en todo el menú…"
                    className="flex-1 bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xs px-3 py-1.5 rounded-lg outline-none placeholder:text-[var(--sala-tx4)]" />
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
                {modoSinCocina && (
                  <p className="text-amber-500 text-[11px] font-bold mt-1.5">
                    ⚠️ Los items que añadas NO saldrán por cocina/barra — entran directo a la cuenta
                  </p>
                )}
              </div>

              {searchMenu.trim() ? (
                /* ── Resultados de búsqueda (lista plana) ── */
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                  {filteredMenu.map((item: MenuItem) => {
                    const isPending = qtyPending?.id === item.id
                    const isAdded   = addedId === item.id
                    return (
                      <button key={item.id} onClick={() => tapItem(item)}
                        onPointerDown={() => startLongPress(item)} onPointerUp={cancelLongPress} onPointerLeave={cancelLongPress}
                        onTouchMove={cancelLongPress} onContextMenu={e => e.preventDefault()}
                        className={`w-full text-left rounded-xl px-4 py-3 transition-colors relative overflow-hidden select-none ${isPending ? 'bg-[var(--sala-srf2)] border-2 border-[#4CC8A0]' : 'bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'}`}>
                        <p className="text-[var(--sala-txt)] text-sm font-medium">{item.nombre}</p>
                        <p className="text-[var(--sala-tx3)] text-xs">{item.categoria}</p>
                        {isPending && <span className="absolute right-3 inset-y-0 flex items-center"><span className="text-[#4CC8A0] font-black text-2xl">{qtyPending!.qty}×</span></span>}
                        {isAdded && (
                          <span className="absolute inset-0 flex items-center justify-center bg-[var(--sala-srf)] rounded-xl" style={{ animation: 'fadeInOut 1s ease forwards' }}>
                            <svg viewBox="0 0 52 58" className="h-8 w-8"><defs><linearGradient id="lgfbs2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4B9EDF"/><stop offset="100%" stopColor="#4CC8A0"/></linearGradient></defs><path d="M8 2 L44 2 Q50 2 50 8 L50 38 Q50 44 44 44 L32 44 L26 52 L20 44 L8 44 Q2 44 2 38 L2 8 Q2 2 8 2 Z" fill="url(#lgfbs2)"/><path d="M14 22 L23 31 L38 13" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                          </span>
                        )}
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
                    if (swipeRef.current !== null && Math.abs(e.changedTouches[0].clientX - swipeRef.current) > 80)
                      selectedSub ? setSelectedSub(null) : setSelectedCat(null)
                    swipeRef.current = null
                  }}>
                  <button onClick={() => selectedSub ? setSelectedSub(null) : setSelectedCat(null)}
                    className="flex items-center gap-2 px-4 py-3 text-cyan-400 text-sm font-semibold w-full border-b border-[var(--sala-brd)] hover:bg-[var(--sala-btn2)]/40">
                    ← {selectedSub ?? selectedCat}
                  </button>
                  {selectedSub ? (
                    /* ── Nivel 4: items de la subcategoría ── */
                    <div className="p-4 space-y-1.5">
                      {itemsDeCat(selectedSub).map(renderItemBtn)}
                    </div>
                  ) : (
                    <>
                      {/* Tiles de subcategoría (mismo diseño que las categorías) */}
                      {subcatsDe(selectedCat).length > 0 && (
                        <div className="p-2 grid grid-cols-3 gap-2">
                          {subcatsDe(selectedCat).map(sc => {
                            const count = itemsDeCat(sc.nombre).length
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
                                <span className="text-[var(--sala-txt)] text-lg font-black uppercase tracking-wide text-center leading-tight px-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sc.nombre}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {/* Items directos de la categoría */}
                      <div className="p-4 pt-2 space-y-1.5">
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
                    if (swipeRef.current !== null && Math.abs(e.changedTouches[0].clientX - swipeRef.current) > 80 && grupos.length > 1)
                      setGrupoTab(null)
                    swipeRef.current = null
                  }}>
                  <div className="grid grid-cols-3 gap-2">
                    {categoriasSorted.map(cat => {
                      const meta = categorias.find(c => c.nombre === cat)
                      const count = menuByCategoria[cat]?.length ?? 0
                      const esBarra = esGrupoBarra(meta?.grupo ?? '')
                      return (
                        <button key={cat} onClick={() => { setSelectedCat(cat); setSelectedSub(null) }}
                          className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1.5 p-2 active:scale-95 transition-all border ${
                            esBarra
                              ? 'bg-amber-500/[0.06] border-amber-600/25 hover:bg-amber-500/10 hover:border-amber-500/40'
                              : 'bg-[var(--sala-srf)] border-[var(--sala-brd)]/50 hover:bg-[var(--sala-srf2)] hover:border-cyan-700/40'
                          }`}>
                          <span className={`absolute top-1.5 right-2 text-xs font-semibold tabular-nums ${esBarra ? 'text-amber-500/80' : 'text-[var(--sala-tx4)]'}`}>{count}</span>
                          <span className="text-4xl leading-none">{meta?.icono ?? '🍽'}</span>
                          <span className="text-[var(--sala-txt)] text-lg font-black uppercase tracking-wide text-center leading-tight px-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cat}</span>
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

        {/* FAB volver — un nivel atrás (backup del swipe) */}
        {tab === 'menu' && (selectedSub || selectedCat || (grupoTab && grupos.length > 1)) && !searchMenu.trim() && (
          <button
            onClick={() => selectedSub ? setSelectedSub(null) : selectedCat ? setSelectedCat(null) : setGrupoTab(null)}
            aria-label="Volver a categorías"
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-16 h-16 rounded-full grid place-items-center text-white active:scale-90 transition-transform"
            style={{
              background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)',
              boxShadow: '0 4px 20px rgba(76,200,160,0.45), 0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}

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
        <div className="px-3 py-2 border-t border-[var(--sala-brd)]">
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
              ) : esEncargado && (
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
              className={`w-full rounded-xl grid grid-cols-3 items-center py-2 px-4 transition-all active:scale-95 ${hayPendientes ? '' : 'opacity-25 cursor-default'}`}>
              {/* Texto "Oído" — izquierda */}
              <span className="justify-self-start" style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontWeight: 800,
                fontSize: '1.5rem',
                color: hayPendientes ? '#4CC8A0' : '#6b7280',
                opacity: oidoAnim ? 0 : 1,
                transition: 'opacity 0.15s',
              }}>
                Oído
              </span>
              {/* Viñeta — centro (target del tap) */}
              <svg viewBox="0 0 68 72" className="w-10 h-10 justify-self-center" style={{ filter: hayPendientes ? 'drop-shadow(0 0 8px rgba(76,200,160,0.55))' : 'none' }}>
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
                {/* Check — animado al tocar, mismas coordenadas que el logo */}
                <path d="M15 34 L29 48 L55 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"
                  strokeDasharray={60} strokeDashoffset={oidoAnim ? 0 : 60}
                  style={{ transition: oidoAnim ? 'stroke-dashoffset 0.4s ease-out' : 'none' }} />
              </svg>
              {/* Euros — derecha */}
              <span className="justify-self-end text-[var(--sala-txt)] text-lg font-bold tabular-nums">{total.toFixed(2)} €</span>
            </button>
          )}
        </div>


        {/* Lupa flotante — tap: enfoca búsqueda · long-press: arrastrar */}
        {fabPos && (
          <button
            onPointerDown={handleFabPointerDown}
            style={{ left: fabPos.x, top: fabPos.y, touchAction: 'none' }}
            className={`absolute z-50 w-12 h-12 rounded-full bg-cyan-600 text-white shadow-lg flex items-center justify-center select-none ${fabDragging ? 'scale-110 ring-4 ring-cyan-400/40 transition-none' : 'opacity-85 hover:opacity-100 hover:bg-cyan-500 transition-all'}`}
            aria-label="Buscar"
            title="Tap: buscar · Mantén pulsado: mover"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        )}
      </div>

      {(ordenando || ordenarFull) && (
        <OrdenarModal comanda={comanda} menu={menu} categorias={categorias}
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

  const volver = () => { window.speechSynthesis?.cancel(); setActivo(null) }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div className="w-full bg-[var(--sala-hdr)] rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--sala-btna)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-[var(--sala-brd)] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {activo && (
              <button onClick={volver} className="text-[var(--sala-tx3)] text-lg shrink-0">←</button>
            )}
            <div className="min-w-0">
              <h2 className="text-[var(--sala-txt)] font-bold text-lg truncate">{activo ? activo.titulo : '📖 Wiki'}</h2>
              {!activo && <p className="text-[var(--sala-tx3)] text-xs mt-0.5">Speeches y protocolos</p>}
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

        {/* Vista lista: artículos clicables agrupados por categoría */}
        {!activo && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {isLoading && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Cargando…</p>}
            {!isLoading && conContenido.length === 0 && (
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

  const { data: turnos, isLoading } = useQuery({
    queryKey: ['mis-turnos', camarero.id],
    queryFn: () => api.propinas.misTurnos(camarero.id, desde),
  })

  const totalMes    = turnos?.reduce((s, t) => s + t.propina, 0) ?? 0
  const totalHoras  = turnos?.reduce((s, t) => s + t.horas,  0) ?? 0

  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

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
            <p className="text-[#4CC8A0] text-xs font-semibold">{restaurantNombre}</p>
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

        {/* Lista de turnos */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {isLoading && <p className="text-[var(--sala-tx4)] text-sm text-center py-6">Cargando…</p>}
          {!isLoading && !turnos?.length && (
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
  onClose,
  onDone,
}: {
  restaurantId: number
  mesa: Mesa
  pax: number
  camareroNombre?: string
  menu: MenuItem[]
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
  // ración base para todos + sube a la ración alta los platos más baratos mientras quepa
  useEffect(() => {
    if (!template) return
    const platos = template.niveles.flatMap(nv => (nv.platos ?? []).map(nombre => ({ nombre, nivel: nv.nivel })))
    const sugeridas = sugerirCantidadesMenu(platos, pax, template.paxPorRacion || 3, priceMap, template.precio)
    const init: Record<string, number> = {}
    for (const p of sugeridas) init[k(p.nivel, p.nombre)] = p.cantidad
    setQtys(init)
    setExtras([])
    setPickerNivel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

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
                <label className="flex items-center gap-1.5 text-xs text-[var(--sala-tx2)] ml-auto">
                  <input type="checkbox" checked={incluyePostre} onChange={e => setPostre(e.target.checked)} className="accent-[#4CC8A0]" />
                  incluir postre
                </label>
              </div>
              {/* Presupuesto: precio del menú × pax vs coste en carta de lo seleccionado */}
              <div className="mt-2">
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className={overBudget ? 'text-red-400' : 'text-[var(--sala-tx3)]'}>
                    {overBudget ? '⚠️ Se pasa del menú' : 'Valor en carta'}: {spent.toFixed(2)} €
                  </span>
                  <span className="text-[var(--sala-tx3)]">Menú: {budget.toFixed(2)} €</span>
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
                <span className="text-[var(--sala-tx2)] text-xs font-semibold uppercase tracking-wide">{nv.nombre || `Salida ${nv.nivel}`}</span>
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

  const cobrar = useMutation({
    mutationFn: ({ metodo, propina }: { metodo: 'cash' | 'tarjeta'; propina: number }) =>
      api.comandas.cerrar(comanda.id, metodo, propina),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enc-cobros'] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
      onDone?.()
      onClose()
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

function EncargadoPanel({
  restaurant,
  camarero,
  turnoActivo,
  onClose,
  onAbrirComanda,
}: {
  restaurant: { id: number; nombre: string }
  camarero: { nombre: string }
  turnoActivo: Turno | null
  onClose: () => void
  onAbrirComanda?: (comandaId: number) => void
}) {
  const queryClient = useQueryClient()
  const rid = restaurant.id
  const [tab, setTab] = useState<'cobros' | 'turno' | 'checklists' | 'mermas' | 'reviews'>('cobros')
  const [armadoCierre, setArmadoCierre] = useState(false)
  const [resumenCierre, setResumenCierre] = useState<Turno | null>(null)
  const [cobroDe, setCobroDe] = useState<Comanda | null>(null)

  const { data: reviewsList = [] } = useQuery({
    queryKey: ['reviews-dashboard'],
    queryFn: () => api.reviews.list(),
    enabled: tab === 'reviews',
    refetchInterval: 60_000,
  })
  const reviewData = reviewsList.find(r => r.restaurantId === rid) ?? null

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
    mutationFn: () => api.turnos.cerrar(turnoActivo!.id),
    onSuccess: t => {
      setArmadoCierre(false)
      setResumenCierre(t)
      queryClient.invalidateQueries({ queryKey: ['turno-activo', rid] })
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

  const TABS = [
    { key: 'cobros' as const, label: `💶 Cobros${pendientes.length ? ` (${pendientes.length})` : ''}` },
    { key: 'turno' as const, label: '⏱ Turno' },
    { key: 'checklists' as const, label: '✅ Checklists' },
    { key: 'mermas' as const, label: '🗑 Mermas' },
    { key: 'reviews' as const, label: '⭐ Reviews' },
  ]

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="relative w-full sm:max-w-md bg-[var(--sala-hdr)] h-full flex flex-col shadow-2xl border-l border-[var(--sala-brd)]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">💼 Modo encargado</p>
              <h2 className="text-[var(--sala-txt)] font-bold text-xl">{camarero.nombre}</h2>
            </div>
            <div className="flex items-center gap-4">
              <RelojSala />
              <button onClick={onClose} className="text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)] text-xl">✕</button>
            </div>
          </div>
          <div className="flex gap-1.5 mt-3 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  tab === t.key ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
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
                  {armadoCierre ? (
                    <div className="flex gap-2">
                      <button onClick={() => setArmadoCierre(false)}
                        className="flex-1 py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
                        Cancelar
                      </button>
                      <button onClick={() => cerrarTurno.mutate()} disabled={cerrarTurno.isPending}
                        className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-black active:scale-95 transition-transform disabled:opacity-50">
                        {cerrarTurno.isPending ? 'Cerrando…' : '¿Seguro? Cerrar turno'}
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
                        <p className="text-[var(--sala-tx2)] text-sm">última consulta {fmtHora(reviewData.fecha)}</p>
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

// ── Página principal camarero ─────────────────────────────────────────────────
export default function SalaMesasPage() {
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

  useRestaurantEvents(restaurant?.id ?? null)

  useEffect(() => {
    if (!restaurant) navigate('/sala/setup', { replace: true })
    else if (!camarero) navigate('/sala', { replace: true })
  }, [])

  const [planId, setPlanId]               = useState<number | null>(null)
  const [abrirMesa, setAbrirMesa]         = useState<Mesa | null>(null)
  const [comandaAbierta, setComandaAbierta] = useState<number | null>(null)
  const [view, setView] = useState<'mapa' | 'mesas' | 'nueva'>('mapa')
  const [showPerfil, setShowPerfil]       = useState(false)
  const [showMoverMesa, setShowMoverMesa] = useState(false)
  const [animFacturada, setAnimFacturada] = useState(false)
  const [showProduccion, setShowProduccion] = useState(false)
  const [showWiki, setShowWiki] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [showEncargado, setShowEncargado] = useState(false)
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
    mutationFn: ({ mesaId, pax }: { mesaId: number; pax: number }) =>
      api.comandas.abrir(restaurant!.id, mesaId, pax, camarero?.nombre),
    onSuccess: comanda => {
      setAbrirMesa(null)
      setComandaAbierta(comanda.id)
      queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurant?.id] })
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
        // Comandada exitosa → viñeta OidoOps central con la tilde animada
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

  const comandaByMesa = (mesaId: number) => comandas?.find(c => c.mesaId === mesaId)

  const handleMesaClick = (mesa: Mesa) => {
    const comanda = comandaByMesa(mesa.id)
    if (comanda) setComandaAbierta(comanda.id)
    else setAbrirMesa(mesa)
  }

  const todasLasMesas = planes?.flatMap(p => p.mesas.map(m => ({ ...m, planNombre: p.nombre }))) ?? []
  const mesasLibres   = todasLasMesas.filter(m => !comandaByMesa(m.id))

  const estadoBadge = (c: Comanda) => {
    if (c.estado === 'facturada') return { label: '🧾 Cuenta', color: 'text-amber-400 bg-amber-500/10' }
    if (c.estado === 'enviada')   return { label: '🚀 Enviada', color: 'text-purple-400 bg-purple-500/10' }
    return { label: '● Abierta', color: 'text-[#4CC8A0] bg-[#4CC8A0]/10' }
  }

  if (!restaurant || !camarero) return null

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
        {esEncargado ? (
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
      </div>
    )
  }

  return (
    <ThemeCtx.Provider value={isDark}>
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
            {/* Modo encargado */}
            {esEncargado && (
              <button
                onClick={() => setShowEncargado(true)}
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
            <button onClick={() => { sessionStorage.removeItem('oidoops_camarero'); navigate('/sala', { replace: true }) }}
              aria-label="Salir" title="Salir (cerrar sesión)"
              className="text-[var(--sala-tx3)] hover:text-red-400 transition-colors active:scale-90">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        {/* Vista tabs — botones cuadrados continuos */}
        <div className="order-1 flex items-center gap-1.5">
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

      {/* Vista: Mapa — escala bounding box para llenar ancho y alto */}
      {view === 'mapa' && (activePlan ? (
        <div className="flex-1 overflow-hidden relative" ref={el => {
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
              <MesaBtn key={mesa.id} mesa={mesa} comanda={comandaByMesa(mesa.id)} onClick={() => handleMesaClick(mesa)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--sala-tx4)] text-sm">No hay planos configurados.</p>
        </div>
      ))}

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
          onMenuGrupo={pax => { setMenuGrupo({ mesa: abrirMesa, pax }); setAbrirMesa(null) }} />
      )}

      {menuGrupo && (
        <MenuGrupoSheet
          restaurantId={restaurant.id}
          mesa={menuGrupo.mesa}
          pax={menuGrupo.pax}
          camareroNombre={camarero?.nombre}
          menu={menu ?? []}
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
          onClose={() => setComandaAbierta(null)}
          onEnviar={(niveles, silent) => enviarComanda.mutate({ id: comandaAbierta, niveles, silent })}
          onLiberar={() => liberarMesa.mutate(comandaAbierta)}
          onCambiarMesa={comandaDetalle.estado !== 'facturada' ? () => setShowMoverMesa(true) : undefined}
          onFacturar={() => { setAnimFacturada(true); setTimeout(() => setAnimFacturada(false), 1800) }}
          esEncargado={esEncargado} />
      )}

      {animFacturada && <CheckOverlay />}

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
        />
      )}
    </div>
    </ThemeCtx.Provider>
  )
}
