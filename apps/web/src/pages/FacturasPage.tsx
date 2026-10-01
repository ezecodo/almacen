import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ADMIN_TOKEN_KEY, Factura } from '../api'
import { useAdminEvents } from '../hooks/useAdminEvents'
import FacturaPaginas from '../components/FacturaPaginas'

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type FiltroEstado = 'pendiente' | 'revisada' | 'todas'
const ESTADOS: { key: FiltroEstado; label: string }[] = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'revisada',  label: 'Revisadas' },
  { key: 'todas',     label: 'Todas' },
]

// Las facturas exigen sesión firmada por el servidor. Normalmente se obtiene sola al
// entrar al admin (AdminGuard); si falta (sesión anterior, token caducado) se pide acá.
function PinServidor({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState('')
  const login = useMutation({
    mutationFn: () => api.auth.admin(pin),
    onSuccess: ({ token }) => { sessionStorage.setItem(ADMIN_TOKEN_KEY, token); onOk() },
  })
  return (
    <div className="max-w-sm mx-auto p-6 mt-10 bg-white rounded-2xl border border-gray-100 text-center">
      <div className="text-4xl mb-3">🧾</div>
      <h1 className="text-lg font-bold text-gray-900 mb-1">Facturas</h1>
      <p className="text-gray-400 text-sm mb-5">Confirma el PIN de admin para ver los documentos</p>
      <form onSubmit={e => { e.preventDefault(); login.mutate() }} className="space-y-3">
        <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} autoFocus
          placeholder="····"
          className="w-full text-center text-2xl tracking-widest border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500" />
        {login.isError && <p className="text-red-500 text-sm">{(login.error as Error).message}</p>}
        <button type="submit" disabled={!pin || login.isPending}
          className="w-full bg-cyan-500 text-white font-semibold py-3 rounded-xl hover:bg-cyan-400 transition-colors disabled:opacity-50">
          {login.isPending ? 'Comprobando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default function FacturasPage() {
  const queryClient = useQueryClient()
  const [conSesion, setConSesion] = useState(() => !!sessionStorage.getItem(ADMIN_TOKEN_KEY))
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [estado, setEstado] = useState<FiltroEstado>('pendiente')
  const [mes, setMes] = useState('')
  const [proveedorId, setProveedorId] = useState<number | null>(null)
  const [vista, setVista] = useState<'bandeja' | 'proveedores'>('bandeja')
  const [nuevoProveedor, setNuevoProveedor] = useState('')
  const [errorProveedor, setErrorProveedor] = useState('')
  const [abiertaId, setAbiertaId] = useState<number | null>(null)
  const [descargandoId, setDescargandoId] = useState<number | null>(null)

  useAdminEvents()

  const { data: restaurantes } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: () => api.restaurantes.list(),
  })

  const { data: facturas = [], error, isLoading } = useQuery({
    queryKey: ['facturas', 'admin', restaurantId, estado, mes, proveedorId],
    queryFn: () => api.facturas.list({
      restaurantId: restaurantId ?? undefined,
      estado: estado === 'todas' ? undefined : estado,
      mes: mes || undefined,
      proveedorId: proveedorId ?? undefined,
    }),
    enabled: conSesion,
    refetchInterval: 30_000,
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['facturas', 'proveedores'],
    queryFn: () => api.facturas.proveedores(),
    enabled: conSesion,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['facturas'] })
  const crearProveedorMut = useMutation({
    mutationFn: (nombre: string) => api.facturas.crearProveedor(nombre),
    onSuccess: () => { setNuevoProveedor(''); setErrorProveedor(''); invalidar() },
    onError: (e: Error) => setErrorProveedor(e.message),
  })
  const renombrarProveedorMut = useMutation({
    mutationFn: ({ id, nombre }: { id: number; nombre: string }) => api.facturas.renombrarProveedor(id, nombre),
    onSuccess: () => { setErrorProveedor(''); invalidar() },
    onError: (e: Error) => setErrorProveedor(e.message),
  })
  const quitarProveedorMut = useMutation({
    mutationFn: (id: number) => api.facturas.quitarProveedor(id),
    onSuccess: invalidar,
  })
  const setEstadoMut = useMutation({
    mutationFn: ({ id, nuevo }: { id: number; nuevo: 'pendiente' | 'revisada' }) => api.facturas.setEstado(id, nuevo),
    onSuccess: invalidar,
  })
  const borrarMut = useMutation({
    mutationFn: (id: number) => api.facturas.delete(id),
    onSuccess: () => { setAbiertaId(null); invalidar() },
  })

  const descargarPdf = async (f: Factura) => {
    setDescargandoId(f.id)
    try {
      const url = URL.createObjectURL(await api.facturas.pdf(f.id))
      const a = document.createElement('a')
      a.href = url
      a.download = `factura-${f.proveedor.replace(/[^\p{L}\p{N}]+/gu, '-')}-${(f.numero ?? String(f.id)).replace(/[^\p{L}\p{N}]+/gu, '-')}-${f.createdAt.slice(0, 10)}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo descargar el PDF')
    } finally {
      setDescargandoId(null)
    }
  }

  const sesionCaducada = !!error && /sesión|administración/i.test((error as Error).message)
  if (!conSesion || sesionCaducada) {
    return <PinServidor onOk={() => { setConSesion(true); invalidar() }} />
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Facturas de proveedores</h1>
      <p className="text-sm text-gray-400 mb-4">Las suben los encargados desde la app de sala (💼 → Facturas)</p>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {([['bandeja', 'Bandeja'], ['proveedores', `Proveedores (${proveedores.length})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setVista(key)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
              vista === key ? 'border-cyan-500 text-cyan-700 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {vista === 'proveedores' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">
            Los proveedores de esta lista son los que el encargado puede elegir al subir una factura (comunes a todos los restaurantes).
          </p>
          <form onSubmit={e => { e.preventDefault(); if (nuevoProveedor.trim()) crearProveedorMut.mutate(nuevoProveedor.trim()) }}
            className="flex gap-2 mb-2">
            <input value={nuevoProveedor} onChange={e => { setNuevoProveedor(e.target.value); setErrorProveedor('') }}
              placeholder="Nombre del proveedor"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-cyan-500" />
            <button type="submit" disabled={!nuevoProveedor.trim() || crearProveedorMut.isPending}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50">
              + Añadir
            </button>
          </form>
          {errorProveedor && <p className="text-red-500 text-sm mb-2">{errorProveedor}</p>}

          {proveedores.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">Todavía no hay proveedores — añade el primero arriba</p>
          )}
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 mt-3">
            {proveedores.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{p.nombre}</p>
                  <p className="text-xs text-gray-400">{p._count?.facturas ?? 0} factura{p._count?.facturas === 1 ? '' : 's'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => {
                      const nombre = prompt('Nuevo nombre del proveedor', p.nombre)?.trim()
                      if (nombre && nombre !== p.nombre) renombrarProveedorMut.mutate({ id: p.id, nombre })
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                    Renombrar
                  </button>
                  <button
                    onClick={() => { if (confirm(`¿Quitar "${p.nombre}" del catálogo? Sus facturas no se borran.`)) quitarProveedorMut.mutate(p.id) }}
                    className="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50">
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === 'bandeja' && (<>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={restaurantId ?? ''} onChange={e => setRestaurantId(e.target.value ? Number(e.target.value) : null)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los restaurantes</option>
          {(restaurantes ?? []).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select value={proveedorId ?? ''} onChange={e => setProveedorId(e.target.value ? Number(e.target.value) : null)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {ESTADOS.map(e => (
            <button key={e.key} onClick={() => setEstado(e.key)}
              className={`px-3 py-2 text-sm transition-colors ${estado === e.key ? 'bg-cyan-50 text-cyan-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
              {e.label}
            </button>
          ))}
        </div>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
        {mes && <button onClick={() => setMes('')} className="text-xs text-gray-400 hover:text-gray-600">Quitar mes</button>}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{(error as Error).message}</p>}
      {!error && !isLoading && facturas.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-16">
          {estado === 'pendiente' ? 'No hay facturas pendientes de revisar 👌' : 'No hay facturas con estos filtros'}
        </p>
      )}

      <div className="space-y-2">
        {facturas.map(f => {
          const abierta = abiertaId === f.id
          return (
            <div key={f.id} className="bg-white rounded-xl border border-gray-100">
              <button type="button" onClick={() => setAbiertaId(abierta ? null : f.id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {f.proveedor}{f.numero ? <span className="text-gray-500 font-normal"> · Nº {f.numero}</span> : <span className="text-gray-300 font-normal"> · sin nº</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {f.restaurant?.nombre} · {fmtFechaHora(f.createdAt)} · {f.subidoPor} · {f.paginas} pág.
                  </p>
                  {f.proveedorId == null && <p className="text-xs text-orange-500 mt-1">⚠️ Proveedor escrito a mano, no está en el catálogo</p>}
                  {f.nota && <p className="text-xs text-amber-600 mt-1">📝 {f.nota}</p>}
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg ${
                  f.estado === 'revisada' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  {f.estado === 'revisada' ? '✓ Revisada' : 'Pendiente'}
                </span>
              </button>

              {abierta && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => descargarPdf(f)} disabled={descargandoId === f.id}
                      className="px-3 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50">
                      {descargandoId === f.id ? 'Generando…' : '⬇ Descargar PDF'}
                    </button>
                    <button
                      onClick={() => setEstadoMut.mutate({ id: f.id, nuevo: f.estado === 'revisada' ? 'pendiente' : 'revisada' })}
                      disabled={setEstadoMut.isPending}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {f.estado === 'revisada' ? '↩ Volver a pendiente' : '✓ Marcar revisada'}
                    </button>
                    {f.proveedorId == null && (
                      <button onClick={() => crearProveedorMut.mutate(f.proveedor)} disabled={crearProveedorMut.isPending}
                        className="px-3 py-2 rounded-lg border border-orange-200 text-sm font-semibold text-orange-600 hover:bg-orange-50 disabled:opacity-50">
                        + Añadir «{f.proveedor}» al catálogo
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm(`¿Eliminar la factura de ${f.proveedor}? No se puede deshacer.`)) borrarMut.mutate(f.id) }}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 ml-auto">
                      Eliminar
                    </button>
                  </div>
                  <div className="max-w-xl">
                    <FacturaPaginas factura={f} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>)}
    </div>
  )
}
