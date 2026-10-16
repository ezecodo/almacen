// Botón redondo con una copa de vino: abre el asistente de vinos (MaridajeSheet).
// `invita` = la mesa todavía no tiene botella → un halo suave late alrededor para recordarlo.

export function CopaVino({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* vino */}
      <path d="M7.2 8.5h9.6c-.2 3-2.2 5.2-4.8 5.2s-4.6-2.2-4.8-5.2Z" fill="#fff" fillOpacity=".9" />
      {/* copa */}
      <path d="M7 3h10l.3 4.6c.3 3.7-2.2 6.6-5.3 6.6s-5.6-2.9-5.3-6.6L7 3Z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 14.2V20M8.5 21h7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function BotonVino({ onClick, invita = false, titulo = '¿Qué vino?' }: {
  onClick: () => void
  invita?: boolean
  titulo?: string
}) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} title={titulo} aria-label={titulo}
      className="relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center active:scale-90 transition-transform"
      style={{ background: 'linear-gradient(135deg, #9B2C4E, #5E1230)', boxShadow: '0 4px 14px rgba(155,44,78,.45)' }}>
      {invita && <span className="absolute inset-0 rounded-full animate-ping bg-[#9B2C4E]/40" />}
      <CopaVino className="relative w-6 h-6" />
    </button>
  )
}
