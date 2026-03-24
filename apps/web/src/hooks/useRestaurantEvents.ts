import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useRestaurantEvents(restaurantId: number | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!restaurantId) return

    const es = new EventSource(`/api/events?restaurantId=${restaurantId}`)

    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data)
        if (type === 'update') {
          // Invalida todo lo relacionado con comandas de este restaurante
          queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comanda-sala'] })
          queryClient.invalidateQueries({ queryKey: ['comandas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comanda'] })
          queryClient.invalidateQueries({ queryKey: ['comandas-feed-activas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comandas-feed-liberadas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comandas-feed-cerradas', restaurantId] })
        }
      } catch {}
    }

    es.onerror = () => {
      // El navegador reintenta automáticamente la conexión SSE
    }

    return () => es.close()
  }, [restaurantId, queryClient])
}
