import { Comanda, EmpresaConfig, TicketConfig, valorItem, totalComanda } from '../../api'

function fmtHora(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function TicketCobro({
  empresa, config, comanda,
}: {
  empresa: EmpresaConfig
  config: TicketConfig
  comanda: Comanda
}) {
  const items = comanda.items // invitaciones se muestran a 0€, no se ocultan
  const total = totalComanda(comanda.items)
  const tasaIva = empresa.tasaIva
  const base = total / (1 + tasaIva / 100)
  const cuotaIva = total - base
  const mensajePie = config.mensajePieOverride ?? empresa.mensajePie
  const horaComandada = fmtHora(comanda.enviadaAt)
  const horaCobro = fmtHora(comanda.closedAt ?? comanda.createdAt)

  return (
    <div className="ticket-80mm mx-auto px-2 py-3">
      <div className="text-center">
        <p className="font-bold text-[13px] uppercase">{config.nombreComercial}</p>
        {config.direccion && <p className="text-[10px]">{config.direccion}</p>}
        {config.telefono && <p className="text-[10px]">Tel. {config.telefono}</p>}
        {empresa.nif && <p className="text-[10px]">NIF {empresa.nif}</p>}
      </div>

      <div className="border-t border-dashed border-black my-2" />

      <div className="flex justify-between text-[10px]">
        <span>Mesa {comanda.mesa?.numero ?? '-'}</span>
        <span>{comanda.camareroNombre ?? '-'}</span>
      </div>
      <div className="flex justify-between text-[10px]">
        {horaComandada && <span>{horaComandada}</span>}
        <span>Cobro {horaCobro}</span>
      </div>

      <div className="border-t border-dashed border-black my-2" />

      {items.map(i => (
        <div key={i.id} className="mb-0.5">
          <div className="flex justify-between gap-2">
            <span className="flex-1">
              {i.cantidad}x {i.nombre}
              {i.invitacion && ' (Invitación)'}
            </span>
            <span>{valorItem(i).toFixed(2)}</span>
          </div>
          {i.nota && <div className="text-[9px] pl-3">· {i.nota}</div>}
        </div>
      ))}

      <div className="border-t border-dashed border-black my-2" />

      <div className="flex justify-between">
        <span>Base imponible</span>
        <span>{base.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>IVA ({tasaIva}%)</span>
        <span>{cuotaIva.toFixed(2)}</span>
      </div>

      <div className="border-t border-black my-1" />

      <div className="flex justify-between font-bold text-[13px]">
        <span>TOTAL</span>
        <span>{total.toFixed(2)} €</span>
      </div>

      {comanda.propina > 0 && (
        <div className="flex justify-between">
          <span>Propina</span>
          <span>{comanda.propina.toFixed(2)}</span>
        </div>
      )}

      {comanda.metodoPago && (
        <p className="mt-1">Pago: {comanda.metodoPago === 'cash' ? 'Efectivo' : 'Tarjeta'}</p>
      )}

      {mensajePie && (
        <>
          <div className="border-t border-dashed border-black my-2" />
          <p className="text-center text-[10px]">{mensajePie}</p>
        </>
      )}
    </div>
  )
}
