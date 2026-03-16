import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Producto } from '../api'
import { useScanner } from '../hooks/useScanner'

const UNIDADES: Producto['unidad'][] = ['ud', 'kg', 'l', 'g']

export default function ProductosPage() {
  const qc = useQueryClient()
  const [barcode, setBarcode] = useState('')
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState<Producto['unidad']>('ud')
  const [editando, setEditando] = useState<Producto | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const nombreRef = useRef<HTMLInputElement>(null)

  const { data: productos } = useQuery({
    queryKey: ['productos'],
    queryFn: api.productos.list,
  })

  const mostrarFeedback = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 2500)
  }

  const guardar = useMutation({
    mutationFn: () => api.productos.create({ barcode, nombre, unidad }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      setBarcode(''); setNombre(''); setUnidad('ud')
      mostrarFeedback('Producto guardado', true)
    },
    onError: () => mostrarFeedback('Error al guardar', false),
  })

  const actualizar = useMutation({
    mutationFn: () => api.productos.update(editando!.barcode, { nombre: editando!.nombre, unidad: editando!.unidad }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      setEditando(null)
      mostrarFeedback('Producto actualizado', true)
    },
    onError: () => mostrarFeedback('Error al actualizar', false),
  })

  const eliminar = useMutation({
    mutationFn: (bc: string) => api.productos.delete(bc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      mostrarFeedback('Producto eliminado', true)
    },
  })

  // El escáner rellena el barcode y salta al campo nombre
  useScanner({
    onScan: async (scanned) => {
      setBarcode(scanned)
      // Intentar prellenar desde la DB o Open Food Facts
      try {
        const res = await api.productos.lookup(scanned)
        if (res.encontrado) {
          setNombre(res.nombre)
        }
      } catch { /* noop */ }
      setTimeout(() => nombreRef.current?.focus(), 50)
    },
    enabled: !editando,
  })

  const filtrados = productos?.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.barcode.includes(busqueda)
  ) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-indigo-600 text-sm hover:underline">← Admin</Link>
          <h1 className="text-xl font-bold text-gray-900">Catálogo de productos</h1>
        </div>
        <span className="text-sm text-gray-400">{productos?.length ?? 0} productos</span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Formulario nuevo producto */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Añadir producto</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Código de barras</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Escanea o escribe el código"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del producto</label>
              <input
                ref={nombreRef}
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Aceite de oliva virgen extra"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Unidad por defecto</label>
              <div className="flex gap-2">
                {UNIDADES.map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnidad(u)}
                    className={`px-5 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                      unidad === u ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => guardar.mutate()}
              disabled={!barcode.trim() || !nombre.trim() || guardar.isPending}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40"
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar producto'}
            </button>
          </div>
        </div>

        {/* Lista de productos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código…"
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {filtrados.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">
              {busqueda ? 'Sin resultados' : 'No hay productos en el catálogo'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtrados.map((p) => (
                <li key={p.barcode} className="px-5 py-4">
                  {editando?.barcode === p.barcode ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editando.nombre}
                        onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2 items-center">
                        {UNIDADES.map((u) => (
                          <button
                            key={u}
                            onClick={() => setEditando({ ...editando, unidad: u })}
                            className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
                              editando.unidad === u ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600'
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => setEditando(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
                          <button
                            onClick={() => actualizar.mutate()}
                            className="text-sm text-indigo-600 font-semibold hover:text-indigo-800"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-gray-400">{p.barcode} · {p.unidad}</p>
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button
                          onClick={() => setEditando(p)}
                          className="text-sm text-indigo-500 hover:text-indigo-700"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) eliminar.mutate(p.barcode) }}
                          className="text-sm text-red-400 hover:text-red-600"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Toast feedback */}
      {feedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${feedback.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}
