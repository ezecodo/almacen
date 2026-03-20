import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Empleado, PropinaDia } from '../api'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Stepper nuevo reparto (mobile-first) ─────────────────────────────────────

type Paso = 1 | 2 | 3 | 4

function StepDot({ n, actual }: { n: number; actual: Paso }) {
  const done = n < actual
  const active = n === actual
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
      done   ? 'bg-cyan-500 border-cyan-500 text-white' :
      active ? 'bg-white border-cyan-500 text-cyan-600' :
               'bg-white border-gray-200 text-gray-300'
    }`}>
      {done ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : n}
    </div>
  )
}

function NuevaPropina({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()
  const [paso, setPaso] = useState<Paso>(1)
  const [restaurantId, setRestaurantId] = useState<number | ''>('')
  const [efectivo, setEfectivo] = useState('')
  const [tarjeta, setTarjeta] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [seleccion, setSeleccion] = useState<Record<number, number>>({})
  const [busqueda, setBusqueda] = useState('')

  const { data: restaurantes } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const { data: empleados }    = useQuery({ queryKey: ['empleados'],    queryFn: () => api.empleados.list() })

  const total = (parseFloat(efectivo) || 0) + (parseFloat(tarjeta) || 0)
  const turnosSeleccionados = Object.entries(seleccion).map(([id, h]) => ({ empleadoId: Number(id), horas: h }))
  const totalHoras = turnosSeleccionados.reduce((s, t) => s + t.horas, 0)
  const restaurante = restaurantes?.find((r) => r.id === restaurantId)

  const preview = useMemo(() => {
    if (!total || !totalHoras) return []
    return turnosSeleccionados.map((t) => ({
      ...t,
      propina: Math.round((total * (t.horas / totalHoras)) * 100) / 100,
      nombre: empleados?.find((e) => e.id === t.empleadoId)?.nombre ?? '',
    })).sort((a, b) => b.propina - a.propina)
  }, [total, turnosSeleccionados, totalHoras, empleados])

  // Empleados filtrados por búsqueda (excluye ya seleccionados del autocomplete)
  const sugerencias = useMemo(() => {
    if (!busqueda.trim() || !empleados) return []
    const q = busqueda.toLowerCase()
    return empleados.filter(
      (e) => e.activo && e.nombre.toLowerCase().includes(q) && seleccion[e.id] === undefined
    ).slice(0, 6)
  }, [busqueda, empleados, seleccion])

  const seleccionados = useMemo(() =>
    Object.entries(seleccion).map(([id, horas]) => ({
      empleadoId: Number(id),
      horas,
      emp: empleados?.find((e) => e.id === Number(id))!,
    })).filter((t) => t.emp)
  , [seleccion, empleados])

  const toggleEmpleado = (emp: Empleado) => {
    setSeleccion((prev) => {
      if (prev[emp.id] !== undefined) {
        const next = { ...prev }; delete next[emp.id]; return next
      }
      return { ...prev, [emp.id]: 8 }
    })
    setBusqueda('')
  }

  const crear = useMutation({
    mutationFn: () => api.propinas.create({
      restaurantId: Number(restaurantId),
      fecha,
      efectivo: parseFloat(efectivo) || 0,
      tarjeta:  parseFloat(tarjeta)  || 0,
      turnos:   turnosSeleccionados,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propinas'] })
      qc.invalidateQueries({ queryKey: ['propinas-resumen'] })
      setPaso(1); setRestaurantId(''); setFecha(hoy()); setEfectivo(''); setTarjeta(''); setSeleccion({}); setBusqueda('')
      onSuccess()
    },
  })

  const inputCls = "w-full border border-gray-200 rounded-2xl px-4 py-4 text-base focus:outline-none focus:border-cyan-400 bg-white"
  const btnPrimary = "w-full bg-cyan-500 text-white font-bold py-4 rounded-2xl text-lg hover:bg-cyan-400 transition-colors disabled:opacity-40"
  const btnSecondary = "w-full border-2 border-gray-200 text-gray-600 font-medium py-4 rounded-2xl text-base hover:border-gray-300 transition-colors"

  return (
    <div className="space-y-4">
      {/* Indicador de pasos */}
      <div className="flex items-center justify-center gap-2 py-2">
        {([1,2,3,4] as Paso[]).map((n, i) => (
          <div key={n} className="flex items-center gap-2">
            <StepDot n={n} actual={paso} />
            {i < 3 && <div className={`w-8 h-0.5 rounded-full transition-all ${paso > n ? 'bg-cyan-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* ── PASO 1: Restaurante ── */}
      {paso === 1 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">¿Qué restaurante?</h2>
            <p className="text-gray-400 text-sm mt-1">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          </div>
          <div className="space-y-3">
            {restaurantes?.map((r) => (
              <button
                key={r.id}
                onClick={() => { setRestaurantId(r.id); setPaso(2) }}
                className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-semibold text-base transition-all ${
                  restaurantId === r.id
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                }`}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PASO 2: Importes ── */}
      {paso === 2 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Propinas del día</h2>
            <p className="text-gray-400 text-sm mt-1">{restaurante?.nombre}</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Efectivo (€)</label>
              <input
                type="number" inputMode="decimal" min="0" step="0.01"
                value={efectivo}
                onChange={(e) => setEfectivo(e.target.value)}
                placeholder="0.00"
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Tarjeta (€)</label>
              <input
                type="number" inputMode="decimal" min="0" step="0.01"
                value={tarjeta}
                onChange={(e) => setTarjeta(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            {total > 0 && (
              <div className="bg-cyan-50 rounded-2xl px-5 py-4 text-center border border-cyan-100">
                <p className="text-3xl font-bold text-cyan-600">{formatEur(total)}</p>
                <p className="text-cyan-500 text-sm mt-0.5">total a repartir</p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setPaso(1)} className={btnSecondary}>← Volver</button>
            <button onClick={() => setPaso(3)} disabled={total <= 0} className={btnPrimary}>
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: Personal ── */}
      {paso === 3 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">¿Quién trabajó hoy?</h2>
            <p className="text-gray-400 text-sm mt-1">{restaurante?.nombre} · {formatEur(total)}</p>
          </div>

          {/* Buscador con autocomplete */}
          <div className="relative">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar empleado por nombre…"
              className={inputCls}
              autoFocus
            />
            {sugerencias.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
                {sugerencias.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => toggleEmpleado(emp)}
                    className="w-full text-left px-4 py-3.5 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
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

          {/* Seleccionados */}
          {seleccionados.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Seleccionados ({seleccionados.length})
              </p>
              {seleccionados.map(({ empleadoId, horas, emp }) => (
                <div key={empleadoId} className="flex items-center gap-3 bg-cyan-50 border-2 border-cyan-200 rounded-2xl px-4 py-3">
                  <button
                    onClick={() => toggleEmpleado(emp)}
                    className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center shrink-0"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <span className="flex-1 font-semibold text-gray-800">{emp.nombre}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number" inputMode="decimal" min="1" max="24" step="0.5"
                      value={horas}
                      onChange={(e) => {
                        const v = e.target.value
                        const n = parseFloat(v)
                        setSeleccion((prev) => ({ ...prev, [empleadoId]: v === '' ? 0 : isNaN(n) ? prev[empleadoId] : n }))
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-16 border border-cyan-300 bg-white rounded-xl px-2 py-1.5 text-base text-center font-bold focus:outline-none"
                    />
                    <span className="text-sm text-gray-400">h</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {seleccionados.length === 0 && (
            <p className="text-center text-gray-300 text-sm py-4">Busca y añade empleados arriba</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setPaso(2)} className={btnSecondary}>← Volver</button>
            <button onClick={() => setPaso(4)} disabled={seleccionados.length === 0} className={btnPrimary}>
              Revisar →
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 4: Confirmación ── */}
      {paso === 4 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Confirmar reparto</h2>
            <p className="text-gray-400 text-sm mt-1">{restaurante?.nombre} · {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Efectivo</span><span>{formatEur(parseFloat(efectivo) || 0)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tarjeta</span><span>{formatEur(parseFloat(tarjeta) || 0)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span><span className="text-cyan-600">{formatEur(total)}</span>
            </div>
          </div>

          {/* Reparto por persona */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reparto</p>
            {preview.map((p) => (
              <div key={p.empleadoId} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-gray-900">{p.nombre}</p>
                  <p className="text-xs text-gray-400">{p.horas}h</p>
                </div>
                <span className="text-lg font-bold text-cyan-600">{formatEur(p.propina)}</span>
              </div>
            ))}
          </div>

          {crear.isError && (
            <p className="text-red-500 text-sm text-center">Error al guardar. Inténtalo de nuevo.</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setPaso(3)} className={btnSecondary}>← Volver</button>
            <button onClick={() => crear.mutate()} disabled={crear.isPending} className={btnPrimary}>
              {crear.isPending ? 'Guardando…' : 'Confirmar ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────────

function imprimirPropina(propina: PropinaDia) {
  const fecha = new Date(propina.fecha).toLocaleDateString('es-ES', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  const turnos = [...propina.turnos].sort((a, b) => b.propina - a.propina)
  const filas = turnos.map((t) => `
    <tr>
      <td style="padding:4px 0;font-size:13px;">${t.empleado.nombre}</td>
      <td style="padding:4px 0;font-size:12px;color:#666;text-align:center;">${t.horas}h</td>
      <td style="padding:4px 0;font-size:13px;text-align:right;font-weight:bold;">${formatEur(t.propina)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0; size: 80mm auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; width: 80mm; padding: 5mm; color: #000; font-size: 13px; }
    .logo { text-align: center; margin-bottom: 8px; }
    .logo img { width: 35mm; }
    .divider { border-top: 1px dashed #000; margin: 5px 0; }
    .info { margin-bottom: 3px; }
    .info span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    th { font-size: 11px; color: #666; text-align: left; padding: 2px 0; font-weight: normal; }
    th:last-child { text-align: right; }
    th:nth-child(2) { text-align: center; }
    .total-row { font-weight: bold; font-size: 14px; }
    .subtotales { font-size: 11px; color: #666; }
    .footer { text-align: center; font-size: 11px; margin-top: 8px; color: #888; }
  </style>
</head>
<body>
  <div class="logo"><img src="${window.location.origin}/oidoops.svg" /></div>
  <div class="divider"></div>
  <p class="info">Fecha: <span>${fecha}</span></p>
  <p class="info">Restaurante: <span>${propina.restaurant.nombre}</span></p>
  <div class="divider"></div>
  <table>
    <thead>
      <tr>
        <th>Empleado</th>
        <th>Horas</th>
        <th style="text-align:right">Propina</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="divider"></div>
  <table>
    <tr class="subtotales">
      <td>Efectivo</td>
      <td style="text-align:right">${formatEur(propina.efectivo)}</td>
    </tr>
    <tr class="subtotales">
      <td>Tarjeta</td>
      <td style="text-align:right">${formatEur(propina.tarjeta)}</td>
    </tr>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${formatEur(propina.total)}</td>
    </tr>
  </table>
  <p class="footer">${turnos.length} persona${turnos.length !== 1 ? 's' : ''} · ${new Date().toLocaleDateString('es-ES')}</p>
</body>
</html>`

  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.print(); win.close() }
}

function DetalleModal({ propina, onClose }: { propina: PropinaDia; onClose: () => void }) {
  const qc = useQueryClient()
  const eliminar = useMutation({
    mutationFn: () => api.propinas.delete(propina.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propinas'] })
      qc.invalidateQueries({ queryKey: ['propinas-resumen'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="bg-gray-950 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">{fechaCorta(propina.fecha)} · {propina.restaurant.nombre}</p>
              <p className="text-2xl font-bold text-white">{formatEur(propina.total)}</p>
              <p className="text-sm text-gray-400 mt-0.5">
                Efectivo {formatEur(propina.efectivo)} · Tarjeta {formatEur(propina.tarjeta)}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none transition-colors">×</button>
          </div>
        </div>
        <ul className="divide-y divide-gray-100 overflow-y-auto max-h-72 px-6">
          {propina.turnos.sort((a, b) => b.propina - a.propina).map((t, i) => (
            <li key={i} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">{t.empleado.nombre}</p>
                <p className="text-xs text-gray-400">{t.horas}h · {t.empleado.tipo}</p>
              </div>
              <span className="font-bold text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full text-sm">
                {formatEur(t.propina)}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <button
            onClick={() => { if (confirm('¿Eliminar este reparto?')) eliminar.mutate() }}
            className="text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            Eliminar
          </button>
          <button
            onClick={() => imprimirPropina(propina)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-cyan-600 transition-colors border border-gray-200 hover:border-cyan-400 px-3 py-1.5 rounded-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PropinasPage() {
  const [vistaTab, setVistaTab] = useState<'nuevo' | 'historial' | 'resumen'>('nuevo')
  const [selectedPropina, setSelectedPropina] = useState<PropinaDia | null>(null)
  const [filtroRestaurante, setFiltroRestaurante] = useState<number | ''>('')
  const [mesResumen, setMesResumen] = useState(new Date().toISOString().slice(0, 7))

  const { data: restaurantes } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })

  const { data: historial } = useQuery({
    queryKey: ['propinas', filtroRestaurante],
    queryFn: () => api.propinas.list(filtroRestaurante ? { restaurantId: Number(filtroRestaurante) } : undefined),
    enabled: vistaTab === 'historial',
  })

  const { data: resumen } = useQuery({
    queryKey: ['propinas-resumen', mesResumen, filtroRestaurante],
    queryFn: () => api.propinas.resumenEmpleados(
      mesResumen,
      filtroRestaurante ? Number(filtroRestaurante) : undefined
    ),
    enabled: vistaTab === 'resumen',
  })

  const maxPropina = resumen?.[0]?.totalPropina ?? 1

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Propinas</h2>
        <p className="text-gray-400 text-sm mt-1">Reparto diario proporcional por horas trabajadas</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {([
          { key: 'nuevo', label: 'Nuevo reparto' },
          { key: 'historial', label: 'Historial' },
          { key: 'resumen', label: 'Resumen' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setVistaTab(key)}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
              vistaTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Nuevo reparto ── */}
      {vistaTab === 'nuevo' && (
        <NuevaPropina onSuccess={() => setVistaTab('historial')} />
      )}

      {/* ── Historial ── */}
      {vistaTab === 'historial' && (
        <div className="space-y-4">
          <select
            value={filtroRestaurante}
            onChange={(e) => setFiltroRestaurante(e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
          >
            <option value="">Todos los restaurantes</option>
            {restaurantes?.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>

          {!historial ? (
            <div className="py-8 text-center text-gray-400">Cargando…</div>
          ) : historial.propinas.length === 0 ? (
            <div className="py-8 text-center text-gray-400">No hay repartos registrados</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <ul className="divide-y divide-gray-50">
                {historial.propinas.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => setSelectedPropina(p)}
                    className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{fechaCorta(p.fecha)}</p>
                        <p className="text-sm text-gray-500">{p.restaurant.nombre} · {p.turnos.length} personas</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-cyan-600">{formatEur(p.total)}</p>
                        <p className="text-xs text-gray-400">›</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Resumen mensual ── */}
      {vistaTab === 'resumen' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="month"
              value={mesResumen}
              onChange={(e) => setMesResumen(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
            />
            <select
              value={filtroRestaurante}
              onChange={(e) => setFiltroRestaurante(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
            >
              <option value="">Todos los restaurantes</option>
              {restaurantes?.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>

          {!resumen ? (
            <div className="py-8 text-center text-gray-400">Cargando…</div>
          ) : resumen.length === 0 ? (
            <div className="py-8 text-center text-gray-400">Sin datos este mes</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <ul className="divide-y divide-gray-50">
                {resumen.map((e, i) => (
                  <li key={e.empleadoId} className="px-5 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                      <p className="font-semibold text-gray-900 flex-1">{e.nombre}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        e.tipo === 'cocina'
                          ? 'bg-orange-50 text-orange-600 border-orange-100'
                          : 'bg-cyan-50 text-cyan-600 border-cyan-100'
                      }`}>
                        {e.tipo === 'cocina' ? 'Cocina' : 'Sala'}
                      </span>
                      <span className="font-bold text-cyan-600 w-20 text-right">{formatEur(e.totalPropina)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-4" />
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-cyan-400 transition-all"
                          style={{ width: `${(e.totalPropina / maxPropina) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-20 text-right">{e.totalHoras}h · {e.turnos} turno{e.turnos !== 1 ? 's' : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {selectedPropina && (
        <DetalleModal propina={selectedPropina} onClose={() => setSelectedPropina(null)} />
      )}
    </div>
  )
}
