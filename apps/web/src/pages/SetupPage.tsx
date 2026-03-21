import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, Restaurante } from '../api'

export default function SetupPage() {
  const navigate = useNavigate()

  const { data: restaurantes, isLoading } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  const seleccionar = (r: Restaurante) => {
    localStorage.setItem('oidoops_restaurant', JSON.stringify({ id: r.id, nombre: r.nombre }))
    navigate('/sala', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-6">
      <img src="/oidoops.svg" alt="OidoOps" className="h-10 mb-12 opacity-80" />

      <h1 className="text-white text-2xl font-bold mb-2 text-center">Configurar dispositivo</h1>
      <p className="text-gray-400 text-sm mb-10 text-center">
        Selecciona el restaurante al que pertenece este dispositivo.<br/>
        Solo se hace una vez.
      </p>

      {isLoading && <p className="text-gray-500 text-sm">Cargando...</p>}

      <div className="w-full max-w-sm space-y-3">
        {restaurantes?.map(r => (
          <button
            key={r.id}
            onClick={() => seleccionar(r)}
            className="w-full py-4 px-6 bg-[#1e2d45] hover:bg-[#263a55] border border-gray-700 rounded-2xl text-white font-semibold text-lg text-left transition-colors active:scale-95"
          >
            {r.nombre}
          </button>
        ))}
      </div>
    </div>
  )
}
