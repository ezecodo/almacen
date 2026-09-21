import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import TicketComanda from '../components/tickets/TicketComanda'

// Ruta sin login, pensada para ser navegada por un proceso (headless browser) que
// saca un screenshot del ticket para mandarlo a imprimir — no para uso humano.
// Sin header/nav/chrome alrededor, solo el ticket a tamaño real.
//
// ?items=12,15,18 — opcional: limita el ticket a esos IDs de item puntuales
// (usado por el flujo real de "enviar comanda", que solo debe reimprimir lo
// recién comandado en esta ronda, no toda la comanda entera como hace la
// vista previa del admin cuando no manda este parámetro).
export default function PrintComandaPage() {
  const { id, tipo } = useParams<{ id: string; tipo: 'cocina' | 'barra' }>()
  const [searchParams] = useSearchParams()
  const comandaId = Number(id)

  const { data: comanda, isLoading, isError } = useQuery({
    queryKey: ['comanda', comandaId],
    queryFn: () => api.comandas.get(comandaId),
    enabled: !!comandaId,
  })

  if (isLoading) return null
  if (isError || !comanda) return <p style={{ padding: 16 }}>No se encontró la comanda {id}.</p>
  if (tipo !== 'cocina' && tipo !== 'barra') return <p style={{ padding: 16 }}>Tipo inválido: {tipo}.</p>

  const itemsParam = searchParams.get('items')
  const comandaFiltrada = itemsParam
    ? { ...comanda, items: comanda.items.filter((i) => itemsParam.split(',').includes(String(i.id))) }
    : comanda

  return (
    <div id="print-root" style={{ background: '#fff', width: 'fit-content' }}>
      <TicketComanda comanda={comandaFiltrada} tipo={tipo} />
    </div>
  )
}
