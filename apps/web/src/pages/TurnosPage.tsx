import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, Turno, Restaurante, Empleado, PropinaDia, totalComanda } from '../api'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function duracion(desde: string, hasta?: string | null) {
  const ms = (hasta ? new Date(hasta) : new Date()).getTime() - new Date(desde).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ── Modal de reparto de propinas ──────────────────────────────────────────────
function PropinaTurnoModal({ turno, restaurantNombre, existing, onClose }: {
  turno: Turno
  restaurantNombre: string
  existing?: PropinaDia | null
  onClose: () => void
}) {
  const isEdit = !!existing

  // Pre-fill from existing propina if editing
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [efectivo, setEfectivo] = useState(isEdit ? String(existing!.efectivo) : '')
  const [tarjeta, setTarjeta] = useState(
    isEdit ? String(existing!.tarjeta) : String(turno.totalPropinas ?? 0)
  )
  const [seleccion, setSeleccion] = useState<Record<number, number>>(() => {
    if (!isEdit) return {}
    return Object.fromEntries(existing!.turnos.map(t => [t.empleadoId, t.horas]))
  })
  const [busqueda, setBusqueda] = useState('')
  const qc = useQueryClient()

  const { data: empleados } = useQuery({
    queryKey: ['empleados'],
    queryFn: () => api.empleados.list(),
  })

  const fecha = (turno.cierreAt ?? turno.aperturaAt).slice(0, 10)
  const tarjetaNum = parseFloat(tarjeta) || 0
  const efectivoNum = parseFloat(efectivo) || 0
  const total = efectivoNum + tarjetaNum

  const turnosSeleccionados = Object.entries(seleccion).map(([id, horas]) => ({
    empleadoId: Number(id),
    horas,
  }))
  const totalHoras = turnosSeleccionados.reduce((s, t) => s + t.horas, 0)

  const preview = useMemo(() => {
    if (!total || !totalHoras) return []
    return turnosSeleccionados.map(t => ({
      ...t,
      propina: Math.round((total * (t.horas / totalHoras)) * 100) / 100,
      nombre: empleados?.find(e => e.id === t.empleadoId)?.nombre ?? '',
      tipo:   empleados?.find(e => e.id === t.empleadoId)?.tipo ?? 'sala',
    })).sort((a, b) => b.propina - a.propina)
  }, [total, turnosSeleccionados, totalHoras, empleados])

  // Autocomplete
  const sugerencias = useMemo(() => {
    if (!busqueda.trim() || !empleados) return []
    const q = busqueda.toLowerCase()
    return empleados
      .filter(e => e.activo && e.nombre.toLowerCase().includes(q) && seleccion[e.id] === undefined)
      .slice(0, 6)
  }, [busqueda, empleados, seleccion])

  const seleccionados = useMemo(() =>
    Object.entries(seleccion).map(([id, horas]) => ({
      empleadoId: Number(id),
      horas,
      emp: empleados?.find(e => e.id === Number(id)),
    })).filter(t => t.emp)
  , [seleccion, empleados])

  const toggleEmp = (emp: Empleado) => {
    setSeleccion(prev => {
      if (prev[emp.id] !== undefined) {
        const next = { ...prev }; delete next[emp.id]; return next
      }
      return { ...prev, [emp.id]: 8 }
    })
    setBusqueda('')
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['propinas'] })
    qc.invalidateQueries({ queryKey: ['turnos-historial'] })
  }

  const crear = useMutation({
    mutationFn: () => api.propinas.create({
      restaurantId: turno.restaurantId,
      fecha,
      efectivo: efectivoNum,
      tarjeta:  tarjetaNum,
      turnoId:  turno.id,
      turnos:   turnosSeleccionados,
    }),
    onSuccess: () => { invalidate(); onClose() },
  })

  const actualizar = useMutation({
    mutationFn: () => api.propinas.update(existing!.id, {
      efectivo: efectivoNum,
      tarjeta:  tarjetaNum,
      turnos:   turnosSeleccionados,
    }),
    onSuccess: () => { invalidate(); onClose() },
  })

  const mutacion = isEdit ? actualizar : crear
  const inputCls = "w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-cyan-400 bg-white"
  const btnPrimary = "flex-1 bg-cyan-500 text-white font-bold py-3.5 rounded-2xl text-base hover:bg-cyan-400 transition-colors disabled:opacity-40"
  const btnSecondary = "flex-1 border-2 border-gray-200 text-gray-600 font-medium py-3.5 rounded-2xl text-base hover:border-gray-300 transition-colors"

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle móvil */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-400">
                {restaurantNombre} · {new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}
              </p>
              <h2 className="text-xl font-bold text-gray-900">
                {isEdit ? 'Modificar propinas' : 'Repartir propinas'}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-2">
            {([1, 2, 3] as const).map((n, i) => (
              <div key={n} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  paso > n  ? 'bg-cyan-500 border-cyan-500 text-white' :
                  paso === n ? 'bg-white border-cyan-500 text-cyan-600' :
                               'bg-white border-gray-200 text-gray-300'
                }`}>
                  {paso > n ? '✓' : n}
                </div>
                {i < 2 && <div className={`w-8 h-0.5 rounded-full transition-all ${paso > n ? 'bg-cyan-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
            <span className="text-xs text-gray-400 ml-2">
              {paso === 1 ? 'Importes' : paso === 2 ? 'Personal' : 'Confirmar'}
            </span>
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── PASO 1: Montos ── */}
          {paso === 1 && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Propinas en efectivo (€)</label>
                <input
                  type="number" inputMode="decimal" min="0" step="0.01"
                  value={efectivo}
                  onChange={e => setEfectivo(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">Propinas por tarjeta (€)</label>
                <p className="text-xs text-amber-500 mb-2">Pre-cargado desde el cierre de turno</p>
                <input
                  type="number" inputMode="decimal" min="0" step="0.01"
                  value={tarjeta}
                  onChange={e => setTarjeta(e.target.value)}
                  className={inputCls}
                />
              </div>
              {total > 0 && (
                <div className="bg-cyan-50 rounded-2xl px-5 py-4 text-center border border-cyan-100">
                  <p className="text-3xl font-bold text-cyan-600">{fmt(total)} €</p>
                  <p className="text-cyan-500 text-sm mt-0.5">total a repartir</p>
                </div>
              )}
              <button onClick={() => setPaso(2)} disabled={total <= 0} className={btnPrimary + ' w-full'}>
                Continuar →
              </button>
            </>
          )}

          {/* ── PASO 2: Personal ── */}
          {paso === 2 && (
            <>
              <p className="text-gray-400 text-sm">{fmt(total)} € · Busca y añade empleados</p>

              {/* Buscador */}
              <div className="relative">
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre…"
                  className={inputCls}
                  autoFocus
                />
                {sugerencias.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
                    {sugerencias.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => toggleEmp(emp)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-800">{emp.nombre}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          emp.tipo === 'cocina'
                            ? 'bg-orange-50 text-orange-600 border-orange-100'
                            : 'bg-cyan-50 text-cyan-600 border-cyan-100'
                        }`}>
                          {emp.tipo === 'cocina' ? 'Cocina' : 'Sala'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Seleccionados con horas */}
              {seleccionados.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Seleccionados ({seleccionados.length})
                  </p>
                  {seleccionados.map(({ empleadoId, horas, emp }) => (
                    <div key={empleadoId} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
                      <button
                        onClick={() => toggleEmp(emp!)}
                        className="w-6 h-6 rounded-full bg-gray-200 hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors"
                      >
                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                        emp?.tipo === 'cocina'
                          ? 'bg-orange-50 text-orange-600 border-orange-100'
                          : 'bg-cyan-50 text-cyan-600 border-cyan-100'
                      }`}>
                        {emp?.tipo === 'cocina' ? 'Cocina' : 'Sala'}
                      </span>
                      <span className="flex-1 font-semibold text-gray-800 text-sm">{emp?.nombre}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number" inputMode="decimal" min="1" max="24" step="0.5"
                          value={horas}
                          onChange={e => {
                            const n = parseFloat(e.target.value)
                            setSeleccion(prev => ({ ...prev, [empleadoId]: isNaN(n) ? 0 : n }))
                          }}
                          onFocus={e => e.target.select()}
                          className="w-16 border border-gray-200 rounded-xl px-2 py-1.5 text-base text-center font-bold focus:outline-none focus:border-cyan-400"
                        />
                        <span className="text-sm text-gray-400">h</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-300 text-sm py-2">Busca y añade empleados arriba</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setPaso(1)} className={btnSecondary}>← Volver</button>
                <button onClick={() => setPaso(3)} disabled={seleccionados.length === 0} className={btnPrimary}>
                  Revisar →
                </button>
              </div>
            </>
          )}

          {/* ── PASO 3: Confirmar ── */}
          {paso === 3 && (
            <>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Efectivo</span><span>{fmt(efectivoNum)} €</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Tarjeta</span><span>{fmt(tarjetaNum)} €</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>Total</span><span className="text-cyan-600">{fmt(total)} €</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Reparto por persona</p>
                {preview.map(p => (
                  <div key={p.empleadoId} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{p.nombre}</p>
                      <p className="text-xs text-gray-400">{p.horas}h · {p.tipo === 'cocina' ? 'Cocina' : 'Sala'}</p>
                    </div>
                    <span className="text-base font-bold text-cyan-600">{fmt(p.propina)} €</span>
                  </div>
                ))}
              </div>

              {isEdit && (
                <p className="text-xs text-amber-500 text-center bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                  Esto actualizará los datos en Google Sheets
                </p>
              )}

              {mutacion.isError && (
                <p className="text-red-500 text-sm text-center">Error al guardar. Inténtalo de nuevo.</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setPaso(2)} className={btnSecondary}>← Volver</button>
                <button onClick={() => mutacion.mutate()} disabled={mutacion.isPending} className={btnPrimary}>
                  {mutacion.isPending ? 'Guardando…' : isEdit ? 'Actualizar ✓' : 'Confirmar ✓'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta turno activo ──────────────────────────────────────────────────────
function TurnoActivoCard({ turno, efectivo, tarjeta, propinas, numComandas }: {
  turno: Turno
  efectivo: number
  tarjeta: number
  propinas: number
  numComandas: number
}) {
  return (
    <div className="bg-[#0f2b1f] border border-[#4CC8A0]/40 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#4CC8A0] animate-pulse" />
          <span className="text-[#4CC8A0] font-black text-base">Turno activo</span>
        </div>
        <span className="text-gray-400 text-sm">desde {fmtHora(turno.aperturaAt)} · {duracion(turno.aperturaAt)}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#1a3828] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">💵 Efectivo</p>
          <p className="text-white font-black text-lg">{fmt(efectivo)} €</p>
        </div>
        <div className="bg-[#1a3828] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">💳 Tarjeta</p>
          <p className="text-white font-black text-lg">{fmt(tarjeta)} €</p>
        </div>
        <div className="bg-[#1a3828] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">Total ventas</p>
          <p className="text-[#4CC8A0] font-black text-lg">{fmt(efectivo + tarjeta)} €</p>
        </div>
        <div className="bg-[#1a3828] rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">Comandas</p>
          <p className="text-white font-black text-lg">{numComandas}</p>
        </div>
      </div>
      {propinas > 0 && (
        <p className="text-amber-400 text-xs mt-3 text-right">Propinas tarjeta acumuladas: {fmt(propinas)} €</p>
      )}
    </div>
  )
}

// ── Tarjeta turno cerrado ─────────────────────────────────────────────────────
function TurnoCerradoCard({ turno, restaurantNombre, onDelete }: {
  turno: Turno
  restaurantNombre: string
  onDelete: (id: number) => void
}) {
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showPropinas, setShowPropinas] = useState(false)

  const propina = turno.propina

  return (
    <>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => navigate(`/admin/turnos/${turno.id}`)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <div>
            <p className="text-gray-500 text-xs">{fmtFecha(turno.aperturaAt)}</p>
            <p className="text-gray-700 font-semibold text-sm">
              {fmtHora(turno.aperturaAt)} — {turno.cierreAt ? fmtHora(turno.cierreAt) : '?'}
              <span className="text-gray-400 font-normal ml-2">({duracion(turno.aperturaAt, turno.cierreAt)})</span>
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-gray-400 text-xs">{turno.numComandas ?? 0} comandas</p>
              {(turno.totalPropinas ?? 0) > 0 && (
                <p className="text-amber-500 text-xs">+{fmt(turno.totalPropinas ?? 0)} € propinas</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-gray-900 font-black text-lg">{fmt(turno.totalVentas ?? 0)} €</p>
              <p className="text-gray-400 text-xs">{fmt(turno.totalEfectivo ?? 0)} ef · {fmt(turno.totalTarjeta ?? 0)} tj</p>
            </div>
            <span className="text-gray-400 text-sm">›</span>
          </div>
        </button>

        {/* Acciones */}
        <div className="border-t border-gray-50 px-5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {propina ? (
              <>
                {/* Badge propina hecha */}
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Propina repartida · {fmt(propina.total)} €
                </span>
                <button
                  onClick={() => setShowPropinas(true)}
                  className="text-xs text-gray-400 hover:text-cyan-600 transition-colors font-medium"
                >
                  Modificar
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowPropinas(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-500 hover:text-amber-600 transition-colors"
              >
                <span>💰</span> Repartir propinas
              </button>
            )}
          </div>

          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-xs">¿Eliminar este turno?</span>
              <button onClick={() => onDelete(turno.id)} className="text-red-500 text-xs font-semibold hover:text-red-700">
                Sí, eliminar
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-gray-400 text-xs hover:text-gray-600">
                Cancelar
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-gray-300 text-xs hover:text-red-400 transition-colors">
              Eliminar
            </button>
          )}
        </div>
      </div>

      {showPropinas && (
        <PropinaTurnoModal
          turno={turno}
          restaurantNombre={restaurantNombre}
          existing={propina}
          onClose={() => setShowPropinas(false)}
        />
      )}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function TurnosPage() {
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  useEffect(() => {
    if (!restaurantId && restaurantes?.length) setRestaurantId(restaurantes[0].id)
  }, [restaurantes, restaurantId])

  const { data: turnoActivo } = useQuery({
    queryKey: ['turno-activo', restaurantId],
    queryFn: () => api.turnos.getActivo(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 15_000,
  })

  const { data: historial } = useQuery({
    queryKey: ['turnos-historial', restaurantId],
    queryFn: () => api.turnos.list(restaurantId!),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
  })

  const { data: cerradasHoy } = useQuery({
    queryKey: ['comandas-feed-cerradas', restaurantId],
    queryFn: () => api.comandas.list(restaurantId!, 'cerrada'),
    enabled: !!restaurantId && !!turnoActivo,
    refetchInterval: 8_000,
  })

  const cerradasTurno = cerradasHoy?.filter(c =>
    c.closedAt && new Date(c.closedAt) >= new Date(turnoActivo?.aperturaAt ?? 0)
  ) ?? []
  const efectivoVivo = cerradasTurno.filter(c => c.metodoPago === 'cash').reduce((s, c) => s + totalComanda(c.items), 0)
  const tarjetaVivo  = cerradasTurno.filter(c => c.metodoPago === 'tarjeta').reduce((s, c) => s + totalComanda(c.items), 0)
  const propinasVivo = cerradasTurno.reduce((s, c) => s + (c.propina ?? 0), 0)

  const deleteTurno = useMutation({
    mutationFn: (id: number) => api.turnos.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turnos-historial', restaurantId] }),
  })

  const turnosCerrados = historial?.filter(t => t.estado === 'cerrado') ?? []
  const restaurantNombre = restaurantes?.find(r => r.id === restaurantId)?.nombre ?? ''

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Selector restaurante */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
        {restaurantes?.map((r: Restaurante) => (
          <button key={r.id} onClick={() => setRestaurantId(r.id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              restaurantId === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {r.nombre}
          </button>
        ))}
      </div>

      {/* Turno activo */}
      {turnoActivo && (
        <TurnoActivoCard
          turno={turnoActivo}
          efectivo={efectivoVivo}
          tarjeta={tarjetaVivo}
          propinas={propinasVivo}
          numComandas={cerradasTurno.length}
        />
      )}

      {!turnoActivo && turnoActivo !== undefined && (
        <div className="bg-gray-100 border border-gray-200 rounded-2xl px-5 py-4 mb-6 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <p className="text-gray-500 text-sm">No hay turno activo en este restaurante</p>
        </div>
      )}

      {/* Historial */}
      <h2 className="text-gray-700 font-bold text-sm uppercase tracking-wide mb-3">
        Historial de turnos
      </h2>

      {turnosCerrados.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-10">No hay turnos cerrados aún</p>
      ) : (
        <div className="space-y-2">
          {turnosCerrados.map(turno => (
            <TurnoCerradoCard
              key={turno.id}
              turno={turno}
              restaurantNombre={restaurantNombre}
              onDelete={id => deleteTurno.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
