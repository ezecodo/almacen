import { Comanda, ComandaItem } from '../../api'

function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function ItemLine({ item }: { item: ComandaItem }) {
  return (
    <div className="mt-1.5 pl-1">
      <p className="font-black text-[16px] leading-tight">{item.cantidad} {item.nombre}</p>
      {item.nota && <p className="font-bold text-[12px] pl-3">⚠ {item.nota}</p>}
    </div>
  )
}

export default function TicketComanda({
  comanda, tipo,
}: {
  comanda: Comanda
  tipo: 'cocina' | 'barra'
}) {
  // Solo items de este tipo, enviados a cocina/barra (excluye autoGenerado: pan×pax, item directo, etc.)
  const items = comanda.items.filter(i => i.tipo === tipo && !i.autoGenerado && i.nivel !== null)
  // Barra no necesita niveles de salida (las bebidas no siguen un orden de cursos)
  const niveles = tipo === 'cocina' ? [...new Set(items.map(i => i.nivel as number))].sort((a, b) => a - b) : []
  const primerNombre = comanda.camareroNombre?.split(' ')[0] ?? '-'

  return (
    <div className="ticket-80mm mx-auto px-2 py-3 uppercase">
      <div className="flex justify-between text-[10px]">
        <span>Mesa {comanda.mesa?.numero ?? '-'}</span>
        <span>{comanda.pax} pax</span>
      </div>
      <div className="flex justify-between text-[10px]">
        <span>{primerNombre}</span>
        <span>{fmtHora(comanda.enviadaAt)}</span>
      </div>

      {tipo === 'cocina' ? (
        niveles.map(nivel => (
          <div key={nivel} className="mt-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 border-t-2 border-black" />
              <span className="font-black text-[13px] tracking-wide shrink-0">Nivel {nivel}</span>
              <span className="flex-1 border-t-2 border-black" />
            </div>
            {items.filter(i => i.nivel === nivel).map(i => <ItemLine key={i.id} item={i} />)}
          </div>
        ))
      ) : (
        <div className="mt-2">
          {items.map(i => <ItemLine key={i.id} item={i} />)}
        </div>
      )}

      {items.length === 0 && (
        <p className="text-center text-[10px] mt-4 normal-case">Sin items de {tipo} en esta comanda.</p>
      )}
    </div>
  )
}
