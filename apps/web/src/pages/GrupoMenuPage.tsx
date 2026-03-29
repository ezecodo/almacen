import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  GrupoMenuTemplate,
  GrupoMenuRestricciones,
  GrupoAgendado,
  FloorPlan,
  Mesa,
  MenuItem,
  Restaurante,
} from '../api'

// ── Alérgenos (14 EU — Reglamento 1169/2011) ─────────────────────────────────
const ALERGENOS = [
  { bit: 0,  emoji: '🌾', nombre: 'Gluten' },
  { bit: 1,  emoji: '🦐', nombre: 'Crustáceos' },
  { bit: 2,  emoji: '🥚', nombre: 'Huevos' },
  { bit: 3,  emoji: '🐟', nombre: 'Pescado' },
  { bit: 4,  emoji: '🥜', nombre: 'Cacahuetes' },
  { bit: 5,  emoji: '🫘', nombre: 'Soja' },
  { bit: 6,  emoji: '🥛', nombre: 'Lácteos' },
  { bit: 7,  emoji: '🌰', nombre: 'Frutos secos' },
  { bit: 8,  emoji: '🌿', nombre: 'Apio' },
  { bit: 9,  emoji: '🌻', nombre: 'Mostaza' },
  { bit: 10, emoji: '⚪', nombre: 'Sésamo' },
  { bit: 11, emoji: '🍷', nombre: 'Sulfitos' },
  { bit: 12, emoji: '🌼', nombre: 'Altramuces' },
  { bit: 13, emoji: '🦑', nombre: 'Moluscos' },
]
function hasAlergeno(mask: number, bit: number) { return (mask & (1 << bit)) !== 0 }

function AlergenosInline({ mask }: { mask: number }) {
  const activos = ALERGENOS.filter(a => hasAlergeno(mask, a.bit))
  if (!activos.length) return null
  return (
    <span className="flex gap-0.5 flex-wrap">
      {activos.map(a => (
        <span key={a.bit} title={a.nombre} className="text-[11px] cursor-default">{a.emoji}</span>
      ))}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Tipos internos del editor de plantilla ────────────────────────────────────
type CursoState = { _key: number; nombre: string; platos: string[]; esPostre: boolean }
let _ck = 0

// ── Card de un curso dentro del editor de plantilla ───────────────────────────
function CursoCard({
  curso,
  nivel,
  total,
  items,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  curso:     CursoState
  nivel:     number
  total:     number
  items:     MenuItem[]
  onChange:  (updated: CursoState) => void
  onMoveUp:  () => void
  onMoveDown: () => void
  onRemove:  () => void
}) {
  const [open, setOpen] = useState(true)
  const allSelected = items.length > 0 && items.every(i => curso.platos.includes(i.nombre))

  const toggleItem = (nombre: string) =>
    onChange({
      ...curso,
      platos: curso.platos.includes(nombre)
        ? curso.platos.filter(p => p !== nombre)
        : [...curso.platos, nombre],
    })

  const toggleAll = () =>
    onChange({ ...curso, platos: allSelected ? [] : items.map(i => i.nombre) })

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header del curso */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-[11px] shrink-0">
          {nivel}
        </span>
        <button onClick={() => setOpen(v => !v)} className="flex-1 text-left flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-gray-800">{curso.nombre}</span>
          <span className="text-xs text-gray-400 shrink-0">
            {curso.platos.length}/{items.length} platos
          </span>
        </button>
        <label className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
          <input
            type="checkbox"
            checked={curso.esPostre}
            onChange={e => onChange({ ...curso, esPostre: e.target.checked })}
            className="rounded"
          />
          Postre
        </label>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={nivel === 1}
            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs"
          >▲</button>
          <button
            onClick={onMoveDown}
            disabled={nivel === total}
            className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs"
          >▼</button>
          <button
            onClick={onRemove}
            className="w-6 h-6 flex items-center justify-center text-red-300 hover:text-red-500 text-base leading-none"
          >×</button>
        </div>
      </div>

      {/* Lista de platos con checkboxes */}
      {open && (
        <div className="px-4 py-3">
          <button
            onClick={toggleAll}
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium mb-2"
          >
            {allSelected ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {items.map(item => (
              <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={curso.platos.includes(item.nombre)}
                  onChange={() => toggleItem(item.nombre)}
                  className="rounded accent-indigo-600 shrink-0 mt-0.5"
                />
                <div>
                  <span className="text-xs text-gray-700 group-hover:text-gray-900 leading-tight block">
                    {item.nombre}
                  </span>
                  {!!item.alergenos && <AlergenosInline mask={item.alergenos} />}
                </div>
              </label>
            ))}
            {items.length === 0 && (
              <p className="col-span-2 text-xs text-gray-400 italic">Sin platos activos en esta categoría</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal editor de plantilla ─────────────────────────────────────────────────
function TemplateModal({
  restaurantId,
  initial,
  onClose,
}: {
  restaurantId: number
  initial?: GrupoMenuTemplate
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre]       = useState(initial?.nombre ?? '')
  const [precio, setPrecio]       = useState(initial?.precio ?? 27)
  const [showCatPicker, setShowCatPicker] = useState(false)

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.menu.list(restaurantId),
  })
  const { data: menuCats = [] } = useQuery({
    queryKey: ['menu-cats', restaurantId],
    queryFn: () => api.menuCategorias.list(restaurantId),
  })

  // Items activos agrupados por categoría
  const byCategoria: Record<string, MenuItem[]> = {}
  for (const item of menuItems.filter((i: MenuItem) => i.activo)) {
    ;(byCategoria[item.categoria] ??= []).push(item)
  }

  // Orden de categorías según el menú
  const catOrder = (menuCats as { nombre: string; orden: number }[])
    .filter(c => byCategoria[c.nombre])
    .sort((a, b) => a.orden - b.orden)
    .map(c => c.nombre)

  // Inicializar cursos desde la plantilla existente (si editando)
  const [cursos, setCursos] = useState<CursoState[]>(() => {
    if (!initial) return []
    return [...initial.niveles]
      .sort((a, b) => a.nivel - b.nivel)
      .map(n => ({
        _key:     ++_ck,
        nombre:   n.nombre || '',
        platos:   n.platos?.length ? n.platos : (n.plato ? [n.plato] : []),
        esPostre: n.esPostre,
      }))
  })

  const usedCats    = new Set(cursos.map(c => c.nombre))
  const availableCats = catOrder.filter(c => !usedCats.has(c))

  const addCurso = (catNombre: string) => {
    const items = byCategoria[catNombre] ?? []
    setCursos(prev => [
      ...prev,
      {
        _key:     ++_ck,
        nombre:   catNombre,
        platos:   items.map(i => i.nombre), // todos seleccionados por defecto
        esPostre: catNombre.toLowerCase().includes('postre'),
      },
    ])
    setShowCatPicker(false)
  }

  const updateCurso = (key: number, updated: CursoState) =>
    setCursos(prev => prev.map(c => c._key === key ? updated : c))

  const removeCurso = (key: number) =>
    setCursos(prev => prev.filter(c => c._key !== key))

  const moveCurso = (key: number, dir: -1 | 1) =>
    setCursos(prev => {
      const idx  = prev.findIndex(c => c._key === key)
      const swap = idx + dir
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })

  const save = useMutation({
    mutationFn: () => {
      const niveles = cursos.map((c, i) => ({
        nivel:    i + 1,
        nombre:   c.nombre,
        platos:   c.platos,
        esPostre: c.esPostre,
      }))
      const body = { restaurantId, nombre, precio, niveles }
      return initial
        ? api.grupoMenu.update(initial.id, body)
        : api.grupoMenu.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupo-menu', restaurantId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 px-4 pt-8 pb-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {initial ? 'Editar plantilla' : 'Nueva plantilla de menú'}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Nombre + precio */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700">Nombre del menú</label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full mt-1 border border-gray-300 rounded-xl px-3 py-2 text-sm"
                placeholder="Ej: Estándar, Premium, Deluxe"
              />
            </div>
            <div className="w-28">
              <label className="text-sm font-medium text-gray-700">Precio / pax</label>
              <div className="flex items-center mt-1 border border-gray-300 rounded-xl overflow-hidden">
                <input
                  type="number"
                  min={0}
                  value={precio}
                  onChange={e => setPrecio(Number(e.target.value))}
                  className="flex-1 px-3 py-2 text-sm outline-none w-0"
                />
                <span className="px-2 text-gray-400 text-sm">€</span>
              </div>
            </div>
          </div>

          {/* Cursos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Platos incluidos por categoría</label>
                <p className="text-xs text-gray-400 mt-0.5">El orden de las categorías define los niveles de salida</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowCatPicker(v => !v)}
                  disabled={availableCats.length === 0}
                  className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 disabled:opacity-40"
                >
                  + Añadir categoría
                </button>
                {showCatPicker && availableCats.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-10 py-1 overflow-hidden">
                    {availableCats.map(cat => (
                      <button
                        key={cat}
                        onClick={() => addCurso(cat)}
                        className="w-full text-left text-sm px-4 py-2.5 hover:bg-indigo-50 text-gray-700 border-b border-gray-50 last:border-0"
                      >
                        {cat}
                        <span className="ml-1 text-xs text-gray-400">
                          ({byCategoria[cat]?.length ?? 0} platos)
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {cursos.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                <p className="text-2xl mb-2">🍽</p>
                <p className="text-sm">Añade categorías del menú con el botón de arriba</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {cursos.map((c, i) => (
                  <CursoCard
                    key={c._key}
                    curso={c}
                    nivel={i + 1}
                    total={cursos.length}
                    items={byCategoria[c.nombre] ?? []}
                    onChange={updated => updateCurso(c._key, updated)}
                    onMoveUp={() => moveCurso(c._key, -1)}
                    onMoveDown={() => moveCurso(c._key, 1)}
                    onRemove={() => removeCurso(c._key)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!nombre || cursos.length === 0 || save.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-40"
          >
            {save.isPending ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Wizard generar comanda ────────────────────────────────────────────────────
function GenerarWizard({
  restaurantId,
  templates,
  planes,
  onClose,
}: {
  restaurantId: number
  templates: GrupoMenuTemplate[]
  planes: FloorPlan[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [templateId, setTemplateId] = useState<number | null>(templates[0]?.id ?? null)
  const [pax, setPax]               = useState(10)
  const [mesaId, setMesaId]         = useState<number | null>(null)
  const [incluyePostre, setPostre]  = useState(true)
  const [qtys, setQtys]             = useState<Record<string, number>>({})
  const [extraItems, setExtraItems] = useState<Array<{ nombre: string; nivel: number }>>([])
  const [pickerNivel, setPickerNivel] = useState<number | null>(null)
  const [success, setSuccess]       = useState(false)

  const template = templates.find(t => t.id === templateId)

  const { data: menuItems = [] } = useQuery({
    queryKey: ['menu', restaurantId],
    queryFn: () => api.menu.list(restaurantId),
  })

  // Mapa nombre → item completo (precio + alérgenos)
  const itemMap: Record<string, MenuItem> = {}
  for (const item of menuItems as MenuItem[]) itemMap[item.nombre] = item
  const priceMap: Record<string, number> = {}
  for (const item of menuItems as MenuItem[]) priceMap[item.nombre] = item.precio

  // Inicializar cantidades al cambiar de plantilla (1 por defecto)
  useEffect(() => {
    if (!template) return
    const init: Record<string, number> = {}
    for (const nv of template.niveles) for (const p of nv.platos ?? []) init[p] = 1
    setQtys(init)
    setExtraItems([])
    setPickerNivel(null)
  }, [templateId])

  const addExtra = (nombre: string, nivel: number) => {
    setExtraItems(prev => [...prev, { nombre, nivel }])
    setQtys(prev => ({ ...prev, [nombre]: 1 }))
    setPickerNivel(null)
  }

  const todasMesas: (Mesa & { planNombre: string })[] = planes.flatMap(p =>
    p.mesas.map(m => ({ ...m, planNombre: p.nombre }))
  )

  const budget = (template?.precio ?? 0) * pax

  const nivelesFiltrados = [...(template?.niveles ?? [])]
    .filter(nv => incluyePostre || !nv.esPostre)
    .sort((a, b) => a.nivel - b.nivel)

  const todosPlatos = nivelesFiltrados.flatMap(nv => {
    const extras = extraItems.filter(e => e.nivel === nv.nivel).map(e => e.nombre)
    return [...(nv.platos ?? []), ...extras].map(nombre => ({ nombre, nivel: nv.nivel }))
  })

  const spent = todosPlatos.reduce((sum, { nombre }) =>
    sum + (priceMap[nombre] ?? 0) * (qtys[nombre] ?? 0), 0
  )
  const pct        = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const overBudget = spent > budget
  const remaining  = budget - spent

  const setQty = (nombre: string, v: number) =>
    setQtys(prev => ({ ...prev, [nombre]: Math.max(0, v) }))

  const generar = useMutation({
    mutationFn: () => {
      const platosSeleccionados = todosPlatos
        .filter(p => (qtys[p.nombre] ?? 0) > 0)
        .map(p => ({ nombre: p.nombre, nivel: p.nivel, cantidad: qtys[p.nombre] ?? 0 }))
      return api.grupoMenu.generar(templateId!, { mesaId: mesaId!, pax, platosSeleccionados })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comandas', restaurantId] })
      setSuccess(true)
    },
  })

  if (success) {
    const mesa = todasMesas.find(m => m.id === mesaId)
    return (
      <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Comanda creada</h3>
        <p className="text-gray-500 text-sm mb-1">Mesa {mesa?.numero} · {pax} pax · {template?.nombre}</p>
        <p className="text-2xl font-black text-gray-900 mb-6">{budget.toFixed(2)} €</p>
        <button onClick={onClose} className="px-6 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-sm hover:bg-cyan-500">Cerrar</button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900">Generar comanda de grupo</h2>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Template */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Menú</label>
          <div className="flex gap-2 flex-wrap">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                  templateId === t.id
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {t.nombre}
                <span className="ml-1.5 font-normal text-xs opacity-70">{t.precio}€/pax</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pax + presupuesto */}
        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Comensales</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setPax(p => Math.max(1, p - 1))} className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 flex items-center justify-center text-lg">−</button>
              <span className="w-10 text-center font-black text-xl">{pax}</span>
              <button onClick={() => setPax(p => p + 1)} className="w-9 h-9 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 flex items-center justify-center text-lg">+</button>
            </div>
          </div>
          {template && (
            <div className="flex-1 bg-indigo-50 rounded-xl px-4 py-3 space-y-2">
              <div>
                <p className="text-xs text-indigo-400">{pax} pax × {template.precio}€</p>
                <p className="text-2xl font-black text-indigo-800">{budget.toFixed(2)} €</p>
                <p className="text-[11px] text-indigo-300">presupuesto total</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className={overBudget ? 'text-red-500 font-semibold' : 'text-indigo-400'}>
                    {overBudget ? `⚠ +${(spent - budget).toFixed(2)}€` : `Disponible: ${remaining.toFixed(2)}€`}
                  </span>
                  <span className={`font-bold ${overBudget ? 'text-red-500' : 'text-indigo-600'}`}>
                    {spent.toFixed(2)}€
                  </span>
                </div>
                <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      overBudget ? 'bg-red-400' : pct > 85 ? 'bg-amber-400' : 'bg-indigo-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Platos con cantidades ajustables */}
        {template && nivelesFiltrados.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Cantidades por plato</label>
            {nivelesFiltrados.map(nv => {
              const extrasDeNivel = extraItems.filter(e => e.nivel === nv.nivel).map(e => e.nombre)
              const platosNivel   = [...(nv.platos ?? []), ...extrasDeNivel]

              // Items de la categoría del menú que aún no están en este nivel
              const disponiblesParaAgregar = (menuItems as MenuItem[]).filter(
                i => i.activo && i.categoria === nv.nombre && !platosNivel.includes(i.nombre)
              )

              return (
                <div key={nv.nivel} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px] shrink-0">{nv.nivel}</span>
                    <span className="text-xs font-semibold text-gray-600 flex-1">{nv.nombre || `Nivel ${nv.nivel}`}</span>
                    {nv.esPostre && <span className="text-[10px] text-pink-400 mr-1">postre</span>}
                    {/* Botón + para agregar items extra de esta categoría */}
                    {disponiblesParaAgregar.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setPickerNivel(pickerNivel === nv.nivel ? null : nv.nivel)}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                            pickerNivel === nv.nivel
                              ? 'bg-indigo-500 text-white'
                              : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                          }`}
                          title="Agregar plato de esta categoría"
                        >+</button>
                        {pickerNivel === nv.nivel && (
                          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide px-3 py-1.5 border-b border-gray-50">
                              Agregar de {nv.nombre}
                            </p>
                            <div className="max-h-44 overflow-y-auto">
                              {disponiblesParaAgregar.map(item => (
                                <button
                                  key={item.id}
                                  onClick={() => addExtra(item.nombre, nv.nivel)}
                                  className="w-full text-left text-xs px-3 py-2 hover:bg-indigo-50 text-gray-700 flex items-center justify-between"
                                >
                                  <span>{item.nombre}</span>
                                  {item.precio > 0 && <span className="text-gray-400 ml-2">{item.precio.toFixed(2)}€</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {platosNivel.map(plato => {
                      const precio  = priceMap[plato] ?? 0
                      const qty     = qtys[plato] ?? 0
                      const isExtra = extrasDeNivel.includes(plato)
                      return (
                        <div key={plato} className={`flex items-center gap-3 px-3 py-2.5 ${isExtra ? 'bg-indigo-50/50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm text-gray-800 truncate">{plato}</p>
                              {isExtra && <span className="text-[10px] bg-indigo-100 text-indigo-500 rounded-full px-1.5 shrink-0">extra</span>}
                              {!!itemMap[plato]?.alergenos && <AlergenosInline mask={itemMap[plato].alergenos} />}
                            </div>
                            {precio > 0 && (
                              <p className="text-xs text-gray-400">
                                {precio.toFixed(2)}€ · subtotal <span className="font-medium text-gray-600">{(precio * qty).toFixed(2)}€</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setQty(plato, qty - 1)}
                              className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 flex items-center justify-center"
                            >−</button>
                            <span className={`w-7 text-center font-black text-sm ${qty === 0 ? 'text-gray-300' : 'text-gray-900'}`}>{qty}</span>
                            <button
                              onClick={() => setQty(plato, qty + 1)}
                              disabled={overBudget && precio > 0}
                              className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 flex items-center justify-center disabled:opacity-30"
                            >+</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Barra de presupuesto */}
            <div className="pt-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={overBudget ? 'text-red-500 font-semibold' : 'text-gray-400'}>
                  {overBudget
                    ? `⚠ Se excede ${(spent - budget).toFixed(2)}€`
                    : `Disponible: ${remaining.toFixed(2)}€`}
                </span>
                <span className={`font-bold ${overBudget ? 'text-red-500' : 'text-gray-700'}`}>
                  {spent.toFixed(2)}€ / {budget.toFixed(2)}€
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    overBudget ? 'bg-red-400' : pct > 85 ? 'bg-amber-400' : 'bg-indigo-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Postre toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setPostre(p => !p)}
            className={`w-11 h-6 rounded-full transition-colors ${incluyePostre ? 'bg-cyan-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full m-0.5 transition-transform shadow ${incluyePostre ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-gray-700">Incluye postre</span>
        </label>

        {/* Mesa */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Mesa</label>
          <select
            value={mesaId ?? ''}
            onChange={e => setMesaId(Number(e.target.value) || null)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="">Seleccionar mesa…</option>
            {todasMesas.map(m => (
              <option key={m.id} value={m.id}>Mesa {m.numero} — {m.planNombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-6 pb-6">
        <button
          onClick={() => generar.mutate()}
          disabled={!templateId || !mesaId || pax === 0 || overBudget || generar.isPending}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black text-lg hover:opacity-90 disabled:opacity-30 transition-opacity active:scale-95"
        >
          {generar.isPending ? 'Creando comanda…' : `Crear comanda · ${budget.toFixed(2)} €`}
        </button>
        {generar.isError && (
          <p className="text-red-500 text-xs text-center mt-2">{(generar.error as Error).message}</p>
        )}
      </div>
    </div>
  )
}

// ── Modal agendar grupo ───────────────────────────────────────────────────────
function AgendarModal({
  restaurantId,
  templates,
  initial,
  onClose,
}: {
  restaurantId: number
  templates: GrupoMenuTemplate[]
  initial?: GrupoAgendado
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [templateId, setTemplateId] = useState<number>(initial?.templateId ?? (templates[0]?.id ?? 0))
  const [fecha, setFecha]           = useState(initial ? initial.fecha.slice(0, 10) : todayISO())
  const [notas, setNotas]           = useState(initial?.notas ?? '')
  const [restricciones, setR]       = useState<GrupoMenuRestricciones>(
    initial?.restricciones ?? { normales: 10, vegetarianos: 0, sinCerdo: 0, sinGluten: 0 }
  )

  const totalPax = Object.values(restricciones).reduce((s, v) => s + v, 0)
  const template = templates.find(t => t.id === templateId)

  const setR_ = (k: keyof GrupoMenuRestricciones, v: number) =>
    setR(prev => ({ ...prev, [k]: Math.max(0, v) }))

  const save = useMutation({
    mutationFn: () => {
      const body = { restaurantId, templateId, fecha, pax: totalPax, restricciones, notas: notas || undefined }
      return initial
        ? api.grupoMenu.agendados.update(initial.id, body)
        : api.grupoMenu.agendados.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupo-agendados', restaurantId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 px-4 pt-12 pb-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {initial ? 'Editar grupo programado' : 'Programar grupo'}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Menú */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Menú</label>
            <div className="flex gap-2 flex-wrap">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                    templateId === t.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t.nombre}
                  <span className="ml-1 font-normal text-xs opacity-70">{t.precio}€/pax</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Fecha del evento</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>

          {/* Comensales */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Comensales</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'normales',     label: 'Sin restricción', color: 'text-gray-700' },
                { key: 'vegetarianos', label: 'Vegetarianos',    color: 'text-emerald-600' },
                { key: 'sinCerdo',     label: 'Sin cerdo',       color: 'text-orange-500' },
                { key: 'sinGluten',    label: 'Sin gluten',      color: 'text-purple-500' },
              ] as const).map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <span className={`text-xs font-medium flex-1 ${color}`}>{label}</span>
                  <button onClick={() => setR_(key, restricciones[key] - 1)} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600 font-bold hover:bg-gray-100 flex items-center justify-center text-base">−</button>
                  <span className="w-6 text-center font-black text-sm">{restricciones[key]}</span>
                  <button onClick={() => setR_(key, restricciones[key] + 1)} className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-600 font-bold hover:bg-gray-100 flex items-center justify-center text-base">+</button>
                </div>
              ))}
            </div>
          </div>

          {/* Total estimado */}
          {template && totalPax > 0 && (
            <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-indigo-600">{totalPax} pax · {template.nombre}</span>
              <span className="text-lg font-black text-indigo-700">{(template.precio * totalPax).toFixed(2)} €</span>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Notas</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Ej: Cumpleaños, alergia frutos secos confirmada…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!templateId || !fecha || totalPax === 0 || save.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-40"
          >
            {save.isPending ? 'Guardando…' : initial ? 'Guardar cambios' : 'Programar grupo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal asignar a mesa ──────────────────────────────────────────────────────
function AsignarModal({
  agendado,
  planes,
  onClose,
}: {
  agendado: GrupoAgendado
  planes: FloorPlan[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [mesaId, setMesaId]        = useState<number | null>(null)
  const [incluyePostre, setPostre] = useState(true)
  const [success, setSuccess]      = useState(false)

  const todasMesas: (Mesa & { planNombre: string })[] = planes.flatMap(p =>
    p.mesas.map(m => ({ ...m, planNombre: p.nombre }))
  )

  const totalPax = Object.values(agendado.restricciones).reduce((s, v) => s + v, 0)
  const total    = agendado.template.precio * totalPax

  const asignar = useMutation({
    mutationFn: () => api.grupoMenu.agendados.asignar(agendado.id, {
      mesaId: mesaId!,
      incluyePostre,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupo-agendados', agendado.restaurantId] })
      qc.invalidateQueries({ queryKey: ['comandas', agendado.restaurantId] })
      setSuccess(true)
    },
  })

  if (success) {
    const mesa = todasMesas.find(m => m.id === mesaId)
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
        <div className="bg-white rounded-2xl p-8 text-center shadow-2xl w-full max-w-sm">
          <div className="text-5xl mb-3">🎉</div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">Comanda creada</h3>
          <p className="text-gray-500 text-sm mb-1">Mesa {mesa?.numero} · {totalPax} pax · {agendado.template.nombre}</p>
          <p className="text-2xl font-black text-gray-900 mb-6">{total.toFixed(2)} €</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-500">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 px-4 pt-16">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Asignar a mesa</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {agendado.template.nombre} · {totalPax} pax · {fmtFecha(agendado.fecha)}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Mesa</label>
            <select
              value={mesaId ?? ''}
              onChange={e => setMesaId(Number(e.target.value) || null)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white"
            >
              <option value="">Seleccionar mesa…</option>
              {todasMesas.map(m => (
                <option key={m.id} value={m.id}>Mesa {m.numero} — {m.planNombre}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setPostre(p => !p)}
              className={`w-11 h-6 rounded-full transition-colors ${incluyePostre ? 'bg-indigo-500' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full m-0.5 transition-transform shadow ${incluyePostre ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm font-medium text-gray-700">Incluye postre</span>
          </label>

          <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-indigo-600">{totalPax} pax · {agendado.template.nombre}</span>
            <span className="text-lg font-black text-indigo-700">{total.toFixed(2)} €</span>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => asignar.mutate()}
            disabled={!mesaId || asignar.isPending}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-40"
          >
            {asignar.isPending ? 'Creando comanda…' : 'Asignar y crear comanda'}
          </button>
        </div>

        {asignar.isError && (
          <p className="text-red-500 text-xs text-center pb-4">
            {(asignar.error as Error).message}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Card de grupo agendado ────────────────────────────────────────────────────
function AgendadoCard({
  agendado,
  planes,
  templates,
  restaurantId,
  onEdit,
}: {
  agendado: GrupoAgendado
  planes: FloorPlan[]
  templates: GrupoMenuTemplate[]
  restaurantId: number
  onEdit: (a: GrupoAgendado) => void
}) {
  const qc = useQueryClient()
  const [asignando, setAsignando] = useState(false)

  const isHoy = agendado.fecha.slice(0, 10) === todayISO()
  const isPasado = new Date(agendado.fecha) < new Date(new Date().toDateString())

  const cancelar = useMutation({
    mutationFn: () => api.grupoMenu.agendados.update(agendado.id, { estado: 'cancelado' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grupo-agendados', restaurantId] }),
  })

  const totalPax = Object.values(agendado.restricciones).reduce((s, v) => s + v, 0)
  const total    = agendado.template.precio * totalPax

  const r = agendado.restricciones
  const rDesc = [
    r.normales     > 0 ? `${r.normales} normales` : null,
    r.vegetarianos > 0 ? `${r.vegetarianos} veg` : null,
    r.sinCerdo     > 0 ? `${r.sinCerdo} sin cerdo` : null,
    r.sinGluten    > 0 ? `${r.sinGluten} sin gluten` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <div className={`bg-white border rounded-2xl p-4 shadow-sm ${
        agendado.estado === 'asignado' ? 'border-green-200 bg-green-50/30' :
        isHoy ? 'border-indigo-300 ring-1 ring-indigo-200' :
        isPasado ? 'border-gray-200 opacity-60' :
        'border-gray-200'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg shrink-0 font-black ${
            agendado.estado === 'asignado' ? 'bg-green-500' :
            isHoy ? 'bg-indigo-600' : 'bg-gray-400'
          }`}>
            {agendado.estado === 'asignado' ? '✓' : isHoy ? '!' : '📅'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{agendado.template.nombre}</span>
              {isHoy && agendado.estado === 'pendiente' && (
                <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold">HOY</span>
              )}
              {agendado.estado === 'asignado' && (
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Asignado</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{fmtFecha(agendado.fecha)} · {totalPax} pax</p>
            <p className="text-xs text-gray-400 mt-0.5">{rDesc}</p>
            {agendado.notas && (
              <p className="text-xs text-gray-500 mt-1 italic">"{agendado.notas}"</p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p className="text-base font-black text-gray-900">{total.toFixed(2)} €</p>
            <p className="text-xs text-gray-400">{agendado.template.precio}€/pax</p>
          </div>
        </div>

        {agendado.estado === 'pendiente' && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setAsignando(true)}
              disabled={!templates.length}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-40"
            >
              Asignar a mesa
            </button>
            <button
              onClick={() => onEdit(agendado)}
              className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
            >
              Editar
            </button>
            <button
              onClick={() => { if (confirm('¿Cancelar este grupo?')) cancelar.mutate() }}
              className="px-3 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {asignando && (
        <AsignarModal
          agendado={agendado}
          planes={planes}
          onClose={() => setAsignando(false)}
        />
      )}
    </>
  )
}

// ── Tab Programados ───────────────────────────────────────────────────────────
function ProgramadosTab({
  restaurantId,
  templates,
  planes,
}: {
  restaurantId: number
  templates: GrupoMenuTemplate[]
  planes: FloorPlan[]
}) {
  const [agendando, setAgendando] = useState<GrupoAgendado | null | 'new'>(null)

  const { data: agendados = [] } = useQuery({
    queryKey: ['grupo-agendados', restaurantId],
    queryFn: () => api.grupoMenu.agendados.list(restaurantId),
    enabled: !!restaurantId,
  })

  // Separar hoy + próximos de pasados
  const today = todayISO()
  const proximos = agendados.filter(a => a.fecha.slice(0, 10) >= today)
  const pasados  = agendados.filter(a => a.fecha.slice(0, 10) < today)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Grupos programados para fechas concretas</p>
        <button
          onClick={() => setAgendando('new')}
          disabled={templates.length === 0}
          className="text-sm px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 disabled:opacity-40"
        >
          + Programar grupo
        </button>
      </div>

      {agendados.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm">Sin grupos programados. Usa el botón para agendar uno.</p>
        </div>
      )}

      {proximos.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Próximos</h3>
          {proximos.map(a => (
            <AgendadoCard
              key={a.id}
              agendado={a}
              planes={planes}
              templates={templates}
              restaurantId={restaurantId}
              onEdit={setAgendando}
            />
          ))}
        </div>
      )}

      {pasados.length > 0 && (
        <details>
          <summary className="text-sm font-medium text-gray-400 cursor-pointer hover:text-gray-600 mb-3">
            Ver historial ({pasados.length})
          </summary>
          <div className="space-y-3 mt-3">
            {pasados.map(a => (
              <AgendadoCard
                key={a.id}
                agendado={a}
                planes={planes}
                templates={templates}
                restaurantId={restaurantId}
                onEdit={setAgendando}
              />
            ))}
          </div>
        </details>
      )}

      {agendando && (
        <AgendarModal
          restaurantId={restaurantId}
          templates={templates}
          initial={agendando === 'new' ? undefined : agendando}
          onClose={() => setAgendando(null)}
        />
      )}
    </div>
  )
}

// ── Page principal ────────────────────────────────────────────────────────────
export default function GrupoMenuPage() {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [editando, setEditando]         = useState<GrupoMenuTemplate | null | 'new'>(null)
  const [tab, setTab]                   = useState<'plantillas' | 'programados'>('plantillas')

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  useEffect(() => {
    if (!restaurantId && restaurantes?.length) setRestaurantId(restaurantes[0].id)
  }, [restaurantes, restaurantId])

  const { data: templates = [] } = useQuery({
    queryKey: ['grupo-menu', restaurantId],
    queryFn: () => api.grupoMenu.list(restaurantId!),
    enabled: !!restaurantId,
  })

  const { data: planes = [] } = useQuery({
    queryKey: ['salon-planes', restaurantId],
    queryFn: () => api.salon.list(restaurantId!),
    enabled: !!restaurantId,
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: number) => api.grupoMenu.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grupo-menu', restaurantId] }),
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Menús de grupo</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configura menús cerrados y programa grupos para fechas concretas</p>
        </div>

        {/* Selector de restaurante */}
        <div className="flex gap-1">
          {restaurantes?.map((r: Restaurante) => (
            <button
              key={r.id}
              onClick={() => setRestaurantId(r.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                restaurantId === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {(['plantillas', 'programados'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize ${
              tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'plantillas' ? 'Plantillas' : 'Programados'}
          </button>
        ))}
      </div>

      {/* ── Tab Plantillas ── */}
      {tab === 'plantillas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna izquierda: plantillas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800">Plantillas</h2>
              <button
                onClick={() => setEditando('new')}
                className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-700"
              >
                + Nueva plantilla
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                <p className="text-3xl mb-2">🍽</p>
                <p className="text-sm">Sin plantillas. Crea una para empezar.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((t: GrupoMenuTemplate) => (
                  <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900">{t.nombre}</h3>
                        <p className="text-2xl font-black text-gray-800">{t.precio}€ <span className="text-sm font-normal text-gray-400">/ persona</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditando(t)}
                          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar plantilla "${t.nombre}"?`)) deleteTemplate.mutate(t.id) }}
                          className="text-xs px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 mt-1">
                      {[...t.niveles].sort((a, b) => a.nivel - b.nivel).map((nv, i) => (
                        <div key={i}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px] shrink-0">{nv.nivel}</span>
                            <span className="text-xs font-semibold text-gray-700">
                              {nv.nombre || nv.plato || '—'}
                            </span>
                            {nv.esPostre && <span className="text-[10px] text-pink-400 font-medium">postre</span>}
                          </div>
                          {nv.platos && nv.platos.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-6">
                              {nv.platos.map((p, j) => (
                                <span key={j} className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Columna derecha: wizard generar */}
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-3">Generar comanda</h2>
            {templates.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                <p className="text-sm">Crea una plantilla primero</p>
              </div>
            ) : (
              <GenerarWizard
                restaurantId={restaurantId!}
                templates={templates}
                planes={planes as FloorPlan[]}
                onClose={() => {}}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Tab Programados ── */}
      {tab === 'programados' && restaurantId && (
        <ProgramadosTab
          restaurantId={restaurantId}
          templates={templates}
          planes={planes as FloorPlan[]}
        />
      )}

      {/* Modal editor de plantilla */}
      {editando && (
        <TemplateModal
          restaurantId={restaurantId!}
          initial={editando === 'new' ? undefined : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}
