import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Empleado } from '../api'

function generarPin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

type Tipo = 'cocina' | 'sala'

const TIPO_LABEL: Record<Tipo, string> = { cocina: 'Cocina', sala: 'Sala' }
const TIPO_COLOR: Record<Tipo, string> = {
  cocina: 'bg-orange-50 text-orange-600 border-orange-100',
  sala:   'bg-cyan-50 text-cyan-600 border-cyan-100',
}

export default function EmpleadosPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tipo>('cocina')
  const [nombre, setNombre] = useState('')
  const [pin, setPin] = useState(generarPin)
  const [telefono, setTelefono] = useState('')
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

  const { data: empleados } = useQuery({
    queryKey: ['empleados'],
    queryFn: () => api.empleados.list(),
  })

  const mostrar = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 2500)
  }

  const crear = useMutation({
    mutationFn: () => api.empleados.create({ nombre, tipo: tab, pin, ...(telefono ? { telefono } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setNombre(''); setPin(generarPin()); setTelefono('')
      mostrar('Empleado creado', true)
    },
    onError: (e: Error) => mostrar(e.message.includes('409') ? 'PIN ya en uso' : 'Error al crear', false),
  })

  const actualizar = useMutation({
    mutationFn: () => api.empleados.update(editando!.id, {
      nombre:   editando!.nombre,
      pin:      editando!.pin ?? undefined,
      telefono: editando!.telefono ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setEditando(null)
      mostrar('Empleado actualizado', true)
    },
    onError: (e: Error) => mostrar(e.message.includes('409') ? 'PIN ya en uso' : 'Error al actualizar', false),
  })

  const desactivar = useMutation({
    mutationFn: (id: number) => api.empleados.desactivar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      mostrar('Empleado desactivado', true)
    },
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.empleados.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      mostrar('Empleado eliminado', true)
    },
    onError: () => mostrar('Tiene retiros registrados — usa Desactivar', false),
  })

  const filtrados  = empleados?.filter((e) => e.tipo === tab && e.activo)   ?? []
  const inactivos  = empleados?.filter((e) => e.tipo === tab && !e.activo)  ?? []

  const canCreate = nombre.trim() && (tab === 'sala' || pin.length === 4)

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5">

        {/* Tabs */}
        <div className="flex gap-2">
          {(['cocina', 'sala'] as Tipo[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setNombre(''); setPin(generarPin()); setTelefono(''); setEditando(null) }}
              className={`px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                tab === t
                  ? t === 'cocina'
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-cyan-500 border-cyan-500 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>

        {/* Formulario nuevo empleado */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Añadir — {TIPO_LABEL[tab]}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">PIN (4 dígitos)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-2xl tracking-widest text-center font-bold focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setPin(generarPin())}
                  title="Generar nuevo PIN"
                  className="px-3 border border-gray-200 rounded-xl text-gray-400 hover:border-cyan-400 hover:text-cyan-500 transition-colors text-lg"
                >
                  ↻
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono (opcional)</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+34 600 000 000"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              onClick={() => crear.mutate()}
              disabled={!canCreate || crear.isPending}
              className="w-full bg-cyan-500 text-white font-semibold py-3 rounded-xl hover:bg-cyan-400 transition-colors disabled:opacity-40"
            >
              {crear.isPending ? 'Guardando…' : `Crear ${TIPO_LABEL[tab].toLowerCase()}`}
            </button>
          </div>
        </div>

        {/* Lista activos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-500">{TIPO_LABEL[tab]} activos</h3>
          </div>
          {filtrados.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">No hay empleados</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {filtrados.map((emp) => (
                <li key={emp.id} className="px-5 py-4">
                  {editando?.id === emp.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editando.nombre}
                        onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                        className="w-full border border-cyan-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                        autoFocus
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={editando.pin ?? ''}
                        onChange={(e) => setEditando({ ...editando, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="PIN"
                        className="w-24 border border-cyan-300 rounded-lg px-3 py-2 text-sm text-center tracking-widest font-bold focus:outline-none"
                      />
                      <input
                        type="tel"
                        value={editando.telefono ?? ''}
                        onChange={(e) => setEditando({ ...editando, telefono: e.target.value })}
                        placeholder="Teléfono (opcional)"
                        className="w-full border border-cyan-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      />
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setEditando(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
                        <button
                          onClick={() => actualizar.mutate()}
                          disabled={(editando.pin?.length ?? 0) !== 4}
                          className="text-sm text-cyan-600 font-semibold hover:text-cyan-800 disabled:opacity-40"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{emp.nombre}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIPO_COLOR[emp.tipo as Tipo]}`}>
                            {TIPO_LABEL[emp.tipo as Tipo]}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs text-gray-400">PIN: {emp.pin ?? '—'}</p>
                          {emp.telefono && emp.pin && (
                            <a
                              href={`https://wa.me/${emp.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${emp.nombre.split(' ')[0]}, tu PIN de acceso es: *${emp.pin}*`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                              Enviar PIN
                            </a>
                          )}
                        </div>
                        {emp.telefono && <p className="text-xs text-gray-300">{emp.telefono}</p>}
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button onClick={() => setEditando(emp)} className="text-sm text-cyan-500 hover:text-cyan-700">Editar</button>
                        <button
                          onClick={() => { if (confirm(`¿Desactivar a ${emp.nombre}?`)) desactivar.mutate(emp.id) }}
                          className="text-sm text-gray-400 hover:text-gray-600"
                        >
                          Desactivar
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar a ${emp.nombre} permanentemente?`)) eliminar.mutate(emp.id) }}
                          className="text-sm text-red-400 hover:text-red-600"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Inactivos */}
        {inactivos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-400">Inactivos ({inactivos.length})</h3>
            </div>
            <ul className="divide-y divide-gray-50">
              {inactivos.map((emp) => (
                <li key={emp.id} className="px-5 py-4 flex items-center justify-between opacity-50">
                  <p className="font-medium text-gray-700">{emp.nombre}</p>
                  <button
                    onClick={() => api.empleados.update(emp.id, { activo: true }).then(() => qc.invalidateQueries({ queryKey: ['empleados'] }))}
                    className="text-sm text-cyan-600 hover:text-cyan-800"
                  >
                    Reactivar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {feedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${feedback.ok ? 'bg-cyan-600' : 'bg-red-600'}`}>
          {feedback.msg}
        </div>
      )}
    </>
  )
}
