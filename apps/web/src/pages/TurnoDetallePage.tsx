import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, Comanda } from '../api'


function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}


function ComandaCard({ comanda }: { comanda: Comanda }) {
  const total = comanda.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const isPago = comanda.metodoPago === 'cash'

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-lg">
            Mesa {comanda.mesa.numero}
          </span>
          <span className="text-gray-400 text-xs">{comanda.pax} pax</span>
          {comanda.camareroNombre && (
            <span className="text-gray-400 text-xs">· {comanda.camareroNombre}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
            isPago ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {isPago ? '💵 Efectivo' : '💳 Tarjeta'}
          </span>
          {comanda.propina > 0 && (
            <span className="text-amber-500 text-xs font-medium">+{fmt(comanda.propina)} € propina</span>
          )}
          <span className="text-gray-900 font-black text-base">{fmt(total)} €</span>
          {comanda.closedAt && (
            <span className="text-gray-400 text-xs">{fmtHora(comanda.closedAt)}</span>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="px-4 py-2 space-y-1">
        {comanda.items.map(item => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">
              <span className="text-gray-400 font-medium mr-2">{item.cantidad}×</span>
              {item.nombre}
              {item.nota && <span className="text-gray-400 ml-1 text-xs">({item.nota})</span>}
            </span>
            <span className="text-gray-500">{fmt(item.precio * item.cantidad)} €</span>
          </div>
        ))}
      </div>

      {/* Mermas */}
      {comanda.mermas.length > 0 && (
        <div className="border-t border-gray-50 px-4 py-2 space-y-1">
          {comanda.mermas.map(m => (
            <div key={m.id} className="flex items-center justify-between text-xs text-red-400">
              <span>Merma: {m.itemNombre} × {m.cantidad}</span>
              <span className="capitalize">{m.motivo.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TurnoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const turnoId = Number(id)

  const { data: comandas, isLoading } = useQuery({
    queryKey: ['turno-comandas', turnoId],
    queryFn: () => api.turnos.getComanadas(turnoId),
    enabled: !!turnoId,
  })

  // Aggregate stats from comandas
  const efectivo = comandas?.filter(c => c.metodoPago === 'cash').reduce((s, c) =>
    s + c.items.reduce((ss, i) => ss + i.precio * i.cantidad, 0), 0) ?? 0
  const tarjeta = comandas?.filter(c => c.metodoPago === 'tarjeta').reduce((s, c) =>
    s + c.items.reduce((ss, i) => ss + i.precio * i.cantidad, 0), 0) ?? 0
  const propinas = comandas?.reduce((s, c) => s + (c.propina ?? 0), 0) ?? 0

  // Group by mesa
  const byMesa = comandas?.reduce((acc, c) => {
    const key = c.mesa.numero
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {} as Record<number, Comanda[]>) ?? {}

  const mesasOrdenadas = Object.keys(byMesa).map(Number).sort((a, b) => a - b)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/admin/turnos')}
          className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
        >
          ← Turnos
        </button>
        <span className="text-gray-300">|</span>
        <h1 className="text-gray-900 font-black text-lg">Detalle del turno</h1>
      </div>

      {/* Resumen */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <p className="text-gray-400 text-xs mb-1">💵 Efectivo</p>
            <p className="text-gray-900 font-black text-lg">{fmt(efectivo)} €</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <p className="text-gray-400 text-xs mb-1">💳 Tarjeta</p>
            <p className="text-gray-900 font-black text-lg">{fmt(tarjeta)} €</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <p className="text-gray-400 text-xs mb-1">Total ventas</p>
            <p className="text-cyan-600 font-black text-lg">{fmt(efectivo + tarjeta)} €</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-3 text-center shadow-sm">
            <p className="text-gray-400 text-xs mb-1">Comandas</p>
            <p className="text-gray-900 font-black text-lg">{comandas?.length ?? 0}</p>
          </div>
          {propinas > 0 && (
            <div className="col-span-2 sm:col-span-4 bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-amber-600 text-sm font-semibold">Propinas tarjeta: {fmt(propinas)} €</p>
            </div>
          )}
        </div>
      )}

      {/* Comandas */}
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-10">Cargando...</p>
      ) : mesasOrdenadas.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-10">No hay comandas en este turno</p>
      ) : (
        <div className="space-y-6">
          {mesasOrdenadas.map(mesaNum => (
            <div key={mesaNum}>
              <h2 className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-2">
                Mesa {mesaNum}
              </h2>
              <div className="space-y-2">
                {byMesa[mesaNum].map(c => (
                  <ComandaCard key={c.id} comanda={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
