import { useQuery } from '@tanstack/react-query'
import { api, Alergeno } from '../api'

// Catálogo de alérgenos (tabla editable en /admin/alergenos)
export function useAlergenos(): Alergeno[] {
  const { data = [] } = useQuery({ queryKey: ['alergenos'], queryFn: api.alergenos.list, staleTime: 60_000 })
  return data
}

export function AlergenosPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const alergenos = useAlergenos()
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">Alérgenos</label>
      <div className="flex flex-wrap gap-1.5">
        {alergenos.map(a => {
          const active = value.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              title={a.nombre}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                active
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
              }`}
            >
              <span>{a.icono}</span>
              <span className="hidden sm:inline">{a.nombre}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AlergenosBadges({ ids }: { ids: number[] }) {
  const activos = useAlergenos().filter(a => ids.includes(a.id))
  if (!activos.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {activos.map(a => (
        <span key={a.id} title={a.nombre} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded">
          {a.icono} {a.nombre}
        </span>
      ))}
    </div>
  )
}

export function AlergenosInline({ ids }: { ids: number[] }) {
  const activos = useAlergenos().filter(a => ids.includes(a.id))
  if (!activos.length) return null
  return (
    <span className="flex gap-0.5 flex-wrap">
      {activos.map(a => (
        <span key={a.id} title={a.nombre} className="text-[11px] cursor-default">{a.icono || a.nombre}</span>
      ))}
    </span>
  )
}
