import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Escucha eventos SSE globales (todos los restaurantes) e invalida los widgets del admin
export function useAdminEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource('/api/events/global')

    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data)
        if (type === 'update') {
          queryClient.invalidateQueries({ queryKey: ['facturacion-dia'] })
          queryClient.invalidateQueries({ queryKey: ['turnos-activos-global'] })
        }
        if (type === 'facturas') {
          queryClient.invalidateQueries({ queryKey: ['facturas'] })
        }
        if (type === 'reservas-pool') {
          queryClient.invalidateQueries({ queryKey: ['reservas-pool'] })
          queryClient.invalidateQueries({ queryKey: ['reservas'] })
        }
      } catch {}
    }

    es.onerror = () => {}

    return () => es.close()
  }, [queryClient])
}
