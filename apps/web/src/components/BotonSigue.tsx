import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda } from '../api'
import { enModoLocal } from '../lib/conexion'
import { practicaActiva } from '../lib/practica'

// 🔔 "Porfa, que siga": el camarero que ve la demora en su mesa avisa a la pantalla de pase. Solo en
// locales con la pantalla activada y mientras queden platos de cocina por servir. Otro toque lo quita.
export default function BotonSigue({ comanda }: { comanda: Comanda }) {
  const qc = useQueryClient()
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const pedir = useMutation({
    mutationFn: () => api.pase.sigue(comanda.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comanda-sala'] }),
  })
  const activa = restaurantes.find(r => r.id === comanda.restaurantId)?.pantallaPase
  const quedanPlatos = comanda.items.some(i => i.tipo === 'cocina' && !i.autoGenerado && i.nivel != null && (i.servidos ?? 0) < i.cantidad)
  if (!activa || !quedanPlatos || enModoLocal() || practicaActiva()) return null
  return (
    <button onClick={() => pedir.mutate()} disabled={pedir.isPending}
      className={`shrink-0 px-3 py-2.5 rounded-xl text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-50 ${comanda.sigueAt ? 'bg-red-500 text-white' : 'border-2 border-red-500/60 text-red-400'}`}>
      {comanda.sigueAt ? '🔔 Avisado' : '🔔 Que siga'}
    </button>
  )
}
