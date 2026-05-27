import { useState, useEffect, useRef, createContext, useContext } from 'react'

const ThemeCtx = createContext<boolean>(true) // true = dark
import CheckOverlay from '../components/CheckOverlay'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem, FloorPlan, GrupoAgendado, InventarioCategoria, Mesa, MenuCategoria, MenuItem, MermaMotivo, MiTurno } from '../api'
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

const CATEGORIA_NIVEL: Record<string, number> = {
  'Classic Tapas':    1,
  'Vegetarian Tapas': 2,
  'Fish Tapas':       3,
  'Meat Tapas':       4,
  'Rice':             4,
  'Pasta':            5,
}
const COLD_KEYWORDS = ['tartare','tatar','burrata','stracciatella','carpaccio','anchovies','ham','cheese','salchichón','jamón','crudo']

function suggestNivel(nombre: string, menu: MenuItem[]): number {
  const menuItem = menu.find(m => m.nombre === nombre)
  const base = CATEGORIA_NIVEL[menuItem?.categoria ?? ''] ?? 3
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
function AbrirMesaModal({ mesa, onConfirm, onClose }: { mesa: Mesa; onConfirm: (pax: number) => void; onClose: () => void }) {
  const [pax, setPax] = useState(2)
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-[var(--sala-txt)] font-bold text-lg mb-1">Mesa {mesa.numero}</h3>
        <p className="text-[var(--sala-tx2)] text-sm mb-6">¿Cuántos comensales?</p>
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setPax(p => Math.max(1, p - 1))} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl hover:bg-gray-600">−</button>
          <span className="flex-1 text-center text-[var(--sala-txt)] text-5xl font-bold">{pax}</span>
          <button onClick={() => setPax(p => p + 1)} className="w-14 h-14 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-txt)] text-3xl hover:bg-gray-600">+</button>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] font-medium">Cancelar</button>
          <button onClick={() => onConfirm(pax)} className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold">Abrir mesa</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal ver cuenta (para el camarero, sin cobrar) ───────────────────────────
function VerCuentaModal({ comanda, onClose, onFacturar }: { comanda: Comanda; onClose: () => void; onFacturar: () => void }) {
  const total = comanda.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
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
            <div key={item.id} className="flex items-center justify-between">
              <span className="text-[var(--sala-tx1)] text-sm">{item.cantidad > 1 && <span className="text-cyan-400 font-bold mr-1">{item.cantidad}×</span>}{item.nombre}</span>
              <span className="text-[var(--sala-txt)] font-semibold text-sm">{(item.precio * item.cantidad).toFixed(2)} €</span>
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
  const GRUPOS_BARRA = ['Bebidas', 'Vinos']
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

  const addItem = useMutation({
    mutationFn: (item: MenuItem) => {
      const tipo: 'cocina' | 'barra' = GRUPOS_BARRA.includes(catMeta[item.categoria] ?? '') ? 'barra' : 'cocina'
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
      <div className="bg-[var(--sala-hdr)] w-full sm:max-w-md sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
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
              {menu.filter(m => m.activo && m.nombre.toLowerCase().includes(search.toLowerCase())).slice(0, 8).map(item => (
                <button key={item.id} onClick={() => addItem.mutate(item)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 active:bg-gray-600 border-b border-[var(--sala-brd)]/50 last:border-0">
                  <span className="text-[var(--sala-txt)] text-sm text-left">{item.nombre}</span>
                  <span className="text-[var(--sala-tx2)] text-xs shrink-0 ml-2">{item.precio.toFixed(2)} €</span>
                </button>
              ))}
              {menu.filter(m => m.activo && m.nombre.toLowerCase().includes(search.toLowerCase())).length === 0 && (
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

function MermaModal({ item, onConfirm, onClose }: {
  item: ComandaItem
  onConfirm: (motivo: MermaMotivo, descripcion?: string, cantidad?: number) => void
  onClose: () => void
}) {
  const [motivo, setMotivo] = useState<MermaMotivo | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState(item.cantidad)

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
            <button key={m.value} onClick={() => setMotivo(m.value)}
              className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                motivo === m.value
                  ? 'bg-red-900/40 border-red-500'
                  : 'bg-[var(--sala-srf)] border-transparent hover:border-[var(--sala-brd2)]'
              }`}>
              <p className={`font-semibold text-sm ${motivo === m.value ? 'text-red-300' : 'text-[var(--sala-txt)]'}`}>{m.label}</p>
              <p className="text-[var(--sala-tx3)] text-xs mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>

        {motivo === 'otro' && (
          <input
            autoFocus
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Describe el motivo…"
            className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm px-4 py-3 rounded-xl outline-none mb-4"
          />
        )}

        <button
          onClick={() => motivo && onConfirm(motivo, descripcion || undefined, cantidad)}
          disabled={!motivo || (motivo === 'otro' && !descripcion.trim())}
          className="w-full py-4 rounded-2xl bg-red-600 text-[var(--sala-txt)] font-bold text-base disabled:opacity-30 active:scale-95 transition-all"
        >
          Confirmar merma {item.cantidad > 1 && `(${cantidad}×)`}
        </button>
      </div>
    </div>
  )
}

// ── Fila de item reutilizable ─────────────────────────────────────────────────
function ItemRow({ item, nota, setNota, onUpdate, onDelete, onSaveNota, onMerma, onRepeat }: {
  item: ComandaItem
  nota: { itemId: number; value: string } | null
  setNota: (v: { itemId: number; value: string } | null) => void
  onUpdate: (cantidad: number) => void
  onDelete: () => void
  onSaveNota: (v: string) => void
  onMerma?: () => void
  onRepeat?: () => void
}) {
  return (
    <div className="bg-[var(--sala-srf)] rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => item.cantidad > 1 ? onUpdate(item.cantidad - 1) : onDelete()}
            className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm hover:bg-gray-600 flex items-center justify-center">−</button>
          <span className="text-[var(--sala-txt)] font-bold w-5 text-center">{item.cantidad}</span>
          <button onClick={() => onUpdate(item.cantidad + 1)}
            className="w-8 h-8 rounded-lg bg-[var(--sala-btn)] text-[var(--sala-tx1)] text-sm hover:bg-gray-600 flex items-center justify-center">+</button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--sala-txt)] text-sm font-medium truncate">{item.nombre}</p>
          {item.nota && <p className="text-[var(--sala-tx3)] text-xs truncate">{item.nota}</p>}
        </div>
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
function ComandaPanel({ comanda, menu, categorias, onClose, onEnviar, onLiberar, onCambiarMesa, onFacturar }: {
  comanda: Comanda; menu: MenuItem[]; categorias: MenuCategoria[]
  onClose: () => void
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[], silent?: boolean) => void
  onLiberar: () => void
  onCambiarMesa?: () => void
  onFacturar?: () => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'pedido' | 'menu'>(comanda.items.every(i => i.autoGenerado) ? 'menu' : 'pedido')
  const [searchMenu, setSearchMenu] = useState('')
  const [grupoTab, setGrupoTab] = useState<string | null>(null)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const swipeRef = useRef<number | null>(null)
  const [nota, setNota] = useState<{ itemId: number; value: string } | null>(null)
  const [addedId, setAddedId] = useState<number | null>(null)
  const [qtyPending, setQtyPending] = useState<{ id: number; qty: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const [verCuenta, setVerCuenta] = useState(false)
  const [mermaItem, setMermaItem] = useState<ComandaItem | null>(null)
  const [confirmarCerrar, setConfirmarCerrar] = useState(false)
  const [oidoAnim, setOidoAnim] = useState(false)
  const [dotsAnim, setDotsAnim] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null)
  const [fabDragging, setFabDragging] = useState(false)

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

  const total = comanda.items.reduce((s, i) => s + i.precio * i.cantidad, 0)

  const GRUPOS_BARRA = ['Bebidas', 'Vinos']
  const getTipo = (item: MenuItem): 'cocina' | 'barra' =>
    GRUPOS_BARRA.includes(catMeta[item.categoria]?.grupo ?? '') ? 'barra' : 'cocina'

  const addItem = useMutation({
    mutationFn: ({ item, cantidad }: { item: MenuItem; cantidad: number }) =>
      api.comandas.addItem(comanda.id, { nombre: item.nombre, precio: item.precio, cantidad, tipo: getTipo(item) }),
    onSuccess: (_, { item }) => {
      setAddedId(item.id)
      setTimeout(() => setAddedId(null), 1000)
      setDotsAnim(true)
      setTimeout(() => setDotsAnim(false), 1600)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
    },
  })

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

  const updateItem = useMutation({
    mutationFn: ({ itemId, cantidad }: { itemId: number; cantidad: number }) =>
      api.comandas.updateItem(comanda.id, itemId, { cantidad }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] }),
  })
  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api.comandas.deleteItem(comanda.id, itemId),
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

  // Grupos únicos ordenados
  const grupos = [...new Set(categorias.map(c => c.grupo || 'Otros'))]
  const grupoActivo = grupoTab ?? grupos[0] ?? null

  const filteredMenu = menu.filter(m =>
    m.activo &&
    m.nombre.toLowerCase().includes(searchMenu.toLowerCase()) &&
    (!grupoActivo || (catMeta[m.categoria]?.grupo ?? 'Otros') === grupoActivo)
  )
  const menuByCategoria = filteredMenu.reduce<Record<string, MenuItem[]>>((acc, m) => {
    if (!acc[m.categoria]) acc[m.categoria] = []
    acc[m.categoria].push(m)
    return acc
  }, {})
  const categoriasSorted = Object.keys(menuByCategoria).sort((a, b) =>
    (catMeta[a]?.orden ?? 99) - (catMeta[b]?.orden ?? 99)
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div ref={panelRef} className="relative w-full sm:max-w-md bg-[var(--sala-hdr)] h-full flex flex-col shadow-2xl border-l border-[var(--sala-brd)]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[var(--sala-txt)] font-bold text-xl">Mesa {comanda.mesa.numero}</h2>
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
          <div className="flex gap-1 mt-3">
            {(['pedido','menu'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-[var(--sala-btn)] text-[var(--sala-txt)]' : 'text-[var(--sala-tx3)] hover:text-[var(--sala-tx1)]'}`}>
                {t === 'pedido' ? `Pedido (${comanda.items.length})` : 'Añadir'}
              </button>
            ))}
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
                    {/* ── Cocina ── */}
                    {!tienenNivel ? (
                      // Comanda nueva: lista plana
                      <div className="space-y-2">
                        {itemsCocina.map((item: ComandaItem) => (
                          <ItemRow key={item.id} item={item} nota={nota} setNota={setNota}
                            onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                            onDelete={() => deleteItem.mutate(item.id)}
                            onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                            onMerma={() => setMermaItem(item)} />
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
                                      onMerma={() => setMermaItem(item)} />
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
                                onMerma={() => setMermaItem(firstItem)} />
                            ))}
                          </div>
                        </div>
                      )
                    })()}
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
              {/* Grupo tabs + search */}
              <div className="px-2.5 pt-2 pb-1.5 space-y-1.5 border-b border-[var(--sala-brd)]">
                {grupos.length > 1 && (
                  <div className="flex gap-1 overflow-x-auto pb-0.5">
                    {grupos.map(g => (
                      <button key={g} onClick={() => { setGrupoTab(g); setSelectedCat(null); setSearchMenu('') }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                          grupoActivo === g ? 'bg-cyan-600 text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)] hover:bg-gray-700'
                        }`}>
                        {g}
                      </button>
                    ))}
                  </div>
                )}
                <input ref={searchInputRef} value={searchMenu} onChange={e => { setSearchMenu(e.target.value); setSelectedCat(null) }}
                  placeholder="Buscar plato o bebida…"
                  className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xs px-3 py-1.5 rounded-lg outline-none placeholder:text-[var(--sala-tx4)]" />
              </div>

              {searchMenu.trim() ? (
                /* ── Resultados de búsqueda (lista plana) ── */
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                  {filteredMenu.map((item: MenuItem) => {
                    const isPending = qtyPending?.id === item.id
                    const isAdded   = addedId === item.id
                    return (
                      <button key={item.id} onClick={() => handleMenuItemTap(item)}
                        className={`w-full text-left rounded-xl px-4 py-3 transition-colors relative overflow-hidden ${isPending ? 'bg-[var(--sala-srf2)] border-2 border-[#4CC8A0]' : 'bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'}`}>
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
                /* ── Items de la categoría seleccionada ── */
                <div className="flex-1 overflow-y-auto"
                  onTouchStart={e => { swipeRef.current = e.touches[0].clientX }}
                  onTouchEnd={e => {
                    if (swipeRef.current !== null && e.changedTouches[0].clientX - swipeRef.current > 80)
                      setSelectedCat(null)
                    swipeRef.current = null
                  }}>
                  <button onClick={() => setSelectedCat(null)}
                    className="flex items-center gap-2 px-4 py-3 text-cyan-400 text-sm font-semibold w-full border-b border-[var(--sala-brd)] hover:bg-[var(--sala-btn2)]/40">
                    ← {selectedCat}
                  </button>
                  <div className="p-4 space-y-1.5">
                    {(menu.filter(m => m.activo && m.categoria === selectedCat)).map((item: MenuItem) => {
                      const isPending = qtyPending?.id === item.id
                      const isAdded   = addedId === item.id
                      return (
                        <button key={item.id} onClick={() => handleMenuItemTap(item)}
                          className={`w-full text-left rounded-xl px-4 py-3.5 transition-colors relative overflow-hidden ${isPending ? 'bg-[var(--sala-srf2)] border-2 border-[#4CC8A0]' : 'bg-[var(--sala-srf)] hover:bg-[var(--sala-srf2)]'}`}>
                          <span className="text-[var(--sala-txt)] text-base font-medium">{item.nombre}</span>
                          {item.descripcion ? <p className="text-[var(--sala-tx3)] text-xs mt-0.5 truncate">{item.descripcion}</p> : null}
                          {isPending && <span className="absolute right-3 inset-y-0 flex items-center"><span className="text-[#4CC8A0] font-black text-2xl">{qtyPending!.qty}×</span></span>}
                          {isAdded && (
                            <span className="absolute inset-0 flex items-center justify-center bg-[var(--sala-srf)] rounded-xl" style={{ animation: 'fadeInOut 1s ease forwards' }}>
                              <svg viewBox="0 0 52 58" className="h-8 w-8"><defs><linearGradient id="lgfbs3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4B9EDF"/><stop offset="100%" stopColor="#4CC8A0"/></linearGradient></defs><path d="M8 2 L44 2 Q50 2 50 8 L50 38 Q50 44 44 44 L32 44 L26 52 L20 44 L8 44 Q2 44 2 38 L2 8 Q2 2 8 2 Z" fill="url(#lgfbs3)"/><path d="M14 22 L23 31 L38 13" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* ── Lista compacta de categorías (PADs/Handys) ── */
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                  {categoriasSorted.map(cat => {
                    const meta = categorias.find(c => c.nombre === cat)
                    const count = menuByCategoria[cat]?.length ?? 0
                    const esBarra = GRUPOS_BARRA.includes(meta?.grupo ?? '')
                    return (
                      <button key={cat} onClick={() => setSelectedCat(cat)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--sala-srf)] active:scale-[0.98] transition-all hover:bg-[var(--sala-srf2)] border border-[var(--sala-brd)]/50 hover:border-cyan-700/40">
                        <span className="text-2xl leading-none shrink-0 w-7 text-center">{meta?.icono ?? '🍽'}</span>
                        <span className="flex-1 text-left text-[var(--sala-txt)] text-sm font-semibold truncate">{cat}</span>
                        <span className={`text-[11px] font-medium tabular-nums ${esBarra ? 'text-amber-500' : 'text-[var(--sala-tx3)]'}`}>{count}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--sala-tx4)] shrink-0">
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

        {/* Footer */}
        <div className="px-3 py-2 border-t border-[var(--sala-brd)]">
          {yaFacturada ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2 py-1.5 bg-amber-500/10 rounded-lg">
                <span className="text-amber-400 text-xs font-bold">🧾 Cuenta impresa — pendiente de cobro</span>
              </div>
              <button onClick={e => { e.stopPropagation(); onLiberar() }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#4CC8A0] text-[var(--sala-txt)] font-bold text-base active:scale-95 transition-all flex items-center justify-between">
                <span>Mesa libre 🔓</span>
                <span className="tabular-nums">{total.toFixed(2)} €</span>
              </button>
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

      {ordenando && (
        <OrdenarModal comanda={comanda} menu={menu} categorias={categorias}
          marchaPasa={esMarchaPasa}
          onClose={() => setOrdenando(false)}
          onEnviar={niveles => { onEnviar(niveles); setOrdenando(false) }} />
      )}
      {confirmarCerrar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-[var(--sala-srf)] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <p className="text-[var(--sala-txt)] font-bold text-base mb-1">¿Descartar cambios?</p>
            <p className="text-[var(--sala-tx2)] text-sm mb-5">
              {itemsNuevos.length === 1
                ? 'Hay 1 item sin enviar que se eliminará.'
                : `Hay ${itemsNuevos.length} items sin enviar que se eliminarán.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarCerrar(false)}
                className="flex-1 py-3 rounded-xl bg-[var(--sala-btn)] text-[var(--sala-tx1)] font-medium">
                Cancelar
              </button>
              <button onClick={async () => {
                await Promise.all(itemsNuevos.map(i => api.comandas.deleteItem(comanda.id, i.id)))
                setConfirmarCerrar(false)
                onClose()
              }} className="flex-1 py-3 rounded-xl bg-red-600 text-[var(--sala-txt)] font-bold">
                Descartar
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
    const targetTotal = targetComanda.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
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
                  <span className="text-[var(--sala-tx4)]">{(item.precio * item.cantidad).toFixed(2)} €</span>
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
function PerfilPanel({ camarero, onClose }: { camarero: { id: number; nombre: string }; onClose: () => void }) {
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
            <h2 className="text-[var(--sala-txt)] font-bold text-lg">{camarero.nombre}</h2>
            <p className="text-[var(--sala-tx3)] text-xs mt-0.5">Propinas este mes</p>
          </div>
          <button onClick={onClose} className="text-[var(--sala-tx3)] text-xl">✕</button>
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
        <p className="text-[var(--sala-tx3)] text-sm">El encargado debe abrir el turno desde el panel de sala antes de que puedas usar las mesas.</p>
      </div>
    )
  }

  return (
    <ThemeCtx.Provider value={isDark}>
    <div data-sala-theme={isDark ? 'dark' : 'light'} className="flex flex-col h-screen bg-[var(--sala-bg)]">
      {/* Header */}
      <div className="bg-[var(--sala-hdr)] border-b border-[var(--sala-brd)] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowPerfil(true)} className="text-left group">
            <p className="text-[#4CC8A0] text-xs font-semibold">{restaurant.nombre}</p>
            <p className="text-[var(--sala-tx2)] text-xs group-hover:text-[var(--sala-tx1)] transition-colors">
              👤 {camarero.nombre}
            </p>
          </button>
          <div className="flex items-center gap-3">
            {/* Producción */}
            <button
              onClick={() => setShowProduccion(true)}
              title="Registrar producción"
              className="text-[var(--sala-tx2)] hover:text-[#4CC8A0] text-lg transition-colors"
            >
              ⚗️
            </button>
            {/* Theme toggle pill */}
            <button onClick={toggleTheme} title={isDark ? 'Modo claro' : 'Modo oscuro'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: isDark ? '#1e2d45' : '#e2e8f0',
                border: `1.5px solid ${isDark ? '#374151' : '#cbd5e1'}`,
                borderRadius: 20, padding: '4px 8px', cursor: 'pointer',
                transition: 'all 0.25s',
              }}>
              {/* Moon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ opacity: isDark ? 1 : 0.35, transition: 'opacity 0.25s' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={isDark ? '#818cf8' : '#94a3b8'} />
              </svg>
              {/* Sliding dot */}
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: isDark ? '#818cf8' : '#f59e0b',
                boxShadow: isDark ? '0 0 8px #818cf866' : '0 0 8px #f59e0b99',
                transition: 'all 0.25s',
              }} />
              {/* Sun */}
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
            <button onClick={() => { sessionStorage.removeItem('oidoops_camarero'); navigate('/sala', { replace: true }) }}
              className="text-[var(--sala-tx4)] text-xs hover:text-[var(--sala-tx2)]">
              Salir
            </button>
          </div>
        </div>
        {/* Vista tabs */}
        <div className="flex items-center gap-2">
          {/* Mapa */}
          <button onClick={() => setView('mapa')}
            aria-label="Mapa" title="Mapa"
            className={`px-3 py-1.5 rounded-lg transition-colors inline-flex items-center justify-center ${
              view === 'mapa' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)] hover:bg-gray-700'
            }`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a14 14 0 0 1 0 18" />
              <path d="M12 3a14 14 0 0 0 0 18" />
            </svg>
          </button>

          {/* Selector de planta — solo en vista Mapa */}
          {view === 'mapa' && planes && planes.length > 1 && planes.map(p => {
            const lower = p.nombre.toLowerCase()
            const isAlta = lower.includes('alta')
            const isBaja = lower.includes('baja')
            const showIcon = isAlta || isBaja
            return (
              <button key={p.id} onClick={() => setPlanId(p.id)}
                aria-label={p.nombre} title={p.nombre}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center justify-center ${activePlan?.id === p.id ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>
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
                  p.nombre
                )}
              </button>
            )
          })}

          {/* Mesas */}
          <button onClick={() => setView('mesas')}
            aria-label="Mesas" title="Mesas"
            className={`px-3 py-1.5 rounded-lg transition-colors inline-flex items-center justify-center ${
              view === 'mesas' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)] hover:bg-gray-700'
            }`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10h18" />
              <path d="M4 10V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
              <path d="M7 10v9" />
              <path d="M17 10v9" />
            </svg>
          </button>

          {/* Nueva */}
          <button onClick={() => setView('nueva')}
            aria-label="Nueva" title="Nueva"
            className={`px-3 py-1.5 rounded-lg transition-colors inline-flex items-center justify-center ${
              view === 'nueva' ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)] hover:bg-gray-700'
            }`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
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
          onConfirm={pax => abrirComanda.mutate({ mesaId: abrirMesa.id, pax })} />
      )}

      {comandaAbierta && comandaDetalle && (
        <ComandaPanel comanda={comandaDetalle} menu={menu ?? []} categorias={menuCategorias}
          onClose={() => setComandaAbierta(null)}
          onEnviar={(niveles, silent) => enviarComanda.mutate({ id: comandaAbierta, niveles, silent })}
          onLiberar={() => liberarMesa.mutate(comandaAbierta)}
          onCambiarMesa={comandaDetalle.estado !== 'facturada' ? () => setShowMoverMesa(true) : undefined}
          onFacturar={() => { setAnimFacturada(true); setTimeout(() => setAnimFacturada(false), 1800) }} />
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
        <PerfilPanel camarero={camarero} onClose={() => setShowPerfil(false)} />
      )}
      {showProduccion && (
        <ProduccionSalaModal
          restaurantId={restaurant.id}
          camareroNombre={camarero.nombre}
          onClose={() => setShowProduccion(false)}
        />
      )}
    </div>
    </ThemeCtx.Provider>
  )
}
