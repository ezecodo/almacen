import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Restaurante } from '../api'

interface Props {
  value: Restaurante | null
  onChange: (r: Restaurante) => void
}

// Mapea el nombre del restaurante al archivo de logo en /public
// Añade aquí las entradas que correspondan a los nombres reales en la DB
const LOGO_MAP: Record<string, string> = {
  'sensi tapas': 'tapas.png',
  'bistro':      'bistro.png',
  'gourmet':     'gourmet.png',
  'colección':   'coleccion.png',
  'coleccion':   'coleccion.png',
  'petit':       'petit.png',
}

function getLogoSrc(nombre: string): string | null {
  const key = nombre.toLowerCase()
  for (const [pattern, file] of Object.entries(LOGO_MAP)) {
    if (key.includes(pattern)) return `/${file}`
  }
  return null
}

export default function SelectRestaurante({ onChange }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  if (isLoading) return <p className="text-gray-400 text-lg">Cargando restaurantes…</p>
  if (error) return <p className="text-red-500 text-lg">Error al cargar restaurantes</p>

  return (
    <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
      {data?.map((r) => {
        const src = getLogoSrc(r.nombre)
        return (
          <RestauranteCard
            key={r.id}
            restaurante={r}
            logoSrc={src}
            onClick={() => onChange(r)}
          />
        )
      })}
    </div>
  )
}

interface CardProps {
  restaurante: Restaurante
  logoSrc: string | null
  onClick: () => void
}

function RestauranteCard({ restaurante, logoSrc, onClick }: CardProps) {
  const [imgError, setImgError] = useState(false)
  const [flipping, setFlipping] = useState(false)

  const handleClick = () => {
    if (flipping) return
    setFlipping(true)
    setTimeout(() => {
      onClick()
      setFlipping(false)
    }, 700)
  }

  return (
    <button
      onClick={handleClick}
      className={`relative aspect-square rounded-3xl border-4 transition-all duration-300 p-4 overflow-hidden ${
        flipping
          ? 'bg-black border-cyan-400 scale-95'
          : 'bg-gray-900 border-gray-800 hover:border-cyan-400'
      }`}
    >
      {/* Logo del restaurante */}
      <div className={`w-full h-full transition-all duration-300 ${flipping ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}>
        {logoSrc && !imgError ? (
          <img
            src={logoSrc}
            alt={restaurante.nombre}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-white text-5xl font-bold flex items-center justify-center h-full">
            {restaurante.nombre.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Loader cyan */}
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${flipping ? 'opacity-100' : 'opacity-0'}`}>
        <svg className="animate-spin w-12 h-12 text-cyan-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-100" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    </button>
  )
}
