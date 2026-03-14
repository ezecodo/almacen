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

export default function SelectRestaurante({ value, onChange }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  if (isLoading) return <p className="text-gray-400 text-lg">Cargando restaurantes…</p>
  if (error) return <p className="text-red-500 text-lg">Error al cargar restaurantes</p>

  return (
    <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
      {data?.map((r) => {
        const selected = value?.id === r.id
        const src = getLogoSrc(r.nombre)
        return (
          <RestauranteCard
            key={r.id}
            restaurante={r}
            selected={selected}
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
  selected: boolean
  logoSrc: string | null
  onClick: () => void
}

function RestauranteCard({ restaurante, selected, logoSrc, onClick }: CardProps) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-4 rounded-3xl border-4 transition-all aspect-square ${
        selected
          ? 'bg-indigo-600 border-indigo-600'
          : 'bg-gray-900 border-gray-800 hover:border-indigo-400 active:scale-95'
      }`}
    >
      {logoSrc && !imgError ? (
        <img
          src={logoSrc}
          alt={restaurante.nombre}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-white text-5xl font-bold">
          {restaurante.nombre.charAt(0).toUpperCase()}
        </span>
      )}
    </button>
  )
}
