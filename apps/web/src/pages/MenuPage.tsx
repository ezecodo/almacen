import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, MenuCategoria, MenuItem } from '../api'

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400'

// ── Formulario de categoría ───────────────────────────────────────────────────
function CategoriaForm({
  restaurantId,
  grupoDefault,
  initial,
  onDone,
}: {
  restaurantId: number
  grupoDefault?: string
  initial?: MenuCategoria
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [icono, setIcono]   = useState(initial?.icono ?? '')
  const [grupo, setGrupo]   = useState(initial?.grupo ?? grupoDefault ?? '')

  const save = useMutation({
    mutationFn: () => initial
      ? api.menuCategorias.update(initial.id, { nombre, icono, grupo })
      : api.menuCategorias.create({ restaurantId, grupo, nombre, icono }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-cats', restaurantId] })
      onDone()
    },
  })

  return (
    <div className="bg-white border border-cyan-100 rounded-2xl p-4 shadow-sm space-y-3">
      <h3 className="font-semibold text-gray-700 text-sm">{initial ? 'Editar categoría' : 'Nueva categoría'}</h3>
      <div className="flex gap-3">
        <div className="w-20">
          <label className="block text-xs font-medium text-gray-500 mb-1">Icono</label>
          <input value={icono} onChange={e => setIcono(e.target.value)}
            className={inputCls + ' text-center text-xl'} placeholder="🍽️" maxLength={4} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            className={inputCls} placeholder="Ej: Classic Tapas, Cervezas..." autoFocus />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Sección</label>
        <input value={grupo} onChange={e => setGrupo(e.target.value)}
          className={inputCls} placeholder="Ej: Comida, Bebidas, Vinos..." />
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onDone} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
        <button
          onClick={() => save.mutate()}
          disabled={!nombre.trim() || save.isPending}
          className="bg-cyan-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-cyan-400 disabled:opacity-40"
        >
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Formulario de item ────────────────────────────────────────────────────────
function ItemForm({
  restaurantId,
  categoria,
  initial,
  onDone,
}: {
  restaurantId: number
  categoria: string
  initial?: MenuItem
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre]    = useState(initial?.nombre ?? '')
  const [descripcion, setDesc] = useState(initial?.descripcion ?? '')
  const [precio, setPrecio]    = useState(initial?.precio?.toString() ?? '')

  const save = useMutation({
    mutationFn: () => initial
      ? api.menu.update(initial.id, { nombre, descripcion, precio: parseFloat(precio) })
      : api.menu.create({ restaurantId, categoria, nombre, descripcion, precio: parseFloat(precio), orden: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items', restaurantId, categoria] })
      qc.invalidateQueries({ queryKey: ['menu-cats', restaurantId] })
      onDone()
    },
  })

  return (
    <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            className={inputCls} placeholder="Nombre del item" autoFocus />
        </div>
        <div>
          <input type="number" step="0.01" min="0" value={precio}
            onChange={e => setPrecio(e.target.value)} className={inputCls} placeholder="€ 0.00" />
        </div>
      </div>
      <input value={descripcion} onChange={e => setDesc(e.target.value)}
        className={inputCls} placeholder="Descripción / ingredientes (opcional)" />
      <div className="flex justify-end gap-3">
        <button onClick={onDone} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
        <button
          onClick={() => save.mutate()}
          disabled={!nombre.trim() || !precio || save.isPending}
          className="bg-cyan-500 text-white text-sm font-semibold px-4 py-1.5 rounded-xl hover:bg-cyan-400 disabled:opacity-40"
        >
          {save.isPending ? 'Guardando…' : initial ? 'Actualizar' : 'Añadir'}
        </button>
      </div>
    </div>
  )
}

// ── Panel de items de una categoría ──────────────────────────────────────────
function CategoriaPanel({
  restaurantId,
  cat,
  onClose,
}: {
  restaurantId: number
  cat: MenuCategoria
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [creando, setCreando]   = useState(false)
  const [editando, setEditando] = useState<MenuItem | null>(null)

  const { data: items = [] } = useQuery({
    queryKey: ['menu-items', restaurantId, cat.nombre],
    queryFn: () => api.menu.list(restaurantId, cat.nombre),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => api.menu.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items', restaurantId, cat.nombre] }),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.menu.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items', restaurantId, cat.nombre] })
      qc.invalidateQueries({ queryKey: ['menu-cats', restaurantId] })
    },
  })

  return (
    <div className="bg-white rounded-2xl border-2 border-cyan-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-cyan-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {cat.icono && <span className="text-xl">{cat.icono}</span>}
          <div>
            <h3 className="font-bold text-gray-800">{cat.nombre}</h3>
            <p className="text-xs text-gray-400">{items.length} items</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!creando && !editando && (
            <button onClick={() => setCreando(true)}
              className="bg-cyan-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-cyan-400">
              + Añadir item
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {creando && (
          <ItemForm restaurantId={restaurantId} categoria={cat.nombre} onDone={() => setCreando(false)} />
        )}
        {items.length === 0 && !creando && (
          <p className="text-center text-gray-400 text-sm py-6">Sin items todavía</p>
        )}
        {items.map((item: MenuItem) => (
          <div key={item.id}>
            {editando?.id === item.id ? (
              <ItemForm restaurantId={restaurantId} categoria={cat.nombre}
                initial={item} onDone={() => setEditando(null)} />
            ) : (
              <div className={`flex items-start gap-3 px-3 py-3 rounded-xl border ${item.activo ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-40'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{item.nombre}</p>
                  {item.descripcion && <p className="text-xs text-gray-400 mt-0.5">{item.descripcion}</p>}
                </div>
                <span className="text-sm font-bold text-cyan-600 shrink-0">{formatEur(item.precio)}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditando(item)} className="text-xs text-cyan-500 hover:text-cyan-700">Editar</button>
                  <button onClick={() => toggle.mutate(item.id)}
                    className={`text-xs font-medium ${item.activo ? 'text-gray-400 hover:text-gray-600' : 'text-green-500 hover:text-green-700'}`}>
                    {item.activo ? 'Ocultar' : 'Activar'}
                  </button>
                  <button onClick={() => { if (confirm(`¿Eliminar "${item.nombre}"?`)) eliminar.mutate(item.id) }}
                    className="text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tarjeta de categoría ──────────────────────────────────────────────────────
function CategoriaCard({
  cat,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  cat: MenuCategoria
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
        selected ? 'border-cyan-400 bg-cyan-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      {cat.icono ? (
        <span className="text-xl shrink-0">{cat.icono}</span>
      ) : (
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <span className="text-gray-400 text-xs font-bold">{cat.nombre.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">{cat.nombre}</p>
        <p className="text-xs text-gray-400">{cat.itemCount} item{cat.itemCount !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={onEdit}
          className="text-xs text-gray-400 hover:text-cyan-600 px-2 py-1 rounded-lg hover:bg-gray-100">
          Editar
        </button>
        <button onClick={onDelete}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-gray-100">
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MenuPage() {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [catSeleccionada, setCatSeleccionada] = useState<MenuCategoria | null>(null)
  const [creandoCat, setCreandoCat]     = useState<string | null>(null) // grupo por defecto
  const [editandoCat, setEditandoCat]   = useState<MenuCategoria | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  const { data: categorias = [] } = useQuery<MenuCategoria[]>({
    queryKey: ['menu-cats', restaurantId],
    queryFn: () => api.menuCategorias.list(restaurantId!),
    enabled: !!restaurantId,
  })

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const eliminarCat = useMutation({
    mutationFn: (id: number) => api.menuCategorias.delete(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['menu-cats', restaurantId] })
      if (catSeleccionada?.id === id) setCatSeleccionada(null)
    },
    onError: (err: Error) => showToast(err.message),
  })

  // Agrupar categorías por grupo
  const gruposUnicos = ['', ...new Set(categorias.filter(c => c.grupo).map(c => c.grupo))]
  const grupos = gruposUnicos.map(g => ({
    nombre: g,
    cats: categorias.filter(c => (g === '' ? !c.grupo : c.grupo === g)),
  })).filter(g => g.cats.length > 0 || g.nombre === '')

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* Selector restaurante */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3">Restaurante</h2>
          <div className="flex flex-wrap gap-2">
            {restaurantes?.map(r => (
              <button key={r.id}
                onClick={() => { setRestaurantId(r.id); setCatSeleccionada(null); setCreandoCat(null); setEditandoCat(null) }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  restaurantId === r.id
                    ? 'bg-cyan-500 border-cyan-500 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {r.nombre}
              </button>
            ))}
          </div>
        </div>

        {restaurantId && (
          <>
            {/* Panel detalle categoría seleccionada */}
            {catSeleccionada && (
              <CategoriaPanel
                restaurantId={restaurantId}
                cat={catSeleccionada}
                onClose={() => setCatSeleccionada(null)}
              />
            )}

            {/* Formulario crear/editar categoría */}
            {(creandoCat !== null || editandoCat) && (
              <CategoriaForm
                restaurantId={restaurantId}
                grupoDefault={creandoCat ?? undefined}
                initial={editandoCat ?? undefined}
                onDone={() => { setCreandoCat(null); setEditandoCat(null) }}
              />
            )}

            {/* Grupos de categorías */}
            <div className="space-y-4">
              {grupos.map(({ nombre: grupoNombre, cats }) => (
                <div key={grupoNombre || '__sin_grupo'} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Cabecera del grupo */}
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h2 className="font-bold text-gray-700">
                      {grupoNombre || 'Sin sección'}
                    </h2>
                    <button
                      onClick={() => { setCreandoCat(grupoNombre); setCatSeleccionada(null); setEditandoCat(null) }}
                      className="text-xs text-cyan-600 hover:text-cyan-700 font-semibold"
                    >
                      + Categoría
                    </button>
                  </div>

                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cats.map(cat => (
                      <CategoriaCard
                        key={cat.id}
                        cat={cat}
                        selected={catSeleccionada?.id === cat.id}
                        onSelect={() => { setCatSeleccionada(cat); setCreandoCat(null); setEditandoCat(null) }}
                        onEdit={() => { setEditandoCat(cat); setCatSeleccionada(null); setCreandoCat(null) }}
                        onDelete={() => { if (confirm(`¿Eliminar "${cat.nombre}"?`)) eliminarCat.mutate(cat.id) }}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Botón para crear nueva sección */}
              <button
                onClick={() => { setCreandoCat(''); setCatSeleccionada(null); setEditandoCat(null) }}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-cyan-300 hover:text-cyan-500 text-sm font-semibold transition-colors"
              >
                + Nueva sección / categoría
              </button>

              {categorias.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">
                  Sin categorías todavía. Crea la primera para empezar.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg bg-red-600 text-white text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </>
  )
}
