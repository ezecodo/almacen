import { useEffect, useState } from 'react'
import { copy } from '../copy'

function useDaysUntil(target: number) {
  const [days, setDays] = useState(() =>
    Math.max(0, Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))),
  )
  useEffect(() => {
    const id = setInterval(() => {
      setDays(Math.max(0, Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24))))
    }, 60_000)
    return () => clearInterval(id)
  }, [target])
  return days
}

export function VerifactuSection() {
  const c = copy.verifactu
  const deadline = new Date(c.deadlineISO).getTime()
  const days = useDaysUntil(deadline)

  return (
    <section className="verifactu">
      <div className="verifactu-grid-bg" aria-hidden />
      <div className="container verifactu-content">
        <div className="verifactu-head">
          <div className="eyebrow eyebrow--light" style={{ marginBottom: 24 }}>
            {c.eyebrow}
          </div>
          <div className="verifactu-chip-row">
            <span className="verifactu-chip">
              <span className="verifactu-chip-dot" />
              {c.chipPrefix}
              <span style={{ color: 'var(--teal)' }}>*</span>
              {c.chipSuffix}
              <span className="verifactu-chip-sep">·</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.chipObligation}</span>
            </span>
            {days > 0 && (
              <span className="verifactu-countdown">
                <span className="verifactu-countdown-num">{days.toLocaleString('es-ES')}</span>
                <span className="verifactu-countdown-label">{c.countdownLabel}</span>
              </span>
            )}
          </div>
          <h2 className="h-section verifactu-title">
            {c.titleLine1Prefix}
            <span style={{ color: 'var(--teal)' }}>*</span>
            {c.titleLine1Suffix}
            <br />
            <span style={{ color: 'var(--teal)', fontStyle: 'italic' }}>{c.titleAccent}</span>
            {c.titleEndDot}
          </h2>
          <p className="verifactu-sub">{c.sub}</p>
        </div>

        <div className="verifactu-body">
          <ul className="verifactu-bullets">
            {c.bullets.map((b) => (
              <li key={b.num}>
                <div className="verifactu-bullet-num">{b.num}</div>
                <div>
                  <h4>{b.title}</h4>
                  <p>{b.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="verifactu-ticket-wrap">
            <VerifactuTicket />
          </div>
        </div>

        <div className="verifactu-foot">
          <span>{c.footLaw}</span>
          <span className="verifactu-foot-status">
            <span className="verifactu-foot-dot" />
            {c.footStatus}
          </span>
        </div>
      </div>
    </section>
  )
}

function VerifactuTicket() {
  const t = copy.verifactu.ticket
  return (
    <div className="verifactu-ticket">
      <div className="verifactu-ticket-head">
        <span className="verifactu-ticket-label">{t.label}</span>
        <span className="verifactu-ticket-time">{t.time}</span>
      </div>
      <div className="verifactu-ticket-rows">
        {t.rows.map((it) => (
          <div key={it.n} className="verifactu-ticket-row">
            <span style={{ width: 22 }}>{it.q}×</span>
            <span style={{ flex: 1 }}>{it.n}</span>
            <span>{it.p}</span>
          </div>
        ))}
      </div>
      <div className="verifactu-ticket-total">
        <span>{t.totalLabel}</span>
        <span className="verifactu-ticket-total-amt">{t.totalAmount}</span>
      </div>

      <div className="verifactu-ticket-divider">
        <span>
          VERI<span style={{ color: 'var(--teal)' }}>*</span>FACTU
        </span>
        <span className="verifactu-ticket-divider-line" />
      </div>

      <div className="verifactu-ticket-hash">
        <div className="verifactu-ticket-hash-row">
          <span className="verifactu-ticket-hash-label">Nº registro</span>
          <span className="verifactu-ticket-hash-val">{t.registry}</span>
        </div>
        <div className="verifactu-ticket-hash-row">
          <span className="verifactu-ticket-hash-label">Hash</span>
          <span className="verifactu-ticket-hash-val">{t.hash}</span>
        </div>
        <div className="verifactu-ticket-hash-row">
          <span className="verifactu-ticket-hash-label">Anterior</span>
          <span className="verifactu-ticket-hash-val">{t.hashPrev}</span>
        </div>
      </div>

      <div className="verifactu-ticket-qr">
        <svg viewBox="0 0 64 64" width="74" height="74" aria-hidden>
          <rect width="64" height="64" fill="white" />
          <rect x="4" y="4" width="14" height="14" fill="none" stroke="#0F172A" strokeWidth="2" />
          <rect x="8" y="8" width="6" height="6" fill="#0F172A" />
          <rect x="46" y="4" width="14" height="14" fill="none" stroke="#0F172A" strokeWidth="2" />
          <rect x="50" y="8" width="6" height="6" fill="#0F172A" />
          <rect x="4" y="46" width="14" height="14" fill="none" stroke="#0F172A" strokeWidth="2" />
          <rect x="8" y="50" width="6" height="6" fill="#0F172A" />
          {[
            [22, 6], [26, 6], [30, 8], [34, 4], [38, 6], [42, 8],
            [22, 12], [28, 14], [32, 12], [36, 14], [40, 12],
            [22, 22], [26, 24], [30, 22], [34, 26], [38, 22], [42, 24], [46, 26], [50, 22], [54, 24],
            [22, 30], [26, 32], [30, 30], [34, 32], [38, 30], [42, 32], [46, 30], [50, 32], [54, 30], [58, 32],
            [22, 40], [26, 42], [30, 40], [34, 42], [38, 40], [42, 42], [46, 40], [50, 42], [54, 40], [58, 42],
            [22, 50], [26, 52], [30, 50], [34, 52], [38, 50], [42, 52], [46, 50], [50, 52], [54, 50], [58, 52],
            [22, 58], [26, 56], [30, 58], [34, 56], [38, 58],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="3" height="3" fill="#0F172A" />
          ))}
        </svg>
        <div className="verifactu-ticket-qr-text">
          <span className="verifactu-ticket-qr-status">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4CC8A0"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t.status}
          </span>
          <span className="verifactu-ticket-qr-url">{t.verifyUrl}</span>
        </div>
      </div>
    </div>
  )
}
