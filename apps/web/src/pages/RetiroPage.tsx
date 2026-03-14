import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Restaurante, Empleado, RetiroItem } from '../api'
import { useScanner } from '../hooks/useScanner'
import SelectRestaurante from '../components/SelectRestaurante'
import SelectEmpleado from '../components/SelectEmpleado'
import ItemList from '../components/ItemList'
import CantidadModal from '../components/CantidadModal'
import ConfirmModal from '../components/ConfirmModal'

type Step = 'restaurante' | 'empleado' | 'escaneo' | 'confirmacion' | 'exito'

interface PendingScan {
  barcode: string
  nombreSugerido: string
}

export default function RetiroPage() {
  const [step, setStep] = useState<Step>('restaurante')
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null)
  const [empleado, setEmpleado] = useState<Empleado | null>(null)
  const [items, setItems] = useState<RetiroItem[]>([])
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [retiroId, setRetiroId] = useState<number | null>(null)

  const crearRetiro = useMutation({
    mutationFn: api.retiros.create,
    onSuccess: (data) => {
      setRetiroId(data.id)
      setStep('exito')
    },
  })

  const handleBarcode = useCallback(async (barcode: string) => {
    try {
      const producto = await api.productos.lookup(barcode)
      setPendingScan({
        barcode,
        nombreSugerido: producto.encontrado ? producto.nombre : '',
      })
    } catch {
      setPendingScan({ barcode, nombreSugerido: '' })
    }
  }, [])

  useScanner({
    onScan: handleBarcode,
    enabled: step === 'escaneo' && !pendingScan && !showConfirm,
  })

  const handleItemConfirm = (item: RetiroItem) => {
    setItems((prev) => [...prev, item])
    setPendingScan(null)
  }

  const handleConfirmarRetiro = () => {
    if (!restaurante || !empleado) return
    crearRetiro.mutate({
      restaurantId: restaurante.id,
      empleadoId: empleado.id,
      items,
    })
    setShowConfirm(false)
  }

  const handleReset = () => {
    setStep('restaurante')
    setRestaurante(null)
    setEmpleado(null)
    setItems([])
    setPendingScan(null)
    setShowConfirm(false)
    setRetiroId(null)
    crearRetiro.reset()
  }

  // --- PASO: EXITO ---
  if (step === 'exito') {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-8xl mb-6">✅</div>
        <h1 className="text-4xl font-bold text-green-800 mb-3">¡Retiro guardado!</h1>
        <p className="text-xl text-green-600 mb-2">
          {empleado?.nombre} · {restaurante?.nombre}
        </p>
        <p className="text-green-500 mb-2">{items.length} producto{items.length !== 1 ? 's' : ''}</p>
        {retiroId && <p className="text-sm text-green-400 mb-12">Retiro #{retiroId}</p>}
        <button
          onClick={handleReset}
          className="bg-green-600 text-white text-xl font-semibold py-5 px-12 rounded-2xl hover:bg-green-700 transition-colors"
        >
          Nuevo retiro
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-center relative">
        <img src="/sensi.png" alt="Sensi" className="h-8 object-contain" />
        <Link to="/admin" className="absolute right-6 text-sm text-indigo-600 hover:underline">
          Admin
        </Link>
      </header>

      <main className="flex flex-col items-center px-6 py-10 gap-8">

        {/* PASO 1: Seleccionar restaurante */}
        {step === 'restaurante' && (
          <section className="flex flex-col items-center gap-6 w-full max-w-md">
            <h2 className="text-3xl font-bold text-gray-900">¿Qué restaurante?</h2>
            <SelectRestaurante
              value={restaurante}
              onChange={(r) => {
                setRestaurante(r)
                setEmpleado(null)
                setStep('empleado')
              }}
            />
          </section>
        )}

        {/* PASO 2: Seleccionar empleado */}
        {step === 'empleado' && restaurante && (
          <section className="flex flex-col items-center gap-6 w-full max-w-md">
            <button
              onClick={() => setStep('restaurante')}
              className="self-start text-indigo-600 text-sm hover:underline"
            >
              ← Cambiar restaurante
            </button>
            <h2 className="text-3xl font-bold text-gray-900">¿Quién eres?</h2>
            <SelectEmpleado
              restaurantId={restaurante.id}
              value={empleado}
              onChange={(e) => {
                setEmpleado(e)
                setStep('escaneo')
              }}
            />
          </section>
        )}

        {/* PASO 3: Escaneo de productos */}
        {step === 'escaneo' && restaurante && empleado && (
          <section className="flex flex-col w-full max-w-2xl gap-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('empleado')}
                className="text-indigo-600 text-sm hover:underline"
              >
                ← Volver
              </button>
              <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium">
                <span className="animate-pulse">●</span>
                Scanner activo
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Productos escaneados</h2>
                <span className="text-sm text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>
              <ItemList items={items} onRemove={(i) => setItems((prev) => prev.filter((_, idx) => idx !== i))} />
            </div>

            {items.length > 0 && (
              <button
                onClick={() => setShowConfirm(true)}
                className="w-full bg-green-600 text-white text-xl font-bold py-5 rounded-2xl hover:bg-green-700 transition-colors shadow-lg"
              >
                Confirmar retiro ({items.length} item{items.length !== 1 ? 's' : ''})
              </button>
            )}

            {items.length === 0 && (
              <p className="text-center text-gray-400 text-sm">
                Apunta la pistola al código de barras y escanea
              </p>
            )}
          </section>
        )}
      </main>

      {/* Modal de cantidad (aparece tras cada scan) */}
      {pendingScan && (
        <CantidadModal
          barcode={pendingScan.barcode}
          nombreSugerido={pendingScan.nombreSugerido}
          onConfirm={handleItemConfirm}
          onCancel={() => setPendingScan(null)}
        />
      )}

      {/* Modal de confirmación */}
      {showConfirm && restaurante && empleado && (
        <ConfirmModal
          restaurante={restaurante.nombre}
          empleado={empleado.nombre}
          items={items}
          isLoading={crearRetiro.isPending}
          onConfirm={handleConfirmarRetiro}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Error de creación */}
      {crearRetiro.isError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg">
          Error al guardar el retiro. Inténtalo de nuevo.
        </div>
      )}
    </div>
  )
}
