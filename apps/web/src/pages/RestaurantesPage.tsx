import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Restaurante } from '../api'

function Fila({ restaurante }: { restaurante: Restaurante }) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(restaurante.nombre)
  const renombrar = useMutation({
    mutationFn: () => api.restaurantes.renombrar(restaurante.id, nombre.trim()),
    onSuccess: () => { setEditando(false); queryClient.invalidateQueries({ queryKey: ['restaurantes'] }) },
  })

  if (!editando) {
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-medium text-gray-900">{restaurante.nombre}</span>
        <button onClick={() => { setNombre(restaurante.nombre); setEditando(true) }} className="text-sm text-gray-400 hover:text-gray-700">
          Cambiar nombre
        </button>
      </li>
    )
  }
  return (
    <li className="px-4 py-3">
      <form onSubmit={e => { e.preventDefault(); if (nombre.trim().length >= 2) renombrar.mutate() }} className="flex flex-wrap items-center gap-2">
        <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
        <button type="submit" disabled={renombrar.isPending || nombre.trim().length < 2}
          className="bg-cyan-500 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50">Guardar</button>
        <button type="button" onClick={() => setEditando(false)} className="text-sm text-gray-400 hover:text-gray-700 px-2">Cancelar</button>
      </form>
      {renombrar.isError && <p className="text-red-500 text-sm mt-1">{(renombrar.error as Error).message}</p>}
    </li>
  )
}

export default function RestaurantesPage() {
  const queryClient = useQueryClient()
  const { data: restaurantes = [], isLoading } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const [nombre, setNombre] = useState('')
  const crear = useMutation({
    mutationFn: () => api.restaurantes.crear(nombre.trim()),
    onSuccess: () => { setNombre(''); queryClient.invalidateQueries({ queryKey: ['restaurantes'] }) },
  })

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Restaurantes</h1>
      <p className="text-gray-400 text-sm mb-6">Los locales del grupo. Todo lo demás (carta, salón, empleados, turnos) se configura por restaurante.</p>

      <form onSubmit={e => { e.preventDefault(); if (nombre.trim().length >= 2) crear.mutate() }} className="flex gap-2 mb-2">
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del restaurante"
          className="flex-1 min-w-0 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500" />
        <button type="submit" disabled={crear.isPending || nombre.trim().length < 2}
          className="bg-cyan-500 text-white font-semibold px-5 rounded-xl hover:bg-cyan-400 transition-colors disabled:opacity-50">
          Añadir
        </button>
      </form>
      {crear.isError && <p className="text-red-500 text-sm mb-2">{(crear.error as Error).message}</p>}

      <div className="mt-6 bg-white rounded-2xl border border-gray-100">
        {isLoading ? (
          <p className="px-4 py-6 text-gray-400 text-sm">Cargando…</p>
        ) : restaurantes.length === 0 ? (
          <p className="px-4 py-6 text-gray-400 text-sm">Todavía no hay ninguno. Añade el primero para empezar a configurar el grupo.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {restaurantes.map(r => <Fila key={r.id} restaurante={r} />)}
          </ul>
        )}
      </div>
      <p className="text-gray-400 text-xs mt-3">Un restaurante no se puede borrar desde aquí: de él cuelgan sus comandas, turnos y carta.</p>
    </div>
  )
}
