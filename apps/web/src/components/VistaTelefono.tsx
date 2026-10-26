import { useState } from 'react'
import type { Mesa } from '../api'
import { MesaBtn, ThemeCtx, mesaWidth, mesaHeight } from '../pages/SalaMesasPage'
import { mesasVisibles, separacion, caja } from '../../../api/src/mesas-separadas'

// Vista del teléfono en el editor del salón (idea de Eze, 2026-10-26): el mapa como lo verá el
// camarero, con el mismo escalado que la sala (llenar la pantalla) y las mesas que se separan
// juntas o separadas, calculadas igual que en la API (mesas-separadas.ts). Se mueve en vivo con el
// lienzo, aunque no se haya guardado. Las mesas que se pisan salen marcadas en rojo.

// Pantallas: el hueco del mapa es lo que queda entre la cabecera y la barra de abajo de la sala
const PANTALLAS = {
  telefono: { label: '📱 Teléfono', w: 390, h: 760, cabecera: 58, pie: 37 },
  tpv:      { label: '🖥 Tablet TPV', w: 1280, h: 800, cabecera: 64, pie: 0 },
} as const
type Pantalla = keyof typeof PANTALLAS

const ANCHO_VISTA = 300, ALTO_VISTA = 620 // lo que ocupa el teléfono en el editor
const PAD = 24 // el mismo margen que el mapa de la sala

// Dos mesas que se pisan (no cuentan las sillas altas entre ellas ni con la barra: van pegadas)
function pisadas(mesas: Mesa[]) {
  const ids = new Set<number>()
  const cuentan = mesas.filter(m => !['barra', 'pared', 'columna', 'ventana', 'entrada'].includes(m.tipo))
  for (let i = 0; i < cuentan.length; i++) for (let j = i + 1; j < cuentan.length; j++) {
    const a = cuentan[i], b = cuentan[j]
    if (a.tipo === 'silla_alta' && b.tipo === 'silla_alta') continue
    if (separacion(a, b) < 0) { ids.add(a.id); ids.add(b.id) }
  }
  return ids
}

export default function VistaTelefono({ mesas, nombre, onCerrar }: { mesas: Mesa[]; nombre: string; onCerrar: () => void }) {
  const haySeparables = mesas.some(m => m.mitad)
  const [todas, setTodas] = useState<'juntas' | 'separadas'>('separadas')
  const [pantalla, setPantalla] = useState<Pantalla>('telefono')
  const p = PANTALLAS[pantalla]

  const vista = mesasVisibles(mesas, haySeparables ? todas : undefined)
  const malas = pisadas(vista)
  const nombresMalas = vista.filter(m => malas.has(m.id)).map(m => m.numero)

  // Escalado del mapa: lo mismo que hace la sala con la caja de todas las mesas
  const mapaW = p.w, mapaH = p.h - p.cabecera - p.pie
  let transform = ''
  if (vista.length) {
    const minX = Math.min(...vista.map(m => m.x)) - PAD
    const minY = Math.min(...vista.map(m => m.y)) - PAD
    const contentW = Math.max(...vista.map(m => m.x + mesaWidth(m))) + PAD - minX
    const contentH = Math.max(...vista.map(m => m.y + mesaHeight(m))) + PAD - minY
    const s = Math.min(mapaW / contentW, mapaH / contentH)
    transform = `translate(${(mapaW - contentW * s) / 2}px, ${(mapaH - contentH * s) / 2}px) scale(${s}) translate(${-minX}px, ${-minY}px)`
  }
  const k = Math.min(ANCHO_VISTA / p.w, ALTO_VISTA / p.h)

  const boton = (activo: boolean) => `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${activo ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`

  return (
    <aside className="w-[340px] shrink-0 border-l border-gray-700 bg-[#0f172a] overflow-y-auto flex flex-col items-center gap-3 p-3">
      <div className="w-full flex items-center gap-1.5 flex-wrap">
        {(Object.keys(PANTALLAS) as Pantalla[]).map(k => (
          <button key={k} onClick={() => setPantalla(k)} className={boton(pantalla === k)}>{PANTALLAS[k].label}</button>
        ))}
        <button onClick={onCerrar} title="Esconder la vista" className="ml-auto w-7 h-7 rounded-lg bg-gray-700 text-gray-400 hover:bg-gray-600 text-sm">✕</button>
      </div>
      {haySeparables && (
        <div className="w-full flex items-center gap-1.5">
          <span className="text-gray-500 text-xs mr-1">Mesas que se separan:</span>
          <button onClick={() => setTodas('juntas')} className={boton(todas === 'juntas')}>Juntas</button>
          <button onClick={() => setTodas('separadas')} className={boton(todas === 'separadas')}>Separadas</button>
        </div>
      )}

      {/* El teléfono, a escala */}
      <div className="rounded-[22px] border-[6px] border-gray-950 shadow-2xl overflow-hidden shrink-0" style={{ width: p.w * k + 12, height: p.h * k + 12 }}>
        <ThemeCtx.Provider value={false}>
          <div data-sala-theme="light" style={{ width: p.w, height: p.h, transform: `scale(${k})`, transformOrigin: '0 0', fontSize: 16 }}
            className="bg-[var(--sala-bg)] flex flex-col pointer-events-none select-none">
            <div className="shrink-0 bg-[var(--sala-hdr)] border-b border-[var(--sala-brd)] flex items-center px-4" style={{ height: p.cabecera }}>
              <span className="text-[var(--sala-txt)] font-black text-lg truncate">{nombre}</span>
            </div>
            <div className="relative overflow-hidden" style={{ width: mapaW, height: mapaH }}>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-4 py-1 rounded-full bg-[var(--sala-hdr)]/85 border border-[var(--sala-brd)] shadow-lg">
                <span className="text-[var(--sala-txt)] text-2xl font-black tabular-nums leading-none">21:30</span>
              </div>
              <div style={{
                position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', transform,
                backgroundImage: 'linear-gradient(to right, var(--sala-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--sala-grid) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                width: Math.max(...vista.map(m => m.x + mesaWidth(m)), 400) + 40,
                height: Math.max(...vista.map(m => m.y + mesaHeight(m)), 400) + 40,
              }}>
                {vista.filter(m => m.tipo === 'barra').map(m => (
                  <div key={m.id} style={{
                    position: 'absolute', left: m.x, top: m.y, width: mesaWidth(m), height: mesaHeight(m),
                    background: '#130e08', border: '2px solid #92400e', borderRadius: 6,
                    boxShadow: '0 0 20px #92400e99, 0 0 40px #92400e33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: '#d97706', fontWeight: 900, fontSize: 10, letterSpacing: '0.15em' }}>BARRA</span>
                  </div>
                ))}
                {vista.filter(m => m.tipo !== 'barra').map(m => <MesaBtn key={`${m.id}-${m.numero}`} mesa={m} onClick={() => {}} />)}
                {/* Las que se pisan: marco rojo por encima */}
                {vista.filter(m => malas.has(m.id)).map(m => {
                  const c = caja(m)
                  return <div key={`mal-${m.id}`} style={{
                    position: 'absolute', left: c.x1 - 3, top: c.y1 - 3, width: c.x2 - c.x1 + 6, height: c.y2 - c.y1 + 6,
                    border: '3px solid #ef4444', borderRadius: m.tipo === 'round' || m.tipo === 'silla_alta' ? '50%' : 8,
                    boxShadow: '0 0 12px #ef4444aa', zIndex: 5,
                  }} />
                })}
              </div>
            </div>
            {p.pie > 0 && <div className="shrink-0 bg-[var(--sala-hdr)] border-t border-[var(--sala-brd)]" style={{ height: p.pie }} />}
          </div>
        </ThemeCtx.Provider>
      </div>

      {nombresMalas.length > 0
        ? <p className="w-full text-xs text-red-300 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">
            ⚠ Se pisan: {[...new Set(nombresMalas)].sort((a, b) => a - b).join(', ')}. Sepáralas en el lienzo.
          </p>
        : <p className="w-full text-xs text-emerald-400">✓ Ninguna mesa se pisa</p>}
      <p className="w-full text-[11px] text-gray-500 leading-snug">
        Así lo ve el camarero: el mapa se estira para llenar la pantalla. Se actualiza mientras mueves las mesas, aunque no hayas guardado.
        {haySeparables && ' "Separadas" enseña todas las mesas que se separan partidas a la vez, el peor caso.'}
      </p>
    </aside>
  )
}
