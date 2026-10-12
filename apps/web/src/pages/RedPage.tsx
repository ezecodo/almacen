import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, RedAdmin } from '../api'

function haceCuanto(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 2) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 1440)} días`
}

function Local({ r, tuIp }: { r: RedAdmin['restaurantes'][number]; tuIp: string }) {
  const queryClient = useQueryClient()
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['red-admin'] })
  const restringir = useMutation({ mutationFn: (v: boolean) => api.red.restringir(r.id, v), onSuccess: refrescar })
  const quitar = useMutation({ mutationFn: api.red.quitarRed, onSuccess: refrescar })
  const vigentes = r.redes.filter(x => x.vigente)

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">{r.nombre}</h2>
          <p className="text-sm text-gray-400">{r.piCodigo ? `Pi ${r.piCodigo}` : 'Sin Pi vinculada'}</p>
        </div>
        <button
          onClick={() => restringir.mutate(!r.restringirPorRed)}
          disabled={restringir.isPending}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
            r.restringirPorRed ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {r.restringirPorRed ? 'Solo desde el local: activado' : 'Activar "solo desde el local"'}
        </button>
      </div>
      {restringir.isError && <p className="text-red-500 text-sm mt-2">{(restringir.error as Error).message}</p>}

      {r.redes.length === 0 ? (
        <p className="text-sm text-gray-400 mt-4">
          Todavía no se conoce la red de este local. Aparece sola cuando su Pi está encendida y vinculada.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {r.redes.map(x => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-mono text-gray-900">{x.ip}</span>
                {x.ip === tuIp && <span className="ml-2 text-xs font-semibold text-cyan-600">donde estás ahora</span>}
                <p className="text-gray-400">
                  La informa la Pi · último latido {haceCuanto(x.vistaAt)}
                  {!x.vigente && ' · caducada'}
                </p>
              </div>
              <button onClick={() => quitar.mutate(x.id)} disabled={quitar.isPending} className="text-gray-400 hover:text-red-500">Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {r.restringirPorRed && vigentes.length === 0 && (
        <p className="text-sm text-amber-600 mt-3">⚠️ Está activado y no queda ninguna red vigente: nadie puede operar la sala de este local.</p>
      )}
    </section>
  )
}

export default function RedPage() {
  const { data, isLoading } = useQuery({ queryKey: ['red-admin'], queryFn: api.red.admin, refetchInterval: 30_000 })

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Red del local</h1>
      <p className="text-gray-400 text-sm mb-6">
        Con "solo desde el local" activado, las mesas, comandas y cobros de ese restaurante solo se pueden tocar desde su red.
        Fuera de ella el personal entra igual con su PIN, pero solo para consultar: wiki, carta y propinas (los encargados, también reservas y reviews).
        Este panel y Pulso se abren desde cualquier lado.
      </p>
      {isLoading ? <p className="text-gray-400 text-sm">Cargando…</p> : (
        <div className="space-y-4">
          {data?.restaurantes.map(r => <Local key={r.id} r={r} tuIp={data.tuIp} />)}
        </div>
      )}
    </div>
  )
}
