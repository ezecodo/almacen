import { Comanda, ComandaItem } from '../../api'

function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// Como en papel (printer-server → printer.py): el nivel en palabras, para no confundirlo con la cantidad
const NIVELES = ['PRIMEROS', 'SEGUNDOS', 'TERCEROS', 'CUARTOS', 'QUINTOS', 'SEXTOS', 'SÉPTIMOS', 'OCTAVOS', 'NOVENOS', 'DÉCIMOS']
const nombreNivel = (n: number) => NIVELES[n - 1] ?? `NIVEL ${n}`

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
      {/* Hueco para la pinza de las comandas y línea de puntos, como en papel */}
      <div className="h-12 border-b-2 border-dotted border-black" />
      <div className="flex items-start justify-between mt-1">
        <div className="flex flex-col items-center leading-none">
          <span className="font-black text-[56px] leading-none">{comanda.mesa?.numero ?? '-'}</span>
          <span className="font-black text-[13px] normal-case">{comanda.pax} pax</span>
        </div>
        <div className="flex flex-col items-center leading-tight pt-1 pr-2 normal-case">
          <span className="font-black text-[12px]">{primerNombre}</span>
          <span className="text-[18px]">{fmtHora(comanda.enviadaAt)}</span>
        </div>
      </div>
      {tipo === 'cocina' && comanda.noComparten && (
        <p className="mt-1 font-black text-[10px]">COM: NO COMPARTEN</p>
      )}

      {tipo === 'cocina' ? (
        niveles.map(nivel => (
          <div key={nivel} className="mt-3">
            <p className="font-black text-[10px] tracking-wide">{nombreNivel(nivel)}</p>
            <div className="h-0.5 bg-black" />
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
