import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, TurnoParaPropina } from '../api'

// Pestaña "💰 Propinas" del panel 💼: el encargado reparte las propinas de un turno cerrado de su
// local desde el teléfono, igual que el modal del admin (importes → quién trabajó y sus horas →
// confirmar; a cada uno según sus horas). Se puede hacer desde casa y corregir después: el
// servidor solo deja tocar turnos cerrados del local de la sesión.

const normTxt = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
const aNumero = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const fmtTurno = (t: TurnoParaPropina) => {
  const d = new Date(t.cierreAt ?? t.aperturaAt)
  const ap = new Date(t.aperturaAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const ci = t.cierreAt ? new Date(t.cierreAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), horas: `${ap} → ${ci}` }
}

export const QK_PROPINAS_ENC = ['propinas-enc'] as const

export default function PropinasSala({ turnoInicialId }: { turnoInicialId?: number }) {
  const { data: turnos = [], isLoading } = useQuery({ queryKey: QK_PROPINAS_ENC, queryFn: api.propinas.encargado.turnos, refetchInterval: 60_000 })
  const [abiertoId, setAbiertoId] = useState<number | null>(turnoInicialId ?? null)
  const [hecho, setHecho] = useState<string | null>(null)
  const abierto = turnos.find(t => t.id === abiertoId)

  if (abierto) {
    return <Reparto key={abierto.id} turno={abierto}
      onCerrar={() => setAbiertoId(null)}
      onHecho={msg => { setAbiertoId(null); setHecho(msg); setTimeout(() => setHecho(null), 3500) }} />
  }

  const sinRepartir = turnos.filter(t => !t.propina)
  return (
    <div className="space-y-2">
      {hecho && <p className="bg-[#4CC8A0]/15 border border-[#4CC8A0]/40 text-[#4CC8A0] rounded-xl px-4 py-3 text-sm font-bold">✓ {hecho}</p>}
      {isLoading && <p className="text-center text-[var(--sala-tx4)] text-sm py-10">Cargando…</p>}
      {!isLoading && turnos.length === 0 && (
        <p className="text-center text-[var(--sala-tx4)] text-sm py-10">Aún no hay turnos cerrados. Al cerrar el turno, sus propinas se reparten aquí.</p>
      )}
      {sinRepartir.length > 0 && <p className="text-[var(--sala-tx3)] text-[11px] font-black uppercase tracking-wider pt-1">Por repartir</p>}
      {[...sinRepartir, ...turnos.filter(t => t.propina)].map((t, i) => {
        const f = fmtTurno(t)
        const primeroRepartido = t.propina && i === sinRepartir.length
        return (
          <div key={t.id}>
            {primeroRepartido && <p className="text-[var(--sala-tx3)] text-[11px] font-black uppercase tracking-wider pt-3 pb-2">Repartidas</p>}
            <button onClick={() => setAbiertoId(t.id)}
              className={`w-full text-left rounded-xl p-4 active:scale-[0.99] transition-transform ${t.propina ? 'bg-[var(--sala-srf)]' : 'bg-amber-500/10 border-2 border-amber-500/50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[var(--sala-txt)] font-bold truncate">{f.dia}</p>
                  <p className="text-[var(--sala-tx3)] text-xs">{f.horas}{t.encargadoNombre ? ` · ${t.encargadoNombre.split(' ')[0]}` : ''}</p>
                </div>
                {t.propina ? (
                  <div className="text-right shrink-0">
                    <p className="text-[#4CC8A0] font-black tabular-nums">{eur(t.propina.total)}</p>
                    <p className="text-[var(--sala-tx3)] text-[11px]">{t.propina.turnos.length} {t.propina.turnos.length === 1 ? 'persona' : 'personas'} · corregir</p>
                  </div>
                ) : (
                  <span className="shrink-0 px-3 py-2 rounded-lg bg-amber-500 text-black text-sm font-black">Repartir</span>
                )}
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Reparto({ turno, onCerrar, onHecho }: { turno: TurnoParaPropina; onCerrar: () => void; onHecho: (msg: string) => void }) {
  const qc = useQueryClient()
  const previo = turno.propina
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [efectivo, setEfectivo] = useState(previo ? String(previo.efectivo).replace('.', ',') : '')
  const [tarjeta, setTarjeta] = useState(String(previo?.tarjeta ?? turno.totalPropinas ?? 0).replace('.', ','))
  // En el orden en que se picaron (el último abajo), para que la lista no salte al añadir
  const [elegidos, setElegidos] = useState<{ empleadoId: number; horas: number }[]>(() => (previo?.turnos ?? []).map(t => ({ empleadoId: t.empleadoId, horas: t.horas })))
  const [busqueda, setBusqueda] = useState('')

  const { data: empleados = [] } = useQuery({ queryKey: ['propinas-enc-empleados'], queryFn: api.propinas.encargado.empleados, staleTime: 5 * 60_000 })
  const nombreDe = (id: number) => empleados.find(e => e.id === id)?.nombre ?? previo?.turnos.find(t => t.empleadoId === id)?.empleado.nombre ?? '—'

  const total = aNumero(efectivo) + aNumero(tarjeta)
  const totalHoras = elegidos.reduce((s, t) => s + t.horas, 0)
  const reparto = elegidos
    .map(t => ({ ...t, nombre: nombreDe(t.empleadoId), propina: totalHoras ? Math.round(total * (t.horas / totalHoras) * 100) / 100 : 0 }))
    .sort((a, b) => b.propina - a.propina)

  const sugerencias = useMemo(() => {
    const q = normTxt(busqueda.trim())
    return empleados.filter(e => !elegidos.some(t => t.empleadoId === e.id) && (!q || normTxt(e.nombre).includes(q))).slice(0, q ? 8 : 40)
  }, [busqueda, empleados, elegidos])

  const cambiarHoras = (id: number, d: number) =>
    setElegidos(l => l.map(t => t.empleadoId === id ? { ...t, horas: Math.min(24, Math.max(0.5, t.horas + d)) } : t))
  const quitar = (id: number) => setElegidos(l => l.filter(t => t.empleadoId !== id))

  const guardar = useMutation({
    mutationFn: () => api.propinas.encargado.repartir(turno.id, { efectivo: aNumero(efectivo), tarjeta: aNumero(tarjeta), turnos: elegidos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_PROPINAS_ENC })
      onHecho(`${previo ? 'Reparto corregido' : 'Propinas repartidas'}: ${eur(total)} entre ${elegidos.length}`)
    },
  })

  const f = fmtTurno(turno)
  const inputCls = 'w-full bg-[var(--sala-srf)] border border-[var(--sala-brd)] rounded-xl px-4 py-4 text-2xl font-black text-[var(--sala-txt)] tabular-nums focus:outline-none focus:border-[#4CC8A0]'
  const btnPrimario = 'w-full py-4 rounded-xl text-white text-base font-black active:scale-[0.98] transition-transform disabled:opacity-40'
  const gradiente = { background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={paso === 1 ? onCerrar : () => setPaso((paso - 1) as 1 | 2)} className="text-[var(--sala-tx2)] text-sm font-bold py-1">← {paso === 1 ? 'Turnos' : 'Atrás'}</button>
        <div className="text-right">
          <p className="text-[var(--sala-txt)] font-bold text-sm">{f.dia}</p>
          <p className="text-[var(--sala-tx3)] text-xs">{f.horas}</p>
        </div>
      </div>
      {/* Pasos */}
      <div className="flex gap-1.5">
        {(['Importes', 'Quién trabajó', 'Confirmar'] as const).map((n, i) => (
          <div key={n} className="flex-1">
            <div className={`h-1.5 rounded-full ${paso > i ? 'bg-[#4CC8A0]' : 'bg-[var(--sala-btn2)]'}`} />
            <p className={`text-[10px] font-bold mt-1 ${paso === i + 1 ? 'text-[var(--sala-txt)]' : 'text-[var(--sala-tx4)]'}`}>{n}</p>
          </div>
        ))}
      </div>

      {paso === 1 && (
        <>
          <label className="block">
            <span className="text-[var(--sala-tx2)] text-sm font-bold">💶 Propina en efectivo</span>
            <input type="text" inputMode="decimal" value={efectivo} onChange={e => setEfectivo(e.target.value)} placeholder="0,00" className={`${inputCls} mt-1.5`} autoFocus />
          </label>
          <label className="block">
            <span className="text-[var(--sala-tx2)] text-sm font-bold">💳 Propina con tarjeta</span>
            <span className="block text-[var(--sala-tx3)] text-xs">Sale de los cobros del turno; cámbiala si hace falta.</span>
            <input type="text" inputMode="decimal" value={tarjeta} onChange={e => setTarjeta(e.target.value)} className={`${inputCls} mt-1.5`} />
          </label>
          <div className="rounded-xl py-4 text-center bg-[#4CC8A0]/10 border border-[#4CC8A0]/30">
            <p className="text-[#4CC8A0] text-3xl font-black tabular-nums">{eur(total)}</p>
            <p className="text-[var(--sala-tx3)] text-xs">para repartir</p>
          </div>
          <button onClick={() => setPaso(2)} disabled={total <= 0} className={btnPrimario} style={gradiente}>Continuar →</button>
        </>
      )}

      {paso === 2 && (
        <>
          {elegidos.length > 0 && (
            <div className="space-y-1.5">
              {elegidos.map(t => (
                <div key={t.empleadoId} className="flex items-center gap-2 bg-[var(--sala-srf)] rounded-xl pl-3 pr-1.5 py-1.5">
                  <button onClick={() => quitar(t.empleadoId)} className="text-[var(--sala-tx3)] text-lg w-7 shrink-0" aria-label="Quitar">✕</button>
                  <p className="flex-1 min-w-0 text-[var(--sala-txt)] font-bold truncate">{nombreDe(t.empleadoId)}</p>
                  <button onClick={() => cambiarHoras(t.empleadoId, -0.5)} className="w-11 h-11 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xl font-black">−</button>
                  <span className="w-14 text-center text-[var(--sala-txt)] font-black tabular-nums">{String(t.horas).replace('.', ',')} h</span>
                  <button onClick={() => cambiarHoras(t.empleadoId, 0.5)} className="w-11 h-11 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xl font-black">+</button>
                </div>
              ))}
              <p className="text-[var(--sala-tx3)] text-xs text-right">{elegidos.length} {elegidos.length === 1 ? 'persona' : 'personas'} · {String(totalHoras).replace('.', ',')} h</p>
            </div>
          )}
          <div>
            <p className="text-[var(--sala-tx2)] text-sm font-bold mb-1.5">{elegidos.length ? 'Añadir a alguien más' : '¿Quién trabajó? Toca para añadir'}</p>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre…"
              className="w-full bg-[var(--sala-srf)] border border-[var(--sala-brd)] rounded-xl px-4 py-3 text-[var(--sala-txt)] focus:outline-none focus:border-[#4CC8A0]" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {sugerencias.map(e => (
                <button key={e.id} onClick={() => { setElegidos(l => [...l, { empleadoId: e.id, horas: 8 }]); setBusqueda('') }}
                  className="px-3 py-2 rounded-lg bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm font-bold active:scale-95 transition-transform">
                  + {e.nombre} <span className="text-[var(--sala-tx4)] font-normal text-xs">{e.tipo === 'cocina' ? 'cocina' : ''}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setPaso(3)} disabled={elegidos.length === 0} className={btnPrimario} style={gradiente}>Ver reparto →</button>
        </>
      )}

      {paso === 3 && (
        <>
          <div className="rounded-xl py-3 text-center bg-[#4CC8A0]/10 border border-[#4CC8A0]/30">
            <p className="text-[#4CC8A0] text-2xl font-black tabular-nums">{eur(total)}</p>
            <p className="text-[var(--sala-tx3)] text-xs">💶 {eur(aNumero(efectivo))} · 💳 {eur(aNumero(tarjeta))} · {String(totalHoras).replace('.', ',')} h</p>
          </div>
          <div className="space-y-1">
            {reparto.map(r => (
              <div key={r.empleadoId} className="flex items-center justify-between bg-[var(--sala-srf)] rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[var(--sala-txt)] font-bold truncate">{r.nombre}</p>
                  <p className="text-[var(--sala-tx3)] text-xs">{String(r.horas).replace('.', ',')} h</p>
                </div>
                <p className="text-[var(--sala-txt)] font-black text-lg tabular-nums">{eur(r.propina)}</p>
              </div>
            ))}
          </div>
          {guardar.isError && <p className="text-red-400 text-sm font-bold">{(guardar.error as Error).message}</p>}
          <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className={btnPrimario} style={gradiente}>
            {guardar.isPending ? 'Guardando…' : previo ? 'Guardar corrección' : 'Confirmar reparto'}
          </button>
        </>
      )}
    </div>
  )
}
