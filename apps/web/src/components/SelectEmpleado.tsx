import { useQuery } from '@tanstack/react-query'
import { api, Empleado } from '../api'

interface Props {
  restaurantId: number
  value: Empleado | null
  onChange: (e: Empleado) => void
}

export default function SelectEmpleado({ restaurantId, value, onChange }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['empleados', restaurantId],
    queryFn: () => api.empleados.list(restaurantId),
  })

  if (isLoading) return <p className="text-gray-400 text-lg">Cargando empleados…</p>
  if (error) return <p className="text-red-500 text-lg">Error al cargar empleados</p>

  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      {data?.map((emp) => (
        <button
          key={emp.id}
          onClick={() => onChange(emp)}
          className={`py-5 px-4 rounded-2xl text-lg font-semibold border-2 transition-all ${
            value?.id === emp.id
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white border-gray-200 text-gray-800 hover:border-indigo-400'
          }`}
        >
          {emp.nombre}
        </button>
      ))}
    </div>
  )
}
