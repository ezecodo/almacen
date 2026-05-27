import type { CSSProperties, ReactNode } from 'react'

export function OidoLogoFull({ size = 32, color }: { size?: number; color?: string }) {
  const gradId = `oid-grad-${size}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <svg width={size} height={size * 1.08} viewBox="0 0 68 72">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4B9EDF" />
            <stop offset="100%" stopColor="#4CC8A0" />
          </linearGradient>
        </defs>
        <path
          d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
          fill={`url(#${gradId})`}
        />
        <path
          d="M15 34 L29 48 L55 18"
          fill="none"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          fontFamily: 'Inter',
          fontWeight: 800,
          fontSize: size * 0.7,
          letterSpacing: '-0.025em',
          color: color || '#0F172A',
        }}
      >
        Oido<span style={{ color: '#2A9D7F' }}>Ops</span>
      </span>
    </div>
  )
}

let logoIntroSeq = 0

export function LogoIntro({ size = 120 }: { size?: number }) {
  // Stable per-render ID — random would re-mount on re-render
  const gid = `li-${++logoIntroSeq}`

  return (
    <div className="logo-intro">
      <svg
        viewBox="0 0 300 70"
        height={size}
        width={size * (300 / 70)}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`${gid}-grad`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4B9EDF" />
            <stop offset="100%" stopColor="#4CC8A0" />
          </linearGradient>
          <clipPath id={`${gid}-rise`}>
            <rect x="-2" y="72" width="72" height="74">
              <animate
                attributeName="y"
                from="72"
                to="-2"
                dur="1.4s"
                begin="0.6s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.3 0.6 0.3 1"
              />
            </rect>
          </clipPath>
        </defs>

        <path
          pathLength="100"
          d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
          fill="none"
          stroke={`url(#${gid}-grad)`}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="100"
            to="0"
            dur="0.95s"
            begin="0.05s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.4 0 0.2 1"
          />
        </path>

        <path
          d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
          fill={`url(#${gid}-grad)`}
          clipPath={`url(#${gid}-rise)`}
        />

        <path
          pathLength="100"
          d="M15 34 L29 48 L55 18"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray="100"
          strokeDashoffset="100"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="100"
            to="0"
            dur="0.7s"
            begin="1.7s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.2 0.8 0.2 1"
          />
        </path>

        <text
          x="80"
          y="51"
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="900"
          fontSize="44"
          letterSpacing="-1.2"
          opacity="0"
        >
          <tspan fill="#0F172A">Oido</tspan>
          <tspan fill="#2A9D7F">Ops</tspan>
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.6s"
            begin="2.1s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.4 0 0.2 1"
          />
        </text>
      </svg>
    </div>
  )
}

export function LandingLogoMini() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width="14" height="14" viewBox="0 0 68 72">
        <defs>
          <linearGradient id="oid-mini-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4B9EDF" />
            <stop offset="100%" stopColor="#4CC8A0" />
          </linearGradient>
        </defs>
        <path
          d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
          fill="url(#oid-mini-grad)"
        />
        <path
          d="M15 34 L29 48 L55 18"
          fill="none"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          fontFamily: 'Inter',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '-0.02em',
          color: '#0F172A',
        }}
      >
        Oido<span style={{ color: '#2A9D7F' }}>Ops</span>
      </span>
    </div>
  )
}

type DeviceView = 'mapa' | 'comanda' | 'cocina'

export function LandingDevice({ view = 'mapa', scale = 1 }: { view?: DeviceView; scale?: number }) {
  const DEVICE_W = 760
  const DEVICE_H = 500

  return (
    <div
      style={{
        width: DEVICE_W,
        height: DEVICE_H,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        background: '#0F172A',
        borderRadius: 24,
        padding: 10,
        boxShadow: '0 40px 80px -20px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.08)',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 16,
          background: '#F6F7F9',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {view === 'mapa' && <MiniMapa />}
        {view === 'comanda' && <MiniComanda />}
        {view === 'cocina' && <MiniCocina />}
      </div>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 4,
          transform: 'translateY(-50%)',
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: '#475569',
        }}
      />
    </div>
  )
}

function MiniHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        height: 40,
        padding: '0 14px',
        background: 'white',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LandingLogoMini />
        <div style={{ width: 1, height: 18, background: '#e5e7eb' }} />
        <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 9,
            color: '#64748B',
            fontWeight: 600,
          }}
        >
          Servicio · 20:47
        </span>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#2A9D7F',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: 9,
          }}
        >
          LG
        </div>
      </div>
    </div>
  )
}

function MiniTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      style={{
        height: 22,
        padding: '0 10px',
        background: active ? 'white' : 'transparent',
        color: active ? '#0F172A' : '#64748B',
        border: `1px solid ${active ? '#e5e7eb' : 'transparent'}`,
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'Inter',
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  )
}

type MesaStatus = 'libre' | 'abierta' | 'enviada' | 'facturada'
function MiniMesa({ n, s, t, selected }: { n: number; s: MesaStatus; t?: string; selected?: boolean }) {
  const colors: Record<MesaStatus, { bg: string; border: string; text: string }> = {
    libre: { bg: 'white', border: '#cbd5e1', text: '#64748B' },
    abierta: { bg: '#EBF5FF', border: '#3b82f6', text: '#3b82f6' },
    enviada: { bg: '#D7F0E5', border: '#2A9D7F', text: '#2A9D7F' },
    facturada: { bg: '#FEF3C7', border: '#D97706', text: '#D97706' },
  }
  const c = colors[s]
  return (
    <div
      style={{
        aspectRatio: '1',
        borderRadius: 6,
        background: c.bg,
        border: `1.5px solid ${c.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: selected ? 'scale(1.08)' : 'scale(1)',
        boxShadow: selected ? `0 0 0 2px ${c.border}` : 'none',
        position: 'relative',
      }}
    >
      <span
        style={{
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: c.text,
        }}
      >
        {n}
      </span>
      {t && (
        <span
          style={{
            fontFamily: 'JetBrains Mono',
            fontSize: 8,
            fontWeight: 700,
            color: c.text,
            opacity: 0.7,
          }}
        >
          {t}
        </span>
      )}
    </div>
  )
}

function MiniMapa() {
  const mesas: Array<{ n: number; s: MesaStatus; t?: string; selected?: boolean }> = [
    { n: 1, s: 'libre' },
    { n: 2, s: 'enviada', t: '18m' },
    { n: 3, s: 'libre' },
    { n: 4, s: 'abierta', t: '3m' },
    { n: 5, s: 'enviada', t: '32m', selected: true },
    { n: 6, s: 'libre' },
    { n: 7, s: 'enviada', t: '47m' },
    { n: 8, s: 'facturada', t: '1h' },
    { n: 9, s: 'libre' },
    { n: 10, s: 'libre' },
    { n: 11, s: 'enviada', t: '12m' },
    { n: 12, s: 'libre' },
    { n: 13, s: 'enviada', t: '25m' },
    { n: 14, s: 'libre' },
    { n: 15, s: 'libre' },
  ]
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MiniHeader title="Mapa de sala" />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#f6f7f9',
            backgroundImage:
              'linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <MiniTab label="Salón" active />
            <MiniTab label="Terraza" />
            <MiniTab label="Barra" />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 8,
              marginTop: 16,
            }}
          >
            {mesas.map((m) => (
              <MiniMesa key={m.n} {...m} />
            ))}
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 14,
              right: 14,
              display: 'flex',
              gap: 6,
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 4,
            }}
          >
            {[
              { l: 'Libres', n: 8, c: '#16A34A' },
              { l: 'Esperando', n: 1, c: '#3b82f6' },
              { l: 'Cocina', n: 5, c: '#2A9D7F' },
              { l: 'Cuenta', n: 1, c: '#D97706' },
            ].map((it) => (
              <div
                key={it.l}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: it.c }} />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#475569',
                    letterSpacing: '0.02em',
                  }}
                >
                  {it.l}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'Inter',
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#0F172A',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  {it.n}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniRow({
  count,
  name,
  price,
  pending,
}: {
  count: number
  name: string
  price: string
  pending?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: pending ? '#D97706' : '#2A9D7F',
          color: 'white',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter',
          fontWeight: 800,
          fontSize: 10,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {count}×
      </div>
      <span
        style={{
          flex: 1,
          fontFamily: 'Inter',
          fontSize: 10,
          fontWeight: 600,
          color: '#0F172A',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: 'JetBrains Mono',
          fontSize: 9,
          fontWeight: 700,
          color: '#475569',
        }}
      >
        {price}
      </span>
    </div>
  )
}

function MiniComanda() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MiniHeader title="Mesa 5 · Comanda" />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: '#D7F0E5',
                border: '1.5px solid #2A9D7F',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'Inter',
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: '#2A9D7F',
                  lineHeight: 0.9,
                }}
              >
                5
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono',
                  fontSize: 7,
                  fontWeight: 700,
                  color: '#2A9D7F',
                  letterSpacing: '0.12em',
                  marginTop: 1,
                }}
              >
                MESA
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: '#D7F0E5',
                  marginBottom: 4,
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A9D7F' }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: '#2A9D7F' }}>En cocina</span>
              </div>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>
                4 pax · abierta 32m
              </div>
            </div>
            <button
              style={{
                height: 28,
                padding: '0 12px',
                borderRadius: 999,
                background: '#2A9D7F',
                color: 'white',
                border: 'none',
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              Enviar
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', padding: '10px 14px' }}>
            <div
              style={{
                background: '#FEF3C7',
                border: '2px solid #D97706',
                borderLeft: '5px solid #D97706',
                borderRadius: 8,
                padding: 6,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#D97706',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Inter',
                    fontWeight: 800,
                    fontSize: 10,
                  }}
                >
                  +
                </div>
                <span
                  style={{
                    fontFamily: 'Inter',
                    fontWeight: 800,
                    fontSize: 9,
                    color: '#92400e',
                    letterSpacing: '0.1em',
                  }}
                >
                  MARCHA PASA
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#92400e',
                  }}
                >
                  3 items
                </span>
              </div>
              <MiniRow count={2} name="Tarta de queso" price="13.00 €" pending />
              <MiniRow count={3} name="Café cortado" price="5.40 €" pending />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontFamily: 'Inter',
                  fontWeight: 800,
                  fontSize: 8,
                  color: '#64748B',
                  letterSpacing: '0.16em',
                  marginBottom: 4,
                }}
              >
                COCINA · SALIDA 2
              </div>
              <MiniRow count={2} name="Croquetas jamón" price="17.00 €" />
              <MiniRow count={1} name="Patatas bravas" price="7.00 €" />
            </div>
          </div>
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'white',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 8,
                  color: '#64748B',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Total
              </div>
            </div>
            <span
              style={{
                fontFamily: 'Inter',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                color: '#0F172A',
              }}
            >
              128.60 €
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniCocina() {
  const tickets: Array<{ mesa: number; urg: 'ok' | 'warn'; tiempo: string; items: string[] }> = [
    {
      mesa: 5,
      urg: 'ok',
      tiempo: '4:22',
      items: ['2× Croquetas jamón', '1× Patatas bravas', '1× Pulpo brasa'],
    },
    {
      mesa: 7,
      urg: 'warn',
      tiempo: '11:08',
      items: ['1× Tartare atún', '2× Burrata', '4× Pan tomate'],
    },
    {
      mesa: 11,
      urg: 'ok',
      tiempo: '2:14',
      items: ['1× Tortilla esp.', '2× Cerveza', '1× Vermut'],
    },
  ]
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0F172A',
        color: 'white',
      }}
    >
      <div
        style={{
          height: 40,
          padding: '0 14px',
          background: '#0F172A',
          borderBottom: '1px solid #2a3147',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: 'white' }}>
          Cocina · KDS
        </span>
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            fontFamily: 'JetBrains Mono',
            fontSize: 9,
            color: '#94A3B8',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4CC8A0' }} />
          5 tickets · en cola
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {tickets.map((t) => (
          <div
            key={t.mesa}
            style={{
              background: '#1a2238',
              border: `1.5px solid ${t.urg === 'warn' ? '#D97706' : '#2a3147'}`,
              borderRadius: 8,
              padding: 10,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {t.urg === 'warn' && (
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
                  letterSpacing: '-0.03em',
                }}
              >
                Mesa {t.mesa}
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10,
                  fontWeight: 700,
                  color: t.urg === 'warn' ? '#D97706' : '#4CC8A0',
                }}
              >
                {t.tiempo}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {t.items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: 'Inter',
                    fontSize: 11,
                    color: '#CBD5E1',
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}
                >
                  {it}
                </div>
              ))}
            </div>
            <button
              style={{
                marginTop: 10,
                width: '100%',
                height: 26,
                background: '#4CC8A0',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontFamily: 'Inter',
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '-0.005em',
              }}
            >
              Listo
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ScaledPhone({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="scaled-phone" style={style}>
      <div className="scaled-phone-inner">{children}</div>
    </div>
  )
}
