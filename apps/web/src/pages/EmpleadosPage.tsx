import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, Empleado } from '../api'

export default function EmpleadosPage() {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [pin, setPin] = useState('')
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

  const { data: empleados } = useQuery({
    queryKey: ['empleados'],
    queryFn: api.empleados.list,
  })

  const mostrar = (msg: string, ok: boolean) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 2500)
  }

  const crear = useMutation({
    mutationFn: () => api.empleados.create({ nombre, pin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setNombre(''); setPin('')
      mostrar('Empleado creado', true)
    },
    onError: (e: Error) => mostrar(e.message.includes('409') ? 'PIN ya en uso' : 'Error al crear', false),
  })

  const actualizar = useMutation({
    mutationFn: () => api.empleados.update(editando!.id, { nombre: editando!.nombre, pin: editando!.pin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setEditando(null)
      mostrar('Empleado actualizado', true)
    },
    onError: (e: Error) => mostrar(e.message.includes('409') ? 'PIN ya en uso' : 'Error al actualizar', false),
  })

  const desactivar = useMutation({
    mutationFn: (id: number) => api.empleados.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      mostrar('Empleado desactivado', true)
    },
  })

  const activos   = empleados?.filter((e) => e.activo)   ?? []
  const inactivos = empleados?.filter((e) => !e.activo)  ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-cyan-600 text-sm hover:underline">← Admin</Link>
          <h1 className="text-xl font-bold text-gray-900">Empleados</h1>
        </div>
        <span className="text-sm text-gray-400">{activos.length} activos</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Formulario nuevo empleado */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Añadir empleado</h2>
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
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="····"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl tracking-widest text-center font-bold focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              onClick={() => crear.mutate()}
              disabled={!nombre.trim() || pin.length !== 4 || crear.isPending}
              className="w-full bg-cyan-500 text-white font-semibold py-3 rounded-xl hover:bg-cyan-400 transition-colors disabled:opacity-40"
            >
              {crear.isPending ? 'Guardando…' : 'Crear empleado'}
            </button>
          </div>
        </div>

        {/* Lista empleados activos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-500">Empleados activos</h3>
          </div>
          {activos.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">No hay empleados</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activos.map((emp) => (
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
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={editando.pin}
                          onChange={(e) => setEditando({ ...editando, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          className="w-24 border border-cyan-300 rounded-lg px-3 py-2 text-sm text-center tracking-widest font-bold focus:outline-none"
                        />
                        <div className="ml-auto flex gap-3">
                          <button onClick={() => setEditando(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
                          <button
                            onClick={() => actualizar.mutate()}
                            disabled={editando.pin.length !== 4}
                            className="text-sm text-cyan-600 font-semibold hover:text-cyan-800 disabled:opacity-40"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-gray-900">{emp.nombre}</p>
                        <p className="text-xs text-gray-400">PIN: {emp.pin}</p>
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button onClick={() => setEditando(emp)} className="text-sm text-cyan-500 hover:text-cyan-700">Editar</button>
                        <button
                          onClick={() => { if (confirm(`¿Desactivar a ${emp.nombre}?`)) desactivar.mutate(emp.id) }}
                          className="text-sm text-red-400 hover:text-red-600"
                        >
                          Desactivar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Empleados inactivos */}
        {inactivos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-400">Inactivos ({inactivos.length})</h3>
            </div>
            <ul className="divide-y divide-gray-50">
              {inactivos.map((emp) => (
                <li key={emp.id} className="px-5 py-4 flex items-center justify-between opacity-50">
                  <div>
                    <p className="font-medium text-gray-700">{emp.nombre}</p>
                    <p className="text-xs text-gray-400">PIN: {emp.pin}</p>
                  </div>
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
    </div>
  )
}
