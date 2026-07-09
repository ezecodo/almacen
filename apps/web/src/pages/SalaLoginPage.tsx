import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function SalaLoginPage() {
  const navigate = useNavigate()
  const restaurant = (() => {
    try { return JSON.parse(localStorage.getItem('oidoops_restaurant') ?? '') }
    catch { return null }
  })()

  const [pin, setPin]     = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!restaurant) navigate('/sala/setup', { replace: true })
  }, [])

  if (!restaurant) return null

  const triggerError = (msg: string) => {
    setError(msg)
    setPin('')
    setShake(true)
    setTimeout(() => setShake(false), 400)
  }

  const handleDigit = async (d: string) => {
    const next = pin + d
    setPin(next)
    setError('')

    if (next.length < 4) return

    setLoading(true)
    try {
      const empleado = await api.empleados.auth(next)
      if (empleado.tipo !== 'sala') {
        triggerError('Solo personal de sala puede acceder')
      } else {
        sessionStorage.setItem('oidoops_camarero', JSON.stringify({
          id: empleado.id,
          nombre: empleado.nombre,
          rol: empleado.rol ?? null,
          accesoEncargadoApp: empleado.accesoEncargadoApp ?? false,
        }))
        navigate('/sala/mesas', { replace: true })
      }
    } catch {
      triggerError('PIN incorrecto')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = () => {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 select-none">
      <img src="/oidoops.svg" alt="OidoOps" className="h-8 mb-2 opacity-70" />
      <p className="text-[#4CC8A0] font-semibold text-sm mb-10">{restaurant.nombre}</p>

      <h2 className="text-white text-xl font-bold mb-1">Introduce tu PIN</h2>
      <p className="text-gray-500 text-sm mb-8">Personal de sala</p>

      {/* Dots */}
      <div className={`flex gap-4 mb-8 ${shake ? 'animate-shake' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${
            i < pin.length ? 'bg-[#4CC8A0] scale-110' : 'bg-gray-700'
          }`} />
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {digits.map((d, i) => {
          if (d === '') return <div key={i} />
          if (d === '⌫') return (
            <button key={i} onClick={handleDelete}
              className="h-16 rounded-2xl bg-gray-800 text-gray-400 text-2xl font-bold flex items-center justify-center active:scale-90 transition-transform hover:bg-gray-700">
              ⌫
            </button>
          )
          return (
            <button key={i} onClick={() => !loading && pin.length < 4 && handleDigit(d)}
              className="h-16 rounded-2xl bg-[#1e2d45] text-white text-2xl font-bold flex items-center justify-center active:scale-90 transition-transform hover:bg-[#263a55]">
              {d}
            </button>
          )
        })}
      </div>

      {/* Configurar dispositivo */}
      <button
        onClick={() => navigate('/sala/setup')}
        className="mt-16 text-gray-700 text-xs hover:text-gray-500"
      >
        Cambiar restaurante
      </button>
    </div>
  )
}
