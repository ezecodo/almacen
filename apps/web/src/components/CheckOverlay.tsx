// Overlay de confirmación animado — viñeta OidoOps con tilde que se dibuja.
// Uso: renderizar condicionalmente. El padre gestiona visibilidad y tiempo.
//
//   const [show, setShow] = useState(false)
//   const showCheck = () => { setShow(true); setTimeout(() => setShow(false), 2000) }
//   {show && <CheckOverlay />}

export default function CheckOverlay() {
  return (
    <div
      className="fixed inset-0 z-[60] bg-[#0a1628]/90 flex flex-col items-center justify-center gap-5"
      style={{ animation: "checkOverlayFade 2s ease forwards" }}
    >
      <svg
        width="160"
        height="172"
        
        viewBox="0 0 68 72"
        style={{
          animation:
            "checkBadgeIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
          filter: "drop-shadow(0 0 24px #4CC8A088)",
        }}
      >
        y
        <defs>
          <linearGradient id="og" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4B9EDF" />
            <stop offset="100%" stopColor="#4CC8A0" />
          </linearGradient>
        </defs>
        {/* Viñeta */}
        <path
          d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
          fill="url(#og)"
        />
        {/* Tilde animada */}
        <path
          d="M15 34 L29 48 L55 18"
          fill="none"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="61"
          strokeDashoffset="61"
          style={{
            animation:
              "drawCheckStroke 0.5s cubic-bezier(0.4,0,0.2,1) 0.35s forwards",
          }}
        />
      </svg>
      <p
        className="text-3xl font-extrabold tracking-tight"
        style={{
          animation: "checkTextIn 0.4s ease 0.7s both",
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <span className="text-white">Oido</span>
        <span className="text-[#4CC8A0]">Ops</span>
      </p>
    </div>
  );
}
