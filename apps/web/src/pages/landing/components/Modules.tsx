import type { ReactNode } from 'react'
import { useInView, useCounter } from '../hooks'
import { copy } from '../copy'

const VISUALS: Record<string, ReactNode> = {
  sala: <ModuleVisualSala />,
  cocina: <ModuleVisualCocina />,
  planning: <ModuleVisualPlanning />,
  inventario: <ModuleVisualInventario />,
  reviews: <ModuleVisualReviews />,
  caja: <ModuleVisualCaja />,
}

export function ModulesSection() {
  const c = copy.modules
  return (
    <section className="modules" id="producto">
      <div className="container">
        <div className="modules-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 24 }}>
              {c.eyebrow}
            </div>
            <h2 className="h-section" style={{ maxWidth: 1100 }}>
              {c.headlineLine1}
              <br />
              <span style={{ color: 'var(--teal-2)', fontStyle: 'italic' }}>
                {c.headlineLine2.accent}
              </span>{' '}
              {c.headlineLine2.after}
            </h2>
          </div>
          <p className="body-lg" style={{ maxWidth: 480, marginTop: 24 }}>
            {c.body}
          </p>
        </div>

        <div className="modules-grid">
          {c.cards.map((card) => (
            <ModuleCard
              key={card.num}
              num={card.num}
              tag={card.tag}
              title={card.title}
              body={card.body}
              visual={VISUALS[card.visual]}
              big={'big' in card && card.big}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ModuleCard({
  num,
  tag,
  title,
  body,
  visual,
  big,
}: {
  num: string
  tag: string
  title: string
  body: string
  visual: ReactNode
  big?: boolean
}) {
  return (
    <div className={`module-card ${big ? 'module-card--big' : ''}`}>
      <div className="module-card-meta">
        <span className="module-card-num">{num}</span>
        <span className="module-card-tag">{tag}</span>
      </div>
      <h3 className="module-card-title">{title}</h3>
      <p className="module-card-body">{body}</p>
      <div className="module-card-visual">{visual}</div>
    </div>
  )
}

function ModuleVisualSala() {
  type SalaTile = { s: 'libre' | 'enviada' | 'abierta' | 'facturada'; t?: string }
  const tiles: SalaTile[] = [
    { s: 'libre' },
    { s: 'enviada', t: '18m' },
    { s: 'libre' },
    { s: 'abierta', t: '3m' },
    { s: 'enviada', t: '32m' },
    { s: 'libre' },
    { s: 'enviada', t: '47m' },
    { s: 'facturada', t: '1h' },
    { s: 'libre' },
  ]
  const colors = {
    libre: '#cbd5e1',
    abierta: '#3b82f6',
    enviada: '#2A9D7F',
    facturada: '#D97706',
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: 16,
        background: '#F6F7F9',
        borderRadius: 12,
        height: '100%',
        backgroundImage:
          'linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      {tiles.map((t, i) => (
        <div
          key={i}
          style={{
            aspectRatio: '1',
            borderRadius: 8,
            background: t.s === 'libre' ? 'white' : `${colors[t.s]}1F`,
            border: `2px solid ${colors[t.s]}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'Inter',
              fontWeight: 800,
              fontSize: 22,
              color: t.s === 'libre' ? '#64748B' : colors[t.s],
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {i + 1}
          </span>
          {t.t && (
            <span
              style={{
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                fontWeight: 700,
                color: colors[t.s],
                marginTop: 2,
              }}
            >
              {t.t}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ModuleVisualCocina() {
  return (
    <div
      style={{
        padding: 14,
        background: '#0F172A',
        borderRadius: 12,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {[
        { m: 5, t: '4:22', items: ['2× Croquetas', '1× Bravas'], urg: false },
        { m: 7, t: '11:08', items: ['1× Tartare', '2× Burrata'], urg: true },
      ].map((tk) => (
        <div
          key={tk.m}
          style={{
            background: '#1a2238',
            borderRadius: 8,
            padding: 12,
            border: `1.5px solid ${tk.urg ? '#D97706' : '#2a3147'}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {tk.urg && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: '#D97706',
              }}
            />
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontFamily: 'Inter',
                fontWeight: 800,
                fontSize: 18,
                color: 'white',
                letterSpacing: '-0.025em',
              }}
            >
              Mesa {tk.m}
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono',
                fontSize: 12,
                fontWeight: 700,
                color: tk.urg ? '#D97706' : '#4CC8A0',
              }}
            >
              {tk.t}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tk.items.map((it, i) => (
              <span
                key={i}
                style={{ fontFamily: 'Inter', fontSize: 12, color: '#CBD5E1', fontWeight: 500 }}
              >
                {it}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ModuleVisualPlanning() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const staff = [
    { name: 'Lucía', shifts: [1, 1, 0, 1, 1, 1, 0] },
    { name: 'Marc', shifts: [0, 1, 1, 1, 1, 0, 1] },
    { name: 'Sofía', shifts: [1, 0, 1, 1, 0, 1, 1] },
    { name: 'Diego', shifts: [1, 1, 1, 0, 1, 1, 0] },
  ]
  return (
    <div
      style={{
        padding: 14,
        background: 'white',
        borderRadius: 12,
        height: '100%',
        border: '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '54px repeat(7, 1fr)',
          gap: 5,
          marginBottom: 8,
        }}
      >
        <div />
        {days.map((d, i) => (
          <span
            key={i}
            style={{
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: i >= 5 ? '#D97706' : '#94A3B8',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {d}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {staff.map((p) => (
          <div
            key={p.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '54px repeat(7, 1fr)',
              gap: 5,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#475569',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              {p.name}
            </span>
            {p.shifts.map((s, i) => (
              <div
                key={i}
                style={{
                  height: 20,
                  borderRadius: 4,
                  background: s ? (i >= 5 ? '#D97706' : '#2A9D7F') : '#F1F5F9',
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          padding: '8px 10px',
          background: '#F1F5F9',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'JetBrains Mono',
          fontSize: 11,
          fontWeight: 700,
          color: '#475569',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A' }} />
        Cobertura semanal: 94%
      </div>
    </div>
  )
}

function ModuleVisualInventario() {
  const items = [
    { name: 'Aceite oliva 5L', stock: 6, min: 4, ok: true },
    { name: 'Jamón ibérico', stock: 2, min: 3, ok: false },
    { name: 'Albariño caja', stock: 8, min: 5, ok: true },
    { name: 'Café grano kg', stock: 1, min: 2, ok: false },
  ]
  return (
    <div
      style={{
        padding: 14,
        background: 'white',
        borderRadius: 12,
        height: '100%',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {items.map((it) => (
        <div
          key={it.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: it.ok ? '#F8FAFC' : '#FEF3C7',
            borderRadius: 8,
            border: `1px solid ${it.ok ? '#e5e7eb' : '#D97706'}`,
          }}
        >
          <div
            style={{
              width: 6,
              height: 32,
              borderRadius: 2,
              background: it.ok ? '#16A34A' : '#D97706',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{it.name}</div>
            <div
              style={{
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                fontWeight: 600,
                color: it.ok ? '#475569' : '#92400e',
                marginTop: 2,
              }}
            >
              {it.stock} / min {it.min} {it.ok ? '· OK' : '· REPONER'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ModuleVisualReviews() {
  const [ref, inView] = useInView({ threshold: 0.3 })
  const rating = useCounter(4.7, 1600, inView)
  const count = useCounter(1247, 1800, inView)
  const weekly = useCounter(23, 1400, inView)

  const dist = [
    { stars: 5, pct: 78 },
    { stars: 4, pct: 14 },
    { stars: 3, pct: 5 },
    { stars: 2, pct: 2 },
    { stars: 1, pct: 1 },
  ]

  return (
    <div
      ref={ref}
      style={{
        padding: 16,
        background: 'white',
        borderRadius: 12,
        height: '100%',
        border: '1px solid #e5e7eb',
        display: 'flex',
        gap: 16,
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 120,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span
            style={{
              fontFamily: 'Inter',
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              color: '#0F172A',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rating.toFixed(1)}
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#F59E0B">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 1, marginTop: 4 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <svg
              key={i}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={i <= Math.round(rating) ? '#F59E0B' : '#E5E7EB'}
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </div>
        <div
          style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 11,
            color: '#475569',
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          {Math.round(count).toLocaleString('es-ES')} reseñas
        </div>
        <div
          style={{
            marginTop: 10,
            padding: '6px 10px',
            background: '#D7F0E5',
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            width: 'fit-content',
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1f8068"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17l5-5 5 5M7 7l5 5 5-5" />
          </svg>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#1f8068',
              fontFamily: 'JetBrains Mono',
            }}
          >
            +{Math.round(weekly)} esta semana
          </span>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          justifyContent: 'center',
          minWidth: 0,
        }}
      >
        {dist.map((d) => (
          <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                fontWeight: 700,
                color: '#64748B',
                width: 14,
              }}
            >
              {d.stars}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#F59E0B">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <div
              style={{
                flex: 1,
                height: 7,
                background: '#F1F5F9',
                borderRadius: 99,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${inView ? d.pct : 0}%`,
                  height: '100%',
                  background: d.stars >= 4 ? '#2A9D7F' : d.stars === 3 ? '#F59E0B' : '#DC2626',
                  transition: 'width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  transitionDelay: `${(5 - d.stars) * 0.1}s`,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                fontWeight: 600,
                color: '#94A3B8',
                width: 28,
                textAlign: 'right',
              }}
            >
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModuleVisualCaja() {
  return (
    <div
      style={{
        padding: 14,
        background: 'white',
        borderRadius: 12,
        height: '100%',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          background: '#0F172A',
          color: 'white',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Turno cierre · 23:42
        </span>
        <span
          style={{
            fontFamily: 'Inter',
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '-0.03em',
          }}
        >
          2.847,30 €
        </span>
      </div>
      {[
        { l: 'Tarjeta', v: '1.964,20 €', pct: 69 },
        { l: 'Efectivo', v: '624,80 €', pct: 22 },
        { l: 'Propinas', v: '258,30 €', pct: 9 },
      ].map((r) => (
        <div key={r.l} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', width: 70 }}>{r.l}</span>
          <div
            style={{
              flex: 1,
              height: 7,
              background: '#F1F5F9',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${r.pct}%`, height: '100%', background: '#2A9D7F' }} />
          </div>
          <span
            style={{
              fontFamily: 'JetBrains Mono',
              fontSize: 11,
              fontWeight: 700,
              color: '#0F172A',
            }}
          >
            {r.v}
          </span>
        </div>
      ))}
      <button
        style={{
          marginTop: 4,
          height: 32,
          padding: '0 12px',
          borderRadius: 8,
          background: '#F1F5F9',
          border: '1px solid #e5e7eb',
          fontSize: 11,
          fontWeight: 700,
          color: '#0F172A',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0F172A"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
        Exportar a contable
      </button>
    </div>
  )
}
