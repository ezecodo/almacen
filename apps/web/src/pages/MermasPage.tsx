import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Merma, Restaurante } from '../api'

const MOTIVO_CONFIG = {
  no_servido:    { label: 'No se sirvió',     color: 'text-orange-400 bg-orange-500/10' },
  queja_cliente: { label: 'Queja de cliente', color: 'text-red-400 bg-red-500/10' },
  otro:          { label: 'Otro',             color: 'text-gray-400 bg-gray-500/10' },
}

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MermasPage() {
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  useEffect(() => {
    if (!restaurantId && restaurantes?.length) setRestaurantId(restaurantes[0].id)
  }, [restaurantes, restaurantId])

  const { data } = useQuery({
    queryKey: ['mermas', restaurantId, desde, hasta, page],
    queryFn: () => api.mermas.list(restaurantId!, desde || undefined, hasta || undefined, page),
    enabled: !!restaurantId,
  })

  const mermas = data?.mermas ?? []

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Mermas</h1>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-wrap">
          {restaurantes?.map((r: Restaurante) => (
            <button key={r.id} onClick={() => { setRestaurantId(r.id); setPage(1) }}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                restaurantId === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {r.nombre}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto items-center">
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }}
            className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-cyan-300" />
          <span className="text-gray-400 text-sm">—</span>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }}
            className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-cyan-300" />
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta(''); setPage(1) }}
              className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
          )}
        </div>
      </div>

      {/* Resumen rápido */}
      {data && (
        <p className="text-gray-400 text-sm mb-4">{data.total} merma{data.total !== 1 ? 's' : ''} registrada{data.total !== 1 ? 's' : ''}</p>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {mermas.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-sm">Sin mermas registradas</p>
          </div>
        )}
        {mermas.map((m: Merma) => {
          const cfg = MOTIVO_CONFIG[m.motivo] ?? MOTIVO_CONFIG.otro
          return (
            <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-900 font-bold">{m.cantidad > 1 ? `${m.cantidad}× ` : ''}{m.itemNombre}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {m.descripcion && (
                    <p className="text-gray-500 text-xs italic">"{m.descripcion}"</p>
                  )}
                </div>
                <span className="text-gray-400 text-xs whitespace-nowrap shrink-0">{fmtFechaHora(m.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                {m.mesaNumero && <span>Mesa {m.mesaNumero}</span>}
                {m.planNombre && <><span>·</span><span>{m.planNombre}</span></>}
                {m.camareroNombre && <><span>·</span><span>👤 {m.camareroNombre}</span></>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Paginación */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm disabled:opacity-30 hover:bg-gray-200">
            ← Anterior
          </button>
          <span className="text-gray-500 text-sm">{page} / {data.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm disabled:opacity-30 hover:bg-gray-200">
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
