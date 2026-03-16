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
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        {/* Header igual que el resto */}
        <div className="absolute top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-center">
          <img src="/sensi.png" alt="Sensi" className="h-8 object-contain" />
        </div>

        {/* Check */}
        <div className="w-20 h-20 rounded-full bg-cyan-50 border-2 border-cyan-400 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Retiro guardado</h1>
        <p className="text-lg text-gray-700 mb-0.5">{empleado?.nombre}</p>
        <p className="text-gray-400 mb-6">{restaurante?.nombre}</p>

        <div className="flex items-center gap-2 mb-10">
          <span className="bg-cyan-50 text-cyan-600 text-sm font-medium px-4 py-1.5 rounded-full border border-cyan-100">
            {items.length} producto{items.length !== 1 ? 's' : ''}
          </span>
          {retiroId && (
            <span className="bg-gray-100 text-gray-500 text-sm px-4 py-1.5 rounded-full">
              #{retiroId}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handlePrint}
            className="border-2 border-gray-200 text-gray-600 text-lg font-medium py-4 rounded-2xl hover:border-cyan-400 hover:text-cyan-600 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir ticket
          </button>
          <button
            onClick={handleReset}
            className="bg-cyan-500 text-white text-lg font-bold py-4 rounded-2xl hover:bg-cyan-400 transition-colors"
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
            <p className="text-2xl font-semibold text-gray-800 text-center">
              Hola, {empleado.nombre.split(' ')[0]} 👋
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('empleado')}
                className="text-cyan-600 text-sm hover:underline"
              >
                ← Volver
              </button>
              <div className="flex items-center gap-2 bg-cyan-50 text-cyan-700 px-4 py-2 rounded-full text-sm font-medium">
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
                className="w-full bg-cyan-500 text-white text-xl font-bold py-5 rounded-2xl hover:bg-cyan-400 transition-colors shadow-lg"
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

      <div className="absolute bottom-3 right-4 flex items-center gap-3">
        <Link to="/admin" className="text-gray-200 hover:text-gray-400 transition-colors" title="Admin">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
        <p className="text-xs text-gray-300">
          made by{' '}
          <a href="https://www.ezeangeloni.xyz" target="_blank" rel="noreferrer" className="hover:text-gray-500 transition-colors">
            eZe
          </a>
        </p>
      </div>
    </div>
  )
}
