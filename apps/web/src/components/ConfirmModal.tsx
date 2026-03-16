import { useEffect, useRef } from 'react'
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
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.style.opacity = '0'
    panel.style.transform = 'translateY(24px)'
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 220ms ease, transform 220ms ease'
      panel.style.opacity = '1'
      panel.style.transform = 'translateY(0)'
    })
  }, [])

  const total = items.reduce((acc, i) => acc + i.cantidad, 0)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div ref={panelRef} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-gray-950 px-8 py-6">
          <h2 className="text-xl font-bold text-white mb-0.5">Confirmar retiro</h2>
          <p className="text-gray-400 text-sm">{empleado} · {restaurante}</p>
        </div>

        {/* Items */}
        <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto px-8">
          {items.map((item, i) => (
            <li key={i} className="flex justify-between py-3">
              <span className="text-gray-800">{item.nombre}</span>
              <span className="font-semibold text-cyan-600 tabular-nums">
                {item.cantidad} {item.unidad}
              </span>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-4">
            {items.length} producto{items.length !== 1 ? 's' : ''} · {total % 1 === 0 ? total : total.toFixed(1)} unidades totales
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 py-3.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Volver
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 py-3.5 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Guardando…
                </>
              ) : 'Confirmar'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
