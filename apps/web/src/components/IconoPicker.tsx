import { useEffect, useRef, useState } from 'react'

// Selector de icono para el admin: un botón con el emoji actual que abre una rejilla de emojis de
// hostelería agrupados. Se guarda el emoji tal cual (texto), así se ve igual en la sala y en la Box
// sin internet. Abajo se puede pegar cualquier otro. Usado en gastos habituales, categorías de la carta
// y de la wiki. Para sumar emojis, añadirlos a GRUPOS.

const GRUPOS: { nombre: string; iconos: string[] }[] = [
  { nombre: 'Comida', iconos: ['🥖', '🍞', '🥐', '🧀', '🥚', '🥛', '🧈', '🍅', '🥔', '🧅', '🧄', '🌶️', '🫒', '🍋', '🍊', '🍎', '🍓', '🍇', '🥑', '🥬', '🥕', '🍄', '🥩', '🍗', '🥓', '🐟', '🦐', '🐙', '🦑', '🍤', '🥘', '🍝', '🍚', '🥗', '🍕', '🍔', '🥪', '🍟', '🍰', '🎂', '🍮', '🍫', '🍦', '🍪'] },
  { nombre: 'Bebida', iconos: ['🍷', '🥂', '🍾', '🍺', '🍻', '🍸', '🍹', '🥃', '🧉', '☕', '🍵', '🥤', '🧃', '💧', '🧊'] },
  { nombre: 'Local y limpieza', iconos: ['🕯️', '💐', '🌹', '🧻', '🧽', '🧼', '🧴', '🧹', '🗑️', '🧯', '🔥', '💡', '🔧', '🔋', '🧾', '📦', '🛒', '🚚', '💶', '📒'] },
  { nombre: 'Sala y otros', iconos: ['🍽️', '🍴', '🥄', '🔪', '🪑', '🎉', '🎈', '⭐', '✅', '📖', '📋', '🗣️', '👋', '🎵', '❤️', '⚠️', '🌐', '🏷️', '🌿', '🌱'] },
]

export default function IconoPicker({ valor, onChange, vacio = '＋', className = '' }: {
  valor: string
  onChange: (icono: string) => void
  vacio?: string // lo que se ve si no hay icono
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [otro, setOtro] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegir = (icono: string) => { onChange(icono); setAbierto(false); setOtro('') }

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto(a => !a)} title="Elegir icono"
        className={`w-full h-[38px] border rounded-xl text-xl flex items-center justify-center transition-colors ${
          abierto ? 'border-cyan-400 bg-cyan-50' : 'border-gray-200 bg-white hover:border-gray-300'
        } ${className}`}>
        {valor || <span className="text-gray-300 text-base">{vacio}</span>}
      </button>

      {abierto && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-[19rem] max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl p-3 space-y-3">
          {GRUPOS.map(g => (
            <div key={g.nombre}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{g.nombre}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {g.iconos.map(i => (
                  <button key={i} type="button" onClick={() => elegir(i)}
                    className={`h-8 rounded-lg text-xl hover:bg-gray-100 ${valor === i ? 'bg-cyan-100 ring-1 ring-cyan-400' : ''}`}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <input value={otro} onChange={e => setOtro(e.target.value)} maxLength={8} placeholder="Pega otro emoji"
              onKeyDown={e => { if (e.key === 'Enter' && otro.trim()) elegir(otro.trim()) }}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-cyan-400" />
            {otro.trim() && <button type="button" onClick={() => elegir(otro.trim())} className="text-xs font-semibold text-cyan-600 px-1">Usar</button>}
            {valor && !otro.trim() && <button type="button" onClick={() => elegir('')} className="text-xs text-gray-400 hover:text-red-500 px-1">Quitar</button>}
          </div>
        </div>
      )}
    </div>
  )
}
