import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  api,
  Restaurante,
  InventarioCategoria,
  InventarioProducto,
  InventarioConteoDetalleItem,
  InventarioCostesRow,
  InventarioProduccion,
} from '../api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const UNIDADES = ['ud', 'botella', 'caja', 'l', 'kg'] as const

function stepForUnidad(unidad: string) {
  return unidad === 'l' || unidad === 'kg' ? 0.5 : 1
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Badge for global products
function GlobalBadge() {
  return (
    <span className="inline-block text-xs bg-blue-900 text-blue-200 px-1.5 py-0.5 rounded font-medium">
      Global
    </span>
  )
}

// ─── Catálogo: Product row ────────────────────────────────────────────────────

function ProductoRow({
  producto,
  onEdit,
  onDelete,
}: {
  producto: InventarioProducto
  onEdit: (p: InventarioProducto) => void
  onDelete: (p: InventarioProducto) => void
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-800 group">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white">{producto.nombre}</span>
        {producto.restaurantId === null && (
          <span className="ml-2">
            <GlobalBadge />
          </span>
        )}
      </div>
      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-mono">
        {producto.unidad}
      </span>
      {producto.precioVenta != null && (
        <span className="text-xs text-cyan-400 font-medium">
          PV {producto.precioVenta.toFixed(2)}€
        </span>
      )}
      {producto.precioCoste != null && (
        <span className="text-xs text-emerald-400 font-medium">
          PC {producto.precioCoste.toFixed(2)}€
        </span>
      )}
      {producto.stockMinimo > 0 && (
        <span className="text-xs text-gray-400">
          min: {producto.stockMinimo}
        </span>
      )}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(producto)}
          className="text-xs text-gray-400 hover:text-cyan-400 px-2 py-1 rounded"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(producto)}
          className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded"
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Catálogo: Inline product form ───────────────────────────────────────────

function ProductoForm({
  categoriaId,
  restaurantId,
  initial,
  restaurantes,
  onSave,
  onCancel,
}: {
  categoriaId: number
  restaurantId: number | null
  initial?: InventarioProducto
  restaurantes?: Restaurante[]
  onSave: (data: {
    nombre: string
    unidad: string
    stockMinimo: number
    precioVenta: number | null
    precioCoste: number | null
    categoriaId: number
    restaurantId?: number
  }) => void
  onCancel: () => void
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [unidad, setUnidad] = useState<string>(initial?.unidad ?? 'ud')
  const [stockMinimo, setStockMinimo] = useState(String(initial?.stockMinimo ?? 0))
  const [pVenta, setPVenta] = useState(initial?.precioVenta != null ? String(initial.precioVenta) : '')
  const [pCoste, setPCoste] = useState(initial?.precioCoste != null ? String(initial.precioCoste) : '')
  // Selector de destino: solo al crear desde contexto global (null = global, number = restaurante específico)
  const [destino, setDestino] = useState<number | 'global'>('global')

  // ridEfectivo: si hay selector activo (contexto global + creando), usa destino; si no, el prop
  const ridEfectivo = restaurantes && !initial
    ? (destino === 'global' ? null : destino)
    : restaurantId

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    onSave({
      nombre: nombre.trim(),
      unidad,
      stockMinimo: parseFloat(stockMinimo) || 0,
      precioVenta: pVenta.trim() !== '' ? parseFloat(pVenta) : null,
      precioCoste: pCoste.trim() !== '' ? parseFloat(pCoste) : null,
      categoriaId,
      ...(ridEfectivo !== null ? { restaurantId: ridEfectivo } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end py-2 px-3 bg-gray-800 rounded-lg">
      {/* Selector restaurante destino — solo al crear desde contexto global */}
      {restaurantes && !initial && (
        <div className="w-full">
          <label className="block text-xs text-gray-400 mb-1">Asignar a</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setDestino('global')}
              className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all ${destino === 'global' ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'}`}
            >
              Global
            </button>
            {restaurantes.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDestino(r.id)}
                className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all ${destino === r.id ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'}`}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs text-gray-400 mb-1">Nombre</label>
        <input
          autoFocus
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre del producto"
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-cyan-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Unidad</label>
        <select
          value={unidad}
          onChange={e => setUnidad(e.target.value)}
          className="bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-cyan-500"
        >
          {UNIDADES.map(u => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="w-24">
        <label className="block text-xs text-gray-400 mb-1">Stock mín.</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={stockMinimo}
          onChange={e => setStockMinimo(e.target.value)}
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-cyan-500"
        />
      </div>
      <div className="w-28">
        <label className="block text-xs text-cyan-400 mb-1">P. Venta <span className="text-gray-600">(€)</span></label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={pVenta}
          onChange={e => setPVenta(e.target.value)}
          placeholder="—"
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-cyan-500"
        />
      </div>
      <div className="w-28">
        <label className="block text-xs text-emerald-400 mb-1">P. Coste <span className="text-gray-600">(€)</span></label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={pCoste}
          onChange={e => setPCoste(e.target.value)}
          placeholder="—"
          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm px-3 py-1.5 rounded font-medium"
        >
          {initial ? 'Guardar' : 'Añadir'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-3 py-1.5 rounded"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── Catálogo: Category block ─────────────────────────────────────────────────

function CategoriaBlock({
  categoria,
  selectedRestaurantId,
  onCategoriaUpdated,
  onCategoriaDeleted,
  restaurantes,
}: {
  categoria: InventarioCategoria
  selectedRestaurantId: number | null
  onCategoriaUpdated: () => void
  onCategoriaDeleted: () => void
  restaurantes?: Restaurante[]
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(categoria.nombre)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProducto, setEditingProducto] = useState<InventarioProducto | null>(null)

  const updateCategoria = useMutation({
    mutationFn: (nombre: string) => api.inventario.updateCategoria(categoria.id, { nombre }),
    onSuccess: () => {
      setEditingName(false)
      onCategoriaUpdated()
    },
  })

  const deleteCategoria = useMutation({
    mutationFn: () => api.inventario.deleteCategoria(categoria.id),
    onSuccess: () => onCategoriaDeleted(),
  })

  const createProducto = useMutation({
    mutationFn: (data: Parameters<typeof api.inventario.createProducto>[0]) =>
      api.inventario.createProducto(data),
    onSuccess: () => {
      setShowAddProduct(false)
      onCategoriaUpdated()
    },
  })

  const updateProducto = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.inventario.updateProducto>[1] }) =>
      api.inventario.updateProducto(id, data),
    onSuccess: () => {
      setEditingProducto(null)
      onCategoriaUpdated()
    },
  })

  const deleteProducto = useMutation({
    mutationFn: (id: number) => api.inventario.deleteProducto(id),
    onSuccess: () => onCategoriaUpdated(),
  })

  const isGlobal = categoria.restaurantId === null

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Category header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700">
        {editingName ? (
          <form
            className="flex gap-2 flex-1"
            onSubmit={e => {
              e.preventDefault()
              if (nameValue.trim()) updateCategoria.mutate(nameValue.trim())
            }}
          >
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-2 py-1 rounded"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNameValue(categoria.nombre)
                setEditingName(false)
              }}
              className="text-gray-400 hover:text-white text-xs px-2 py-1"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <>
            <span className="font-semibold text-white text-sm flex-1">{categoria.nombre}</span>
            {isGlobal && <GlobalBadge />}
            {/* Toggle producción: null → sala → cocina → null */}
            {categoria.personalProduccion === null ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">⚗️</span>
                <button onClick={() => api.inventario.updateCategoria(categoria.id, { personalProduccion: 'sala' }).then(onCategoriaUpdated)}
                  className="text-xs border border-gray-600 text-gray-500 hover:border-cyan-500 hover:text-cyan-400 px-2 py-0.5 rounded transition-all">
                  Sala
                </button>
                <button onClick={() => api.inventario.updateCategoria(categoria.id, { personalProduccion: 'cocina' }).then(onCategoriaUpdated)}
                  className="text-xs border border-gray-600 text-gray-500 hover:border-orange-500 hover:text-orange-400 px-2 py-0.5 rounded transition-all">
                  Cocina
                </button>
              </div>
            ) : (
              <button
                onClick={() => api.inventario.updateCategoria(categoria.id, { personalProduccion: null }).then(onCategoriaUpdated)}
                title="Quitar categoría de producción"
                className={`text-xs font-semibold px-2 py-1 rounded border transition-all ${
                  categoria.personalProduccion === 'sala'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                    : 'bg-orange-500/20 border-orange-500 text-orange-400'
                }`}
              >
                ⚗️ {categoria.personalProduccion === 'sala' ? 'Sala' : 'Cocina'}
              </button>
            )}
            <span className="text-xs text-gray-500">
              {categoria.productos.length === 0
                ? '(vacía)'
                : `${categoria.productos.length} producto${categoria.productos.length !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={() => setEditingName(true)}
              className="text-xs text-gray-400 hover:text-cyan-400 px-2 py-1 rounded"
            >
              Renombrar
            </button>
            <button
              onClick={() => {
                if (categoria.productos.length > 0) {
                  alert('No se puede eliminar: la categoría tiene productos')
                  return
                }
                if (confirm(`¿Eliminar categoría "${categoria.nombre}"?`)) {
                  deleteCategoria.mutate()
                }
              }}
              className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded"
            >
              Eliminar
            </button>
          </>
        )}
      </div>

      {/* Products list */}
      <div className="p-2">
        {categoria.productos.length === 0 && !showAddProduct && (
          <p className="text-xs text-gray-500 px-3 py-2 italic">(sin productos)</p>
        )}
        {categoria.productos.map(p =>
          editingProducto?.id === p.id ? (
            <div key={p.id} className="mb-1">
              <ProductoForm
                categoriaId={categoria.id}
                restaurantId={selectedRestaurantId}
                initial={editingProducto}
                onSave={data => updateProducto.mutate({ id: p.id, data })}
                onCancel={() => setEditingProducto(null)}
              />
              {/* no restaurantes prop on edit — scope is fixed */}
            </div>
          ) : (
            <ProductoRow
              key={p.id}
              producto={p}
              onEdit={setEditingProducto}
              onDelete={prod => {
                if (confirm(`¿Eliminar "${prod.nombre}"?`)) {
                  deleteProducto.mutate(prod.id)
                }
              }}
            />
          )
        )}

        {showAddProduct ? (
          <div className="mt-1">
            <ProductoForm
              categoriaId={categoria.id}
              restaurantId={selectedRestaurantId}
              restaurantes={selectedRestaurantId === null ? restaurantes : undefined}
              onSave={data => createProducto.mutate(data)}
              onCancel={() => setShowAddProduct(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowAddProduct(true)}
            className="mt-1 w-full text-left text-xs text-gray-500 hover:text-cyan-400 px-3 py-2 rounded hover:bg-gray-800 transition-colors"
          >
            + Añadir producto
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Catálogo ────────────────────────────────────────────────────────────

function CatalogoTab({ restaurantes }: { restaurantes: Restaurante[] }) {
  const qc = useQueryClient()
  // null = Global, number = specific restaurant
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const { data: categorias, isLoading } = useQuery({
    queryKey: ['inv-categorias', selectedId],
    queryFn: () => api.inventario.getCategorias(selectedId ?? undefined),
  })

  const createCategoria = useMutation({
    mutationFn: (nombre: string) =>
      api.inventario.createCategoria({
        nombre,
        ...(selectedId !== null ? { restaurantId: selectedId } : {}),
      }),
    onSuccess: () => {
      setShowNewCat(false)
      setNewCatName('')
      qc.invalidateQueries({ queryKey: ['inv-categorias', selectedId] })
    },
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['inv-categorias', selectedId] })
  }

  // When "Global" is selected, show only global categories
  // When restaurant is selected, show global + restaurant-specific categories
  const filteredCategorias = useMemo(() => {
    if (!categorias) return []
    if (selectedId === null) {
      return categorias.filter(c => c.restaurantId === null)
    }
    return categorias
  }, [categorias, selectedId])

  return (
    <div className="space-y-6">
      {/* Restaurant selector */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedId(null)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedId === null
              ? 'bg-cyan-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          Global
        </button>
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedId === r.id
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {/* Header + new category button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          {selectedId === null
            ? 'Categorías globales'
            : `Catálogo — ${restaurantes.find(r => r.id === selectedId)?.nombre}`}
        </h2>
        {!showNewCat && (
          <button
            onClick={() => setShowNewCat(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm px-4 py-2 rounded-lg font-medium"
          >
            + Nueva categoría
          </button>
        )}
      </div>

      {/* New category form */}
      {showNewCat && (
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault()
            if (newCatName.trim()) createCategoria.mutate(newCatName.trim())
          }}
        >
          <input
            autoFocus
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="Nombre de la categoría"
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={createCategoria.isPending}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-medium"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewCat(false)
              setNewCatName('')
            }}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg"
          >
            Cancelar
          </button>
        </form>
      )}

      {/* Loading */}
      {isLoading && <p className="text-gray-400 text-sm">Cargando catálogo...</p>}

      {/* Categories */}
      {filteredCategorias.length === 0 && !isLoading && (
        <p className="text-gray-400 text-sm italic">
          No hay categorías.{' '}
          {!showNewCat && (
            <button
              onClick={() => setShowNewCat(true)}
              className="text-cyan-400 underline"
            >
              Crear una
            </button>
          )}
        </p>
      )}

      <div className="space-y-4">
        {filteredCategorias.map(cat => (
          <CategoriaBlock
            key={cat.id}
            categoria={cat}
            selectedRestaurantId={selectedId}
            onCategoriaUpdated={invalidate}
            onCategoriaDeleted={invalidate}
            restaurantes={restaurantes}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Conteos — List view ─────────────────────────────────────────────────

function ConteosList({
  restaurantId,
  onNuevo,
  onVer,
}: {
  restaurantId: number
  onNuevo: () => void
  onVer: (id: number) => void
}) {
  const qc = useQueryClient()
  const { data: conteos, isLoading } = useQuery({
    queryKey: ['inv-conteos', restaurantId],
    queryFn: () => api.inventario.getConteos(restaurantId),
  })

  const deleteConteo = useMutation({
    mutationFn: (id: number) => api.inventario.deleteConteo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-conteos', restaurantId] }),
  })

  if (isLoading) return <p className="text-gray-400 text-sm">Cargando conteos...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Historial de conteos</h2>
        <button
          onClick={onNuevo}
          className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm px-4 py-2 rounded-lg font-medium"
        >
          + Nuevo conteo
        </button>
      </div>

      {(!conteos || conteos.length === 0) && (
        <p className="text-gray-400 text-sm italic">
          No hay conteos todavía.{' '}
          <button onClick={onNuevo} className="text-cyan-400 underline">
            Crear el primero
          </button>
        </p>
      )}

      <div className="space-y-2">
        {conteos?.map(c => (
          <div
            key={c.id}
            className="flex items-center gap-4 bg-gray-800 rounded-lg px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{fmtFecha(c.fecha)}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {c.creadoPor ? `Por ${c.creadoPor}` : 'Sin nombre'} ·{' '}
                {c._count.items} producto{c._count.items !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => onVer(c.id)}
              className="text-cyan-400 hover:text-cyan-300 text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600"
            >
              Ver
            </button>
            <button
              onClick={() => {
                if (confirm('¿Eliminar este conteo?')) deleteConteo.mutate(c.id)
              }}
              className="text-gray-400 hover:text-red-400 text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Conteos — New conteo form ──────────────────────────────────────────

function NuevoConteoForm({
  restaurantId,
  onSaved,
  onCancel,
}: {
  restaurantId: number
  onSaved: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const [creadoPor, setCreadoPor] = useState('')

  // quantities: productoId -> cantidad
  const [quantities, setQuantities] = useState<Record<number, number>>({})

  const { data: categorias, isLoading } = useQuery({
    queryKey: ['inv-categorias', restaurantId],
    queryFn: () => api.inventario.getCategorias(restaurantId),
  })

  const createConteo = useMutation({
    mutationFn: (body: Parameters<typeof api.inventario.createConteo>[0]) =>
      api.inventario.createConteo(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-conteos', restaurantId] })
      onSaved()
    },
  })

  const allProductos = useMemo(() => {
    if (!categorias) return []
    return categorias.flatMap(c => c.productos)
  }, [categorias])

  function handleSubmit() {
    const items = allProductos
      .filter(p => quantities[p.id] !== undefined)
      .map(p => ({ productoId: p.id, cantidad: quantities[p.id] ?? 0 }))

    if (items.length === 0) {
      alert('Añade cantidades a al menos un producto')
      return
    }

    createConteo.mutate({
      restaurantId,
      creadoPor: creadoPor.trim() || undefined,
      items,
    })
  }

  if (isLoading) return <p className="text-gray-400 text-sm">Cargando productos...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Volver
        </button>
        <h2 className="text-lg font-semibold text-white">Nuevo conteo</h2>
      </div>

      {/* Who is doing the count */}
      <div className="max-w-sm">
        <label className="block text-sm text-gray-300 mb-2">
          ¿Quién hace el conteo? <span className="text-gray-500">(opcional)</span>
        </label>
        <input
          value={creadoPor}
          onChange={e => setCreadoPor(e.target.value)}
          placeholder="Nombre o iniciales"
          className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 border border-gray-700 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Products grouped by category */}
      {categorias?.map(cat => (
        <div key={cat.id} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
            <span className="font-semibold text-white text-sm">{cat.nombre}</span>
            {cat.restaurantId === null && <GlobalBadge />}
          </div>
          {cat.productos.length === 0 && (
            <p className="text-xs text-gray-500 px-4 py-3 italic">(vacía)</p>
          )}
          <div className="divide-y divide-gray-800">
            {cat.productos.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{p.nombre}</span>
                </div>
                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-mono">
                  {p.unidad}
                </span>
                <input
                  type="number"
                  min={0}
                  step={stepForUnidad(p.unidad)}
                  value={quantities[p.id] ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                    setQuantities(prev => {
                      if (val === undefined) {
                        const next = { ...prev }
                        delete next[p.id]
                        return next
                      }
                      return { ...prev, [p.id]: val }
                    })
                  }}
                  placeholder="0"
                  className="w-24 bg-gray-800 text-white text-2xl font-bold text-center rounded-lg px-2 py-3 border border-gray-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-3 pb-8">
        <button
          onClick={handleSubmit}
          disabled={createConteo.isPending}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white px-6 py-3 rounded-lg font-semibold text-base"
        >
          {createConteo.isPending ? 'Guardando...' : 'Guardar conteo'}
        </button>
        <button
          onClick={onCancel}
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-3 rounded-lg"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Tab: Conteos — Detail view ───────────────────────────────────────────────

function ConteoDetalle({
  conteoId,
  restaurantId,
  onBack,
}: {
  conteoId: number
  restaurantId: number
  onBack: () => void
}) {
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['inv-conteo', conteoId],
    queryFn: () => api.inventario.getConteo(conteoId),
  })

  const deleteConteo = useMutation({
    mutationFn: () => api.inventario.deleteConteo(conteoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-conteos', restaurantId] })
      onBack()
    },
  })

  if (isLoading) return <p className="text-gray-400 text-sm">Cargando...</p>
  if (!data) return <p className="text-red-400 text-sm">No encontrado</p>

  const { conteo, items } = data

  // Stats
  const totalProductos = items.length
  const bajoMinimo = items.filter(
    i => i.stockMinimo > 0 && i.cantidad < i.stockMinimo
  ).length

  // Group items by category
  const byCategory: Record<string, InventarioConteoDetalleItem[]> = {}
  for (const item of items) {
    if (!byCategory[item.categoriaNombre]) byCategory[item.categoriaNombre] = []
    byCategory[item.categoriaNombre].push(item)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm mt-0.5"
        >
          ← Volver
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white">{fmtFecha(conteo.fecha)}</h2>
          {conteo.creadoPor && (
            <p className="text-gray-400 text-sm">Por {conteo.creadoPor}</p>
          )}
        </div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-400 hover:text-red-400 text-sm px-3 py-1.5 rounded bg-gray-800"
          >
            Eliminar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => deleteConteo.mutate()}
              className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1.5 rounded"
            >
              Confirmar eliminación
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded bg-gray-800"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-white">{totalProductos}</p>
          <p className="text-xs text-gray-400 mt-1">productos contados</p>
        </div>
        {bajoMinimo > 0 && (
          <div className="bg-red-900 border border-red-700 rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-red-300">{bajoMinimo}</p>
            <p className="text-xs text-red-400 mt-1">bajo mínimo</p>
          </div>
        )}
      </div>

      {/* Items table by category */}
      {Object.entries(byCategory).map(([catNombre, catItems]) => (
        <div key={catNombre} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
            <span className="font-semibold text-white text-sm">{catNombre}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-800">
                  <th className="text-left px-4 py-2 font-medium">Producto</th>
                  <th className="text-left px-4 py-2 font-medium">Unidad</th>
                  <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-2 font-medium">Anterior</th>
                  <th className="text-right px-4 py-2 font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {catItems.map(item => {
                  const isBajoMinimo = item.stockMinimo > 0 && item.cantidad < item.stockMinimo
                  return (
                    <tr
                      key={item.productoId}
                      className={isBajoMinimo ? 'bg-red-950' : 'hover:bg-gray-800'}
                    >
                      <td className="px-4 py-2.5 text-white">
                        {item.nombre}
                        {isBajoMinimo && (
                          <span className="ml-2 text-xs text-red-400">
                            (min: {item.stockMinimo})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                          {item.unidad}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${isBajoMinimo ? 'text-red-300' : 'text-white'}`}>
                        {item.cantidad}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-400">
                        {item.anterior !== null ? item.anterior : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {item.diferencia === null ? (
                          <span className="text-gray-500">—</span>
                        ) : item.diferencia >= 0 ? (
                          <span className="text-green-400">+{item.diferencia}</span>
                        ) : (
                          <span className="text-red-400">{item.diferencia}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Conteos (main) ──────────────────────────────────────────────────────

type ConteosView =
  | { type: 'list' }
  | { type: 'nuevo' }
  | { type: 'detalle'; id: number }

function ConteosTab({ restaurantes }: { restaurantes: Restaurante[] }) {
  const [selectedId, setSelectedId] = useState<number>(restaurantes[0]?.id ?? 0)
  const [view, setView] = useState<ConteosView>({ type: 'list' })

  // Reset to list when restaurant changes
  function handleRestaurantChange(id: number) {
    setSelectedId(id)
    setView({ type: 'list' })
  }

  return (
    <div className="space-y-6">
      {/* Restaurant selector */}
      <div className="flex flex-wrap gap-2">
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => handleRestaurantChange(r.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedId === r.id
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {selectedId === 0 ? (
        <p className="text-gray-400 text-sm">Selecciona un restaurante.</p>
      ) : view.type === 'list' ? (
        <ConteosList
          restaurantId={selectedId}
          onNuevo={() => setView({ type: 'nuevo' })}
          onVer={id => setView({ type: 'detalle', id })}
        />
      ) : view.type === 'nuevo' ? (
        <NuevoConteoForm
          restaurantId={selectedId}
          onSaved={() => setView({ type: 'list' })}
          onCancel={() => setView({ type: 'list' })}
        />
      ) : (
        <ConteoDetalle
          conteoId={view.id}
          restaurantId={selectedId}
          onBack={() => setView({ type: 'list' })}
        />
      )}
    </div>
  )
}

// ─── Tab: Costes ──────────────────────────────────────────────────────────────

function CostesTab({ restaurantes }: { restaurantes: Restaurante[] }) {
  const [restaurantId, setRestaurantId] = useState<number>(restaurantes[0]?.id ?? 0)
  const [baseId, setBaseId] = useState<number | null>(null)
  const [finalId, setFinalId] = useState<number | null>(null)

  const { data: conteos } = useQuery({
    queryKey: ['inv-conteos', restaurantId],
    queryFn: () => api.inventario.getConteos(restaurantId),
    enabled: restaurantId > 0,
  })

  const { data: costes, isLoading } = useQuery({
    queryKey: ['inv-costes', baseId, finalId],
    queryFn: () => api.inventario.getCostes(baseId!, finalId!),
    enabled: baseId !== null && finalId !== null && baseId !== finalId,
  })

  // Agrupar filas por categoría
  const byCategory = useMemo(() => {
    if (!costes) return {}
    const map: Record<string, InventarioCostesRow[]> = {}
    for (const row of costes.rows) {
      if (!map[row.categoriaNombre]) map[row.categoriaNombre] = []
      map[row.categoriaNombre].push(row)
    }
    return map
  }, [costes])

  function fmtEur(n: number) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
  }

  return (
    <div className="space-y-6">
      {/* Restaurant selector */}
      <div className="flex flex-wrap gap-2">
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => { setRestaurantId(r.id); setBaseId(null); setFinalId(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              restaurantId === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {/* Conteo selectors */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Seleccionar rango de conteos</h3>
        {!conteos || conteos.length < 2 ? (
          <p className="text-gray-400 text-sm italic">Necesitas al menos 2 conteos para comparar.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Conteo base (inicio)</label>
              <select
                value={baseId ?? ''}
                onChange={e => setBaseId(Number(e.target.value) || null)}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-cyan-500"
              >
                <option value="">Seleccionar…</option>
                {conteos.map(c => (
                  <option key={c.id} value={c.id}>
                    {new Date(c.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {c.creadoPor ? ` · ${c.creadoPor}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Conteo final</label>
              <select
                value={finalId ?? ''}
                onChange={e => setFinalId(Number(e.target.value) || null)}
                className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-cyan-500"
              >
                <option value="">Seleccionar…</option>
                {conteos.map(c => (
                  <option key={c.id} value={c.id}>
                    {new Date(c.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {c.creadoPor ? ` · ${c.creadoPor}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading && <p className="text-gray-400 text-sm">Calculando costes…</p>}

      {costes && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-4">
            <div className="bg-gray-900 rounded-xl border border-gray-700 px-5 py-3 flex flex-col">
              <span className="text-xs text-gray-400">Coste total período</span>
              <span className="text-2xl font-bold text-emerald-400 mt-0.5">{fmtEur(costes.totalCoste)}</span>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-700 px-5 py-3 flex flex-col">
              <span className="text-xs text-gray-400">Productos analizados</span>
              <span className="text-2xl font-bold text-white mt-0.5">{costes.rows.length}</span>
            </div>
            {costes.sinPrecio > 0 && (
              <div className="bg-amber-950 rounded-xl border border-amber-700 px-5 py-3 flex flex-col">
                <span className="text-xs text-amber-400">Sin precio configurado</span>
                <span className="text-2xl font-bold text-amber-300 mt-0.5">{costes.sinPrecio}</span>
                <span className="text-[11px] text-amber-500 mt-0.5">Configura el precio en Catálogo</span>
              </div>
            )}
          </div>

          {/* Table by category */}
          {Object.entries(byCategory).map(([catNombre, rows]) => {
            const catTotal = rows.reduce((s, r) => s + (r.coste ?? 0), 0)
            return (
              <div key={catNombre} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
                <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">{catNombre}</span>
                  <span className="text-sm font-bold text-emerald-400">{fmtEur(catTotal)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs border-b border-gray-800">
                        <th className="text-left px-4 py-2 font-medium">Producto</th>
                        <th className="text-right px-4 py-2 font-medium">Base</th>
                        <th className="text-right px-4 py-2 font-medium">Final</th>
                        <th className="text-right px-4 py-2 font-medium">Consumido</th>
                        <th className="text-right px-4 py-2 font-medium">€/u</th>
                        <th className="text-right px-4 py-2 font-medium">Coste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {rows.map(row => (
                        <tr key={row.productoId} className={row.consumido < 0 ? 'bg-blue-950/30' : 'hover:bg-gray-800'}>
                          <td className="px-4 py-2.5 text-white">
                            {row.nombre}
                            <span className="ml-1.5 text-[10px] text-gray-500 font-mono">{row.unidad}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{row.cantBase}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{row.cantFinal}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${
                            row.consumido > 0 ? 'text-white' : row.consumido < 0 ? 'text-blue-400' : 'text-gray-500'
                          }`}>
                            {row.consumido > 0 ? row.consumido : row.consumido < 0 ? `+${Math.abs(row.consumido)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400">
                            {row.precioCoste !== null ? `${row.precioCoste.toFixed(2)}€` : (
                              <span className="text-amber-500 text-xs">sin precio</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">
                            {row.coste !== null
                              ? <span className="text-emerald-400">{fmtEur(row.coste)}</span>
                              : <span className="text-gray-600">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Grand total */}
          <div className="flex justify-end">
            <div className="bg-gray-900 border border-emerald-800 rounded-xl px-6 py-4 text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total período</p>
              <p className="text-3xl font-bold text-emerald-400">{fmtEur(costes.totalCoste)}</p>
              {costes.sinPrecio > 0 && (
                <p className="text-xs text-amber-500 mt-1">+ {costes.sinPrecio} producto{costes.sinPrecio !== 1 ? 's' : ''} sin precio (no incluidos)</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ProduccionTab ────────────────────────────────────────────────────────────

function ProduccionTab({ restaurantes }: { restaurantes: Restaurante[] }) {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState(restaurantes[0]?.id)
  const [showForm, setShowForm] = useState(false)

  const { data: categorias = [] } = useQuery({
    queryKey: ['inv-cats', restaurantId],
    queryFn: () => api.inventario.getCategorias(restaurantId),
    enabled: !!restaurantId,
  })

  const { data: producciones = [], isLoading } = useQuery({
    queryKey: ['inv-producciones', restaurantId],
    queryFn: () => api.inventario.getProducciones(restaurantId),
    enabled: !!restaurantId,
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.inventario.deleteProduccion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-producciones', restaurantId] }),
  })

  // Solo productos de categorías de producción
  const productos = useMemo(
    () => categorias.filter(c => c.personalProduccion !== null).flatMap(c => c.productos),
    [categorias]
  )

  return (
    <div className="space-y-4">
      {/* Restaurant selector */}
      <div className="bg-gray-800 rounded-xl p-4 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {restaurantes.map(r => (
            <button
              key={r.id}
              onClick={() => setRestaurantId(r.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                restaurantId === r.id ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {r.nombre}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Registrar producción
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <ProduccionForm
          restaurantId={restaurantId}
          productos={productos}
          onDone={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['inv-producciones', restaurantId] })
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-gray-400 text-sm text-center py-8">Cargando...</p>
      ) : producciones.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-1">Sin registros</p>
          <p className="text-sm">Pulsa "+ Registrar producción" para añadir el primero</p>
        </div>
      ) : (
        <div className="space-y-2">
          {producciones.map((p: InventarioProduccion) => (
            <div key={p.id} className="bg-gray-800 rounded-xl px-4 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{p.producto.nombre}</span>
                  <span className="text-cyan-400 font-bold">{p.cantidad} {p.unidad}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                  <span>{fmtFecha(p.fecha)}</span>
                  {p.creadoPor && <span>· {p.creadoPor}</span>}
                  {p.notas && <span>· {p.notas}</span>}
                </div>
              </div>
              <button
                onClick={() => { if (confirm('¿Eliminar este registro?')) eliminar.mutate(p.id) }}
                className="text-gray-600 hover:text-red-400 text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProduccionForm({
  restaurantId,
  productos,
  onDone,
  onCancel,
}: {
  restaurantId: number
  productos: InventarioProducto[]
  onDone: () => void
  onCancel: () => void
}) {
  const [productoId, setProductoId] = useState(productos[0]?.id ?? 0)
  const [cantidad, setCantidad]     = useState('')
  const [unidad, setUnidad]         = useState(productos[0]?.unidad ?? 'ud')
  const [creadoPor, setCreadoPor]   = useState('')
  const [notas, setNotas]           = useState('')
  const [fecha, setFecha]           = useState(() => new Date().toISOString().slice(0, 16))
  const [saving, setSaving]         = useState(false)

  const handleProductoChange = (id: number) => {
    setProductoId(id)
    const prod = productos.find(p => p.id === id)
    if (prod) setUnidad(prod.unidad)
  }

  const handleSubmit = async () => {
    if (!productoId || !cantidad) return
    setSaving(true)
    try {
      await api.inventario.createProduccion({
        restaurantId,
        productoId,
        cantidad: parseFloat(cantidad),
        unidad,
        creadoPor: creadoPor || undefined,
        notas: notas || undefined,
        fecha: new Date(fecha).toISOString(),
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  if (productos.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 text-center text-gray-400 text-sm">
        No hay productos en el catálogo. Añade productos primero desde la pestaña Catálogo.
      </div>
    )
  }

  return (
    <div className="bg-gray-800 border border-cyan-700 rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-white text-lg">Registrar producción de premix</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <label className="text-xs text-gray-400 font-medium">Producto</label>
          <select
            value={productoId}
            onChange={e => handleProductoChange(Number(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
          >
            {productos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Cantidad</label>
          <input
            type="number" min="0.1" step="0.5"
            value={cantidad} onChange={e => setCantidad(e.target.value)}
            placeholder="Ej: 5"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Unidad</label>
          <select
            value={unidad} onChange={e => setUnidad(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
          >
            {(['ud', 'botella', 'caja', 'l', 'kg'] as const).map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Preparado por (opcional)</label>
          <input
            value={creadoPor} onChange={e => setCreadoPor(e.target.value)}
            placeholder="Nombre"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Fecha y hora</label>
          <input
            type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <label className="text-xs text-gray-400 font-medium">Notas (opcional)</label>
          <input
            value={notas} onChange={e => setNotas(e.target.value)}
            placeholder="Ej: Botella de 5L, lote especial…"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white px-4 py-2">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!productoId || !cantidad || saving}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Guardando…' : 'Registrar'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'catalogo' | 'conteos' | 'costes' | 'produccion'

export default function InventarioPage() {
  const [tab, setTab] = useState<Tab>('catalogo')

  const { data: restaurantes, isLoading: loadingRestaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  if (loadingRestaurantes) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    )
  }

  const rests = restaurantes ?? []

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario</h1>
          <p className="text-gray-400 text-sm mt-1">
            Gestión de catálogo y conteos de stock
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800 p-1 rounded-lg w-fit">
          {(['catalogo', 'conteos', 'costes', 'produccion'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-white text-gray-900'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'catalogo' ? 'Catálogo' : t === 'conteos' ? 'Conteos' : t === 'costes' ? 'Costes' : 'Producción'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'catalogo' ? (
          <CatalogoTab restaurantes={rests} />
        ) : tab === 'conteos' ? (
          <ConteosTab restaurantes={rests} />
        ) : tab === 'costes' ? (
          <CostesTab restaurantes={rests} />
        ) : (
          <ProduccionTab restaurantes={rests} />
        )}
      </div>
    </div>
  )
}
