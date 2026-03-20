import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export default function AdminPage() {
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
  const queryClient = useQueryClient()

  const eliminarRetiro = useMutation({
    mutationFn: (id: number) => api.retiros.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retiros'] })
      setSelectedId(null)
    },
  })

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
    <div>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-4 md:space-y-6">
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
                      ? 'bg-gray-900 border-cyan-400 scale-110'
                      : 'bg-gray-900 border-gray-700 hover:border-cyan-400 opacity-50 hover:opacity-100'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Retiros {data?.total ? `· ${data.total}` : ''}
          </h2>
          <button
            onClick={handleExport}
            disabled={exporting || !data?.total}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-cyan-400 hover:text-cyan-600 transition-colors disabled:opacity-40"
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {isPending || !data ? (
            <div className="p-8 text-center text-gray-400">Cargando…</div>
          ) : data.retiros.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No hay retiros con estos filtros</div>
          ) : (
            <>
              {/* Tabla — desktop */}
              <table className="hidden md:table w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Fecha</th>
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Empleado</th>
                    <th className="text-left px-5 py-3 text-gray-500 font-medium">Restaurante</th>
                    <th className="text-right px-5 py-3 text-gray-500 font-medium">Items</th>
                    <th className="text-center px-5 py-3 text-gray-500 font-medium">Estado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.retiros.map((retiro) => (
                    <tr
                      key={retiro.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedId === retiro.id ? 'bg-cyan-50' : ''}`}
                      onClick={() => setSelectedId(selectedId === retiro.id ? null : retiro.id)}
                    >
                      <td className="px-5 py-4 text-gray-700">
                        {new Date(retiro.createdAt).toLocaleString('es-ES', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-900">{retiro.empleado.nombre}</td>
                      <td className="px-5 py-4 text-gray-600">{retiro.restaurant.nombre}</td>
                      <td className="px-5 py-4 text-right text-gray-500">{retiro.items.length}</td>
                      <td className="px-5 py-4 text-center">
                        {retiro.confirmadoAt ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-100">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Recibido
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-500 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-100">
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-300 text-right">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cards — móvil */}
              <ul className="md:hidden divide-y divide-gray-50">
                {data.retiros.map((retiro) => (
                  <li
                    key={retiro.id}
                    className={`px-4 py-4 cursor-pointer transition-colors active:bg-gray-50 ${selectedId === retiro.id ? 'bg-cyan-50' : ''}`}
                    onClick={() => setSelectedId(selectedId === retiro.id ? null : retiro.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{retiro.empleado.nombre}</p>
                        <p className="text-sm text-gray-500 truncate">{retiro.restaurant.nombre}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(retiro.createdAt).toLocaleString('es-ES', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                          {' · '}{retiro.items.length} item{retiro.items.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {retiro.confirmadoAt ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-100">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Recibido
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-500 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-100">
                            Pendiente
                          </span>
                        )}
                        <span className="text-gray-300 text-sm">›</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Modal de detalle */}
        {selectedId && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
            onClick={() => setSelectedId(null)}
          >
            <div
              className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden animate-slideUp"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar mobile */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>

              {!detalle ? (
                <div className="px-6 py-8 space-y-3">
                  {[1,2,3,4].map(i => <div key={i} className="h-8 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <>
                  {/* Header oscuro */}
                  <div className="bg-gray-950 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">
                          {new Date(detalle.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <h3 className="text-lg font-bold text-white">{detalle.empleado.nombre}</h3>
                        <p className="text-sm text-gray-400">{detalle.restaurant.nombre}</p>
                      </div>
                      <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-white text-2xl leading-none mt-1 transition-colors">×</button>
                    </div>
                  </div>

                  {/* Items */}
                  <ul className="divide-y divide-gray-100 overflow-y-auto max-h-80 px-6">
                    {detalle.items.map((item, i) => (
                      <li key={i} className="flex justify-between items-center py-3.5">
                        <div>
                          <p className="font-medium text-gray-900">{item.nombre}</p>
                          <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                        </div>
                        <span className="font-bold text-cyan-600 whitespace-nowrap ml-4 bg-cyan-50 px-3 py-1 rounded-full text-sm">
                          {item.cantidad} {item.unidad}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Footer */}
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
                  <div className="flex justify-end">
                      <button
                        onClick={() => { if (confirm('¿Eliminar este retiro permanentemente?')) eliminarRetiro.mutate(selectedId!) }}
                        className="text-sm text-red-400 hover:text-red-600 transition-colors"
                      >
                        Eliminar retiro
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">{detalle.items.length} producto{detalle.items.length !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-gray-400">#{selectedId}</span>
                    </div>
                    {detalle.confirmadoAt ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>
                          Recibido por <strong>{detalle.confirmadoPor}</strong> · {new Date(detalle.confirmadoAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Pendiente de confirmación en cocina</span>
                      </div>
                    )}
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
