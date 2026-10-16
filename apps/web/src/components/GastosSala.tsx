import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Gasto, GastoHabitual, PagoGasto } from '../api'

// Pestaña "🧾 Gastos" del panel 💼: la libreta del encargado. Botones con los gastos habituales
// (se cargan en /admin/gastos) + "Otro" libre. Cada apunte lleva cantidades (por tipo si el gasto
// los tiene: HIELO → PILE, CUBO), importe y si se pagó en efectivo o queda a cuenta.

const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
const aNumero = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : null }

export function textoLineas(g: Pick<Gasto, 'lineas'>, unidad = '') {
  return g.lineas.map(l => l.tipo ? `${l.tipo} ${l.cantidad}` : `${l.cantidad}${unidad ? ` ${unidad}` : ''}`).join(' · ')
}

type Elegido = GastoHabitual | 'libre'

export default function GastosSala({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()
  const [elegido, setElegido] = useState<Elegido | null>(null)
  const [cant, setCant] = useState<Record<string, number>>({})
  const [nombreLibre, setNombreLibre] = useState('')
  const [importe, setImporte] = useState('')
  const [importeTocado, setImporteTocado] = useState(false)
  const [pago, setPago] = useState<PagoGasto>('efectivo')
  const [pagando, setPagando] = useState<Gasto | null>(null)
  const [importePago, setImportePago] = useState('')

  const { data: habituales = [] } = useQuery({ queryKey: ['gastos-habituales', restaurantId], queryFn: () => api.gastos.habituales(restaurantId), staleTime: 5 * 60_000 })
  const { data } = useQuery({ queryKey: ['gastos', restaurantId], queryFn: () => api.gastos.delTurno(restaurantId), refetchInterval: 60_000 })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['gastos', restaurantId] })

  const habitual = elegido && elegido !== 'libre' ? elegido : null
  const filas = habitual?.tipos.length ? habitual.tipos.map(t => ({ clave: t.nombre, precio: t.precio })) : [{ clave: '', precio: habitual?.precio ?? null }]
  const conPrecio = filas.every(f => f.precio != null)
  const calculado = conPrecio ? filas.reduce((s, f) => s + (cant[f.clave] ?? 0) * (f.precio ?? 0), 0) : null

  const elegir = (e: Elegido) => {
    setElegido(e)
    const h = e === 'libre' ? null : e
    setCant(h?.tipos.length ? Object.fromEntries(h.tipos.map(t => [t.nombre, 0])) : { '': 1 })
    setNombreLibre('')
    setImporte('')
    setImporteTocado(false)
    setPago(h?.pago ?? 'efectivo')
  }
  const cerrar = () => setElegido(null)
  const cambiar = (clave: string, d: number) => {
    const n = { ...cant, [clave]: Math.max(0, (cant[clave] ?? 0) + d) }
    setCant(n)
    if (!importeTocado && conPrecio) {
      const total = filas.reduce((s, f) => s + (n[f.clave] ?? 0) * (f.precio ?? 0), 0)
      setImporte(total ? String(Math.round(total * 100) / 100) : '')
    }
  }

  const importeNum = aNumero(importe)
  const hayCantidad = Object.values(cant).some(c => c > 0)
  const listo = hayCantidad && (elegido !== 'libre' || nombreLibre.trim().length > 0) && (pago === 'cuenta' || importeNum != null)

  const apuntar = useMutation({
    mutationFn: () => api.gastos.apuntar({
      restaurantId,
      habitualId: habitual?.id ?? null,
      nombre: elegido === 'libre' ? nombreLibre.trim() : undefined,
      lineas: filas.map(f => ({ tipo: f.clave || null, cantidad: cant[f.clave] ?? 0 })).filter(l => l.cantidad > 0),
      importe: importeNum ?? calculado,
      pago,
    }),
    onSuccess: () => { cerrar(); refrescar() },
  })
  const borrar = useMutation({ mutationFn: (id: number) => api.gastos.borrar(id), onSuccess: refrescar })
  const pagar = useMutation({
    mutationFn: ({ g, con }: { g: Gasto; con: 'efectivo' | 'otro' }) => api.gastos.pagar(g.id, { importe: aNumero(importePago) ?? g.importe, con }),
    onSuccess: () => { setPagando(null); refrescar() },
  })
  const error = (apuntar.error ?? borrar.error ?? pagar.error) as Error | null
  const unidadDe = (g: Gasto) => habituales.find(h => h.id === g.habitualId)?.unidad ?? ''

  const chip = (activo: boolean) =>
    `rounded-xl font-black active:scale-95 transition-colors ${activo ? 'bg-[#4CC8A0] text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'}`

  return (
    <>
      {error && <p className="text-red-400 text-sm font-bold px-1">{error.message}</p>}

      {elegido ? (
        <div className="bg-[var(--sala-srf)] rounded-xl p-4 border-2 border-[#4CC8A0]/50 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[var(--sala-txt)] text-xl font-black uppercase">
              {habitual ? `${habitual.icono} ${habitual.nombre}` : '✏️ Otro gasto'}
            </p>
            <button onClick={cerrar} className="text-[var(--sala-tx3)] text-xl">✕</button>
          </div>

          {elegido === 'libre' && (
            <input value={nombreLibre} onChange={e => setNombreLibre(e.target.value)} placeholder="¿Qué es? (ej. velas)" autoFocus maxLength={80}
              className="w-full bg-[var(--sala-hdr)] text-[var(--sala-txt)] text-base uppercase px-4 py-3 rounded-xl outline-none border border-[var(--sala-brd)] focus:border-[#4CC8A0]" />
          )}

          <div className="space-y-2">
            {filas.map(f => (
              <div key={f.clave} className="flex items-center gap-3">
                <span className="flex-1 text-[var(--sala-txt)] font-bold uppercase">
                  {f.clave || 'Cantidad'}
                  {habitual?.unidad && <span className="text-[var(--sala-tx3)] font-normal normal-case text-xs"> ({habitual.unidad})</span>}
                  {f.precio != null && <span className="block text-[var(--sala-tx3)] font-normal text-xs">{eur(f.precio)} c/u</span>}
                </span>
                <button onClick={() => cambiar(f.clave, -1)} className="w-11 h-11 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xl font-black active:scale-90">−</button>
                <span className="w-8 text-center text-[var(--sala-txt)] text-xl font-black tabular-nums">{cant[f.clave] ?? 0}</span>
                <button onClick={() => cambiar(f.clave, 1)} className="w-11 h-11 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xl font-black active:scale-90">+</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPago('efectivo')} className={`${chip(pago === 'efectivo')} py-3 text-sm`}>💶 Pagado en efectivo</button>
            <button onClick={() => setPago('cuenta')} className={`${chip(pago === 'cuenta')} py-3 text-sm`}>📒 A cuenta</button>
          </div>

          <div>
            <label className="block text-[var(--sala-tx3)] text-xs mb-1">
              {pago === 'efectivo' ? 'Cuánto se pagó' : 'Importe (si se sabe)'}
            </label>
            <div className="relative">
              <input value={importe} onChange={e => { setImporte(e.target.value); setImporteTocado(true) }} inputMode="decimal" placeholder="0,00"
                className="w-full bg-[var(--sala-hdr)] text-[var(--sala-txt)] text-2xl font-black tabular-nums px-4 py-3 pr-10 rounded-xl outline-none border border-[var(--sala-brd)] focus:border-[#4CC8A0]" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--sala-tx3)] text-xl font-bold">€</span>
            </div>
          </div>

          <button onClick={() => apuntar.mutate()} disabled={!listo || apuntar.isPending}
            className="w-full py-4 rounded-xl bg-[#4CC8A0] text-white text-lg font-black active:scale-95 disabled:opacity-40">
            {apuntar.isPending ? 'Guardando…' : 'Apuntar'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {habituales.map(h => (
            <button key={h.id} onClick={() => elegir(h)}
              className="aspect-square rounded-xl bg-[var(--sala-srf)] border border-[var(--sala-brd)] flex flex-col items-center justify-center gap-1 active:scale-95">
              <span className="text-3xl leading-none">{h.icono || '🧾'}</span>
              <span className="text-[var(--sala-txt)] text-sm font-black uppercase leading-tight text-center px-1">{h.nombre}</span>
            </button>
          ))}
          <button onClick={() => elegir('libre')}
            className="aspect-square rounded-xl border-2 border-dashed border-[var(--sala-brd)] flex flex-col items-center justify-center gap-1 active:scale-95">
            <span className="text-3xl leading-none">✏️</span>
            <span className="text-[var(--sala-tx2)] text-sm font-black uppercase">Otro</span>
          </button>
        </div>
      )}

      {/* Lo que se debe a cuenta (de cualquier día) */}
      {data && data.pendientes.length > 0 && (
        <div className="space-y-2">
          <p className="text-amber-400 text-xs font-black uppercase tracking-wider px-1">📒 Pendiente de pagar</p>
          {data.pendientes.map(g => (
            <div key={g.id} className="bg-[var(--sala-srf)] rounded-xl px-4 py-3 border border-amber-500/30">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--sala-txt)] font-black uppercase truncate">{g.nombre} <span className="font-bold normal-case text-[var(--sala-tx2)]">{textoLineas(g, unidadDe(g))}</span></p>
                  <p className="text-[var(--sala-tx3)] text-xs">{fmtDia(g.createdAt)} · {g.creadoPor}{g.importe != null && ` · ${eur(g.importe)}`}</p>
                </div>
                {pagando?.id !== g.id && (
                  <button onClick={() => { setPagando(g); setImportePago(g.importe != null ? String(g.importe) : '') }}
                    className="shrink-0 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-black active:scale-95">Pagar</button>
                )}
              </div>
              {pagando?.id === g.id && (
                <div className="mt-3 space-y-2">
                  <input value={importePago} onChange={e => setImportePago(e.target.value)} inputMode="decimal" placeholder="¿Cuánto se paga? €" autoFocus
                    className="w-full bg-[var(--sala-hdr)] text-[var(--sala-txt)] text-lg font-black tabular-nums px-4 py-2.5 rounded-xl outline-none border border-[var(--sala-brd)] focus:border-amber-400" />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => pagar.mutate({ g, con: 'efectivo' })} disabled={pagar.isPending || aNumero(importePago) == null}
                      className="py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black active:scale-95 disabled:opacity-40">💶 De la caja</button>
                    <button onClick={() => pagar.mutate({ g, con: 'otro' })} disabled={pagar.isPending}
                      className="py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-black active:scale-95 disabled:opacity-40">Otra forma</button>
                  </div>
                  <button onClick={() => setPagando(null)} className="w-full text-[var(--sala-tx3)] text-xs py-1">Cancelar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lo apuntado en este turno */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <p className="text-[var(--sala-tx3)] text-xs font-black uppercase tracking-wider">Este turno</p>
          {data && <p className="text-[var(--sala-tx2)] text-xs">Salió de caja: <b className="text-[var(--sala-txt)] tabular-nums">{eur(data.efectivo)}</b></p>}
        </div>
        {data?.hoy.map(g => (
          <div key={g.id} className="bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[var(--sala-txt)] font-black uppercase truncate">{g.nombre} <span className="font-bold normal-case text-[var(--sala-tx2)]">{textoLineas(g, unidadDe(g))}</span></p>
              <p className="text-[var(--sala-tx3)] text-xs">
                {fmtHora(g.createdAt)} · {g.creadoPor} · {g.pago === 'efectivo' ? '💶 efectivo' : g.pagadoAt ? '📒 a cuenta, ya pagado' : '📒 a cuenta'}
              </p>
            </div>
            <span className="shrink-0 text-[var(--sala-txt)] font-black tabular-nums">{g.importe != null ? eur(g.importe) : '—'}</span>
            {!g.pagadoAt && (
              <button onClick={() => borrar.mutate(g.id)} disabled={borrar.isPending} title="Borrar (me equivoqué)"
                className="shrink-0 w-8 h-8 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-tx3)] text-sm active:scale-90">✕</button>
            )}
          </div>
        ))}
        {data && data.hoy.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-4">Nada apuntado en este turno</p>}
      </div>
    </>
  )
}
