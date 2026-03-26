import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Restaurante, ReservaHorario, Reserva } from '../api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtFechaLabel(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

const DIA_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const ESTADO_COLORS: Record<string, string> = {
  confirmada: 'bg-green-900 text-green-300',
  cancelada: 'bg-red-900 text-red-300',
  no_show: 'bg-gray-700 text-gray-300',
}

// ─── Tab Reservas ─────────────────────────────────────────────────────────────

function TabReservas({ restaurantes }: { restaurantes: Restaurante[] }) {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [fecha, setFecha] = useState(todayISO())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ hora: '', pax: 2, nombre: '', telefono: '', email: '', notas: '' })

  const { data: reservas = [], isLoading } = useQuery({
    queryKey: ['reservas', restaurantId, fecha],
    queryFn: () => api.reservas.list(restaurantId!, fecha),
    enabled: !!restaurantId,
  })

  const createMut = useMutation({
    mutationFn: () => api.reservas.create({
      restaurantId: restaurantId!,
      fecha,
      hora: form.hora,
      pax: form.pax,
      nombre: form.nombre,
      telefono: form.telefono,
      email: form.email || undefined,
      notas: form.notas || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas', restaurantId] })
      setShowForm(false)
      setForm({ hora: '', pax: 2, nombre: '', telefono: '', email: '', notas: '' })
    },
  })

  const updateEstadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => api.reservas.updateEstado(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas', restaurantId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.reservas.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas', restaurantId] }),
  })

  const totalPax = reservas.filter((r: Reserva) => r.estado !== 'cancelada').reduce((acc, r) => acc + r.pax, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Selector de restaurante */}
      <div className="flex flex-wrap gap-2 mb-6">
        {restaurantes.map((r) => (
          <button
            key={r.id}
            onClick={() => setRestaurantId(r.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              restaurantId === r.id
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {!restaurantId ? (
        <p className="text-gray-400">Selecciona un restaurante para ver las reservas.</p>
      ) : (
        <>
          {/* Navegador de fecha */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setFecha(addDays(fecha, -1))}
              className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              ←
            </button>
            <span className="text-white font-medium capitalize">{fmtFechaLabel(fecha)}</span>
            <button
              onClick={() => setFecha(addDays(fecha, 1))}
              className="p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              →
            </button>
            <button
              onClick={() => setFecha(todayISO())}
              className="ml-2 px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
            >
              Hoy
            </button>
          </div>

          {/* Resumen */}
          <div className="flex gap-4 mb-4">
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="text-2xl font-bold text-white">{reservas.length}</div>
              <div className="text-xs text-gray-400">Reservas</div>
            </div>
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-center min-w-[100px]">
              <div className="text-2xl font-bold text-white">{totalPax}</div>
              <div className="text-xs text-gray-400">Comensales</div>
            </div>
          </div>

          {/* Botón nueva reserva */}
          <div className="mb-4">
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 transition-colors"
            >
              + Nueva reserva manual
            </button>
          </div>

          {/* Formulario nueva reserva */}
          {showForm && (
            <div className="bg-gray-800 rounded-xl p-4 mb-4 border border-gray-700">
              <h3 className="text-white font-medium mb-3">Nueva reserva — {fmtFechaLabel(fecha)}</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Hora *</label>
                  <input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setForm({ ...form, hora: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Pax *</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.pax}
                    onChange={(e) => setForm({ ...form, pax: parseInt(e.target.value) || 1 })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Nombre del titular"
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Teléfono *</label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    placeholder="+34 612 345 678"
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="opcional"
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Notas</label>
                  <input
                    type="text"
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    placeholder="Alergias, ocasión especial..."
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => createMut.mutate()}
                  disabled={!form.hora || !form.nombre || !form.telefono || createMut.isPending}
                  className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createMut.isPending ? 'Guardando...' : 'Guardar reserva'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de reservas */}
          {isLoading ? (
            <div className="text-gray-400">Cargando reservas...</div>
          ) : reservas.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-400">
              No hay reservas para este día
            </div>
          ) : (
            <div className="space-y-2">
              {reservas.map((r: Reserva) => (
                <div key={r.id} className="bg-gray-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                  <span className="text-white font-mono font-medium w-12 shrink-0">{r.hora}</span>
                  <span className="text-gray-300 text-sm shrink-0">{r.pax} pax</span>
                  <span className="text-white font-medium flex-1 min-w-[120px]">{r.nombre}</span>
                  <span className="text-gray-400 text-sm">{r.telefono}</span>
                  {r.notas && (
                    <span className="text-gray-500 text-xs italic">· {r.notas}</span>
                  )}
                  {r.origen === 'manual' && (
                    <span className="text-xs bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded">Manual</span>
                  )}
                  <select
                    value={r.estado}
                    onChange={(e) => updateEstadoMut.mutate({ id: r.id, estado: e.target.value })}
                    className={`text-xs px-2 py-1 rounded font-medium border-0 cursor-pointer ${ESTADO_COLORS[r.estado] ?? 'bg-gray-700 text-gray-300'}`}
                  >
                    <option value="confirmada">confirmada</option>
                    <option value="cancelada">cancelada</option>
                    <option value="no_show">no_show</option>
                  </select>
                  <button
                    onClick={() => {
                      if (confirm('¿Eliminar esta reserva?')) deleteMut.mutate(r.id)
                    }}
                    className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tab Configuración ────────────────────────────────────────────────────────

function TabConfiguracion({ restaurantes }: { restaurantes: Restaurante[] }) {
  const qc = useQueryClient()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [configForm, setConfigForm] = useState({
    slug: '',
    activo: true,
    maxPaxPorSlot: 20,
    duracionMin: 90,
    diasAntelacion: 30,
  })
  const [configSaved, setConfigSaved] = useState(false)
  const [showHorarioForm, setShowHorarioForm] = useState(false)
  const [horarioForm, setHorarioForm] = useState({
    nombre: 'Noche',
    diasSemana: [] as number[],
    horaInicio: '20:00',
    horaFin: '23:00',
    intervaloMin: 15,
    maxPax: 20,
  })

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['reservaConfig', restaurantId],
    queryFn: () => api.reservas.getConfig(restaurantId!),
    enabled: !!restaurantId,
    retry: false,
  })

  // When config loads, populate form
  const configLoaded = config?.id
  if (configLoaded && configForm.slug === '' && config.slug) {
    setConfigForm({
      slug: config.slug,
      activo: config.activo,
      maxPaxPorSlot: config.maxPaxPorSlot,
      duracionMin: config.duracionMin,
      diasAntelacion: config.diasAntelacion,
    })
  }

  const upsertConfigMut = useMutation({
    mutationFn: () => api.reservas.upsertConfig(restaurantId!, configForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservaConfig', restaurantId] })
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
    },
  })

  const createHorarioMut = useMutation({
    mutationFn: () => api.reservas.createHorario({
      configId: config!.id,
      ...horarioForm,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservaConfig', restaurantId] })
      setShowHorarioForm(false)
      setHorarioForm({ nombre: 'Noche', diasSemana: [], horaInicio: '20:00', horaFin: '23:00', intervaloMin: 15, maxPax: 20 })
    },
  })

  const updateHorarioMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ReservaHorario> }) => api.reservas.updateHorario(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservaConfig', restaurantId] }),
  })

  const deleteHorarioMut = useMutation({
    mutationFn: (id: number) => api.reservas.deleteHorario(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservaConfig', restaurantId] }),
  })

  const toggleDia = (dia: number) => {
    setHorarioForm((prev) => ({
      ...prev,
      diasSemana: prev.diasSemana.includes(dia)
        ? prev.diasSemana.filter((d) => d !== dia)
        : [...prev.diasSemana, dia],
    }))
  }

  const publicUrl = configForm.slug
    ? `${window.location.origin}/reservas/${configForm.slug}`
    : ''

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Selector de restaurante */}
      <div className="flex flex-wrap gap-2 mb-6">
        {restaurantes.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setRestaurantId(r.id)
              setConfigForm({ slug: '', activo: true, maxPaxPorSlot: 20, duracionMin: 90, diasAntelacion: 30 })
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              restaurantId === r.id
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {!restaurantId ? (
        <p className="text-gray-400">Selecciona un restaurante para configurar reservas.</p>
      ) : loadingConfig ? (
        <p className="text-gray-400">Cargando configuración...</p>
      ) : (
        <>
          {/* Config form */}
          <div className="bg-gray-800 rounded-xl p-5 mb-6">
            <h3 className="text-white font-semibold mb-4">Configuración general</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Slug (URL pública) *</label>
                <input
                  type="text"
                  value={configForm.slug}
                  onChange={(e) => setConfigForm({ ...configForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="ej: sensi-gracia"
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                />
                {publicUrl && (
                  <p className="text-xs text-gray-500 mt-1">URL pública: <span className="text-cyan-400">{publicUrl}</span></p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Máx. pax/slot</label>
                  <input
                    type="number"
                    min={1}
                    value={configForm.maxPaxPorSlot}
                    onChange={(e) => setConfigForm({ ...configForm, maxPaxPorSlot: parseInt(e.target.value) || 1 })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Duración (min)</label>
                  <input
                    type="number"
                    min={30}
                    step={15}
                    value={configForm.duracionMin}
                    onChange={(e) => setConfigForm({ ...configForm, duracionMin: parseInt(e.target.value) || 90 })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Días antelación</label>
                  <input
                    type="number"
                    min={1}
                    value={configForm.diasAntelacion}
                    onChange={(e) => setConfigForm({ ...configForm, diasAntelacion: parseInt(e.target.value) || 30 })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-300">Reservas activas</label>
                <button
                  onClick={() => setConfigForm({ ...configForm, activo: !configForm.activo })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${configForm.activo ? 'bg-cyan-600' : 'bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${configForm.activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <button
                onClick={() => upsertConfigMut.mutate()}
                disabled={!configForm.slug || upsertConfigMut.isPending}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors"
              >
                {configSaved ? '✓ Guardado' : upsertConfigMut.isPending ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>

          {/* Horarios */}
          {config && (
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Horarios</h3>
                <button
                  onClick={() => setShowHorarioForm(!showHorarioForm)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-sm hover:bg-cyan-600 transition-colors"
                >
                  + Añadir horario
                </button>
              </div>

              {/* Formulario nuevo horario */}
              {showHorarioForm && (
                <div className="bg-gray-750 border border-gray-600 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Nombre</label>
                      <input
                        type="text"
                        value={horarioForm.nombre}
                        onChange={(e) => setHorarioForm({ ...horarioForm, nombre: e.target.value })}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Intervalo (min)</label>
                      <select
                        value={horarioForm.intervaloMin}
                        onChange={(e) => setHorarioForm({ ...horarioForm, intervaloMin: parseInt(e.target.value) })}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                      >
                        {[15, 30, 45, 60].map((v) => <option key={v} value={v}>{v} min</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Hora inicio</label>
                      <input
                        type="time"
                        value={horarioForm.horaInicio}
                        onChange={(e) => setHorarioForm({ ...horarioForm, horaInicio: e.target.value })}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Hora fin</label>
                      <input
                        type="time"
                        value={horarioForm.horaFin}
                        onChange={(e) => setHorarioForm({ ...horarioForm, horaFin: e.target.value })}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Máx. pax</label>
                      <input
                        type="number"
                        min={1}
                        value={horarioForm.maxPax}
                        onChange={(e) => setHorarioForm({ ...horarioForm, maxPax: parseInt(e.target.value) || 1 })}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 block mb-2">Días de la semana</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <button
                          key={d}
                          onClick={() => toggleDia(d)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                            horarioForm.diasSemana.includes(d)
                              ? 'bg-cyan-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {DIA_LABELS[d - 1]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => createHorarioMut.mutate()}
                      disabled={horarioForm.diasSemana.length === 0 || createHorarioMut.isPending}
                      className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors"
                    >
                      {createHorarioMut.isPending ? 'Guardando...' : 'Guardar horario'}
                    </button>
                    <button
                      onClick={() => setShowHorarioForm(false)}
                      className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de horarios */}
              {config.horarios.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay horarios configurados.</p>
              ) : (
                <div className="space-y-2">
                  {config.horarios.map((h: ReservaHorario) => (
                    <div key={h.id} className="flex items-center gap-3 bg-gray-750 border border-gray-700 rounded-lg px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white text-sm font-medium">{h.nombre}</span>
                          <span className="text-gray-400 text-xs">{h.horaInicio}–{h.horaFin}</span>
                          <span className="text-gray-500 text-xs">c/{h.intervaloMin}min</span>
                          <span className="text-gray-500 text-xs">máx {h.maxPax} pax</span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                            <span
                              key={d}
                              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                (h.diasSemana as number[]).includes(d)
                                  ? 'bg-cyan-800 text-cyan-300'
                                  : 'bg-gray-700 text-gray-600'
                              }`}
                            >
                              {DIA_LABELS[d - 1]}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Activo toggle */}
                      <button
                        onClick={() => updateHorarioMut.mutate({ id: h.id, body: { activo: !h.activo } })}
                        className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${h.activo ? 'bg-cyan-600' : 'bg-gray-600'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${h.activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('¿Eliminar este horario?')) deleteHorarioMut.mutate(h.id)
                        }}
                        className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!config && !loadingConfig && (
            <div className="bg-gray-800 rounded-xl p-5">
              <p className="text-gray-400 text-sm">Guarda la configuración primero para poder añadir horarios.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReservasAdminPage() {
  const [tab, setTab] = useState<'reservas' | 'config'>('reservas')

  const { data: restaurantes = [] } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <h1 className="text-2xl font-bold text-white mb-4">Reservas</h1>
        <div className="flex gap-1 border-b border-gray-700">
          <button
            onClick={() => setTab('reservas')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === 'reservas'
                ? 'bg-gray-800 text-white border-b-2 border-cyan-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Reservas
          </button>
          <button
            onClick={() => setTab('config')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === 'config'
                ? 'bg-gray-800 text-white border-b-2 border-cyan-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Configuración
          </button>
        </div>
      </div>

      {tab === 'reservas' ? (
        <TabReservas restaurantes={restaurantes} />
      ) : (
        <TabConfiguracion restaurantes={restaurantes} />
      )}
    </div>
  )
}
