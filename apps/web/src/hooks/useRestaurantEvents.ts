import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { conSesion } from '../api'
import { conexionActual, suscribirConexion } from '../lib/conexion'

export function useRestaurantEvents(restaurantId: number | null) {
  const queryClient = useQueryClient()
  // Nube o Box: al cambiar, el canal se abre de nuevo contra quien toque
  const { local } = useSyncExternalStore(suscribirConexion, conexionActual)

  useEffect(() => {
    if (!restaurantId) return

    const es = new EventSource(conSesion(`/events?restaurantId=${restaurantId}`))

    es.onmessage = (e) => {
      try {
        const datos = JSON.parse(e.data)
        const { type } = datos
        if (type === 'update') {
          // Invalida todo lo relacionado con comandas de este restaurante
          queryClient.invalidateQueries({ queryKey: ['comandas-sala', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comanda-sala'] })
          queryClient.invalidateQueries({ queryKey: ['comandas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comanda'] })
          queryClient.invalidateQueries({ queryKey: ['comandas-feed-activas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comandas-feed-liberadas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['comandas-feed-cerradas', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['enc-cobros', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['turno-activo', restaurantId] })
          queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] }) // sentar, walk-ins, no vino…
        }
        if (type === 'reserva-nueva') {
          queryClient.invalidateQueries({ queryKey: ['reservas', restaurantId] })
          // La sala decide qué hacer (vibrar y avisar al encargado)
          window.dispatchEvent(new CustomEvent('oido:reserva-nueva', { detail: datos.reserva }))
        }
        if (type === 'agotados') queryClient.invalidateQueries({ queryKey: ['agotados', restaurantId] })
        if (type === 'accesos-rapidos') queryClient.invalidateQueries({ queryKey: ['accesos-rapidos', restaurantId] })
        if (type === 'gastos') queryClient.invalidateQueries({ queryKey: ['gastos', restaurantId] })
      } catch {}
    }

    es.onerror = () => {
      // El navegador reintenta automáticamente la conexión SSE
    }

    return () => es.close()
  }, [restaurantId, queryClient, local])
}
