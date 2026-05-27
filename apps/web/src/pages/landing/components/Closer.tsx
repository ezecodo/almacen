import { useMemo, type CSSProperties } from 'react'
import { useInView } from '../hooks'
import { OidoLogoFull } from './Device'
import { copy } from '../copy'

export function CloserSection() {
  const [ref, inView] = useInView({ threshold: 0.4 })
  const c = copy.closer

  return (
    <section className="closer" ref={ref} id="contacto">
      {inView && <Confetti />}
      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        <div className="closer-eyebrow eyebrow">{c.eyebrow}</div>

        <h2 className="h-section closer-headline">
          {c.headlineLine1}
          <br />
          {c.headlineLine2.before} <em>{c.headlineLine2.accent}</em>
          {c.headlineLine2.after}
        </h2>

        <div className="closer-ctas">
          <button className="btn btn--primary btn--lg">
            {c.ctaPrimary}
            <span className="btn-arrow">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </span>
          </button>
          <button className="btn btn--ghost btn--lg">{c.ctaSecondary}</button>
        </div>

        <div className="closer-foot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <OidoLogoFull size={24} />
            <span style={{ color: 'var(--ghost)' }}>·</span>
            <span>
              © {new Date().getFullYear()} OidoOps {c.foot.copyright}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {c.foot.links.map((l) => (
              <span key={l}>{l}</span>
            ))}
            <span style={{ color: 'var(--teal-2)' }}>{c.foot.email}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Confetti() {
  const colors = ['#4CC8A0', '#2A9D7F', '#4B9EDF', '#0F172A', '#D97706']
  const bits = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.4,
        duration: 5 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotate: Math.random() * 180,
        drift: (Math.random() - 0.5) * 120,
        shape: Math.random() > 0.6 ? 'circle' : 'rect',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <div className="closer-confetti">
      {bits.map((b) => (
        <span
          key={b.id}
          className="confetti-bit"
          style={
            {
              left: `${b.left}%`,
              background: b.color,
              borderRadius: b.shape === 'circle' ? '50%' : 2,
              transform: `rotate(${b.rotate}deg)`,
              '--cx': `${b.drift}px`,
              animation: `landingConfettiFall ${b.duration}s linear ${b.delay}s infinite`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
