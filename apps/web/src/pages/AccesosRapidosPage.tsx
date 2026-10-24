import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, AccesosRapidosAdmin, MenuItem } from '../api'

// ⚡ Accesos rápidos de la carta en sala: los botones que salen arriba de COMIDA / BEBIDAS al abrir
// una mesa. Por local: los fijos que se eligen aquí y, si está encendido, el resto con lo más vendido.

const esGrupoBarra = (g: string) => /vino|bebida/i.test(g)
const normTxt = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function AccesosRapidosPage() {
  const qc = useQueryClient()
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const [ridSel, setRidSel] = useState<number | null>(null)
  const rid = ridSel ?? restaurantes[0]?.id ?? null
  const [buscar, setBuscar] = useState('')
  const [error, setError] = useState('')

  const { data: menu = [] } = useQuery({ queryKey: ['menu', rid], queryFn: () => api.menu.list(rid), enabled: rid !== null })
  const { data: cats = [] } = useQuery({ queryKey: ['menu-cats', rid], queryFn: () => api.menuCategorias.list(rid), enabled: rid !== null })
  const { data: conf } = useQuery({
    queryKey: ['accesos-rapidos-admin', rid],
    queryFn: () => api.accesosRapidos.admin(rid!),
    enabled: rid !== null,
  })

  const guardar = useMutation({
    mutationFn: (body: { auto: boolean; fijos: number[] }) =>
      api.accesosRapidos.guardar({ restaurantId: rid!, auto: body.auto, menuItemIds: body.fijos }),
    onMutate: async body => {
      setError('')
      await qc.cancelQueries({ queryKey: ['accesos-rapidos-admin', rid] })
      qc.setQueryData<AccesosRapidosAdmin>(['accesos-rapidos-admin', rid], prev => prev && { ...prev, ...body })
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['accesos-rapidos-admin', rid] })
      qc.invalidateQueries({ queryKey: ['accesos-rapidos', rid] })
    },
  })

  const grupoDe = new Map(cats.map(c => [c.nombre, c.grupo]))
  const visibles = menu.filter(m => m.activo && !m.ocultoEnCarta && !m.autoPorPax)
  const porId = new Map(visibles.map(m => [m.id, m]))
  const max = conf?.max ?? 9
  const autoHasta = conf?.autoHasta ?? 9
  const auto = conf?.auto ?? true
  const fijos = (conf?.fijos ?? []).filter(id => porId.has(id))
  const lleno = fijos.length >= max

  const cambiar = (nuevos: number[], nuevoAuto = auto) => guardar.mutate({ auto: nuevoAuto, fijos: nuevos })
  const anadir = (id: number) => { if (!lleno && !fijos.includes(id)) cambiar([...fijos, id]) }
  const quitar = (id: number) => cambiar(fijos.filter(f => f !== id))
  const mover = (i: number, d: -1 | 1) => {
    const n = [...fijos]; const j = i + d
    if (j < 0 || j >= n.length) return
    ;[n[i], n[j]] = [n[j], n[i]]
    cambiar(n)
  }

  // Lo que verá el camarero: los fijos y, si toca, lo más vendido detrás
  const vista = [...fijos]
  if (auto) for (const v of conf?.masVendidas ?? []) {
    if (vista.length >= autoHasta) break
    if (!vista.includes(v.id) && porId.has(v.id)) vista.push(v.id)
  }
  const vendidasDe = new Map((conf?.masVendidas ?? []).map(v => [v.id, v.vendidas]))

  const q = normTxt(buscar.trim())
  const resultados = q
    ? visibles.filter(m => normTxt(m.nombre).includes(q) || normTxt(m.categoria).includes(q)).slice(0, 30)
    : []

  const filaPlato = (m: MenuItem, extra?: React.ReactNode) => {
    const ya = fijos.includes(m.id)
    return (
      <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{m.nombre}</p>
          <p className="text-xs text-gray-400 truncate">{m.categoria}{extra}</p>
        </div>
        <button onClick={() => anadir(m.id)} disabled={ya || lleno}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white disabled:bg-gray-100 disabled:text-gray-400">
          {ya ? 'Ya está' : '+ Fijar'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-800">Accesos rápidos</h1>
        <p className="text-sm text-gray-400">
          Los botones que el camarero ve arriba de COMIDA y BEBIDAS al abrir una mesa, para marchar las primeras bebidas de un toque. Hasta {max} por local: en el teléfono se ven las tres primeras filas y el resto deslizando hacia arriba, así que lo más pedido, primero.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {restaurantes.map(r => (
          <button key={r.id} onClick={() => setRidSel(r.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
              rid === r.id ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {r.nombre}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Lo que se ve en la sala */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-gray-800">Así lo ve el camarero</h2>
            <p className="text-xs text-gray-400 mt-0.5">📌 fijo · 🔥 de lo más vendido (cambia solo)</p>
          </div>
          {vista.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No sale nada: fija algún plato{auto ? ' o espera a que este local tenga ventas' : ''}.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-w-sm">
              {vista.map(id => {
                const m = porId.get(id)!
                const barra = esGrupoBarra(grupoDe.get(m.categoria) ?? '')
                return (
                  <div key={id} className={`h-20 rounded-2xl px-1.5 flex items-center justify-center text-center relative border-2 ${
                    barra ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                    <span className="text-[13px] font-black uppercase leading-tight text-gray-800 line-clamp-3 break-words">{m.nombre}</span>
                    <span className="absolute top-1 left-1.5 text-[10px]">{fijos.includes(id) ? '📌' : '🔥'}</span>
                  </div>
                )
              })}
            </div>
          )}

          <label className="flex items-start gap-3 pt-3 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={auto} onChange={e => cambiar(fijos, e.target.checked)} className="mt-0.5 w-4 h-4 accent-cyan-500" />
            <span>
              <span className="block text-sm font-semibold text-gray-800">Completar con las bebidas más vendidas</span>
              <span className="block text-xs text-gray-400">
                Si hay menos de {autoHasta} fijos, los huecos de las tres primeras filas se llenan solos con lo que más se pidió en barra en este local los últimos {conf?.dias ?? 30} días.
              </span>
            </span>
          </label>
        </div>

        {/* Fijos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-800">Fijos ({fijos.length}/{max})</h2>
          <p className="text-xs text-gray-400 mt-0.5 mb-3">Salen siempre, primero y en este orden.</p>
          {fijos.length === 0 && <p className="text-sm text-gray-400 py-2">Ninguno todavía.</p>}
          <div className="space-y-1.5">
            {fijos.map((id, i) => (
              <div key={id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <span className="text-xs text-gray-400 w-4 tabular-nums">{i + 1}</span>
                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{porId.get(id)!.nombre}</span>
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1">▲</button>
                <button onClick={() => mover(i, 1)} disabled={i === fijos.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1">▼</button>
                <button onClick={() => quitar(id)} className="text-xs text-red-500 hover:text-red-700 px-2">Quitar</button>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100">
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar en la carta para fijar…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400" />
            {lleno && <p className="text-xs text-amber-600 mt-2">Ya hay {max} fijos: quita uno para poner otro.</p>}
            <div className="mt-2">
              {q
                ? (resultados.length ? resultados.map(m => filaPlato(m)) : <p className="text-sm text-gray-400 py-3">Sin resultados</p>)
                : (conf?.masVendidas ?? []).filter(v => porId.has(v.id)).slice(0, 15).length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1">Lo más vendido en barra · {conf?.dias ?? 30} días</p>
                    {(conf?.masVendidas ?? []).filter(v => porId.has(v.id)).slice(0, 15)
                      .map(v => filaPlato(porId.get(v.id)!, <> · {vendidasDe.get(v.id)} uds</>))}
                  </>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
