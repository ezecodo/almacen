import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem } from '../api'
import { enModoLocal } from '../lib/conexion'
import { practicaActiva } from '../lib/practica'
import NivelEtiqueta, { nombreNivel } from './NivelEtiqueta'

// Cómo va una mesa en cocina, para el camarero, en locales con la pantalla de pase activada: una vista
// sin nada más que lo servido y lo que falta (de lo que marcan cocina y pase), y el aviso a cocina.
// 🔔 "Porfa, que siga": el camarero que ve la demora lo pide con el botón de esta vista o con un doble
// toque en el número de mesa, y solo si queda algo en cocina: lo que ya está en el pase se va a buscar.
// No se puede deshacer: se apaga cuando cocina marca algo listo de la mesa.

export function useSigue(comanda: Comanda, alAvisar?: () => void) {
  const qc = useQueryClient()
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const pedir = useMutation({
    mutationFn: () => api.pase.sigue(comanda.id),
    onSuccess: () => { alAvisar?.(); qc.invalidateQueries({ queryKey: ['comanda-sala'] }) },
  })
  const paseActivo = !!restaurantes.find(r => r.id === comanda.restaurantId)?.pantallaPase && !enModoLocal() && !practicaActiva()
  const platos = comanda.items.filter(i => i.tipo === 'cocina' && !i.autoGenerado && i.nivel != null)
  const quedanEnCocina = platos.some(i => (i.listos ?? 0) < i.cantidad)
  return { pedir, platos, paseActivo, disponible: paseActivo && quedanEnCocina }
}

const cuenta = (i: ComandaItem) => {
  const listos = Math.min(i.listos ?? 0, i.cantidad)
  const servidos = Math.min(i.servidos ?? 0, listos)
  return { servidos, enPase: listos - servidos, enCocina: i.cantidad - listos }
}

// Acceso, visible desde cualquier pestaña de la mesa
export function BarraEstado({ platos, onAbrir }: { platos: ComandaItem[]; onAbrir: () => void }) {
  const total = platos.reduce((n, i) => n + i.cantidad, 0)
  const servidos = platos.reduce((n, i) => n + cuenta(i).servidos, 0)
  const enPase = platos.reduce((n, i) => n + cuenta(i).enPase, 0)
  return (
    <button onClick={onAbrir} className="w-full mt-2.5 h-11 px-3 rounded-lg bg-[var(--sala-srf)] border border-[var(--sala-brd)] flex items-center gap-2 text-sm font-black active:scale-[0.98] transition-transform">
      <span className="text-[var(--sala-txt)]">🍽 Estado de la mesa</span>
      <span className="ml-auto text-[var(--sala-tx2)] tabular-nums">{servidos} de {total}</span>
      {enPase > 0 && <span className="text-emerald-500 tabular-nums">🟢 {enPase}</span>}
      <span className="text-[var(--sala-tx3)]">›</span>
    </button>
  )
}

function Fila({ item }: { item: ComandaItem }) {
  const { servidos, enPase, enCocina } = cuenta(item)
  const hecho = servidos === item.cantidad
  const partes = [
    servidos > 0 && !hecho && `✓ ${servidos} servido${servidos > 1 ? 's' : ''}`,
    enPase > 0 && `🟢 ${enPase} en el pase`,
    enCocina > 0 && enCocina < item.cantidad && `🟡 ${enCocina} en cocina`,
  ].filter(Boolean)
  const estado = hecho ? '✓ Servido' : enCocina === item.cantidad ? '🟡 En cocina' : enPase === item.cantidad ? '🟢 Listo en el pase' : partes.join(' · ')
  const color = hecho ? 'text-[var(--sala-tx3)]' : enPase > 0 ? 'text-emerald-500' : 'text-amber-500'
  return (
    <div className="py-2.5 border-b border-[var(--sala-brd)] last:border-b-0">
      <p className={`text-xl font-black uppercase leading-tight ${hecho ? 'text-[var(--sala-tx3)]' : 'text-[var(--sala-txt)]'}`}>{item.cantidad}× {item.nombre}</p>
      <p className={`mt-0.5 text-base font-bold ${color}`}>{estado}</p>
    </div>
  )
}

export function EstadoMesaSheet({ comanda, platos, disponible, pidiendo, onSigue, onClose }: {
  comanda: Comanda; platos: ComandaItem[]; disponible: boolean; pidiendo: boolean; onSigue: () => void; onClose: () => void
}) {
  const niveles = [...new Set(platos.map(i => i.nivel!))].sort((a, b) => a - b)
  const porRecoger = platos.reduce((n, i) => n + cuenta(i).enPase, 0)
  return (
    <div className="fixed inset-0 z-[60] bg-[var(--sala-bg)] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--sala-brd)]">
        <span className="min-w-11 h-11 px-2 rounded-lg bg-[var(--sala-txt)] text-[var(--sala-bg)] text-[28px] font-black tabular-nums flex items-center justify-center">{comanda.mesa.numero}</span>
        <h2 className="flex-1 text-[var(--sala-txt)] text-xl font-black">Estado de la mesa</h2>
        <button onClick={onClose} aria-label="Cerrar" className="w-11 h-11 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-xl">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {niveles.map(n => (
          <div key={n}>
            <NivelEtiqueta titulo={nombreNivel(n)} />
            {platos.filter(i => i.nivel === n).map(i => <Fila key={i.id} item={i} />)}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-[var(--sala-brd)]">
        {!disponible
          ? <p className="py-3 text-center text-lg font-black text-emerald-500">{porRecoger > 0 ? `🟢 Nada en cocina · ${porRecoger} para recoger en el pase` : '✓ Todo servido'}</p>
          : comanda.sigueAt
            ? <p className="py-3 text-center text-lg font-black text-red-500">🔔 Cocina avisada · esperando</p>
            : <button onClick={onSigue} disabled={pidiendo} className="w-full h-16 rounded-2xl bg-red-500 text-white text-xl font-black active:scale-[0.98] transition-transform disabled:opacity-50">🔔 Que siga</button>}
      </div>
    </div>
  )
}
