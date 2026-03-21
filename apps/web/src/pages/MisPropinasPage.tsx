import { useState, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, Empleado, MiTurno } from '../api'

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
}

// Período: del 25 del mes anterior al 24 del actual
function getPeriodo(offset = 0): { desde: string; hasta: string; label: string } {
  const hoy = new Date()
  const mes = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1)
  const desde = new Date(mes.getFullYear(), mes.getMonth() - 1, 25)
  const hasta  = new Date(mes.getFullYear(), mes.getMonth(), 24)
  const label = mes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return {
    desde: desde.toISOString().slice(0, 10),
    hasta:  hasta.toISOString().slice(0, 10),
    label:  label.charAt(0).toUpperCase() + label.slice(1),
  }
}

// ── PIN screen ────────────────────────────────────────────────────────────────
function PinScreen({ onAuth }: { onAuth: (emp: Empleado) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const auth = useMutation({
    mutationFn: (p: string) => api.empleados.auth(p),
    onSuccess: (emp) => onAuth(emp),
    onError: () => {
      setError(true)
      setPin('')
      setTimeout(() => setError(false), 1500)
    },
  })

  const handleKey = (k: string) => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) auth.mutate(next)
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen bg-[#1a2235] flex flex-col items-center justify-center px-6">
      <img src="/oidoops.svg" alt="OidoOps" className="h-10 object-contain mb-10" />

      <div className="w-full max-w-xs space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-1">Introduce tu PIN</h2>
          <p className="text-gray-400 text-sm">Para ver tus propinas</p>
        </div>

        {/* Puntos PIN */}
        <div className={`flex justify-center gap-4 transition-all ${error ? 'animate-shake' : ''}`}>
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
              pin.length > i
                ? error ? 'bg-red-500 border-red-500' : 'bg-cyan-400 border-cyan-400'
                : 'border-gray-600'
            }`} />
          ))}
        </div>

        {/* Teclado */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k, i) => k === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => handleKey(k)}
              disabled={auth.isPending}
              className={`h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${
                k === '⌫'
                  ? 'text-gray-400 bg-gray-800 hover:bg-gray-700'
                  : 'text-white bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {error && <p className="text-center text-red-400 text-sm">PIN incorrecto</p>}
      </div>
    </div>
  )
}

// ── Vista propinas ─────────────────────────────────────────────────────────────
function MisPropinas({ empleado, onLogout }: { empleado: Empleado; onLogout: () => void }) {
  const [periodoOffset, setPeriodoOffset] = useState(0)
  const periodo = useMemo(() => getPeriodo(periodoOffset), [periodoOffset])

  const { data: turnos, isLoading } = useQuery({
    queryKey: ['mis-turnos', empleado.id, periodo.desde, periodo.hasta],
    queryFn: () => api.propinas.misTurnos(empleado.id, periodo.desde, periodo.hasta),
  })

  const totalPropina = turnos?.reduce((s, t) => s + t.propina, 0) ?? 0
  const totalHoras   = turnos?.reduce((s, t) => s + t.horas,   0) ?? 0

  return (
    <div className="min-h-screen bg-[#1a2235]">
      {/* Header */}
      <header className="px-5 pt-8 pb-6 flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm">Hola,</p>
          <h1 className="text-2xl font-bold text-white">{empleado.nombre.split(' ')[0]}</h1>
        </div>
        <button onClick={onLogout} className="text-gray-500 text-sm hover:text-gray-300 mt-1">
          Salir
        </button>
      </header>

      {/* Selector de período */}
      <div className="px-5 mb-5 flex items-center gap-3">
        <button
          onClick={() => setPeriodoOffset(o => o - 1)}
          className="w-9 h-9 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center justify-center text-lg"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-semibold">{periodo.label}</p>
          <p className="text-gray-500 text-xs">25 {new Date(periodo.desde).toLocaleDateString('es-ES',{day:'2-digit',month:'short'})} → 24 {new Date(periodo.hasta).toLocaleDateString('es-ES',{day:'2-digit',month:'short'})}</p>
        </div>
        <button
          onClick={() => setPeriodoOffset(o => o + 1)}
          disabled={periodoOffset >= 0}
          className="w-9 h-9 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center justify-center text-lg disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {/* Totales */}
      <div className="px-5 mb-5 grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-[#4B9EDF] to-[#4CC8A0] rounded-2xl p-5">
          <p className="text-white/70 text-xs font-medium mb-1">Total propinas</p>
          <p className="text-white text-2xl font-bold">{formatEur(totalPropina)}</p>
        </div>
        <div className="bg-gray-800 rounded-2xl p-5">
          <p className="text-gray-400 text-xs font-medium mb-1">Horas trabajadas</p>
          <p className="text-white text-2xl font-bold">{totalHoras}h</p>
          <p className="text-gray-500 text-xs mt-1">{turnos?.length ?? 0} días</p>
        </div>
      </div>

      {/* Aviso */}
      <div className="px-5 mb-5">
        <p className="text-yellow-500/70 text-xs text-center">
          ⚠ El importe total está sujeto a posibles variaciones
        </p>
      </div>

      {/* Lista de turnos */}
      <div className="px-5 pb-10">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Detalle por día</h3>

        {isLoading && (
          <div className="text-center text-gray-500 py-10">Cargando...</div>
        )}

        {!isLoading && (!turnos || turnos.length === 0) && (
          <div className="text-center text-gray-600 py-10">
            <p className="text-4xl mb-3">—</p>
            <p className="text-sm">Sin propinas en este período</p>
          </div>
        )}

        <div className="space-y-3">
          {turnos?.map((t: MiTurno) => (
            <div key={t.id} className="bg-gray-800 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-medium text-sm">{fechaCorta(t.fecha)}</p>
                <p className="text-gray-400 text-xs mt-0.5">{t.restaurante} · {t.horas}h</p>
              </div>
              <div className="text-right">
                <p className="text-[#4CC8A0] font-bold text-lg">{formatEur(t.propina)}</p>
                <p className="text-gray-600 text-xs">de {formatEur(t.totalDia)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MisPropinasPage() {
  const [empleado, setEmpleado] = useState<Empleado | null>(null)

  if (!empleado) return <PinScreen onAuth={setEmpleado} />
  return <MisPropinas empleado={empleado} onLogout={() => setEmpleado(null)} />
}
