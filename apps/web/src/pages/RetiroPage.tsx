import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Restaurante, Empleado, RetiroItem } from '../api'
import { useScanner } from '../hooks/useScanner'
import SelectRestaurante from '../components/SelectRestaurante'
import PinPad from '../components/PinPad'
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
  const [pinError, setPinError] = useState(false)

  const authEmpleado = useMutation({
    mutationFn: (pin: string) => api.empleados.auth(pin),
    onSuccess: (emp) => {
      setEmpleado(emp)
      setPinError(false)
      setStep('escaneo')
    },
    onError: () => {
      setPinError(true)
      setTimeout(() => setPinError(false), 1500)
    },
  })

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

  const handlePrint = () => {
    const fecha = new Date().toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const lineas = items.map((item) =>
      `<tr>
        <td style="padding:3px 0;font-size:13px;">${item.nombre}</td>
        <td style="padding:3px 0;font-size:13px;text-align:right;font-weight:bold;white-space:nowrap;">${item.cantidad} ${item.unidad}</td>
      </tr>`
    ).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0; size: 80mm auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; width: 80mm; padding: 5mm; color: #000; font-size: 13px; }
    .logo { text-align: center; margin-bottom: 8px; }
    .logo img { width: 35mm; }
    .divider { border-top: 1px dashed #000; margin: 5px 0; }
    .info { margin-bottom: 3px; }
    .info span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    .total { text-align: right; font-size: 12px; color: #555; margin-top: 4px; }
    .footer { text-align: center; font-size: 11px; margin-top: 8px; color: #888; }
  </style>
</head>
<body>
  <div class="logo"><img src="${window.location.origin}/sensi.png" /></div>
  <div class="divider"></div>
  <p class="info">Fecha: <span>${fecha}</span></p>
  <p class="info">Empleado: <span>${empleado?.nombre}</span></p>
  <p class="info">Restaurante: <span>${restaurante?.nombre}</span></p>
  ${retiroId ? `<p class="info">Retiro: <span>#${retiroId}</span></p>` : ''}
  <div class="divider"></div>
  <table>${lineas}</table>
  <div class="divider"></div>
  <p class="total">${items.length} producto${items.length !== 1 ? 's' : ''}</p>
  <p class="footer">Almacén · ${new Date().toLocaleDateString('es-ES')}</p>
</body>
</html>`

    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.print(); win.close() }
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
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center justify-center p-8 text-center">
        {/* Logo */}
        <img src="/sensi.png" alt="Sensi" className="h-12 object-contain mb-12 opacity-90" />

        {/* Check animado */}
        <div className="w-24 h-24 rounded-full border-4 border-cyan-400 flex items-center justify-center mb-8">
          <svg className="w-12 h-12 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Retiro guardado</h1>

        <p className="text-xl text-gray-300 mb-1">{empleado?.nombre}</p>
        <p className="text-gray-500 mb-6">{restaurante?.nombre}</p>

        <div className="flex items-center gap-3 mb-12">
          <span className="bg-gray-700 text-cyan-400 text-sm font-medium px-4 py-1.5 rounded-full">
            {items.length} producto{items.length !== 1 ? 's' : ''}
          </span>
          {retiroId && (
            <span className="bg-gray-700 text-gray-300 text-sm px-4 py-1.5 rounded-full">
              #{retiroId}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handlePrint}
            className="border border-gray-700 text-gray-300 text-lg font-medium py-4 rounded-2xl hover:border-cyan-400 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir ticket
          </button>
          <button
            onClick={handleReset}
            className="bg-cyan-400 text-gray-950 text-lg font-bold py-4 rounded-2xl hover:bg-cyan-300 transition-colors"
          >
            Nuevo retiro
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-center relative">
        <img src="/sensi.png" alt="Sensi" className="h-8 object-contain" />
        <Link to="/admin" className="absolute right-6 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
          Panel Admin
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

        {/* PASO 2: PIN */}
        {step === 'empleado' && restaurante && (
          <section className="flex flex-col items-center gap-6 w-full max-w-xs">
            <PinPad
              onSubmit={(pin) => authEmpleado.mutate(pin)}
              isLoading={authEmpleado.isPending}
              error={pinError}
              onBack={() => setStep('restaurante')}
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

      <p className="absolute bottom-3 right-4 text-xs text-gray-300">
        made by{' '}
        <a href="https://www.ezeangeloni.xyz" target="_blank" rel="noreferrer" className="hover:text-gray-500 transition-colors">
          eZe
        </a>
      </p>
    </div>
  )
}
