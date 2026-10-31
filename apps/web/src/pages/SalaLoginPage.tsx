import { useState, useEffect, useRef } from 'react'
import { enModoLocal } from '../lib/conexion'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

// tpv = PIN del puesto TPV (/tpv): la tablet compartida del local, que vuelve aquí tras cada acción
export default function SalaLoginPage({ tpv = false }: { tpv?: boolean }) {
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
    if (!restaurant) navigate(tpv ? '/sala/setup?volver=/tpv' : '/sala/setup', { replace: true })
  }, [])

  // Teclado físico (ver más abajo): los hooks van antes del return temprano
  const tecla = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => tecla.current(e)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
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
      const empleado = await api.empleados.auth(next, restaurant?.id)
      // Cocina entra con el mismo PIN a su pantalla (recetas, horario, propinas); el TPV es solo de sala
      if (empleado.tipo !== 'sala' && tpv) {
        triggerError('Solo personal de sala puede acceder')
      } else {
        sessionStorage.setItem('oidoops_camarero', JSON.stringify({
          id: empleado.id,
          nombre: empleado.nombre,
          tipo: empleado.tipo,
          rol: empleado.rol ?? null,
          accesoEncargadoApp: empleado.accesoEncargadoApp ?? false,
          // Entrando en modo local el pase lo firma la Box: vale allí, no en la nube
          token: enModoLocal() ? null : empleado.token ?? null,
          tokenLocal: enModoLocal() ? empleado.token ?? null : empleado.local?.token ?? null,
        }))
        navigate(tpv ? '/tpv/mesas' : empleado.tipo === 'cocina' ? '/sala/cocina' : '/sala/mesas', { replace: true })
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

  // El PIN también se puede escribir con un teclado (fila de números o numérico): en el TPV con
  // teclado físico se entra sin tocar la pantalla. ⌫ borra. Ref para usar siempre el estado actual.
  tecla.current = e => {
    // En el teclado numérico se mira la tecla física (Numpad0…9): así vale aunque Bloq Num esté
    // apagado (entonces e.key llega como "End", "ArrowDown"…). Pensado para un numérico Bluetooth
    // junto a la tablet del TPV.
    const numpad = /^Numpad([0-9])$/.exec(e.code)?.[1]
    const digito = numpad ?? (/^[0-9]$/.test(e.key) ? e.key : null)
    if (digito) { if (!loading && pin.length < 4) handleDigit(digito) }
    else if (e.key === 'Backspace') handleDelete()
    else return
    e.preventDefault()
  }
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6 select-none">
      <img src="/oidoops.svg" alt="OidoOps" className="h-8 mb-2 opacity-70" />
      <p className="text-[#4CC8A0] font-semibold text-sm mb-10">{restaurant.nombre}</p>

      <h2 className="text-white text-xl font-bold mb-1">Introduce tu PIN</h2>
      <p className="text-gray-500 text-sm mb-8">{tpv ? 'Puesto TPV · personal de sala' : 'Sala y cocina'}</p>

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
        onClick={() => navigate(tpv ? '/sala/setup?volver=/tpv' : '/sala/setup')}
        className="mt-16 text-gray-700 text-xs hover:text-gray-500"
      >
        Cambiar restaurante
      </button>
    </div>
  )
}
