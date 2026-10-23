import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, ComandaItem, Division, PagoParcial, pagadoDivision, totalComanda, valorItem } from '../api'

// Pagar por separado (pedido de Eze, 2026-10-23): con la cuenta impresa, el camarero va a la mesa con
// el datáfono y divide — por igual, o cada uno lo suyo picando platos (el pan va solo, uno por cabeza).
// Cada pago queda apuntado en la comanda; el encargado cierra la mesa con todo ya sumado (CobroSheet).

const cent = (n: number) => Math.round(n * 100)
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

// Lo que se cobra por cabeza (pan × pax, menú de grupo × pax): en "cada uno lo suyo" entra solo
const esPorPersona = (i: ComandaItem, pax: number) => i.autoGenerado && i.cantidad === pax && valorItem(i) > 0

// 1, 2… o 1/3 si es un trozo de algo compartido
function fmtCant(c: number) {
  if (Math.abs(c - Math.round(c)) < 0.001) return String(Math.round(c))
  for (let k = 2; k <= 8; k++) if (Math.abs(c * k - Math.round(c * k)) < 0.01) return `${Math.round(c * k)}/${k}`
  return c.toFixed(2)
}

function consumido(division: Division) {
  const m = new Map<number, number>()
  for (const p of division.pagos) for (const c of p.consumo ?? []) m.set(c.itemId, (m.get(c.itemId) ?? 0) + c.cant)
  return m
}

export function detallePago(p: PagoParcial, items: ComandaItem[]) {
  if (!p.consumo?.length) return ''
  return p.consumo.map(c => `${fmtCant(c.cant)}× ${items.find(i => i.id === c.itemId)?.nombre ?? '?'}`).join(', ')
}

// Lo que ve el encargado al cobrar: cada pago, y si suma justo la cuenta
export function ResumenDivision({ comanda }: { comanda: Comanda }) {
  const total = totalComanda(comanda.items)
  const pagos = comanda.division?.pagos ?? []
  const pagado = pagadoDivision(comanda.division)
  const propina = pagos.reduce((s, p) => s + (p.metodo === 'tarjeta' ? p.propina : 0), 0)
  const falta = (cent(total) - cent(pagado)) / 100
  const efectivo = pagos.filter(p => p.metodo === 'cash').reduce((s, p) => s + p.importe, 0)
  return (
    <div className="rounded-2xl bg-[var(--sala-srf)] p-3 space-y-1.5">
      <p className="text-[var(--sala-tx3)] text-xs font-black uppercase tracking-widest">✂️ Pagada por separado · {pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'}</p>
      {pagos.map((p, n) => (
        <div key={p.id} className="flex items-baseline gap-2 text-sm">
          <span className="w-5 text-[var(--sala-tx4)] font-bold tabular-nums">{n + 1}</span>
          <span>{p.metodo === 'cash' ? '💶' : '💳'}</span>
          <span className="text-[var(--sala-txt)] font-black tabular-nums">{eur(p.importe)}</span>
          {p.metodo === 'tarjeta' && p.propina > 0 && <span className="text-amber-400 text-xs font-bold">+{eur(p.propina)} propina</span>}
          <span className="flex-1 min-w-0 truncate text-[var(--sala-tx3)] text-xs">{detallePago(p, comanda.items)}</span>
        </div>
      ))}
      <div className={`mt-1 rounded-xl px-3 py-2 text-sm font-bold ${falta === 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
        {falta === 0
          ? <>✅ Cuadra: {eur(pagado + propina)} cobrados = cuenta {eur(total)}{propina > 0 ? ` + ${eur(propina)} propina` : ''}</>
          : falta > 0
            ? <>⚠️ Falta pagar {eur(falta)} de {eur(total)}</>
            : <>⚠️ Los pagos pasan la cuenta en {eur(-falta)}: revisa la división</>}
        {falta === 0 && efectivo > 0 && efectivo < total && <span className="block text-xs font-semibold opacity-80">💶 {eur(efectivo)} en efectivo · 💳 {eur(total - efectivo)} con tarjeta</span>}
      </div>
    </div>
  )
}

export function DividirCuentaSheet({ comanda, quien, onClose, onCerrarMesa }: {
  comanda: Comanda
  quien?: string
  onClose: () => void
  onCerrarMesa?: () => void // solo encargado: cerrar la mesa cuando ya está todo pagado
}) {
  const queryClient = useQueryClient()
  const total = totalComanda(comanda.items)
  const [division, setDivision] = useState<Division>(() => comanda.division ?? { pagos: [] })
  const firma = JSON.stringify(comanda.division ?? null)
  useEffect(() => { setDivision(comanda.division ?? { pagos: [] }) }, [firma]) // eslint-disable-line react-hooks/exhaustive-deps

  const pagadoC = cent(pagadoDivision(division))
  const faltaC = Math.max(0, cent(total) - pagadoC)
  const [modo, setModo] = useState<'igual' | 'items'>(() => division.pagos.some(p => p.consumo?.length) ? 'items' : 'igual')
  const [quedan, setQuedan] = useState(() => division.quedan ?? Math.max(1, comanda.pax - division.pagos.length))
  // Pasar a "por igual": entre los comensales que todavía no pagaron (mesa de 2 con uno pagado → 1)
  const aPorIgual = () => { setModo('igual'); setQuedan(Math.max(1, comanda.pax - division.pagos.length)) }
  const [metodo, setMetodo] = useState<'tarjeta' | 'cash'>('tarjeta')
  const [quitar, setQuitar] = useState<string | null>(null)
  const [borrarTodo, setBorrarTodo] = useState(false)

  // "Cada uno lo suyo": lo que lleva la persona que está pagando ahora
  const usado = useMemo(() => consumido(division), [division])
  const lineas = comanda.items.filter(i => valorItem(i) > 0)
  const restante = (i: ComandaItem) => Math.max(0, i.cantidad - (usado.get(i.id) ?? 0))
  const seleccionNueva = () => {
    const m = new Map<number, number>()
    for (const i of lineas) if (esPorPersona(i, comanda.pax) && restante(i) > 0.001) m.set(i.id, Math.min(1, restante(i)))
    return m
  }
  const [sel, setSel] = useState<Map<number, number>>(seleccionNueva)
  const [partir, setPartir] = useState<number | null>(null)
  // Cada vez que cambian los pagos (uno nuevo, uno quitado, otro dispositivo), empieza la persona siguiente
  const firmaPagos = JSON.stringify(division.pagos.map(p => p.id))
  useEffect(() => { setSel(seleccionNueva()) }, [firmaPagos]) // eslint-disable-line react-hooks/exhaustive-deps

  const sumar = (i: ComandaItem, cant: number) => setSel(prev => {
    const m = new Map(prev)
    const ya = m.get(i.id) ?? 0
    const nuevo = Math.min(restante(i), ya + cant)
    if (nuevo > 0.001) m.set(i.id, nuevo); else m.delete(i.id)
    return m
  })

  const importeItemsC = [...sel].reduce((s, [id, cant]) => {
    const i = comanda.items.find(x => x.id === id)
    return s + (i ? i.precio * cant * 100 : 0)
  }, 0)
  // Si esta persona se lleva todo lo que queda, paga justo lo que falta (los céntimos de los tercios cuadran)
  const seLlevaTodo = sel.size > 0 && lineas.every(i => restante(i) - (sel.get(i.id) ?? 0) < 0.001)
  const cuotaC = modo === 'igual'
    ? Math.ceil(faltaC / Math.max(1, quedan))
    : Math.min(faltaC, seLlevaTodo ? faltaC : Math.round(importeItemsC))

  const guardar = useMutation({
    mutationFn: (d: Division | null) => api.comandas.division(comanda.id, d),
    onSuccess: c => {
      setDivision(c.division ?? { pagos: [] })
      queryClient.invalidateQueries({ queryKey: ['comandas-sala'] })
      queryClient.invalidateQueries({ queryKey: ['enc-cobros'] })
      queryClient.invalidateQueries({ queryKey: ['comanda-cobro', comanda.id] })
    },
  })

  const pagar = () => {
    if (cuotaC <= 0) return
    navigator.vibrate?.(15)
    const pago: PagoParcial = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      importe: cuotaC / 100,
      propina: 0, // la propina la pone el encargado al cotejar los tickets (CobroSheet)
      metodo,
      ...(modo === 'items' ? { consumo: [...sel].map(([itemId, cant]) => ({ itemId, cant })) } : {}),
      at: new Date().toISOString(),
      ...(quien ? { por: quien } : {}),
    }
    const siguienteQuedan = modo === 'igual' ? Math.max(1, quedan - 1) : division.quedan
    if (modo === 'igual') setQuedan(siguienteQuedan ?? 1)
    setMetodo('tarjeta')
    guardar.mutate({ pagos: [...division.pagos, pago], ...(siguienteQuedan ? { quedan: siguienteQuedan } : {}) })
  }

  const quitarPago = (id: string) => {
    const pagos = division.pagos.filter(p => p.id !== id)
    const eraIgual = !division.pagos.find(p => p.id === id)?.consumo
    const q = eraIgual && division.quedan ? division.quedan + 1 : division.quedan
    if (eraIgual) setQuedan(v => v + 1)
    setQuitar(null)
    guardar.mutate({ pagos, ...(q ? { quedan: q } : {}) })
  }

  const completo = faltaC === 0 && division.pagos.length > 0
  const error = guardar.error as Error | null
  const btn = 'rounded-xl font-black active:scale-95 transition-transform select-none'

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-[var(--sala-hdr)] border-t sm:border border-[var(--sala-brd2)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[96vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Cabecera: mesa, total, pagado y lo que falta, siempre a la vista */}
        <div className="p-4 pb-3 border-b border-[var(--sala-brd)]">
          <div className="flex items-center justify-between">
            <p className="text-[var(--sala-tx3)] text-xs font-black uppercase tracking-widest">✂️ Pagar por separado · Mesa {comanda.mesa.numero} · {comanda.pax} pax</p>
            <button onClick={onClose} className="text-[var(--sala-tx3)] text-2xl leading-none px-1">✕</button>
          </div>
          <div className="flex items-end justify-between mt-2 gap-3">
            <div className="text-[var(--sala-tx2)] text-sm leading-tight">
              <p>Cuenta <b className="text-[var(--sala-txt)] tabular-nums">{eur(total)}</b></p>
              <p>Pagado <b className="text-emerald-400 tabular-nums">{eur(pagadoC / 100)}</b>{division.pagos.length > 0 && ` · ${division.pagos.length} ${division.pagos.length === 1 ? 'pago' : 'pagos'}`}</p>
            </div>
            <div className="text-right">
              <p className="text-[var(--sala-tx4)] text-[11px] font-black uppercase tracking-widest">Falta</p>
              <p className={`text-4xl font-black tabular-nums leading-none ${faltaC === 0 ? 'text-emerald-400' : 'text-[var(--sala-txt)]'}`}>{eur(faltaC / 100)}</p>
            </div>
          </div>
          {comanda.cuentaDesactualizada && (
            <p className="mt-2 text-red-400 text-xs font-bold">⚠️ La cuenta cambió después de imprimirse: reimprímela antes de seguir.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Pagos ya hechos */}
          {division.pagos.length > 0 && (
            <div className="space-y-1">
              {division.pagos.map((p, n) => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-[var(--sala-srf)] px-3 py-2">
                  <span className="text-[var(--sala-tx4)] text-xs font-black w-4 tabular-nums">{n + 1}</span>
                  <span>{p.metodo === 'cash' ? '💶' : '💳'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--sala-txt)] text-sm font-black tabular-nums">
                      {eur(p.importe)}{p.metodo === 'tarjeta' && p.propina > 0 && <span className="text-amber-400 text-xs font-bold"> +{eur(p.propina)} propina</span>}
                    </p>
                    {p.consumo?.length ? <p className="text-[var(--sala-tx3)] text-xs truncate">{detallePago(p, comanda.items)}</p> : null}
                  </div>
                  {quitar === p.id ? (
                    <button onClick={() => quitarPago(p.id)} disabled={guardar.isPending} className={`${btn} px-3 py-1.5 bg-red-500 text-white text-xs`}>Quitar</button>
                  ) : (
                    <button onClick={() => setQuitar(p.id)} aria-label="Quitar este pago" className="text-[var(--sala-tx4)] text-lg px-1">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {completo ? (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/40 p-4 text-center space-y-2">
              <p className="text-emerald-400 text-lg font-black">✅ Cuenta pagada completa</p>
              <p className="text-[var(--sala-tx2)] text-sm">{onCerrarMesa ? 'Ya puedes cerrar la mesa.' : 'Avisa al encargado: la cierra con todo ya sumado.'}</p>
              {onCerrarMesa && (
                <button onClick={onCerrarMesa} className={`${btn} w-full py-3 bg-amber-500 text-black text-lg`}>Cobrar Mesa {comanda.mesa.numero}</button>
              )}
            </div>
          ) : (
            <>
              {/* Modo */}
              <div className="grid grid-cols-2 gap-2">
                {([['igual', '⚖️ Por igual'], ['items', '🍽 Cada uno lo suyo']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => m === 'igual' && modo !== 'igual' ? aPorIgual() : setModo(m)}
                    className={`${btn} py-3 text-sm ${modo === m ? 'text-white' : 'bg-[var(--sala-srf)] text-[var(--sala-tx2)]'}`}
                    style={modo === m ? { background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' } : undefined}>
                    {label}
                  </button>
                ))}
              </div>

              {modo === 'igual' ? (
                <div className="rounded-2xl bg-[var(--sala-srf)] p-4">
                  <p className="text-[var(--sala-tx3)] text-xs font-bold text-center">
                    {division.pagos.length > 0 ? 'Lo que falta, entre los que quedan' : 'Toda la cuenta, a partes iguales'}
                  </p>
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <button onClick={() => setQuedan(q => Math.max(1, q - 1))} className={`${btn} w-14 h-14 bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-3xl`}>−</button>
                    <div className="text-center min-w-[90px]">
                      <p className="text-[var(--sala-txt)] text-5xl font-black tabular-nums leading-none">{quedan}</p>
                      <p className="text-[var(--sala-tx3)] text-xs font-bold mt-1">{quedan === 1 ? 'persona' : 'personas'}</p>
                    </div>
                    <button onClick={() => setQuedan(q => Math.min(99, q + 1))} className={`${btn} w-14 h-14 bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-3xl`}>+</button>
                  </div>
                  <p className="text-center mt-3 text-[var(--sala-tx2)] text-sm">
                    Cada uno <b className="text-[var(--sala-txt)] text-2xl tabular-nums">{eur(Math.floor(faltaC / Math.max(1, quedan)) / 100)}</b>
                    {faltaC % Math.max(1, quedan) !== 0 && <span className="block text-xs text-[var(--sala-tx3)]">(los céntimos que sobran los paga el primero)</span>}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[var(--sala-tx3)] text-xs px-1">Toca lo que paga esta persona. <b>÷</b> = algo compartido (una botella entre 3).</p>
                  {lineas.map(i => {
                    const queda = restante(i)
                    const lleva = sel.get(i.id) ?? 0
                    const agotada = queda < 0.001
                    return (
                      <div key={i.id} className={`rounded-xl border-2 ${lleva > 0 ? 'border-[#4CC8A0] bg-[#4CC8A0]/10' : 'border-transparent bg-[var(--sala-srf)]'} ${agotada ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5">
                          <button disabled={agotada || lleva >= queda - 0.001} onClick={() => sumar(i, 1)} className="flex-1 min-w-0 text-left py-1.5">
                            <p className="text-[var(--sala-txt)] text-sm font-black uppercase truncate">
                              {lleva > 0 && <span className="text-[#4CC8A0]">{fmtCant(lleva)}× </span>}{i.nombre}
                            </p>
                            <p className="text-[var(--sala-tx3)] text-xs tabular-nums">
                              {eur(i.precio)} · {agotada ? 'ya pagado' : `quedan ${fmtCant(queda)} de ${i.cantidad}`}
                              {esPorPersona(i, comanda.pax) && ' · por persona'}
                            </p>
                          </button>
                          {lleva > 0 && (
                            <button onClick={() => sumar(i, -lleva)} aria-label="Quitar" className={`${btn} w-10 h-10 bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-lg`}>✕</button>
                          )}
                          {!agotada && (
                            <button onClick={() => setPartir(partir === i.id ? null : i.id)} aria-label="Compartido"
                              className={`${btn} w-10 h-10 text-lg ${partir === i.id ? 'bg-[#4B9EDF] text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'}`}>÷</button>
                          )}
                        </div>
                        {partir === i.id && (
                          <div className="flex items-center gap-1.5 px-3 pb-2">
                            <span className="text-[var(--sala-tx3)] text-xs font-bold mr-1">Uno entre</span>
                            {[2, 3, 4, 5, 6].map(k => (
                              <button key={k} onClick={() => { sumar(i, 1 / k); setPartir(null) }}
                                className={`${btn} w-10 h-9 bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm`}>{k}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {division.pagos.length > 0 && (
                    <button onClick={aPorIgual}
                      className={`${btn} w-full py-2.5 bg-[var(--sala-srf)] border border-[var(--sala-brd2)] text-[var(--sala-tx2)] text-sm`}>
                      ⚖️ El resto, entre los que quedan
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-sm font-bold">{error.message}</p>}

          {division.pagos.length > 0 && (
            borrarTodo ? (
              <div className="flex gap-2">
                <button onClick={() => { setBorrarTodo(false); setQuedan(comanda.pax); guardar.mutate(null) }} className={`${btn} flex-1 py-2 bg-red-500 text-white text-sm`}>Sí, borrar todos los pagos</button>
                <button onClick={() => setBorrarTodo(false)} className={`${btn} flex-1 py-2 bg-[var(--sala-srf)] text-[var(--sala-tx2)] text-sm`}>No</button>
              </div>
            ) : (
              <button onClick={() => setBorrarTodo(true)} className="w-full text-center text-[var(--sala-tx4)] text-xs underline py-1">Empezar de nuevo</button>
            )
          )}
        </div>

        {/* Pie: cobrar a esta persona */}
        {!completo && (
          <div className="p-4 pt-3 border-t border-[var(--sala-brd)] space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMetodo('tarjeta')} className={`${btn} py-2.5 text-sm ${metodo === 'tarjeta' ? 'bg-blue-600 text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>💳 Tarjeta</button>
              <button onClick={() => setMetodo('cash')} className={`${btn} py-2.5 text-sm ${metodo === 'cash' ? 'bg-green-600 text-white' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx3)]'}`}>💶 Efectivo</button>
            </div>
            <button onClick={pagar} disabled={cuotaC <= 0 || guardar.isPending || comanda.cuentaDesactualizada}
              className={`${btn} w-full py-4 text-white text-xl disabled:opacity-30`}
              style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
              {guardar.isPending ? 'Guardando…'
                : cuotaC <= 0 ? (modo === 'items' ? 'Toca lo que paga' : 'Nada que pagar')
                : `✓ Pagó ${eur(cuotaC / 100)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
