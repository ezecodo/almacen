import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, Factura } from '../api'
import { comprimirFoto } from '../lib/imagen'
import FacturaPaginas from './FacturaPaginas'

const fmtDiaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface PaginaLocal { blob: Blob; url: string }

// Pestaña "🧾 Facturas" del panel 💼: el encargado fotografía la factura del proveedor
// (una foto por página) y la manda a la bandeja de /admin/facturas.
export default function FacturasSala({ restaurantId, empleadoId }: { restaurantId: number; empleadoId?: number }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [nueva, setNueva] = useState(false)
  const [proveedorId, setProveedorId] = useState<number | null>(null)
  const [otro, setOtro] = useState(false) // proveedor que no está en el catálogo → se escribe a mano
  const [proveedor, setProveedor] = useState('')
  const [numero, setNumero] = useState('')
  const [nota, setNota] = useState('')
  const [paginas, setPaginas] = useState<PaginaLocal[]>([])
  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [error, setError] = useState('')
  const [abiertaId, setAbiertaId] = useState<number | null>(null)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)

  const paginasRef = useRef(paginas)
  paginasRef.current = paginas
  useEffect(() => () => paginasRef.current.forEach(p => URL.revokeObjectURL(p.url)), [])

  const { data: facturas = [], error: errorLista } = useQuery({
    queryKey: ['facturas', 'sala', restaurantId],
    queryFn: () => api.facturas.list({ restaurantId }),
    refetchInterval: 60_000,
  })
  const { data: proveedores = [] } = useQuery({
    queryKey: ['facturas', 'proveedores'],
    queryFn: () => api.facturas.proveedores(),
    enabled: nueva,
  })

  const limpiar = () => {
    paginas.forEach(p => URL.revokeObjectURL(p.url))
    setPaginas([])
    setProveedor('')
    setProveedorId(null)
    setOtro(false)
    setNumero('')
    setNota('')
    setError('')
    setProgreso('')
  }

  const agregarFotos = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    setProcesando(true)
    try {
      for (const file of Array.from(files)) {
        const blob = await comprimirFoto(file)
        setPaginas(prev => [...prev, { blob, url: URL.createObjectURL(blob) }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la foto')
    } finally {
      setProcesando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const quitarPagina = (i: number) => {
    URL.revokeObjectURL(paginas[i].url)
    setPaginas(prev => prev.filter((_, j) => j !== i))
  }

  const enviar = useMutation({
    mutationFn: async () => {
      setProgreso('Creando factura…')
      const factura = await api.facturas.crear({ restaurantId, ...(otro ? { proveedor: proveedor.trim() } : { proveedorId: proveedorId! }), numero: numero.trim() || undefined, nota: nota.trim() || undefined })
      for (let i = 0; i < paginas.length; i++) {
        setProgreso(`Subiendo página ${i + 1} de ${paginas.length}…`)
        await api.facturas.subirPagina(factura.id, paginas[i].blob)
      }
      return api.facturas.enviar(factura.id)
    },
    onSuccess: () => {
      limpiar()
      setNueva(false)
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
    },
    onError: (e: Error) => { setProgreso(''); setError(e.message) },
  })

  const borrar = useMutation({
    mutationFn: (id: number) => api.facturas.delete(id),
    onSuccess: () => { setBorrandoId(null); setAbiertaId(null); queryClient.invalidateQueries({ queryKey: ['facturas'] }) },
    onError: (e: Error) => setError(e.message),
  })

  const inputCls = 'w-full bg-[var(--sala-btn2)] text-[var(--sala-txt)] placeholder:text-[var(--sala-tx4)] rounded-xl px-4 py-3 text-sm focus:outline-none'

  if (nueva) {
    const hayProveedor = otro ? proveedor.trim().length > 0 : proveedorId != null
    const listo = hayProveedor && paginas.length > 0 && !procesando
    const chip = (activo: boolean) =>
      `px-3 py-2.5 rounded-lg text-xs font-bold active:scale-95 transition-transform ${
        activo ? 'bg-[var(--sala-btna)] text-[var(--sala-txt)] ring-2 ring-[#4CC8A0]' : 'bg-[var(--sala-btn2)] text-[var(--sala-tx2)]'
      }`
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[var(--sala-txt)] font-bold text-sm">Nueva factura</p>
          <button onClick={() => { limpiar(); setNueva(false) }} disabled={enviar.isPending}
            className="text-[var(--sala-tx3)] text-xs font-semibold disabled:opacity-40">
            Cancelar
          </button>
        </div>

        <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider">Proveedor</p>
        <div className="flex flex-wrap gap-1.5">
          {proveedores.map(p => (
            <button key={p.id} type="button" onClick={() => { setProveedorId(p.id); setOtro(false) }}
              className={chip(!otro && proveedorId === p.id)}>
              {p.nombre}
            </button>
          ))}
          <button type="button" onClick={() => { setOtro(true); setProveedorId(null) }} className={chip(otro)}>
            Otro…
          </button>
        </div>
        {otro && (
          <input value={proveedor} onChange={e => setProveedor(e.target.value)} autoFocus
            placeholder="Nombre del proveedor (no está en la lista)" className={inputCls} />
        )}
        <input value={numero} onChange={e => setNumero(e.target.value)}
          placeholder="Nº de factura (como figura en el papel)" className={inputCls} />
        <input value={nota} onChange={e => setNota(e.target.value)}
          placeholder="Nota opcional (ej. faltaron 2 botellas)" className={inputCls} />

        {paginas.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {paginas.map((p, i) => (
              <div key={p.url} className="relative">
                <img src={p.url} alt={`Página ${i + 1}`} className="w-full aspect-[3/4] object-cover rounded-lg" />
                <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/60 text-white text-[10px] font-bold">{i + 1}</span>
                {!enviar.isPending && (
                  <button onClick={() => quitarPagina(i)} aria-label={`Quitar página ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-black">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => agregarFotos(e.target.files)} />
        <button onClick={() => inputRef.current?.click()} disabled={procesando || enviar.isPending}
          className="w-full py-3 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-txt)] text-sm font-bold active:scale-95 transition-transform disabled:opacity-50">
          {procesando ? 'Procesando foto…' : paginas.length === 0 ? '📷 Fotografiar factura' : '📷 Añadir otra página'}
        </button>

        {error && <p className="text-red-400 text-xs font-semibold">⚠️ {error}</p>}

        <button onClick={() => enviar.mutate()} disabled={!listo || enviar.isPending}
          className="w-full py-4 rounded-xl text-white font-black text-base active:scale-95 transition-transform disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
          {enviar.isPending ? progreso : `Enviar factura${paginas.length ? ` (${paginas.length} pág.)` : ''}`}
        </button>
      </div>
    )
  }

  return (
    <>
      <button onClick={() => setNueva(true)}
        className="w-full py-4 rounded-xl text-white font-black text-base active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
        📷 Nueva factura
      </button>

      {errorLista && <p className="text-red-400 text-xs font-semibold text-center py-2">⚠️ {(errorLista as Error).message}</p>}
      {!errorLista && facturas.length === 0 && (
        <p className="text-center text-[var(--sala-tx4)] text-sm py-10">Todavía no se subió ninguna factura</p>
      )}

      {facturas.map((f: Factura) => {
        const abierta = abiertaId === f.id
        const puedeBorrar = f.estado === 'pendiente' && f.subidoPorId != null && f.subidoPorId === empleadoId
        return (
          <div key={f.id} className="bg-[var(--sala-srf)] rounded-xl p-4">
            <button type="button" onClick={() => { setAbiertaId(abierta ? null : f.id); setBorrandoId(null) }}
              className="w-full flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <p className="text-[var(--sala-txt)] font-bold text-sm truncate">
                  {f.proveedor}{f.numero ? <span className="text-[var(--sala-tx3)] font-semibold"> · Nº {f.numero}</span> : null}
                </p>
                <p className="text-[var(--sala-tx3)] text-xs mt-0.5">
                  {fmtDiaHora(f.createdAt)} · {f.subidoPor} · {f.paginas} pág.
                </p>
                {f.nota && <p className="text-[var(--sala-tx2)] text-xs mt-0.5">📝 {f.nota}</p>}
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold ${
                f.estado === 'revisada' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                {f.estado === 'revisada' ? '✓ Revisada' : 'Enviada'}
              </span>
            </button>

            {abierta && (
              <div className="mt-3 space-y-2">
                <FacturaPaginas factura={f} />
                {puedeBorrar && (borrandoId === f.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => setBorrandoId(null)}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
                      Cancelar
                    </button>
                    <button onClick={() => borrar.mutate(f.id)} disabled={borrar.isPending}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-black disabled:opacity-50">
                      {borrar.isPending ? 'Borrando…' : '¿Seguro? Borrar'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setBorrandoId(f.id)}
                    className="w-full py-2.5 rounded-xl bg-red-600/20 text-red-400 text-sm font-bold">
                    🗑 Borrar (la subí por error)
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
