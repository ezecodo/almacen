import { RetiroItem } from '../api'

interface Props {
  restaurante: string
  empleado: string
  items: RetiroItem[]
  isLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  restaurante,
  empleado,
  items,
  isLoading,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirmar retiro</h2>
        <p className="text-gray-500 mb-6">
          {empleado} · {restaurante}
        </p>

        <ul className="divide-y divide-gray-100 mb-6 max-h-64 overflow-y-auto">
          {items.map((item, i) => (
            <li key={i} className="flex justify-between py-3">
              <span className="text-gray-800">{item.nombre}</span>
              <span className="font-semibold text-indigo-700">
                {item.cantidad} {item.unidad}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-sm text-gray-400 mb-6">
          {items.length} producto{items.length !== 1 ? 's' : ''}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-4 rounded-xl border-2 border-gray-200 text-gray-600 text-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Volver
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-4 rounded-xl bg-green-600 text-white text-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-40"
          >
            {isLoading ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
