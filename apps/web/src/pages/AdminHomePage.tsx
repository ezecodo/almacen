import { useEffect, useState } from 'react'

const now = new Date()
const fecha = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

export default function AdminHomePage() {
  const [logoVisible,    setLogoVisible]    = useState(false)
  const [badgeVisible,   setBadgeVisible]   = useState(false)
  const [taglineVisible, setTaglineVisible] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setLogoVisible(true),    100)
    const t2 = setTimeout(() => setBadgeVisible(true),   600)
    const t3 = setTimeout(() => setTaglineVisible(true), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className="min-h-full bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center text-center px-6 gap-8">

        {/* Logo */}
        <div style={{
          opacity: logoVisible ? 1 : 0,
          transform: logoVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.94)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          <img src="/oidoops.svg" alt="OidoOps" className="h-20 object-contain" />
        </div>

        {/* Viñeta con tilde animada */}
        <div style={{
          opacity: badgeVisible ? 1 : 0,
          transform: badgeVisible ? 'scale(1)' : 'scale(0.5)',
          transition: 'opacity 0.4s cubic-bezier(0.34,1.56,0.64,1), transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          filter: 'drop-shadow(0 0 32px #4CC8A055)',
        }}>
          <svg width="110" height="118" viewBox="0 0 68 72">
            <defs>
              <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4B9EDF" />
                <stop offset="100%" stopColor="#4CC8A0" />
              </linearGradient>
            </defs>
            {/* Viñeta speech bubble */}
            <path
              d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
              fill="url(#hg)"
            />
            {/* Tilde que se dibuja */}
            <path
              d="M15 34 L29 48 L55 18"
              fill="none"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="61"
              strokeDashoffset={badgeVisible ? 0 : 61}
              style={{
                transition: badgeVisible
                  ? 'stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1) 0.3s'
                  : 'none',
              }}
            />
          </svg>
        </div>

        {/* Tagline + fecha */}
        <div style={{
          opacity: taglineVisible ? 1 : 0,
          transform: taglineVisible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          <p style={{
            fontSize: 16,
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
