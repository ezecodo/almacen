import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import TicketComanda from '../components/tickets/TicketComanda'

// Ruta sin login, pensada para ser navegada por un proceso (headless browser) que
// saca un screenshot del ticket para mandarlo a imprimir — no para uso humano.
// Sin header/nav/chrome alrededor, solo el ticket a tamaño real.
export default function PrintComandaPage() {
  const { id, tipo } = useParams<{ id: string; tipo: 'cocina' | 'barra' }>()
  const comandaId = Number(id)

  const { data: comanda, isLoading, isError } = useQuery({
    queryKey: ['comanda', comandaId],
    queryFn: () => api.comandas.get(comandaId),
    enabled: !!comandaId,
  })

  if (isLoading) return null
  if (isError || !comanda) return <p style={{ padding: 16 }}>No se encontró la comanda {id}.</p>
  if (tipo !== 'cocina' && tipo !== 'barra') return <p style={{ padding: 16 }}>Tipo inválido: {tipo}.</p>

  return (
    <div id="print-root" style={{ background: '#fff', width: 'fit-content' }}>
      <TicketComanda comanda={comanda} tipo={tipo} />
    </div>
  )
}
