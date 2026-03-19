import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { api, RetiroResumen } from '../api'

type Estado = 'escaneando' | 'cargando' | 'visto' | 'error'

export default function ValidarPage() {
  const [estado, setEstado] = useState<Estado>('escaneando')
  const [retiroId, setRetiroId] = useState<number | null>(null)
  const [retiro, setRetiro] = useState<RetiroResumen | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [nombre, setNombre] = useState('')
  const [showInput, setShowInput] = useState(false)
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
      false,
    )

    scannerRef.current = scanner

    scanner.render(
      async (decodedText) => {
        // Extraer el ID del retiro de la URL escaneada
        const match = decodedText.match(/\/verificar\/(\d+)/)
        if (!match) {
          setErrorMsg('QR no válido — no corresponde a un retiro de almacén.')
          setEstado('error')
          return
        }

        const id = Number(match[1])
        setRetiroId(id)
        setEstado('cargando')
        scanner.pause(true)

        try {
          const data = await api.retiros.get(id)
          setRetiro(data)
          setEstado('visto')
        } catch {
          setErrorMsg('No se pudo cargar el retiro. Inténtalo de nuevo.')
          setEstado('error')
        }
      },
      () => {}, // errores de frame ignorados (son normales mientras no hay QR)
    )

    return () => {
      scanner.clear().catch(() => {})
    }
  }, [])

  const confirmar = useMutation({
    mutationFn: () => api.retiros.confirmar(retiroId!, nombre.trim() || 'Encargado'),
    onSuccess: (data) => {
      setRetiro(data)
      setShowInput(false)
      queryClient.invalidateQueries({ queryKey: ['retiro', retiroId] })
    },
  })

  const reiniciar = () => {
    setEstado('escaneando')
    setRetiroId(null)
    setRetiro(null)
    setNombre('')
    setShowInput(false)
    setErrorMsg('')
    confirmar.reset()
    scannerRef.current?.resume()
  }

  const fecha = retiro
    ? new Date(retiro.createdAt).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  const yaConfirmado = !!retiro?.confirmadoAt

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Validar retiro</h2>
        <p className="text-gray-400 text-sm mt-1">
          Escanea el QR del ticket para confirmar la recepción en cocina.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Columna cámara */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${estado === 'escaneando' ? 'bg-cyan-400 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-sm font-semibold text-gray-700">
              {estado === 'escaneando' ? 'Cámara activa' : 'Cámara en pausa'}
            </span>
          </div>

          {/* El div donde html5-qrcode monta la cámara */}
          <div id="qr-reader" className="w-full [&>*]:!border-0 [&_video]:!rounded-none" />

          {estado !== 'escaneando' && (
            <div className="px-5 pb-5">
              <button
                onClick={reiniciar}
                className="w-full border-2 border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:border-cyan-400 hover:text-cyan-600 transition-colors"
              >
                ↺ Escanear otro
              </button>
            </div>
          )}
        </div>

        {/* Columna resultado */}
        <div className="flex flex-col gap-4">

          {/* Estado: esperando */}
          {estado === 'escaneando' && (
            <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-8 flex flex-col items-center justify-center text-center h-full">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m0 0V9a2 2 0 012-2h2" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">Apunta la cámara al código QR del ticket</p>
            </div>
          )}

          {/* Estado: cargando */}
          {estado === 'cargando' && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Estado: error */}
          {estado === 'error' && (
            <div className="bg-white rounded-3xl border border-red-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-red-600">QR inválido</p>
              </div>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
          )}

          {/* Estado: retiro cargado */}
          {estado === 'visto' && retiro && (
            <>
              {/* Card retiro */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">Retiro #{retiro.id}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{fecha}</p>
                  </div>
                  {yaConfirmado ? (
                    <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-100">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      Confirmado
                    </span>
                  ) : (
                    <span className="bg-amber-50 text-amber-600 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-100">
                      Pendiente
                    </span>
                  )}
                </div>

                <div className="flex gap-3 mb-4 text-sm">
                  <div className="flex-1 bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-400 text-xs mb-0.5">Empleado</p>
                    <p className="font-semibold text-gray-800">{retiro.empleado.nombre}</p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-400 text-xs mb-0.5">Restaurante</p>
                    <p className="font-semibold text-gray-800">{retiro.restaurant.nombre}</p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-1.5">
                  {retiro.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700">{item.nombre}</span>
                      <span className="text-sm font-bold text-gray-600 tabular-nums">
                        {item.cantidad} {item.unidad}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Acción de confirmación */}
              {yaConfirmado ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                  <p className="text-emerald-700 font-semibold text-sm">
                    Confirmado por <span className="font-bold">{retiro.confirmadoPor}</span>
                  </p>
                  <p className="text-emerald-500 text-xs mt-1">
                    {new Date(retiro.confirmadoAt!).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ) : !showInput ? (
                <button
                  onClick={() => setShowInput(true)}
                  className="w-full bg-cyan-500 text-white text-base font-bold py-3.5 rounded-2xl hover:bg-cyan-400 transition-colors shadow-sm"
                >
                  Confirmar recepción
                </button>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">¿Quién confirma?</p>
                  <input
                    type="text"
                    placeholder="Tu nombre (opcional)"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmar.mutate()}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 mb-3 focus:outline-none focus:border-cyan-400"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowInput(false)}
                      className="flex-1 border-2 border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-medium hover:border-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => confirmar.mutate()}
                      disabled={confirmar.isPending}
                      className="flex-1 bg-cyan-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50"
                    >
                      {confirmar.isPending ? 'Guardando...' : 'Confirmar'}
                    </button>
                  </div>
                  {confirmar.isError && (
                    <p className="text-red-500 text-xs text-center mt-2">
                      Error al confirmar. Inténtalo de nuevo.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
