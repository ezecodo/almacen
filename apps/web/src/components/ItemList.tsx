import { RetiroItem } from '../api'

interface Props {
  items: RetiroItem[]
  onRemove: (index: number) => void
}

const UNIDAD_LABELS: Record<RetiroItem['unidad'], string> = {
  kg: 'kg',
  ud: 'ud',
  l: 'L',
  g: 'g',
}

export default function ItemList({ items, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-2xl mb-2">📦</p>
        <p className="text-lg">Escanea un producto para empezar</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100 w-full">
      {items.map((item, i) => (
        <li key={i} className="flex items-center justify-between py-4 px-2">
          <div className="flex-1 min-w-0 mr-4">
            <p className="font-semibold text-gray-900 truncate">{item.nombre}</p>
            <p className="text-sm text-gray-400">{item.barcode}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-cyan-600 whitespace-nowrap">
              {item.cantidad} {UNIDAD_LABELS[item.unidad]}
            </span>
            <button
              onClick={() => onRemove(i)}
              className="text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
              aria-label="Eliminar item"
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
