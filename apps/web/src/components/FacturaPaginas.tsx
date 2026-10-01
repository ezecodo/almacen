import { useQuery } from '@tanstack/react-query'
import { api, Factura } from '../api'

// Las páginas se piden con sesión firmada (no sirve un <img src> directo):
// se bajan como blob y se muestran vía object URL.
function Pagina({ facturaId, n }: { facturaId: number; n: number }) {
  const { data: url, isError } = useQuery({
    queryKey: ['factura-pagina', facturaId, n],
    queryFn: async () => URL.createObjectURL(await api.facturas.pagina(facturaId, n)),
    staleTime: Infinity,
  })
  if (isError) return <p className="text-red-500 text-xs py-4 text-center">No se pudo cargar la página {n}</p>
  if (!url) return <div className="w-full aspect-[3/4] rounded-lg bg-gray-500/10 animate-pulse" />
  return <img src={url} alt={`Página ${n}`} className="w-full rounded-lg" />
}

export default function FacturaPaginas({ factura }: { factura: Factura }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: factura.paginas }, (_, i) => (
        <Pagina key={i} facturaId={factura.id} n={i + 1} />
      ))}
    </div>
  )
}
