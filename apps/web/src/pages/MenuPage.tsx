import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, MenuItem } from '../api'

const CATEGORIAS = ['Classic Tapas', 'Vegetarian Tapas', 'Fish Tapas', 'Meat Tapas', 'Rice', 'Pasta']

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400'

function ItemForm({
  initial,
  restaurantId,
  onDone,
}: {
  initial?: MenuItem
  restaurantId: number
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [categoria, setCategoria] = useState(initial?.categoria ?? CATEGORIAS[0])
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '')
  const [precio, setPrecio] = useState(initial?.precio?.toString() ?? '')
  const [orden, setOrden] = useState(initial?.orden?.toString() ?? '0')
  const [feedback, setFeedback] = useState('')

  const save = useMutation({
    mutationFn: () => initial
      ? api.menu.update(initial.id, { categoria, nombre, descripcion, precio: parseFloat(precio), orden: parseInt(orden) })
      : api.menu.create({ restaurantId, categoria, nombre, descripcion, precio: parseFloat(precio), orden: parseInt(orden) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu', restaurantId] })
      onDone()
    },
    onError: () => setFeedback('Error al guardar'),
  })

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
      <h3 className="font-semibold text-gray-700">{initial ? 'Editar item' : 'Nuevo item'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Categoría</label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls}>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} placeholder="Nombre del plato" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
          <input value={descripcion} onChange={e => setDescripcion(e.target.value)} className={inputCls} placeholder="Ingredientes, elaboración..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Precio (€)</label>
          <input type="number" step="0.01" min="0" value={precio} onChange={e => setPrecio(e.target.value)} className={inputCls} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Orden</label>
          <input type="number" min="0" value={orden} onChange={e => setOrden(e.target.value)} className={inputCls} />
        </div>
      </div>
      {feedback && <p className="text-red-500 text-xs">{feedback}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button onClick={onDone} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
        <button
          onClick={() => save.mutate()}
          disabled={!nombre.trim() || !precio || save.isPending}
          className="bg-cyan-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-cyan-400 disabled:opacity-40"
        >
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function MenuPage() {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [editando, setEditando] = useState<MenuItem | null>(null)
  const [creando, setCreando] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

  const { data: restaurantes } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const { data: items } = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.menu.list(restaurantId!),
    enabled: !!restaurantId,
  })

  const mostrar = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 2500)
  }

  const toggle = useMutation({
    mutationFn: (id: number) => api.menu.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu', restaurantId] }),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.menu.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu', restaurantId] })
      mostrar('Item eliminado', true)
    },
  })

  // Agrupar por categoría
  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    items: (items ?? []).filter(i => i.categoria === cat),
  })).filter(g => g.items.length > 0)

  // Categorías con items no agrupados (custom)
  const otrasCategs = [...new Set((items ?? []).map(i => i.categoria))].filter(c => !CATEGORIAS.includes(c))
  const todas = [
    ...porCategoria,
    ...otrasCategs.map(cat => ({ cat, items: (items ?? []).filter(i => i.categoria === cat) })),
  ]

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* Selector de restaurante */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">Restaurante</h2>
          <div className="flex flex-wrap gap-2">
            {restaurantes?.map(r => (
              <button
                key={r.id}
                onClick={() => { setRestaurantId(r.id); setCreando(false); setEditando(null) }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  restaurantId === r.id
                    ? 'bg-cyan-500 border-cyan-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </div>

        {restaurantId && (
          <>
            {/* Formulario nuevo item */}
            {creando && (
              <ItemForm
                restaurantId={restaurantId}
                onDone={() => setCreando(false)}
              />
            )}

            {/* Formulario editar item */}
            {editando && (
              <ItemForm
                initial={editando}
                restaurantId={restaurantId}
                onDone={() => setEditando(null)}
              />
            )}

            {/* Botón añadir */}
            {!creando && !editando && (
              <button
                onClick={() => setCreando(true)}
                className="w-full bg-cyan-500 text-white font-semibold py-3 rounded-2xl hover:bg-cyan-400 transition-colors"
              >
                + Añadir item al menú
              </button>
            )}

            {/* Lista por categoría */}
            {todas.length === 0 && !creando && (
              <p className="text-center text-gray-400 text-sm py-10">No hay items en el menú</p>
            )}

            {todas.map(({ cat, items: catItems }) => (
              <div key={cat} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-600">{cat}</h3>
                  <span className="text-xs text-gray-400">{catItems.length} items</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {catItems.map(item => (
                    <li key={item.id} className={`px-5 py-4 ${!item.activo ? 'opacity-40' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm">{item.nombre}</p>
                          {item.descripcion && (
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.descripcion}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold text-cyan-600">{formatEur(item.precio)}</span>
                          <button onClick={() => setEditando(item)} className="text-xs text-cyan-500 hover:text-cyan-700">Editar</button>
                          <button
                            onClick={() => toggle.mutate(item.id)}
                            className={`text-xs font-medium ${item.activo ? 'text-gray-400 hover:text-gray-600' : 'text-green-500 hover:text-green-700'}`}
                          >
                            {item.activo ? 'Ocultar' : 'Activar'}
                          </button>
                          <button
                            onClick={() => { if (confirm(`¿Eliminar "${item.nombre}"?`)) eliminar.mutate(item.id) }}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>

      {feedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${feedback.ok ? 'bg-cyan-600' : 'bg-red-600'}`}>
          {feedback.msg}
        </div>
      )}
    </>
  )
}
