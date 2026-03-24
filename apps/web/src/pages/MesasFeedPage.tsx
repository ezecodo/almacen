import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'
import { api, Comanda, ComandaItem, ComandaMerma, FloorPlan, Mesa, Restaurante, MermaMotivo } from '../api'

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso)
  const hoy = new Date().toDateString() === d.toDateString()
  return hoy
    ? `Hoy ${fmtHora(iso)}`
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + fmtHora(iso)
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type EstadoMesa =
  | { tipo: 'libre' }
  | { tipo: 'activa'; comanda: Comanda }
  | { tipo: 'cerrada_hoy'; comanda: Comanda }

interface MesaConPlan extends Mesa {
  planNombre: string
  estado: EstadoMesa
}

const ESTADO_CONFIG = {
  abierta:   { label: 'Abierta',      bg: 'bg-[#1a3a2e]', border: 'border-[#4CC8A0]', text: 'text-[#4CC8A0]', dot: 'bg-[#4CC8A0]' },
  enviada:   { label: 'En cocina',    bg: 'bg-[#2d1a3a]', border: 'border-[#a855f7]', text: 'text-[#c084fc]', dot: 'bg-[#a855f7]' },
  facturada: { label: 'Facturada',    bg: 'bg-[#2d2500]', border: 'border-[#f59e0b]', text: 'text-[#fcd34d]', dot: 'bg-[#f59e0b]' },
  liberada:  { label: 'Pte. cobro',   bg: 'bg-[#2d1200]', border: 'border-[#f97316]', text: 'text-[#fb923c]', dot: 'bg-[#f97316]' },
  cerrada:   { label: 'Cobrada',      bg: 'bg-[#1a1a2e]', border: 'border-[#6366f1]', text: 'text-[#818cf8]', dot: 'bg-[#6366f1]' },
}

// ── Merma modal ────────────────────────────────────────────────────────────────
const MOTIVOS: { value: MermaMotivo; label: string; desc: string }[] = [
  { value: 'no_servido',    label: 'No se sirvió',     desc: 'Se preparó pero no llegó al cliente' },
  { value: 'queja_cliente', label: 'Queja de cliente', desc: 'El cliente lo rechazó o se quejó' },
  { value: 'otro',          label: 'Otro',             desc: 'Especifica el motivo abajo' },
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
      <div className="bg-[#0f172a] w-full rounded-t-3xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-base">Registrar merma</h3>
            <p className="text-gray-400 text-xs mt-0.5">{item.nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 text-xl">✕</button>
        </div>

        {item.cantidad > 1 && (
          <div className="flex items-center justify-between bg-[#1e2d45] rounded-2xl px-4 py-3 mb-4">
            <span className="text-gray-400 text-sm">Cantidad a mermar</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setCantidad(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-full bg-gray-700 text-white font-bold text-lg flex items-center justify-center active:scale-90">−</button>
              <span className="text-white font-bold text-lg w-6 text-center">{cantidad}</span>
              <button onClick={() => setCantidad(c => Math.min(item.cantidad, c + 1))}
                className="w-8 h-8 rounded-full bg-gray-700 text-white font-bold text-lg flex items-center justify-center active:scale-90">+</button>
            </div>
          </div>
        )}

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
          onClick={() => motivo && onConfirm(motivo, descripcion || undefined, cantidad)}
          disabled={!motivo || (motivo === 'otro' && !descripcion.trim())}
          className="w-full py-4 rounded-2xl bg-red-600 text-white font-bold text-base disabled:opacity-30 active:scale-95 transition-all"
        >
          Confirmar merma {item.cantidad > 1 && `(${cantidad}×)`}
        </button>
      </div>
    </div>
  )
}

// ── Modal detalle de comanda ───────────────────────────────────────────────────
function ComandaDetalleModal({ comanda, planNombre, onClose, onCobrar, onRestituir, onMerma }: {
  comanda: Comanda
  planNombre: string
  onClose: () => void
  onCobrar?: (metodoPago: 'cash' | 'tarjeta') => void
  onRestituir?: (mermaId: number) => void
  onMerma?: (item: ComandaItem, motivo: MermaMotivo, descripcion: string | undefined, cantidad: number) => void
}) {
  const [metodoPago, setMetodoPago] = useState<'cash' | 'tarjeta' | null>(null)
  const [mermaItem, setMermaItem] = useState<ComandaItem | null>(null)
  const cfg = ESTADO_CONFIG[comanda.estado as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.abierta
  const total = comanda.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const cocina = comanda.items.filter(i => i.tipo !== 'barra')
  const tienenNivel = cocina.some(i => i.nivel != null)
  const maxNivel = tienenNivel ? Math.max(...cocina.filter(i => i.nivel != null).map(i => i.nivel!)) : 1

  const duracion = (() => {
    const end = comanda.closedAt ? new Date(comanda.closedAt) : new Date()
    const mins = Math.floor((end.getTime() - new Date(comanda.createdAt).getTime()) / 60000)
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  })()

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-[#0f172a] w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-5 pt-5 pb-4 border-b border-gray-700`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-white font-black text-xl">Mesa {comanda.mesa.numero}</h2>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg`}>
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className={`${cfg.text} text-xs font-semibold`}>{cfg.label}</span>
                </div>
              </div>
              <p className="text-gray-500 text-xs">{planNombre} · {comanda.pax} pax</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl mt-1">✕</button>
          </div>

          {/* Timeline de tiempos */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800/60 rounded-xl px-3 py-2">
              <p className="text-gray-500 text-xs mb-0.5">Abierta</p>
              <p className="text-white text-sm font-semibold">{fmtFechaHora(comanda.createdAt)}</p>
            </div>
            {comanda.closedAt ? (
              <div className="bg-gray-800/60 rounded-xl px-3 py-2">
                <p className="text-gray-500 text-xs mb-0.5">Cobrada</p>
                <p className="text-white text-sm font-semibold">{fmtFechaHora(comanda.closedAt)}</p>
              </div>
            ) : (
              <div className="bg-gray-800/60 rounded-xl px-3 py-2">
                <p className="text-gray-500 text-xs mb-0.5">Tiempo en mesa</p>
                <p className="text-white text-sm font-semibold">{duracion}</p>
              </div>
            )}
          </div>

          {/* Camarero + método pago */}
          <div className="flex items-center gap-3 mt-2">
            {comanda.camareroNombre && (
              <span className="text-gray-400 text-xs">👤 {comanda.camareroNombre}</span>
            )}
            {comanda.metodoPago && (
              <span className="text-gray-400 text-xs">
                {comanda.metodoPago === 'cash' ? '💵 Efectivo' : '💳 Tarjeta'}
              </span>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {comanda.items.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-6">Sin items</p>
          )}

          {(() => {
            const itemsCocina = comanda.items.filter(i => i.tipo !== 'barra')
            const itemsBarra  = comanda.items.filter(i => i.tipo === 'barra')
            // Items legacy (ronda=0 + nivel!=null) se tratan como ronda=1 (comanda original)
            const normalize = (i: ComandaItem) => i.ronda === 0 && i.nivel != null ? { ...i, ronda: 1 } : i
            const cocina = itemsCocina.map(normalize)
            const cocinaOriginal   = cocina.filter(i => i.ronda === 1)
            const cocinaMarchaPasa = cocina.filter(i => i.ronda > 1)
            const cocinaPendiente  = cocina.filter(i => i.ronda === 0)

            const maxNivelOrig = cocinaOriginal.length > 0
              ? Math.max(...cocinaOriginal.map(i => i.nivel!))
              : tienenNivel ? maxNivel : 1

            return (
              <div className="space-y-4">
                {/* Cocina */}
                {tienenNivel ? (
                  <div className="space-y-4">
                    {/* Pendiente en curso (ronda=0, camarero aún no envió) */}
                    {cocinaPendiente.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-black shrink-0">…</div>
                          <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Pendiente de enviar</span>
                          <div className="flex-1 h-px bg-gray-800" />
                        </div>
                        <div className="space-y-1.5">
                          {cocinaPendiente.map((item: ComandaItem) => (
                            <ItemLine key={item.id} item={item} onMerma={onMerma ? (i) => setMermaItem(i) : undefined} />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Comanda original (ronda=1) */}
                    {Array.from({ length: maxNivelOrig }, (_, i) => i + 1).map(nv => {
                      const items = cocinaOriginal.filter(i => i.nivel === nv)
                      if (!items.length) return null
                      return (
                        <div key={nv}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-cyan-700 flex items-center justify-center text-white text-xs font-black shrink-0">{nv}</div>
                            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Salida {nv}</span>
                            <div className="flex-1 h-px bg-gray-800" />
                          </div>
                          <div className="space-y-1.5">
                            {items.map((item: ComandaItem) => (<ItemLine key={item.id} item={item} onMerma={onMerma ? (i) => setMermaItem(i) : undefined} />))}
                          </div>
                        </div>
                      )
                    })}
                    {/* Marcha pasa (ronda>=2), agrupadas */}
                    {cocinaMarchaPasa.length > 0 && (() => {
                      const rondasExtra = [...new Set(cocinaMarchaPasa.map(i => i.ronda))].sort()
                      return rondasExtra.map((ronda, idx) => {
                        const itemsRonda = cocinaMarchaPasa.filter(i => i.ronda === ronda)
                        const maxNv = Math.max(...itemsRonda.map(i => i.nivel ?? 1))
                        return (
                          <div key={ronda}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center text-white text-xs font-black shrink-0">+{idx + 1}</div>
                              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Marcha pasa {rondasExtra.length > 1 ? idx + 1 : ''}</span>
                              <div className="flex-1 h-px bg-gray-800" />
                            </div>
                            <div className="space-y-1.5">
                              {Array.from({ length: maxNv }, (_, i) => i + 1).map(nv => {
                                const its = itemsRonda.filter(i => (i.nivel ?? 1) === nv)
                                if (!its.length) return null
                                return (
                                  <div key={nv}>
                                    {maxNv > 1 && <p className="text-gray-600 text-xs mb-1 pl-1">salida {nv}</p>}
                                    {its.map((item: ComandaItem) => (<ItemLine key={item.id} item={item} onMerma={onMerma ? (i) => setMermaItem(i) : undefined} />))}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {itemsCocina.map((item: ComandaItem) => (
                      <ItemLine key={item.id} item={item} onMerma={onMerma ? (i) => setMermaItem(i) : undefined} />
                    ))}
                  </div>
                )}

                {/* Barra — agrupada por nombre */}
                {itemsBarra.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-amber-400 text-xs font-semibold uppercase tracking-wide">🍺 Barra</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>
                    <div className="space-y-1.5">
                      {itemsBarra.reduce<{ nombre: string; cantidad: number; precio: number; id: number }[]>((acc, item) => {
                        const found = acc.find(g => g.nombre === item.nombre)
                        if (found) { found.cantidad += item.cantidad } else { acc.push({ nombre: item.nombre, cantidad: item.cantidad, precio: item.precio, id: item.id }) }
                        return acc
                      }, []).map(g => (
                        <ItemLine key={g.id} item={{ ...itemsBarra.find(i => i.id === g.id)!, cantidad: g.cantidad }} onMerma={onMerma ? (i) => setMermaItem(i) : undefined} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Mermas */}
        {comanda.mermas?.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-800 bg-red-950/30">
            <p className="text-red-400 text-xs font-bold uppercase tracking-wide mb-2">Mermas registradas</p>
            <div className="space-y-1.5">
              {comanda.mermas.map((m: ComandaMerma) => (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="text-red-500 text-xs mt-0.5">▼</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-300 text-sm">{m.cantidad > 1 && <span className="text-red-400 font-bold mr-1">{m.cantidad}×</span>}{m.itemNombre}</span>
                    <span className="text-gray-600 text-xs ml-2">
                      {m.motivo === 'no_servido' ? 'No se sirvió' : m.motivo === 'queja_cliente' ? 'Queja' : 'Otro'}
                    </span>
                    {m.descripcion && <p className="text-gray-600 text-xs truncate">{m.descripcion}</p>}
                  </div>
                  {onRestituir && (
                    <button
                      onClick={() => onRestituir(m.id)}
                      className="text-xs text-emerald-600 hover:text-emerald-400 shrink-0 transition-colors font-medium"
                      title="Restituir a la comanda"
                    >
                      ↩ Restituir
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer total + cobrar */}
        <div className="px-5 py-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 font-medium">Total</span>
            <span className="text-white text-2xl font-black">{fmt(total)} €</span>
          </div>

          {(comanda.estado === 'facturada' || comanda.estado === 'liberada') && onCobrar && (
            <div>
              <p className="text-gray-500 text-xs mb-2 text-center">Método de pago</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => setMetodoPago('cash')}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    metodoPago === 'cash'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  💵 Efectivo
                </button>
                <button
                  onClick={() => setMetodoPago('tarjeta')}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    metodoPago === 'tarjeta'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  💳 Tarjeta
                </button>
              </div>
              <button
                onClick={() => metodoPago && onCobrar(metodoPago)}
                disabled={!metodoPago}
                className="w-full py-3 rounded-xl bg-amber-500 text-black font-black text-base disabled:opacity-30 hover:bg-amber-400 active:scale-[0.98] transition-all"
              >
                Cobrar mesa
              </button>
            </div>
          )}
        </div>
      </div>

      {mermaItem && (
        <MermaModal
          item={mermaItem}
          onClose={() => setMermaItem(null)}
          onConfirm={(motivo, descripcion, cantidad) => {
            onMerma?.(mermaItem, motivo, descripcion, cantidad ?? mermaItem.cantidad)
            setMermaItem(null)
          }}
        />
      )}
    </div>
  )
}

function ItemLine({ item, onMerma }: { item: ComandaItem; onMerma?: (item: ComandaItem) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 bg-gray-800/40 rounded-xl">
      <div className="flex items-center gap-2 min-w-0">
        {item.cantidad > 1 && (
          <span className="text-cyan-400 font-bold text-sm shrink-0">{item.cantidad}×</span>
        )}
        <div className="min-w-0">
          <span className="text-gray-200 text-sm">{item.nombre}</span>
          {item.nota && <p className="text-gray-600 text-xs truncate">{item.nota}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <span className="text-gray-400 text-sm">{fmt(item.precio * item.cantidad)} €</span>
        {onMerma && (
          <button
            onClick={e => { e.stopPropagation(); onMerma(item) }}
            className="text-red-500 hover:text-red-400 text-xs px-2 py-0.5 rounded-lg bg-red-950/60 hover:bg-red-900/50 transition-colors"
          >
            merma
          </button>
        )}
      </div>
    </div>
  )
}

// ── Tarjeta mesa en el feed ───────────────────────────────────────────────────
function MesaCard({ mesa, onClick }: { mesa: MesaConPlan; onClick?: () => void }) {
  const { estado } = mesa

  if (estado.tipo === 'libre') {
    return (
      <div className="bg-[#111827] border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#1e2d45] flex items-center justify-center shrink-0">
          <span className="text-gray-500 font-bold text-sm">{mesa.numero}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-600 text-sm font-medium">Mesa {mesa.numero}</p>
          <p className="text-gray-700 text-xs">{mesa.planNombre}</p>
        </div>
        <span className="text-gray-700 text-xs">libre</span>
      </div>
    )
  }

  const { comanda } = estado
  const cfg = ESTADO_CONFIG[comanda.estado as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.abierta
  const sentItems  = comanda.items.filter(i => i.nivel != null)
  const total      = sentItems.length > 0
    ? sentItems.reduce((s, i) => s + i.precio * i.cantidad, 0)
    : comanda.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const hasPending = sentItems.length > 0 && comanda.items.some(i => i.nivel == null)

  return (
    <button onClick={onClick}
      className={`w-full text-left ${cfg.bg} border ${cfg.border} rounded-2xl p-4 hover:brightness-110 transition-all active:scale-[0.99]`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full border-2 ${cfg.border} flex items-center justify-center shrink-0`}>
            <span className={`${cfg.text} font-black text-base`}>{mesa.numero}</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Mesa {mesa.numero}</p>
            <p className="text-gray-500 text-xs">{mesa.planNombre}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-1">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className={`${cfg.text} text-xs font-semibold`}>{cfg.label}</span>
          </div>
          <span className="text-gray-500 text-xs">
            {comanda.estado === 'cerrada' && comanda.closedAt
              ? `Cobrada ${timeAgo(comanda.closedAt)}`
              : `Abierta ${timeAgo(comanda.createdAt)}`}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-gray-400 text-xs">
          <span>{comanda.pax} pax · {comanda.items.length} platos</span>
          {comanda.camareroNombre && (
            <span className="text-gray-600">👤 {comanda.camareroNombre}</span>
          )}
          {comanda.metodoPago && (
            <span>{comanda.metodoPago === 'cash' ? '💵' : '💳'}</span>
          )}
        </div>
        <span className="text-white font-bold text-sm">
          {fmt(total)} €{hasPending && <span className="text-gray-600 text-xs font-normal ml-1">+pdte.</span>}
        </span>
      </div>
    </button>
  )
}

// ── Buscador rápido por número de mesa ────────────────────────────────────────
function BuscadorMesa({ mesas, onSelect }: {
  mesas: MesaConPlan[]
  onSelect: (mesa: MesaConPlan) => void
}) {
  const [open, setOpen] = useState(false)
  const [num, setNum] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const match = num ? mesas.find(m => String(m.numero) === num) : null

  const handleSelect = (mesa = match) => {
    if (mesa && mesa.estado.tipo !== 'libre') {
      onSelect(mesa)
      setOpen(false)
      setNum('')
    }
  }

  // Auto-submit 1s después de escribir si hay match válido
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (match && match.estado.tipo !== 'libre') {
      timerRef.current = setTimeout(() => handleSelect(match), 1000)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [num])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-cyan-600 text-white shadow-xl flex items-center justify-center text-2xl hover:bg-cyan-500 active:scale-95 transition-all z-40"
        title="Buscar mesa"
      >
        #
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6" onClick={() => { setOpen(false); setNum('') }}>
      <div className="bg-[#0f172a] rounded-3xl shadow-2xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <p className="text-gray-400 text-sm text-center mb-4">Número de mesa</p>

        {/* Display */}
        <div className={`text-center text-6xl font-black mb-4 transition-colors ${
          match
            ? match.estado.tipo === 'libre' ? 'text-gray-500' : 'text-cyan-400'
            : num ? 'text-red-400' : 'text-gray-600'
        }`}>
          {num || '—'}
        </div>

        {match && match.estado.tipo !== 'libre' && (
          <p className="text-center text-xs mb-4 text-cyan-400">
            {ESTADO_CONFIG[match.estado.comanda.estado as keyof typeof ESTADO_CONFIG]?.label ?? ''} · {match.planNombre}
          </p>
        )}
        {match && match.estado.tipo === 'libre' && (
          <p className="text-center text-xs mb-4 text-gray-500">Mesa libre</p>
        )}
        {num && !match && (
          <p className="text-center text-xs mb-4 text-red-400">Mesa no encontrada</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => setNum(p => p.length < 3 ? p + n : p)}
              className="h-14 rounded-2xl bg-gray-800 text-white text-xl font-bold hover:bg-gray-700 active:scale-95 transition-all">
              {n}
            </button>
          ))}
          <button onClick={() => setNum('')}
            className="h-14 rounded-2xl bg-gray-800 text-gray-400 text-sm font-medium hover:bg-gray-700 active:scale-95 transition-all">
            C
          </button>
          <button onClick={() => setNum(p => p.length < 3 ? p + '0' : p)}
            className="h-14 rounded-2xl bg-gray-800 text-white text-xl font-bold hover:bg-gray-700 active:scale-95 transition-all">
            0
          </button>
          <button onClick={() => setNum(p => p.slice(0, -1))}
            className="h-14 rounded-2xl bg-gray-800 text-gray-400 text-xl hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center">
            ⌫
          </button>
        </div>

        <button
          onClick={() => handleSelect()}
          disabled={!match || match.estado.tipo === 'libre'}
          className="w-full h-14 rounded-2xl bg-cyan-600 text-white font-bold text-lg disabled:opacity-30 hover:bg-cyan-500 active:scale-95 transition-all"
        >
          Ver mesa
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MesasFeedPage() {
  const queryClient = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<{ comanda: Comanda; planNombre: string } | null>(null)

  const cobrarComanda = useMutation({
    mutationFn: ({ id, metodoPago }: { id: number; metodoPago: 'cash' | 'tarjeta' }) =>
      api.comandas.cerrar(id, metodoPago),
    onSuccess: () => {
      setDetalle(null)
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-activas', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-cerradas', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-liberadas', restaurantId] })
    },
  })

  const restituirMerma = useMutation({
    mutationFn: (mermaId: number) => api.mermas.restituir(mermaId),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-activas', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-liberadas', restaurantId] })
      if (detalle) {
        const updated = await api.comandas.get(detalle.comanda.id)
        setDetalle({ ...detalle, comanda: updated })
      }
    },
  })

  const crearMerma = useMutation({
    mutationFn: async ({ item, motivo, descripcion, cantidad }: {
      item: ComandaItem
      motivo: MermaMotivo
      descripcion?: string
      cantidad: number
    }) => {
      if (!detalle) return
      await api.mermas.create({
        restaurantId:   detalle.comanda.restaurantId,
        mesaNumero:     detalle.comanda.mesa.numero,
        comandaId:      detalle.comanda.id,
        itemNombre:     item.nombre,
        cantidad,
        precio:         item.precio,
        itemNivel:      item.nivel,
        itemRonda:      item.ronda,
        motivo,
        descripcion,
      })
      const restante = item.cantidad - cantidad
      if (restante > 0) {
        await api.comandas.updateItem(detalle.comanda.id, item.id, { cantidad: restante })
      } else {
        await api.comandas.deleteItem(detalle.comanda.id, item.id)
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-activas', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['comandas-feed-liberadas', restaurantId] })
      if (detalle) {
        const updated = await api.comandas.get(detalle.comanda.id)
        setDetalle({ ...detalle, comanda: updated })
      }
    },
  })

  useRestaurantEvents(restaurantId)

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  useEffect(() => {
    if (!restaurantId && restaurantes?.length) setRestaurantId(restaurantes[0].id)
  }, [restaurantes, restaurantId])

  const { data: planes } = useQuery({
    queryKey: ['salon-planes', restaurantId],
    queryFn: () => api.salon.list(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 20_000,
  })

  const { data: activas } = useQuery({
    queryKey: ['comandas-feed-activas', restaurantId],
    queryFn: () => api.comandas.list(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  })

  const { data: cerradas } = useQuery({
    queryKey: ['comandas-feed-cerradas', restaurantId],
    queryFn: () => api.comandas.list(restaurantId!, 'cerrada'),
    enabled: !!restaurantId,
    refetchInterval: 20_000,
  })

  const { data: liberadas } = useQuery({
    queryKey: ['comandas-feed-liberadas', restaurantId],
    queryFn: () => api.comandas.list(restaurantId!, 'liberada'),
    enabled: !!restaurantId,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  })

  const hoy = new Date().toDateString()
  const cerradasHoy = cerradas?.filter(c => c.closedAt && new Date(c.closedAt).toDateString() === hoy) ?? []

  const todasMesas: MesaConPlan[] = (planes ?? []).flatMap((plan: FloorPlan) =>
    plan.mesas.filter((mesa: Mesa) => mesa.tipo !== 'barra').flatMap((mesa: Mesa) => {
      const comandasActivas = activas?.filter(c => c.mesaId === mesa.id) ?? []
      const comCerrada = cerradasHoy.find(c => c.mesaId === mesa.id)
      // Si hay varias comandas activas para la misma mesa (p.ej. facturada original + enviada tras traslado),
      // generar una entrada por cada comanda para que el admin las vea todas
      if (comandasActivas.length > 1) {
        return comandasActivas.map(comanda => ({
          ...mesa, planNombre: plan.nombre, estado: { tipo: 'activa' as const, comanda },
        }))
      }
      const comActiva = comandasActivas[0]
      const estado: EstadoMesa = comActiva
        ? { tipo: 'activa', comanda: comActiva }
        : comCerrada
          ? { tipo: 'cerrada_hoy', comanda: comCerrada }
          : { tipo: 'libre' }
      return [{ ...mesa, planNombre: plan.nombre, estado }]
    })
  )

  const ordenPrioridad = (m: MesaConPlan) => {
    if (m.estado.tipo === 'activa') {
      const order = { facturada: 0, enviada: 1, abierta: 2 }
      return order[m.estado.comanda.estado as keyof typeof order] ?? 3
    }
    if (m.estado.tipo === 'cerrada_hoy') return 10
    return 20
  }

  const mesasOrdenadas = [...todasMesas].sort((a, b) => ordenPrioridad(a) - ordenPrioridad(b))

  const numActivas      = todasMesas.filter(m => m.estado.tipo === 'activa').length
  const numCerradas     = cerradasHoy.length
  const totalCobrado    = cerradasHoy.reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.precio * i.cantidad, 0), 0)
  const liberadasConItems = (liberadas ?? []).filter(c => c.items.length > 0)
  const numLiberadas    = liberadasConItems.length
  const totalLiberadas  = liberadasConItems.reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.precio * i.cantidad, 0), 0)

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Selector restaurante */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        {restaurantes?.map((r: Restaurante) => (
          <button key={r.id} onClick={() => setRestaurantId(r.id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              restaurantId === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {r.nombre}
          </button>
        ))}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs mb-1">Mesas activas</p>
          <p className="text-gray-900 text-2xl font-black">{numActivas}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs mb-1">Cobradas hoy</p>
          <p className="text-gray-900 text-2xl font-black">{numCerradas}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs mb-1">Total hoy</p>
          <p className="text-gray-900 text-xl font-black">{fmt(totalCobrado)} €</p>
        </div>
      </div>

      {/* Caja — mesas liberadas pendientes de cobro */}
      {numLiberadas > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-orange-400 font-bold text-sm">Pendiente de cobro ({numLiberadas})</span>
            </div>
            <span className="text-orange-300 font-black">{fmt(totalLiberadas)} €</span>
          </div>
          <div className="space-y-2">
            {liberadasConItems.map(c => {
              const total = c.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
              return (
                <div key={c.id} className="bg-[#2d1200] border border-orange-700/60 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setDetalle({ comanda: c, planNombre: '' })}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-orange-900/20 transition-colors text-left">
                    <div className="w-10 h-10 rounded-xl border-2 border-orange-600 flex items-center justify-center shrink-0">
                      <span className="text-orange-400 font-black">{c.mesa.numero}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm">Mesa {c.mesa.numero}</p>
                      <p className="text-gray-500 text-xs">
                        {c.pax} pax{c.camareroNombre ? ` · ${c.camareroNombre}` : ''} · {timeAgo(c.createdAt)}
                      </p>
                    </div>
                    <span className="text-white font-black">{fmt(total)} €</span>
                  </button>
                  {c.mermas?.length > 0 && (
                    <div className="px-4 pb-2 space-y-0.5 border-t border-orange-900/40 pt-2">
                      {c.mermas.map((m: ComandaMerma) => (
                        <p key={m.id} className="text-red-400 text-xs">
                          ▼ {m.cantidad > 1 ? `${m.cantidad}× ` : ''}{m.itemNombre}
                          <span className="text-gray-600 ml-1">
                            ({m.motivo === 'no_servido' ? 'no servido' : m.motivo === 'queja_cliente' ? 'queja' : 'otro'})
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-px bg-orange-900/30">
                    <button
                      onClick={() => cobrarComanda.mutate({ id: c.id, metodoPago: 'cash' })}
                      className="py-3 text-green-400 font-bold text-sm hover:bg-green-900/30 transition-colors">
                      Efectivo
                    </button>
                    <button
                      onClick={() => cobrarComanda.mutate({ id: c.id, metodoPago: 'tarjeta' })}
                      className="py-3 text-blue-400 font-bold text-sm hover:bg-blue-900/30 transition-colors">
                      Tarjeta
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-2">
        {mesasOrdenadas.map(mesa => (
          <MesaCard
            key={mesa.estado.tipo === 'activa' ? mesa.estado.comanda.id : mesa.id}
            mesa={mesa}
            onClick={mesa.estado.tipo !== 'libre'
              ? () => setDetalle({ comanda: mesa.estado.tipo !== 'libre' ? (mesa.estado as { comanda: Comanda }).comanda : null!, planNombre: mesa.planNombre })
              : undefined}
          />
        ))}
        {mesasOrdenadas.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🪑</p>
            <p className="text-sm">No hay mesas configuradas</p>
          </div>
        )}
      </div>

      {detalle && (
        <ComandaDetalleModal
          comanda={detalle.comanda}
          planNombre={detalle.planNombre}
          onClose={() => setDetalle(null)}
          onCobrar={metodoPago => cobrarComanda.mutate({ id: detalle.comanda.id, metodoPago })}
          onRestituir={mermaId => restituirMerma.mutate(mermaId)}
          onMerma={(item, motivo, descripcion, cantidad) => crearMerma.mutate({ item, motivo, descripcion, cantidad })}
        />
      )}

      <BuscadorMesa
        mesas={mesasOrdenadas}
        onSelect={mesa => mesa.estado.tipo !== 'libre' && setDetalle({
          comanda: (mesa.estado as { comanda: Comanda }).comanda,
          planNombre: mesa.planNombre,
        })}
      />
    </div>
  )
}
