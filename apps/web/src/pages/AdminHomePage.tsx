import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const now = new Date()
const fecha = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

const FONT: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  fontWeight: 900,
  fontSize: '4rem',
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

function Vineta({ width, drawCheck }: { width: number; drawCheck: boolean }) {
  const h = Math.round(width * 72 / 68)
  return (
    <svg width={width} height={h} viewBox="0 0 68 72">
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4B9EDF" />
          <stop offset="100%" stopColor="#4CC8A0" />
        </linearGradient>
      </defs>
      <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#vg)" />
      <path
        d="M15 34 L29 48 L55 18"
        fill="none" stroke="white" strokeWidth="7"
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="61"
        strokeDashoffset={drawCheck ? 0 : 61}
        style={{ transition: drawCheck ? 'stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1) 0.25s' : 'none' }}
      />
    </svg>
  )
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m > 0 ? `${m}m` : ''}`
}

// ── Widget: Turnos activos ─────────────────────────────────────────────────────
function TurnosWidget() {
  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['turnos-activos-global'],
    queryFn: () => api.turnos.getActivos(),
    refetchInterval: 30_000,
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="font-bold text-gray-800 text-sm">Turnos activos</h2>
        </div>
        <span className="text-xs text-gray-400">{turnos.length} restaurante{turnos.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-gray-300 text-sm">Cargando…</div>
      ) : turnos.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-400 text-sm">Ningún turno abierto ahora mismo</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {turnos.map(t => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">{t.restaurant.nombre}</p>
                {t.encargadoNombre && (
                  <p className="text-xs text-gray-400">👤 {t.encargadoNombre}</p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {timeAgo(t.aperturaAt)} abierto
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Widget: Google Reviews ─────────────────────────────────────────────────────
function ReviewsWidget() {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews-dashboard'],
    queryFn: () => api.reviews.list(),
    refetchInterval: 60_000,
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">⭐</span>
          <h2 className="font-bold text-gray-800 text-sm">Google Reviews</h2>
        </div>
        <span className="text-xs text-gray-400">{reviews.filter(r => r.rating).length} restaurantes</span>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-gray-300 text-sm">Cargando…</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {reviews.map(r => {
            const ratingBajo = r.ratingDiff !== null && r.ratingDiff < 0
            return (
              <div key={r.restaurantId} className={`px-5 py-3 ${ratingBajo ? 'bg-red-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">{r.nombre}</p>
                  <div className="flex items-center gap-3">
                    {r.diff !== null && r.diff !== 0 && (
                      <span className={`text-xs font-medium ${r.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {r.diff > 0 ? `+${r.diff}` : r.diff} hoy
                      </span>
                    )}
                    {r.rating ? (
                      <div className="flex items-center gap-1">
                        <span className="text-amber-400 text-sm">★</span>
                        <span className={`text-sm font-bold ${ratingBajo ? 'text-red-600' : 'text-gray-800'}`}>{r.rating.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({r.total})</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">Sin datos</span>
                    )}
                  </div>
                </div>
                {ratingBajo && (
                  <p className="text-xs text-red-500 mt-0.5">
                    ⚠️ Rating bajó {r.ratingDiff} desde ayer ({r.ratingAnterior?.toFixed(1)} → {r.rating?.toFixed(1)}) — revisar Google Maps
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Hero ───────────────────────────────────────────────────────────────────────
export default function AdminHomePage() {
  const [heroIn,    setHeroIn]    = useState(false)
  const [heroOut,   setHeroOut]   = useState(false)
  const [accentIn,  setAccentIn]  = useState(false)
  const [textIn,    setTextIn]    = useState(false)
  const [taglineIn, setTaglineIn] = useState(false)
  const [widgetsIn, setWidgetsIn] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setHeroIn(true),    80)
    const t2 = setTimeout(() => setHeroOut(true),   900)
    const t3 = setTimeout(() => setAccentIn(true),  1050)
    const t4 = setTimeout(() => setTextIn(true),    1150)
    const t5 = setTimeout(() => setTaglineIn(true), 1750)
    const t6 = setTimeout(() => setWidgetsIn(true), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearTimeout(t6) }
  }, [])

  return (
    <div className="min-h-full bg-gray-50">
      <div className="flex flex-col items-center px-6 py-12 gap-10">

        {/* Hero animado */}
        <div className="flex flex-col items-center text-center gap-6" style={{ position: 'relative' }}>

          {/* Viñeta grande centrada — aparece y encoge */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(-50%, -50%) scale(${heroIn && !heroOut ? 1 : 0.15})`,
            opacity: heroIn && !heroOut ? 1 : 0,
            transition: heroOut
              ? 'transform 0.45s cubic-bezier(0.4,0,0.6,1), opacity 0.35s ease'
              : 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
            filter: 'drop-shadow(0 0 40px #4CC8A055)',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <Vineta width={140} drawCheck={heroIn && !heroOut} />
          </div>

          {/* Logotipo */}
          <div style={{
            opacity: textIn ? 1 : 0,
            transform: textIn ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', ...FONT }}>
              <span style={{ color: '#0f172a' }}>O</span>
              <span style={{ position: 'relative', display: 'inline-block' }}>
                <span style={{ color: '#0f172a' }}>ı</span>
                <span style={{
                  position: 'absolute', left: '50%', bottom: '88%',
                  transform: `translateX(-50%) scale(${accentIn ? 1 : 0.2})`,
                  opacity: accentIn ? 1 : 0,
                  transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
                  transformOrigin: 'bottom center',
                  filter: 'drop-shadow(0 0 8px #4CC8A055)',
                  display: 'block', lineHeight: 0,
                }}>
                  <Vineta width={26} drawCheck={accentIn} />
                </span>
              </span>
              <span style={{ color: '#0f172a' }}>do</span>
              <span style={{ color: '#4CC8A0' }}>Ops</span>
            </div>
          </div>

          {/* Tagline */}
          <div style={{
            opacity: taglineIn ? 1 : 0,
            transform: taglineIn ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}>
            <p style={{
              fontSize: 14, fontWeight: 500, letterSpacing: '0.05em',
              background: 'linear-gradient(90deg, #4CC8A0, #6366f1)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Gestión inteligente de gastronomía
            </p>
            <p className="text-gray-400 text-xs mt-1.5 capitalize">{fecha}</p>
          </div>
        </div>

        {/* Widgets */}
        <div
          className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4"
          style={{
            opacity: widgetsIn ? 1 : 0,
            transform: widgetsIn ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <TurnosWidget />
          <ReviewsWidget />
        </div>

      </div>
    </div>
  )
}
