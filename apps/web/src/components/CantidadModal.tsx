import { useState } from 'react'
import { RetiroItem } from '../api'

interface Props {
  barcode: string
  nombreSugerido: string
  onConfirm: (item: RetiroItem) => void
  onCancel: () => void
}

const UNIDADES: RetiroItem['unidad'][] = ['ud', 'kg', 'l', 'g']

export default function CantidadModal({ barcode, nombreSugerido, onConfirm, onCancel }: Props) {
  const [nombre, setNombre] = useState(nombreSugerido)
  const [cantidad, setCantidad] = useState('1')
  const [unidad, setUnidad] = useState<RetiroItem['unidad']>('ud')

  const handleConfirm = () => {
    const parsed = parseFloat(cantidad)
    if (!nombre.trim() || isNaN(parsed) || parsed <= 0) return
    onConfirm({ barcode, nombre: nombre.trim(), cantidad: parsed, unidad })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Agregar producto</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-indigo-500 focus:outline-none"
              placeholder="Nombre del producto"
              autoFocus={!nombreSugerido}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Cantidad</label>
            <input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              min="0.01"
              step="0.1"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-center focus:border-indigo-500 focus:outline-none"
              autoFocus={!!nombreSugerido}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Unidad</label>
            <div className="grid grid-cols-4 gap-2">
              {UNIDADES.map((u) => (
                <button
                  key={u}
                  onClick={() => setUnidad(u)}
                  className={`py-3 rounded-xl text-lg font-semibold border-2 transition-all ${
                    unidad === u
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-400'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onCancel}
            className="flex-1 py-4 rounded-xl border-2 border-gray-200 text-gray-600 text-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!nombre.trim() || !cantidad || parseFloat(cantidad) <= 0}
            className="flex-1 py-4 rounded-xl bg-indigo-600 text-white text-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}
