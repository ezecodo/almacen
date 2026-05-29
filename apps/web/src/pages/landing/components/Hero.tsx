import { Fragment } from 'react'
import { LandingDevice, LogoIntro } from './Device'
import { PairRotor } from './Reveal'
import { copy } from '../copy'

export function HeroSection() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const c = copy.hero

  return (
    <section className="hero">
      <div className="hero-bg-blob" />

      <div className="container hero-content">
        <div className="hero-meta">
          <span className="hero-meta-cell">{c.meta.left}</span>
          <span style={{ display: 'flex', gap: 28 }}>
            <span>{c.meta.cities}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {hh}:{mm} CET
            </span>
          </span>
        </div>

        <div className="hero-brand" style={{ marginBottom: 28 }}>
          <LogoIntro size={132} />
        </div>

        <h1 className="h-display hero-headline">
          <PairRotor
            pairs={c.pairs}
            intervalMs={c.rotorIntervalMs}
            startDelay={c.rotorStartDelayMs}
          />
        </h1>

        <div className="hero-bottom">
          <div className="hero-left in-view-fade-up in-view">
            <p className="hero-sub">
              {c.subtitle.split('\n').map((line, i, arr) => (
                <Fragment key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </Fragment>
              ))}
            </p>
            <div className="hero-ctas">
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
            <div className="hero-mini">
              <span className="hero-mini-dot" />
              {c.miniDisclaimer}
            </div>
          </div>

          <HeroDevicePeek />
        </div>
      </div>
    </section>
  )
}

function HeroDevicePeek() {
  const chips = copy.hero.chips
  return (
    <div className="hero-device-peek">
      <div
        className="hero-chip hero-chip--topRight"
        style={{ animation: 'landingDrift1 5s ease-in-out infinite' }}
      >
        <span className="hero-chip-dot" style={{ background: '#D97706' }} />
        <span>{chips.topRight.text}</span>
        <span
          style={{
            padding: '2px 7px',
            borderRadius: 999,
            background: '#FEF3C7',
            color: '#92400e',
            fontFamily: 'JetBrains Mono',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {chips.topRight.badge}
        </span>
      </div>

      <div
        className="hero-chip hero-chip--midLeft"
        style={{ animation: 'landingDrift2 7s ease-in-out infinite' }}
      >
        <span className="hero-chip-dot pulse-dot" style={{ background: '#2A9D7F' }} />
        <span>{chips.midLeft.text}</span>
      </div>

      <div
        className="hero-chip hero-chip--bottomRight"
        style={{
          animation: 'landingDrift1 6s ease-in-out infinite',
          animationDelay: '0.5s',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0F172A"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <span>
          {chips.bottomRight.textBefore} <strong style={{ color: '#2A9D7F' }}>{chips.bottomRight.accent}</strong>
        </span>
      </div>

      <div className="hero-device-wrap">
        <LandingDevice view="comanda" />
      </div>
    </div>
  )
}
