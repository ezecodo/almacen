import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem, FloorPlan, GrupoAgendado, GrupoMenuRestricciones, StaffingForecastDay } from '../api'
import { useAdminEvents } from '../hooks/useAdminEvents'

const now = new Date()
const fecha = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

const FONT: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  fontWeight: 900,
  fontSize: '4rem',
  lineHeight: 1,
  letterSpacing: '-0.03em',
}

function Vineta({ width, drawCheck }: { width: number; drawCheck: boolean }) {
  const h = Math.round(width * 72 / 68)
  return (
    <svg width={width} height={h} viewBox="0 0 68 72">
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4B9EDF" />
          <stop offset="100%" stopColor="#4CC8A0" />
        </linearGradient>
      </defs>
      <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#vg)" />
      <path
        d="M15 34 L29 48 L55 18"
        fill="none" stroke="white" strokeWidth="7"
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="61"
        strokeDashoffset={drawCheck ? 0 : 61}
        style={{ transition: drawCheck ? 'stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1) 0.25s' : 'none' }}
      />
    </svg>
  )
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m > 0 ? `${m}m` : ''}`
}

// ── Widget: Turnos activos ─────────────────────────────────────────────────────
function TurnosWidget() {
  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['turnos-activos-global'],
    queryFn: () => api.turnos.getActivos(),
    refetchInterval: 30_000,
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="font-bold text-gray-800 text-sm">Turnos activos</h2>
        </div>
        <span className="text-xs text-gray-400">{turnos.length} restaurante{turnos.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-gray-300 text-sm">Cargando…</div>
      ) : turnos.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-400 text-sm">Ningún turno abierto ahora mismo</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {turnos.map(t => (
            <div key={t.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">{t.restaurant.nombre}</p>
                {t.encargadoNombre && (
                  <p className="text-xs text-gray-400">👤 {t.encargadoNombre}</p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {timeAgo(t.aperturaAt)} abierto
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Widget: Google Reviews ─────────────────────────────────────────────────────
function ReviewsWidget() {
  const qc = useQueryClient()
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews-dashboard'],
    queryFn: () => api.reviews.list(),
    refetchInterval: 60_000,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [objetivos, setObjetivos] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  const openModal = () => {
    const initial: Record<number, string> = {}
    reviews.forEach(r => { initial[r.restaurantId] = r.tasa?.toString() ?? '' })
    setObjetivos(initial)
    setModalOpen(true)
  }

  const saveObjetivos = async () => {
    setSaving(true)
    await Promise.all(
      reviews.map(r => {
        const val = parseInt(objetivos[r.restaurantId] ?? '', 10)
        if (!isNaN(val) && val >= 1 && val !== (r.tasa ?? null)) {
          return api.reviews.setObjetivo(r.restaurantId, val)
        }
      })
    )
    await qc.invalidateQueries({ queryKey: ['reviews-dashboard'] })
    setSaving(false)
    setModalOpen(false)
  }

  const mesActual = new Date().toLocaleString('es-ES', { month: 'long' })

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">⭐</span>
            <h2 className="font-bold text-gray-800 text-sm">Google Reviews</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{reviews.filter(r => r.rating).length} restaurantes</span>
            <button onClick={openModal} className="text-gray-300 hover:text-gray-500 transition-colors" title="Configurar objetivos">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center text-gray-300 text-sm">Cargando…</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {reviews.map(r => {
              const ratingBajo = r.ratingDiff !== null && r.ratingDiff < 0
              const pct = r.objetivoDinamico && r.totalMes !== null
                ? Math.min(100, Math.round((r.totalMes / r.objetivoDinamico) * 100))
                : null
              return (
                <div key={r.restaurantId} className={`px-5 py-3 ${ratingBajo ? 'bg-red-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">{r.nombre}</p>
                    <div className="flex items-center gap-3">
                      {r.diff !== null && r.diff !== 0 && (
                        <span className={`text-xs font-medium ${r.diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.diff > 0 ? `+${r.diff}` : r.diff} hoy
                        </span>
                      )}
                      {r.rating ? (
                        <div className="flex items-center gap-1">
                          <span className="text-amber-400 text-sm">★</span>
                          <span className={`text-sm font-bold ${ratingBajo ? 'text-red-600' : 'text-gray-800'}`}>{r.rating.toFixed(1)}</span>
                          <span className="text-xs text-gray-400">({r.total})</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">Sin datos</span>
                      )}
                    </div>
                  </div>
                  {ratingBajo && (
                    <p className="text-xs text-red-500 mt-0.5">
                      ⚠️ Rating bajó {r.ratingDiff} desde ayer ({r.ratingAnterior?.toFixed(1)} → {r.rating?.toFixed(1)}) — revisar Google Maps
                    </p>
                  )}
                  {pct !== null && (
                    <div className="mt-1.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-400">{r.totalMes} / {r.objetivoDinamico} este mes ({r.paxMes} pax)</span>
                        <span className={`text-xs font-medium ${pct >= 100 ? 'text-emerald-600' : 'text-gray-500'}`}>{pct}%</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal objetivos */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Objetivo de reviews — <span className="capitalize">{mesActual}</span></h3>
              <p className="text-xs text-gray-400 mt-0.5">1 review por cada X comensales atendidos este mes</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {reviews.map(r => (
                <div key={r.restaurantId} className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 flex-1">{r.nombre}</label>
                  <span className="text-xs text-gray-400 shrink-0">1 cada</span>
                  <input
                    type="number"
                    min={1}
                    value={objetivos[r.restaurantId] ?? ''}
                    onChange={e => setObjetivos(prev => ({ ...prev, [r.restaurantId]: e.target.value }))}
                    placeholder="—"
                    className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                  <span className="text-xs text-gray-400 shrink-0">pax</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
                Cancelar
              </button>
              <button
                onClick={saveObjetivos}
                disabled={saving}
                className="text-sm bg-cyan-500 text-white px-4 py-1.5 rounded-lg hover:bg-cyan-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Widget: Grupos de hoy ──────────────────────────────────────────────────────
type AgendadoHoy = GrupoAgendado & { restaurant: { id: number; nombre: string } }

function printTicketCocina(comanda: Comanda, restaurantNombre: string, templateNombre: string) {
  const itemsCocina = comanda.items
    .filter(i => i.tipo === 'cocina')
    .sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0))

  const niveles = Array.from(new Set(itemsCocina.map(i => i.nivel))).sort((a, b) => (a ?? 0) - (b ?? 0))

  const body = `
    <html><head><title>Ticket cocina</title>
    <style>
      body { font-family: monospace; font-size: 13px; max-width: 320px; margin: 0 auto; padding: 12px; }
      h2 { font-size: 15px; text-align: center; margin: 0 0 4px; }
      p  { text-align: center; margin: 0 0 8px; font-size: 12px; }
      hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
      .nivel { font-weight: bold; font-size: 12px; margin: 8px 0 4px; text-transform: uppercase; }
      .plato { padding-left: 8px; margin: 2px 0; }
    </style></head>
    <body>
      <h2>${restaurantNombre}</h2>
      <p>MENÚ GRUPO · ${templateNombre}<br>Mesa ${comanda.mesa?.numero ?? '—'} · ${comanda.pax} pax</p>
      <hr>
      ${niveles.map(nv => {
        const items = itemsCocina.filter(i => i.nivel === nv)
        return `<div class="nivel">Nivel ${nv}</div>
          ${items.map(i => `<div class="plato">${i.cantidad}× ${i.nombre}</div>`).join('')}`
      }).join('<hr>')}
      <hr>
      <p>${new Date().toLocaleString('es-ES')}</p>
    </body></html>`

  const w = window.open('', '_blank', 'width=400,height=600')
  if (!w) return
  w.document.write(body)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 300)
}

function AsignarInline({
  agendado,
  onDone,
}: {
  agendado: AgendadoHoy
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [mesaId, setMesaId]        = useState<number | null>(null)
  const [incluyePostre, setPostre] = useState(true)
  const [comanda, setComanda]      = useState<Comanda | null>(null)

  const { data: planes = [] } = useQuery({
    queryKey: ['salon-planes', agendado.restaurantId],
    queryFn: () => api.salon.list(agendado.restaurantId),
  })

  const todasMesas = (planes as FloorPlan[]).flatMap(p =>
    p.mesas.map(m => ({ ...m, planNombre: p.nombre }))
  )

  const r = agendado.restricciones as GrupoMenuRestricciones
  const totalPax = r.normales + r.vegetarianos + r.sinCerdo + r.sinGluten

  const asignar = useMutation({
    mutationFn: () => api.grupoMenu.agendados.asignar(agendado.id, { mesaId: mesaId!, incluyePostre }),
    onSuccess: (c) => {
      setComanda(c)
      qc.invalidateQueries({ queryKey: ['grupos-pendientes-hoy'] })
    },
  })

  if (comanda) {
    return (
      <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-200 space-y-2">
        <p className="text-sm font-semibold text-green-700">
          ✓ Asignado a Mesa {comanda.mesa?.numero} · {totalPax} pax
        </p>
        <div className="text-xs text-gray-600 space-y-1">
          {Array.from(new Set(comanda.items.filter(i => i.tipo === 'cocina').map((i: ComandaItem) => i.nivel)))
            .sort((a, b) => (a ?? 0) - (b ?? 0))
            .map(nv => {
              const platos = comanda.items.filter((i: ComandaItem) => i.tipo === 'cocina' && i.nivel === nv)
              return (
                <div key={nv} className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0">{nv}</span>
                  <span>{platos.map((i: ComandaItem) => i.nombre).join(' · ')}</span>
                </div>
              )
            })}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => printTicketCocina(comanda, agendado.restaurant.nombre, agendado.template.nombre)}
            className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-700"
          >
            🖨 Imprimir para cocina
          </button>
          <button onClick={onDone} className="px-3 py-2 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Mesa</label>
        <select
          value={mesaId ?? ''}
          onChange={e => setMesaId(Number(e.target.value) || null)}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">Seleccionar mesa…</option>
          {todasMesas.map(m => (
            <option key={m.id} value={m.id}>Mesa {m.numero} — {m.planNombre}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          onClick={() => setPostre(p => !p)}
          className={`w-9 h-5 rounded-full transition-colors shrink-0 ${incluyePostre ? 'bg-indigo-500' : 'bg-gray-300'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform shadow ${incluyePostre ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs text-gray-600">Incluye postre</span>
      </label>
      {asignar.isError && (
        <p className="text-xs text-red-500">{(asignar.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <button onClick={onDone} className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-white">
          Cancelar
        </button>
        <button
          onClick={() => asignar.mutate()}
          disabled={!mesaId || asignar.isPending}
          className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-40"
        >
          {asignar.isPending ? 'Asignando…' : 'Asignar y crear comanda'}
        </button>
      </div>
    </div>
  )
}

function GruposHoyWidget() {
  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['grupos-pendientes-hoy'],
    queryFn: () => api.grupoMenu.agendados.pendientesHoy(),
    refetchInterval: 60_000,
  })
  const [asignando, setAsignando] = useState<number | null>(null) // agendado.id

  if (isLoading) return null
  if (grupos.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden md:col-span-2">
      <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between bg-indigo-50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <h2 className="font-bold text-indigo-800 text-sm">Grupos para hoy</h2>
        </div>
        <span className="text-xs text-indigo-500 font-medium">{grupos.length} pendiente{grupos.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {grupos.map(g => {
          const r = g.restricciones as GrupoMenuRestricciones
          const pax = r.normales + r.vegetarianos + r.sinCerdo + r.sinGluten
          const total = g.template.precio * pax
          const rDesc = [
            r.normales     > 0 ? `${r.normales} normales` : null,
            r.vegetarianos > 0 ? `${r.vegetarianos} veg` : null,
            r.sinCerdo     > 0 ? `${r.sinCerdo} sin cerdo` : null,
            r.sinGluten    > 0 ? `${r.sinGluten} sin gluten` : null,
          ].filter(Boolean).join(' · ')
          return (
            <div key={g.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm">{g.restaurant.nombre}</span>
                    <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">{g.template.nombre}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{pax} pax · {rDesc}</p>
                  {g.notas && <p className="text-xs text-gray-400 italic mt-0.5">"{g.notas}"</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-gray-900">{total.toFixed(2)} €</p>
                  <p className="text-xs text-gray-400">{g.template.precio}€/pax</p>
                </div>
              </div>
              {asignando === g.id ? (
                <AsignarInline agendado={g} onDone={() => setAsignando(null)} />
              ) : (
                <button
                  onClick={() => setAsignando(g.id)}
                  className="mt-3 w-full py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
                >
                  Asignar a mesa
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Widget: Staffing ──────────────────────────────────────────────────────────
function fmtDiaCorto(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00Z`)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
}

function StaffingWidget() {
  const { data: restaurantes = [] } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
    staleTime: 300_000,
  })

  const hoy = new Date()
  const desde = hoy.toISOString().slice(0, 10)
  const hastaDate = new Date(hoy.getTime() + 6 * 24 * 60 * 60 * 1000)
  const hasta = hastaDate.toISOString().slice(0, 10)

  const forecasts = useQuery({
    queryKey: ['staffing-forecast-all', desde, hasta],
    queryFn: async () => {
      if (restaurantes.length === 0) return {} as Record<number, StaffingForecastDay[]>
      const results = await Promise.all(
        restaurantes.map(r =>
          api.staffing.getForecast(r.id, desde, hasta).then(days => ({ id: r.id, days }))
        )
      )
      const map: Record<number, StaffingForecastDay[]> = {}
      results.forEach(({ id, days }) => { map[id] = days })
      return map
    },
    enabled: restaurantes.length > 0,
    refetchInterval: 300_000,
  })

  const forecastMap = forecasts.data ?? {}

  // Merge all restaurants per day
  type DayAlert = { restaurante: string; rol: string; tipo: 'falta' | 'exceso' | 'ok'; mensaje: string }
  type DaySummary = { fecha: string; totalPax: number; alertas: DayAlert[] }

  const days: DaySummary[] = []
  const cursor = new Date(`${desde}T00:00:00Z`)
  for (let i = 0; i < 7; i++) {
    const dia = cursor.toISOString().slice(0, 10)
    let totalPax = 0
    const alertas: DayAlert[] = []
    restaurantes.forEach(r => {
      const dayData = (forecastMap[r.id] ?? []).find(d => d.fecha === dia)
      if (dayData) {
        totalPax += dayData.totalPax
        dayData.alertas.forEach(a => {
          if (a.tipo !== 'ok') {
            alertas.push({ restaurante: r.nombre, ...a })
          }
        })
      }
    })
    if (totalPax > 0 || alertas.length > 0) {
      days.push({ fecha: dia, totalPax, alertas })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const hayFaltas = days.some(d => d.alertas.some(a => a.tipo === 'falta'))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hayFaltas ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
          <h2 className="font-bold text-gray-800 text-sm">Personal (7 días)</h2>
        </div>
        <Link to="/admin/staffing" className="text-xs text-cyan-500 hover:text-cyan-700">Ver detalle →</Link>
      </div>

      {forecasts.isLoading ? (
        <div className="px-5 py-8 text-center text-gray-300 text-sm">Cargando…</div>
      ) : days.length === 0 ? (
        <div className="px-5 py-6 text-center text-gray-400 text-sm">Sin reservas en los próximos 7 días</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {days.map(d => (
            <div key={d.fecha} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700 capitalize">{fmtDiaCorto(d.fecha)}</span>
                <span className="text-xs text-gray-400">{d.totalPax} pax</span>
              </div>
              {d.alertas.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  ✓ Personal ok
                </span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {d.alertas.map((a, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.tipo === 'falta'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {a.tipo === 'falta' ? '⚠' : '↑'} {a.mensaje}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Widget: Facturación del día ────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function FacturacionWidget() {
  const { data: stats = [], isLoading } = useQuery({
    queryKey: ['facturacion-dia'],
    queryFn: () => api.turnos.getStats(),
    refetchInterval: 30_000,
  })

  const activos = stats.filter(s => s.activo)
  const totalGlobal = activos.reduce((s, r) => s + r.totalVentas, 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden md:col-span-2">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💶</span>
          <h2 className="font-bold text-gray-800 text-sm">Facturación del día</h2>
        </div>
        {activos.length > 0 && (
          <span className="text-sm font-bold text-emerald-700">{fmt(totalGlobal)}</span>
        )}
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-center text-gray-300 text-sm">Cargando…</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {stats.map(r => (
            <div key={r.restaurantId} className={`px-5 py-3 flex items-center justify-between ${!r.activo ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                {r.activo && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                <p className="text-sm font-semibold text-gray-800">{r.nombre}</p>
              </div>
              <div className="flex items-center gap-4">
                {r.activo ? (
                  <>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-400">
                        💵 {fmt(r.totalEfectivo)} · 💳 {fmt(r.totalTarjeta)}
                      </p>
                      <p className="text-xs text-gray-400">{r.numComandas} comanda{r.numComandas !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{fmt(r.totalVentas)}</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-300">Sin turno activo</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Hero ───────────────────────────────────────────────────────────────────────
export default function AdminHomePage() {
  useAdminEvents()
  const [heroIn,    setHeroIn]    = useState(false)
  const [heroOut,   setHeroOut]   = useState(false)
  const [accentIn,  setAccentIn]  = useState(false)
  const [textIn,    setTextIn]    = useState(false)
  const [taglineIn, setTaglineIn] = useState(false)
  const [widgetsIn, setWidgetsIn] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setHeroIn(true),    80)
    const t2 = setTimeout(() => setHeroOut(true),   900)
    const t3 = setTimeout(() => setAccentIn(true),  1050)
    const t4 = setTimeout(() => setTextIn(true),    1150)
    const t5 = setTimeout(() => setTaglineIn(true), 1750)
    const t6 = setTimeout(() => setWidgetsIn(true), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearTimeout(t6) }
  }, [])

  return (
    <div className="min-h-full bg-gray-50">
      <div className="flex flex-col items-center px-6 py-12 gap-10">

        {/* Hero animado */}
        <div className="flex flex-col items-center text-center gap-6" style={{ position: 'relative' }}>

          {/* Viñeta grande centrada — aparece y encoge */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(-50%, -50%) scale(${heroIn && !heroOut ? 1 : 0.15})`,
            opacity: heroIn && !heroOut ? 1 : 0,
            transition: heroOut
              ? 'transform 0.45s cubic-bezier(0.4,0,0.6,1), opacity 0.35s ease'
              : 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
            filter: 'drop-shadow(0 0 40px #4CC8A055)',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            <Vineta width={140} drawCheck={heroIn && !heroOut} />
          </div>

          {/* Logotipo */}
          <div style={{
            opacity: textIn ? 1 : 0,
            transform: textIn ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', ...FONT }}>
              <span style={{ color: '#0f172a' }}>o</span>
              <span style={{ position: 'relative', display: 'inline-block' }}>
                <span style={{ color: '#0f172a' }}>ı</span>
                <span style={{
                  position: 'absolute', left: '50%', bottom: '67%',
                  transform: `translateX(-50%) scale(${accentIn ? 1 : 0.2})`,
                  opacity: accentIn ? 1 : 0,
                  transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
                  transformOrigin: 'bottom center',
                  filter: 'drop-shadow(0 0 8px #4CC8A055)',
                  display: 'block', lineHeight: 0,
                }}>
                  <Vineta width={26} drawCheck={accentIn} />
                </span>
              </span>
              <span style={{ color: '#0f172a' }}>do</span>
              <span style={{ color: '#4CC8A0' }}>Ops</span>
            </div>
          </div>

          {/* Tagline */}
          <div style={{
            opacity: taglineIn ? 1 : 0,
            transform: taglineIn ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}>
            <p style={{
              fontSize: 14, fontWeight: 500, letterSpacing: '0.05em',
              background: 'linear-gradient(90deg, #4CC8A0, #6366f1)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Gestión inteligente de gastronomía
            </p>
            <p className="text-gray-400 text-xs mt-1.5 capitalize">{fecha}</p>
          </div>
        </div>

        {/* Widgets */}
        <div
          className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4"
          style={{
            opacity: widgetsIn ? 1 : 0,
            transform: widgetsIn ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.6s ease, transform 0.6s ease',
          }}
        >
          <GruposHoyWidget />
          <TurnosWidget />
          <ReviewsWidget />
          <StaffingWidget />
          <FacturacionWidget />
        </div>

      </div>
    </div>
  )
}
