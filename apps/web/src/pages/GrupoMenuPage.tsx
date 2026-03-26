import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  GrupoMenuTemplate,
  GrupoMenuNivel,
  GrupoMenuRestricciones,
  FloorPlan,
  Mesa,
  Restaurante,
} from '../api'

// ── Formulario de niveles ─────────────────────────────────────────────────────
function NivelRow({
  nivel,
  onChange,
  onRemove,
}: {
  nivel: GrupoMenuNivel & { _key: number }
  onChange: (n: GrupoMenuNivel & { _key: number }) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-700 flex items-center justify-center font-black text-sm shrink-0">
          {nivel.nivel}
        </div>
        <input
          type="number"
          min={1}
          value={nivel.nivel}
          onChange={e => onChange({ ...nivel, nivel: Number(e.target.value) })}
          className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm"
          placeholder="Nº"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500 ml-auto">
          <input
            type="checkbox"
            checked={nivel.esPostre}
            onChange={e => onChange({ ...nivel, esPostre: e.target.checked })}
            className="rounded"
          />
          Postre
        </label>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none ml-1">×</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 font-medium">Plato base</label>
          <input
            value={nivel.plato}
            onChange={e => onChange({ ...nivel, plato: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm mt-0.5"
            placeholder="Ej: Carrillera"
          />
        </div>
        <div>
          <label className="text-xs text-emerald-600 font-medium">Alternativa vegetariana</label>
          <input
            value={nivel.vegetariano ?? ''}
            onChange={e => onChange({ ...nivel, vegetariano: e.target.value || null })}
            className="w-full border border-emerald-200 rounded-lg px-2 py-1 text-sm mt-0.5"
            placeholder="Vacío = mismo plato"
          />
        </div>
        <div>
          <label className="text-xs text-orange-500 font-medium">Alternativa sin cerdo</label>
          <input
            value={nivel.sinCerdo ?? ''}
            onChange={e => onChange({ ...nivel, sinCerdo: e.target.value || null })}
            className="w-full border border-orange-200 rounded-lg px-2 py-1 text-sm mt-0.5"
            placeholder="Vacío = mismo plato"
          />
        </div>
        <div>
          <label className="text-xs text-purple-500 font-medium">Alternativa sin gluten</label>
          <input
            value={nivel.sinGluten ?? ''}
            onChange={e => onChange({ ...nivel, sinGluten: e.target.value || null })}
            className="w-full border border-purple-200 rounded-lg px-2 py-1 text-sm mt-0.5"
            placeholder="Vacío = mismo plato"
          />
        </div>
      </div>
    </div>
  )
}

// ── Modal editor de plantilla ─────────────────────────────────────────────────
let _key = 0
const newNivel = (): GrupoMenuNivel & { _key: number } => ({
  _key: ++_key,
  nivel: 1,
  plato: '',
  vegetariano: null,
  sinCerdo: null,
  sinGluten: null,
  esPostre: false,
})

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
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [precio, setPrecio] = useState(initial?.precio ?? 27)
  const [niveles, setNiveles] = useState<(GrupoMenuNivel & { _key: number })[]>(
    initial?.niveles.map(n => ({ ...n, _key: ++_key })) ?? [newNivel()]
  )

  const save = useMutation({
    mutationFn: () => {
      const body = { restaurantId, nombre, precio, niveles: niveles.map(({ _key: _, ...n }) => n) }
      return initial
        ? api.grupoMenu.update(initial.id, body)
        : api.grupoMenu.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupo-menu', restaurantId] })
      onClose()
    },
  })

  const addNivel = () => {
    const last = niveles[niveles.length - 1]
    setNiveles(prev => [...prev, { ...newNivel(), nivel: (last?.nivel ?? 0) + 1 }])
  }

  const updateNivel = (key: number, updated: GrupoMenuNivel & { _key: number }) => {
    setNiveles(prev => prev.map(n => n._key === key ? updated : n))
  }

  const removeNivel = (key: number) => {
    setNiveles(prev => prev.filter(n => n._key !== key))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 px-4 pt-12 pb-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {initial ? 'Editar plantilla' : 'Nueva plantilla de menú'}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Nombre y precio */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700">Nombre</label>
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

          {/* Niveles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Platos por nivel de salida</label>
              <button
                onClick={addNivel}
                className="text-xs px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-lg font-medium hover:bg-cyan-100"
              >
                + Añadir nivel
              </button>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {niveles.map(n => (
                <NivelRow
                  key={n._key}
                  nivel={n}
                  onChange={updated => updateNivel(n._key, updated)}
                  onRemove={() => removeNivel(n._key)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!nombre || niveles.length === 0 || save.isPending}
            className="flex-1 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-500 disabled:opacity-40"
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
  const [mesaId, setMesaId]         = useState<number | null>(null)
  const [incluyePostre, setPostre]  = useState(true)
  const [restricciones, setR]       = useState<GrupoMenuRestricciones>({
    normales: 10, vegetarianos: 0, sinCerdo: 0, sinGluten: 0,
  })
  const [success, setSuccess]       = useState(false)

  const template = templates.find(t => t.id === templateId)
  const todasMesas: (Mesa & { planNombre: string })[] = planes.flatMap(p =>
    p.mesas.map(m => ({ ...m, planNombre: p.nombre }))
  )
  const totalPax = Object.values(restricciones).reduce((s, v) => s + v, 0)
  const total = template ? template.precio * totalPax : 0

  const generar = useMutation({
    mutationFn: () => api.grupoMenu.generar(templateId!, {
      mesaId: mesaId!,
      incluyePostre,
      restricciones,
    }),
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
        <p className="text-gray-500 text-sm mb-1">Mesa {mesa?.numero} · {totalPax} pax · {template?.nombre}</p>
        <p className="text-2xl font-black text-gray-900 mb-6">{total.toFixed(2)} €</p>
        <button onClick={onClose} className="px-6 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-sm hover:bg-cyan-500">
          Cerrar
        </button>
      </div>
    )
  }

  const setR_ = (k: keyof GrupoMenuRestricciones, v: number) =>
    setR(prev => ({ ...prev, [k]: Math.max(0, v) }))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900">Generar comanda de grupo</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configura el grupo y se creará la comanda con los platos y niveles listos</p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Menú */}
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

        {/* Postre */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setPostre(p => !p)}
            className={`w-11 h-6 rounded-full transition-colors ${incluyePostre ? 'bg-cyan-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full m-0.5 transition-transform shadow ${incluyePostre ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-gray-700">Incluye postre</span>
        </label>

        {/* Restricciones */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Comensales</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'normales',     label: 'Sin restricción',  color: 'text-gray-700' },
              { key: 'vegetarianos', label: 'Vegetarianos',     color: 'text-emerald-600' },
              { key: 'sinCerdo',     label: 'Sin cerdo',        color: 'text-orange-500' },
              { key: 'sinGluten',    label: 'Sin gluten',       color: 'text-purple-500' },
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

        {/* Preview total */}
        {template && totalPax > 0 && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {totalPax} pax × {template.precio}€ · {template.nombre}
              {!incluyePostre && <span className="ml-1 text-gray-400">(sin postre)</span>}
            </div>
            <span className="text-lg font-black text-gray-900">{total.toFixed(2)} €</span>
          </div>
        )}

        {/* Previsualización de platos */}
        {template && totalPax > 0 && (
          <details className="text-xs text-gray-500 cursor-pointer">
            <summary className="font-medium text-gray-600 hover:text-gray-800">Ver platos que se generarán</summary>
            <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-100">
              {template.niveles
                .filter(nv => incluyePostre || !nv.esPostre)
                .sort((a, b) => a.nivel - b.nivel)
                .map((nv, i) => {
                  const dishes = new Map<string, number>()
                  const add = (p: string, q: number) => { if (q > 0) dishes.set(p, (dishes.get(p) ?? 0) + q) }
                  add(nv.plato, restricciones.normales)
                  add(nv.vegetariano ?? nv.plato, restricciones.vegetarianos)
                  add(nv.sinCerdo ?? nv.plato, restricciones.sinCerdo)
                  add(nv.sinGluten ?? nv.plato, restricciones.sinGluten)
                  return (
                    <div key={i} className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center font-bold shrink-0">{nv.nivel}</span>
                      <span>{[...dishes.entries()].map(([p, q]) => `${q}× ${p}`).join(' · ')}</span>
                    </div>
                  )
                })}
            </div>
          </details>
        )}
      </div>

      <div className="px-6 pb-6">
        <button
          onClick={() => generar.mutate()}
          disabled={!templateId || !mesaId || totalPax === 0 || generar.isPending}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black text-lg hover:opacity-90 disabled:opacity-30 transition-opacity active:scale-95"
        >
          {generar.isPending ? 'Creando comanda…' : `Crear comanda · ${total.toFixed(2)} €`}
        </button>
        {generar.isError && (
          <p className="text-red-500 text-xs text-center mt-2">
            {(generar.error as Error).message}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Page principal ────────────────────────────────────────────────────────────
export default function GrupoMenuPage() {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [editando, setEditando]         = useState<GrupoMenuTemplate | null | 'new'>(null)

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
          <p className="text-gray-500 text-sm mt-0.5">Configura los menús cerrados y genera comandas para grupos</p>
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

                  {/* Vista previa de niveles */}
                  <div className="space-y-1">
                    {t.niveles.sort((a, b) => a.nivel - b.nivel).map((nv, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                        <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold shrink-0">{nv.nivel}</span>
                        <span className="font-medium text-gray-700">{nv.plato}</span>
                        {nv.vegetariano && <span className="text-emerald-600">· {nv.vegetariano}</span>}
                        {nv.sinCerdo    && <span className="text-orange-500">· {nv.sinCerdo}</span>}
                        {nv.sinGluten   && <span className="text-purple-500">· {nv.sinGluten}</span>}
                        {nv.esPostre    && <span className="text-pink-400 ml-auto">postre</span>}
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

      {/* Modal editor */}
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
