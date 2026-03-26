import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, SlotDisponible } from '../api'

// ─── Brand color ─────────────────────────────────────────────────────────────
const BRAND = '#4CC8A0'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function isoToDate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

function fmtFechaCorta(iso: string) {
  return isoToDate(iso).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function fmtFechaMes(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  // 0=Mon...6=Sun
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1
}

function dateToISO(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function googleCalendarUrl(nombre: string, fecha: string, hora: string, restaurantNombre: string) {
  const [h, m] = hora.split(':').map(Number)
  const start = isoToDate(fecha)
  start.setHours(h, m, 0, 0)
  const end = new Date(start.getTime() + 90 * 60 * 1000)
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace('.000', '')
  const title = encodeURIComponent(`Reserva en ${restaurantNombre}`)
  const details = encodeURIComponent(`Reserva a nombre de ${nombre}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i + 1 === step ? 24 : 8,
            height: 8,
            backgroundColor: i + 1 <= step ? BRAND : '#E5E7EB',
          }}
        />
      ))}
    </div>
  )
}

// ─── Calendar component ───────────────────────────────────────────────────────

function Calendar({
  selected,
  onSelect,
  minDate,
  maxDate,
}: {
  selected: string | null
  onSelect: (iso: string) => void
  minDate: string
  maxDate: string
}) {
  const today = todayISO()
  const initial = selected ? isoToDate(selected) : isoToDate(today)
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const DAY_HEADERS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 w-full max-w-sm mx-auto">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
        >
          ‹
        </button>
        <span className="font-semibold text-gray-800 capitalize">{fmtFechaMes(viewYear, viewMonth)}</span>
        <button
          onClick={nextMonth}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const iso = dateToISO(viewYear, viewMonth, day)
          const isToday = iso === today
          const isSelected = iso === selected
          const isPast = iso < minDate
          const isTooFar = iso > maxDate

          const disabled = isPast || isTooFar

          return (
            <button
              key={day}
              disabled={disabled}
              onClick={() => onSelect(iso)}
              className={`
                w-8 h-8 mx-auto rounded-full text-sm font-medium transition-all
                ${disabled ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}
                ${isSelected ? 'text-white font-bold' : ''}
                ${isToday && !isSelected ? 'ring-2 ring-green-400 ring-offset-1' : ''}
              `}
              style={
                isSelected
                  ? { backgroundColor: BRAND, color: 'white' }
                  : {}
              }
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 1: Date + pax ───────────────────────────────────────────────────────

function Step1({
  diasAntelacion,
  onNext,
}: {
  diasAntelacion: number
  onNext: (fecha: string, pax: number) => void
}) {
  const [fecha, setFecha] = useState<string | null>(null)
  const [pax, setPax] = useState<number | null>(null)

  const today = todayISO()
  const maxDate = (() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() + diasAntelacion)
    return d.toISOString().split('T')[0]
  })()

  const PAX_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1 text-center">¿Para cuándo y cuántas personas?</h2>
      <p className="text-gray-500 text-sm text-center mb-6">Selecciona fecha y número de comensales</p>

      <Calendar
        selected={fecha}
        onSelect={setFecha}
        minDate={today}
        maxDate={maxDate}
      />

      {/* Pax selector */}
      <div className="mt-6">
        <p className="text-sm font-medium text-gray-700 mb-3 text-center">Número de personas</p>
        <div className="flex flex-wrap justify-center gap-2">
          {PAX_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setPax(n)}
              className="w-11 h-11 rounded-full text-sm font-semibold transition-all border-2"
              style={
                pax === n
                  ? { backgroundColor: BRAND, borderColor: BRAND, color: 'white' }
                  : { borderColor: '#E5E7EB', color: '#374151', backgroundColor: 'white' }
              }
            >
              {n === 8 ? '8+' : n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <button
          disabled={!fecha || !pax}
          onClick={() => fecha && pax && onNext(fecha, pax)}
          className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND }}
        >
          Ver disponibilidad →
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Time slot selection ──────────────────────────────────────────────

function Step2({
  slug,
  fecha,
  pax,
  restaurantNombre,
  onNext,
  onBack,
}: {
  slug: string
  fecha: string
  pax: number
  restaurantNombre: string
  onNext: (hora: string) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const { data: slots = [], isLoading, isError } = useQuery({
    queryKey: ['slots', slug, fecha, pax],
    queryFn: () => api.reservas.getSlots(slug, fecha, pax),
  })

  const availableSlots = slots.filter((s: SlotDisponible) => s.disponible)
  const unavailableSlots = slots.filter((s: SlotDisponible) => !s.disponible)

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1 transition-colors">
        ← Cambiar fecha
      </button>

      <div className="text-center mb-6">
        <div className="text-sm font-medium text-gray-500 mb-1">{restaurantNombre}</div>
        <h2 className="text-xl font-bold text-gray-800 capitalize">{fmtFechaCorta(fecha)}</h2>
        <p className="text-gray-500 text-sm">{pax} {pax === 1 ? 'persona' : 'personas'}</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-center text-red-500 text-sm">Error al cargar horarios. Inténtalo de nuevo.</p>
      ) : slots.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No hay servicio este día.</p>
          <button onClick={onBack} className="mt-3 text-sm font-medium" style={{ color: BRAND }}>
            Elige otra fecha
          </button>
        </div>
      ) : (
        <>
          {availableSlots.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No hay disponibilidad para {pax} {pax === 1 ? 'persona' : 'personas'} este día.</p>
              <button onClick={onBack} className="mt-3 text-sm font-medium" style={{ color: BRAND }}>
                Elige otra fecha
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600 mb-3">Selecciona hora</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {availableSlots.map((s: SlotDisponible) => (
                  <button
                    key={s.hora}
                    onClick={() => setSelected(s.hora)}
                    className="py-3 rounded-xl text-sm font-semibold border-2 transition-all"
                    style={
                      selected === s.hora
                        ? { backgroundColor: BRAND, borderColor: BRAND, color: 'white' }
                        : { borderColor: '#E5E7EB', color: '#374151', backgroundColor: 'white' }
                    }
                  >
                    {s.hora}
                  </button>
                ))}
              </div>
            </>
          )}

          {unavailableSlots.length > 0 && availableSlots.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 mb-2 mt-4">Sin disponibilidad</p>
              <div className="grid grid-cols-3 gap-2">
                {unavailableSlots.map((s: SlotDisponible) => (
                  <div
                    key={s.hora}
                    className="py-3 rounded-xl text-sm font-semibold border-2 border-gray-100 text-gray-300 text-center cursor-not-allowed"
                  >
                    {s.hora}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-8">
            <button
              disabled={!selected}
              onClick={() => selected && onNext(selected)}
              className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND }}
            >
              Continuar →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Step 3: Customer data form ───────────────────────────────────────────────

function Step3({
  fecha,
  hora,
  pax,
  onNext,
  onBack,
}: {
  fecha: string
  hora: string
  pax: number
  onNext: (data: { nombre: string; telefono: string; email: string; notas: string }) => void
  onBack: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')

  const resumenFecha = `${fmtFechaCorta(fecha)} · ${hora} · ${pax} ${pax === 1 ? 'persona' : 'personas'}`

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent transition-all"

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1 transition-colors">
        ← Cambiar hora
      </button>

      {/* Summary */}
      <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-6 text-sm text-gray-600 font-medium text-center capitalize">
        {resumenFecha}
      </div>

      <h2 className="text-xl font-bold text-gray-800 mb-5 text-center">Tus datos</h2>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Nombre *</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Teléfono *</label>
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+34 612 345 678"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Email <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Notas / petición especial <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Alergias, cumpleaños, silla para bebé..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      <div className="mt-8">
        <button
          disabled={!nombre.trim() || !telefono.trim()}
          onClick={() => onNext({ nombre: nombre.trim(), telefono: telefono.trim(), email, notas })}
          className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: BRAND }}
        >
          Confirmar reserva →
        </button>
      </div>
    </div>
  )
}

// ─── Step 4: Confirmation ─────────────────────────────────────────────────────

function Step4({
  restaurantNombre,
  fecha,
  hora,
  pax,
  nombre,
}: {
  restaurantNombre: string
  fecha: string
  hora: string
  pax: number
  nombre: string
}) {
  const calUrl = googleCalendarUrl(nombre, fecha, hora, restaurantNombre)

  return (
    <div className="text-center">
      {/* Animated checkmark */}
      <div className="flex justify-center mb-6">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ backgroundColor: BRAND }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10" style={{ stroke: 'white', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <polyline points="20 6 9 17 4 12" className="animate-[drawCheck_0.4s_ease-in-out_0.1s_both]" style={{
              strokeDasharray: 20,
              strokeDashoffset: 0,
            }} />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Reserva confirmada!</h2>
      <p className="text-gray-500 text-sm mb-6">Te esperamos en {restaurantNombre}</p>

      {/* Summary card */}
      <div className="bg-gray-50 rounded-2xl p-5 text-left mb-6 space-y-2.5">
        <div className="flex gap-3 items-start">
          <span className="text-lg">📅</span>
          <div>
            <div className="text-sm font-semibold text-gray-800 capitalize">{fmtFechaCorta(fecha)}</div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-lg">🕐</span>
          <span className="text-sm font-semibold text-gray-800">{hora}</span>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-lg">👥</span>
          <span className="text-sm font-semibold text-gray-800">{pax} {pax === 1 ? 'persona' : 'personas'}</span>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-lg">👤</span>
          <span className="text-sm font-semibold text-gray-800">{nombre}</span>
        </div>
      </div>

      <a
        href={calUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-3.5 rounded-2xl border-2 text-sm font-semibold transition-all hover:bg-gray-50"
        style={{ borderColor: BRAND, color: BRAND }}
      >
        + Añadir al calendario
      </a>

      <p className="text-xs text-gray-400 mt-5">
        ¿Necesitas cancelar? Llámanos o contáctanos directamente.
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReservaPublicaPage() {
  const { slug } = useParams<{ slug: string }>()
  const [step, setStep] = useState(1)
  const [fecha, setFecha] = useState('')
  const [pax, setPax] = useState(2)
  const [hora, setHora] = useState('')
  const [confirmData, setConfirmData] = useState<{ nombre: string; telefono: string; email: string; notas: string } | null>(null)

  const { data: config, isLoading, isError } = useQuery({
    queryKey: ['publicConfig', slug],
    queryFn: () => api.reservas.getPublicConfig(slug!),
    enabled: !!slug,
    retry: 1,
  })

  const confirmMut = useMutation({
    mutationFn: (data: { nombre: string; telefono: string; email: string; notas: string }) =>
      api.reservas.createPublica({
        slug: slug!,
        fecha,
        hora,
        pax,
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email || undefined,
        notas: data.notas || undefined,
      }),
    onSuccess: () => setStep(4),
  })

  const handleStep1 = (f: string, p: number) => {
    setFecha(f)
    setPax(p)
    setStep(2)
  }

  const handleStep2 = (h: string) => {
    setHora(h)
    setStep(3)
  }

  const handleStep3 = (data: { nombre: string; telefono: string; email: string; notas: string }) => {
    setConfirmData(data)
    confirmMut.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Cargando...</div>
      </div>
    )
  }

  if (isError || !config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🍽️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Restaurante no encontrado</h2>
          <p className="text-gray-500 text-sm">La URL de reservas no es válida o el restaurante no está disponible.</p>
        </div>
      </div>
    )
  }

  if (!config.activo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{config.restaurantNombre}</h2>
          <p className="text-gray-500 text-sm">Las reservas online no están disponibles en este momento.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 text-center">
        <div className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">Reservas</div>
        <div className="text-lg font-bold text-gray-800">{config.restaurantNombre}</div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {step < 4 && <StepIndicator step={step} total={3} />}

          {step === 1 && (
            <Step1
              diasAntelacion={config.diasAntelacion}
              onNext={handleStep1}
            />
          )}
          {step === 2 && (
            <Step2
              slug={slug!}
              fecha={fecha}
              pax={pax}
              restaurantNombre={config.restaurantNombre}
              onNext={handleStep2}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <>
              {confirmMut.isError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">
                  Error al confirmar la reserva. Por favor, inténtalo de nuevo.
                </div>
              )}
              <Step3
                fecha={fecha}
                hora={hora}
                pax={pax}
                onNext={handleStep3}
                onBack={() => setStep(2)}
              />
              {confirmMut.isPending && (
                <div className="mt-4 text-center text-sm text-gray-400">Confirmando reserva...</div>
              )}
            </>
          )}
          {step === 4 && confirmData && (
            <Step4
              restaurantNombre={config.restaurantNombre}
              fecha={fecha}
              hora={hora}
              pax={pax}
              nombre={confirmData.nombre}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center text-xs text-gray-300">
        Powered by OidoOps
      </div>
    </div>
  )
}
