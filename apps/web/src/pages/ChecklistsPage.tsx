import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ChecklistSector, ChecklistItem } from '../api'

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400'
// Clases Tailwind literales (no interpolar — el purge las eliminaría)
const MOMENTOS = [
  { key: 'apertura' as const, label: 'Apertura', icon: '🔓', textCls: 'text-emerald-600' },
  { key: 'cierre'   as const, label: 'Cierre',   icon: '🔒', textCls: 'text-indigo-600'  },
]

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ── Editor de ítems de un momento (apertura o cierre) ─────────────────────────
function ItemsEditor({
  sectorId,
  momento,
  items,
  onChange,
}: {
  sectorId: number
  momento: 'apertura' | 'cierre'
  items: ChecklistItem[]
  onChange: () => void
}) {
  const [nuevo, setNuevo] = useState('')

  const crear = useMutation({
    mutationFn: (texto: string) =>
      api.checklists.createItem({ sectorId, momento, texto, orden: items.length }),
    onSuccess: () => { setNuevo(''); onChange() },
  })
  const eliminar = useMutation({
    mutationFn: (id: number) => api.checklists.deleteItem(id),
    onSuccess: onChange,
  })

  const añadir = () => { if (nuevo.trim()) crear.mutate(nuevo.trim()) }

  return (
    <div className="space-y-1.5">
      {items.length === 0 && <p className="text-xs text-gray-300">Sin ítems.</p>}
      {items.map(it => (
        <div key={it.id} className="flex items-center gap-2 group">
          <span className="text-gray-300">☐</span>
          <span className="text-sm text-gray-700 flex-1">{it.texto}</span>
          <button
            onClick={() => eliminar.mutate(it.id)}
            className="text-xs text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') añadir() }}
          placeholder="+ Añadir ítem…"
          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-cyan-400"
        />
        <button
          onClick={añadir}
          disabled={!nuevo.trim() || crear.isPending}
          className="text-xs font-semibold text-cyan-600 hover:text-cyan-800 disabled:opacity-30 px-2"
        >
          Añadir
        </button>
      </div>
    </div>
  )
}

// ── Card de un sector (configuración) ─────────────────────────────────────────
function SectorCard({ sector, onChange }: { sector: ChecklistSector; onChange: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(sector.nombre)

  const renombrar = useMutation({
    mutationFn: () => api.checklists.updateSector(sector.id, { nombre }),
    onSuccess: () => { setEditando(false); onChange() },
  })
  const eliminar = useMutation({
    mutationFn: () => api.checklists.deleteSector(sector.id),
    onSuccess: onChange,
  })

  const items = sector.items ?? []

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        {editando ? (
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') renombrar.mutate() }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold"
            autoFocus
          />
        ) : (
          <span className="font-bold text-gray-800">📍 {sector.nombre}</span>
        )}
        <div className="flex items-center gap-3">
          {editando ? (
            <button onClick={() => renombrar.mutate()} className="text-xs font-semibold text-cyan-600">Guardar</button>
          ) : (
            <button onClick={() => setEditando(true)} className="text-xs text-gray-400 hover:text-gray-600">Renombrar</button>
          )}
          <button
            onClick={() => { if (confirm(`¿Eliminar el sector "${sector.nombre}", sus ítems y su histórico?`)) eliminar.mutate() }}
            className="text-xs text-red-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {MOMENTOS.map(m => (
          <div key={m.key} className="p-4">
            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${m.textCls}`}>
              {m.icon} {m.label}
            </p>
            <ItemsEditor
              sectorId={sector.id}
              momento={m.key}
              items={items.filter(i => i.momento === m.key)}
              onChange={onChange}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab Registro (histórico de ejecuciones del día) ───────────────────────────
function RegistroTab({ restaurantId }: { restaurantId: number }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)

  const { data: ejecuciones = [] } = useQuery({
    queryKey: ['checklist-ejec', restaurantId, fecha],
    queryFn: () => api.checklists.listEjecuciones(restaurantId, fecha),
  })

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-500">Fecha:</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm" />
      </div>

      {ejecuciones.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">Sin checklists completados ese día.</p>
      )}

      <div className="space-y-3">
        {ejecuciones.map(ej => {
          const total = ej.itemsMarcados.length
          const marcados = ej.itemsMarcados.filter(i => i.marcado).length
          const completo = marcados === total && total > 0
          const m = MOMENTOS.find(x => x.key === ej.momento)!
          return (
            <div key={ej.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800">📍 {ej.sector?.nombre ?? 'Sector'}</span>
                  <span className={`text-xs font-semibold ${m.textCls}`}>{m.icon} {m.label}</span>
                </div>
                <span className={`text-xs font-bold ${completo ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {marcados}/{total} {completo ? '✓' : '⚠️'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {ej.completadoPor} · {fmtHora(ej.fecha)}
              </p>
              {marcados < total && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ej.itemsMarcados.filter(i => !i.marcado).map((i, idx) => (
                    <span key={idx} className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md">
                      ✗ {i.texto}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ChecklistsPage() {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [tab, setTab] = useState<'config' | 'registro'>('config')
  const [creandoSector, setCreandoSector] = useState('')

  const { data: restaurantes = [] } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  // Auto-seleccionar el primer restaurante
  const rid = restaurantId ?? restaurantes[0]?.id ?? null

  const { data: sectores = [] } = useQuery<ChecklistSector[]>({
    queryKey: ['checklist-sectores', rid],
    queryFn: () => api.checklists.listSectores(rid as number),
    enabled: rid !== null,
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['checklist-sectores'] })
    qc.invalidateQueries({ queryKey: ['checklist-ejec'] })
  }

  const crearSector = useMutation({
    mutationFn: (nombre: string) =>
      api.checklists.createSector({ restaurantId: rid as number, nombre, orden: sectores.length }),
    onSuccess: () => { setCreandoSector(''); invalidar() },
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-gray-800 mb-1">✅ Checklists</h1>
      <p className="text-sm text-gray-400 mb-4">Apertura y cierre por sector. El personal los completa desde la app de sala.</p>

      {/* Selector de restaurante */}
      <div className="flex flex-wrap gap-2 mb-5">
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => setRestaurantId(r.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              rid === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {([['config', '⚙️ Configurar'], ['registro', '📋 Registro']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rid === null && <p className="text-sm text-gray-400 text-center py-10">No hay restaurantes.</p>}

      {rid !== null && tab === 'config' && (
        <div className="space-y-4">
          {sectores.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              Sin sectores todavía. Añadí el primero (ej: “Barra 1”).
            </p>
          )}
          {sectores.map(s => (
            <SectorCard key={s.id} sector={s} onChange={invalidar} />
          ))}

          {/* Añadir sector */}
          <div className="flex items-center gap-2 bg-white rounded-2xl border border-dashed border-gray-300 px-4 py-3">
            <input
              value={creandoSector}
              onChange={e => setCreandoSector(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && creandoSector.trim()) crearSector.mutate(creandoSector.trim()) }}
              placeholder="Nombre del sector (ej: Barra 1, Sala 2, Paso)"
              className={inputCls}
            />
            <button
              onClick={() => { if (creandoSector.trim()) crearSector.mutate(creandoSector.trim()) }}
              disabled={!creandoSector.trim() || crearSector.isPending}
              className="text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 px-4 py-2 rounded-xl whitespace-nowrap"
            >
              + Sector
            </button>
          </div>
        </div>
      )}

      {rid !== null && tab === 'registro' && <RegistroTab restaurantId={rid} />}
    </div>
  )
}
