import { Fragment } from 'react'
import { useCounter, useInView } from '../hooks'
import { copy } from '../copy'

export function StatsSection() {
  const [ref, inView] = useInView({ threshold: 0.3 })
  const c = copy.stats

  return (
    <section className="stats" ref={ref} id="clientes">
      <div className="container stats-content">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 32,
          }}
        >
          <div>
            <div className="eyebrow eyebrow--light" style={{ marginBottom: 28 }}>
              {c.eyebrow}
            </div>
            <h2 className="h-section" style={{ color: 'white', maxWidth: 920 }}>
              {c.headlineParts.map((p, i) => (
                <Fragment key={i}>
                  {p.accent ? (
                    <span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>{p.text}</span>
                  ) : (
                    p.text
                  )}
                  {p.break && <br />}
                  {!p.break && i < c.headlineParts.length - 1 && !p.text.endsWith('.') ? ' ' : ''}
                </Fragment>
              ))}
            </h2>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              fontFamily: 'JetBrains Mono',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.06em',
              textAlign: 'right',
            }}
          >
            <span>{c.aggregatedLabel}</span>
            <span>{c.aggregatedValue}</span>
          </div>
        </div>

        <div className="stats-grid">
          {c.cards.map((s, i) => (
            <StatCard key={i} {...s} trigger={inView} />
          ))}
        </div>

        <div
          style={{
            marginTop: 84,
            paddingTop: 36,
            borderTop: '1px solid rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 24,
          }}
        >
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {c.trustStripLabel}
          </span>
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'baseline' }}>
            {c.trustStripItems.map((r) => (
              <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    fontFamily: 'Inter',
                    fontSize: 24,
                    fontWeight: 800,
                    color: 'white',
                    letterSpacing: '-0.025em',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {r.count}
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {r.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function StatCard({
  number,
  decimals = 0,
  prefix = '',
  suffix = '',
  label,
  meta,
  trigger,
}: {
  number: number
  decimals?: number
  prefix?: string
  suffix?: string
  label: string
  meta: string
  trigger: boolean
}) {
  const animated = useCounter(number, 1800, trigger)
  const display = decimals ? animated.toFixed(decimals) : Math.round(animated).toString()

  return (
    <div className="stat-card">
      <div className="stat-number">
        {prefix}
        {display}
        <span className="stat-suffix">{suffix}</span>
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-meta">{meta}</div>
    </div>
  )
}
