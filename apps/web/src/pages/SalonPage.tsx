import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, FloorPlan, Mesa, Restaurante } from '../api'

// ── Constantes visuales ─────────────────────────────────────────────────────
const CELL = 40          // px por celda del grid
const SQUARE_SIZE = 80   // diámetro mesa redonda / lado cuadrada
const RECT_W      = 160  // ancho mesa rectangular
const RECT_H      = 80   // alto mesa rectangular
const SNAP = CELL / 2    // snapping al grid (20px)

function snapTo(v: number) { return Math.round(v / SNAP) * SNAP }

function mesaWidth(tipo: Mesa['tipo'])  { return tipo === 'rectangular' ? RECT_W : SQUARE_SIZE }
function mesaHeight(tipo: Mesa['tipo']) { return tipo === 'rectangular' ? RECT_H : SQUARE_SIZE }

// ── Colores por capacidad ────────────────────────────────────────────────────
function mesaColor(capacidad: number) {
  if (capacidad <= 2)  return { bg: '#1e3a5f', border: '#4B9EDF', text: '#93c5fd' }
  if (capacidad <= 4)  return { bg: '#1a3a2e', border: '#4CC8A0', text: '#6ee7b7' }
  if (capacidad <= 6)  return { bg: '#3b2a1a', border: '#f59e0b', text: '#fcd34d' }
  return               { bg: '#3a1a2e', border: '#a855f7', text: '#d8b4fe' }
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
  onConfirm: (data: { numero: number; capacidad: number; tipo: Mesa['tipo'] }) => void
  onClose: () => void
}) {
  const [numero,    setNumero]    = useState(mesa?.numero    ?? nextNumero)
  const [capacidad, setCapacidad] = useState(mesa?.capacidad ?? 4)
  const [tipoLocal, setTipoLocal] = useState<Mesa['tipo']>(mesa?.tipo ?? tipo ?? 'square')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1e2d45] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
        <h3 className="text-white font-bold text-lg mb-5">
          {mesa ? 'Editar mesa' : 'Nueva mesa'}
        </h3>

        {!mesa && (
          <div className="mb-4">
            <label className="text-gray-400 text-xs mb-2 block">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {(['round','square','rectangular'] as Mesa['tipo'][]).map(t => (
                <button
                  key={t}
                  onClick={() => setTipoLocal(t)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    tipoLocal === t
                      ? 'bg-cyan-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {t === 'round' ? '⬤ Redonda' : t === 'square' ? '■ Cuadrada' : '▬ Rectangular'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-gray-400 text-xs mb-2 block">Número de mesa</label>
          <input
            type="number"
            value={numero}
            onChange={e => setNumero(Number(e.target.value))}
            onFocus={e => e.target.select()}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 text-center text-xl font-bold outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="mb-6">
          <label className="text-gray-400 text-xs mb-2 block">Comensales</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCapacidad(c => Math.max(1, c - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600"
            >−</button>
            <span className="flex-1 text-center text-white text-2xl font-bold">{capacidad}</span>
            <button
              onClick={() => setCapacidad(c => c + 1)}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl hover:bg-gray-600"
            >+</button>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-medium hover:bg-gray-600">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ numero, capacidad, tipo: tipoLocal })}
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
  const w = mesaWidth(mesa.tipo)
  const h = mesaHeight(mesa.tipo)
  const colors = mesaColor(mesa.capacidad)
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
        borderRadius: isRound ? '50%' : mesa.tipo === 'rectangular' ? '14px' : '16px',
        background: mergeTarget ? '#14532d' : colors.bg,
        border: `2px solid ${mergeTarget ? '#22c55e' : selected ? '#fff' : colors.border}`,
        boxShadow: selected
          ? `0 0 0 3px ${colors.border}55, 0 4px 20px #0008`
          : mergeTarget
            ? '0 0 0 3px #22c55e55'
            : '0 2px 8px #0006',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        zIndex: selected ? 10 : 1,
        transform: mesa.rotacion ? `rotate(${mesa.rotacion}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div style={{ transform: mesa.rotacion ? `rotate(${-mesa.rotacion}deg)` : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ color: colors.text, fontWeight: 800, fontSize: 18, lineHeight: 1 }}>
          {mesa.numero}
        </span>
        <span style={{ color: colors.border, fontSize: 10, marginTop: 2, opacity: 0.8 }}>
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
  onDelete,
  onSplit,
  onRotate,
  onClose,
}: {
  mesa?: Mesa
  x: number
  y: number
  onEdit: () => void
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
      <button onClick={onEdit}   className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">✏️ Editar</button>
      <button onClick={onRotate} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">🔄 Rotar 90°</button>
      {onSplit && (
        <button onClick={onSplit} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">✂️ Partir</button>
      )}
      <button onClick={onDelete} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2">🗑 Eliminar</button>
    </div>
  )
}

// ── Canvas del salón ─────────────────────────────────────────────────────────
function SalonCanvas({ plan }: { plan: FloorPlan }) {
  const queryClient = useQueryClient()
  const [mesas, setMesas] = useState<Mesa[]>(plan.mesas)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null)
  const [modal, setModal] = useState<{ tipo?: Mesa['tipo']; mesa?: Mesa } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ mesa: Mesa; x: number; y: number } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const dragging = useRef<{
    mesaId: number
    startMouseX: number
    startMouseY: number
    startMesaX: number
    startMesaY: number
  } | null>(null)

  // Sincronizar cuando cambia el plan (e.g. tras mutación)
  useEffect(() => { setMesas(plan.mesas) }, [plan.mesas])

  const addMesa = useMutation({
    mutationFn: (data: Omit<Mesa, 'id' | 'floorPlanId'>) => api.salon.addMesa(plan.id, data),
    onSuccess: (mesa) => {
      setMesas(prev => [...prev, mesa])
      queryClient.invalidateQueries({ queryKey: ['salon', plan.id] })
    },
  })

  const updateMesa = useMutation({
    mutationFn: ({ mesaId, data }: { mesaId: number; data: Partial<Omit<Mesa, 'id' | 'floorPlanId'>> }) =>
      api.salon.updateMesa(plan.id, mesaId, data),
    onSuccess: (updated) => {
      setMesas(prev => prev.map(m => m.id === updated.id ? updated : m))
      queryClient.invalidateQueries({ queryKey: ['salon', plan.id] })
    },
  })

  const deleteMesa = useMutation({
    mutationFn: (mesaId: number) => api.salon.deleteMesa(plan.id, mesaId),
    onSuccess: (_, mesaId) => {
      setMesas(prev => prev.filter(m => m.id !== mesaId))
      setSelectedId(null)
      queryClient.invalidateQueries({ queryKey: ['salon', plan.id] })
    },
    onError: (err: Error) => {
      setDeleteError(err.message.includes('409') ? 'Esta mesa tiene comandas y no se puede eliminar' : 'Error al eliminar la mesa')
      setTimeout(() => setDeleteError(null), 3000)
    },
  })

  const savePositions = useMutation({
    mutationFn: () => api.salon.savePositions(plan.id, mesas.map(m => ({ id: m.id, x: m.x, y: m.y }))),
    onSuccess: () => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['salon', plan.id] })
    },
  })

  const nextNumero = mesas.length > 0 ? Math.max(...mesas.map(m => m.numero)) + 1 : 1

  // ── Drag ──────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent, mesaId: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const mesa = mesas.find(m => m.id === mesaId)!
    dragging.current = {
      mesaId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startMesaX: mesa.x,
      startMesaY: mesa.y,
    }
    setSelectedId(mesaId)
    setContextMenu(null)
  }, [mesas])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const { mesaId, startMouseX, startMouseY, startMesaX, startMesaY } = dragging.current
    const newX = snapTo(startMesaX + e.clientX - startMouseX)
    const newY = snapTo(startMesaY + e.clientY - startMouseY)

    setMesas(prev => prev.map(m => m.id === mesaId ? { ...m, x: Math.max(0, newX), y: Math.max(0, newY) } : m))

    // Detectar solapamiento para merge (solo cuadradas)
    const draggingMesa = mesas.find(m => m.id === mesaId)
    if (draggingMesa?.tipo === 'square') {
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
    if (!dragging.current) return
    const { mesaId } = dragging.current

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
      // Borrar ambas y crear rectangular
      Promise.all([
        api.salon.deleteMesa(plan.id, a.id),
        api.salon.deleteMesa(plan.id, b.id),
      ]).then(() => addMesa.mutate(newMesa))
      setMesas(prev => prev.filter(m => m.id !== mesaId && m.id !== mergeTargetId))
      setMergeTargetId(null)
    } else {
      setDirty(true)
    }

    dragging.current = null
  }, [mergeTargetId, mesas, plan.id, addMesa])

  // ── Partir rectangular ────────────────────────────────────────────────────
  const handleSplit = useCallback((mesa: Mesa) => {
    setContextMenu(null)
    const half = Math.ceil(mesa.capacidad / 2)
    Promise.all([
      api.salon.addMesa(plan.id, { numero: mesa.numero,     tipo: 'square', x: mesa.x,               y: mesa.y, capacidad: half,                          rotacion: 0 }),
      api.salon.addMesa(plan.id, { numero: mesa.numero + 1, tipo: 'square', x: mesa.x + SQUARE_SIZE + 10, y: mesa.y, capacidad: Math.floor(mesa.capacidad / 2), rotacion: 0 }),
    ]).then(([a, b]) => {
      setMesas(prev => [...prev.filter(m => m.id !== mesa.id), a, b])
      api.salon.deleteMesa(plan.id, mesa.id)
      queryClient.invalidateQueries({ queryKey: ['salon', plan.id] })
    })
  }, [plan.id, queryClient])

  return (
    <div className="flex flex-col h-full">
      {deleteError && (
        <div className="bg-red-900/80 border border-red-500 text-red-200 text-sm px-4 py-2 text-center">
          {deleteError}
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

        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <span className="text-yellow-400 text-xs">● Sin guardar</span>
          )}
          <button
            onClick={() => savePositions.mutate()}
            disabled={!dirty || savePositions.isPending}
            className="px-4 py-1.5 rounded-xl bg-cyan-600 text-white text-xs font-bold disabled:opacity-30 hover:bg-cyan-500 transition-colors"
          >
            {savePositions.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-auto relative"
        style={{ minHeight: 500 }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => { setSelectedId(null); setContextMenu(null) }}
      >
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
              selected={selectedId === mesa.id}
              mergeTarget={mergeTargetId === mesa.id}
              onMouseDown={e => handleMouseDown(e, mesa.id)}
              onClick={e => {
                e.stopPropagation()
                if (dragging.current) return
                setContextMenu({ mesa, x: e.clientX, y: e.clientY })
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
      <div className="flex gap-4 px-4 py-2 border-t border-gray-700 flex-wrap">
        {[
          { label: '1–2 pax', color: '#4B9EDF' },
          { label: '3–4 pax', color: '#4CC8A0' },
          { label: '5–6 pax', color: '#f59e0b' },
          { label: '7+ pax',  color: '#a855f7' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span className="text-gray-500 text-xs">{label}</span>
          </div>
        ))}
        <span className="text-gray-600 text-xs ml-auto">Arrastra para mover · Arrastra cuadrada sobre otra para unir</span>
      </div>

      {/* Modals */}
      {modal && (
        <MesaModal
          tipo={modal.tipo}
          mesa={modal.mesa}
          nextNumero={nextNumero}
          onClose={() => setModal(null)}
          onConfirm={({ numero, capacidad, tipo }) => {
            if (modal.mesa) {
              updateMesa.mutate({ mesaId: modal.mesa.id, data: { numero, capacidad, tipo } })
            } else {
              const centerX = snapTo(300)
              const centerY = snapTo(200)
              addMesa.mutate({ numero, capacidad, tipo, x: centerX, y: centerY, rotacion: 0 })
            }
            setModal(null)
          }}
        />
      )}

      {contextMenu && (
        <MesaMenu
          mesa={contextMenu.mesa}
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => { setModal({ mesa: contextMenu.mesa }); setContextMenu(null) }}
          onDelete={() => { deleteMesa.mutate(contextMenu.mesa.id); setContextMenu(null) }}
          onSplit={contextMenu.mesa.tipo === 'rectangular' ? () => handleSplit(contextMenu.mesa) : undefined}
          onRotate={() => {
            updateMesa.mutate({ mesaId: contextMenu.mesa.id, data: { rotacion: ((contextMenu.mesa.rotacion ?? 0) + 90) % 360 } })
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
