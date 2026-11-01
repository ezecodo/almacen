import { useEffect, useRef, useState } from 'react'
import { api, FotoPase, TipoFicha } from '../api'
import { comprimirFoto } from '../lib/imagen'

// Paso a paso del emplate a pantalla completa: lo que se mira con el plato delante, en pleno servicio.
// Una pantalla por paso (foto si la tiene, y su texto en grande) y al final el plato terminado.
// Botones grandes, tocar la foto o deslizar para pasar, y la pantalla no se apaga mientras está abierto.

// Se bajan todas al abrir para que pasar de paso sea instantáneo
export function useFotosPase(tipo: TipoFicha, id: number, fotos: FotoPase[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const clave = fotos.map(f => f.foto).join(',')
  useEffect(() => {
    let viva = true
    const creadas: string[] = []
    fotos.forEach(f => {
      api.cocina.fotoPase(tipo, id, f.foto).then(b => {
        if (!viva) return
        const u = URL.createObjectURL(b)
        creadas.push(u)
        setUrls(prev => ({ ...prev, [f.foto]: u }))
      }).catch(() => {})
    })
    return () => { viva = false; creadas.forEach(u => URL.revokeObjectURL(u)) }
  }, [tipo, id, clave])
  return urls
}

// El teléfono no se apaga con las manos ocupadas (solo funciona con https)
function usePantallaEncendida() {
  useEffect(() => {
    let viva = true
    let cerrojo: { release: () => Promise<void> } | undefined
    const pedir = async () => {
      try {
        const c = await navigator.wakeLock?.request('screen')
        if (viva) cerrojo = c
        else await c?.release()
      } catch {}
    }
    const alVolver = () => { if (document.visibilityState === 'visible') pedir() }
    pedir()
    document.addEventListener('visibilitychange', alVolver)
    return () => { viva = false; document.removeEventListener('visibilitychange', alVolver); cerrojo?.release().catch(() => {}) }
  }, [])
}

interface Props {
  tipo: TipoFicha; id: number; nombre: string
  pasos: string[]; fotos: FotoPase[]
  fotoFinal: string | null // el plato terminado: la última pantalla
  puedeFotos: boolean; onCambio: () => void; onCerrar: () => void
}

export default function PasoAPaso({ tipo, id, nombre, pasos, fotos, fotoFinal, puedeFotos, onCambio, onCerrar }: Props) {
  usePantallaEncendida()
  const urls = useFotosPase(tipo, id, fotos)
  const total = pasos.length + (fotoFinal ? 1 : 0)
  const [i, setI] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const inicioX = useRef<number | null>(null)
  const actual = Math.min(i, total - 1)
  const esFinal = actual >= pasos.length
  const foto = fotos.find(f => f.paso === actual)
  const url = esFinal ? fotoFinal : foto ? urls[foto.foto] : null

  const ir = (d: number) => { setError(''); setI(Math.max(0, Math.min(total - 1, actual + d))) }
  const alSoltar = (x: number) => {
    if (inicioX.current === null) return
    const dx = x - inicioX.current
    inicioX.current = null
    if (Math.abs(dx) >= Math.max(60, window.innerWidth * 0.12)) ir(dx < 0 ? 1 : -1)
  }
  const subir = async (file: File) => {
    setError(''); setSubiendo(true)
    try { await api.cocina.subirFotoPase(tipo, id, actual, await comprimirFoto(file, 1600)); onCambio() }
    catch (e) { setError((e as Error).message) }
    finally { setSubiendo(false) }
  }
  const quitar = async () => {
    setError('')
    try { await api.cocina.quitarFotoPase(tipo, id, actual); onCambio() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a1220] text-slate-100 flex flex-col select-none"
      onTouchStart={e => { inicioX.current = e.touches[0].clientX }}
      onTouchEnd={e => alSoltar(e.changedTouches[0].clientX)}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={onCerrar} aria-label="Cerrar" className="w-12 h-12 rounded-xl bg-white/10 text-2xl shrink-0">✕</button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-slate-400 truncate">{nombre}</p>
          <p className="text-2xl font-black text-[#4CC8A0]">{esFinal ? 'Así sale' : `Paso ${actual + 1} de ${pasos.length}`}</p>
        </div>
      </div>
      <div className="flex gap-1.5 px-4 pb-3">
        {Array.from({ length: total }, (_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k <= actual ? 'bg-[#4CC8A0]' : 'bg-white/15'}`} />)}
      </div>

      {/* Tocar la mitad derecha adelanta, la izquierda vuelve */}
      <div className="relative flex-1 min-h-0 mx-4 rounded-2xl overflow-hidden bg-black/40 flex items-center justify-center"
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); ir(e.clientX - r.left > r.width / 2 ? 1 : -1) }}>
        {url
          ? <img src={url} alt="" className="w-full h-full object-contain" />
          : <p className="px-6 text-center text-3xl font-bold leading-snug">{esFinal ? '' : pasos[actual]}</p>}
      </div>
      {url && !esFinal && <p className="px-5 pt-4 text-2xl font-bold leading-snug text-center">{pasos[actual]}</p>}

      {puedeFotos && !esFinal && (
        <div className="flex items-center justify-center gap-5 px-4 pt-3">
          <label className="text-base font-bold text-[#4B9EDF] py-2 cursor-pointer">
            {subiendo ? 'Subiendo…' : foto ? '📷 Cambiar foto' : '📷 Foto de este paso'}
            <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={ev => { const f = ev.target.files?.[0]; if (f) subir(f); ev.target.value = '' }} />
          </label>
          {foto && <button onClick={quitar} className="text-sm text-slate-400 py-2">Quitar</button>}
        </div>
      )}
      {error && <p className="px-4 pt-1 text-center text-sm text-red-400">{error}</p>}

      <div className="flex gap-3 p-4">
        <button onClick={() => ir(-1)} disabled={actual === 0} className="w-24 h-16 rounded-2xl bg-white/10 text-2xl font-black disabled:opacity-30">←</button>
        {actual < total - 1
          ? <button onClick={() => ir(1)} className="flex-1 h-16 rounded-2xl bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e] text-xl font-black">Siguiente →</button>
          : <button onClick={onCerrar} className="flex-1 h-16 rounded-2xl bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e] text-xl font-black">✓ Listo</button>}
      </div>
    </div>
  )
}
