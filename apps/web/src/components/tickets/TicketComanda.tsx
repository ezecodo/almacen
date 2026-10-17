import { Comanda, ComandaItem } from '../../api'
// Como en papel (printer-server → printer.py): el nivel en palabras, para no confundirlo con la cantidad
import { nombreNivel } from '../NivelEtiqueta'

function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}


// Como en papel: cantidad en columna fija y la nota alineada con el nombre del plato
function ItemLine({ item }: { item: ComandaItem }) {
  return (
    <div className="mt-1 pl-3 flex gap-1.5 font-black text-[13px] leading-tight">
      <span className="w-5 text-right shrink-0">{item.cantidad}</span>
      <div className="min-w-0">
        <p>{item.nombre}</p>
        {item.nota && <p className="font-normal text-[11px] normal-case">» {item.nota}</p>}
      </div>
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
          <span className="font-black text-[46px] leading-none">{comanda.mesa?.numero ?? '-'}</span>
          <span className="font-black text-[11px] normal-case">{comanda.pax} pax</span>
        </div>
        <div className="flex flex-col items-center leading-tight pt-1 pr-2 normal-case">
          <span className="font-black text-[12px]">{primerNombre}</span>
          <span className="text-[18px]">{fmtHora(comanda.enviadaAt)}</span>
          <span className="text-[10px]">{comanda.enviadaAt ? new Date(comanda.enviadaAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}</span>
        </div>
      </div>

      {tipo === 'cocina' ? (
        niveles.map(nivel => (
          <div key={nivel} className="mt-3">
            <div className="border-b-2 border-black">
              <span className="inline-block bg-black text-white font-black text-[10px] tracking-wide px-1.5 py-0.5">{nombreNivel(nivel)}</span>
            </div>
            {items.filter(i => i.nivel === nivel).map(i => <ItemLine key={i.id} item={i} />)}
          </div>
        ))
      ) : (
        <div className="mt-2">
          {items.map(i => <ItemLine key={i.id} item={i} />)}
        </div>
      )}

      {/* COM: al final, como en papel: si no comparte (solo cocina) y la nota del camarero */}
      {(() => {
        const com = [tipo === 'cocina' && comanda.noComparten ? 'NO COMPARTEN' : '', comanda.notaMesa ?? ''].filter(Boolean)
        return com.length > 0 && (
          <p className="mt-3 pt-1 border-t border-black text-[10px] normal-case"><b>COM:</b> {com.join(' · ')}</p>
        )
      })()}

      {items.length === 0 && (
        <p className="text-center text-[10px] mt-4 normal-case">Sin items de {tipo} en esta comanda.</p>
      )}
    </div>
  )
}
