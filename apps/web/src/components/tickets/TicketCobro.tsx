import { Comanda, EmpresaConfig, TicketConfig, totalComanda } from '../../api'

// Vista previa de la cuenta que se le entrega a la mesa: lo mismo que imprime la Box al tocar
// "Imprimir cuenta" (imprimirCuenta en routes/comandas.ts → _construir_cuenta del printer-server).
// Primero el pan, después las bebidas y después la comida. Las líneas iguales se juntan; lo que va a 0 € sin ser invitación (platos de un menú de grupo) no sale.

// Mismo orden que la impresa: pan × pax, bebidas, comida; dentro de cada bloque, como se pidió
const bloque = (i: { autoGenerado: boolean; ronda: number; tipo: string }) =>
  i.autoGenerado && i.ronda === 0 ? 0 : i.tipo === 'barra' ? 1 : 2

const eur = (n: number) => n.toFixed(2).replace('.', ',')

function DobleLinea() {
  return <div className="border-t-[3px] border-double border-black my-1.5" />
}

export default function TicketCobro({
  empresa, config, comanda,
}: {
  empresa: EmpresaConfig
  config: TicketConfig
  comanda: Comanda
}) {
  const lineas = new Map<string, { cantidad: number; nombre: string; precio: number; invitacion: boolean }>()
  for (const i of [...comanda.items].sort((a, b) => bloque(a) - bloque(b) || a.id - b.id)) {
    if (i.precio === 0 && !i.invitacion) continue
    const clave = `${i.nombre}|${i.precio}|${i.invitacion}`
    const l = lineas.get(clave) ?? { cantidad: 0, nombre: i.nombre, precio: i.precio, invitacion: i.invitacion }
    l.cantidad += i.cantidad
    lineas.set(clave, l)
  }
  const total = totalComanda(comanda.items)
  const tasaIva = empresa.tasaIva
  const cuotaIva = total - total / (1 + tasaIva / 100)
  const mensajePie = config.mensajePieOverride ?? empresa.mensajePie
  const momento = new Date(comanda.closedAt ?? comanda.createdAt)
  const cabecera = [
    config.direccion, config.telefono && `Tel. ${config.telefono}`,
    empresa.razonSocial, empresa.nif && `NIF ${empresa.nif}`,
  ].filter(Boolean)

  return (
    <div className="ticket-80mm mx-auto px-2 py-3" style={{ fontWeight: 400 }}>
      <div className="text-center">
        {config.logo
          ? <img src={`data:image/png;base64,${config.logo}`} alt="" className="mx-auto max-w-[80%]" />
          : <p className="font-bold text-[18px]">{config.nombreComercial}</p>}
        <div className="mt-2">
          {cabecera.map(l => <p key={l as string} className="text-[10px]">{l}</p>)}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="font-bold text-[18px]">MESA {comanda.mesa?.numero ?? '-'}</span>
        <span className="text-right text-[10px] leading-tight">
          {momento.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
          {momento.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          <br />{(comanda.camareroNombre ?? '').split(' ')[0]}
        </span>
      </div>
      <p className="text-center font-bold text-[10px] mt-1">FRA. SIMP.: COMPROBANTE</p>

      <DobleLinea />
      {[...lineas.values()].map(l => (
        <div key={`${l.nombre}|${l.precio}|${l.invitacion}`} className="flex gap-1 text-[10px]">
          <span className="w-4 text-right shrink-0">{l.cantidad}</span>
          <span className="flex-1 min-w-0">
            {l.nombre}
            {l.invitacion && <span className="block font-bold text-[8px]">INVITACIÓN</span>}
          </span>
          <span className="w-10 text-right shrink-0">{eur(l.precio)}</span>
          <span className="w-12 text-right shrink-0">{eur(l.invitacion ? 0 : l.precio * l.cantidad)}</span>
        </div>
      ))}
      <DobleLinea />

      <div className="flex justify-between text-[10px]">
        <span>IVA/VAT {tasaIva}%</span>
        <span>{eur(cuotaIva)}</span>
      </div>
      <div className="flex justify-between items-end font-bold">
        <span className="text-[14px]">TOTAL</span>
        <span className="text-[18px]">{eur(total)}</span>
      </div>
      <DobleLinea />
      <div className="flex justify-between font-bold text-[10px]">
        <span>PENDIENTE DE COBRO</span>
        <span>{eur(total)}</span>
      </div>

      {mensajePie && <p className="text-center font-bold text-[11px] mt-3">{mensajePie}</p>}
      <div className="text-right font-bold text-[10px] mt-3 space-y-3">
        <p>SERVICE/TIPS: <span className="inline-block w-20 border-b border-black" /></p>
        <p>TOTAL: <span className="inline-block w-20 border-b border-black" /></p>
      </div>
    </div>
  )
}
