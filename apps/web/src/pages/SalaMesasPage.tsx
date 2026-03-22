import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem, Mesa, MenuCategoria, MenuItem, MermaMotivo, MiTurno } from '../api'

const SQUARE_SIZE = 80
const RECT_W = 160
const RECT_H = 80

function mesaWidth(tipo: Mesa['tipo'])  { return tipo === 'rectangular' ? RECT_W : SQUARE_SIZE }
function mesaHeight(tipo: Mesa['tipo']) { return tipo === 'rectangular' ? RECT_H : SQUARE_SIZE }

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
  const w = mesaWidth(mesa.tipo)
  const h = mesaHeight(mesa.tipo)
  const libre      = !comanda
  const enviada    = comanda?.estado === 'enviada'
  const facturada  = comanda?.estado === 'facturada'
  const isRound    = mesa.tipo === 'round'

  const bg     = libre ? '#1e2d45' : facturada ? '#2d2500' : enviada ? '#2d1a3a' : '#1a3a2e'
  const border = libre ? '#334155' : facturada ? '#f59e0b' : enviada ? '#a855f7' : '#4CC8A0'
  const glow   = libre ? 'none'    : facturada ? '0 0 16px #f59e0b44' : enviada ? '0 0 16px #a855f744' : '0 0 16px #4CC8A044'

  return (
    <div onClick={onClick} style={{
      position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
      borderRadius: isRound ? '50%' : mesa.tipo === 'rectangular' ? '14px' : '16px',
      background: bg, border: `2px solid ${border}`, boxShadow: glow,
      cursor: 'pointer', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', userSelect: 'none',
      transition: 'all 0.2s',
    }}>
      <span style={{ color: libre ? '#94a3b8' : facturada ? '#f59e0b' : enviada ? '#c084fc' : '#4CC8A0', fontWeight: 800, fontSize: 18 }}>
        {mesa.numero}
      </span>
      {!libre ? (
        <>
          <span style={{ color: facturada ? '#fcd34d' : enviada ? '#d8b4fe' : '#6ee7b7', fontSize: 10, marginTop: 2 }}>{comanda!.pax} pax</span>
          <span style={{ color: facturada ? '#f59e0b' : enviada ? '#a855f7' : '#34d399', fontSize: 9, marginTop: 1 }}>
            {facturada ? '🧾 cuenta' : enviada ? '🚀 enviada' : timeAgo(comanda!.createdAt)}
          </span>
        </>
      ) : (
        <span style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>libre</span>
      )}
    </div>
  )
}

// ── Modal abrir mesa ──────────────────────────────────────────────────────────
function AbrirMesaModal({ mesa, onConfirm, onClose }: { mesa: Mesa; onConfirm: (pax: number) => void; onClose: () => void }) {
  const [pax, setPax] = useState(2)
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1e2d45] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-1">Mesa {mesa.numero}</h3>
        <p className="text-gray-400 text-sm mb-6">¿Cuántos comensales?</p>
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setPax(p => Math.max(1, p - 1))} className="w-14 h-14 rounded-xl bg-gray-700 text-white text-3xl hover:bg-gray-600">−</button>
          <span className="flex-1 text-center text-white text-5xl font-bold">{pax}</span>
          <button onClick={() => setPax(p => p + 1)} className="w-14 h-14 rounded-xl bg-gray-700 text-white text-3xl hover:bg-gray-600">+</button>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-medium">Cancelar</button>
          <button onClick={() => onConfirm(pax)} className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-white font-bold">Abrir mesa</button>
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
      <div className="bg-[#0f172a] w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">Mesa {comanda.mesa.numero}</h3>
            <p className="text-gray-400 text-sm">{comanda.pax} pax</p>
          </div>
          <button onClick={onClose} className="text-gray-500 text-xl">✕</button>
        </div>
        <div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
          {comanda.items.map(item => (
            <div key={item.id} className="flex items-center justify-between">
              <span className="text-gray-300 text-sm">{item.cantidad > 1 && <span className="text-cyan-400 font-bold mr-1">{item.cantidad}×</span>}{item.nombre}</span>
              <span className="text-white font-semibold text-sm">{(item.precio * item.cantidad).toFixed(2)} €</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between">
          <span className="text-gray-400 font-medium">Total</span>
          <span className="text-white text-3xl font-black">{total.toFixed(2)} €</span>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onFacturar} className="w-full py-4 rounded-2xl bg-[#f59e0b] text-white font-bold text-lg">
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
  const todosPendientes = marchaPasa ? comanda.items.filter(i => i.nivel == null) : comanda.items
  // Solo los items de cocina necesitan asignación de nivel
  const itemsActivos = todosPendientes.filter(i => i.tipo !== 'barra')
  const itemsBarra   = todosPendientes.filter(i => i.tipo === 'barra')

  const sorted = [...itemsActivos].sort((a, b) =>
    (niveles[a.id] ?? suggestNivel(a.nombre, menu)) - (niveles[b.id] ?? suggestNivel(b.nombre, menu))
  )
  const nivelesActivos = Object.fromEntries(itemsActivos.map(i => [i.id, niveles[i.id] ?? suggestNivel(i.nombre, menu)]))
  const maxNivel = Math.max(...Object.values(nivelesActivos), 1)

  return (
    <div className="fixed inset-0 bg-black/80 flex items-stretch sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#0f172a] w-full sm:max-w-md sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-bold text-lg">
                {marchaPasa ? '🔁 Marcha Pasa' : 'Orden de salida'}
              </h3>
              <p className="text-gray-400 text-xs mt-0.5">Mesa {comanda.mesa.numero} · {itemsActivos.length} cocina · {itemsBarra.length} barra</p>
            </div>
            <button onClick={onClose} className="text-gray-500 text-xl">✕</button>
          </div>
          {/* Search rápido para añadir items */}
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Añadir algo más… buscar plato o bebida"
              className="w-full bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl outline-none placeholder:text-gray-600 pr-8" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm">✕</button>
            )}
          </div>
          {/* Resultados del search */}
          {search.trim().length > 0 && (
            <div className="mt-1.5 bg-gray-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {menu.filter(m => m.activo && m.nombre.toLowerCase().includes(search.toLowerCase())).slice(0, 8).map(item => (
                <button key={item.id} onClick={() => addItem.mutate(item)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 active:bg-gray-600 border-b border-gray-700/50 last:border-0">
                  <span className="text-white text-sm text-left">{item.nombre}</span>
                  <span className="text-gray-400 text-xs shrink-0 ml-2">{item.precio.toFixed(2)} €</span>
                </button>
              ))}
              {menu.filter(m => m.activo && m.nombre.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                <p className="text-gray-600 text-sm px-4 py-3">Sin resultados</p>
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
                  <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-white text-sm font-black shrink-0">{nv}</div>
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); if (nv > 1) itemsEnNivel.forEach(i => moveItem(i.id, -1)) }} disabled={nv <= 1}
                      className="w-7 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-xs font-black hover:bg-cyan-600/60 disabled:opacity-20 flex items-center justify-center">▲</button>
                    <button onClick={e => { e.stopPropagation(); itemsEnNivel.forEach(i => moveItem(i.id, 1)) }}
                      className="w-7 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-xs font-black hover:bg-cyan-600/60 flex items-center justify-center">▼</button>
                  </div>
                  <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Salida {nv}</span>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>
                <div className="space-y-2">
                  {itemsEnNivel.map(item => (
                    <div key={item.id} className={`bg-[#1e2d45] rounded-xl overflow-hidden ${notaModal?.itemId === item.id ? 'ring-2 ring-cyan-500' : ''}`}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-1.5 self-stretch rounded-full bg-cyan-600/40 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium text-sm">{item.nombre}</span>
                          {notas[item.id] && <p className="text-gray-400 text-xs mt-0.5 truncate">{notas[item.id]}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={e => { e.stopPropagation(); if (item.cantidad > 1) updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 }); else deleteItem.mutate(item.id) }}
                            className="w-9 h-9 rounded-lg bg-gray-700 text-gray-300 text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">−</button>
                          <span className="text-white font-black text-lg w-6 text-center">{item.cantidad}</span>
                          <button onClick={e => { e.stopPropagation(); updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 }) }}
                            className="w-9 h-9 rounded-lg bg-gray-700 text-gray-300 text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">+</button>
                          <button onClick={e => { e.stopPropagation(); setNotaModal(m => m?.itemId === item.id ? null : { itemId: item.id, value: notas[item.id] ?? '' }) }}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center ${notas[item.id] ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                              <path d="M4 2 L20 2 Q22 2 22 4 L22 15 Q22 17 20 17 L14 17 L11 21 L8 17 L4 17 Q2 17 2 15 L2 4 Q2 2 4 2 Z" fill={notas[item.id] ? 'white' : '#9ca3af'} />
                              <path d="M7 10 L11 14 L17 6" stroke={notas[item.id] ? '#06b6d4' : '#374151'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </button>
                          <button onClick={e => { e.stopPropagation(); moveItem(item.id, -1) }} disabled={(niveles[item.id] ?? 1) <= 1}
                            className="w-10 h-10 rounded-lg bg-gray-700 text-white text-base font-black hover:bg-gray-500 disabled:opacity-20 flex items-center justify-center active:scale-90">▲</button>
                          <button onClick={e => { e.stopPropagation(); moveItem(item.id, 1) }}
                            className="w-10 h-10 rounded-lg bg-gray-700 text-white text-base font-black hover:bg-gray-500 flex items-center justify-center active:scale-90">▼</button>
                        </div>
                      </div>
                      {notaModal?.itemId === item.id && (
                        <div className="px-4 pb-4">
                          <input autoFocus value={notaModal.value}
                            onChange={e => setNotaModal(m => m ? { ...m, value: e.target.value } : null)}
                            onKeyDown={e => { if (e.key === 'Enter') { setNotas(prev => ({ ...prev, [item.id]: notaModal.value })); setNotaModal(null) } }}
                            placeholder="Sin gluten, sin cebolla…"
                            className="w-full bg-gray-800 text-white text-sm px-4 py-3 rounded-xl outline-none placeholder:text-gray-600" />
                          <div className="flex gap-2 mt-2">
                            <button onClick={e => { e.stopPropagation(); setNotaModal(null) }} className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-400 text-sm">Cancelar</button>
                            <button onClick={e => { e.stopPropagation(); setNotas(prev => ({ ...prev, [item.id]: notaModal.value })); setNotaModal(null) }} className="flex-1 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold">Guardar</button>
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
          <div className="border-t border-gray-800">
            <button onClick={() => setBarraOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-800/40 transition-colors">
              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">🍺 Barra ({itemsBarra.length})</span>
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-gray-500 text-xs">{barraOpen ? '▲' : '▼'}</span>
            </button>
            {barraOpen && (
              <div className="px-4 pb-3 space-y-1.5">
                {itemsBarra.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-gray-800/60 rounded-xl px-3 py-2">
                    <span className="text-gray-300 text-sm flex-1 truncate">{item.nombre}</span>
                    <button onClick={e => { e.stopPropagation(); if (item.cantidad > 1) updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 }); else deleteItem.mutate(item.id) }}
                      className="w-8 h-8 rounded-lg bg-gray-700 text-gray-300 text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">−</button>
                    <span className="text-white font-black w-5 text-center">{item.cantidad}</span>
                    <button onClick={e => { e.stopPropagation(); updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 }) }}
                      className="w-8 h-8 rounded-lg bg-gray-700 text-gray-300 text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90">+</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t border-gray-700">
          <button onClick={e => {
            e.stopPropagation()
            if (oidoAnim) return
            setOidoAnim(true)
            setTimeout(() => {
              setOidoAnim(false)
              const nivelesArray = Object.entries(nivelesActivos).map(([id, nivel]) => ({ itemId: Number(id), nivel, nota: notas[Number(id)] ?? '' }))
              const barraArray = itemsBarra.map(i => ({ itemId: i.id, nivel: 1, nota: notas[i.id] ?? '' }))
              onEnviar([...nivelesArray, ...barraArray])
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
  onConfirm: (motivo: MermaMotivo, descripcion?: string) => void
  onClose: () => void
}) {
  const [motivo, setMotivo] = useState<MermaMotivo | null>(null)
  const [descripcion, setDescripcion] = useState('')

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end z-[70]" onClick={onClose}>
      <div className="bg-[#0f172a] w-full rounded-t-3xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-base">Registrar merma</h3>
            <p className="text-gray-400 text-xs mt-0.5">{item.cantidad}× {item.nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 text-xl">✕</button>
        </div>

        <div className="space-y-2 mb-4">
          {MOTIVOS.map(m => (
            <button key={m.value} onClick={() => setMotivo(m.value)}
              className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${
                motivo === m.value
                  ? 'bg-red-900/40 border-red-500'
                  : 'bg-[#1e2d45] border-transparent hover:border-gray-600'
              }`}>
              <p className={`font-semibold text-sm ${motivo === m.value ? 'text-red-300' : 'text-white'}`}>{m.label}</p>
              <p className="text-gray-500 text-xs mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>

        {motivo === 'otro' && (
          <input
            autoFocus
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Describe el motivo…"
            className="w-full bg-gray-800 text-white text-sm px-4 py-3 rounded-xl outline-none mb-4"
          />
        )}

        <button
          onClick={() => motivo && onConfirm(motivo, descripcion || undefined)}
          disabled={!motivo || (motivo === 'otro' && !descripcion.trim())}
          className="w-full py-4 rounded-2xl bg-red-600 text-white font-bold text-base disabled:opacity-30 active:scale-95 transition-all"
        >
          Confirmar merma
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
    <div className="bg-[#1e2d45] rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => item.cantidad > 1 ? onUpdate(item.cantidad - 1) : onDelete()}
            className="w-8 h-8 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 flex items-center justify-center">−</button>
          <span className="text-white font-bold w-5 text-center">{item.cantidad}</span>
          <button onClick={() => onUpdate(item.cantidad + 1)}
            className="w-8 h-8 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 flex items-center justify-center">+</button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{item.nombre}</p>
          {item.nota && <p className="text-gray-500 text-xs truncate">{item.nota}</p>}
        </div>
        <button onClick={() => setNota(nota?.itemId === item.id ? null : { itemId: item.id, value: item.nota ?? '' })}
          className="text-gray-600 text-xs hover:text-gray-400 shrink-0">nota</button>
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
            className="flex-1 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none" />
          <button onClick={() => onSaveNota(nota.value)} className="text-xs px-3 py-1.5 bg-cyan-600 text-white rounded-lg">OK</button>
          <button onClick={() => setNota(null)} className="text-xs text-gray-500">✕</button>
        </div>
      )}
    </div>
  )
}

// ── Panel comanda (modo camarero) ─────────────────────────────────────────────
function ComandaPanel({ comanda, menu, categorias, onClose, onEnviar }: {
  comanda: Comanda; menu: MenuItem[]; categorias: MenuCategoria[]
  onClose: () => void
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[], silent?: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'pedido' | 'menu'>(comanda.items.length === 0 ? 'menu' : 'pedido')
  const [searchMenu, setSearchMenu] = useState('')
  const [grupoTab, setGrupoTab] = useState<string | null>(null)
  const [nota, setNota] = useState<{ itemId: number; value: string } | null>(null)
  const [addedId, setAddedId] = useState<number | null>(null)
  const [qtyPending, setQtyPending] = useState<{ id: number; qty: number } | null>(null)
  const timerRef = { current: null as ReturnType<typeof setTimeout> | null }
  const [ordenando, setOrdenando] = useState(false)
  const [verCuenta, setVerCuenta] = useState(false)
  const [animFacturada, setAnimFacturada] = useState(false)
  const [mermaItem, setMermaItem] = useState<ComandaItem | null>(null)
  const [oidoAnim, setOidoAnim] = useState(false)
  const [dotsAnim, setDotsAnim] = useState(false)

  const yaEnviada    = comanda.estado === 'enviada'
  const yaFacturada  = comanda.estado === 'facturada'
  const itemsNuevos       = comanda.items.filter(i => i.nivel == null)
  const itemsNuevosCocina = itemsNuevos.filter(i => i.tipo !== 'barra')
  const itemsNuevosBarra  = itemsNuevos.filter(i => i.tipo === 'barra')
  const esMarchaPasa  = !yaEnviada && !yaFacturada && itemsNuevosCocina.length > 0 && comanda.items.some(i => i.nivel != null)
  const hayPendientes = itemsNuevos.length > 0

  const handleOido = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (oidoAnim) return
    setOidoAnim(true)
    setTimeout(() => {
      setOidoAnim(false)
      if (itemsNuevosCocina.length > 0) setOrdenando(true)
      else onEnviar(itemsNuevosBarra.map(i => ({ itemId: i.id, nivel: 1 })), true)
    }, 500)
  }

  const camareroSesion = (() => {
    try { return JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '') }
    catch { return null }
  })()

  const registrarMerma = useMutation({
    mutationFn: ({ motivo, descripcion }: { motivo: MermaMotivo; descripcion?: string }) =>
      api.mermas.create({
        restaurantId:   comanda.restaurantId,
        mesaNumero:     comanda.mesa.numero,
        planNombre:     undefined,
        comandaId:      comanda.id,
        itemNombre:     mermaItem!.nombre,
        cantidad:       mermaItem!.cantidad,
        camareroNombre: camareroSesion?.nombre ?? undefined,
        motivo,
        descripcion,
      }),
    onSuccess: async () => {
      await api.comandas.deleteItem(comanda.id, mermaItem!.id)
      setMermaItem(null)
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
    },
  })

  const facturarComanda = useMutation({
    mutationFn: () => api.comandas.facturar(comanda.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comanda-sala', comanda.id] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
      setVerCuenta(false)
      setAnimFacturada(true)
      setTimeout(() => { setAnimFacturada(false); onClose() }, 1800)
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
      <div className="w-full sm:max-w-md bg-[#0f172a] h-full flex flex-col shadow-2xl border-l border-gray-700" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-700">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-white font-bold text-xl">Mesa {comanda.mesa.numero}</h2>
              <p className="text-gray-400 text-sm">{comanda.pax} pax · {timeAgo(comanda.createdAt)}</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl mt-1">✕</button>
          </div>
          <div className="flex gap-1 mt-3">
            {(['pedido','menu'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'pedido' ? `Pedido (${comanda.items.length})` : 'Añadir'}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'pedido' && (
            <div className="p-4">
              {comanda.items.length === 0 && (
                <div className="text-center py-12 text-gray-600">
                  <p className="text-3xl mb-2">🍽</p>
                  <p className="text-sm">Sin items. Ve a "Añadir".</p>
                </div>
              )}
              {(() => {
                const itemsCocina = comanda.items.filter(i => i.tipo !== 'barra')
                const itemsBarra  = comanda.items.filter(i => i.tipo === 'barra')
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
                      // Comanda enviada: agrupar por nivel
                      (() => {
                        const maxNivel = Math.max(...itemsCocina.map(i => i.nivel ?? 1))
                        return (
                          <div className="space-y-4">
                            {Array.from({ length: maxNivel }, (_, i) => i + 1).map(nv => {
                              const items = itemsCocina.filter(i => (i.nivel ?? 1) === nv)
                              if (!items.length) return null
                              return (
                                <div key={nv}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-7 h-7 rounded-full bg-cyan-600 flex items-center justify-center text-white text-xs font-black shrink-0">{nv}</div>
                                    <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Salida {nv}</span>
                                    <div className="flex-1 h-px bg-gray-700" />
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

                    {/* ── Barra ── */}
                    {itemsBarra.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">🍺 Barra</span>
                          <div className="flex-1 h-px bg-gray-700" />
                        </div>
                        <div className="space-y-2">
                          {itemsBarra.map((item: ComandaItem) => (
                            <ItemRow key={item.id} item={item} nota={nota} setNota={setNota}
                              onUpdate={cantidad => updateItem.mutate({ itemId: item.id, cantidad })}
                              onDelete={() => deleteItem.mutate(item.id)}
                              onSaveNota={v => saveNota.mutate({ itemId: item.id, value: v })}
                              onMerma={() => setMermaItem(item)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {tab === 'menu' && (
            <div className="p-4">
              {/* Tabs de sección (Comida / Bebidas / Vinos) */}
              {grupos.length > 1 && (
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                  {grupos.map(g => (
                    <button key={g} onClick={() => setGrupoTab(g)}
                      className={`px-4 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                        grupoActivo === g
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <input value={searchMenu} onChange={e => setSearchMenu(e.target.value)}
                placeholder="Buscar plato…"
                className="w-full bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl outline-none mb-4" />
              {categoriasSorted.map(cat => (
                <div key={cat} className="mb-5">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">{cat}</p>
                  <div className="space-y-1.5">
                    {menuByCategoria[cat].map((item: MenuItem) => {
                      const isPending = qtyPending?.id === item.id
                      const isAdded   = addedId === item.id
                      return (
                        <button key={item.id} onClick={() => handleMenuItemTap(item)}
                          className={`w-full text-left rounded-xl px-4 py-3 transition-colors relative overflow-hidden ${isPending ? 'bg-[#0d2e20] border-2 border-[#4CC8A0]' : 'bg-[#1e2d45] hover:bg-[#263a55]'}`}>
                          <span className="text-white text-base font-medium">{item.nombre}</span>
                          {isPending && (
                            <span className="absolute right-3 inset-y-0 flex items-center">
                              <span className="text-[#4CC8A0] font-black text-2xl">{qtyPending!.qty}×</span>
                            </span>
                          )}
                          {isAdded && (
                            <span className="absolute inset-0 flex items-center justify-center bg-[#1a3a2e] rounded-xl" style={{ animation: 'fadeInOut 1s ease forwards' }}>
                              <svg viewBox="0 0 52 58" className="h-8 w-8">
                                <defs><linearGradient id="lgfbs" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4B9EDF"/><stop offset="100%" stopColor="#4CC8A0"/></linearGradient></defs>
                                <path d="M8 2 L44 2 Q50 2 50 8 L50 38 Q50 44 44 44 L32 44 L26 52 L20 44 L8 44 Q2 44 2 38 L2 8 Q2 2 8 2 Z" fill="url(#lgfbs)"/>
                                <path d="M14 22 L23 31 L38 13" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                              </svg>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {filteredMenu.length === 0 && <p className="text-center text-gray-600 text-sm py-8">Sin resultados</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">Total</span>
            <span className="text-white text-2xl font-bold">{total.toFixed(2)} €</span>
          </div>
          {yaFacturada ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 py-2 bg-amber-500/10 rounded-xl">
                <span className="text-amber-400 text-sm font-bold">🧾 Cuenta impresa — pendiente de cobro</span>
              </div>
              <button onClick={e => { e.stopPropagation(); setVerCuenta(true) }}
                className="w-full py-3 rounded-2xl bg-[#1e2d45] border border-gray-600 text-gray-400 font-medium text-sm">
                Ver cuenta de nuevo
              </button>
            </div>
          ) : !hayPendientes && (yaEnviada || comanda.items.some(i => i.nivel != null)) ? (
            <div className="space-y-2">
              <button onClick={e => { e.stopPropagation(); setVerCuenta(true) }}
                className="w-full py-4 rounded-2xl bg-[#f59e0b] text-white font-bold text-lg active:scale-95 transition-all">
                Ver cuenta 🧾
              </button>
              {yaEnviada && (
                <button onClick={() => setOrdenando(true)} className="w-full py-2 text-gray-500 text-xs underline">
                  re-enviar comanda
                </button>
              )}
            </div>
          ) : (
            <button onClick={hayPendientes ? handleOido : undefined}
              disabled={comanda.items.length === 0}
              className={`w-full rounded-2xl flex items-center justify-center gap-3 py-4 transition-all active:scale-95 ${hayPendientes ? '' : 'opacity-25 cursor-default'}`}>
              {/* Texto "Oído" — misma fuente que el logo */}
              <span style={{
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontWeight: 800,
                fontSize: '2rem',
                color: hayPendientes ? '#4CC8A0' : '#6b7280',
                opacity: oidoAnim ? 0 : 1,
                transition: 'opacity 0.15s',
              }}>
                Oído
              </span>
              {/* Viñeta — misma forma y gradiente que el logo de OidoOps */}
              <svg viewBox="0 0 68 72" className="w-14 h-14" style={{ filter: hayPendientes ? 'drop-shadow(0 0 10px rgba(76,200,160,0.55))' : 'none' }}>
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
            </button>
          )}
        </div>
      </div>

      {ordenando && (
        <OrdenarModal comanda={comanda} menu={menu} categorias={categorias}
          marchaPasa={esMarchaPasa}
          onClose={() => setOrdenando(false)}
          onEnviar={niveles => { onEnviar(niveles); setOrdenando(false) }} />
      )}
      {mermaItem && (
        <MermaModal
          item={mermaItem}
          onClose={() => setMermaItem(null)}
          onConfirm={(motivo, descripcion) => registrarMerma.mutate({ motivo, descripcion })}
        />
      )}

      {verCuenta && <VerCuentaModal comanda={comanda} onClose={() => setVerCuenta(false)} onFacturar={() => facturarComanda.mutate()} />}

      {animFacturada && (
        <div className="fixed inset-0 z-[60] bg-[#0f172a] flex flex-col items-center justify-center"
          style={{ animation: 'fadeInOut 1.8s ease forwards' }}>
          <img src="/oidoops.svg" alt="OidoOps" className="h-20 mb-6 opacity-90" />
          <div className="w-16 h-16 rounded-full bg-[#4CC8A0]/20 flex items-center justify-center mb-4">
            <svg viewBox="0 0 52 52" className="w-10 h-10">
              <path d="M10 26 L22 38 L42 14" stroke="#4CC8A0" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <p className="text-[#4CC8A0] font-bold text-lg">Cuenta entregada</p>
        </div>
      )}
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
      <div className="w-full bg-[#0f172a] rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">{camarero.nombre}</h2>
            <p className="text-gray-500 text-xs mt-0.5">Propinas este mes</p>
          </div>
          <button onClick={onClose} className="text-gray-500 text-xl">✕</button>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <div className="bg-[#1e2d45] rounded-2xl p-4">
            <p className="text-gray-400 text-xs mb-1">Total propinas</p>
            <p className="text-[#4CC8A0] text-2xl font-black">{fmt(totalMes)} €</p>
          </div>
          <div className="bg-[#1e2d45] rounded-2xl p-4">
            <p className="text-gray-400 text-xs mb-1">Horas trabajadas</p>
            <p className="text-white text-2xl font-black">{totalHoras}h</p>
          </div>
        </div>

        {/* Lista de turnos */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {isLoading && <p className="text-gray-600 text-sm text-center py-6">Cargando…</p>}
          {!isLoading && !turnos?.length && (
            <p className="text-gray-600 text-sm text-center py-6">Sin propinas registradas este mes</p>
          )}
          {turnos?.map((t: MiTurno) => (
            <div key={t.id} className="flex items-center justify-between py-3 border-b border-gray-800">
              <div>
                <p className="text-white text-sm font-medium">{fmtFecha(t.fecha)}</p>
                <p className="text-gray-500 text-xs">{t.horas}h · {t.restaurante}</p>
              </div>
              <span className="text-[#4CC8A0] font-bold text-sm">{fmt(t.propina)} €</span>
            </div>
          ))}
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

  useEffect(() => {
    if (!restaurant) navigate('/sala/setup', { replace: true })
    else if (!camarero) navigate('/sala', { replace: true })
  }, [])

  const [planId, setPlanId]               = useState<number | null>(null)
  const [abrirMesa, setAbrirMesa]         = useState<Mesa | null>(null)
  const [comandaAbierta, setComandaAbierta] = useState<number | null>(null)
  const [view, setView] = useState<'mapa' | 'mesas' | 'nueva'>('mapa')
  const [showPerfil, setShowPerfil]       = useState(false)

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
    refetchInterval: 10_000,
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

  return (
    <div className="flex flex-col h-screen bg-[#111827]">
      {/* Header */}
      <div className="bg-[#0f172a] border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowPerfil(true)} className="text-left group">
            <p className="text-[#4CC8A0] text-xs font-semibold">{restaurant.nombre}</p>
            <p className="text-gray-400 text-xs group-hover:text-gray-200 transition-colors">
              👤 {camarero.nombre}
            </p>
          </button>
          <button onClick={() => { sessionStorage.removeItem('oidoops_camarero'); navigate('/sala', { replace: true }) }}
            className="text-gray-600 text-xs hover:text-gray-400">
            Salir
          </button>
        </div>
        {/* Vista tabs */}
        <div className="flex items-center gap-2">
          {(['mapa', 'mesas', 'nueva'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === v ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
              }`}>
              {v === 'mapa' ? '🗺 Mapa' : v === 'mesas' ? `📋 Mesas (${comandas?.length ?? 0})` : '➕ Nueva'}
            </button>
          ))}
          {view === 'mapa' && planes && planes.length > 1 && (
            <div className="flex gap-1 ml-1 overflow-x-auto">
              {planes.map(p => (
                <button key={p.id} onClick={() => setPlanId(p.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${activePlan?.id === p.id ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vista: Mapa — escala bounding box para llenar ancho y alto */}
      {view === 'mapa' && (activePlan ? (
        <div className="flex-1 overflow-hidden relative" ref={el => {
          if (!el || !activePlan.mesas.length) return
          const PAD = 24
          const ms = activePlan.mesas
          const minX = Math.min(...ms.map(m => m.x)) - PAD
          const minY = Math.min(...ms.map(m => m.y)) - PAD
          const maxX = Math.max(...ms.map(m => m.x + mesaWidth(m.tipo))) + PAD
          const maxY = Math.max(...ms.map(m => m.y + mesaHeight(m.tipo))) + PAD
          const scaleX = el.clientWidth  / (maxX - minX)
          const scaleY = el.clientHeight / (maxY - minY)
          const scale  = Math.min(scaleX, scaleY)
          const canvas = el.querySelector('.plan-canvas') as HTMLElement
          if (canvas) {
            canvas.style.transformOrigin = '0 0'
            canvas.style.transform = `scale(${scale}) translate(${-minX}px, ${-minY}px)`
          }
        }}>
          <div className="plan-canvas" style={{
            position: 'absolute', top: 0, left: 0,
            backgroundImage: `linear-gradient(to right, #ffffff06 1px, transparent 1px), linear-gradient(to bottom, #ffffff06 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            width: Math.max(...(activePlan.mesas.map(m => m.x + mesaWidth(m.tipo))), 400) + 40,
            height: Math.max(...(activePlan.mesas.map(m => m.y + mesaHeight(m.tipo))), 400) + 40,
          }}>
            {activePlan.mesas.map((mesa: Mesa) => (
              <MesaBtn key={mesa.id} mesa={mesa} comanda={comandaByMesa(mesa.id)} onClick={() => handleMesaClick(mesa)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm">No hay planos configurados.</p>
        </div>
      ))}

      {/* Vista: Mesas abiertas */}
      {view === 'mesas' && (
        <div className="flex-1 overflow-y-auto p-4">
          {!comandas?.length ? (
            <div className="text-center py-16 text-gray-600">
              <p className="text-4xl mb-3">🍽</p>
              <p className="text-sm">No hay mesas abiertas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comandas.map(c => {
                const badge = estadoBadge(c)
                return (
                  <button key={c.id} onClick={() => setComandaAbierta(c.id)}
                    className="w-full bg-[#1e2d45] hover:bg-[#263a55] rounded-2xl p-4 text-left transition-colors active:scale-95">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-2xl font-black">Mesa {c.mesa.numero}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge.color}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{c.pax} pax · {c.items.length} items</span>
                      <span className="text-gray-500 text-xs">{timeAgo(c.createdAt)}</span>
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
            <div className="text-center py-16 text-gray-600">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-sm">Todas las mesas están ocupadas</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {mesasLibres.map(m => (
                <button key={m.id} onClick={() => { setAbrirMesa(m); setView('mapa') }}
                  className="bg-[#1e2d45] hover:bg-[#263a55] border border-gray-700 rounded-2xl p-5 flex flex-col items-center gap-1 transition-colors active:scale-95">
                  <span className="text-white text-3xl font-black">{m.numero}</span>
                  <span className="text-gray-500 text-xs">{m.planNombre}</span>
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
          onEnviar={(niveles, silent) => enviarComanda.mutate({ id: comandaAbierta, niveles, silent })} />
      )}

      {showPerfil && camarero && (
        <PerfilPanel camarero={camarero} onClose={() => setShowPerfil(false)} />
      )}
    </div>
  )
}
