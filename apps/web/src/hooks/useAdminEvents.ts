import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { conSesion } from '../api'

// Escucha eventos SSE globales (todos los restaurantes) e invalida los widgets del admin
export function useAdminEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource(conSesion('/events/global'))

    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data)
        if (type === 'update') {
          queryClient.invalidateQueries({ queryKey: ['facturacion-dia'] })
          queryClient.invalidateQueries({ queryKey: ['turnos-activos-global'] })
        }
        if (type === 'pi') {
          // Le asignaron o quitaron la Pi a un local, o cambió su estado o lo que detecta
          queryClient.invalidateQueries({ queryKey: ['ticket-pi'] })
          queryClient.invalidateQueries({ queryKey: ['impresoras-detectadas'] })
          queryClient.invalidateQueries({ queryKey: ['impresoras'] })
        }
        if (type === 'facturas') {
          queryClient.invalidateQueries({ queryKey: ['facturas'] })
        }
        if (type === 'pedidos') queryClient.invalidateQueries({ queryKey: ['pedidos'] }) // recibido en el local
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
