import { useEffect, useState } from 'react'

const now = new Date()
const fecha = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

const FONT: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  fontWeight: 900,
  fontSize: '5rem',
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
      <path
        d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
        fill="url(#vg)"
      />
      <path
        d="M15 34 L29 48 L55 18"
        fill="none"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="61"
        strokeDashoffset={drawCheck ? 0 : 61}
        style={{
          transition: drawCheck ? 'stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1) 0.25s' : 'none',
        }}
      />
    </svg>
  )
}

export default function AdminHomePage() {
  const [heroIn,    setHeroIn]    = useState(false)
  const [heroOut,   setHeroOut]   = useState(false)
  const [accentIn,  setAccentIn]  = useState(false)
  const [textIn,    setTextIn]    = useState(false)
  const [taglineIn, setTaglineIn] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setHeroIn(true),    80)
    const t2 = setTimeout(() => setHeroOut(true),   900)
    const t3 = setTimeout(() => setAccentIn(true),  1050)
    const t4 = setTimeout(() => setTextIn(true),    1150)
    const t5 = setTimeout(() => setTaglineIn(true), 1750)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5) }
  }, [])

  return (
    <div className="min-h-full bg-gray-50 flex items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center text-center px-6 gap-8" style={{ position: 'relative' }}>

        {/* ① Viñeta grande — centrada, aparece y luego se encoge hasta desaparecer */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${heroIn && !heroOut ? 1 : heroOut ? 0.15 : 0.15})`,
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

        {/* ② Logotipo con viñeta pequeña como acento */}
        <div style={{
          opacity: textIn ? 1 : 0,
          transform: textIn ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', ...FONT }}>

            <span style={{ color: '#0f172a' }}>O</span>

            {/* "ı" dotless + viñeta como acento */}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span style={{ color: '#0f172a' }}>ı</span>
              <span style={{
                position: 'absolute',
                left: '50%',
                bottom: '88%',
                transform: `translateX(-50%) scale(${accentIn ? 1 : 0.2})`,
                opacity: accentIn ? 1 : 0,
                transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
                transformOrigin: 'bottom center',
                filter: 'drop-shadow(0 0 8px #4CC8A055)',
                display: 'block',
                lineHeight: 0,
              }}>
                <Vineta width={30} drawCheck={accentIn} />
              </span>
            </span>

            <span style={{ color: '#0f172a' }}>do</span>
            <span style={{ color: '#4CC8A0' }}>Ops</span>

          </div>
        </div>

        {/* ③ Tagline + fecha */}
        <div style={{
          opacity: taglineIn ? 1 : 0,
          transform: taglineIn ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          <p style={{
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '0.05em',
            background: 'linear-gradient(90deg, #4CC8A0, #6366f1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Gestión inteligente de gastronomía
          </p>
          <p className="text-gray-400 text-xs mt-2 capitalize">{fecha}</p>
        </div>

      </div>
    </div>
  )
}
