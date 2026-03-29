import { useState } from 'react'

// ── Viñeta ────────────────────────────────────────────────────────────────────
function Vineta({ width, color1 = '#4B9EDF', color2 = '#4CC8A0' }: { width: number; color1?: string; color2?: string }) {
  const h = Math.round(width * 72 / 68)
  return (
    <svg width={width} height={h} viewBox="0 0 68 72">
      <defs>
        <linearGradient id="vlg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color1} />
          <stop offset="100%" stopColor={color2} />
        </linearGradient>
      </defs>
      <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#vlg)" />
      <path d="M15 34 L29 48 L55 18" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Fuentes ───────────────────────────────────────────────────────────────────
const FONT_PRESETS = [
  // System
  { label: 'Helvetica Neue (actual)', family: "'Helvetica Neue', Arial, sans-serif" },
  { label: 'Arial Black',             family: "'Arial Black', Arial, sans-serif" },
  { label: 'Georgia',                 family: "Georgia, serif" },
  { label: 'Impact',                  family: "Impact, sans-serif" },
  // Google — Geometric / Modern
  { label: 'Inter',                   family: "'Inter', sans-serif" },
  { label: 'Space Grotesk',           family: "'Space Grotesk', sans-serif" },
  { label: 'Outfit',                  family: "'Outfit', sans-serif" },
  { label: 'Plus Jakarta Sans',       family: "'Plus Jakarta Sans', sans-serif" },
  { label: 'DM Sans',                 family: "'DM Sans', sans-serif" },
  { label: 'Urbanist',                family: "'Urbanist', sans-serif" },
  { label: 'Jost',                    family: "'Jost', sans-serif" },
  { label: 'Manrope',                 family: "'Manrope', sans-serif" },
  { label: 'Lexend',                  family: "'Lexend', sans-serif" },
  { label: 'Karla',                   family: "'Karla', sans-serif" },
  { label: 'Mulish',                  family: "'Mulish', sans-serif" },
  { label: 'Nunito',                  family: "'Nunito', sans-serif" },
  { label: 'Nunito Sans',             family: "'Nunito Sans', sans-serif" },
  { label: 'Quicksand',               family: "'Quicksand', sans-serif" },
  { label: 'Varela Round',            family: "'Varela Round', sans-serif" },
  { label: 'Comfortaa',               family: "'Comfortaa', sans-serif" },
  // Google — Humanist
  { label: 'Poppins',                 family: "'Poppins', sans-serif" },
  { label: 'Lato',                    family: "'Lato', sans-serif" },
  { label: 'Roboto',                  family: "'Roboto', sans-serif" },
  { label: 'Open Sans',               family: "'Open Sans', sans-serif" },
  { label: 'Source Sans 3',           family: "'Source Sans 3', sans-serif" },
  { label: 'Work Sans',               family: "'Work Sans', sans-serif" },
  { label: 'Cabin',                   family: "'Cabin', sans-serif" },
  // Google — Bold / Display
  { label: 'Montserrat',              family: "'Montserrat', sans-serif" },
  { label: 'Raleway',                 family: "'Raleway', sans-serif" },
  { label: 'Syne',                    family: "'Syne', sans-serif" },
  { label: 'Barlow',                  family: "'Barlow', sans-serif" },
  { label: 'Exo 2',                   family: "'Exo 2', sans-serif" },
  { label: 'Kanit',                   family: "'Kanit', sans-serif" },
  { label: 'Saira',                   family: "'Saira', sans-serif" },
  { label: 'Titillium Web',           family: "'Titillium Web', sans-serif" },
  { label: 'Josefin Sans',            family: "'Josefin Sans', sans-serif" },
  // Google — Condensed / Impact
  { label: 'Oswald',                  family: "'Oswald', sans-serif" },
  { label: 'Barlow Condensed',        family: "'Barlow Condensed', sans-serif" },
  { label: 'Roboto Condensed',        family: "'Roboto Condensed', sans-serif" },
  { label: 'Teko',                    family: "'Teko', sans-serif" },
  { label: 'Fjalla One',              family: "'Fjalla One', sans-serif" },
  { label: 'Russo One',               family: "'Russo One', sans-serif" },
  { label: 'Righteous',               family: "'Righteous', sans-serif" },
  { label: 'Bebas Neue',              family: "'Bebas Neue', sans-serif" },
  // Google — Heavy / Black
  { label: 'Archivo Black',           family: "'Archivo Black', sans-serif" },
  { label: 'Paytone One',             family: "'Paytone One', sans-serif" },
  { label: 'Boogaloo',                family: "'Boogaloo', sans-serif" },
  { label: 'Fredoka',                 family: "'Fredoka', sans-serif" },
  { label: 'Black Ops One',           family: "'Black Ops One', sans-serif" },
]

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900' +
  '&family=Space+Grotesk:wght@400;500;600;700' +
  '&family=Outfit:wght@400;500;600;700;800;900' +
  '&family=Plus+Jakarta+Sans:wght@400;500;600;700;800' +
  '&family=DM+Sans:wght@400;500;600;700;800' +
  '&family=Urbanist:wght@400;500;600;700;800;900' +
  '&family=Jost:wght@400;500;600;700;800;900' +
  '&family=Manrope:wght@400;500;600;700;800' +
  '&family=Lexend:wght@400;500;600;700;800' +
  '&family=Karla:wght@400;500;600;700;800' +
  '&family=Mulish:wght@400;500;600;700;800;900' +
  '&family=Nunito:wght@400;600;700;800;900' +
  '&family=Nunito+Sans:wght@400;600;700;800;900' +
  '&family=Quicksand:wght@400;500;600;700' +
  '&family=Varela+Round' +
  '&family=Comfortaa:wght@400;500;600;700' +
  '&family=Poppins:wght@400;500;600;700;800;900' +
  '&family=Lato:wght@400;700;900' +
  '&family=Roboto:wght@400;500;700;900' +
  '&family=Open+Sans:wght@400;500;600;700;800' +
  '&family=Source+Sans+3:wght@400;500;600;700;800;900' +
  '&family=Work+Sans:wght@400;500;600;700;800;900' +
  '&family=Cabin:wght@400;500;600;700' +
  '&family=Montserrat:wght@400;500;600;700;800;900' +
  '&family=Raleway:wght@400;500;600;700;800;900' +
  '&family=Syne:wght@400;500;600;700;800' +
  '&family=Barlow:wght@400;500;600;700;800;900' +
  '&family=Exo+2:wght@400;500;600;700;800;900' +
  '&family=Kanit:wght@400;500;600;700;800;900' +
  '&family=Saira:wght@400;500;600;700;800;900' +
  '&family=Titillium+Web:wght@400;600;700;900' +
  '&family=Josefin+Sans:wght@400;500;600;700' +
  '&family=Oswald:wght@400;500;600;700' +
  '&family=Barlow+Condensed:wght@400;500;600;700;800;900' +
  '&family=Roboto+Condensed:wght@400;500;600;700;800;900' +
  '&family=Teko:wght@400;500;600;700' +
  '&family=Fjalla+One' +
  '&family=Russo+One' +
  '&family=Righteous' +
  '&family=Bebas+Neue' +
  '&family=Archivo+Black' +
  '&family=Paytone+One' +
  '&family=Boogaloo' +
  '&family=Fredoka:wght@400;500;600;700' +
  '&family=Black+Ops+One' +
  '&display=swap'

const WEIGHTS = [400, 500, 600, 700, 800, 900]

type OidoCase = 'lower' | 'title' | 'upper'
type OpsCase  = 'title' | 'upper' | 'lower'

// ── Logo preview ───────────────────────────────────────────────────────────────
function LogoPreview({
  fontFamily, fontWeight, fontSize, letterSpacing,
  colorBody, colorOps, vinetaSize, vinetaBottom,
  color1, color2, oidoCase, opsCase, opsItalic,
}: {
  fontFamily: string; fontWeight: number; fontSize: number; letterSpacing: number
  colorBody: string; colorOps: string; vinetaSize: number; vinetaBottom: number
  color1: string; color2: string; oidoCase: OidoCase; opsCase: OpsCase; opsItalic: boolean
}) {
  const first = oidoCase === 'lower' ? 'o' : 'O'
  const rest  = oidoCase === 'upper' ? 'DO' : 'do'
  const ops   = opsCase  === 'title' ? 'Ops' : opsCase === 'upper' ? 'OPS' : 'ops'

  return (
    <div style={{ fontFamily, fontWeight, fontSize, lineHeight: 1, letterSpacing: `${letterSpacing}em`, display: 'flex', alignItems: 'flex-end' }}>
      <span style={{ color: colorBody }}>{first}</span>
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <span style={{ color: colorBody }}>ı</span>
        <span style={{ position: 'absolute', left: '50%', bottom: `${vinetaBottom}%`, transform: 'translateX(-50%)', transformOrigin: 'bottom center', display: 'block', lineHeight: 0 }}>
          <Vineta width={vinetaSize} color1={color1} color2={color2} />
        </span>
      </span>
      <span style={{ color: colorBody }}>{rest}</span>
      <span style={{ color: colorOps, fontStyle: opsItalic ? 'italic' : 'normal' }}>{ops}</span>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function LogoLabPage() {
  const [fontFamily,    setFontFamily]    = useState(FONT_PRESETS[0].family)
  const [fontWeight,    setFontWeight]    = useState(900)
  const [fontSize,      setFontSize]      = useState(56)
  const [letterSpacing, setLetterSpacing] = useState(-0.03)
  const [colorBody,     setColorBody]     = useState('#0f172a')
  const [colorOps,      setColorOps]      = useState('#4CC8A0')
  const [vinetaSize,    setVinetaSize]    = useState(26)
  const [vinetaBottom,  setVinetaBottom]  = useState(67)
  const [color1,        setColor1]        = useState('#4B9EDF')
  const [color2,        setColor2]        = useState('#4CC8A0')
  const [oidoCase,      setOidoCase]      = useState<OidoCase>('lower')
  const [opsCase,       setOpsCase]       = useState<OpsCase>('title')
  const [opsItalic,     setOpsItalic]     = useState(false)

  const previewProps = { fontFamily, fontWeight, fontSize, letterSpacing, colorBody, colorOps, vinetaSize, vinetaBottom, color1, color2, oidoCase, opsCase, opsItalic }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href={GOOGLE_FONTS_URL} />

      <div className="min-h-screen bg-gray-50 p-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-800">🔬 Logo Lab</h1>

        {/* Preview grande */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex items-center justify-center min-h-40">
          <LogoPreview {...previewProps} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Controles */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="font-bold text-gray-700 text-sm">Controles</h2>

            {/* Fuente */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fuente ({FONT_PRESETS.length} disponibles)</label>
              <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {FONT_PRESETS.map(f => <option key={f.label} value={f.family}>{f.label}</option>)}
              </select>
            </div>

            {/* Peso */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Peso — {fontWeight}</label>
              <div className="flex gap-1.5 flex-wrap">
                {WEIGHTS.map(w => (
                  <button key={w} onClick={() => setFontWeight(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${fontWeight === w ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Mayúsculas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Texto "oıdo"</label>
                <div className="flex gap-1">
                  {(['lower','title','upper'] as OidoCase[]).map(v => (
                    <button key={v} onClick={() => setOidoCase(v)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${oidoCase === v ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {v === 'lower' ? 'oıdo' : v === 'title' ? 'Oıdo' : 'OıDO'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Texto "Ops"</label>
                <div className="flex gap-1">
                  {(['title','upper','lower'] as OpsCase[]).map(v => (
                    <button key={v} onClick={() => setOpsCase(v)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${opsCase === v ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {v === 'title' ? 'Ops' : v === 'upper' ? 'OPS' : 'ops'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tamaño */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tamaño — {fontSize}px</label>
              <input type="range" min={24} max={96} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full accent-cyan-500" />
            </div>

            {/* Letter spacing */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Espaciado letras — {letterSpacing.toFixed(3)}em</label>
              <input type="range" min={-0.08} max={0.1} step={0.005} value={letterSpacing} onChange={e => setLetterSpacing(Number(e.target.value))} className="w-full accent-cyan-500" />
            </div>

            {/* Viñeta */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Viñeta tamaño — {vinetaSize}px</label>
              <input type="range" min={12} max={50} value={vinetaSize} onChange={e => setVinetaSize(Number(e.target.value))} className="w-full accent-cyan-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Viñeta posición — {vinetaBottom}%</label>
              <input type="range" min={40} max={120} value={vinetaBottom} onChange={e => setVinetaBottom(Number(e.target.value))} className="w-full accent-cyan-500" />
            </div>

            {/* Colores */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Color letras',  val: colorBody, set: setColorBody },
                { label: 'Color "Ops"',   val: colorOps,  set: setColorOps  },
                { label: 'Viñeta top',    val: color1,    set: setColor1    },
                { label: 'Viñeta bottom', val: color2,    set: setColor2    },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={val} onChange={e => set(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                    <span className="text-xs text-gray-400 font-mono">{val}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Ops cursiva */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={opsItalic} onChange={e => setOpsItalic(e.target.checked)} className="accent-cyan-500" />
              <span className="text-xs text-gray-600">"Ops" / "OPS" en cursiva</span>
            </label>
          </div>

          {/* Grid de fuentes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2 overflow-auto max-h-[700px]">
            <h2 className="font-bold text-gray-700 text-sm sticky top-0 bg-white pb-2">{FONT_PRESETS.length} fuentes — peso {fontWeight}</h2>
            {FONT_PRESETS.map(f => (
              <button key={f.label} onClick={() => setFontFamily(f.family)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                  fontFamily === f.family ? 'border-cyan-400 bg-cyan-50' : 'border-gray-100 hover:border-gray-200'
                }`}>
                <LogoPreview {...previewProps} fontFamily={f.family} fontSize={28} />
                <span className="text-xs text-gray-400 shrink-0 ml-3">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
