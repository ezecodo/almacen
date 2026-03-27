import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, FloorPlan, Mesa, Restaurante } from '../api'

// ── Constantes visuales ─────────────────────────────────────────────────────
const CELL           = 40   // px por celda del grid
const SQUARE_SIZE    = 80   // diámetro mesa redonda / lado cuadrada
const RECT_W         = 160  // ancho mesa rectangular
const RECT_H         = 80   // alto mesa rectangular
const BARRA_DEFAULT_W = 240 // ancho barra por defecto
const BARRA_DEFAULT_H = 80  // alto barra por defecto

// Elementos decorativos de referencia (no son mesas)
const ELEM_DEFS: Record<string, { label: string; bg: string; border: string; color: string }> = {
  pared:   { label: 'PARED',   bg: '#111827', border: '#4b5563', color: '#6b7280' },
  columna: { label: 'COLUMNA', bg: '#0d1117', border: '#374151', color: '#4b5563' },
  ventana: { label: 'VENTANA', bg: '#0c1a2e', border: '#1d4ed8', color: '#3b82f6' },
  entrada: { label: 'ENTRADA', bg: '#0f1c0d', border: '#4d7c0f', color: '#65a30d' },
}
const isElemDeco = (tipo: string) => tipo in ELEM_DEFS
const SILLA_ALTA_SIZE = 60  // diámetro silla alta (múltiplo de 10)
const SNAP = CELL / 4       // snapping al grid (10px) — clave para simetría exacta

function snapTo(v: number) { return Math.round(v / SNAP) * SNAP }

// Bounding box visual real (tiene en cuenta rotación 90/270)
function visualBounds(mesa: Mesa, overX?: number, overY?: number) {
  const x = overX ?? mesa.x
  const y = overY ?? mesa.y
  const w = mesaWidth(mesa)
  const h = mesaHeight(mesa)
  const rot = (mesa.rotacion ?? 0) % 180
  if (rot === 90) {
    // Centro visual sigue siendo (x+w/2, y+h/2); dimensiones intercambiadas
    return { left: x + (w - h) / 2, top: y + (h - w) / 2, width: h, height: w }
  }
  return { left: x, top: y, width: w, height: h }
}

function mesaWidth(mesa: Mesa): number {
  if (mesa.tipo === 'barra' || isElemDeco(mesa.tipo)) return mesa.ancho ?? BARRA_DEFAULT_W
  if (mesa.tipo === 'silla_alta') return mesa.ancho ?? SILLA_ALTA_SIZE
  if (mesa.tipo === 'rectangular') return mesa.ancho ?? RECT_W
  return mesa.ancho ?? SQUARE_SIZE  // round, square
}
function mesaHeight(mesa: Mesa): number {
  if (mesa.tipo === 'barra' || isElemDeco(mesa.tipo)) return mesa.alto ?? BARRA_DEFAULT_H
  if (mesa.tipo === 'silla_alta') return mesa.ancho ?? SILLA_ALTA_SIZE  // siempre cuadrada
  if (mesa.tipo === 'rectangular') return mesa.alto ?? RECT_H
  return mesa.ancho ?? SQUARE_SIZE  // round, square — siempre cuadrada
}


// ── Modal barra (tamaño ajustable) ───────────────────────────────────────────
function BarraModal({ mesa, onConfirm, onDelete, onClose }: {
  mesa?: Mesa
  onConfirm: (data: { ancho: number; alto: number }) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [anchoU, setAnchoU] = useState(Math.round((mesa?.ancho ?? BARRA_DEFAULT_W) / CELL))
  const [altoU,  setAltoU]  = useState(Math.round((mesa?.alto  ?? BARRA_DEFAULT_H) / CELL))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1e2d45] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-5">
          {mesa ? 'Editar barra' : 'Nueva barra'}
        </h3>

        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 block">Anchura — {anchoU * CELL}px</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setAnchoU(a => Math.max(2, a - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">−</button>
            <span className="flex-1 text-center text-white text-2xl font-bold">{anchoU}</span>
            <button onClick={() => setAnchoU(a => Math.min(20, a + 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">+</button>
          </div>
        </div>

        <div className="mb-6">
          <label className="text-gray-400 text-xs mb-2 block">Altura — {altoU * CELL}px</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setAltoU(a => Math.max(1, a - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">−</button>
            <span className="flex-1 text-center text-white text-2xl font-bold">{altoU}</span>
            <button onClick={() => setAltoU(a => Math.min(6, a + 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">+</button>
          </div>
        </div>

        {/* Preview */}
        <div className="mb-6 flex items-center justify-center">
          <div style={{
            width: Math.min(anchoU * CELL, 240), height: altoU * CELL,
            background: '#1a1208', border: '2px solid #92400e', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#92400e', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em' }}>BARRA</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-medium hover:bg-gray-600">
            Cancelar
          </button>
          {onDelete && (
            <button onClick={onDelete} className="py-3 px-4 rounded-xl bg-red-900/60 text-red-400 font-medium hover:bg-red-900">
              🗑
            </button>
          )}
          <button onClick={() => onConfirm({ ancho: anchoU * CELL, alto: altoU * CELL })}
            className="flex-1 py-3 rounded-xl bg-amber-700 text-white font-bold hover:bg-amber-600">
            {mesa ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal elemento decorativo ────────────────────────────────────────────────
function ElementoModal({ mesa, onConfirm, onDelete, onClose }: {
  mesa?: Mesa
  onConfirm: (data: { tipo: Mesa['tipo']; ancho: number; alto: number }) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [tipoLocal, setTipoLocal] = useState<keyof typeof ELEM_DEFS>(mesa?.tipo as keyof typeof ELEM_DEFS ?? 'pared')
  const [anchoU, setAnchoU] = useState(Math.round((mesa?.ancho ?? BARRA_DEFAULT_W) / CELL))
  const [altoU,  setAltoU]  = useState(Math.round((mesa?.alto  ?? BARRA_DEFAULT_H) / CELL))
  const def = ELEM_DEFS[tipoLocal]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1e2d45] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-5">
          {mesa ? 'Editar elemento' : 'Nuevo elemento'}
        </h3>

        {/* Selector de tipo */}
        <div className="mb-5">
          <label className="text-gray-400 text-xs mb-2 block">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ELEM_DEFS).map(([t, d]) => (
              <button key={t} onClick={() => setTipoLocal(t as keyof typeof ELEM_DEFS)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                  tipoLocal === t
                    ? 'bg-gray-700 text-white border-gray-400'
                    : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700'
                }`}
                style={tipoLocal === t ? { borderColor: d.border, color: d.color } : {}}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ancho */}
        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 block">Anchura — {anchoU * CELL}px</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setAnchoU(a => Math.max(1, a - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">−</button>
            <span className="flex-1 text-center text-white text-2xl font-bold">{anchoU}</span>
            <button onClick={() => setAnchoU(a => Math.min(20, a + 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">+</button>
          </div>
        </div>

        {/* Alto */}
        <div className="mb-5">
          <label className="text-gray-400 text-xs mb-2 block">Altura — {altoU * CELL}px</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setAltoU(a => Math.max(1, a - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">−</button>
            <span className="flex-1 text-center text-white text-2xl font-bold">{altoU}</span>
            <button onClick={() => setAltoU(a => Math.min(10, a + 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">+</button>
          </div>
        </div>

        {/* Preview */}
        <div className="mb-5 flex items-center justify-center">
          <div style={{
            width: Math.min(anchoU * CELL, 240), height: altoU * CELL,
            background: def.bg, border: `2px solid ${def.border}`, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: def.color, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em' }}>{def.label}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-medium hover:bg-gray-600">
            Cancelar
          </button>
          {onDelete && (
            <button onClick={onDelete} className="py-3 px-4 rounded-xl bg-red-900/60 text-red-400 font-medium hover:bg-red-900">
              🗑
            </button>
          )}
          <button onClick={() => onConfirm({ tipo: tipoLocal as Mesa['tipo'], ancho: anchoU * CELL, alto: altoU * CELL })}
            className="flex-1 py-3 rounded-xl bg-gray-600 text-white font-bold hover:bg-gray-500">
            {mesa ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Presets de tamaño: [base_px] — para rectangular, base = alto; ancho = base * ratio
const SIZE_PRESETS: { label: string; base: number }[] = [
  { label: 'XS', base: 40 },   // todos múltiplos de 10 → compatible con SNAP=10
  { label: 'S',  base: 60 },
  { label: 'M',  base: 80 },
  { label: 'L',  base: 100 },
  { label: 'XL', base: 120 },
]
const LARGO_RATIOS: { label: string; value: number }[] = [
  { label: '1.5×', value: 1.5 },
  { label: '2×',   value: 2   },
  { label: '2.5×', value: 2.5 },
  { label: '3×',   value: 3   },
]
function baseFromMesa(mesa: Mesa): number {
  if (mesa.tipo === 'rectangular') return mesa.alto ?? (mesa.ancho ? Math.round(mesa.ancho / 2) : 80)
  return mesa.ancho ?? 80
}
function ratioFromMesa(mesa: Mesa): number {
  if (mesa.tipo !== 'rectangular' || !mesa.ancho || !mesa.alto) return 2
  // redondear al 0.5 más cercano
  return Math.round((mesa.ancho / mesa.alto) * 2) / 2
}

// ── Modal añadir/editar mesa ─────────────────────────────────────────────────
function MesaModal({
  tipo,
  mesa,
  nextNumero,
  onConfirm,
  onClose,
}: {
  tipo?: Mesa['tipo']
  mesa?: Mesa
  nextNumero: number
  onConfirm: (data: { numero: number; capacidad: number; tipo: Mesa['tipo']; ancho: number; alto: number }) => void
  onClose: () => void
}) {
  const [numero,    setNumero]    = useState(mesa?.numero    ?? nextNumero)
  const [capacidad, setCapacidad] = useState(mesa?.capacidad ?? 4)
  const [tipoLocal, setTipoLocal] = useState<Mesa['tipo']>(mesa?.tipo ?? tipo ?? 'square')
  const [base,      setBase]      = useState<number>(mesa ? baseFromMesa(mesa) : 80)
  const [ratio,     setRatio]     = useState<number>(mesa ? ratioFromMesa(mesa) : 2)

  const isSilla = tipoLocal === 'silla_alta'
  const isRect  = tipoLocal === 'rectangular'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1e2d45] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-5">
          {mesa ? 'Editar mesa' : 'Nueva mesa'}
        </h3>

        {/* Tipo — solo al crear y si no es silla alta */}
        {!mesa && !isSilla && (
          <div className="mb-4">
            <label className="text-gray-400 text-xs mb-2 block">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {(['round','square','rectangular'] as Mesa['tipo'][]).map(t => (
                <button key={t} onClick={() => setTipoLocal(t)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    tipoLocal === t ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}>
                  {t === 'round' ? '⬤ Redonda' : t === 'square' ? '■ Cuadrada' : '▬ Rectan.'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Número */}
        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 block">Número de mesa</label>
          <input type="number" value={numero} onChange={e => setNumero(Number(e.target.value))}
            onFocus={e => e.target.select()}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-center text-xl font-bold outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* Comensales */}
        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 block">Comensales</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setCapacidad(c => Math.max(1, c - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">−</button>
            <span className="flex-1 text-center text-white text-2xl font-bold">{capacidad}</span>
            <button onClick={() => setCapacidad(c => c + 1)}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600">+</button>
          </div>
        </div>

        {/* Tamaño — presets XS S M L XL */}
        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 block">Tamaño</label>
          <div className="flex gap-2">
            {SIZE_PRESETS.map(p => {
              const previewW = isRect ? Math.round(p.base * ratio) : p.base
              const previewH = p.base
              const isRound = tipoLocal === 'round' || tipoLocal === 'silla_alta'
              const active = base === p.base
              return (
                <button key={p.label} onClick={() => setBase(p.base)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-xl border transition-all ${
                    active ? 'border-cyan-500 bg-cyan-900/30' : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                  }`}>
                  <div style={{
                    width: Math.round(previewW * 0.35), height: Math.round(previewH * 0.35),
                    borderRadius: isRound ? '50%' : isRect ? 3 : 4,
                    background: active ? '#0e7490' : '#334155',
                    border: `1.5px solid ${active ? '#22d3ee' : '#4b5563'}`,
                    minWidth: 8, minHeight: 8,
                  }} />
                  <span className={`text-xs font-bold ${active ? 'text-cyan-400' : 'text-gray-500'}`}>{p.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Largo — solo para rectangulares */}
        {isRect && (
          <div className="mb-6">
            <label className="text-gray-400 text-xs mb-2 block">Largo</label>
            <div className="flex gap-2">
              {LARGO_RATIOS.map(r => (
                <button key={r.value} onClick={() => setRatio(r.value)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                    ratio === r.value ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400' : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-500'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isRect && <div className="mb-6" />}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-medium hover:bg-gray-600">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({
              numero, capacidad, tipo: tipoLocal,
              ancho: snapTo(isRect ? base * ratio : base),
              alto:  snapTo(base),
            })}
            className="flex-1 py-3 rounded-xl bg-cyan-500 text-white font-bold hover:bg-cyan-400"
          >
            {mesa ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente mesa en canvas ────────────────────────────────────────────────
function MesaShape({
  mesa,
  selected,
  mergeTarget,
  onMouseDown,
  onClick,
}: {
  mesa: Mesa
  selected: boolean
  mergeTarget: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
}) {
  const w = mesaWidth(mesa)
  const h = mesaHeight(mesa)

  // ── Barra ──────────────────────────────────────────────────────────────────
  if (mesa.tipo === 'barra') {
    return (
      <div
        onMouseDown={onMouseDown}
        onClick={onClick}
        style={{
          position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
          borderRadius: 8,
          background: '#130e08',
          border: `3px solid ${selected ? '#fbbf24' : '#78350f'}`,
          boxShadow: selected ? '0 0 0 3px #78350f66, 0 4px 20px #0008' : '0 3px 12px #0008',
          cursor: 'grab', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          zIndex: selected ? 10 : 0,
        }}
      >
        <span style={{ color: '#92400e', fontWeight: 900, fontSize: 12, letterSpacing: '0.15em' }}>BARRA</span>
        {selected && <span style={{ color: '#78350f', fontSize: 10 }}>clic para editar tamaño</span>}
      </div>
    )
  }

  // ── Elementos decorativos ──────────────────────────────────────────────────
  if (isElemDeco(mesa.tipo)) {
    const def = ELEM_DEFS[mesa.tipo]
    return (
      <div
        onMouseDown={onMouseDown}
        onClick={onClick}
        style={{
          position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
          borderRadius: 6,
          background: def.bg,
          border: `2px solid ${selected ? '#fbbf24' : def.border}`,
          boxShadow: selected ? '0 0 0 3px #fbbf2455, 0 4px 20px #0008' : '0 2px 8px #0006',
          cursor: 'grab', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          zIndex: selected ? 10 : 0,
          opacity: 0.85,
        }}
      >
        <span style={{ color: def.color, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em' }}>{def.label}</span>
        {selected && <span style={{ color: def.border, fontSize: 10, opacity: 0.7 }}>clic para editar</span>}
      </div>
    )
  }

  // ── Silla alta ─────────────────────────────────────────────────────────────
  if (mesa.tipo === 'silla_alta') {
    return (
      <div
        onMouseDown={onMouseDown}
        onClick={onClick}
        style={{
          position: 'absolute', left: mesa.x, top: mesa.y, width: w, height: h,
          borderRadius: '50%',
          background: mergeTarget ? '#2d1a3a' : '#1a1000',
          border: `2px solid ${mergeTarget ? '#a855f7' : selected ? '#fbbf24' : '#d97706'}`,
          boxShadow: selected
            ? '0 0 0 3px #fbbf2455, 0 4px 20px #0008'
            : mergeTarget
              ? '0 0 20px #a855f799, 0 0 40px #a855f733'
              : '0 0 20px #d9770699, 0 0 40px #d9770633',
          cursor: 'grab', userSelect: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          zIndex: selected ? 10 : 1,
        }}
      >
        <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: 14, lineHeight: 1 }}>
          {mesa.numero}
        </span>
        <span style={{ color: '#f59e0b', fontSize: 9, marginTop: 1 }}>
          {mesa.capacidad}p
        </span>
      </div>
    )
  }

  // ── Mesas normales ─────────────────────────────────────────────────────────
  const isRound = mesa.tipo === 'round'

  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: mesa.x,
        top: mesa.y,
        width: w,
        height: h,
        borderRadius: isRound ? '50%' : '6px',
        background: mergeTarget ? '#2d1a3a' : '#1a3828',
        border: `2px solid ${mergeTarget ? '#a855f7' : selected ? '#fbbf24' : '#22c55e'}`,
        boxShadow: selected
          ? '0 0 0 3px #fbbf2455, 0 4px 20px #0008'
          : mergeTarget
            ? '0 0 20px #a855f799, 0 0 40px #a855f733'
            : '0 0 16px #22c55e88, 0 0 32px #22c55e22',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        transition: 'all 0.2s',
        zIndex: selected ? 10 : 1,
        transform: mesa.rotacion ? `rotate(${mesa.rotacion}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div style={{ transform: mesa.rotacion ? `rotate(${-mesa.rotacion}deg)` : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 18, lineHeight: 1 }}>
          {mesa.numero}
        </span>
        <span style={{ color: '#4ade80', fontSize: 10, marginTop: 2, opacity: 0.8 }}>
          {mesa.capacidad} pax
        </span>
      </div>
    </div>
  )
}

// ── Menú contextual al seleccionar mesa ─────────────────────────────────────
function MesaMenu({
  x, y,
  onEdit,
  onDuplicate,
  onDelete,
  onSplit,
  onRotate,
  onClose,
}: {
  mesa?: Mesa
  x: number
  y: number
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSplit?: () => void
  onRotate: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'fixed', left: x, top: y, zIndex: 100 }}
      className="bg-[#1e2d45] border border-gray-600 rounded-xl shadow-2xl py-1 min-w-[140px]"
    >
      <button onClick={onEdit}      className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">✏️ Editar</button>
      <button onClick={onDuplicate} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">⧉ Duplicar</button>
      <button onClick={onRotate}    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">🔄 Rotar 90°</button>
      {onSplit && (
        <button onClick={onSplit}   className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">✂️ Partir</button>
      )}
      <button onClick={onDelete}    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2">🗑 Eliminar</button>
    </div>
  )
}

// ── Canvas del salón ─────────────────────────────────────────────────────────
function SalonCanvas({ plan }: { plan: FloorPlan }) {
  const queryClient = useQueryClient()
  const tempCounter = useRef(-1)
  const [mesas, setMesas] = useState<Mesa[]>(plan.mesas)
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null)
  const [modal, setModal] = useState<{ tipo?: Mesa['tipo']; mesa?: Mesa } | null>(null)
  const [barraModal, setBarraModal] = useState<{ mesa?: Mesa } | null>(null)
  const [elemModal, setElemModal] = useState<{ mesa?: Mesa } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ mesa: Mesa; x: number; y: number } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [guides, setGuides] = useState<{ x?: number; y?: number }[]>([])

  const didDrag = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const dragging = useRef<{
    mesaId: number
    startMouseX: number
    startMouseY: number
    startMesaX: number
    startMesaY: number
    groupStarts: Record<number, { x: number; y: number }>
  } | null>(null)

  // Marquee selection
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  // Solo sincronizar desde servidor cuando no hay cambios pendientes
  useEffect(() => {
    if (!dirty) {
      setMesas(plan.mesas)
      setDeletedIds(new Set())
    }
  }, [plan.mesas, dirty])

  // ── Helpers locales (no tocan la DB) ──────────────────────────────────────
  const localAdd = (data: Omit<Mesa, 'id' | 'floorPlanId'>) => {
    const id = tempCounter.current--
    setMesas(prev => [...prev, { id, floorPlanId: plan.id, ...data }])
    setDirty(true)
  }

  const localUpdate = (mesaId: number, data: Partial<Omit<Mesa, 'id' | 'floorPlanId'>>) => {
    setMesas(prev => prev.map(m => m.id === mesaId ? { ...m, ...data } : m))
    setDirty(true)
  }

  const localDelete = (mesaId: number) => {
    setMesas(prev => prev.filter(m => m.id !== mesaId))
    if (mesaId > 0) setDeletedIds(prev => new Set([...prev, mesaId]))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(mesaId); return n })
    setDirty(true)
  }

  // ── Guardar todo en la DB ──────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      for (const id of deletedIds) {
        await api.salon.deleteMesa(plan.id, id)
      }
      for (const mesa of mesas.filter(m => m.id < 0)) {
        const { id: _id, floorPlanId: _fp, ...data } = mesa
        await api.salon.addMesa(plan.id, data)
      }
      const serverMap = new Map(plan.mesas.map(m => [m.id, m]))
      const fields = ['numero', 'tipo', 'x', 'y', 'capacidad', 'rotacion', 'ancho', 'alto'] as const
      for (const mesa of mesas.filter(m => m.id > 0)) {
        const server = serverMap.get(mesa.id)
        if (!server) continue
        if (fields.some(k => mesa[k] !== server[k])) {
          const upd: Partial<Omit<Mesa, 'id' | 'floorPlanId'>> = {}
          fields.forEach(k => { (upd as Record<string, unknown>)[k] = mesa[k] })
          await api.salon.updateMesa(plan.id, mesa.id, upd)
        }
      }
      setDirty(false)
      setDeletedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['salon-planes', plan.restaurantId] })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setSaveError(msg.includes('409') ? 'Una mesa tiene comandas activas y no puede eliminarse' : `Error al guardar${msg ? ': ' + msg : ''}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    setMesas(plan.mesas)
    setDeletedIds(new Set())
    setDirty(false)
    setSaveError(null)
    setSelectedIds(new Set())
  }

  const nextNumero = mesas.length > 0 ? Math.max(...mesas.map(m => m.numero)) + 1 : 1

  // ── Drag ──────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent, mesaId: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    didDrag.current = false
    const mesa = mesas.find(m => m.id === mesaId)!

    // Si la mesa ya está en la selección actual, arrastramos todo el grupo
    // Si no, la seleccionamos sola
    const effectiveIds = selectedIds.has(mesaId) ? selectedIds : new Set([mesaId])
    if (!selectedIds.has(mesaId)) setSelectedIds(new Set([mesaId]))

    // Guardar posición inicial de todos los miembros del grupo
    const groupStarts: Record<number, { x: number; y: number }> = {}
    for (const m of mesas) {
      if (effectiveIds.has(m.id) && m.id !== mesaId) groupStarts[m.id] = { x: m.x, y: m.y }
    }

    dragging.current = {
      mesaId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startMesaX: mesa.x,
      startMesaY: mesa.y,
      groupStarts,
    }
    setContextMenu(null)
  }, [mesas, selectedIds])

  // Coordenadas de contenido (tiene en cuenta scroll del canvas)
  const contentCoords = (e: React.MouseEvent) => {
    const el = containerRef.current!
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left + el.scrollLeft, y: e.clientY - rect.top + el.scrollTop }
  }

  // Mousedown sobre el canvas vacío → iniciar marquee
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const { x, y } = contentCoords(e)
    marqueeRef.current = { x0: x, y0: y, x1: x, y1: y }
    setMarquee({ x0: x, y0: y, x1: x, y1: y })
    setSelectedIds(new Set())
    setContextMenu(null)
  }, [])

  const ALIGN_SNAP = 8   // px de tolerancia — cubre error máximo del grid (SNAP/2 = 5px)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // ── Marquee ────────────────────────────────────────────────────────────
    if (marqueeRef.current && !dragging.current) {
      const { x, y } = contentCoords(e)
      const updated = { ...marqueeRef.current, x1: x, y1: y }
      marqueeRef.current = updated
      setMarquee(updated)
      return
    }
    if (!dragging.current) return
    const { mesaId, startMouseX, startMouseY, startMesaX, startMesaY } = dragging.current
    let newX = snapTo(startMesaX + e.clientX - startMouseX)
    let newY = snapTo(startMesaY + e.clientY - startMouseY)
    newX = Math.max(0, newX)
    newY = Math.max(0, newY)
    didDrag.current = true

    // ── Smart alignment snapping ───────────────────────────────────────────
    const dragMesa = mesas.find(m => m.id === mesaId)
    const newGuides: { x?: number; y?: number }[] = []

    if (dragMesa) {
      const drag = visualBounds(dragMesa, newX, newY)

      // Recoger todos los candidatos dentro del umbral; aplicar el más cercano por eje
      const candidates: { axis: 'x' | 'y'; delta: number; guide: number; dist: number }[] = []

      for (const other of mesas) {
        if (other.id === mesaId) continue
        const ob = visualBounds(other)

        for (const [dragEdge, targetEdge] of [
          [drag.left,                 ob.left],
          [drag.left + drag.width/2,  ob.left + ob.width/2],
          [drag.left + drag.width,    ob.left + ob.width],
        ] as [number, number][]) {
          const dist = Math.abs(dragEdge - targetEdge)
          if (dist <= ALIGN_SNAP) candidates.push({ axis: 'x', delta: targetEdge - dragEdge, guide: targetEdge, dist })
        }

        for (const [dragEdge, targetEdge] of [
          [drag.top,                  ob.top],
          [drag.top + drag.height/2,  ob.top + ob.height/2],
          [drag.top + drag.height,    ob.top + ob.height],
        ] as [number, number][]) {
          const dist = Math.abs(dragEdge - targetEdge)
          if (dist <= ALIGN_SNAP) candidates.push({ axis: 'y', delta: targetEdge - dragEdge, guide: targetEdge, dist })
        }
      }

      const xBest = candidates.filter(c => c.axis === 'x').sort((a, b) => a.dist - b.dist)[0]
      const yBest = candidates.filter(c => c.axis === 'y').sort((a, b) => a.dist - b.dist)[0]
      if (xBest) { newX += xBest.delta; newGuides.push({ x: xBest.guide }) }
      if (yBest) { newY += yBest.delta; newGuides.push({ y: yBest.guide }) }
    }
    setGuides(newGuides)

    const deltaX = newX - dragging.current.startMesaX
    const deltaY = newY - dragging.current.startMesaY
    const { groupStarts } = dragging.current

    setMesas(prev => prev.map(m => {
      if (m.id === mesaId) return { ...m, x: newX, y: newY }
      const gs = groupStarts[m.id]
      if (gs) return { ...m, x: gs.x + deltaX, y: gs.y + deltaY }
      return m
    }))

    // Detectar solapamiento para merge (solo cuadradas solas, no en grupo)
    const draggingMesa = mesas.find(m => m.id === mesaId)
    if (draggingMesa?.tipo === 'square' && Object.keys(dragging.current?.groupStarts ?? {}).length === 0) {
      const overlap = mesas.find(m => {
        if (m.id === mesaId || m.tipo !== 'square') return false
        const dx = Math.abs(newX - m.x)
        const dy = Math.abs(newY - m.y)
        return dx < SQUARE_SIZE * 0.6 && dy < SQUARE_SIZE * 0.6
      })
      setMergeTargetId(overlap?.id ?? null)
    }
  }, [mesas])

  const handleMouseUp = useCallback(() => {
    // ── Finalizar marquee ─────────────────────────────────────────────────
    if (marqueeRef.current) {
      const { x0, y0, x1, y1 } = marqueeRef.current
      const left = Math.min(x0, x1), right  = Math.max(x0, x1)
      const top  = Math.min(y0, y1), bottom = Math.max(y0, y1)
      if (right - left > 4 || bottom - top > 4) {
        const hit = new Set(mesas.filter(m => {
          const vb = visualBounds(m)
          return vb.left < right && vb.left + vb.width > left && vb.top < bottom && vb.top + vb.height > top
        }).map(m => m.id))
        setSelectedIds(hit)
      }
      marqueeRef.current = null
      setMarquee(null)
    }

    if (!dragging.current) return
    const { mesaId } = dragging.current
    setGuides([])

    // Merge si hay target
    if (mergeTargetId) {
      const a = mesas.find(m => m.id === mesaId)!
      const b = mesas.find(m => m.id === mergeTargetId)!
      const newMesa: Omit<Mesa, 'id' | 'floorPlanId'> = {
        numero:    Math.min(a.numero, b.numero),
        tipo:      'rectangular',
        x:         Math.min(a.x, b.x),
        y:         Math.min(a.y, b.y),
        capacidad: a.capacidad + b.capacidad,
        rotacion:  0,
      }
      localDelete(a.id)
      localDelete(b.id)
      localAdd(newMesa)
      setMergeTargetId(null)
    } else {
      setDirty(true)
    }

    dragging.current = null
  }, [mergeTargetId, mesas])

  // ── Partir rectangular ────────────────────────────────────────────────────
  const handleSplit = useCallback((mesa: Mesa) => {
    setContextMenu(null)
    const half = Math.ceil(mesa.capacidad / 2)
    localDelete(mesa.id)
    localAdd({ numero: mesa.numero,     tipo: 'square', x: mesa.x,                    y: mesa.y, capacidad: half,                          rotacion: 0 })
    localAdd({ numero: mesa.numero + 1, tipo: 'square', x: mesa.x + SQUARE_SIZE + 10, y: mesa.y, capacidad: Math.floor(mesa.capacidad / 2), rotacion: 0 })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {saveError && (
        <div className="bg-red-900/80 border border-red-500 text-red-200 text-sm px-4 py-2 text-center">
          {saveError}
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 flex-wrap">
        <span className="text-gray-400 text-xs mr-1">Añadir:</span>
        {(['round','square','rectangular'] as Mesa['tipo'][]).map(t => (
          <button
            key={t}
            onClick={() => setModal({ tipo: t })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-700 text-gray-200 text-xs font-medium hover:bg-gray-600 transition-colors"
          >
            {t === 'round' ? '⬤' : t === 'square' ? '■' : '▬'}
            {t === 'round' ? 'Redonda' : t === 'square' ? 'Cuadrada' : 'Rectangular'}
          </button>
        ))}
        <div className="w-px h-5 bg-gray-600 mx-1" />
        <button
          onClick={() => setBarraModal({})}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950 text-amber-600 text-xs font-medium hover:bg-amber-900 border border-amber-900 transition-colors"
        >
          ▬▬ Barra
        </button>
        <button
          onClick={() => setModal({ tipo: 'silla_alta' })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950 text-amber-400 text-xs font-medium hover:bg-amber-900 border border-amber-800 transition-colors"
        >
          ⬤ Silla alta
        </button>
        <div className="w-px h-5 bg-gray-600 mx-1" />
        <button
          onClick={() => setElemModal({})}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 text-gray-400 text-xs font-medium hover:bg-gray-700 border border-gray-600 transition-colors"
        >
          ▦ Elemento
        </button>

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 1 && (
            <span className="text-cyan-400 text-xs font-medium bg-cyan-900/30 border border-cyan-700 px-2 py-0.5 rounded-lg">
              {selectedIds.size} seleccionadas · arrastra para mover grupo
            </span>
          )}
          {dirty && !isSaving && (
            <button
              onClick={handleDiscard}
              className="px-3 py-1.5 rounded-xl bg-gray-700 text-gray-300 text-xs font-medium hover:bg-gray-600 transition-colors"
            >
              Descartar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || isSaving}
            className="px-4 py-1.5 rounded-xl bg-cyan-600 text-white text-xs font-bold disabled:opacity-30 hover:bg-cyan-500 transition-colors"
          >
            {isSaving ? 'Guardando…' : dirty ? '● Guardar' : 'Guardado'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        style={{ minHeight: 500 }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Marquee de selección */}
        {marquee && (() => {
          const left = Math.min(marquee.x0, marquee.x1)
          const top  = Math.min(marquee.y0, marquee.y1)
          const w    = Math.abs(marquee.x1 - marquee.x0)
          const h    = Math.abs(marquee.y1 - marquee.y0)
          return (
            <div style={{
              position: 'absolute', left, top, width: w, height: h,
              border: '1.5px dashed #22d3ee', background: '#22d3ee18',
              pointerEvents: 'none', zIndex: 60,
            }} />
          )
        })()}

        {/* Alignment guides */}
        {guides.map((g, i) =>
          g.x !== undefined
            ? <div key={`gx${i}`} style={{ position: 'absolute', left: g.x - 0.5, top: 0, width: 1, height: '100%', background: '#22d3ee', opacity: 0.75, pointerEvents: 'none', zIndex: 50 }} />
            : <div key={`gy${i}`} style={{ position: 'absolute', top: g.y! - 0.5, left: 0, width: '100%', height: 1, background: '#22d3ee', opacity: 0.75, pointerEvents: 'none', zIndex: 50 }} />
        )}

        {/* Grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            minWidth: 1200,
            minHeight: 800,
            backgroundImage: `
              linear-gradient(to right, #ffffff08 1px, transparent 1px),
              linear-gradient(to bottom, #ffffff08 1px, transparent 1px)
            `,
            backgroundSize: `${CELL}px ${CELL}px`,
          }}
        >
          {mesas.map(mesa => (
            <MesaShape
              key={mesa.id}
              mesa={mesa}
              selected={selectedIds.has(mesa.id)}
              mergeTarget={mergeTargetId === mesa.id}
              onMouseDown={e => handleMouseDown(e, mesa.id)}
              onClick={e => {
                e.stopPropagation()
                if (didDrag.current) return
                if (mesa.tipo === 'barra') {
                  setBarraModal({ mesa })
                } else if (isElemDeco(mesa.tipo)) {
                  setElemModal({ mesa })
                } else {
                  setContextMenu({ mesa, x: e.clientX, y: e.clientY })
                }
              }}
            />
          ))}
        </div>

        {mesas.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-600 text-sm">Añade mesas desde la barra superior</p>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 px-4 py-2 border-t border-gray-700 flex-wrap items-center">
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1a3828', border: '1.5px solid #22c55e' }} />
          <span className="text-gray-500 text-xs">Mesa</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1a1000', border: '1.5px solid #d97706' }} />
          <span className="text-gray-500 text-xs">Silla alta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#130e08', border: '1.5px solid #78350f' }} />
          <span className="text-gray-500 text-xs">Barra</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#111827', border: '1.5px solid #4b5563' }} />
          <span className="text-gray-500 text-xs">Elemento</span>
        </div>
        <span className="text-gray-600 text-xs ml-auto">Arrastra el fondo para seleccionar varias · Arrastra cuadrada sobre otra para unir</span>
      </div>

      {/* Modals */}
      {modal && (
        <MesaModal
          tipo={modal.tipo}
          mesa={modal.mesa}
          nextNumero={nextNumero}
          onClose={() => setModal(null)}
          onConfirm={({ numero, capacidad, tipo, ancho, alto }) => {
            if (modal.mesa) {
              localUpdate(modal.mesa.id, { numero, capacidad, tipo, ancho, alto })
            } else {
              localAdd({ numero, capacidad, tipo, x: snapTo(300), y: snapTo(200), rotacion: 0, ancho, alto })
            }
            setModal(null)
          }}
        />
      )}

      {barraModal !== null && (
        <BarraModal
          mesa={barraModal.mesa}
          onClose={() => setBarraModal(null)}
          onDelete={barraModal.mesa ? () => { localDelete(barraModal.mesa!.id); setBarraModal(null) } : undefined}
          onConfirm={({ ancho, alto }) => {
            if (barraModal.mesa) {
              localUpdate(barraModal.mesa.id, { ancho, alto })
            } else {
              localAdd({ numero: 0, capacidad: 0, tipo: 'barra', x: snapTo(200), y: snapTo(150), rotacion: 0, ancho, alto })
            }
            setBarraModal(null)
          }}
        />
      )}

      {elemModal !== null && (
        <ElementoModal
          mesa={elemModal.mesa}
          onClose={() => setElemModal(null)}
          onDelete={elemModal.mesa ? () => { localDelete(elemModal.mesa!.id); setElemModal(null) } : undefined}
          onConfirm={({ tipo, ancho, alto }) => {
            if (elemModal.mesa) {
              localUpdate(elemModal.mesa.id, { tipo, ancho, alto })
            } else {
              localAdd({ numero: 0, capacidad: 0, tipo, x: snapTo(200), y: snapTo(150), rotacion: 0, ancho, alto })
            }
            setElemModal(null)
          }}
        />
      )}

      {contextMenu && (
        <MesaMenu
          mesa={contextMenu.mesa}
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => { setModal({ mesa: contextMenu.mesa }); setContextMenu(null) }}
          onDuplicate={() => {
            const m = contextMenu.mesa
            const offset = snapTo(mesaWidth(m) + 20)
            localAdd({
              numero: m.numero + 1,
              tipo: m.tipo, capacidad: m.capacidad,
              x: m.x + offset, y: m.y,
              rotacion: m.rotacion ?? 0,
              ancho: m.ancho, alto: m.alto,
            })
            setContextMenu(null)
          }}
          onDelete={() => { localDelete(contextMenu.mesa.id); setContextMenu(null) }}
          onSplit={contextMenu.mesa.tipo === 'rectangular' ? () => handleSplit(contextMenu.mesa) : undefined}
          onRotate={() => {
            localUpdate(contextMenu.mesa.id, { rotacion: ((contextMenu.mesa.rotacion ?? 0) + 90) % 360 })
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// ── Page principal ────────────────────────────────────────────────────────────
export default function SalonPage() {
  const queryClient = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [planId, setPlanId] = useState<number | null>(null)
  const [newPlanNombre, setNewPlanNombre] = useState('')
  const [showNewPlan, setShowNewPlan] = useState(false)

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  const { data: planes } = useQuery({
    queryKey: ['salon-planes', restaurantId],
    queryFn: () => api.salon.list(restaurantId!),
    enabled: !!restaurantId,
  })

  const activePlan = planes?.find(p => p.id === planId) ?? planes?.[0] ?? null

  useEffect(() => {
    if (!restaurantId && restaurantes?.length) setRestaurantId(restaurantes[0].id)
  }, [restaurantes, restaurantId])

  useEffect(() => {
    if (planes?.length && !planId) setPlanId(planes[0].id)
    if (planes?.length === 0) setPlanId(null)
  }, [planes, planId])

  const createPlan = useMutation({
    mutationFn: () => api.salon.create(restaurantId!, newPlanNombre.trim()),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ['salon-planes', restaurantId] })
      setPlanId(plan.id)
      setNewPlanNombre('')
      setShowNewPlan(false)
    },
  })

  const deletePlan = useMutation({
    mutationFn: (id: number) => api.salon.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salon-planes', restaurantId] })
      setPlanId(null)
    },
  })

  return (
    <div className="flex flex-col h-screen bg-[#111827]">
      {/* Header */}
      <div className="bg-[#0f172a] border-b border-gray-700 px-4 py-3">
        {/* Tabs restaurantes */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          {restaurantes?.map((r: Restaurante) => (
            <button
              key={r.id}
              onClick={() => { setRestaurantId(r.id); setPlanId(null) }}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                restaurantId === r.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {r.nombre}
            </button>
          ))}
        </div>

        {/* Tabs planos + nuevo plano */}
        <div className="flex items-center gap-2 flex-wrap">
          {planes?.map(p => (
            <button
              key={p.id}
              onClick={() => setPlanId(p.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                activePlan?.id === p.id
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
              }`}
            >
              {p.nombre}
            </button>
          ))}

          {showNewPlan ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newPlanNombre}
                onChange={e => setNewPlanNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newPlanNombre.trim()) createPlan.mutate() }}
                placeholder="Nombre del plano"
                className="bg-gray-800 text-white text-xs px-3 py-1 rounded-lg outline-none border border-cyan-600 w-36"
              />
              <button
                onClick={() => { if (newPlanNombre.trim()) createPlan.mutate() }}
                disabled={!newPlanNombre.trim()}
                className="text-xs px-3 py-1 rounded-lg bg-cyan-600 text-white disabled:opacity-40"
              >Crear</button>
              <button onClick={() => setShowNewPlan(false)} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewPlan(true)}
              className="px-3 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300 border border-dashed border-gray-600 hover:border-gray-500 transition-colors"
            >
              + Nuevo plano
            </button>
          )}

          {activePlan && (
            <button
              onClick={() => { if (confirm(`¿Eliminar plano "${activePlan.nombre}"?`)) deletePlan.mutate(activePlan.id) }}
              className="ml-auto text-xs text-red-500 hover:text-red-400 transition-colors"
            >
              Eliminar plano
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      {activePlan ? (
        <SalonCanvas key={activePlan.id} plan={activePlan} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-4xl mb-3">🪑</p>
            <p className="text-gray-500 text-sm mb-4">No hay planos creados</p>
            <button
              onClick={() => setShowNewPlan(true)}
              className="px-5 py-2 rounded-xl bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-500"
            >
              Crear primer plano
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
