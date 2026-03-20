import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#1a2235] flex flex-col items-center justify-center px-6">
      <style>{`
        @keyframes bubbleIn {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes checkDraw {
          from { stroke-dashoffset: 90; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes textIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes taglineIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .logo-bubble  { animation: bubbleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; opacity: 0; }
        .logo-check   { stroke-dasharray: 90; stroke-dashoffset: 90; animation: checkDraw 0.4s ease forwards 0.5s; }
        .logo-oido    { opacity: 0; animation: textIn 0.4s ease forwards 0.7s; }
        .logo-ops     { opacity: 0; animation: textIn 0.4s ease forwards 0.9s; }
        .logo-float   { animation: float 3.5s ease-in-out infinite 1.4s; }
        .tagline      { opacity: 0; animation: taglineIn 0.6s ease forwards 1.1s; }
        .btn-almacen  { opacity: 0; animation: textIn 0.4s ease forwards 1.3s; }
        .btn-admin    { opacity: 0; animation: textIn 0.4s ease forwards 1.5s; }
        .btn-propinas { opacity: 0; animation: textIn 0.4s ease forwards 1.7s; }
      `}</style>

      {/* Logo animado */}
      <div className="logo-float mb-10">
        <svg viewBox="0 0 300 70" fill="none" className="w-64 sm:w-80">
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4B9EDF"/>
              <stop offset="100%" stopColor="#4CC8A0"/>
            </linearGradient>
          </defs>

          {/* Burbuja */}
          <g className="logo-bubble">
            <path
              d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z"
              fill="url(#lg)"
            />
          </g>

          {/* Checkmark — se dibuja después */}
          <path
            className="logo-check"
            d="M15 34 L29 48 L55 18"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* OidoOps — una sola palabra, dos colores */}
          <text
            x="80" y="51"
            fontFamily="'Helvetica Neue', Arial, sans-serif"
            fontWeight="800"
            fontSize="44"
          >
            <tspan className="logo-oido" fill="white">Oido</tspan><tspan className="logo-ops" fill="#4CC8A0">Ops</tspan>
          </text>
        </svg>
      </div>

      {/* Tagline */}
      <p className="tagline text-gray-400 text-center text-sm sm:text-base mb-12 max-w-xs">
        Gestión inteligente para tu grupo de restaurantes
      </p>

      {/* Botones */}
      <div className="w-full max-w-xs space-y-4">
        <button
          onClick={() => navigate('/retiro')}
          className="btn-almacen w-full bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-white font-bold py-5 rounded-2xl text-lg shadow-lg active:scale-95 transition-transform"
        >
          Ir al Almacén
        </button>
        <button
          onClick={() => navigate('/admin')}
          className="btn-admin w-full border-2 border-gray-600 text-gray-400 font-semibold py-5 rounded-2xl text-base hover:border-gray-400 hover:text-gray-300 active:scale-95 transition-all"
        >
          Panel Administrador
        </button>
        <button
          onClick={() => navigate('/mis-propinas')}
          className="btn-propinas w-full text-gray-500 font-medium py-3 rounded-2xl text-sm hover:text-gray-300 active:scale-95 transition-all"
        >
          Mis propinas
        </button>
      </div>
    </div>
  )
}
