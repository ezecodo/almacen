import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem, Mesa, MenuItem, Restaurante, totalComanda } from '../api'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'

const SQUARE_SIZE = 80
const RECT_W = 160
const RECT_H = 80

function mesaWidth(tipo: Mesa['tipo'])  { return tipo === 'rectangular' ? RECT_W : SQUARE_SIZE }
function mesaHeight(tipo: Mesa['tipo']) { return tipo === 'rectangular' ? RECT_H : SQUARE_SIZE }

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1)  return 'ahora'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ── Modal abrir mesa ─────────────────────────────────────────────────────────
function AbrirMesaModal({
  mesa,
  onConfirm,
  onClose,
}: {
  mesa: Mesa
  onConfirm: (pax: number) => void
  onClose: () => void
}) {
  const [pax, setPax] = useState(2)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1e2d45] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-1">Mesa {mesa.numero}</h3>
        <p className="text-gray-400 text-sm mb-6">¿Cuántos comensales?</p>

        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setPax(p => Math.max(1, p - 1))}
            className="w-12 h-12 rounded-xl bg-gray-700 text-white text-2xl hover:bg-gray-600">−</button>
          <span className="flex-1 text-center text-white text-4xl font-bold">{pax}</span>
          <button onClick={() => setPax(p => p + 1)}
            className="w-12 h-12 rounded-xl bg-gray-700 text-white text-2xl hover:bg-gray-600">+</button>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-medium hover:bg-gray-600">
            Cancelar
          </button>
          <button onClick={() => onConfirm(pax)}
            className="flex-1 py-3 rounded-xl bg-[#4CC8A0] text-white font-bold hover:bg-emerald-400">
            Abrir mesa
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de cobro ───────────────────────────────────────────────────────────
function CobrarModal({
  total,
  onCobrar,
  onClose,
}: {
  total: number
  onCobrar: (metodo: 'cash' | 'tarjeta') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4" onClick={onClose}>
      <div
        className="bg-[#0f172a] w-full sm:max-w-sm sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 text-center">
          <p className="text-gray-400 text-sm mb-1">Total a cobrar</p>
          <p className="text-white text-4xl font-black mb-6">
            {total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </p>
          <p className="text-gray-500 text-xs mb-4">¿Método de pago?</p>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 pb-6">
          <button
            onPointerDown={() => onCobrar('cash')}
            className="py-5 rounded-2xl bg-[#1e2d45] border-2 border-[#4CC8A0] text-white font-bold text-lg hover:bg-[#263a55] active:scale-95 transition-all flex flex-col items-center gap-1"
          >
            <span className="text-2xl">💵</span>
            <span>Cash</span>
          </button>
          <button
            onPointerDown={() => onCobrar('tarjeta')}
            className="py-5 rounded-2xl bg-[#1e2d45] border-2 border-[#4B9EDF] text-white font-bold text-lg hover:bg-[#263a55] active:scale-95 transition-all flex flex-col items-center gap-1"
          >
            <span className="text-2xl">💳</span>
            <span>Tarjeta</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lógica de niveles sugeridos ──────────────────────────────────────────────
const CATEGORIA_NIVEL: Record<string, number> = {
  'Classic Tapas':    1,
  'Vegetarian Tapas': 2,
  'Fish Tapas':       3,
  'Meat Tapas':       4,
  'Rice':             4,
  'Pasta':            5,
}

const COLD_KEYWORDS = [
  'tartare', 'tatar', 'burrata', 'stracciatella', 'carpaccio',
  'anchovies', 'ham', 'cheese', 'salchichón', 'jamón', 'crudo',
]

function suggestNivel(nombre: string, menu: MenuItem[]): number {
  const menuItem = menu.find(m => m.nombre === nombre)
  const base = CATEGORIA_NIVEL[menuItem?.categoria ?? ''] ?? 3
  const isCold = COLD_KEYWORDS.some(kw => nombre.toLowerCase().includes(kw.toLowerCase()))
  return isCold && base > 1 ? base - 1 : base
}

// ── Modal de ordenación ──────────────────────────────────────────────────────
function OrdenarModal({
  comanda,
  menu,
  onEnviar,
  onClose,
}: {
  comanda: Comanda
  menu: MenuItem[]
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[]) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [notaModal, setNotaModal] = useState<{ itemId: number; value: string } | null>(null)
  const [notas, setNotas] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    comanda.items.forEach(item => { init[item.id] = item.nota ?? '' })
    return init
  })
  const [niveles, setNiveles] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {}
    comanda.items.forEach(item => {
      init[item.id] = item.nivel ?? suggestNivel(item.nombre, menu)
    })
    return init
  })

  const updateItem = useMutation({
    mutationFn: ({ itemId, cantidad }: { itemId: number; cantidad: number }) =>
      api.comandas.updateItem(comanda.id, itemId, { cantidad }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda', comanda.id] }),
  })

  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api.comandas.deleteItem(comanda.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda', comanda.id] }),
  })

  // Sync any new items that arrived via refetch into niveles/notas state
  useEffect(() => {
    setNiveles(prev => {
      const next = { ...prev }
      let changed = false
      comanda.items.forEach(item => {
        if (!(item.id in next)) {
          next[item.id] = item.nivel ?? suggestNivel(item.nombre, menu)
          changed = true
        }
      })
      return changed ? next : prev
    })
    setNotas(prev => {
      const next = { ...prev }
      let changed = false
      comanda.items.forEach(item => {
        if (!(item.id in next)) {
          next[item.id] = item.nota ?? ''
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [comanda.items])

  const sorted = [...comanda.items].sort((a, b) => (niveles[a.id] ?? suggestNivel(a.nombre, menu)) - (niveles[b.id] ?? suggestNivel(b.nombre, menu)))
  const maxNivel = Math.max(...Object.values(niveles), 1)

  const moveItem = (itemId: number, dir: -1 | 1) => {
    setNiveles(prev => {
      const item = comanda.items.find(i => i.id === itemId)
      const current = prev[itemId] ?? (item ? suggestNivel(item.nombre, menu) : 1)
      return { ...prev, [itemId]: Math.max(1, current + dir) }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-stretch sm:items-center justify-center z-50 px-0 sm:px-4" onClick={onClose}>
      <div
        className="bg-[#0f172a] w-full sm:max-w-md sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">Orden de salida</h3>
            <p className="text-gray-400 text-xs mt-0.5">Mesa {comanda.mesa.numero} · {comanda.pax} pax</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
        </div>

        <p className="text-gray-500 text-sm px-5 pt-3 pb-1">Ajusta el orden de salida</p>

        {/* Agrupado por salida */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {Array.from({ length: maxNivel }, (_, i) => i + 1).map(nv => {
            const itemsEnNivel = sorted.filter(i => (niveles[i.id] ?? suggestNivel(i.nombre, menu)) === nv)
            if (itemsEnNivel.length === 0) return null
            return (
              <div key={nv}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-white text-sm font-black shrink-0">{nv}</div>
                  <div className="flex gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); if (nv > 1) itemsEnNivel.forEach(i => moveItem(i.id, -1)) }}
                      disabled={nv <= 1}
                      className="w-7 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-xs font-black hover:bg-cyan-600/60 disabled:opacity-20 flex items-center justify-center active:scale-90 transition-all"
                    >▲</button>
                    <button
                      onClick={e => { e.stopPropagation(); itemsEnNivel.forEach(i => moveItem(i.id, 1)) }}
                      className="w-7 h-7 rounded-lg bg-cyan-600/30 text-cyan-400 text-xs font-black hover:bg-cyan-600/60 flex items-center justify-center active:scale-90 transition-all"
                    >▼</button>
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
                          {/* Qty controls */}
                          <button
                            onClick={e => { e.stopPropagation(); if (item.cantidad > 1) updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 }); else deleteItem.mutate(item.id) }}
                            className="w-9 h-9 rounded-lg bg-gray-700 text-gray-300 text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90 transition-transform"
                          >−</button>
                          <span className="text-white font-black text-lg w-6 text-center">{item.cantidad}</span>
                          <button
                            onClick={e => { e.stopPropagation(); updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 }) }}
                            className="w-9 h-9 rounded-lg bg-gray-700 text-gray-300 text-lg font-bold hover:bg-gray-600 flex items-center justify-center active:scale-90 transition-transform"
                          >+</button>
                          {/* Nota */}
                          <button
                            onClick={e => { e.stopPropagation(); setNotaModal(m => m?.itemId === item.id ? null : { itemId: item.id, value: notas[item.id] ?? '' }) }}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${notas[item.id] ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                              <path d="M4 2 L20 2 Q22 2 22 4 L22 15 Q22 17 20 17 L14 17 L11 21 L8 17 L4 17 Q2 17 2 15 L2 4 Q2 2 4 2 Z" fill={notas[item.id] ? 'white' : '#9ca3af'} />
                              <path d="M7 10 L11 14 L17 6" stroke={notas[item.id] ? '#06b6d4' : '#374151'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </button>
                          {/* Nivel arrows */}
                          <button
                            onClick={e => { e.stopPropagation(); moveItem(item.id, -1) }}
                            disabled={(niveles[item.id] ?? 1) <= 1}
                            className="w-10 h-10 rounded-lg bg-gray-700 text-white text-base font-black hover:bg-gray-500 disabled:opacity-20 flex items-center justify-center active:scale-90 transition-transform"
                          >▲</button>
                          <button
                            onClick={e => { e.stopPropagation(); moveItem(item.id, 1) }}
                            className="w-10 h-10 rounded-lg bg-gray-700 text-white text-base font-black hover:bg-gray-500 flex items-center justify-center active:scale-90 transition-transform"
                          >▼</button>
                        </div>
                      </div>
                      {notaModal?.itemId === item.id && (
                        <div className="px-4 pb-4">
                          <input
                            autoFocus
                            value={notaModal.value}
                            onChange={e => setNotaModal(m => m ? { ...m, value: e.target.value } : null)}
                            onKeyDown={e => { if (e.key === 'Enter') { setNotas(prev => ({ ...prev, [item.id]: notaModal.value })); setNotaModal(null) } }}
                            placeholder="Sin gluten, sin cebolla, punto medio…"
                            className="w-full bg-gray-800 text-white text-sm px-4 py-3 rounded-xl outline-none placeholder:text-gray-600"
                          />
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

        {/* Footer GO */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={e => { e.stopPropagation(); onEnviar(Object.entries(niveles).map(([id, nivel]) => ({ itemId: Number(id), nivel, nota: notas[Number(id)] ?? '' }))) }}
            className="w-full py-5 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#ef4444] text-white font-black text-2xl tracking-wide hover:opacity-90 transition-opacity active:scale-95"
          >
            GO!! 🚀
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel lateral de comanda ─────────────────────────────────────────────────
function ComandaPanel({
  comanda,
  menu,
  onClose,
  onCerrar,
  onEnviar,
}: {
  comanda: Comanda
  menu: MenuItem[]
  onClose: () => void
  onCerrar: (metodo: 'cash' | 'tarjeta') => void
  onEnviar: (niveles: { itemId: number; nivel: number; nota?: string }[]) => void
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'pedido' | 'menu'>('pedido')
  const [searchMenu, setSearchMenu] = useState('')
  const [nota, setNota] = useState<{ itemId: number; value: string } | null>(null)
  const [addedId, setAddedId] = useState<number | null>(null)
  const [qtyPending, setQtyPending] = useState<{ id: number; qty: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const [cobrando, setCobrando] = useState(false)

  const yaEnviada   = comanda.estado === 'enviada'
  const yaFacturada = comanda.estado === 'facturada'

  const total = totalComanda(comanda.items)

  const addItem = useMutation({
    mutationFn: ({ item, cantidad }: { item: MenuItem; cantidad: number }) =>
      api.comandas.addItem(comanda.id, { nombre: item.nombre, precio: item.precio, cantidad }),
    onSuccess: (_, { item }) => {
      setAddedId(item.id)
      setTimeout(() => setAddedId(null), 1000)
      queryClient.invalidateQueries({ queryKey: ['comanda', comanda.id] })
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
      // Same item: increment and reset timer
      const newQty = qtyPending.qty + 1
      setQtyPending({ id: item.id, qty: newQty })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => commitQty(item, newQty), 1500)
    } else {
      // Different item: commit any pending one first, then start new counter
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

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const updateItem = useMutation({
    mutationFn: ({ itemId, cantidad }: { itemId: number; cantidad: number }) =>
      api.comandas.updateItem(comanda.id, itemId, { cantidad }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda', comanda.id] }),
  })

  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api.comandas.deleteItem(comanda.id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comanda', comanda.id] }),
  })

  const saveNota = useMutation({
    mutationFn: ({ itemId, value }: { itemId: number; value: string }) =>
      api.comandas.updateItem(comanda.id, itemId, { nota: value }),
    onSuccess: () => { setNota(null); queryClient.invalidateQueries({ queryKey: ['comanda', comanda.id] }) },
  })

  const CATEGORIA_ORDER = [
    'Classic Tapas', 'Vegetarian Tapas', 'Fish Tapas', 'Meat Tapas', 'Rice', 'Pasta',
  ]

  const filteredMenu = menu.filter(m =>
    m.activo && m.nombre.toLowerCase().includes(searchMenu.toLowerCase())
  )

  const menuByCategoria = filteredMenu.reduce<Record<string, MenuItem[]>>((acc, m) => {
    if (!acc[m.categoria]) acc[m.categoria] = []
    acc[m.categoria].push(m)
    return acc
  }, {})

  const categoriasSorted = Object.keys(menuByCategoria).sort((a, b) => {
    const ia = CATEGORIA_ORDER.indexOf(a)
    const ib = CATEGORIA_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#0f172a] h-full flex flex-col shadow-2xl border-l border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-700">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-white font-bold text-xl">Mesa {comanda.mesa.numero}</h2>
              <p className="text-gray-400 text-sm">{comanda.pax} pax · abierta hace {timeAgo(comanda.createdAt)}</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl mt-1">✕</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(['pedido', 'menu'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}>
                {t === 'pedido' ? `Pedido (${comanda.items.length})` : 'Añadir'}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">

          {/* Tab pedido */}
          {tab === 'pedido' && (
            <div className="p-4 space-y-2">
              {comanda.items.length === 0 && (
                <div className="text-center py-12 text-gray-600">
                  <p className="text-3xl mb-2">🍽</p>
                  <p className="text-sm">Sin items. Ve a "Añadir" para agregar.</p>
                </div>
              )}

              {comanda.items.map((item: ComandaItem) => (
                <div key={item.id} className="bg-[#1e2d45] rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    {/* Qty */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => item.cantidad > 1
                          ? updateItem.mutate({ itemId: item.id, cantidad: item.cantidad - 1 })
                          : deleteItem.mutate(item.id)
                        }
                        className="w-7 h-7 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 flex items-center justify-center"
                      >−</button>
                      <span className="text-white font-bold w-5 text-center">{item.cantidad}</span>
                      <button
                        onClick={() => updateItem.mutate({ itemId: item.id, cantidad: item.cantidad + 1 })}
                        className="w-7 h-7 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 flex items-center justify-center"
                      >+</button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{item.nombre}</p>
                      {item.nota && <p className="text-gray-500 text-xs truncate">{item.nota}</p>}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[#4CC8A0] text-sm font-bold">{item.invitacion ? <>🎁 0,00 €</> : formatEur(item.precio * item.cantidad)}</p>
                      <button
                        onClick={() => setNota({ itemId: item.id, value: item.nota })}
                        className="text-gray-600 text-xs hover:text-gray-400"
                      >nota</button>
                    </div>
                  </div>

                  {/* Editar nota inline */}
                  {nota?.itemId === item.id && (
                    <div className="flex gap-2 mt-2">
                      <input
                        autoFocus
                        value={nota.value}
                        onChange={e => setNota({ itemId: item.id, value: e.target.value })}
                        placeholder="Sin gluten, sin cebolla…"
                        className="flex-1 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none"
                      />
                      <button onClick={() => saveNota.mutate({ itemId: item.id, value: nota.value })}
                        className="text-xs px-3 py-1.5 bg-cyan-600 text-white rounded-lg">OK</button>
                      <button onClick={() => setNota(null)} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tab menú */}
          {tab === 'menu' && (
            <div className="p-4">
              <input
                value={searchMenu}
                onChange={e => setSearchMenu(e.target.value)}
                placeholder="Buscar plato…"
                className="w-full bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl outline-none mb-4"
              />

              {categoriasSorted.map(cat => {
                const items = menuByCategoria[cat]
                return (
                  <div key={cat} className="mb-5">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">{cat}</p>
                    <div className="space-y-1.5">
                      {items.map((item: MenuItem) => {
                        const isPending = qtyPending?.id === item.id
                        const isAdded   = addedId === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleMenuItemTap(item)}
                            className={`w-full text-left rounded-xl px-4 py-3 transition-colors relative overflow-hidden ${
                              isPending ? 'bg-[#0d2e20] border-2 border-[#4CC8A0]' : 'bg-[#1e2d45] hover:bg-[#263a55]'
                            }`}
                          >
                            <span className="text-white text-base font-medium">{item.nombre}</span>

                            {/* Qty counter overlay */}
                            {isPending && (
                              <span className="absolute right-3 inset-y-0 flex items-center gap-2">
                                <span className="text-[#4CC8A0] font-black text-2xl leading-none">
                                  {qtyPending!.qty}×
                                </span>
                              </span>
                            )}

                            {/* Feedback OidoOps */}
                            {isAdded && (
                              <span
                                className="absolute inset-0 flex items-center justify-center bg-[#1a3a2e] rounded-xl"
                                style={{ animation: 'fadeInOut 1s ease forwards' }}
                              >
                                <svg viewBox="0 0 52 58" className="h-8 w-8">
                                  <defs>
                                    <linearGradient id="lgfb" x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor="#4B9EDF"/>
                                      <stop offset="100%" stopColor="#4CC8A0"/>
                                    </linearGradient>
                                  </defs>
                                  <path d="M8 2 L44 2 Q50 2 50 8 L50 38 Q50 44 44 44 L32 44 L26 52 L20 44 L8 44 Q2 44 2 38 L2 8 Q2 2 8 2 Z" fill="url(#lgfb)"/>
                                  <path d="M14 22 L23 31 L38 13" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                </svg>
                              </span>
                            )}
                          </button>
                          )
                      })}
                    </div>
                  </div>
                )
              })}

              {filteredMenu.length === 0 && (
                <p className="text-center text-gray-600 text-sm py-8">Sin resultados</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">Total</span>
            <span className="text-white text-2xl font-bold">{formatEur(total)}</span>
          </div>

          {yaFacturada ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 py-2 bg-amber-500/10 rounded-xl">
                <span className="text-amber-400 text-sm font-bold">🧾 Cuenta impresa</span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setCobrando(true) }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#ef4444] text-white font-black text-lg tracking-wide hover:opacity-90 transition-opacity active:scale-95"
              >
                Cobrar mesa 💳
              </button>
            </div>
          ) : yaEnviada ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 py-1">
                <span className="text-[#4CC8A0] text-sm font-semibold">🚀 Enviada a cocina</span>
                <button onClick={() => setOrdenando(true)} className="text-gray-500 text-xs underline hover:text-gray-300">re-enviar</button>
              </div>
              <div className="w-full py-3 rounded-2xl bg-gray-800 text-gray-500 text-sm text-center">
                Esperando que el camarero imprima la cuenta
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={e => { e.stopPropagation(); setOrdenando(true) }}
                disabled={comanda.items.length === 0}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#f59e0b] to-[#ef4444] text-white font-black text-xl tracking-wide hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-30"
              >
                Ordenar y enviar →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal ordenación */}
      {ordenando && (
        <OrdenarModal
          comanda={comanda}
          menu={menu}
          onClose={() => setOrdenando(false)}
          onEnviar={(niveles) => { onEnviar(niveles); setOrdenando(false) }}
        />
      )}

      {/* Modal cobro */}
      {cobrando && (
        <CobrarModal
          total={total}
          onClose={() => setCobrando(false)}
          onCobrar={(metodo) => { onCerrar(metodo); setCobrando(false) }}
        />
      )}
    </div>
  )
}

// ── Mesa en el canvas (modo operación) ───────────────────────────────────────
function MesaOperacion({
  mesa,
  comanda,
  onClick,
}: {
  mesa: Mesa
  comanda?: Comanda
  onClick: () => void
}) {
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
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: mesa.x,
        top: mesa.y,
        width: w,
        height: h,
        borderRadius: isRound ? '50%' : mesa.tipo === 'rectangular' ? '14px' : '16px',
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: glow,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        transition: 'all 0.2s',
      }}
    >
      <span style={{ color: libre ? '#94a3b8' : facturada ? '#f59e0b' : enviada ? '#c084fc' : '#4CC8A0', fontWeight: 800, fontSize: 18, lineHeight: 1 }}>
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

// ── Page principal ────────────────────────────────────────────────────────────
export default function ComandasPage() {
  const queryClient = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [planId, setPlanId] = useState<number | null>(null)
  const [abrirMesa, setAbrirMesa] = useState<Mesa | null>(null)
  const [comandaAbierta, setComandaAbierta] = useState<number | null>(null)
  const [view, setView] = useState<'mapa' | 'mesas' | 'nueva'>('mapa')

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  const { data: planes } = useQuery({
    queryKey: ['salon-planes', restaurantId],
    queryFn: () => api.salon.list(restaurantId!),
    enabled: !!restaurantId,
  })

  const { data: comandas } = useQuery({
    queryKey: ['comandas', restaurantId],
    queryFn: () => api.comandas.list(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
  })

  const { data: comandaDetalle } = useQuery({
    queryKey: ['comanda', comandaAbierta],
    queryFn: () => api.comandas.get(comandaAbierta!),
    enabled: !!comandaAbierta,
    refetchInterval: 10_000,
  })

  const activePlan = planes?.find(p => p.id === planId) ?? planes?.[0] ?? null

  const { data: menu } = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.menu.list(restaurantId!),
    enabled: !!restaurantId,
  })

  useRestaurantEvents(restaurantId)

  useEffect(() => {
    if (!restaurantId && restaurantes?.length) setRestaurantId(restaurantes[0].id)
  }, [restaurantes, restaurantId])

  useEffect(() => {
    if (planes?.length && !planId) setPlanId(planes[0].id)
  }, [planes, planId])

  const abrirComanda = useMutation({
    mutationFn: ({ mesaId, pax }: { mesaId: number; pax: number }) =>
      api.comandas.abrir(restaurantId!, mesaId, pax),
    onSuccess: (comanda) => {
      setAbrirMesa(null)
      setComandaAbierta(comanda.id)
      queryClient.invalidateQueries({ queryKey: ['comandas', restaurantId] })
    },
  })

  const enviarComanda = useMutation({
    mutationFn: ({ id, niveles }: { id: number; niveles: { itemId: number; nivel: number; nota?: string }[] }) =>
      api.comandas.enviar(id, niveles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comanda', comandaAbierta] })
      queryClient.invalidateQueries({ queryKey: ['comandas', restaurantId] })
    },
  })

  const cerrarComanda = useMutation({
    mutationFn: ({ id, metodoPago }: { id: number; metodoPago: 'cash' | 'tarjeta' }) =>
      api.comandas.cerrar(id, metodoPago),
    onSuccess: () => {
      setComandaAbierta(null)
      queryClient.invalidateQueries({ queryKey: ['comandas', restaurantId] })
    },
  })

  // Si hay varias comandas para la misma mesa (ej: facturada pendiente + nueva abierta),
  // priorizar la que más atención necesita: facturada > enviada > abierta
  const comandaByMesa = (mesaId: number) => {
    const all = comandas?.filter(c => c.mesaId === mesaId) ?? []
    return all.find(c => c.estado === 'facturada')
        ?? all.find(c => c.estado === 'enviada')
        ?? all.find(c => c.estado === 'abierta')
  }

  const handleMesaClick = (mesa: Mesa) => {
    const comanda = comandaByMesa(mesa.id)
    if (comanda) {
      setComandaAbierta(comanda.id)
    } else {
      setAbrirMesa(mesa)
    }
  }

  const todasLasMesas = planes?.flatMap(p => p.mesas.map(m => ({ ...m, planNombre: p.nombre }))) ?? []
  const mesasLibres   = todasLasMesas.filter(m => !comandaByMesa(m.id))

  const estadoBadge = (c: Comanda) => {
    if (c.estado === 'facturada') return { label: '🧾 Cuenta', color: 'text-amber-400 bg-amber-500/10' }
    if (c.estado === 'enviada')   return { label: '🚀 Enviada', color: 'text-purple-400 bg-purple-500/10' }
    return { label: '● Abierta', color: 'text-[#4CC8A0] bg-[#4CC8A0]/10' }
  }

  return (
    <div className="flex flex-col h-screen bg-[#111827]">
      {/* Header */}
      <div className="bg-[#0f172a] border-b border-gray-700 px-4 py-3">
        {/* Tabs restaurantes */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {restaurantes?.map((r: Restaurante) => (
            <button key={r.id} onClick={() => { setRestaurantId(r.id); setPlanId(null) }}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                restaurantId === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}>
              {r.nombre}
            </button>
          ))}
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

          {/* Tabs planos (solo en mapa) */}
          {view === 'mapa' && planes && planes.length > 1 && (
            <div className="flex gap-1 ml-2">
              {planes.map(p => (
                <button key={p.id} onClick={() => setPlanId(p.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activePlan?.id === p.id ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                  }`}>
                  {p.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vista: Mapa */}
      {view === 'mapa' && (activePlan ? (
        <div className="flex-1 overflow-auto relative">
          <div style={{
            position: 'absolute', inset: 0, minWidth: 1200, minHeight: 800,
            backgroundImage: `linear-gradient(to right, #ffffff06 1px, transparent 1px), linear-gradient(to bottom, #ffffff06 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}>
            {activePlan.mesas.map((mesa: Mesa) => (
              <MesaOperacion key={mesa.id} mesa={mesa} comanda={comandaByMesa(mesa.id)} onClick={() => handleMesaClick(mesa)} />
            ))}
          </div>
          {activePlan.mesas.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-gray-600 text-sm">Este plano no tiene mesas. Añádelas en "Salón".</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-sm">No hay planos. Créalos en la sección "Salón".</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {comandas.map(c => {
                const badge = estadoBadge(c)
                const total = totalComanda(c.items)
                return (
                  <button key={c.id} onClick={() => setComandaAbierta(c.id)}
                    className="bg-[#1e2d45] hover:bg-[#263a55] rounded-2xl p-4 text-left transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-white text-2xl font-black">Mesa {c.mesa.numero}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge.color}`}>{badge.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{c.pax} pax · {c.items.length} items</span>
                      <span className="text-white font-bold">{total.toFixed(2)} €</span>
                    </div>
                    <p className="text-gray-600 text-xs mt-1">{timeAgo(c.createdAt)}</p>
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
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {mesasLibres.map(m => (
                <button key={m.id} onClick={() => setAbrirMesa(m)}
                  className="bg-[#1e2d45] hover:bg-[#263a55] border border-gray-700 rounded-2xl p-4 flex flex-col items-center gap-1 transition-colors active:scale-95">
                  <span className="text-white text-2xl font-black">{m.numero}</span>
                  <span className="text-gray-500 text-xs">{m.planNombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal abrir mesa */}
      {abrirMesa && (
        <AbrirMesaModal
          mesa={abrirMesa}
          onClose={() => setAbrirMesa(null)}
          onConfirm={pax => abrirComanda.mutate({ mesaId: abrirMesa.id, pax })}
        />
      )}

      {/* Panel comanda */}
      {comandaAbierta && comandaDetalle && (
        <ComandaPanel
          comanda={comandaDetalle}
          menu={menu ?? []}
          onClose={() => setComandaAbierta(null)}
          onCerrar={(metodo) => cerrarComanda.mutate({ id: comandaAbierta, metodoPago: metodo })}
          onEnviar={(niveles) => enviarComanda.mutate({ id: comandaAbierta, niveles })}
        />
      )}
    </div>
  )
}
