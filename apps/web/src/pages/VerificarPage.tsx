import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

export default function VerificarPage() {
  const { id } = useParams<{ id: string }>()
  const retiroId = Number(id)
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [showInput, setShowInput] = useState(false)

  const { data: retiro, isLoading, error } = useQuery({
    queryKey: ['retiro', retiroId],
    queryFn: () => api.retiros.get(retiroId),
    enabled: !isNaN(retiroId),
  })

  const confirmar = useMutation({
    mutationFn: () => api.retiros.confirmar(retiroId, nombre.trim() || 'Encargado'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retiro', retiroId] })
      setShowInput(false)
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !retiro) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-300 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Retiro no encontrado</h1>
        <p className="text-gray-400 text-sm">El código QR no corresponde a ningún retiro.</p>
      </div>
    )
  }

  const fecha = new Date(retiro.createdAt).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const yaConfirmado = !!retiro.confirmadoAt

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-6">
      {/* Header */}
      <div className="w-full max-w-md mb-8 flex justify-center">
        <img src="/sensi.png" alt="Sensi" className="h-8 object-contain" />
      </div>

      {/* Card principal */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Retiro #{retiro.id}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{fecha}</p>
          </div>
          {yaConfirmado ? (
            <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-100">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Confirmado
            </span>
          ) : (
            <span className="bg-amber-50 text-amber-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-100">
              Pendiente
            </span>
          )}
        </div>

        <div className="flex gap-4 mb-5 text-sm">
          <div className="flex-1 bg-gray-50 rounded-2xl p-3">
            <p className="text-gray-400 text-xs mb-0.5">Empleado</p>
            <p className="font-semibold text-gray-800">{retiro.empleado.nombre}</p>
          </div>
          <div className="flex-1 bg-gray-50 rounded-2xl p-3">
            <p className="text-gray-400 text-xs mb-0.5">Restaurante</p>
            <p className="font-semibold text-gray-800">{retiro.restaurant.nombre}</p>
          </div>
        </div>

        {/* Items */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Productos ({retiro.items.length})
          </p>
          <div className="space-y-2">
            {retiro.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <span className="text-gray-800 text-sm">{item.nombre}</span>
                <span className="text-gray-600 text-sm font-bold tabular-nums">
                  {item.cantidad} {item.unidad}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmación */}
      {yaConfirmado ? (
        <div className="w-full max-w-md bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
          <p className="text-emerald-700 font-semibold text-sm">
            Recepción confirmada por <span className="font-bold">{retiro.confirmadoPor}</span>
          </p>
          <p className="text-emerald-500 text-xs mt-1">
            {new Date(retiro.confirmadoAt!).toLocaleString('es-ES', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md">
          {!showInput ? (
            <button
              onClick={() => setShowInput(true)}
              className="w-full bg-cyan-500 text-white text-lg font-bold py-4 rounded-2xl hover:bg-cyan-400 transition-colors shadow-sm"
            >
              Confirmar recepción
            </button>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">¿Quién confirma la recepción?</p>
              <input
                type="text"
                placeholder="Tu nombre (opcional)"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-sm mb-3 focus:outline-none focus:border-cyan-400"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowInput(false)}
                  className="flex-1 border-2 border-gray-200 text-gray-500 py-3 rounded-xl text-sm font-medium hover:border-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmar.mutate()}
                  disabled={confirmar.isPending}
                  className="flex-1 bg-cyan-500 text-white py-3 rounded-xl text-sm font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50"
                >
                  {confirmar.isPending ? 'Confirmando...' : 'Confirmar'}
                </button>
              </div>
              {confirmar.isError && (
                <p className="text-red-500 text-xs text-center mt-2">
                  Error al confirmar. Inténtalo de nuevo.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
