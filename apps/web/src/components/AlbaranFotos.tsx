import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// Fotos del albarán de un pedido. Se piden con sesión firmada (no sirve un <img src> directo):
// se bajan como blob y se muestran vía object URL. Tocar una la amplía.
function Foto({ pedidoId, n, total, onQuitar }: { pedidoId: number; n: number; total: number; onQuitar?: (n: number) => void }) {
  // total en la clave: al quitar una foto las siguientes se corren y hay que volver a pedirlas
  const { data: url, isError } = useQuery({
    queryKey: ['albaran-foto', pedidoId, n, total],
    queryFn: async () => URL.createObjectURL(await api.pedidos.foto(pedidoId, n)),
    staleTime: Infinity,
  })
  const [grande, setGrande] = useState(false)
  if (isError) return <div className="aspect-[3/4] rounded-lg bg-red-500/10 text-red-500 text-[10px] flex items-center justify-center">Sin foto {n}</div>
  if (!url) return <div className="aspect-[3/4] rounded-lg bg-gray-500/10 animate-pulse" />
  return (
    <>
      <div className="relative">
        <button type="button" onClick={() => setGrande(true)} className="block w-full">
          <img src={url} alt={`Albarán ${n}`} className="w-full aspect-[3/4] object-cover rounded-lg" />
        </button>
        {onQuitar && (
          <button type="button" onClick={() => onQuitar(n)} aria-label={`Quitar foto ${n}`}
            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-black">
            ✕
          </button>
        )}
      </div>
      {grande && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={() => setGrande(false)}>
          <img src={url} alt={`Albarán ${n}`} className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </>
  )
}

export default function AlbaranFotos({ pedidoId, fotos, onQuitar }: { pedidoId: number; fotos: number; onQuitar?: (n: number) => void }) {
  if (fotos === 0) return null
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: fotos }, (_, i) => (
        <Foto key={i} pedidoId={pedidoId} n={i + 1} total={fotos} onQuitar={onQuitar} />
      ))}
    </div>
  )
}
