import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type EquipoLecciones } from '../api'
import { LECCIONES } from './Asistente'

// Pestaña "🎓 Equipo" del panel 💼: qué lecciones del asistente hizo cada uno del personal de sala
// de este local (fijos y rotativos). Solo mirar: la idea es poder decirle a alguien "hazte la de la
// cuenta ahora que está tranquilo".

const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

function hace(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return fmtDia(iso)
}

// Solo cuentan las lecciones que existen hoy (si se quita una, no queda en 11/10)
const hechasDe = (e: EquipoLecciones) => e.lecciones.filter(l => LECCIONES.some(x => x.id === l.leccion))

export default function EquipoLeccionesSala() {
  const { data: equipo = [], isLoading, error } = useQuery({ queryKey: ['lecciones-equipo'], queryFn: api.lecciones.equipo })
  const [abierto, setAbierto] = useState<number | null>(null)
  const total = LECCIONES.length

  if (isLoading) return <p className="text-[var(--sala-tx3)] text-sm text-center py-8">Cargando…</p>
  if (error) return <p className="text-red-400 text-sm text-center py-8">{(error as Error).message}</p>
  if (equipo.length === 0) return <p className="text-[var(--sala-tx3)] text-sm text-center py-8">No hay personal de sala en este local.</p>

  // Primero a quien más le falta
  const lista = [...equipo].sort((a, b) => hechasDe(a).length - hechasDe(b).length || a.nombre.localeCompare(b.nombre, 'es'))
  const completos = equipo.filter(e => hechasDe(e).length >= total).length
  const sinEmpezar = equipo.filter(e => hechasDe(e).length === 0).length

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: equipo.length, label: 'en sala' },
          { n: completos, label: 'las hicieron todas', color: 'text-[#4CC8A0]' },
          { n: sinEmpezar, label: 'sin empezar', color: sinEmpezar ? 'text-amber-400' : undefined },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-[var(--sala-srf)] px-3 py-2.5 text-center">
            <p className={`text-2xl font-black tabular-nums ${c.color ?? 'text-[var(--sala-txt)]'}`}>{c.n}</p>
            <p className="text-[var(--sala-tx3)] text-[11px] leading-tight">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="text-[var(--sala-tx3)] text-xs leading-snug">
        Lecciones del asistente (perfil → «Aprender a usar OidoOps»). Se hacen en práctica: no tocan mesas ni caja.
      </p>

      {lista.map(e => {
        const hechas = hechasDe(e)
        const ids = new Set(hechas.map(l => l.leccion))
        const ultima = hechas.reduce<string | null>((u, l) => (!u || l.completadaAt > u ? l.completadaAt : u), null)
        const pct = Math.round((hechas.length / total) * 100)
        const todas = hechas.length >= total
        const verDetalle = abierto === e.id
        return (
          <div key={e.id} className="rounded-2xl bg-[var(--sala-srf)] overflow-hidden">
            <button onClick={() => setAbierto(verDetalle ? null : e.id)} className="w-full px-4 py-3 text-left active:opacity-80">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-[var(--sala-txt)] font-bold">{e.nombre}</span>
                {e.rol === 'encargado' && <span className="shrink-0 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-[var(--sala-btn2)] text-[var(--sala-tx2)]">Encargado</span>}
                {e.restaurantId === null && <span className="shrink-0 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-[var(--sala-btn2)] text-[var(--sala-tx2)]">Rotativo</span>}
                <span className={`shrink-0 font-black tabular-nums ${todas ? 'text-[#4CC8A0]' : hechas.length === 0 ? 'text-amber-400' : 'text-[var(--sala-txt)]'}`}>
                  {todas ? '✓ ' : ''}{hechas.length}/{total}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--sala-btn2)] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #4B9EDF, #4CC8A0)' }} />
              </div>
              <p className="text-[var(--sala-tx3)] text-[11px] mt-1.5">
                {ultima ? `Última lección ${hace(ultima)}` : 'Todavía no hizo ninguna'}
                {!todas && hechas.length > 0 && ` · le faltan ${total - hechas.length}`}
              </p>
            </button>
            {verDetalle && (
              <div className="px-4 pb-3 space-y-1 border-t border-[var(--sala-brd)] pt-2">
                {LECCIONES.map(l => {
                  const h = hechas.find(x => x.leccion === l.id)
                  return (
                    <div key={l.id} className="flex items-center gap-2 text-sm">
                      <span className={`w-5 text-center ${ids.has(l.id) ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx4)]'}`}>{ids.has(l.id) ? '✓' : '○'}</span>
                      <span className={`flex-1 min-w-0 truncate ${ids.has(l.id) ? 'text-[var(--sala-tx1)]' : 'text-[var(--sala-tx3)]'}`}>{l.icono} {l.titulo}</span>
                      {h && <span className="shrink-0 text-[var(--sala-tx4)] text-[11px]">{fmtDia(h.completadaAt)}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
