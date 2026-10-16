import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Gasto, GastoHabitual, GastoHabitualBody, PagoGasto } from '../api'
import { textoLineas } from '../components/GastosSala'

// /admin/gastos — la libreta del encargado vista desde arriba.
// Arriba: los gastos habituales (los botones que ve el encargado en 💼 → Gastos), comunes a todos los
// locales. Abajo: lo apuntado en el mes por local y lo que se debe a cuenta.

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
const aNumero = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : null }
const fmtDiaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const mesActual = () => new Date().toISOString().slice(0, 7)
const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-cyan-400'

interface FormTipo { nombre: string; precio: string }

function HabitualForm({ inicial, onDone }: { inicial?: GastoHabitual; onDone: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [icono, setIcono] = useState(inicial?.icono ?? '')
  const [unidad, setUnidad] = useState(inicial?.unidad ?? '')
  const [precio, setPrecio] = useState(inicial?.precio != null ? String(inicial.precio) : '')
  const [pago, setPago] = useState<PagoGasto>(inicial?.pago ?? 'efectivo')
  const [tipos, setTipos] = useState<FormTipo[]>(inicial?.tipos.map(t => ({ nombre: t.nombre, precio: t.precio != null ? String(t.precio) : '' })) ?? [])

  const guardar = useMutation({
    mutationFn: () => {
      const body: GastoHabitualBody = {
        nombre: nombre.trim(), icono: icono.trim(), unidad: unidad.trim(), pago, orden: inicial?.orden ?? 0,
        precio: tipos.length ? null : aNumero(precio),
        tipos: tipos.filter(t => t.nombre.trim()).map(t => ({ nombre: t.nombre.trim(), precio: aNumero(t.precio) })),
      }
      return inicial ? api.gastos.editarHabitual(inicial.id, body) : api.gastos.crearHabitual(body)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos-habituales'] }); onDone() },
  })

  return (
    <div className="bg-cyan-50/40 border border-cyan-100 rounded-2xl p-4 space-y-3">
      <div className="flex gap-3">
        <div className="w-20">
          <label className="block text-xs font-medium text-gray-500 mb-1">Icono</label>
          <input value={icono} onChange={e => setIcono(e.target.value)} maxLength={4} placeholder="🥖" className={inputCls + ' text-center text-xl'} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="PAN, HIELO…" autoFocus className={inputCls + ' uppercase'} />
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium text-gray-500 mb-1">Unidad</label>
          <input value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="barras, sacos…" className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Tipos (opcional) — ej. el hielo: PILE y CUBO</label>
        <div className="space-y-2">
          {tipos.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input value={t.nombre} onChange={e => setTipos(tipos.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                placeholder="Nombre del tipo" className={inputCls + ' uppercase'} />
              <input value={t.precio} onChange={e => setTipos(tipos.map((x, j) => j === i ? { ...x, precio: e.target.value } : x))}
                inputMode="decimal" placeholder="Precio c/u €" className={inputCls + ' w-36'} />
              <button onClick={() => setTipos(tipos.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 px-2">✕</button>
            </div>
          ))}
          <button onClick={() => setTipos([...tipos, { nombre: '', precio: '' }])}
            className="text-xs font-semibold text-cyan-600 hover:text-cyan-700">+ Añadir tipo</button>
        </div>
      </div>

      {tipos.length === 0 && (
        <div className="w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1">Precio por unidad (opcional)</label>
          <input value={precio} onChange={e => setPrecio(e.target.value)} inputMode="decimal" placeholder="€" className={inputCls} />
        </div>
      )}
      <p className="text-[11px] text-gray-400 -mt-1">Con precio, el importe se calcula solo al poner la cantidad (el encargado lo puede cambiar).</p>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Se paga normalmente…</label>
        <div className="flex gap-1.5">
          {([['efectivo', '💶 En efectivo, al momento'], ['cuenta', '📒 A cuenta, después']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setPago(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${pago === id ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {guardar.error && <p className="text-xs text-red-500">{(guardar.error as Error).message}</p>}
      <div className="flex justify-end gap-3">
        <button onClick={onDone} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>
        <button onClick={() => guardar.mutate()} disabled={!nombre.trim() || guardar.isPending}
          className="bg-cyan-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-cyan-400 disabled:opacity-40">
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function FilaGasto({ g, unidad, local }: { g: Gasto; unidad: string; local: boolean }) {
  const qc = useQueryClient()
  const [pagando, setPagando] = useState(false)
  const [importe, setImporte] = useState(g.importe != null ? String(g.importe) : '')
  const [borrando, setBorrando] = useState(false)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['gastos-admin'] })
  const pagar = useMutation({ mutationFn: (con: 'efectivo' | 'otro') => api.gastos.pagarAdmin(g.id, { importe: aNumero(importe), con }), onSuccess: refrescar })
  const borrar = useMutation({ mutationFn: () => api.gastos.borrarAdmin(g.id), onSuccess: refrescar })
  const pendiente = g.pago === 'cuenta' && !g.pagadoAt

  return (
    <tr className="border-b border-gray-50 align-top">
      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{fmtDiaHora(g.createdAt)}</td>
      {local && <td className="py-2 pr-3 text-gray-500">{g.restaurant?.nombre}</td>}
      <td className="py-2 pr-3">
        <span className="font-semibold text-gray-800">{g.nombre}</span>
        <span className="text-gray-500"> {textoLineas(g, unidad)}</span>
        <span className="block text-[11px] text-gray-400">{g.creadoPor}</span>
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        {g.pago === 'efectivo' ? <span className="text-gray-600">💶 Efectivo</span>
          : g.pagadoAt ? <span className="text-gray-600">📒 Pagado {new Date(g.pagadoAt).toLocaleDateString('es-ES')}{g.pagadoCon === 'efectivo' ? ' (caja)' : ''}</span>
          : <span className="text-amber-600 font-semibold">📒 Pendiente</span>}
      </td>
      <td className="py-2 pr-3 text-right font-semibold tabular-nums whitespace-nowrap">{g.importe != null ? eur(g.importe) : '—'}</td>
      <td className="py-2 text-right whitespace-nowrap">
        {pendiente && !pagando && (
          <button onClick={() => setPagando(true)} className="text-xs font-semibold text-amber-600 hover:text-amber-700 mr-3">Pagar</button>
        )}
        {pendiente && pagando && (
          <span className="inline-flex items-center gap-1.5 mr-3">
            <input value={importe} onChange={e => setImporte(e.target.value)} inputMode="decimal" placeholder="€" className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs" />
            <button onClick={() => pagar.mutate('otro')} disabled={pagar.isPending} className="text-xs font-semibold text-white bg-amber-500 rounded-lg px-2 py-1">Transferencia / otro</button>
            <button onClick={() => pagar.mutate('efectivo')} disabled={pagar.isPending || aNumero(importe) == null} className="text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-2 py-1 disabled:opacity-40">De la caja</button>
            <button onClick={() => setPagando(false)} className="text-xs text-gray-400">✕</button>
          </span>
        )}
        {borrando ? (
          <span className="inline-flex gap-2">
            <button onClick={() => borrar.mutate()} className="text-xs font-semibold text-red-500">Sí, borrar</button>
            <button onClick={() => setBorrando(false)} className="text-xs text-gray-400">No</button>
          </span>
        ) : (
          <button onClick={() => setBorrando(true)} className="text-xs text-gray-300 hover:text-red-500">✕</button>
        )}
      </td>
    </tr>
  )
}

export default function GastosPage() {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<GastoHabitual | 'nuevo' | null>(null)
  const [mes, setMes] = useState(mesActual())
  const [restaurantId, setRestaurantId] = useState<number | undefined>(undefined)

  const { data: habituales = [] } = useQuery({ queryKey: ['gastos-habituales', 'admin'], queryFn: api.gastos.habitualesAdmin })
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const { data } = useQuery({ queryKey: ['gastos-admin', mes, restaurantId], queryFn: () => api.gastos.mes(mes, restaurantId) })
  const quitar = useMutation({
    mutationFn: (id: number) => api.gastos.borrarHabitual(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos-habituales'] }),
  })
  const mover = useMutation({
    mutationFn: async ({ a, b }: { a: GastoHabitual; b: GastoHabitual }) => {
      const body = (h: GastoHabitual, orden: number): GastoHabitualBody => ({
        nombre: h.nombre, icono: h.icono, unidad: h.unidad, precio: h.precio, pago: h.pago, orden,
        tipos: h.tipos.map(t => ({ nombre: t.nombre, precio: t.precio })),
      })
      const ia = habituales.indexOf(a), ib = habituales.indexOf(b)
      await Promise.all([api.gastos.editarHabitual(a.id, body(a, ib)), api.gastos.editarHabitual(b.id, body(b, ia))])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gastos-habituales'] }),
  })

  const unidadDe = (g: Gasto) => habituales.find(h => h.id === g.habitualId)?.unidad ?? ''
  const gastos = data?.gastos ?? []
  const pendientes = data?.pendientes ?? []

  // Total del mes por gasto (PAN, HIELO, VELAS…), de mayor a menor
  const porNombre = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of gastos) m.set(g.nombre, (m.get(g.nombre) ?? 0) + (g.importe ?? 0))
    return [...m].sort((a, b) => b[1] - a[1])
  }, [gastos])
  const total = gastos.reduce((s, g) => s + (g.importe ?? 0), 0)
  const deuda = pendientes.reduce((s, g) => s + (g.importe ?? 0), 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-800">🥖 Gastos del día</h1>
        <p className="text-sm text-gray-500 mt-1">
          La libreta del encargado: pan, hielo, frutería, velas… Los gastos habituales son los botones que ve en la sala
          (💼 → Gastos); lo demás lo escribe con "Otro".
        </p>
      </div>

      {/* Habituales */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Gastos habituales <span className="text-xs font-normal text-gray-400">· comunes a todos los locales</span></h2>
          {!editando && (
            <button onClick={() => setEditando('nuevo')} className="bg-cyan-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-cyan-400">+ Añadir</button>
          )}
        </div>
        {editando === 'nuevo' && <HabitualForm onDone={() => setEditando(null)} />}
        {habituales.length === 0 && !editando && (
          <p className="text-sm text-gray-400 py-2">Todavía no hay ninguno. Añade los que se repiten (PAN, HIELO con sus tipos…).</p>
        )}
        <div className="divide-y divide-gray-50">
          {habituales.map((h, i) => editando !== 'nuevo' && editando?.id === h.id ? (
            <HabitualForm key={h.id} inicial={h} onDone={() => setEditando(null)} />
          ) : (
            <div key={h.id} className="flex items-center gap-3 py-2.5">
              <div className="flex flex-col text-[10px] text-gray-300 leading-none">
                <button disabled={i === 0 || mover.isPending} onClick={() => mover.mutate({ a: h, b: habituales[i - 1] })} className="hover:text-gray-600 disabled:opacity-30">▲</button>
                <button disabled={i === habituales.length - 1 || mover.isPending} onClick={() => mover.mutate({ a: h, b: habituales[i + 1] })} className="hover:text-gray-600 disabled:opacity-30">▼</button>
              </div>
              <span className="text-2xl w-8 text-center">{h.icono || '🧾'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{h.nombre} {h.unidad && <span className="text-xs font-normal text-gray-400">({h.unidad})</span>}</p>
                <p className="text-xs text-gray-500">
                  {h.tipos.length
                    ? h.tipos.map(t => `${t.nombre}${t.precio != null ? ` ${eur(t.precio)}` : ''}`).join(' · ')
                    : h.precio != null ? `${eur(h.precio)} c/u` : 'sin precio fijo'}
                  {' · '}{h.pago === 'efectivo' ? '💶 efectivo' : '📒 a cuenta'}
                </p>
              </div>
              <button onClick={() => setEditando(h)} className="text-xs text-gray-400 hover:text-cyan-600">Editar</button>
              <button onClick={() => quitar.mutate(h.id)} disabled={quitar.isPending} title="Quitarlo de la sala (los apuntes ya hechos se quedan)"
                className="text-xs text-gray-300 hover:text-red-500">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input type="month" value={mes} onChange={e => setMes(e.target.value || mesActual())} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" />
        <select value={restaurantId ?? ''} onChange={e => setRestaurantId(e.target.value ? Number(e.target.value) : undefined)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">Todos los locales</option>
          {restaurantes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>

      {/* Cifras */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500">Gastado en el mes</p>
          <p className="text-2xl font-black text-gray-800 tabular-nums">{eur(total)}</p>
          <p className="text-xs text-gray-400">{gastos.length} apuntes</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:col-span-2">
          <p className="text-xs text-gray-500 mb-1.5">Por gasto</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {porNombre.map(([n, v]) => <span key={n}><b className="text-gray-700">{n}</b> <span className="tabular-nums text-gray-500">{eur(v)}</span></span>)}
            {porNombre.length === 0 && <span className="text-gray-400">—</span>}
          </div>
        </div>
      </div>

      {/* Pendientes a cuenta */}
      {pendientes.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
          <h2 className="font-bold text-amber-700 mb-2">📒 Pendiente de pagar {deuda > 0 && <span className="tabular-nums">· {eur(deuda)}</span>}</h2>
          <table className="w-full text-sm">
            <tbody>{pendientes.map(g => <FilaGasto key={g.id} g={g} unidad={unidadDe(g)} local={!restaurantId} />)}</tbody>
          </table>
        </div>
      )}

      {/* Apuntes del mes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h2 className="font-bold text-gray-800 mb-2">Apuntes del mes</h2>
        {gastos.length === 0 ? <p className="text-sm text-gray-400 py-2">Nada apuntado este mes.</p> : (
          <table className="w-full text-sm">
            <tbody>{gastos.map(g => <FilaGasto key={g.id} g={g} unidad={unidadDe(g)} local={!restaurantId} />)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
