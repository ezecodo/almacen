import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Empleado, Restaurante } from '../api'

function generarPin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

type Tipo = 'cocina' | 'sala'
const HORAS_CONTRATO = [20, 25, 30, 35, 40]

const TIPO_LABEL: Record<Tipo, string> = { cocina: 'Cocina', sala: 'Sala' }
const TIPO_COLOR: Record<Tipo, string> = {
  cocina: 'bg-orange-50 text-orange-600 border border-orange-200',
  sala:   'bg-cyan-50 text-cyan-600 border border-cyan-200',
}
const HORAS_COLOR: Record<number, string> = {
  20: 'bg-gray-100 text-gray-500',
  25: 'bg-teal-50 text-teal-500',
  30: 'bg-blue-50 text-blue-500',
  35: 'bg-indigo-50 text-indigo-500',
  40: 'bg-purple-50 text-purple-600',
}

const ROLES: Record<Tipo, { value: string; label: string }[]> = {
  cocina: [
    { value: 'jefe_cocina',  label: 'Jefe/a de Cocina' },
    { value: 'cocinero',     label: 'Cocinero' },
    { value: 'produccion',   label: 'Producción' },
    { value: 'friegaplatos', label: 'Friegaplatos' },
  ],
  sala: [
    { value: 'camarero',  label: 'Camarero' },
    { value: 'encargado', label: 'Encargado' },
  ],
}
const ROL_COLOR: Record<string, string> = {
  jefe_cocina:  'bg-red-50 text-red-600',
  cocinero:     'bg-orange-50 text-orange-600',
  produccion:   'bg-amber-50 text-amber-600',
  friegaplatos: 'bg-gray-100 text-gray-500',
  camarero:     'bg-cyan-50 text-cyan-600',
  encargado:    'bg-indigo-50 text-indigo-600',
}

const DIAS_LABEL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIAS_NOMBRE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const BLANK: Omit<Empleado, 'id' | 'activo'> = {
  nombre: '', tipo: 'cocina', pin: generarPin(), telefono: '', email: '', horasSemanales: 40, rol: null, puedeEncargado: false, accesoEncargadoApp: false, puedeJefeCocina: false, excluirPlanning: false, restaurantId: null, diasLibresFijos: [], faseLibreRotacion: 0,
}

function EmpleadoModal({
  initial,
  restaurantes,
  onClose,
  onSave,
  isPending,
}: {
  initial: Omit<Empleado, 'id' | 'activo'>
  restaurantes: Restaurante[]
  onClose: () => void
  onSave: (data: Omit<Empleado, 'id' | 'activo'>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const canSave = form.nombre.trim() && (form.pin?.length ?? 0) === 4

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            {initial.nombre ? `Editar — ${initial.nombre}` : 'Nuevo empleado'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Tipo</label>
            <div className="flex gap-2">
              {(['cocina', 'sala'] as Tipo[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo: t, rol: null }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.tipo === t
                      ? t === 'cocina'
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-cyan-500 border-cyan-500 text-white'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Rol */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Rol</label>
            <div className="flex gap-2 flex-wrap">
              {ROLES[form.tipo as Tipo].map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => set('rol', form.rol === r.value ? null : r.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.rol === r.value
                      ? 'bg-gray-700 border-gray-700 text-white'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Puede hacer de encargado (solo camareros) */}
          {form.rol === 'camarero' && (
            <button
              type="button"
              onClick={() => set('puedeEncargado', !form.puedeEncargado)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                form.puedeEncargado ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                form.puedeEncargado ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'
              }`}>
                {form.puedeEncargado && <span className="text-white text-xs font-bold">✓</span>}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-700">Puede hacer de encargado/a</p>
                <p className="text-xs text-gray-400">El planning lo usará como encargado si hay déficit (solo afecta al planning — el acceso 💼 de la app se da con el botón de la lista)</p>
              </div>
            </button>
          )}

          {/* Puede hacer de jefe de cocina (solo cocineros) */}
          {form.rol === 'cocinero' && (
            <button
              type="button"
              onClick={() => set('puedeJefeCocina', !form.puedeJefeCocina)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                form.puedeJefeCocina ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                form.puedeJefeCocina ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
              }`}>
                {form.puedeJefeCocina && <span className="text-white text-xs font-bold">✓</span>}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-700">Puede hacer de jefe/a de cocina</p>
                <p className="text-xs text-gray-400">El planning lo usará como jefe si hay déficit</p>
              </div>
            </button>
          )}

          {/* TPV — permisos en la app de sala (solo personal de sala, no encargados: ellos lo tienen por rol) */}
          {form.tipo === 'sala' && form.rol !== 'encargado' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">TPV</label>
              <button
                type="button"
                onClick={() => set('accesoEncargadoApp', !form.accesoEncargadoApp)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  form.accesoEncargadoApp ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                  form.accesoEncargadoApp ? 'bg-violet-500 border-violet-500' : 'border-gray-300'
                }`}>
                  {form.accesoEncargadoApp && <span className="text-white text-xs font-bold">✓</span>}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-700">💼 Modo encargado en la app</p>
                  <p className="text-xs text-gray-400">Puede cobrar mesas, abrir/cerrar turno y ver checklists y mermas desde la app de sala. Tendrá que volver a entrar con su PIN.</p>
                </div>
              </button>
            </div>
          )}

          {/* Excluir del auto-planning */}
          <button
            type="button"
            onClick={() => set('excluirPlanning', !form.excluirPlanning)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
              form.excluirPlanning ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
              form.excluirPlanning ? 'bg-red-500 border-red-500' : 'border-gray-300'
            }`}>
              {form.excluirPlanning && <span className="text-white text-xs font-bold">✓</span>}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-700">Excluir del auto-planning</p>
              <p className="text-xs text-gray-400">No aparecerá en la planificación automática de turnos</p>
            </div>
          </button>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={form.nombre}
              onChange={e => set('nombre', e.target.value)}
              placeholder="Nombre y apellido"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">PIN (4 dígitos)</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={form.pin ?? ''}
                onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-xl tracking-widest text-center font-bold focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => set('pin', generarPin())}
                title="Generar PIN"
                className="px-3 border border-gray-200 rounded-xl text-gray-400 hover:border-cyan-400 hover:text-cyan-500 transition-colors text-lg"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Contrato */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Contrato</label>
            <div className="flex gap-2">
              {HORAS_CONTRATO.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set('horasSemanales', h)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    form.horasSemanales === h
                      ? 'bg-indigo-500 border-indigo-500 text-white'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300'
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Restaurante habitual */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Restaurante habitual</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => set('restaurantId', null)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                  form.restaurantId == null
                    ? 'bg-gray-600 border-gray-600 text-white'
                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                }`}
              >
                Rotativo
              </button>
              {restaurantes.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => set('restaurantId', form.restaurantId === r.id ? null : r.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.restaurantId === r.id
                      ? 'bg-indigo-500 border-indigo-500 text-white'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300'
                  }`}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Teléfono + Email en grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Teléfono</label>
              <input
                type="tel"
                value={form.telefono ?? ''}
                onChange={e => set('telefono', e.target.value)}
                placeholder="+34 600 000 000"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email ?? ''}
                onChange={e => set('email', e.target.value)}
                placeholder="nombre@email.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Días libres fijos */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Días libres fijos
              <span className="ml-1 font-normal text-gray-400">(por motivos personales)</span>
            </label>
            <div className="flex gap-1.5">
              {DIAS_LABEL.map((dia, i) => {
                const active = (form.diasLibresFijos ?? []).includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    title={DIAS_NOMBRE[i]}
                    onClick={() => {
                      const current = form.diasLibresFijos ?? []
                      set('diasLibresFijos', active ? current.filter(d => d !== i) : [...current, i].sort())
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                      active
                        ? 'bg-rose-500 border-rose-500 text-white'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-rose-300 hover:text-rose-400'
                    }`}
                  >
                    {dia}
                  </button>
                )
              })}
            </div>
            {(form.diasLibresFijos ?? []).length > 0 && (
              <p className="mt-1.5 text-xs text-rose-400">
                Libra siempre: {(form.diasLibresFijos ?? []).map(d => DIAS_NOMBRE[d]).join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!canSave || isPending}
            className="px-5 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-400 disabled:opacity-40 transition-colors"
          >
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EmpleadosPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tipo>('cocina')
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: () => api.restaurantes.list() })
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; emp: Empleado } | null>(null)
  const [showInactivos, setShowInactivos] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: () => api.empleados.list(),
  })

  const mostrar = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 2500)
  }

  const crear = useMutation({
    mutationFn: (data: Omit<Empleado, 'id' | 'activo'>) => api.empleados.create({
      nombre: data.nombre,
      tipo: data.tipo,
      pin: data.pin ?? '',
      horasSemanales: data.horasSemanales,
      ...(data.telefono       ? { telefono:       data.telefono       } : {}),
      ...(data.email          ? { email:          data.email          } : {}),
      ...(data.rol            ? { rol:            data.rol            } : {}),
      puedeEncargado:  data.puedeEncargado  ?? false,
      accesoEncargadoApp: data.accesoEncargadoApp ?? false,
      puedeJefeCocina: data.puedeJefeCocina ?? false,
      excluirPlanning: data.excluirPlanning  ?? false,
      diasLibresFijos: data.diasLibresFijos ?? [],
      restaurantId: data.restaurantId ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setModal(null)
      mostrar('Empleado creado', true)
    },
    onError: (e: Error) => mostrar(e.message.includes('409') ? 'PIN ya en uso' : 'Error al crear', false),
  })

  const actualizar = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<Empleado, 'id' | 'activo'> }) =>
      api.empleados.update(id, {
        nombre:         data.nombre,
        pin:            data.pin ?? undefined,
        telefono:       data.telefono || null,
        email:          data.email    || null,
        horasSemanales: data.horasSemanales,
        rol:            data.rol      || null,
        puedeEncargado:  data.puedeEncargado  ?? false,
        accesoEncargadoApp: data.accesoEncargadoApp ?? false,
        puedeJefeCocina: data.puedeJefeCocina ?? false,
        excluirPlanning: data.excluirPlanning  ?? false,
        diasLibresFijos: data.diasLibresFijos ?? [],
        restaurantId:    data.restaurantId ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setModal(null)
      mostrar('Empleado actualizado', true)
    },
    onError: (e: Error) => mostrar(e.message.includes('409') ? 'PIN ya en uso' : 'Error al actualizar', false),
  })

  const desactivar = useMutation({
    mutationFn: (id: number) => api.empleados.desactivar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); mostrar('Empleado desactivado', true) },
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.empleados.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); mostrar('Empleado eliminado', true) },
    onError: () => mostrar('Tiene retiros — usa Desactivar', false),
  })

  const activos   = empleados.filter(e => e.activo && e.tipo === tab)
  const inactivos = empleados.filter(e => !e.activo && e.tipo === tab)

  const isPending = crear.isPending || actualizar.isPending

  const handleSave = (data: Omit<Empleado, 'id' | 'activo'>) => {
    if (modal?.mode === 'edit') {
      actualizar.mutate({ id: modal.emp.id, data })
    } else {
      crear.mutate(data)
    }
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['cocina', 'sala'] as Tipo[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setShowInactivos(false) }}
                className={`px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                  tab === t
                    ? t === 'cocina'
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-cyan-500 border-cyan-500 text-white'
                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                }`}
              >
                {t === 'cocina' ? '👨‍🍳' : '🛎'} {TIPO_LABEL[t]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-400 transition-colors shadow-sm"
          >
            <span className="text-lg leading-none">+</span> Añadir empleado
          </button>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className={`px-5 py-3 border-b border-gray-100 flex items-center justify-between ${tab === 'cocina' ? 'bg-orange-50' : 'bg-cyan-50'}`}>
            <span className={`text-sm font-semibold ${tab === 'cocina' ? 'text-orange-600' : 'text-cyan-600'}`}>
              {TIPO_LABEL[tab]} — {activos.length} activos
            </span>
          </div>

          {activos.length === 0 ? (
            <p className="py-8 text-center text-gray-400 text-sm">Sin empleados de {TIPO_LABEL[tab].toLowerCase()}</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {activos.map(emp => (
                <div key={emp.id} className="px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  {/* Línea 1: nombre + badges + acciones */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-medium text-gray-900">{emp.nombre}</span>
                      {emp.rol && (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${ROL_COLOR[emp.rol] ?? 'bg-gray-100 text-gray-500'}`}>
                          {ROLES[emp.tipo as Tipo]?.find(r => r.value === emp.rol)?.label ?? emp.rol}
                        </span>
                      )}
                      {emp.puedeEncargado && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-600" title="Puede hacer de encargado (planning)">
                          +ENC
                        </span>
                      )}
                      {emp.accesoEncargadoApp && emp.rol !== 'encargado' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-100 text-violet-600" title="Tiene el modo encargado en la app de sala (se configura en Editar → TPV)">
                          💼 TPV
                        </span>
                      )}
                      {emp.puedeJefeCocina && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-100 text-orange-600" title="Puede hacer de jefe de cocina">
                          +JEFE
                        </span>
                      )}
                      {emp.excluirPlanning && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-500" title="Excluido del auto-planning">
                          Sin planning
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${HORAS_COLOR[emp.horasSemanales] ?? 'bg-gray-100 text-gray-500'}`}>
                        {emp.horasSemanales}h
                      </span>
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg tracking-widest" title="PIN de acceso a la sala">
                        {emp.pin ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setModal({ mode: 'edit', emp })}
                        className="text-xs text-cyan-500 hover:text-cyan-700 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => { if (confirm(`¿Desactivar a ${emp.nombre}?`)) desactivar.mutate(emp.id) }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Desactivar
                      </button>
                      <button
                        onClick={() => { if (confirm(`¿Eliminar a ${emp.nombre} permanentemente?`)) eliminar.mutate(emp.id) }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Línea 2: restaurante · contacto · días libres */}
                  <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mt-1.5">
                    <span className="text-xs text-gray-500">
                      🏠 {emp.restaurant ? (
                        <span className="text-gray-700 font-medium">{emp.restaurant.nombre}</span>
                      ) : (
                        <span className="text-gray-400 italic">Rotativo</span>
                      )}
                    </span>
                    {emp.telefono && (
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        📞 {emp.telefono}
                        {emp.pin && (
                          <a
                            href={`https://wa.me/${emp.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${emp.nombre.split(' ')[0]}, tu PIN es: *${emp.pin}*`)}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Enviar PIN por WhatsApp"
                            className="text-emerald-500 hover:text-emerald-600 shrink-0"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </a>
                        )}
                      </span>
                    )}
                    {emp.email && (
                      <a
                        href={`mailto:${emp.email}`}
                        className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                      >
                        ✉️ {emp.email}
                      </a>
                    )}
                    {(emp.diasLibresFijos ?? []).length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        Libra:
                        <span className="flex gap-0.5">
                          {(emp.diasLibresFijos ?? []).map(d => (
                            <span key={d} className="w-5 h-5 rounded-md bg-rose-100 text-rose-500 text-[10px] font-bold flex items-center justify-center">
                              {DIAS_LABEL[d]}
                            </span>
                          ))}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

        {/* Inactivos */}
        {inactivos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowInactivos(v => !v)}
              className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-400">Inactivos ({inactivos.length})</span>
              <span className="text-gray-300 text-xs">{showInactivos ? '▲ ocultar' : '▼ ver'}</span>
            </button>
            {showInactivos && (
              <table className="w-full text-sm border-t border-gray-50">
                <tbody className="divide-y divide-gray-50">
                  {inactivos.map(emp => (
                    <tr key={emp.id} className="opacity-50">
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-700">{emp.nombre}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[emp.tipo as Tipo]}`}>
                          {TIPO_LABEL[emp.tipo as Tipo]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{emp.horasSemanales}h</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => api.empleados.update(emp.id, { activo: true }).then(() => qc.invalidateQueries({ queryKey: ['empleados'] }))}
                          className="text-xs text-cyan-600 hover:text-cyan-800 font-medium"
                        >
                          Reactivar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      {modal && (
        <EmpleadoModal
          initial={
            modal.mode === 'edit'
              ? { nombre: modal.emp.nombre, tipo: modal.emp.tipo, pin: modal.emp.pin ?? generarPin(), telefono: modal.emp.telefono ?? '', email: modal.emp.email ?? '', horasSemanales: modal.emp.horasSemanales, rol: modal.emp.rol ?? null, puedeEncargado: modal.emp.puedeEncargado ?? false, accesoEncargadoApp: modal.emp.accesoEncargadoApp ?? false, puedeJefeCocina: modal.emp.puedeJefeCocina ?? false, excluirPlanning: modal.emp.excluirPlanning ?? false, restaurantId: modal.emp.restaurantId ?? null, diasLibresFijos: modal.emp.diasLibresFijos ?? [], faseLibreRotacion: modal.emp.faseLibreRotacion ?? 0 }
              : { ...BLANK, pin: generarPin() }
          }
          restaurantes={restaurantes}
          onClose={() => setModal(null)}
          onSave={handleSave}
          isPending={isPending}
        />
      )}

      {feedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50 ${feedback.ok ? 'bg-cyan-600' : 'bg-red-600'}`}>
          {feedback.msg}
        </div>
      )}
    </>
  )
}
