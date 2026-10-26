import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Pedido, PedidoLinea } from '../api'
import { comprimirFoto } from '../lib/imagen'
import AlbaranFotos from './AlbaranFotos'

// Pestaña "📦 Pedidos" del panel 💼: llega lo que el dueño pidió en /admin/pedidos y el encargado
// lo coteja con el albarán. Por defecto cada línea llegó entera: solo se toca lo que vino distinto.
// Sin precios (el encargado coteja cantidades; los importes son cosa de la oficina).

const cant = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

function plural(palabra: string, n: number) {
  const p = palabra.toLowerCase()
  if (n === 1) return p
  if (/[aeiouáéó]$/.test(p)) return p + 's'
  if (/[lrnd]$/.test(p)) return p + 'es'
  return p
}
const enFormato = (n: number, formato: string | null, unidad: string) => `${cant(n)} ${plural(formato ?? unidad, n)}`
const descFormato = (formato: string | null, upf: number, unidad: string) =>
  formato ? `${formato.toLowerCase()} de ${cant(upf)} ${plural(unidad, upf)}` : null

type Incidencia = PedidoLinea['incidencia']
const INCIDENCIAS: { key: NonNullable<Incidencia>; label: string }[] = [
  { key: 'falta', label: 'Faltó' }, { key: 'roto', label: 'Llegó roto' }, { key: 'otro', label: 'Otro' },
]
interface Marca { recibida: number; incidencia: Incidencia; nota: string }

const conDiferencia = (l: PedidoLinea, m: Marca) => m.recibida !== l.cantidad || m.incidencia !== null

function textoMarca(l: PedidoLinea, m: Marca) {
  if (!conDiferencia(l, m)) return '✓ Llegó'
  const partes = [m.recibida === 0 ? 'No llegó' : m.recibida !== l.cantidad ? `Llegaron ${enFormato(m.recibida, l.formato, l.unidad)}` : null]
  if (m.incidencia && !(m.incidencia === 'falta' && m.recibida < l.cantidad)) partes.push(INCIDENCIAS.find(i => i.key === m.incidencia)!.label)
  if (m.nota) partes.push(m.nota)
  return '⚠ ' + partes.filter(Boolean).join(' · ')
}

function Recepcion({ pedido, onVolver }: { pedido: Pedido; onVolver: () => void }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const yaRecibido = pedido.estado.startsWith('recibido')
  const [marcas, setMarcas] = useState<Record<number, Marca>>(() => Object.fromEntries(pedido.lineas.map(l => [l.id, {
    recibida: l.cantidadRecibida ?? l.cantidad, incidencia: l.incidencia, nota: l.notaRecepcion ?? '',
  }])))
  const [abierta, setAbierta] = useState<number | null>(null)
  const [nota, setNota] = useState(pedido.notaRecepcion ?? '')
  const [fotos, setFotos] = useState(pedido.albaranFotos)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  const marcar = (id: number, cambio: Partial<Marca>) => setMarcas(prev => ({ ...prev, [id]: { ...prev[id], ...cambio } }))
  const invalidar = () => qc.invalidateQueries({ queryKey: ['pedidos-recepcion', pedido.restaurantId] })

  // La foto sube en el momento: si se cierra el panel a medias, no se pierde
  const agregarFotos = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    setSubiendo(true)
    try {
      for (const file of Array.from(files)) {
        const r = await api.pedidos.subirFoto(pedido.id, await comprimirFoto(file))
        setFotos(r.albaranFotos)
      }
      invalidar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto')
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const quitarFoto = useMutation({
    mutationFn: (n: number) => api.pedidos.quitarFoto(pedido.id, n),
    onSuccess: r => { setFotos(r.albaranFotos); invalidar() },
    onError: (e: Error) => setError(e.message),
  })

  const cerrar = useMutation({
    mutationFn: () => api.pedidos.recibir(pedido.id, {
      nota: nota.trim(),
      lineas: pedido.lineas.map(l => ({ id: l.id, cantidadRecibida: marcas[l.id].recibida, incidencia: marcas[l.id].incidencia, nota: marcas[l.id].nota.trim() || null })),
    }),
    onSuccess: () => { invalidar(); onVolver() },
    onError: (e: Error) => setError(e.message),
  })

  const diferencias = pedido.lineas.filter(l => conDiferencia(l, marcas[l.id])).length
  const chip = (activo: boolean) =>
    `px-3 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform ${
      activo ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-500' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'
    }`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onVolver} className="text-[var(--sala-tx3)] text-sm font-semibold">← Pedidos</button>
        {yaRecibido && <span className="text-[11px] font-bold text-[var(--sala-tx3)]">Corrigiendo la recepción</span>}
      </div>
      <div>
        <p className="text-[var(--sala-txt)] font-black text-lg leading-tight">{pedido.proveedor.nombre}</p>
        <p className="text-[var(--sala-tx3)] text-xs">
          {pedido.enviadoAt ? `Pedido el ${fmtDia(pedido.enviadoAt)}` : ''}{pedido.creadoPor ? ` por ${pedido.creadoPor}` : ''} · {pedido.lineas.length} productos
        </p>
        {pedido.nota && <p className="text-[var(--sala-tx2)] text-xs mt-1">📝 {pedido.nota}</p>}
      </div>

      {/* Albarán */}
      <AlbaranFotos pedidoId={pedido.id} fotos={fotos} onQuitar={n => quitarFoto.mutate(n)} />
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => agregarFotos(e.target.files)} />
      <button onClick={() => inputRef.current?.click()} disabled={subiendo}
        className="w-full py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm font-bold active:scale-95 transition-transform disabled:opacity-50">
        {subiendo ? 'Subiendo foto…' : fotos === 0 ? '📷 Foto del albarán' : '📷 Añadir otra foto'}
      </button>

      <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider pt-1">
        Toca lo que llegó distinto
      </p>
      {pedido.lineas.map(l => {
        const m = marcas[l.id]
        const distinto = conDiferencia(l, m)
        const desplegada = abierta === l.id
        const formato = descFormato(l.formato, l.unidadesPorFormato, l.unidad)
        return (
          <div key={l.id} className={`rounded-xl bg-[var(--sala-srf)] border-l-4 ${distinto ? 'border-amber-500' : 'border-emerald-500'}`}>
            <button type="button" onClick={() => setAbierta(desplegada ? null : l.id)} className="w-full flex items-center gap-3 p-3 text-left">
              <span className="shrink-0 w-16 text-[var(--sala-txt)] font-black text-base leading-tight">{enFormato(l.cantidad, l.formato, l.unidad)}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[var(--sala-txt)] font-bold text-sm truncate">{l.nombre}</span>
                {formato && <span className="block text-[var(--sala-tx3)] text-xs">{formato}</span>}
                <span className={`block text-xs font-bold mt-0.5 ${distinto ? 'text-amber-400' : 'text-emerald-400'}`}>{textoMarca(l, m)}</span>
              </span>
            </button>
            {desplegada && (
              <div className="px-3 pb-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--sala-tx2)] text-xs font-semibold flex-1">¿Cuántas {plural(l.formato ?? l.unidad, 2)} llegaron?</span>
                  <button onClick={() => marcar(l.id, { recibida: Math.max(0, m.recibida - 1) })}
                    className="w-11 h-11 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xl font-black active:scale-95">−</button>
                  <span className="w-10 text-center text-[var(--sala-txt)] font-black text-lg">{cant(m.recibida)}</span>
                  <button onClick={() => marcar(l.id, { recibida: m.recibida + 1 })}
                    className="w-11 h-11 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-xl font-black active:scale-95">+</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {INCIDENCIAS.map(i => (
                    <button key={i.key} onClick={() => marcar(l.id, { incidencia: m.incidencia === i.key ? null : i.key, ...(i.key === 'falta' && m.incidencia !== 'falta' && m.recibida === l.cantidad ? { recibida: 0 } : {}) })}
                      className={chip(m.incidencia === i.key)}>
                      {i.label}
                    </button>
                  ))}
                </div>
                <input value={m.nota} onChange={e => marcar(l.id, { nota: e.target.value })} maxLength={200}
                  placeholder="Nota (ej. 2 botellas rotas)"
                  className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] placeholder:text-[var(--sala-tx4)] rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                <div className="flex gap-2">
                  {distinto && (
                    <button onClick={() => marcar(l.id, { recibida: l.cantidad, incidencia: null, nota: '' })}
                      className="flex-1 py-2 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-xs font-bold">↩ Llegó bien</button>
                  )}
                  <button onClick={() => setAbierta(null)}
                    className="flex-1 py-2 rounded-xl bg-[var(--sala-btna)] text-[var(--sala-txt)] text-xs font-bold">Listo</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <input value={nota} onChange={e => setNota(e.target.value)} maxLength={500}
        placeholder="Nota para la oficina (opcional)"
        className="w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] placeholder:text-[var(--sala-tx4)] rounded-xl px-4 py-3 text-sm focus:outline-none" />

      {error && <p className="text-red-400 text-xs font-semibold">⚠️ {error}</p>}

      <button onClick={() => cerrar.mutate()} disabled={cerrar.isPending || subiendo}
        className="w-full py-4 rounded-xl text-white font-black text-base active:scale-95 transition-transform disabled:opacity-40"
        style={{ background: diferencias ? 'linear-gradient(135deg, #F59E0B, #EA580C)' : 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
        {cerrar.isPending ? 'Guardando…'
          : yaRecibido ? 'Guardar corrección'
          : diferencias ? `Cerrar con ${diferencias} ${diferencias === 1 ? 'diferencia' : 'diferencias'}`
          : '✓ Llegó todo — cerrar pedido'}
      </button>
      {fotos === 0 && !yaRecibido && <p className="text-[var(--sala-tx4)] text-[11px] text-center">Si puedes, saca antes la foto del albarán</p>}
    </div>
  )
}

export default function PedidosSala({ restaurantId }: { restaurantId: number }) {
  const [abiertoId, setAbiertoId] = useState<number | null>(null)
  const { data: pedidos = [], error, isLoading } = useQuery({
    queryKey: ['pedidos-recepcion', restaurantId],
    queryFn: () => api.pedidos.recepcion(),
    refetchInterval: 60_000,
  })

  const abierto = pedidos.find(p => p.id === abiertoId)
  if (abierto) return <Recepcion key={abierto.id} pedido={abierto} onVolver={() => setAbiertoId(null)} />

  const enCamino = pedidos.filter(p => p.estado === 'enviado')
  const recibidos = pedidos.filter(p => p.estado.startsWith('recibido')).reverse()

  return (
    <div className="space-y-3">
      {error && <p className="text-red-400 text-xs font-semibold text-center py-2">⚠️ {(error as Error).message}</p>}
      {!error && !isLoading && pedidos.length === 0 && (
        <p className="text-center text-[var(--sala-tx4)] text-sm py-10">No hay pedidos en camino a este local</p>
      )}

      {enCamino.length > 0 && <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">En camino</p>}
      {enCamino.map(p => (
        <button key={p.id} onClick={() => setAbiertoId(p.id)}
          className="w-full bg-[var(--sala-srf)] rounded-xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform border-l-4 border-[#4B9EDF]">
          <span className="text-2xl">📦</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[var(--sala-txt)] font-bold text-sm truncate">{p.proveedor.nombre}</span>
            <span className="block text-[var(--sala-tx3)] text-xs">
              {p.enviadoAt ? `Pedido el ${fmtDia(p.enviadoAt)} · ` : ''}{p.lineas.length} productos
            </span>
          </span>
          <span className="shrink-0 px-3 py-2 rounded-lg text-xs font-black text-white" style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
            Recibir
          </span>
        </button>
      ))}

      {recibidos.length > 0 && <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider pt-2">Recibidos esta semana</p>}
      {recibidos.map(p => (
        <button key={p.id} onClick={() => setAbiertoId(p.id)}
          className="w-full bg-[var(--sala-srf)] rounded-xl px-4 py-3 flex items-center gap-3 text-left">
          <span className="flex-1 min-w-0">
            <span className="block text-[var(--sala-txt)] font-semibold text-sm truncate">{p.proveedor.nombre}</span>
            <span className="block text-[var(--sala-tx3)] text-xs">
              {p.recibidoAt ? fmtDia(p.recibidoAt) : ''}{p.recibidoPor ? ` · ${p.recibidoPor}` : ''}{p.albaranFotos ? ' · 📷' : ''}
            </span>
          </span>
          <span className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold ${
            p.estado === 'recibido' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
          }`}>
            {p.estado === 'recibido' ? '✓ Completo' : '⚠ Con diferencias'}
          </span>
        </button>
      ))}
    </div>
  )
}
