import { useEffect, useSyncExternalStore } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useEsModoLocal } from '../lib/instalacion'
import { alCambiarDeDestino, conexionActual, corteSimulado, reintentarAhora, suscribirConexion, vigilarConexion } from '../lib/conexion'

// Envuelve las pantallas de sala. Cuando la app deja de llegar al servidor tapa todo con un aviso,
// sin desmontar lo de abajo: lo que el camarero tenía a medias sigue ahí cuando vuelve la conexión.
export default function SinConexion() {
  const queryClient = useQueryClient()
  const { caida, desde, local } = useSyncExternalStore(suscribirConexion, conexionActual)
  // Modo local de dos formas: la app instalada hablando con la Box, o la web servida por la propia Box
  const servidaPorLaBox = useEsModoLocal()
  const modoLocal = local || servidaPorLaBox

  useEffect(() => vigilarConexion(), [])
  // Al volver la conexión o cambiar entre nube y Box, lo que hay en pantalla puede estar viejo
  useEffect(() => alCambiarDeDestino(() => { void queryClient.invalidateQueries() }), [queryClient])

  return (
    <>
      <Outlet />
      {/* Dentro de la Box: que nadie dude de que está comandando sin internet. No tapa ni recibe toques. */}
      {modoLocal && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[900] flex flex-col items-center">
          <div className="h-1 w-full bg-amber-400" />
          <span className="rounded-b-lg bg-amber-400 px-3 py-0.5 text-[11px] font-black uppercase tracking-wide text-slate-900 shadow">
            Modo local · {corteSimulado() ? 'corte simulado' : 'sin internet'}
          </span>
        </div>
      )}
      {caida && (
        <div role="alert" className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0f172a] px-8 text-center">
          <svg viewBox="0 0 24 24" className="mb-5 h-16 w-16 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8.5a15 15 0 0 1 4.2-2.7M22 8.5a15 15 0 0 0-11-3.4M5.5 12.3a10 10 0 0 1 3-1.9M18.5 12.3a10 10 0 0 0-4.6-2.4M9 16a4.5 4.5 0 0 1 6 0" />
            <circle cx="12" cy="19.5" r="0.6" fill="currentColor" />
            <path d="M3 3l18 18" />
          </svg>
          <p className="mb-2 text-2xl font-black text-white">Sin conexión</p>
          <p className="mb-6 max-w-xs text-base text-slate-300">
            La app no llega a OidoOps{desde ? ` desde las ${new Date(desde).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}. Hasta que vuelva no se puede comandar ni cobrar.
          </p>
          <div className="mb-6 max-w-xs space-y-2 rounded-2xl bg-white/5 px-5 py-4 text-left text-sm text-slate-300">
            <p>· Comprueba que el móvil sigue en el WiFi del local.</p>
            <p>· Lo que ya comandaste está guardado.</p>
            <p>· No cierres la app: lo que tenías a medias sigue aquí cuando vuelva.</p>
          </div>
          <p className="mb-4 flex items-center gap-2 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-[#4CC8A0]" />
            Reintentando sola…
          </p>
          <button onClick={reintentarAhora}
            className="rounded-2xl bg-white/10 px-6 py-3 text-base font-bold text-white active:scale-95 transition-transform">
            Reintentar ahora
          </button>
        </div>
      )}
    </>
  )
}
