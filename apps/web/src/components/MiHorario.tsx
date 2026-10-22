import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// "Mi horario": la semana del empleado que entró con su PIN, día por día, con ‹ › para pasar de semana.
// Sale en el perfil de la sala y en Mis propinas. Toma los colores de la sala (variables --sala-*) y,
// fuera de ella, los oscuros de Mis propinas.
const DIA = 24 * 60 * 60 * 1000

function hoyMadrid() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}
function lunesDe(iso: string, semanas: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  const dow = d.getUTCDay()
  return new Date(d.getTime() - (dow === 0 ? 6 : dow - 1) * DIA + semanas * 7 * DIA).toISOString().slice(0, 10)
}
function horas(ini: string, fin: string) {
  const [a, b] = ini.split(':').map(Number), [c, d] = fin.split(':').map(Number)
  let m = c * 60 + d - (a * 60 + b)
  if (m <= 0) m += 24 * 60
  return Math.round(m / 6) / 10
}

export default function MiHorario({ restaurantId }: { restaurantId?: number }) {
  const [semana, setSemana] = useState(0)
  const hoy = hoyMadrid()
  const desde = lunesDe(hoy, semana)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mi-horario', desde],
    queryFn: () => api.staffing.miHorario(desde),
  })
  const turnos = data?.turnos ?? []
  const dias = Array.from({ length: 7 }, (_, i) => new Date(new Date(`${desde}T00:00:00Z`).getTime() + i * DIA).toISOString().slice(0, 10))
  const total = turnos.filter(t => t.estado !== 'ausente').reduce((h, t) => h + horas(t.horaInicio, t.horaFin), 0)
  const etiqueta = semana === 0 ? 'Esta semana' : semana === 1 ? 'La semana que viene' : semana === -1 ? 'La semana pasada' : `Semana del ${new Date(`${desde}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
  const otroLocal = turnos.some(t => restaurantId != null && t.restaurant.id !== restaurantId)

  return (
    <div className="rounded-2xl bg-[var(--sala-srf,#243049)] p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[var(--sala-txt,#fff)] text-sm font-bold">Mi horario</p>
          <p className="text-[var(--sala-tx3,#9ca3af)] text-[11px]">{etiqueta}{turnos.length ? ` · ${Math.round(total * 10) / 10} h` : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSemana(s => Math.max(-1, s - 1))} disabled={semana <= -1} aria-label="Semana anterior"
            className="w-9 h-9 grid place-items-center rounded-xl text-[var(--sala-tx2,#d1d5db)] bg-[var(--sala-btn2,#1a2235)] disabled:opacity-30 text-lg">‹</button>
          <button onClick={() => setSemana(s => Math.min(4, s + 1))} disabled={semana >= 4} aria-label="Semana siguiente"
            className="w-9 h-9 grid place-items-center rounded-xl text-[var(--sala-tx2,#d1d5db)] bg-[var(--sala-btn2,#1a2235)] disabled:opacity-30 text-lg">›</button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[var(--sala-tx4,#6b7280)] text-sm text-center py-3">Cargando…</p>
      ) : isError ? (
        <p className="text-[var(--sala-tx4,#6b7280)] text-sm text-center py-3">No se pudo cargar el horario</p>
      ) : !turnos.length ? (
        <p className="text-[var(--sala-tx3,#9ca3af)] text-sm text-center py-3">Todavía no hay turnos cargados para esta semana</p>
      ) : (
        <div className="space-y-1">
          {dias.map(dia => {
            const delDia = turnos.filter(t => t.fecha.startsWith(dia))
            const esHoy = dia === hoy
            const pasado = dia < hoy
            const nombre = new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
            return (
              <div key={dia} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${esHoy ? 'ring-2 ring-[#4CC8A0]' : ''} ${pasado ? 'opacity-50' : ''}`}>
                <span className={`w-14 shrink-0 text-xs font-bold capitalize ${esHoy ? 'text-[#4CC8A0]' : 'text-[var(--sala-tx2,#d1d5db)]'}`}>{esHoy ? 'Hoy' : nombre}</span>
                {delDia.length === 0 ? (
                  <span className="text-[var(--sala-tx4,#6b7280)] text-sm">Libre</span>
                ) : (
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {delDia.map(t => (
                      <div key={t.id} className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-5 rounded-full shrink-0" style={{ background: t.estado === 'ausente' ? '#ef4444' : (t.tipo?.color ?? '#4CC8A0') }} />
                        <span className={`text-sm font-semibold tabular-nums ${t.estado === 'ausente' ? 'line-through text-[var(--sala-tx4,#6b7280)]' : 'text-[var(--sala-txt,#fff)]'}`}>
                          {t.horaInicio}–{t.horaFin}
                        </span>
                        <span className="text-[var(--sala-tx3,#9ca3af)] text-xs truncate">
                          {t.estado === 'ausente' ? 'Ausente' : (otroLocal || restaurantId == null ? t.restaurant.nombre : t.tipo?.nombre ?? `${horas(t.horaInicio, t.horaFin)} h`)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
