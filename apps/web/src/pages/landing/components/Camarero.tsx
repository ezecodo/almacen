import type { ReactNode } from 'react'
import { ScaledPhone } from './Device'
import { copy } from '../copy'

export function CamareroSection() {
  const c = copy.camarero
  const phoneThemes: Array<'light' | 'dark' | 'a11y'> = ['light', 'dark', 'a11y']
  return (
    <section className="camarero">
      <div className="container">
        <div className="camarero-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 24 }}>
              {c.eyebrow}
            </div>
            <h2 className="h-section" style={{ maxWidth: 1000 }}>
              {c.headlineLine1}
              <br />
              {c.headlineLine2Parts.map((p, i) => (
                <span key={i}>
                  {p.accent ? (
                    <span style={{ color: 'var(--teal-2)', fontStyle: 'italic' }}>{p.text}</span>
                  ) : (
                    p.text
                  )}
                  {i < c.headlineLine2Parts.length - 1 && !p.text.endsWith('.') ? ' ' : ''}
                </span>
              ))}
            </h2>
            <p className="body-lg" style={{ marginTop: 28, maxWidth: 720 }}>
              {c.body.prefix}{' '}
              <strong style={{ color: 'var(--text)' }}>{c.body.strong}</strong>
              {c.body.suffix}
            </p>
          </div>
        </div>

        <div className="camarero-phones">
          {c.phones.map((p, i) => (
            <CamareroPhoneCard
              key={p.tag}
              label={p.label}
              sub={p.sub}
              tag={p.tag}
              highlight={'highlight' in p && p.highlight}
            >
              <ScaledPhone>
                {phoneThemes[i] === 'a11y' ? (
                  <AccesiblePhone />
                ) : (
                  <PhoneComandaMock theme={phoneThemes[i] as 'light' | 'dark'} />
                )}
              </ScaledPhone>
            </CamareroPhoneCard>
          ))}
        </div>

        <div className="a11y-grid">
          {c.a11yCards.map((it, i) => (
            <div key={i} className="a11y-card">
              <div className="a11y-card-num">{String(i + 1).padStart(2, '0')}</div>
              <h4 className="a11y-card-title">{it.title}</h4>
              <p className="a11y-card-body">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CamareroPhoneCard({
  label,
  sub,
  tag,
  highlight,
  children,
}: {
  label: string
  sub: string
  tag: 'default' | 'dark' | 'a11y'
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <div className={`camarero-card ${highlight ? 'is-highlight' : ''}`}>
      <div className="camarero-card-phone">{children}</div>
      <div className="camarero-card-label">
        <div className="camarero-card-label-row">
          <span className="camarero-card-tag" data-tag={tag}>
            {tag === 'default' && '☀'}
            {tag === 'dark' && '☾'}
            {tag === 'a11y' && 'A+'}
          </span>
          <span className="camarero-card-title">{label}</span>
        </div>
        <span className="camarero-card-sub">{sub}</span>
      </div>
    </div>
  )
}

// ─── Light/Dark phone mock — comanda Mesa 5 ───────────────────────────────
function PhoneComandaMock({ theme }: { theme: 'light' | 'dark' }) {
  const isDark = theme === 'dark'
  const bg = isDark ? '#0F172A' : '#FFFFFF'
  const surface = isDark ? '#1a2238' : '#FFFFFF'
  const text = isDark ? '#FFFFFF' : '#0F172A'
  const subText = isDark ? '#94A3B8' : '#64748B'
  const line = isDark ? '#2a3147' : '#E5E7EB'
  const accentSoft = isDark ? '#0e3a2e' : '#D7F0E5'
  const accent = '#2A9D7F'

  return (
    <div
      style={{
        width: 412,
        height: 892,
        background: bg,
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        color: text,
        overflow: 'hidden',
      }}
    >
      {/* status bar */}
      <div
        style={{
          height: 44,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 14,
          fontWeight: 700,
          color: text,
        }}
      >
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>20:47</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="16" height="11" viewBox="0 0 16 11" fill={text}>
            <rect x="0" y="8" width="3" height="3" />
            <rect x="4" y="5" width="3" height="6" />
            <rect x="8" y="2" width="3" height="9" />
            <rect x="12" y="0" width="3" height="11" />
          </svg>
        </div>
      </div>

      {/* header */}
      <div
        style={{
          padding: '16px 22px 16px',
          borderBottom: `1px solid ${line}`,
          background: surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <button
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: isDark ? '#1a2238' : '#F1F5F9',
              border: `1.5px solid ${line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={text}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div
            style={{
              width: 70,
              height: 64,
              borderRadius: 12,
              background: accentSoft,
              border: `2px solid ${accent}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontWeight: 900,
                fontSize: 32,
                letterSpacing: '-0.04em',
                color: accent,
                lineHeight: 0.9,
              }}
            >
              5
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: accent,
                letterSpacing: '0.12em',
                marginTop: 2,
              }}
            >
              MESA
            </span>
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            background: accentSoft,
            border: `1.5px solid ${accent}`,
            borderRadius: 999,
            marginBottom: 10,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>En cocina</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            fontWeight: 700,
            color: text,
          }}
        >
          <span>4 pax</span>
          <span style={{ color: subText }}>·</span>
          <span style={{ color: '#D97706' }}>32 min</span>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, padding: '16px 22px', overflow: 'hidden' }}>
        <div
          style={{
            background: isDark ? 'rgba(217, 119, 6, 0.12)' : '#FEF3C7',
            border: '2px solid #D97706',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '2px solid #D97706',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: '#D97706',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Marcha pasa
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: '#D97706',
                fontFamily: 'JetBrains Mono',
              }}
            >
              3
            </span>
          </div>
          {[
            { c: 2, n: 'Tarta de queso' },
            { c: 3, n: 'Café cortado' },
          ].map((it) => (
            <div
              key={it.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                minHeight: 56,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: '#D97706',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 17,
                  letterSpacing: '-0.03em',
                  flexShrink: 0,
                }}
              >
                {it.c}×
              </div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: text }}>{it.n}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: subText,
            letterSpacing: '0.16em',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          Cocina · Salida 2
        </div>
        {[
          { c: 2, n: 'Croquetas jamón' },
          { c: 1, n: 'Patatas bravas' },
        ].map((it) => (
          <div
            key={it.n}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 4px',
              borderBottom: `1px solid ${line}`,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: accent,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 17,
                letterSpacing: '-0.03em',
                flexShrink: 0,
              }}
            >
              {it.c}×
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: text }}>{it.n}</span>
          </div>
        ))}
      </div>

      {/* footer */}
      <div
        style={{
          padding: '14px 22px 22px',
          borderTop: `1px solid ${line}`,
          background: surface,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: subText,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Total
          </span>
          <span
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: text,
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            128,60 €
          </span>
        </div>
        <button
          style={{
            width: '100%',
            minHeight: 64,
            borderRadius: 14,
            background: accent,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontWeight: 900,
            fontSize: 17,
            boxShadow: '0 8px 24px rgba(42, 157, 127, 0.35)',
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          Enviar a cocina
        </button>
      </div>
    </div>
  )
}

// ─── A11y phone — huge type variant ───────────────────────────────────────
function AccesiblePhone() {
  return (
    <div
      style={{
        width: 412,
        height: 892,
        background: '#FFFFFF',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 50,
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 17,
          fontWeight: 700,
          color: '#0F172A',
        }}
      >
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>20:47</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <svg width="20" height="14" viewBox="0 0 16 11" fill="#0F172A">
            <rect x="0" y="8" width="3" height="3" />
            <rect x="4" y="5" width="3" height="6" />
            <rect x="8" y="2" width="3" height="9" />
            <rect x="12" y="0" width="3" height="11" />
          </svg>
          <svg width="26" height="13" viewBox="0 0 22 11" fill="none">
            <rect x="0.5" y="0.5" width="19" height="10" rx="2" stroke="#0F172A" />
            <rect x="20.5" y="3.5" width="1.5" height="4" fill="#0F172A" />
            <rect x="2" y="2" width="13" height="7" fill="#0F172A" />
          </svg>
        </div>
      </div>

      <div style={{ padding: '18px 24px 16px', borderBottom: '3px solid #0F172A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <button
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#F1F5F9',
              border: '2.5px solid #0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0F172A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div
            style={{
              width: 88,
              height: 76,
              padding: '0 14px',
              borderRadius: 14,
              background: '#D7F0E5',
              border: '3px solid #2A9D7F',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontWeight: 900,
                fontSize: 44,
                letterSpacing: '-0.04em',
                color: '#1f8068',
                lineHeight: 0.9,
              }}
            >
              5
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#1f8068',
                letterSpacing: '0.12em',
              }}
            >
              MESA
            </span>
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: '#D7F0E5',
            border: '2.5px solid #2A9D7F',
            borderRadius: 999,
            marginBottom: 14,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#2A9D7F' }} />
          <span style={{ fontSize: 17, fontWeight: 800, color: '#1f8068' }}>En cocina</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 18,
            fontWeight: 700,
            color: '#0F172A',
          }}
        >
          <span>4 pax</span>
          <span style={{ color: '#94A3B8' }}>·</span>
          <span style={{ color: '#D97706' }}>32 min</span>
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 24px', overflow: 'hidden' }}>
        <div
          style={{
            background: '#FEF3C7',
            border: '3px solid #D97706',
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '2.5px solid #D97706',
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: '#92400e',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Marcha pasa
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: '#92400e',
                fontFamily: 'JetBrains Mono',
              }}
            >
              3
            </span>
          </div>
          {[
            { c: 2, n: 'Tarta de queso' },
            { c: 3, n: 'Café cortado' },
          ].map((it) => (
            <div
              key={it.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '14px 18px',
                minHeight: 76,
                borderBottom: '1.5px solid rgba(146, 64, 14, 0.2)',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: '#D97706',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 24,
                  letterSpacing: '-0.03em',
                }}
              >
                {it.c}×
              </div>
              <span style={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#0F172A' }}>{it.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 24px 28px', borderTop: '3px solid #0F172A' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#0F172A',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Total
          </span>
          <span
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: '#0F172A',
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            128,60 €
          </span>
        </div>
        <button
          style={{
            width: '100%',
            minHeight: 84,
            padding: '0 24px',
            borderRadius: 16,
            background: '#2A9D7F',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontWeight: 900,
            fontSize: 22,
            boxShadow: '0 8px 24px rgba(42, 157, 127, 0.35)',
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          Enviar a cocina
        </button>
      </div>
    </div>
  )
}
