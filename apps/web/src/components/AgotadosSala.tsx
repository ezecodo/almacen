import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ItemAgotado, MenuItem } from '../api'

const normTxt = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

// Pestaña 🚫 Agotados del panel 💼 (y 🚫 Altos del jefe de cocina en /sala/cocina): marcar un plato que se acabó (sale "ALTO" en las impresoras
// del local y en la sala se ve apagado) y reponerlo ("HAY"). Al cerrar el turno se reponen solos.
export default function AgotadosSala({ restaurantId, agotados }: { restaurantId: number; agotados: ItemAgotado[] }) {
  const queryClient = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [confirmar, setConfirmar] = useState<MenuItem | null>(null)
  const { data: menu = [] } = useQuery({ queryKey: ['menu', restaurantId], queryFn: () => api.menu.list(restaurantId) })
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['agotados', restaurantId] })
  const marcar = useMutation({
    mutationFn: (item: MenuItem) => api.agotados.marcar(restaurantId, item.id),
    onSuccess: () => { setConfirmar(null); setBuscar(''); refrescar() },
  })
  const reponer = useMutation({ mutationFn: (menuItemId: number) => api.agotados.reponer(restaurantId, menuItemId), onSuccess: refrescar })
  const ids = new Set(agotados.map(a => a.menuItemId))
  const q = normTxt(buscar.trim())
  const resultados = q
    ? menu.filter(m => m.activo && !m.ocultoEnCarta && !m.autoPorPax && !ids.has(m.id) && normTxt(m.nombre).includes(q)).slice(0, 12)
    : []
  const error = (marcar.error ?? reponer.error) as Error | null

  return (
    <>
      <p className="text-[var(--sala-tx3)] text-xs px-1">
        Al marcar un plato sale <b>ALTO</b> en todas las impresoras del local y en la sala se ve apagado. Al cerrar el turno vuelve todo.
      </p>
      {error && <p className="text-red-400 text-sm font-bold px-1">{error.message}</p>}

      {agotados.length > 0 && (
        <div className="space-y-2">
          {agotados.map(a => (
            <div key={a.menuItemId} className="bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center gap-3 border border-red-500/30">
              <div className="flex-1 min-w-0">
                <p className="text-[var(--sala-txt)] text-base font-black uppercase truncate">{a.menuItem.nombre}</p>
                <p className="text-[var(--sala-tx3)] text-xs">Agotado · {a.marcadoPor} · {fmtHora(a.createdAt)}</p>
              </div>
              <button onClick={() => reponer.mutate(a.menuItemId)} disabled={reponer.isPending}
                className="shrink-0 px-3 py-2 rounded-lg bg-[#4CC8A0] text-white text-sm font-black active:scale-95 disabled:opacity-50">
                Vuelve a haber
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmar ? (
        <div className="bg-[var(--sala-srf)] rounded-xl p-4 border-2 border-red-500/60">
          <p className="text-[var(--sala-tx2)] text-sm">¿Se acabó?</p>
          <p className="text-[var(--sala-txt)] text-xl font-black uppercase mt-0.5">{confirmar.nombre}</p>
          <p className="text-[var(--sala-tx3)] text-xs mt-1">Sale ALTO en las impresoras y nadie más lo puede pedir.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => marcar.mutate(confirmar)} disabled={marcar.isPending}
              className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black active:scale-95 disabled:opacity-50">
              {marcar.isPending ? 'Avisando…' : 'Sí, se acabó'}
            </button>
            <button onClick={() => setConfirmar(null)} className="px-4 py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] font-bold">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 ¿Qué se acabó? (ej. carrillera)"
            className="w-full bg-[var(--sala-srf)] text-[var(--sala-txt)] text-base px-4 py-3 rounded-xl outline-none border border-[var(--sala-brd)] focus:border-red-400" />
          {resultados.map(m => (
            <button key={m.id} onClick={() => setConfirmar(m)}
              className="w-full text-left bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.98]">
              <span className="min-w-0">
                <span className="block text-[var(--sala-txt)] text-sm font-bold truncate">{m.nombre}</span>
                <span className="block text-[var(--sala-tx3)] text-xs truncate">{m.categoria}</span>
              </span>
              <span className="shrink-0 text-red-400 text-xs font-black">SE ACABÓ</span>
            </button>
          ))}
          {q && resultados.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-4">Sin resultados</p>}
          {!q && agotados.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-6">No hay nada agotado 👌</p>}
        </div>
      )}
    </>
  )
}
