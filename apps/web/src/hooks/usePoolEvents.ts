import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Escucha el canal SSE global (todos los restaurantes) solo para cambios del pool de reservas.
// Usado en /sala (EncargadoPanel) — el resto de eventos de sala ya los cubre useRestaurantEvents.
export function usePoolEvents(restaurantId?: number) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource('/api/events/global')

    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data)
        if (type === 'reservas-pool') {
          queryClient.invalidateQueries({ queryKey: ['reservas-pool'] })
          if (restaurantId) queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] })
        }
      } catch {}
    }

    es.onerror = () => {}

    return () => es.close()
  }, [queryClient, restaurantId])
}
