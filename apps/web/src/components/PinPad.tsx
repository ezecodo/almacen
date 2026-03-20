import { useState } from 'react'

interface Props {
  onSubmit: (pin: string) => void
  isLoading: boolean
  error: boolean
  onBack?: () => void
}

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinPad({ onSubmit, isLoading, error, onBack }: Props) {
  const [pin, setPin] = useState('')

  const handleKey = (key: string) => {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    if (next.length === 4) {
      onSubmit(next)
      setTimeout(() => setPin(''), 600)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xs">
      {onBack && (
        <button onClick={onBack} className="self-start text-cyan-600 text-sm hover:underline">
          ← Volver
        </button>
      )}

      <h2 className="text-3xl font-bold text-gray-900">Introduce tu PIN</h2>

      {/* Puntos indicadores */}
      <div className="flex gap-5">
        {[0,1,2,3].map((i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? error ? 'bg-red-500 border-red-500' : 'bg-cyan-500 border-cyan-500'
                : 'border-gray-300'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-500 text-sm -mt-4">PIN incorrecto, inténtalo de nuevo</p>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {KEYS.map((key, i) => (
          key === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => handleKey(key)}
              disabled={isLoading || (key !== '⌫' && pin.length >= 4)}
              className={`aspect-square rounded-2xl text-2xl font-semibold transition-all active:scale-95 disabled:opacity-40 ${
                key === '⌫'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-white border-2 border-gray-200 text-gray-900 hover:border-cyan-400 hover:bg-cyan-50 shadow-sm'
              }`}
            >
              {isLoading && key !== '⌫' ? '' : key}
            </button>
          )
        ))}
      </div>
    </div>
  )
}
