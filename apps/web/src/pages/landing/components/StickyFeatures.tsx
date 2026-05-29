import { useRef } from 'react'
import { LandingDevice } from './Device'
import { useInView, useStickyActiveIndex } from '../hooks'
import { copy, type AccentTitle } from '../copy'

type Feature = (typeof copy.stickyFeatures.features)[number]

export function StickyFeaturesSection() {
  const ref = useRef<HTMLDivElement | null>(null)
  const c = copy.stickyFeatures
  const activeIdx = useStickyActiveIndex(ref, c.features.length)

  return (
    <section className="sticky-features" id="features">
      <div className="container">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 56,
            gap: 40,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 20 }}>
              {c.eyebrow}
            </div>
            <h2 className="h-section" style={{ maxWidth: 1100 }}>
              {c.headline.line1}
              <br />
              <AccentLine title={c.headline.line2} />
            </h2>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              fontFamily: 'JetBrains Mono',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              paddingBottom: 8,
            }}
          >
            {c.features.map((f, i) => (
              <span
                key={f.num}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: i === activeIdx ? 'var(--ink)' : 'transparent',
                  color: i === activeIdx ? 'white' : 'var(--text-3)',
                  border: i === activeIdx ? '1px solid var(--ink)' : '1px solid var(--line)',
                  transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                {f.num}
              </span>
            ))}
          </div>
        </div>

        <div ref={ref} className="sticky-features-stage">
          <div className="sticky-features-grid">
            <div className="sticky-features-left">
              <div className="sticky-device-wrap">
                <LandingDevice view={c.features[activeIdx].view} />
              </div>
            </div>

            <div className="sticky-features-right">
              {c.features.map((f) => (
                <StickyFeature key={f.num} feature={f} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AccentLine({ title }: { title: AccentTitle }) {
  return (
    <>
      {title.before && <>{title.before} </>}
      <span style={{ color: 'var(--teal-2)', fontStyle: 'italic' }}>{title.accent}</span>
      {title.after && <> {title.after}</>}
    </>
  )
}

function StickyFeature({ feature }: { feature: Feature }) {
  const [ref, inView] = useInView({ threshold: 0.25 })
  return (
    <div ref={ref} className={`sticky-feature in-view-fade-up ${inView ? 'in-view' : ''}`}>
      <div className="sticky-feature-num">
        <strong>{feature.num} /</strong> {feature.eyebrow}
      </div>
      <h3 className="sticky-feature-title">
        {feature.title.before && <>{feature.title.before} </>}
        <em>{feature.title.accent}</em>
        {feature.title.after}
      </h3>
      <p className="sticky-feature-body">{feature.body}</p>
      <ul className="sticky-feature-bullets">
        {feature.bullets.map((b, i) => (
          <li key={i} className="sticky-feature-bullet">
            {b}
          </li>
        ))}
      </ul>
    </div>
  )
}
