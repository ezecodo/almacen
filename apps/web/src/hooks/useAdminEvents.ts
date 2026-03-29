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
      } catch {}
    }

    es.onerror = () => {}

    return () => es.close()
  }, [queryClient])
}
