import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { api } from '../api'

// Las direcciones para entrar a cada parte de OidoOps, con su QR para abrirlas desde un teléfono
// o una tablet sin teclearlas. Salen de la dirección de esta misma instalación.

function Acceso({ titulo, para, ruta, nota }: { titulo: string; para: string; ruta: string; nota?: string }) {
  const url = `${location.origin}${ruta}`
  const [copiado, setCopiado] = useState(false)
  const { data: qr } = useQuery({ queryKey: ['qr-acceso', url], queryFn: () => QRCode.toDataURL(url, { width: 240, margin: 1 }), staleTime: Infinity })
  const copiar = () => navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800) }).catch(() => {})

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-wrap gap-5 items-center">
      {qr ? <img src={qr} alt={`QR de ${titulo}`} className="w-28 h-28 shrink-0" /> : <div className="w-28 h-28 shrink-0 rounded-lg bg-gray-100" />}
      <div className="flex-1 min-w-[14rem]">
        <h2 className="font-bold text-gray-900">{titulo}</h2>
        <p className="text-sm text-gray-500">{para}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="font-mono text-sm text-cyan-700 break-all hover:underline">{url}</a>
          <button onClick={copiar} className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg">
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        {nota && <p className="text-xs text-gray-400 mt-2">{nota}</p>}
      </div>
    </section>
  )
}

export default function AccesosPage() {
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  // La dirección pública de reservas de cada local (solo los que la tienen configurada)
  const reservas = useQueries({
    queries: restaurantes.map(r => ({
      queryKey: ['reserva-config-acceso', r.id],
      queryFn: () => api.reservas.getConfig(r.id).catch(() => null),
      staleTime: 60_000,
    })),
  })

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Accesos</h1>
      <p className="text-gray-400 text-sm mb-6">
        Las direcciones para entrar a cada parte. Escanea el código con el teléfono o la tablet para abrirla sin teclear,
        y después añádela a la pantalla de inicio para que quede como una app.
      </p>
      <div className="space-y-4">
        <Acceso
          titulo="App de sala · primera vez en un dispositivo"
          para="Para preparar una tablet o un teléfono: se elige el restaurante y queda guardado."
          ruta="/sala/setup"
          nota="Solo hace falta una vez por dispositivo."
        />
        <Acceso
          titulo="App de sala"
          para="Camareros y encargados, cada uno con su PIN de 4 dígitos."
          ruta="/sala"
          nota="Si el local tiene activado «solo desde el local», fuera de su red solo se puede consultar la wiki, la carta y las propinas."
        />
        <Acceso
          titulo="Puesto TPV (tablet del local)"
          para="Una tablet compartida para comandar y cobrar cuando fallan los PADs. Cada uno pone su PIN; el encargado ve además lo suyo."
          ruta="/tpv"
          nota="Vuelve al PIN después de cada Oído o cobro, y tras un minuto sin tocarla. Mejor en horizontal."
        />
        <Acceso titulo="Panel de administración" para="Carta, salón, personal, turnos, facturas. Con el PIN del panel." ruta="/admin" />
        <Acceso titulo="Pulso" para="La facturación en vivo de todos los locales, para el dueño. Con el PIN de Pulso." ruta="/pulso" />
        {restaurantes.map((r, i) => {
          const config = reservas[i]?.data
          if (!config?.slug) return null
          return <Acceso key={r.id} titulo={`Reservas online · ${r.nombre}`} para="Formulario público para los clientes del restaurante. Se puede enlazar desde la web o Instagram." ruta={`/reservas/${config.slug}`} />
        })}
      </div>
    </div>
  )
}
