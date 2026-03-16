import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { api, RetiroFiltros } from '../api'

const LOGO_MAP: Record<string, string> = {
  'sensi tapas': 'tapas.png',
  'bistro':      'bistro.png',
  'gourmet':     'gourmet.png',
  'colección':   'coleccion.png',
  'coleccion':   'coleccion.png',
  'petit':       'petit.png',
}

function getLogoSrc(nombre: string): string | null {
  const key = nombre.toLowerCase()
  for (const [pattern, file] of Object.entries(LOGO_MAP)) {
    if (key.includes(pattern)) return `/${file}`
  }
  return null
}

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN as string

function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) {
      onSuccess()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Panel Admin</h1>
        <p className="text-gray-400 text-sm mb-8">Introduce el PIN para continuar</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false) }}
            placeholder="····"
            autoFocus
            className={`w-full text-center text-3xl tracking-widest border-2 rounded-xl px-4 py-4 focus:outline-none transition-colors ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-indigo-500'
            }`}
          />
          {error && <p className="text-red-500 text-sm">PIN incorrecto</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white text-lg font-semibold py-4 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Entrar
          </button>
        </form>
        <Link to="/" className="block mt-6 text-sm text-gray-400 hover:text-gray-600">
          ← Volver a la app
        </Link>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const [autenticado, setAutenticado] = useState(false)

  if (!autenticado) return <PinGate onSuccess={() => setAutenticado(true)} />

  return <AdminPanel />
}

function AdminPanel() {
  const [filtros, setFiltros] = useState<RetiroFiltros>({ page: 1, limit: 20 })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isPending } = useQuery({
    queryKey: ['retiros', filtros],
    queryFn: () => api.retiros.list(filtros),
  })

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  const { data: detalle } = useQuery({
    queryKey: ['retiro', selectedId],
    queryFn: () => api.retiros.get(selectedId!),
    enabled: selectedId !== null,
  })

  const totalPages = data?.pages ?? 1

  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await api.retiros.list({ ...filtros, page: 1, limit: 5000 })
      const rows = result.retiros.flatMap((retiro) =>
        retiro.items.map((item) => ({
          'Fecha': new Date(retiro.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          'Restaurante': retiro.restaurant.nombre,
          'Empleado': retiro.empleado.nombre,
          'Producto': item.nombre,
          'Código de barras': item.barcode,
          'Cantidad': item.cantidad,
          'Unidad': item.unidad,
        }))
      )
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 8 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Retiros')
      const desde = filtros.desde ?? 'inicio'
      const hasta = filtros.hasta ?? 'hoy'
      XLSX.writeFile(wb, `retiros_${desde}_${hasta}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-indigo-600 text-sm hover:underline">← Volver</Link>
          <h1 className="text-xl font-bold text-gray-900">Panel Admin</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/empleados" className="text-sm bg-indigo-50 text-indigo-600 font-medium px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors">
            👥 Empleados
          </Link>
          <Link to="/admin/productos" className="text-sm bg-indigo-50 text-indigo-600 font-medium px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors">
            📦 Catálogo
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{data?.total ?? 0} retiro{data?.total !== 1 ? 's' : ''}</span>
          <button
            onClick={handleExport}
            disabled={exporting || !data?.total}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
          >
            {exporting ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Exportar XLSX
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Acceso rápido por restaurante */}
        {restaurantes && (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => setFiltros((f) => ({ ...f, restaurantId: undefined, page: 1 }))}
              className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                !filtros.restaurantId
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              Todos
            </button>
            {restaurantes.map((r) => {
              const src = getLogoSrc(r.nombre)
              const active = filtros.restaurantId === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setFiltros((f) => ({ ...f, restaurantId: r.id, page: 1 }))}
                  title={r.nombre}
                  className={`w-24 h-24 rounded-2xl border-2 flex items-center justify-center p-3 transition-all ${
                    active
                      ? 'bg-gray-900 border-gray-900 scale-110'
                      : 'bg-gray-900 border-gray-200 hover:border-gray-500 opacity-50 hover:opacity-100'
                  }`}
                >
                  {src ? (
                    <img src={src} alt={r.nombre} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-white text-sm font-bold">{r.nombre.charAt(0)}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Restaurante</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={filtros.restaurantId ?? ''}
                onChange={(e) =>
                  setFiltros((f) => ({
                    ...f,
                    restaurantId: e.target.value ? Number(e.target.value) : undefined,
                    page: 1,
                  }))
                }
              >
                <option value="">Todos</option>
                {restaurantes?.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={filtros.desde ?? ''}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, desde: e.target.value || undefined, page: 1 }))
                }
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={filtros.hasta ?? ''}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, hasta: e.target.value || undefined, page: 1 }))
                }
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setFiltros({ page: 1, limit: 20 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {/* Lista de retiros */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {isPending || !data ? (
            <div className="p-8 text-center text-gray-400">Cargando…</div>
          ) : data.retiros.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No hay retiros con estos filtros</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Fecha</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Empleado</th>
                  <th className="text-left px-5 py-3 text-gray-500 font-medium">Restaurante</th>
                  <th className="text-right px-5 py-3 text-gray-500 font-medium">Items</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.retiros.map((retiro) => (
                  <tr
                    key={retiro.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedId === retiro.id ? 'bg-indigo-50' : ''}`}
                    onClick={() => setSelectedId(selectedId === retiro.id ? null : retiro.id)}
                  >
                    <td className="px-5 py-4 text-gray-700">
                      {new Date(retiro.createdAt).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-900">{retiro.empleado.nombre}</td>
                    <td className="px-5 py-4 text-gray-600">{retiro.restaurant.nombre}</td>
                    <td className="px-5 py-4 text-right text-gray-500">{retiro.items.length}</td>
                    <td className="px-5 py-4 text-gray-300 text-right">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal de detalle */}
        {selectedId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedId(null)}>
            <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Handle bar mobile */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>

              {!detalle ? (
                <div className="p-8 text-center text-gray-400">Cargando…</div>
              ) : (
                <>
                  <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">
                          {new Date(detalle.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <h3 className="text-lg font-bold text-gray-900">{detalle.empleado.nombre}</h3>
                        <p className="text-sm text-gray-500">{detalle.restaurant.nombre}</p>
                      </div>
                      <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none mt-1">×</button>
                    </div>
                  </div>

                  <ul className="divide-y divide-gray-100 overflow-y-auto max-h-96 px-6">
                    {detalle.items.map((item, i) => (
                      <li key={i} className="flex justify-between items-center py-4">
                        <div>
                          <p className="font-medium text-gray-900">{item.nombre}</p>
                          <p className="text-xs text-gray-400">{item.barcode}</p>
                        </div>
                        <span className="font-bold text-indigo-600 whitespace-nowrap ml-4">
                          {item.cantidad} {item.unidad}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="px-6 py-4 bg-gray-50 text-sm text-gray-400">
                    {detalle.items.length} producto{detalle.items.length !== 1 ? 's' : ''}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <button
              disabled={(filtros.page ?? 1) <= 1}
              onClick={() => setFiltros((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <span className="px-4 py-2 text-sm text-gray-500">
              {filtros.page} / {totalPages}
            </span>
            <button
              disabled={(filtros.page ?? 1) >= totalPages}
              onClick={() => setFiltros((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
