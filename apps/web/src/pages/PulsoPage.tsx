import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import CheckOverlay from '../components/CheckOverlay'
import { useAdminEvents } from '../hooks/useAdminEvents'

const TICKET_MEDIO_PAX = 41.50

function fmtNumero(n: number) {
  return Math.round(n).toLocaleString('es-ES')
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

// Cada carácter numérico se remonta (key=char) cuando cambia de valor, retriggereando
// la animación CSS "digitUp" — así solo los dígitos que realmente cambiaron suben,
// dando el efecto odómetro. Separadores/espacios quedan estáticos.
function RollingNumber({ value }: { value: number }) {
  const texto = fmtNumero(value)
  return (
    <span className="inline-flex tabular-nums">
      {texto.split('').map((char, i) =>
        /\d/.test(char) ? (
          <span key={i} className="inline-block overflow-hidden" style={{ height: '1em', lineHeight: 1 }}>
            <span key={char} className="inline-block" style={{ animation: 'digitUp 0.35s cubic-bezier(0.22,1,0.36,1)' }}>
              {char}
            </span>
          </span>
        ) : (
          <span key={i} className="inline-block">{char}</span>
        )
      )}
    </span>
  )
}

// Simula una mesa que paga: un número de pax (2-4 lo más común) × el ticket medio real
// (41,50€/pax), con algo de ruido para que no sea siempre un múltiplo exacto.
function randomPax() {
  const r = Math.random()
  if (r < 0.15) return 1
  if (r < 0.55) return 2
  if (r < 0.80) return 3
  if (r < 0.92) return 4
  if (r < 0.97) return 5
  return 6
}

function randomIncremento() {
  const pax = randomPax()
  const ruido = randomBetween(0.85, 1.25)
  return pax * TICKET_MEDIO_PAX * ruido
}

const COLORS = ['from-cyan-500 to-emerald-500', 'from-indigo-500 to-purple-500', 'from-amber-500 to-orange-500', 'from-pink-500 to-rose-500', 'from-teal-500 to-cyan-500']

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// Modo demo: se activa con /pulso?demo=1 o manteniendo apretado el logo (~0,8s).
// Vive en sessionStorage — al cerrar la pestaña/app vuelve a los datos reales.
const DEMO_KEY = 'pulso_demo'

function demoInicial() {
  const param = new URLSearchParams(window.location.search).get('demo')
  if (param !== null) {
    const on = param !== '0'
    try { sessionStorage.setItem(DEMO_KEY, on ? '1' : '0') } catch {}
    return on
  }
  try { return sessionStorage.getItem(DEMO_KEY) === '1' } catch { return false }
}

// Simulación: cada restaurante arranca en 0 y sube solo, con su propio ritmo
// (intervalos independientes), imitando mesas que van pagando.
function useSimulacion(ids: number[], activa: boolean) {
  const [montos, setMontos] = useState<Record<number, number>>({})
  const clave = ids.join(',')

  useEffect(() => {
    if (!activa) return
    setMontos({})
    const timers = new Map<number, ReturnType<typeof setTimeout>>()
    for (const id of ids) {
      const tick = () => {
        setMontos(prev => ({ ...prev, [id]: (prev[id] ?? 0) + randomIncremento() }))
        timers.set(id, setTimeout(tick, randomBetween(600, 2200)))
      }
      timers.set(id, setTimeout(tick, randomBetween(200, 1000)))
    }
    return () => timers.forEach(t => clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activa])

  return montos
}

function RestauranteCard({
  nombre, color, monto, activo, detalle,
}: {
  nombre: string
  color: string
  monto: number
  activo: boolean
  detalle: string
}) {
  const [flash, setFlash] = useState(false)
  const [ultimoIncremento, setUltimoIncremento] = useState<{ valor: number; key: number } | null>(null)
  const montoPrev = useRef(monto)

  // El flash y el "+X €" salen solos cada vez que el monto sube — da igual si el
  // incremento viene de una mesa real cobrada o de la simulación.
  useEffect(() => {
    const diff = monto - montoPrev.current
    montoPrev.current = monto
    if (diff < 0.005) return
    setUltimoIncremento({ valor: diff, key: Date.now() })
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 500)
    return () => clearTimeout(t)
  }, [monto])

  return (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-6 text-white shadow-lg transition-transform duration-500 ${activo ? `bg-gradient-to-br ${color}` : 'bg-white/5 border border-white/10'} ${flash ? 'scale-[1.02] sm:scale-[1.03]' : 'scale-100'}`}
    >
      {flash && (
        <div className="absolute inset-0 bg-white/20 pointer-events-none" />
      )}
      <div className={`flex items-center justify-between gap-2 sm:block ${activo ? '' : 'opacity-50'}`}>
        <p className="text-[11px] sm:text-sm font-semibold text-white/80 uppercase tracking-wide truncate sm:pr-14">{nombre}</p>
        <p className="text-xl sm:text-4xl font-black sm:mt-2 shrink-0">
          <RollingNumber value={monto} /> €
        </p>
      </div>
      <p className={`hidden sm:block text-xs mt-1 ${activo ? 'text-white/70' : 'text-white/40'}`}>{detalle}</p>

      {ultimoIncremento && (
        <p
          key={ultimoIncremento.key}
          className="absolute top-1.5 right-2 sm:top-4 sm:right-5 text-[10px] sm:text-sm font-bold text-white"
          style={{ animation: 'fadeInOut 1.2s ease forwards' }}
        >
          +{Math.round(ultimoIncremento.valor)} €
        </p>
      )}
    </div>
  )
}

export default function PulsoPage() {
  const navigate = useNavigate()
  const [demo, setDemo] = useState(demoInicial)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setCargando(false), 2000)
    return () => clearTimeout(t)
  }, [])

  // Misma fuente (y misma queryKey) que el FacturacionWidget del admin: comandas cerradas
  // desde la apertura del turno. useAdminEvents la invalida por SSE en cada cobro;
  // el polling queda de respaldo.
  useAdminEvents()
  const { data: stats = [], isError } = useQuery({
    queryKey: ['facturacion-dia'],
    queryFn: () => api.turnos.getStats(),
    refetchInterval: 30_000,
  })

  const montosDemo = useSimulacion(stats.map(s => s.restaurantId), demo)

  const cards = stats.map(s => {
    if (demo) return { id: s.restaurantId, nombre: s.nombre, monto: montosDemo[s.restaurantId] ?? 0, activo: true, detalle: 'Facturación de hoy' }
    const detalle = s.activo && s.aperturaAt
      ? `Turno desde las ${fmtHora(s.aperturaAt)} · ${s.numComandas} ${s.numComandas === 1 ? 'mesa cobrada' : 'mesas cobradas'}`
      : 'Sin turno abierto'
    return { id: s.restaurantId, nombre: s.nombre, monto: s.totalVentas, activo: s.activo, detalle }
  })

  const total = cards.reduce((a, c) => a + c.monto, 0)
  const totalRef = useRef(total)
  totalRef.current = total

  // El total suma los ticks de todos los restaurantes a la vez → sin este freno visual,
  // los dígitos se remontan varias veces por segundo y el odómetro se ve como un flash
  // en vez de un conteo. Lo refrescamos a un ritmo fijo y prolijo.
  const [totalDisplay, setTotalDisplay] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTotalDisplay(totalRef.current), 500)
    return () => clearInterval(i)
  }, [])

  const cambiarDemo = (on: boolean) => {
    try { sessionStorage.setItem(DEMO_KEY, on ? '1' : '0') } catch {}
    setDemo(on)
  }

  const pressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStart = () => {
    pressRef.current = setTimeout(() => {
      navigator.vibrate?.(30)
      cambiarDemo(!demo)
    }, 800)
  }
  const pressEnd = () => { if (pressRef.current) clearTimeout(pressRef.current) }

  const salir = () => {
    sessionStorage.removeItem('pulso_auth')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#1a2235] px-3 py-4 sm:px-8 sm:py-8 overflow-x-hidden">
      {cargando && <CheckOverlay />}

      <div className={`max-w-4xl mx-auto transition-opacity duration-700 ${cargando ? 'opacity-0' : 'opacity-100'}`}>
        <div className="flex items-start justify-between mb-3 sm:mb-8 gap-3">
          <div className="min-w-0">
            <svg
              viewBox="0 0 300 70"
              className="h-5 sm:h-7 w-auto mb-1 sm:mb-2 select-none"
              style={{ WebkitTouchCallout: 'none' }}
              onPointerDown={pressStart}
              onPointerUp={pressEnd}
              onPointerLeave={pressEnd}
              onPointerCancel={pressEnd}
              onContextMenu={e => e.preventDefault()}
            >
              <defs>
                <linearGradient id="pulso-logo-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4B9EDF" />
                  <stop offset="100%" stopColor="#4CC8A0" />
                </linearGradient>
              </defs>
              <path
                d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
                fill="url(#pulso-logo-g)"
              />
              <path d="M15 34 L29 48 L55 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <text x="80" y="51" fontFamily="'Helvetica Neue', Arial, sans-serif" fontWeight="800" fontSize="44">
                <tspan fill="white">Oido</tspan><tspan fill="#4CC8A0">Ops</tspan>
              </text>
            </svg>
            <h1 className="text-base sm:text-2xl font-black text-white leading-tight">
              Facturación en <span className="text-[#4CC8A0]">vivo</span>
            </h1>
            <p className="hidden sm:block text-xs sm:text-sm text-gray-400">Todos los restaurantes, hoy</p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {demo && (
              <button
                onClick={() => cambiarDemo(false)}
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-amber-300 border border-amber-300/40 rounded-full px-2 py-0.5"
              >
                Demo ✕
              </button>
            )}
            <button onClick={salir} className="text-xs sm:text-sm text-gray-400 hover:text-white transition-colors">
              Salir
            </button>
          </div>
        </div>

        {isError && !demo && (
          <p className="mb-3 text-xs sm:text-sm text-red-300">No se pudo actualizar la facturación — reintentando…</p>
        )}

        <div className="grid sm:grid-cols-2 gap-2 sm:gap-5">
          {cards.map((c, i) => (
            <RestauranteCard
              key={`${demo ? 'demo' : 'real'}-${c.id}`}
              nombre={c.nombre}
              color={COLORS[i % COLORS.length]}
              monto={c.monto}
              activo={c.activo}
              detalle={c.detalle}
            />
          ))}
        </div>

        <div className="mt-3 sm:mt-6 rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-white bg-gradient-to-br from-[#0f1a2e] to-[#1a2235] border border-white/10 text-center">
          <p className="text-[11px] sm:text-sm font-semibold text-white/60 uppercase tracking-wide">Total del grupo</p>
          <p className="text-3xl sm:text-6xl font-black mt-1 sm:mt-2 text-[#4CC8A0]">
            <RollingNumber value={totalDisplay} /> €
          </p>
        </div>
      </div>
    </div>
  )
}
