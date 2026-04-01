import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, AutoPlanItem, Empleado, NecesidadSlots, NecesidadDia, NecesidadFecha, TurnoEmpleadoType, TurnoTipo, StaffingForecastDay, Restaurante } from '../api'

// ── Helpers ────────────────────────────────────────────────────────────────────
function isoWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function fmtDia(dateStr: string, fmt: 'short' | 'long' = 'short') {
  const d = new Date(`${dateStr}T12:00:00Z`)
  return d.toLocaleDateString('es-ES', {
    weekday: fmt === 'long' ? 'long' : 'short',
    day: 'numeric',
    month: fmt === 'long' ? 'short' : undefined,
  })
}

function horasEnTurno(horaInicio: string, horaFin: string): number {
  const [hI, mI] = horaInicio.split(':').map(Number)
  const [hF, mF] = horaFin.split(':').map(Number)
  let mins = (hF * 60 + mF) - (hI * 60 + mI)
  if (mins <= 0) mins += 24 * 60 // turno de madrugada (cruza medianoche)
  return mins / 60
}

function calcHoras(ini: string, fin: string): number {
  return Math.round(horasEnTurno(ini, fin) * 10) / 10
}

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#64748b',
]

// ── Modal: Asignar / editar turno ──────────────────────────────────────────────
function AssignShiftModal({
  restaurantId, empleados, tipos, fecha, turnoExistente, empleadoPreset, onClose,
}: {
  restaurantId: number
  empleados: Empleado[]
  tipos: TurnoTipo[]
  fecha: string
  turnoExistente?: TurnoEmpleadoType
  empleadoPreset?: number
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [empleadoId, setEmpleadoId] = useState<number>(empleadoPreset ?? turnoExistente?.empleadoId ?? 0)
  const [tipoId, setTipoId]         = useState<number | null>(turnoExistente?.tipoId ?? null)
  const [horaInicio, setHoraInicio] = useState(turnoExistente?.horaInicio ?? '09:00')
  const [horaFin, setHoraFin]       = useState(turnoExistente?.horaFin ?? '17:00')
  const [estado, setEstado]         = useState(turnoExistente?.estado ?? 'planificado')

  const empSeleccionado = empleados.find(e => e.id === empleadoId) ?? turnoExistente ? empleados.find(e => e.id === (turnoExistente?.empleadoId ?? empleadoId)) : null
  const tiposFiltrados  = tipos.filter(t => t.tipoEmpleado === null || t.tipoEmpleado === empSeleccionado?.tipo)

  const selectTipo = (t: TurnoTipo) => {
    if (tipoId === t.id) {
      setTipoId(null)
    } else {
      setTipoId(t.id)
      setHoraInicio(t.horaInicio)
      setHoraFin(t.horaFin)
    }
  }

  const crear = useMutation({
    mutationFn: () => api.staffing.createTurno({ restaurantId, empleadoId, tipoId, fecha, horaInicio, horaFin }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-semana'] }); onClose() },
  })

  const actualizar = useMutation({
    mutationFn: () => api.staffing.updateTurno(turnoExistente!.id, { estado, tipoId, horaInicio, horaFin }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-semana'] }); onClose() },
  })

  const eliminar = useMutation({
    mutationFn: () => api.staffing.deleteTurno(turnoExistente!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-semana'] }); onClose() },
  })

  const isEdit    = !!turnoExistente
  const isPending = crear.isPending || actualizar.isPending || eliminar.isPending
  const horas     = calcHoras(horaInicio, horaFin)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{isEdit ? 'Editar turno' : 'Asignar turno'}</h3>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">{fmtDia(fecha, 'long')}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Empleado */}
          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Empleado</label>
              <select
                value={empleadoId || ''}
                onChange={e => setEmpleadoId(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                <option value="">Seleccionar…</option>
                {empleados.filter(e => e.activo).map(e => (
                  <option key={e.id} value={e.id}>{e.nombre} ({e.tipo})</option>
                ))}
              </select>
            </div>
          )}

          {/* Tipos de turno */}
          {tiposFiltrados.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-2">Tipo de turno</label>
              <div className="flex flex-wrap gap-2">
                {tiposFiltrados.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTipo(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                      tipoId === t.id ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
                    }`}
                    style={tipoId === t.id ? { backgroundColor: t.color, borderColor: t.color } : {}}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.nombre}
                    <span className="opacity-70">{t.horas}h</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Horas manuales */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Horario
              <span className="ml-2 font-bold text-indigo-600">{horas}h</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="time"
                value={horaInicio}
                onChange={e => { setHoraInicio(e.target.value); setTipoId(null) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
              <input
                type="time"
                value={horaFin}
                onChange={e => { setHoraFin(e.target.value); setTipoId(null) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
          </div>

          {/* Estado (solo editar) */}
          {isEdit && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
              <select
                value={estado}
                onChange={e => setEstado(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                <option value="planificado">Planificado</option>
                <option value="confirmado">Confirmado</option>
                <option value="ausente">Ausente</option>
              </select>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-between">
          <div>
            {isEdit && (
              <button
                onClick={() => eliminar.mutate()}
                disabled={isPending}
                className="text-sm text-red-400 hover:text-red-600 px-3 py-1.5 disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancelar
            </button>
            <button
              onClick={() => isEdit ? actualizar.mutate() : crear.mutate()}
              disabled={isPending || (!isEdit && !empleadoId)}
              className="text-sm bg-cyan-500 text-white px-4 py-1.5 rounded-lg hover:bg-cyan-600 disabled:opacity-50"
            >
              {isPending ? 'Guardando…' : isEdit ? 'Guardar' : 'Asignar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Crear / editar tipo de turno ────────────────────────────────────────
function TipoModal({
  restaurantId, initial, onClose,
}: {
  restaurantId: number
  initial?: TurnoTipo
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit  = !!initial
  const [nombre, setNombre]       = useState(initial?.nombre ?? '')
  const [horaInicio, setHoraIni]  = useState(initial?.horaInicio ?? '09:00')
  const [horaFin, setHoraFin]     = useState(initial?.horaFin ?? '17:00')
  const [color, setColor]         = useState(initial?.color ?? '#6366f1')
  const [global, setGlobal]           = useState(initial ? initial.restaurantId === null : false)
  const [tipoEmpleado, setTipoEmp]    = useState<'cocina' | 'sala' | null>(initial?.tipoEmpleado ?? null)
  const [rolEmpleado,  setRolEmp]     = useState<string | null>(initial?.rolEmpleado ?? null)
  const [excluirPlan,  setExcluirPlan] = useState(initial?.excluirAutoPlanning ?? false)

  const horas = calcHoras(horaInicio, horaFin)

  const [error, setError] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['staffing-tipos', restaurantId] })

  const crear = useMutation({
    mutationFn: () => api.staffing.createTipo({ restaurantId: global ? null : restaurantId, nombre, horaInicio, horaFin, horas, color, tipoEmpleado, rolEmpleado, excluirAutoPlanning: excluirPlan }),
    onSuccess: () => { invalidate(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const actualizar = useMutation({
    mutationFn: () => api.staffing.updateTipo(initial!.id, { restaurantId: global ? null : restaurantId, nombre, horaInicio, horaFin, horas, color, tipoEmpleado, rolEmpleado, excluirAutoPlanning: excluirPlan }),
    onSuccess: () => { invalidate(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const eliminar = useMutation({
    mutationFn: () => api.staffing.deleteTipo(initial!.id),
    onSuccess: () => { invalidate(); onClose() },
    onError: (e: Error) => setError(e.message),
  })

  const isPending = crear.isPending || actualizar.isPending || eliminar.isPending
  const canSave   = nombre.trim().length > 0 && horas > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{isEdit ? 'Editar tipo de turno' : 'Nuevo tipo de turno'}</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Completo, Partido mañana…"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>
          {/* Alcance */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-xs text-gray-500 flex-1">Disponible en</span>
              <div className="flex gap-1 bg-white rounded-lg p-0.5 border border-gray-200">
                <button
                  type="button"
                  onClick={() => setGlobal(false)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!global ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Este restaurante
                </button>
                <button
                  type="button"
                  onClick={() => setGlobal(true)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${global ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          {/* Para quién */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-xs text-gray-500 flex-1">Para</span>
            <div className="flex gap-1 bg-white rounded-lg p-0.5 border border-gray-200">
              {([null, 'cocina', 'sala'] as const).map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => { setTipoEmp(v); if (!v) setRolEmp(null) }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    tipoEmpleado === v
                      ? v === 'cocina' ? 'bg-orange-500 text-white shadow-sm'
                      : v === 'sala'   ? 'bg-cyan-500 text-white shadow-sm'
                      : 'bg-gray-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {v === null ? 'Todos' : v === 'cocina' ? '👨‍🍳 Cocina' : '🛎 Sala'}
                </button>
              ))}
            </div>
          </div>

          {/* Rol específico (opcional, sólo si tipoEmpleado está seleccionado) */}
          {tipoEmpleado && (() => {
            const rolesOpts = tipoEmpleado === 'cocina'
              ? [{ value: 'jefe_cocina', label: 'Jefe/a Cocina' }, { value: 'cocinero', label: 'Cocinero' }, { value: 'produccion', label: 'Producción' }, { value: 'friegaplatos', label: 'Friegaplatos' }]
              : [{ value: 'camarero', label: 'Camarero' }, { value: 'encargado', label: 'Encargado' }]
            return (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-xs text-gray-500 flex-1">Rol</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => setRolEmp(null)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${rolEmpleado === null ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  >Todos</button>
                  {rolesOpts.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRolEmp(rolEmpleado === r.value ? null : r.value)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        rolEmpleado === r.value
                          ? tipoEmpleado === 'cocina' ? 'bg-orange-500 text-white shadow-sm' : 'bg-cyan-500 text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >{r.label}</button>
                  ))}
                </div>
              </div>
            )
          })()}

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Horario — <span className="font-bold text-indigo-600">{horas}h</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="time"
                value={horaInicio}
                onChange={e => setHoraIni(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
              <input
                type="time"
                value={horaFin}
                onChange={e => setHoraFin(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
            </div>
          </div>
          {/* Excluir del auto-planning */}
          <button
            type="button"
            onClick={() => setExcluirPlan(v => !v)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              excluirPlan ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100 hover:border-gray-200'
            }`}
          >
            <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${excluirPlan ? 'bg-red-400' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${excluirPlan ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <div className="text-left">
              <div className={`text-xs font-semibold ${excluirPlan ? 'text-red-600' : 'text-gray-500'}`}>
                Excluir del auto-planning
              </div>
              <div className="text-[10px] text-gray-400">Los empleados con este tipo no se incluirán en la planificación automática</div>
            </div>
          </button>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        {error && (
          <div className="mx-5 mb-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            {error}
          </div>
        )}
        {!canSave && nombre.trim().length === 0 && (
          <p className="mx-5 mb-1 text-xs text-amber-500">Escribe un nombre para el turno.</p>
        )}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-between">
          <div>
            {isEdit && (
              <button
                onClick={() => { if (confirm('¿Eliminar este tipo de turno?')) eliminar.mutate() }}
                disabled={isPending}
                className="text-sm text-red-400 hover:text-red-600 px-3 py-1.5 disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancelar
            </button>
            <button
              onClick={() => { setError(null); isEdit ? actualizar.mutate() : crear.mutate() }}
              disabled={isPending || !canSave}
              className="text-sm bg-cyan-500 text-white px-4 py-1.5 rounded-lg hover:bg-cyan-600 disabled:opacity-50"
            >
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Tipos de turno ────────────────────────────────────────────────────────
function TabTipos({ restaurantId }: { restaurantId: number }) {
  const [modal, setModal] = useState<{ open: true; tipo?: TurnoTipo } | null>(null)

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['staffing-tipos', restaurantId],
    queryFn: () => api.staffing.getTipos(restaurantId),
    enabled: !!restaurantId,
  })

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-400 transition-colors"
        >
          + Nuevo tipo
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-300 text-sm">Cargando…</div>
      ) : tipos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">No hay tipos de turno configurados.</p>
          <p className="text-gray-300 text-xs mt-1">Crea los turnos habituales de este restaurante (ej: Completo 8h, Partido mañana 5.5h…)</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Entrada</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Salida</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Horas</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Para</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tipos.map((t, i) => {
                const prevGlobal = i > 0 ? tipos[i - 1].restaurantId === null : null
                const esGlobal   = t.restaurantId === null
                const showDivider = i > 0 && prevGlobal !== esGlobal
                return (
                  <>
                    {showDivider && (
                      <tr key={`div-${t.id}`}>
                        <td colSpan={5} className="px-5 py-1.5 bg-gray-50 border-t border-gray-100">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                            Solo este restaurante
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="font-medium text-gray-800">{t.nombre}</span>
                          {esGlobal && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">
                              Global
                            </span>
                          )}
                          {t.excluirAutoPlanning && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-400 border border-red-100">
                              Sin planning
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">{t.horaInicio}</td>
                      <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">{t.horaFin}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-bold text-indigo-600">{t.horas}h</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {t.tipoEmpleado ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            t.tipoEmpleado === 'cocina'
                              ? 'bg-orange-50 text-orange-600'
                              : 'bg-cyan-50 text-cyan-600'
                          }`}>
                            {t.tipoEmpleado === 'cocina' ? '👨‍🍳 Cocina' : '🛎 Sala'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Todos</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setModal({ open: true, tipo: t })}
                          className="text-xs text-cyan-500 hover:text-cyan-700 font-medium"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TipoModal
          restaurantId={restaurantId}
          initial={modal.tipo}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

// ── Modal: Configuración de ratios ─────────────────────────────────────────────
function ConfigModal({ restaurantId, ratioSala, ratioCocina, onClose }: {
  restaurantId: number; ratioSala: number; ratioCocina: number; onClose: () => void
}) {
  const qc = useQueryClient()
  const [sala, setSala]     = useState(String(ratioSala))
  const [cocina, setCocina] = useState(String(ratioCocina))

  const guardar = useMutation({
    mutationFn: () => api.staffing.setConfig({ restaurantId, ratioSalaXPax: Number(sala), ratioCocinaXPax: Number(cocina) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-config', restaurantId] })
      qc.invalidateQueries({ queryKey: ['staffing-forecast'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Ratios de personal</h3>
          <p className="text-xs text-gray-400 mt-0.5">1 empleado por cada X comensales reservados</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          {[['Sala', sala, setSala], ['Cocina', cocina, setCocina]].map(([label, val, setter]) => (
            <div key={label as string} className="flex items-center gap-3">
              <label className="text-sm text-gray-700 flex-1">{label as string} (1 cada…)</label>
              <input
                type="number" min={1} value={val as string}
                onChange={e => (setter as (v: string) => void)(e.target.value)}
                className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              />
              <span className="text-xs text-gray-400 shrink-0">pax</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">Cancelar</button>
          <button
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending}
            className="text-sm bg-cyan-500 text-white px-4 py-1.5 rounded-lg hover:bg-cyan-600 disabled:opacity-50"
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const ROL_SHORT: Record<string, string> = {
  jefe_cocina:  'Jefe',
  cocinero:     'Cocin',
  friegaplatos: 'Frieg',
  produccion:   'Prod',
  camarero:     'Cama',
  encargado:    'Enc',
}
// Color de fondo por rol cuando el TurnoTipo asignado no coincide con el rol del empleado
const ROL_COLOR: Record<string, string> = {
  jefe_cocina:  '#f97316', // naranja oscuro
  cocinero:     '#fb923c', // naranja
  friegaplatos: '#94a3b8', // gris
  produccion:   '#a78bfa', // violeta
  camarero:     '#22d3ee', // cyan
  encargado:    '#2563eb', // azul
}
const ROL_DEFS: { key: keyof NecesidadSlots; label: string; cocina: boolean }[] = [
  { key: 'jefeCocina',   label: 'Jefe/a Cocina', cocina: true },
  { key: 'cocineros',    label: 'Cocineros',      cocina: true },
  { key: 'friegaplatos', label: 'Friegaplatos',   cocina: true },
  { key: 'produccion',   label: 'Producción',     cocina: true },
  { key: 'camareros',    label: 'Camareros',      cocina: false },
  { key: 'encargados',   label: 'Encargados',     cocina: false },
]
const BLANK_SLOTS: NecesidadSlots = { jefeCocina: 0, cocineros: 0, friegaplatos: 0, produccion: 0, camareros: 0, encargados: 0 }
const ROLE_KEYS_FE = Object.keys(BLANK_SLOTS) as (keyof NecesidadSlots)[]
const ROL_MAP_FE: Record<keyof NecesidadSlots, string[]> = {
  jefeCocina:   ['jefe_cocina'],
  cocineros:    ['cocinero'],
  friegaplatos: ['friegaplatos'],
  produccion:   ['produccion'],
  camareros:    ['camarero'],
  encargados:   ['encargado'],
}
function empMatchesRoleFE(emp: Empleado, roleKey: keyof NecesidadSlots): boolean {
  const rol = emp.rol
  if (!rol) {
    if (['jefeCocina','cocineros','friegaplatos','produccion'].includes(roleKey)) return emp.tipo === 'cocina'
    return emp.tipo === 'sala'
  }
  if (ROL_MAP_FE[roleKey].includes(rol)) return true
  if (roleKey === 'encargados' && rol === 'camarero' && emp.puedeEncargado) return true
  if (roleKey === 'jefeCocina'  && rol === 'cocinero' && emp.puedeJefeCocina) return true
  return false
}

// Calcula cobertura vs necesidades para una semana dada
function computeDayCoverage(
  dayStr: string,
  dayIdx: number,
  turnosSemana: TurnoEmpleadoType[],
  empleados: Empleado[],
  needsPerDay: NecesidadSlots[],
) {
  const needed  = needsPerDay[dayIdx] ?? BLANK_SLOTS
  const covered = { ...BLANK_SLOTS }
  for (const rk of ROLE_KEYS_FE) {
    covered[rk] = turnosSemana.filter(t => {
      if (!t.fecha.startsWith(dayStr)) return false
      const emp = empleados.find(e => e.id === t.empleadoId)
      return emp && empMatchesRoleFE(emp, rk)
    }).length
  }
  const roles   = ROLE_KEYS_FE.filter(rk => needed[rk] > 0)
  const ok      = roles.every(rk => covered[rk] >= needed[rk])
  const partial = !ok && roles.some(rk => covered[rk] > 0)
  return { needed, covered, ok, partial, hasNeeds: roles.length > 0 }
}

const ROL_LABEL_SHORT: Record<string, string> = {
  jefeCocina: 'Jefe', cocineros: 'Cocin', friegaplatos: 'Frieg',
  produccion: 'Prod',  camareros: 'Cama',  encargados:   'Enc',
}

// ── Tab: Necesidades ──────────────────────────────────────────────────────────
function TabNecesidades({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()

  const { data: necesidades = [], isLoading } = useQuery({
    queryKey: ['staffing-necesidades', restaurantId],
    queryFn:  () => api.staffing.getNecesidades(restaurantId),
    enabled:  !!restaurantId,
  })

  const [form, setForm] = useState<NecesidadSlots[]>(() => Array.from({ length: 7 }, () => ({ ...BLANK_SLOTS })))
  // key to track which fill-all popover is open: role key or null
  const [fillOpen, setFillOpen] = useState<keyof NecesidadSlots | null>(null)
  const [fillVal,  setFillVal]  = useState('')

  useEffect(() => {
    if (necesidades.length > 0) {
      setForm(Array.from({ length: 7 }, (_, i) => {
        const n = necesidades.find(d => d.diaSemana === i)
        return n
          ? { jefeCocina: n.jefeCocina, cocineros: n.cocineros, friegaplatos: n.friegaplatos, produccion: n.produccion, camareros: n.camareros, encargados: n.encargados }
          : { ...BLANK_SLOTS }
      }))
    }
  }, [necesidades])

  const guardar = useMutation({
    mutationFn: () => api.staffing.setNecesidades(restaurantId, form.map((d, i) => ({ diaSemana: i, ...d }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staffing-necesidades', restaurantId] })
      qc.invalidateQueries({ queryKey: ['staffing-auto-preview'] })
    },
  })

  const update = (dayIdx: number, key: keyof NecesidadSlots, val: number) =>
    setForm(f => f.map((d, i) => i === dayIdx ? { ...d, [key]: Math.max(0, val) } : d))

  const fillAll = (key: keyof NecesidadSlots, val: number) =>
    setForm(f => f.map(d => ({ ...d, [key]: Math.max(0, val) })))

  const isClosed = (dayIdx: number) => Object.values(form[dayIdx] ?? BLANK_SLOTS).every(v => v === 0)

  if (isLoading) return <div className="text-center py-10 text-gray-300">Cargando…</div>

  const RolRow = ({ role, cocina }: { role: typeof ROL_DEFS[0]; cocina: boolean }) => {
    const color = cocina ? 'orange' : 'cyan'
    const isOpen = fillOpen === role.key
    return (
      <tr className="border-t border-gray-50 hover:bg-gray-50/40">
        <td className="px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-700 font-medium">{role.label}</span>
            <div className="relative">
              <button
                title="Rellenar toda la semana"
                onClick={() => { setFillOpen(isOpen ? null : role.key); setFillVal('') }}
                className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 text-[11px] font-bold flex items-center justify-center transition-colors"
              >=</button>
              {isOpen && (
                <div className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex items-center gap-2 w-44">
                  <input
                    autoFocus
                    type="number" min={0} max={20}
                    value={fillVal}
                    onChange={e => setFillVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { fillAll(role.key, parseInt(fillVal) || 0); setFillOpen(null) }
                      if (e.key === 'Escape') setFillOpen(null)
                    }}
                    placeholder="nº personas"
                    className="w-20 text-center text-sm font-bold border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                  <button
                    onClick={() => { fillAll(role.key, parseInt(fillVal) || 0); setFillOpen(null) }}
                    className="px-2 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-400"
                  >OK</button>
                </div>
              )}
            </div>
          </div>
        </td>
        {form.map((day, i) => (
          <td key={i} className="px-2 py-2 text-center">
            <input
              type="number" min={0} max={20}
              value={day[role.key]}
              onChange={e => update(i, role.key, parseInt(e.target.value) || 0)}
              className={`w-12 text-center text-sm font-bold rounded-lg py-1.5 border focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                day[role.key] > 0
                  ? color === 'orange' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-cyan-200 bg-cyan-50 text-cyan-700'
                  : 'border-gray-200 bg-white text-gray-300'
              }`}
            />
          </td>
        ))}
      </tr>
    )
  }

  return (
    <div className="space-y-4" onClick={() => setFillOpen(null)}>
      <p className="text-sm text-gray-400">
        Define cuántas personas de cada rol trabajan normalmente cada día. Los días con todo a 0 se consideran cerrados.
        Desde el Planning puedes añadir <strong>personal extra</strong> para fechas concretas (festivos, eventos…).
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto" onClick={e => e.stopPropagation()}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide min-w-[160px]">Rol</th>
              {DIAS_SEMANA.map((dia, i) => (
                <th key={i} className={`text-center px-2 py-3 min-w-[64px] ${isClosed(i) ? 'text-gray-300' : 'text-gray-700 font-bold'}`}>
                  <div className="text-xs">{dia}</div>
                  {isClosed(i) && <div className="text-[9px] font-normal text-gray-300">cerrado</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-orange-50/50">
              <td colSpan={8} className="px-4 py-1.5">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide">🍳 Cocina</span>
              </td>
            </tr>
            {ROL_DEFS.filter(r => r.cocina).map(role => (
              <RolRow key={role.key} role={role} cocina={true} />
            ))}
            <tr className="bg-cyan-50/50 border-t border-gray-100">
              <td colSpan={8} className="px-4 py-1.5">
                <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-wide">🛎 Sala</span>
              </td>
            </tr>
            {ROL_DEFS.filter(r => !r.cocina).map(role => (
              <RolRow key={role.key} role={role} cocina={false} />
            ))}
            <tr className="border-t border-gray-100 bg-gray-50/60">
              <td className="px-4 py-2 text-xs font-bold text-gray-400 uppercase">Total</td>
              {form.map((day, i) => {
                const total = Object.values(day).reduce((s, v) => s + v, 0)
                return (
                  <td key={i} className="px-2 py-2 text-center">
                    <span className={`text-sm font-bold ${total > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{total || '—'}</span>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end items-center gap-3">
        {guardar.isSuccess && <span className="text-xs text-emerald-500">✓ Guardado</span>}
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="px-5 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-colors"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar plantilla'}
        </button>
      </div>
    </div>
  )
}

// ── Modal: Extras por fecha ────────────────────────────────────────────────────
function ExtrasModal({
  restaurantId, fecha, existing, onClose,
}: {
  restaurantId: number
  fecha: string
  existing?: NecesidadFecha
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<NecesidadSlots>(
    existing
      ? { jefeCocina: existing.jefeCocina, cocineros: existing.cocineros, friegaplatos: existing.friegaplatos, produccion: existing.produccion, camareros: existing.camareros, encargados: existing.encargados }
      : { ...BLANK_SLOTS }
  )
  const [notas, setNotas] = useState(existing?.notas ?? '')

  const guardar = useMutation({
    mutationFn: () => api.staffing.setNecesidadFecha({ restaurantId, fecha, notas: notas || null, ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-extras'] }); qc.invalidateQueries({ queryKey: ['staffing-auto-preview'] }); onClose() },
  })
  const eliminar = useMutation({
    mutationFn: () => api.staffing.deleteNecesidadFecha(existing!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staffing-extras'] }); qc.invalidateQueries({ queryKey: ['staffing-auto-preview'] }); onClose() },
  })

  const update = (key: keyof NecesidadSlots, val: number) => setForm(f => ({ ...f, [key]: Math.max(0, val) }))
  const isPending = guardar.isPending || eliminar.isPending
  const total = Object.values(form).reduce((s, v) => s + v, 0)

  const d = new Date(`${fecha}T12:00:00Z`)
  const fechaLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">⭐ Personal extra</h3>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{fechaLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-2">
          <p className="text-xs text-gray-400 mb-3">Personas adicionales a la plantilla base para este día concreto.</p>

          {ROL_DEFS.map(role => (
            <div key={role.key} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 flex-1">{role.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => update(role.key, form[role.key] - 1)}
                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center font-bold">−</button>
                <span className={`w-8 text-center font-bold text-sm ${form[role.key] > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                  {form[role.key] > 0 ? `+${form[role.key]}` : '0'}
                </span>
                <button type="button" onClick={() => update(role.key, form[role.key] + 1)}
                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center font-bold">+</button>
              </div>
            </div>
          ))}

          <div className="pt-2">
            <input
              type="text"
              placeholder="Notas (ej: Festivo, Evento privado…)"
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center">
          <div>
            {existing && (
              <button onClick={() => eliminar.mutate()} disabled={isPending}
                className="text-sm text-red-400 hover:text-red-600 px-3 py-1.5 disabled:opacity-50">
                Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {total > 0 && <span className="text-xs text-indigo-500 font-semibold">+{total} personas</span>}
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">Cancelar</button>
            <button
              onClick={() => guardar.mutate()}
              disabled={isPending || total === 0}
              className="text-sm bg-indigo-500 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-50"
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Añadir empleado a un día (horas pendientes) ────────────────────────
function FillDayModal({ restaurantId, fecha, empleados, tipos, turnosSemana, onClose }: {
  restaurantId: number
  fecha: string
  empleados: Empleado[]
  tipos: TurnoTipo[]
  turnosSemana: TurnoEmpleadoType[]
  onClose: () => void
}) {
  const [assignEmp, setAssignEmp] = useState<number | null>(null)

  const d = new Date(`${fecha}T12:00:00Z`)
  const fechaLabel = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  const candidatos = empleados
    .filter(e => !e.excluirPlanning)
    .map(emp => {
      const turnosEmp  = turnosSemana.filter(t => t.empleadoId === emp.id)
      const horasAsig  = turnosEmp.reduce((s, t) => s + horasEnTurno(t.horaInicio, t.horaFin), 0)
      const horasContr = emp.horasSemanales ?? 40
      const remaining  = horasContr - horasAsig
      const tieneHoy   = turnosSemana.some(t => t.empleadoId === emp.id && t.fecha.startsWith(fecha))
      return { emp, horasAsig, horasContr, remaining, tieneHoy }
    })
    .filter(c => c.remaining > 0 && !c.tieneHoy)
    .sort((a, b) => b.remaining - a.remaining)

  if (assignEmp !== null) {
    return (
      <AssignShiftModal
        restaurantId={restaurantId}
        empleados={empleados}
        tipos={tipos}
        fecha={fecha}
        empleadoPreset={assignEmp}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Añadir al planning</h3>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{fechaLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {candidatos.length === 0 ? (
            <p className="text-center py-10 text-gray-300 text-sm">Todos los empleados tienen sus horas cubiertas.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {candidatos.map(({ emp, horasAsig, horasContr, remaining }) => (
                <button
                  key={emp.id}
                  onClick={() => setAssignEmp(emp.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 text-left transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-sm truncate">{emp.nombre}</div>
                    <div className="text-xs text-gray-400">{emp.rol ?? emp.tipo}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-indigo-600">
                      −{Math.round(remaining * 10) / 10}h
                    </div>
                    <div className="text-[10px] text-gray-300">
                      {Math.round(horasAsig * 10) / 10}/{horasContr}h
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal: Auto-planning ──────────────────────────────────────────────────────
function AutoPlanningModal({
  restaurantId, weekStart, empleados, tipos, onClose,
}: {
  restaurantId: number
  weekStart: Date
  empleados: Empleado[]
  tipos: TurnoTipo[]
  onClose: () => void
}) {
  const qc    = useQueryClient()
  const desde = toISO(weekStart)
  const days  = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)))
  const wEnd  = addDays(weekStart, 6)
  const wLabel = `${weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${wEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`

  const { data: preview, isLoading } = useQuery({
    queryKey: ['staffing-auto-preview', restaurantId, desde],
    queryFn:  () => api.staffing.autoPlanning({ restaurantId, weekStart: desde, preview: true }),
  })

  const generar = useMutation({
    mutationFn: () => api.staffing.autoPlanning({ restaurantId, weekStart: desde }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['staffing-semana'] }); onClose() },
  })

  const byEmployee = (preview?.plan ?? []).reduce((acc, item) => {
    if (!acc[item.empleadoId]) acc[item.empleadoId] = { nombre: item.empleadoNombre, shifts: [] as AutoPlanItem[] }
    acc[item.empleadoId].shifts.push(item)
    return acc
  }, {} as Record<number, { nombre: string; shifts: AutoPlanItem[] }>)

  const skipped = empleados.filter(e => (preview?.empleadosConTurnos ?? []).includes(e.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">✨ Auto-planning</h3>
            <p className="text-xs text-gray-400 mt-0.5">Semana del {wLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center py-10 text-gray-300 text-sm">Calculando plan…</div>
          ) : Object.keys(byEmployee).length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm">
                {skipped.length > 0
                  ? 'Todos los empleados ya tienen turnos esta semana.'
                  : 'No hay empleados activos para este restaurante.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Day header */}
              <div className="flex gap-1 items-end">
                <div className="w-[160px] shrink-0" />
                {days.map((d, dayIdx) => {
                  const cov = preview?.coverage?.[dayIdx]
                  const hasNeedsDay = cov && Object.values(cov.needed).some(v => v > 0)
                  const dot = !hasNeedsDay ? null : cov.ok ? 'bg-emerald-400' : cov.partial ? 'bg-amber-400' : 'bg-red-400'
                  // Tooltip: rol deficit list
                  const ROL_LABELS: Record<string, string> = { jefeCocina: 'Jefe', cocineros: 'Cocin', friegaplatos: 'Frieg', produccion: 'Prod', camareros: 'Cama', encargados: 'Enc' }
                  const deficits = cov ? (Object.keys(cov.needed) as (keyof NecesidadSlots)[])
                    .filter(rk => cov.needed[rk] > 0 && cov.covered[rk] < cov.needed[rk])
                    .map(rk => `${ROL_LABELS[rk]} ${cov.covered[rk]}/${cov.needed[rk]}`)
                    : []
                  const surpluses = cov ? (Object.keys(cov.needed) as (keyof NecesidadSlots)[])
                    .filter(rk => cov.needed[rk] > 0 && cov.covered[rk] >= cov.needed[rk])
                    .map(rk => `${ROL_LABELS[rk]} ✓`)
                    : []
                  const tooltip = [...deficits, ...surpluses].join(' · ')
                  return (
                    <div key={d} className="w-10 shrink-0 text-center" title={tooltip || undefined}>
                      <div className="text-[10px] text-gray-400 font-medium capitalize">{fmtDia(d)}</div>
                      {dot && <div className={`mx-auto mt-1 w-2 h-2 rounded-full ${dot}`} />}
                    </div>
                  )
                })}
                <div className="w-12 shrink-0" />
              </div>

              {Object.entries(byEmployee).map(([empIdStr, { nombre, shifts }]) => {
                const emp       = empleados.find(e => e.id === Number(empIdStr))
                const totalHoras = shifts.reduce((s, sh) => s + horasEnTurno(sh.horaInicio, sh.horaFin), 0)
                return (
                  <div key={empIdStr} className="flex gap-1 items-center">
                    <div className="w-[160px] shrink-0 pr-2">
                      <div className="text-sm font-medium text-gray-800 truncate">{nombre}</div>
                      <div className="text-[10px] text-gray-400">
                        {emp?.tipo} · {Math.round(totalHoras * 10) / 10}h / {emp?.horasSemanales}h
                      </div>
                    </div>
                    {days.map(d => {
                      const shift = shifts.find(s => s.fecha === d)
                      const tipo  = shift?.tipoId ? tipos.find(t => t.id === shift.tipoId) : null
                      return (
                        <div key={d} className="w-10 shrink-0">
                          {shift ? (
                            <div
                              className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-white text-[9px] font-semibold leading-tight"
                              style={{ backgroundColor: tipo?.color ?? '#94a3b8' }}
                              title={`${shift.horaInicio}–${shift.horaFin}`}
                            >
                              <span>{emp?.rol ? ROL_SHORT[emp.rol] ?? tipo?.nombre.slice(0, 5) : tipo ? tipo.nombre.slice(0, 5) : shift.horaInicio}</span>
                              <span className="opacity-75">{Math.round(horasEnTurno(shift.horaInicio, shift.horaFin) * 10) / 10}h</span>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {skipped.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1.5">Ya tienen turnos esta semana (omitidos):</p>
                  <div className="flex flex-wrap gap-1">
                    {skipped.map(e => (
                      <span key={e.id} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {e.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <span className="text-sm text-gray-400">
            {!isLoading && preview && `${preview.plan.length} turno${preview.plan.length !== 1 ? 's' : ''} a crear`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancelar
            </button>
            <button
              onClick={() => generar.mutate()}
              disabled={generar.isPending || isLoading || !preview?.plan.length}
              className="text-sm bg-indigo-500 text-white px-5 py-2 rounded-xl hover:bg-indigo-600 disabled:opacity-50 font-semibold"
            >
              {generar.isPending ? 'Creando…' : '✨ Generar planning'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Tab: Previsión ─────────────────────────────────────────────────────────────
function TabPrevision({ restaurantId, weekStart }: { restaurantId: number; weekStart: Date }) {
  const [configModal, setConfigModal] = useState(false)
  const [assignModal, setAssignModal] = useState<{ fecha: string } | null>(null)

  const desde = toISO(weekStart)
  const hasta = toISO(addDays(weekStart, 6))

  const { data: empleados = [] } = useQuery({ queryKey: ['empleados-all'], queryFn: () => api.empleados.list() })
  const { data: tipos = [] }     = useQuery({ queryKey: ['staffing-tipos', restaurantId], queryFn: () => api.staffing.getTipos(restaurantId), enabled: !!restaurantId })
  const { data: config }         = useQuery({ queryKey: ['staffing-config', restaurantId], queryFn: () => api.staffing.getConfig(restaurantId), enabled: !!restaurantId })
  const { data: forecast = [], isLoading } = useQuery({ queryKey: ['staffing-forecast', restaurantId, desde, hasta], queryFn: () => api.staffing.getForecast(restaurantId, desde, hasta), enabled: !!restaurantId })
  const { data: turnosSemana = [] } = useQuery({ queryKey: ['staffing-semana', restaurantId, desde], queryFn: () => api.staffing.getSemana(restaurantId, desde), enabled: !!restaurantId })

  const days: string[] = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)))

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setConfigModal(true)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Ratios
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-300">Cargando…</div>
      ) : (
        <div className="space-y-3">
          {days.map(dia => {
            const dayForecast = forecast.find((f: StaffingForecastDay) => f.fecha === dia)
            const turnosDia   = turnosSemana.filter(t => t.fecha.startsWith(dia))
            const hayFaltas   = dayForecast?.alertas.some(a => a.tipo === 'falta')

            return (
              <div key={dia} className={`bg-white rounded-xl border ${hayFaltas ? 'border-red-200' : 'border-gray-100'} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold text-gray-800 text-sm capitalize">{fmtDia(dia, 'long')}</span>
                    {dayForecast && dayForecast.totalPax > 0 && (
                      <span className="ml-2 text-xs text-gray-400">{dayForecast.totalPax} pax</span>
                    )}
                  </div>
                  <button onClick={() => setAssignModal({ fecha: dia })} className="text-xs text-cyan-500 hover:text-cyan-700 font-medium">
                    + Turno
                  </button>
                </div>

                {dayForecast && dayForecast.totalPax > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {(['sala', 'cocina'] as const).map(rol => {
                      const alerta    = dayForecast.alertas.find(a => a.rol === rol)
                      const necesario = dayForecast.necesario[rol]
                      const asignado  = dayForecast.asignado[rol]
                      return (
                        <div key={rol} className={`rounded-lg px-3 py-2 text-xs ${
                          alerta?.tipo === 'falta'  ? 'bg-red-50 text-red-700' :
                          alerta?.tipo === 'exceso' ? 'bg-amber-50 text-amber-700' :
                          'bg-emerald-50 text-emerald-700'
                        }`}>
                          <div className="font-semibold capitalize">{rol}</div>
                          <div>{asignado} / {necesario} necesario{necesario !== 1 ? 's' : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {turnosDia.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {turnosDia.map(t => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium text-white"
                        style={{ backgroundColor: t.tipo?.color ?? (t.estado === 'ausente' ? '#ef4444' : t.estado === 'confirmado' ? '#10b981' : '#94a3b8') }}
                      >
                        {t.tipo && <span className="opacity-80">{t.tipo.nombre} ·</span>}
                        {t.empleado.nombre.split(' ')[0]} {t.horaInicio}–{t.horaFin}
                      </span>
                    ))}
                  </div>
                )}

                {turnosDia.length === 0 && (!dayForecast || dayForecast.totalPax === 0) && (
                  <p className="text-xs text-gray-300">Sin reservas ni personal asignado</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {assignModal && (
        <AssignShiftModal
          restaurantId={restaurantId}
          empleados={empleados as Empleado[]}
          tipos={tipos}
          fecha={assignModal.fecha}
          onClose={() => setAssignModal(null)}
        />
      )}

      {configModal && config && (
        <ConfigModal
          restaurantId={restaurantId}
          ratioSala={config.ratioSalaXPax}
          ratioCocina={config.ratioCocinaXPax}
          onClose={() => setConfigModal(false)}
        />
      )}
    </>
  )
}

// ── Tab: Turnos (grid semanal) ─────────────────────────────────────────────────
function TabTurnos({ restaurantId, weekStart }: { restaurantId: number; weekStart: Date }) {
  const qc = useQueryClient()
  const [editModal, setEditModal]         = useState<{ fecha: string; turno?: TurnoEmpleadoType; empleadoId?: number } | null>(null)
  const [autoPlanModal, setAutoPlanModal] = useState(false)
  const [extrasModal, setExtrasModal]     = useState<string | null>(null)
  const [fillDayModal, setFillDayModal]   = useState<string | null>(null) // fecha string

  const desde = toISO(weekStart)
  const hasta = toISO(addDays(weekStart, 6))
  const days: string[] = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)))

  const { data: empleados = [] }    = useQuery({ queryKey: ['empleados-all'], queryFn: () => api.empleados.list() })
  const { data: tipos = [] }        = useQuery({ queryKey: ['staffing-tipos', restaurantId], queryFn: () => api.staffing.getTipos(restaurantId), enabled: !!restaurantId })
  const { data: turnosSemana = [], isLoading } = useQuery({ queryKey: ['staffing-semana', restaurantId, desde], queryFn: () => api.staffing.getSemana(restaurantId, desde), enabled: !!restaurantId })
  const { data: extras = [] }       = useQuery({ queryKey: ['staffing-extras', restaurantId, desde], queryFn: () => api.staffing.getNecesidadesFecha(restaurantId, desde, hasta), enabled: !!restaurantId })
  const { data: necesidades = [] }  = useQuery({ queryKey: ['staffing-necesidades', restaurantId], queryFn: () => api.staffing.getNecesidades(restaurantId), enabled: !!restaurantId })

  const needsPerDay: NecesidadSlots[] = days.map((dayStr, dayIdx) => {
    const base  = necesidades.find((n: NecesidadDia) => n.diaSemana === dayIdx) ?? BLANK_SLOTS
    const extra = (extras as NecesidadFecha[]).find(f => f.fecha.startsWith(dayStr))
    return {
      jefeCocina:   (base.jefeCocina   ?? 0) + (extra?.jefeCocina   ?? 0),
      cocineros:    (base.cocineros    ?? 0) + (extra?.cocineros    ?? 0),
      friegaplatos: (base.friegaplatos ?? 0) + (extra?.friegaplatos ?? 0),
      produccion:   (base.produccion   ?? 0) + (extra?.produccion   ?? 0),
      camareros:    (base.camareros    ?? 0) + (extra?.camareros    ?? 0),
      encargados:   (base.encargados   ?? 0) + (extra?.encargados   ?? 0),
    }
  })

  const deshacerMutation = useMutation({
    mutationFn: () => api.staffing.deleteSemana(restaurantId, desde),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['staffing-semana'] }),
  })

  const [draggingId, setDraggingId]   = useState<number | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const moveMutation = useMutation({
    mutationFn: async ({ sourceId, sourceEmpId, sourceFecha, targetEmpId, targetFecha, targetId }: {
      sourceId: number; sourceEmpId: number; sourceFecha: string
      targetEmpId: number; targetFecha: string; targetId?: number
    }) => {
      if (targetId !== undefined) {
        await Promise.all([
          api.staffing.updateTurno(sourceId, { empleadoId: targetEmpId, fecha: targetFecha }),
          api.staffing.updateTurno(targetId, { empleadoId: sourceEmpId, fecha: sourceFecha }),
        ])
      } else {
        await api.staffing.updateTurno(sourceId, { empleadoId: targetEmpId, fecha: targetFecha })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staffing-semana'] }),
  })

  const handleDrop = (targetEmpId: number, targetFecha: string) => {
    setDragOverKey(null)
    if (!draggingId) return
    const source = turnosSemana.find(t => t.id === draggingId)
    if (!source) return
    const sourceFecha = source.fecha.slice(0, 10)
    if (source.empleadoId === targetEmpId && sourceFecha === targetFecha) return
    const targetTurno = turnosSemana.find(t => t.empleadoId === targetEmpId && t.fecha.startsWith(targetFecha))
    moveMutation.mutate({
      sourceId: source.id, sourceEmpId: source.empleadoId, sourceFecha,
      targetEmpId, targetFecha, ...(targetTurno ? { targetId: targetTurno.id } : {}),
    })
    setDraggingId(null)
  }

  const empleadosActivos  = (empleados as Empleado[]).filter(e => e.activo)
  const empleadosEnGrid   = empleadosActivos.filter(emp => turnosSemana.some(t => t.empleadoId === emp.id))

  return (
    <>
      <div className="flex justify-end gap-2 mb-3">
        {turnosSemana.length > 0 && (
          <button
            onClick={() => {
              if (confirm(`¿Borrar los ${turnosSemana.length} turnos de esta semana?`)) {
                deshacerMutation.mutate()
              }
            }}
            disabled={deshacerMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            ↩ Deshacer semana
          </button>
        )}
        <button
          onClick={() => setAutoPlanModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-400 transition-colors"
        >
          ✨ Auto-planning
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-medium py-2 pr-3 min-w-[130px]">Empleado</th>
              {days.map((d, dayIdx) => {
                const extra = (extras as NecesidadFecha[]).find(e => e.fecha.startsWith(d))
                const extraTotal = extra ? Object.entries(extra).filter(([k]) => ROLE_KEYS_FE.includes(k as keyof NecesidadSlots)).reduce((s, [,v]) => s + (v as number), 0) : 0
                const cov = computeDayCoverage(d, dayIdx, turnosSemana as TurnoEmpleadoType[], empleados as Empleado[], needsPerDay)
                const dot = !cov.hasNeeds ? null : cov.ok ? 'bg-emerald-400' : cov.partial ? 'bg-amber-400' : 'bg-red-400'
                const deficits = cov.hasNeeds ? ROLE_KEYS_FE
                  .filter(rk => cov.needed[rk] > 0 && cov.covered[rk] < cov.needed[rk])
                  .map(rk => `${ROL_LABEL_SHORT[rk]} ${cov.covered[rk]}/${cov.needed[rk]}`)
                  : []
                const oks = cov.hasNeeds ? ROLE_KEYS_FE
                  .filter(rk => cov.needed[rk] > 0 && cov.covered[rk] >= cov.needed[rk])
                  .map(rk => `${ROL_LABEL_SHORT[rk]} ✓`)
                  : []
                const tooltip = [...deficits, ...oks].join(' · ')
                return (
                  <th key={d} className="py-1.5 px-1 min-w-[90px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => setFillDayModal(d)}
                        className="flex items-center gap-1 hover:text-indigo-500 transition-colors group"
                        title="Añadir empleado a este día"
                      >
                        <span className="text-gray-500 font-medium text-xs capitalize group-hover:text-indigo-500">{fmtDia(d)}</span>
                        {dot && <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} title={tooltip || undefined} />}
                      </button>
                      <button
                        onClick={() => setExtrasModal(d)}
                        className={`text-[9px] px-1.5 py-0.5 rounded-md transition-colors leading-tight ${
                          extra
                            ? 'bg-amber-100 text-amber-600 font-bold'
                            : 'text-gray-300 hover:text-indigo-400 hover:bg-indigo-50'
                        }`}
                      >
                        {extra ? `⭐ +${extraTotal}` : '+ extra'}
                      </button>
                    </div>
                  </th>
                )
              })}
              <th className="text-right text-gray-500 font-medium py-2 pl-3 min-w-[80px]">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-300">Cargando…</td></tr>
            ) : empleadosEnGrid.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-300 text-sm">
                  Sin planning esta semana.<br />
                  <span className="text-xs">Usa ✨ Auto-planning o haz click en un día para añadir turnos.</span>
                </td>
              </tr>
            ) : empleadosEnGrid.map(emp => {
              const turnosEmp    = turnosSemana.filter(t => t.empleadoId === emp.id)
              const horasAsig    = turnosEmp.reduce((s, t) => s + horasEnTurno(t.horaInicio, t.horaFin), 0)
              const horasContrato = emp.horasSemanales ?? 40

              return (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-gray-800 truncate max-w-[120px]">{emp.nombre}</div>
                    <div className="text-gray-400 text-[10px]">{emp.rol ?? emp.tipo}</div>
                  </td>
                  {days.map(dia => {
                    const turno  = turnosSemana.find(t => t.empleadoId === emp.id && t.fecha.startsWith(dia))
                    const cellKey = `${emp.id}-${dia}`
                    const isOver  = dragOverKey === cellKey
                    const isDragging = turno && draggingId === turno.id
                    return (
                      <td key={dia} className="py-1.5 px-1 text-center">
                        {turno ? (
                          <button
                            draggable
                            onDragStart={e => { e.stopPropagation(); setDraggingId(turno.id) }}
                            onDragEnd={() => { setDraggingId(null); setDragOverKey(null) }}
                            onDragOver={e => { e.preventDefault(); setDragOverKey(cellKey) }}
                            onDragLeave={() => setDragOverKey(null)}
                            onDrop={e => { e.preventDefault(); handleDrop(emp.id, dia) }}
                            onClick={() => !isDragging && setEditModal({ fecha: dia, turno })}
                            className="text-[10px] px-1.5 py-1 rounded-lg font-semibold leading-tight text-white w-full transition-opacity"
                            style={{
                              backgroundColor:
                                turno.estado === 'ausente'   ? '#ef4444' :
                                turno.estado === 'confirmado'? '#10b981' :
                                (emp.rol && turno.tipo?.rolEmpleado && turno.tipo.rolEmpleado !== emp.rol)
                                  ? (ROL_COLOR[emp.rol] ?? '#94a3b8')
                                  : (turno.tipo?.color ?? (emp.rol ? ROL_COLOR[emp.rol] : '#94a3b8')),
                              opacity: isDragging ? 0.35 : turno.estado === 'ausente' ? 0.6 : 1,
                              cursor: isDragging ? 'grabbing' : 'grab',
                              outline: isOver && draggingId !== turno.id ? '2px solid #6366f1' : undefined,
                              outlineOffset: '2px',
                            }}
                          >
                            {emp.rol ? (ROL_SHORT[emp.rol] ?? turno.tipo?.nombre ?? turno.horaInicio) : (turno.tipo?.nombre ?? turno.horaInicio)}<br />
                            <span className="opacity-80">{horasEnTurno(turno.horaInicio, turno.horaFin)}h</span>
                          </button>
                        ) : (
                          <button
                            onDragOver={e => { e.preventDefault(); setDragOverKey(cellKey) }}
                            onDragLeave={() => setDragOverKey(null)}
                            onDrop={e => { e.preventDefault(); handleDrop(emp.id, dia) }}
                            onClick={() => setEditModal({ fecha: dia, empleadoId: emp.id })}
                            className={`w-full h-10 rounded-lg border border-dashed transition-colors text-base flex items-center justify-center ${
                              isOver
                                ? 'border-indigo-400 bg-indigo-50 text-indigo-400'
                                : 'border-gray-200 text-gray-300 hover:border-cyan-300 hover:text-cyan-400'
                            }`}
                          >
                            {isOver ? '↓' : '+'}
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td className="py-2 pl-3">
                    <div className="min-w-[72px]">
                      <div className="flex items-baseline justify-end gap-0.5">
                        <span className={`text-sm font-bold ${
                          horasAsig >= horasContrato ? 'text-emerald-600' :
                          horasAsig >= horasContrato * 0.5 ? 'text-amber-500' : 'text-red-500'
                        }`}>{Math.round(horasAsig * 10) / 10}</span>
                        <span className="text-[10px] text-gray-400">/{horasContrato}h</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            horasAsig >= horasContrato ? 'bg-emerald-400' :
                            horasAsig >= horasContrato * 0.5 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.round((horasAsig / horasContrato) * 100))}%` }}
                        />
                      </div>
                      {horasAsig < horasContrato && (
                        <div className={`text-[9px] font-semibold text-right mt-0.5 ${
                          horasAsig >= horasContrato * 0.5 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          −{Math.round((horasContrato - horasAsig) * 10) / 10}h
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editModal && (
        <AssignShiftModal
          restaurantId={restaurantId}
          empleados={empleadosActivos}
          tipos={tipos}
          fecha={editModal.fecha}
          turnoExistente={editModal.turno}
          empleadoPreset={editModal.empleadoId}
          onClose={() => setEditModal(null)}
        />
      )}

      {autoPlanModal && (
        <AutoPlanningModal
          restaurantId={restaurantId}
          weekStart={weekStart}
          empleados={empleadosActivos}
          tipos={tipos}
          onClose={() => setAutoPlanModal(false)}
        />
      )}

      {extrasModal && (
        <ExtrasModal
          restaurantId={restaurantId}
          fecha={extrasModal}
          existing={extras.find((e: NecesidadFecha) => e.fecha.startsWith(extrasModal))}
          onClose={() => setExtrasModal(null)}
        />
      )}

      {fillDayModal && (
        <FillDayModal
          restaurantId={restaurantId}
          fecha={fillDayModal}
          empleados={empleadosActivos}
          tipos={tipos}
          turnosSemana={turnosSemana as TurnoEmpleadoType[]}
          onClose={() => setFillDayModal(null)}
        />
      )}
    </>
  )
}

// ── Modal: Planning global (multi-restaurante) ────────────────────────────────
function GlobalPlanningModal({ weekStart, restaurantes, onClose }: {
  weekStart: Date
  restaurantes: Restaurante[]
  onClose: () => void
}) {
  const qc     = useQueryClient()
  const desde  = toISO(weekStart)
  const wEnd   = addDays(weekStart, 6)
  const wLabel = `${weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${wEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`

  const [selected,    setSelected]    = useState<Set<number>>(() => new Set(restaurantes.map(r => r.id)))
  const [status,      setStatus]      = useState<'select' | 'running' | 'done'>('select')
  const [results,     setResults]     = useState<{ id: number; nombre: string; created: number; error?: string }[]>([])
  const [currentIdx,  setCurrentIdx]  = useState(-1)

  const toggle = (id: number) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const selectedList = restaurantes.filter(r => selected.has(r.id))

  const generar = async () => {
    setStatus('running')
    const res: typeof results = []
    for (let i = 0; i < selectedList.length; i++) {
      setCurrentIdx(i)
      const r = selectedList[i]
      try {
        const data = await api.staffing.autoPlanning({ restaurantId: r.id, weekStart: desde })
        res.push({ id: r.id, nombre: r.nombre, created: data.created ?? 0 })
      } catch {
        res.push({ id: r.id, nombre: r.nombre, created: 0, error: 'Error al generar' })
      }
      setResults([...res])
    }
    setCurrentIdx(-1)
    setStatus('done')
    qc.invalidateQueries({ queryKey: ['staffing-semana'] })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800">✨ Planning global</h3>
            <p className="text-xs text-gray-400 mt-0.5">Semana del {wLabel}</p>
          </div>
          {status !== 'running' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          )}
        </div>

        {/* Fase 1: selección */}
        {status === 'select' && (
          <>
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs text-gray-400 mb-3">
                Los restaurantes se planifican en orden. Cada uno tiene en cuenta las horas ya asignadas en los anteriores.
              </p>
              {restaurantes.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    selected.has(r.id) ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    selected.has(r.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'
                  }`}>
                    {selected.has(r.id) && <span className="text-white text-xs font-bold">✓</span>}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{r.nombre}</span>
                </button>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">Cancelar</button>
              <button
                onClick={generar}
                disabled={selected.size === 0}
                className="text-sm bg-indigo-500 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-600 disabled:opacity-40"
              >
                Generar {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          </>
        )}

        {/* Fase 2: ejecutando */}
        {status === 'running' && (
          <div className="px-5 py-6 space-y-3">
            <p className="text-xs text-gray-400 text-center mb-1">Generando planning…</p>
            {selectedList.map((r, i) => {
              const done   = results.some(x => x.id === r.id)
              const active = i === currentIdx
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs transition-colors ${
                    done   ? 'bg-emerald-400 text-white' :
                    active ? 'bg-indigo-400 animate-pulse' : 'bg-gray-100'
                  }`}>
                    {done ? '✓' : null}
                  </div>
                  <span className={`text-sm flex-1 ${
                    active ? 'font-semibold text-gray-800' : done ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    {r.nombre}
                  </span>
                  {done && (
                    <span className="text-xs text-gray-400">
                      {results.find(x => x.id === r.id)?.created ?? 0} turnos
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Fase 3: resultados */}
        {status === 'done' && (
          <>
            <div className="px-5 py-4 space-y-2">
              {results.map(r => (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${r.error ? 'bg-red-50' : 'bg-emerald-50'}`}>
                  <span className="text-base">{r.error ? '⚠️' : '✅'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{r.nombre}</div>
                    <div className={`text-xs ${r.error ? 'text-red-400' : 'text-emerald-600'}`}>
                      {r.error ?? `${r.created} turno${r.created !== 1 ? 's' : ''} creado${r.created !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={onClose} className="text-sm bg-gray-800 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function StaffingPage() {
  const [restaurantId,    setRestaurantId]    = useState(0)
  const [tab,             setTab]             = useState<'prevision' | 'turnos' | 'tipos' | 'necesidades'>('tipos')
  const [weekStart,       setWeekStart]       = useState<Date>(() => isoWeekStart(new Date()))
  const [globalPlanModal, setGlobalPlanModal] = useState(false)

  const { data: restaurantes = [] } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
    staleTime: 300_000,
  })

  const selectedRestaurantId = restaurantId || (restaurantes[0]?.id ?? 0)

  const prevSemana  = () => setWeekStart(d => addDays(d, -7))
  const nextSemana  = () => setWeekStart(d => addDays(d, 7))
  const estaSemana  = () => setWeekStart(isoWeekStart(new Date()))

  const weekEnd   = addDays(weekStart, 6)
  const weekLabel = `${weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`

  const TAB_LABELS = { tipos: 'Tipos de turno', turnos: 'Planning', prevision: 'Previsión', necesidades: 'Necesidades' }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de personal</h1>
            <p className="text-gray-400 text-sm mt-1">Tipos de turno, planning semanal y previsión</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGlobalPlanModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-400 transition-colors"
            >
              ✨ Plan global
            </button>
            <select
              value={selectedRestaurantId}
              onChange={e => setRestaurantId(Number(e.target.value))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              {restaurantes.map(r => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
          {(['tipos', 'necesidades', 'turnos', 'prevision'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Week navigator — solo para planning/previsión */}
        {tab !== 'tipos' && tab !== 'necesidades' && (
          <div className="flex items-center gap-3 mb-5">
            <button onClick={prevSemana} className="p-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-500">←</button>
            <span className="text-sm font-medium text-gray-700 min-w-[160px] text-center">{weekLabel}</span>
            <button onClick={nextSemana} className="p-1.5 rounded-lg border border-gray-200 hover:bg-white text-gray-500">→</button>
            <button onClick={estaSemana} className="text-xs text-cyan-500 hover:text-cyan-700 ml-1">Esta semana</button>
          </div>
        )}

        {/* Tab content */}
        {selectedRestaurantId > 0 && (
          tab === 'tipos'        ? <TabTipos        restaurantId={selectedRestaurantId} /> :
          tab === 'necesidades'  ? <TabNecesidades  restaurantId={selectedRestaurantId} /> :
          tab === 'prevision'    ? <TabPrevision    restaurantId={selectedRestaurantId} weekStart={weekStart} /> :
                                   <TabTurnos       restaurantId={selectedRestaurantId} weekStart={weekStart} />
        )}

        {globalPlanModal && (
          <GlobalPlanningModal
            weekStart={weekStart}
            restaurantes={restaurantes as Restaurante[]}
            onClose={() => setGlobalPlanModal(false)}
          />
        )}
      </div>
    </div>
  )
}
