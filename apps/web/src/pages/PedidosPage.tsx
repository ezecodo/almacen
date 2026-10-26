import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, EstadoPedido, Pedido, PedidoLinea, Proveedor, SugerenciaPedido } from '../api'
import AlbaranFotos from '../components/AlbaranFotos'
import { useAdminEvents } from '../hooks/useAdminEvents'

// /admin/pedidos — el dueño pide a los proveedores, un pedido por restaurante y proveedor.
// Lista los productos del proveedor (Inventario → Catálogo) con lo que quedaba en el último conteo del
// local y una cantidad sugerida en formatos (3 cajas). "Copiar pedido" deja el texto para WhatsApp o
// mail: la app no le escribe al proveedor. Después el encargado lo recibe con el albarán (💼).

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
const cant = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
const aNumero = (t: string) => { const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : null }
const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const fmtDiaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const inputCls = 'border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-cyan-400 bg-white'

const ESTADOS: Record<EstadoPedido, { label: string; cls: string }> = {
  borrador:             { label: 'Borrador',             cls: 'bg-gray-100 text-gray-600' },
  enviado:              { label: 'En camino',            cls: 'bg-cyan-100 text-cyan-700' },
  recibido:             { label: 'Recibido',             cls: 'bg-emerald-100 text-emerald-700' },
  recibido_diferencias: { label: 'Recibido con diferencias', cls: 'bg-amber-100 text-amber-700' },
  cancelado:            { label: 'Cancelado',            cls: 'bg-red-50 text-red-500' },
}

// caja → cajas, barril → barriles, pack → packs (ud, l y kg no cambian)
function plural(palabra: string, n: number) {
  const f = palabra.toLowerCase()
  if (n === 1 || f === 'ud' || f === 'l' || f === 'kg') return f
  return /[lrnd]$/.test(f) ? f + 'es' : f + 's'
}

// "3 cajas" / "1 caja" / "2 botellas"
const enFormato = (n: number, formato: string | null, unidad: string) => `${cant(n)} ${plural(formato ?? unidad, n)}`
// "Caja de 6 botellas"
const descFormato = (formato: string | null, upf: number, unidad: string) =>
  formato ? `${formato} de ${cant(upf)} ${plural(unidad, upf)}` : `suelto, por ${unidad}`

const totalPedido = (p: Pedido) => p.lineas.reduce((s, l) => s + (l.precioFormato ?? 0) * l.cantidad, 0)
const totalRecibido = (p: Pedido) => p.lineas.reduce((s, l) => s + (l.precioFormato ?? 0) * (l.cantidadRecibida ?? 0), 0)
const INCIDENCIAS: Record<NonNullable<PedidoLinea['incidencia']>, string> = { falta: 'faltó', roto: 'llegó roto', otro: 'otro problema' }

function textoPedido(p: Pedido) {
  const lineas = p.lineas.map(l => {
    const trae = l.formato ? ` (${descFormato(l.formato, l.unidadesPorFormato, l.unidad).toLowerCase()})` : ''
    return `• ${enFormato(l.cantidad, l.formato, l.unidad)} — ${l.nombre}${trae}`
  })
  return [
    `Hola, pedido para ${p.restaurant.nombre}:`,
    '',
    ...lineas,
    ...(p.nota ? ['', p.nota] : []),
    '',
    'Gracias',
  ].join('\n')
}

// ─── Editor ───────────────────────────────────────────────────────────────────

interface FilaEditor extends SugerenciaPedido { cantidadTxt: string; precioTxt: string }

function EditorPedido({ restaurantId, proveedor, pedido, onDone }: {
  restaurantId: number
  proveedor: Proveedor
  pedido?: Pedido
  onDone: (p?: Pedido) => void
}) {
  const qc = useQueryClient()
  const { data: sugerencia, isLoading } = useQuery({
    queryKey: ['pedido-sugerencia', restaurantId, proveedor.id],
    queryFn: () => api.pedidos.sugerencia(restaurantId, proveedor.id),
  })
  const { data: categorias = [] } = useQuery({
    queryKey: ['inv-categorias', restaurantId],
    queryFn: () => api.inventario.getCategorias(restaurantId),
  })
  const [filas, setFilas] = useState<FilaEditor[] | null>(null)
  const [nota, setNota] = useState(pedido?.nota ?? '')
  const [otro, setOtro] = useState('')
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })

  // Al llegar la sugerencia: un pedido nuevo arranca con lo sugerido; uno que se edita, con sus cantidades
  useEffect(() => {
    if (!sugerencia || filas) return
    const base: FilaEditor[] = sugerencia.map(s => {
      const linea = pedido?.lineas.find(l => l.productoId === s.productoId)
      const c = pedido ? (linea?.cantidad ?? 0) : s.sugerido
      const precio = linea ? linea.precioFormato : s.precioFormato
      return { ...s, cantidadTxt: c ? String(c) : '', precioTxt: precio != null ? String(+precio.toFixed(4)) : '' }
    })
    // Líneas del pedido cuyo producto ya no es de este proveedor
    for (const l of pedido?.lineas ?? []) {
      if (l.productoId === null || base.some(f => f.productoId === l.productoId)) continue
      base.push({
        productoId: l.productoId, nombre: l.nombre, categoria: 'Otros', unidad: l.unidad, formato: l.formato,
        unidadesPorFormato: l.unidadesPorFormato, precioFormato: l.precioFormato, precioOrigen: null, stockMinimo: 0,
        stock: null, stockFecha: null, enCamino: 0, sugerido: 0,
        cantidadTxt: String(l.cantidad), precioTxt: l.precioFormato != null ? String(l.precioFormato) : '',
      })
    }
    setFilas(base)
  }, [sugerencia, pedido, filas])

  const cambiar = (id: number, campo: 'cantidadTxt' | 'precioTxt', v: string) =>
    setFilas(fs => fs && fs.map(f => f.productoId === id ? { ...f, [campo]: v } : f))
  const sumar = (id: number, d: number) =>
    setFilas(fs => fs && fs.map(f => f.productoId === id ? { ...f, cantidadTxt: String(Math.max(0, (aNumero(f.cantidadTxt) ?? 0) + d) || '') } : f))

  // Añadir un producto del catálogo que no es de este proveedor (al guardar queda como suyo si no tenía)
  const disponibles = useMemo(() => categorias.flatMap(c => c.productos.map(p => ({ ...p, categoria: c.nombre })))
    .filter(p => !filas?.some(f => f.productoId === p.id)), [categorias, filas])
  function anadirOtro(id: number) {
    const p = disponibles.find(x => x.id === id)
    if (!p || !filas) return
    const upf = p.formatoCompra ? p.unidadesPorFormato : 1
    setFilas([...filas, {
      productoId: p.id, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, formato: p.formatoCompra,
      unidadesPorFormato: upf, precioFormato: p.precioCoste != null ? p.precioCoste * upf : null, precioOrigen: p.precioOrigen,
      stockMinimo: p.stockMinimo, stock: null, stockFecha: null, enCamino: 0, sugerido: 0,
      cantidadTxt: '1', precioTxt: p.precioCoste != null ? String(+(p.precioCoste * upf).toFixed(4)) : '',
    }])
    setOtro('')
  }

  const lineas = (filas ?? [])
    .map(f => ({ productoId: f.productoId, cantidad: aNumero(f.cantidadTxt) ?? 0, precioFormato: aNumero(f.precioTxt) }))
    .filter(l => l.cantidad > 0)
  const total = lineas.reduce((s, l) => s + (l.precioFormato ?? 0) * l.cantidad, 0)
  const sinPrecio = lineas.filter(l => l.precioFormato === null).length

  const guardar = useMutation({
    mutationFn: (enviar: boolean) => pedido
      ? api.pedidos.editar(pedido.id, { nota, lineas }).then(p => enviar && p.estado === 'borrador' ? api.pedidos.estado(p.id, 'enviado') : p)
      : api.pedidos.crear({ restaurantId, proveedorId: proveedor.id, nota, lineas, enviar }),
    onSuccess: p => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedido-sugerencia'] })
      qc.invalidateQueries({ queryKey: ['inv-categorias'] })
      onDone(p)
    },
  })

  // Agrupado por categoría de inventario, en el orden del catálogo
  const grupos = useMemo(() => {
    const m = new Map<string, FilaEditor[]>()
    for (const f of filas ?? []) m.set(f.categoria, [...(m.get(f.categoria) ?? []), f])
    return [...m]
  }, [filas])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => onDone()} className="text-sm text-cyan-600 font-semibold">← Volver</button>
        {pedido && <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${ESTADOS[pedido.estado].cls}`}>{ESTADOS[pedido.estado].label}</span>}
      </div>
      <h2 className="text-xl font-black text-gray-800">
        {pedido ? `Editar pedido #${pedido.id}` : 'Nuevo pedido'} · {proveedor.nombre}
        <span className="font-normal text-gray-400"> → {restaurantes.find(r => r.id === restaurantId)?.nombre}</span>
      </h2>

      {isLoading || !filas ? <p className="text-sm text-gray-400">Cargando productos…</p> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filas.length === 0 && (
            <p className="text-sm text-gray-500 p-5">
              {proveedor.nombre} todavía no tiene productos. Asígnaselos en Inventario → Catálogo (campo Proveedor), o añade uno abajo.
            </p>
          )}
          {grupos.map(([categoria, fs]) => (
            <div key={categoria}>
              <p className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">{categoria}</p>
              {fs.map(f => {
                const c = aNumero(f.cantidadTxt) ?? 0
                const p = aNumero(f.precioTxt)
                return (
                  <div key={f.productoId} className={`flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-100 ${c > 0 ? 'bg-cyan-50/30' : ''}`}>
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-semibold text-gray-800">{f.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {descFormato(f.formato, f.unidadesPorFormato, f.unidad)}
                        {f.stock !== null
                          ? <> · quedaban <b className={f.stock < f.stockMinimo ? 'text-red-500' : 'text-gray-600'}>{cant(f.stock)}</b> ({fmtDia(f.stockFecha!)})</>
                          : ' · sin contar'}
                        {f.stockMinimo > 0 && ` · mín. ${cant(f.stockMinimo)}`}
                        {f.enCamino > 0 && <span className="text-cyan-600"> · {cant(f.enCamino)} en camino</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => sumar(f.productoId, -1)} className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 font-bold">−</button>
                      <input value={f.cantidadTxt} onChange={e => cambiar(f.productoId, 'cantidadTxt', e.target.value)} inputMode="decimal"
                        placeholder="0" className={`${inputCls} w-16 text-center`} />
                      <button onClick={() => sumar(f.productoId, 1)} className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 font-bold">+</button>
                      <span className="text-xs text-gray-500 w-14">{(f.formato ?? f.unidad).toLowerCase()}</span>
                    </div>
                    {f.sugerido > 0 && !pedido && c !== f.sugerido && (
                      <button onClick={() => cambiar(f.productoId, 'cantidadTxt', String(f.sugerido))} className="text-xs text-amber-600 font-semibold">
                        sugerido {f.sugerido}
                      </button>
                    )}
                    <div className="flex items-center gap-1">
                      <input value={f.precioTxt} onChange={e => cambiar(f.productoId, 'precioTxt', e.target.value)} inputMode="decimal"
                        placeholder="precio" className={`${inputCls} w-24 text-right`} />
                      <span className="text-xs text-gray-400">€</span>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold text-gray-700">{c > 0 && p !== null ? eur(c * p) : ''}</span>
                  </div>
                )
              })}
            </div>
          ))}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
            <select value={otro} onChange={e => { setOtro(e.target.value); if (e.target.value) anadirOtro(Number(e.target.value)) }} className={inputCls}>
              <option value="">+ Añadir otro producto del catálogo…</option>
              {disponibles.map(p => <option key={p.id} value={p.id}>{p.categoria} · {p.nombre}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={500}
          placeholder="Nota para el proveedor (opcional): entregar antes de las 12, por la puerta de atrás…" className={`${inputCls} w-full`} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-gray-500">
            {lineas.length} producto{lineas.length !== 1 ? 's' : ''} · <b className="text-gray-800 text-base">{eur(total)}</b>
            {sinPrecio > 0 && <span className="text-amber-600"> · {sinPrecio} sin precio</span>}
          </p>
          {guardar.error && <p className="text-sm text-red-500 w-full">{(guardar.error as Error).message}</p>}
          {(!pedido || pedido.estado === 'borrador') && (
            <button onClick={() => guardar.mutate(false)} disabled={!lineas.length || guardar.isPending}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-40">
              Guardar borrador
            </button>
          )}
          <button onClick={() => guardar.mutate(true)} disabled={!lineas.length || guardar.isPending}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-bold disabled:opacity-40">
            {pedido?.estado === 'enviado' ? 'Guardar cambios' : 'Marcar como enviado'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

function DetallePedido({ id, onVolver, onEditar }: { id: number; onVolver: () => void; onEditar: (p: Pedido) => void }) {
  const qc = useQueryClient()
  const { data: p } = useQuery({ queryKey: ['pedidos', 'uno', id], queryFn: () => api.pedidos.get(id) })
  const [copiado, setCopiado] = useState(false)
  const invalidar = () => qc.invalidateQueries({ queryKey: ['pedidos'] })
  const estado = useMutation({
    mutationFn: (e: 'borrador' | 'enviado' | 'cancelado') => api.pedidos.estado(id, e),
    onSuccess: invalidar,
  })
  const borrar = useMutation({ mutationFn: () => api.pedidos.borrar(id), onSuccess: () => { invalidar(); onVolver() } })

  if (!p) return <p className="text-sm text-gray-400">Cargando…</p>
  const abierto = p.estado === 'borrador' || p.estado === 'enviado'
  const recibido = p.estado.startsWith('recibido')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoPedido(p!))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sin permiso de portapapeles: se ve el texto abajo */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onVolver} className="text-sm text-cyan-600 font-semibold">← Pedidos</button>
        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${ESTADOS[p.estado].cls}`}>{ESTADOS[p.estado].label}</span>
      </div>
      <div>
        <h2 className="text-xl font-black text-gray-800">{p.proveedor.nombre} → {p.restaurant.nombre}</h2>
        <p className="text-sm text-gray-500">
          #{p.id} · creado {fmtDiaHora(p.createdAt)}{p.creadoPor && ` por ${p.creadoPor}`}
          {p.enviadoAt && ` · enviado ${fmtDiaHora(p.enviadoAt)}`}
          {p.recibidoAt && ` · recibido ${fmtDiaHora(p.recibidoAt)}${p.recibidoPor ? ` por ${p.recibidoPor}` : ''}`}
        </p>
        {(p.proveedor.telefono || p.proveedor.email) && (
          <p className="text-sm text-gray-500 mt-1">
            {p.proveedor.telefono && <a href={`tel:${p.proveedor.telefono}`} className="text-cyan-600 mr-3">📞 {p.proveedor.telefono}</a>}
            {p.proveedor.email && <a href={`mailto:${p.proveedor.email}`} className="text-cyan-600">✉️ {p.proveedor.email}</a>}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {p.lineas.map(l => {
          const diferente = l.cantidadRecibida !== null && l.cantidadRecibida !== l.cantidad
          return (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
              <span className="w-24 text-sm font-bold text-gray-800">{enFormato(l.cantidad, l.formato, l.unidad)}</span>
              <div className="flex-1">
                <p className="text-sm text-gray-800">{l.nombre}</p>
                <p className="text-xs text-gray-400">
                  {descFormato(l.formato, l.unidadesPorFormato, l.unidad)}
                  {l.precioFormato !== null && ` · ${eur(l.precioFormato)} c/u`}
                </p>
                {recibido && (
                  <p className={`text-xs font-semibold ${diferente || l.incidencia ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {diferente || l.incidencia
                      ? `⚠ llegó ${enFormato(l.cantidadRecibida ?? 0, l.formato, l.unidad)}${l.incidencia ? ` · ${INCIDENCIAS[l.incidencia]}` : ''}${l.notaRecepcion ? ` · ${l.notaRecepcion}` : ''}`
                      : '✓ llegó bien'}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-700">{l.precioFormato !== null ? eur(l.precioFormato * l.cantidad) : '—'}</span>
            </div>
          )
        })}
        <div className="flex justify-between px-4 py-3 bg-gray-50">
          <span className="text-sm text-gray-500">Total pedido</span>
          <span className="font-black text-gray-800">{eur(totalPedido(p))}</span>
        </div>
        {p.estado === 'recibido_diferencias' && (
          <div className="flex justify-between px-4 py-3 bg-amber-50">
            <span className="text-sm text-amber-700">Lo que llegó (la factura debería decir esto)</span>
            <span className="font-black text-amber-800">{eur(totalRecibido(p))}</span>
          </div>
        )}
      </div>
      {p.nota && <p className="text-sm text-gray-600 bg-amber-50 rounded-xl px-4 py-3">📝 {p.nota}</p>}
      {p.notaRecepcion && <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">📦 Al recibir: {p.notaRecepcion}</p>}
      {p.albaranFotos > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Albarán</p>
          <div className="max-w-md"><AlbaranFotos pedidoId={p.id} fotos={p.albaranFotos} /></div>
        </div>
      )}
      {p.estado === 'enviado' && (
        <p className="text-xs text-gray-400">Lo recibe el encargado del local desde el panel 💼 → 📦 Pedidos, con la foto del albarán.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={copiar} className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-bold">
          {copiado ? '✓ Copiado' : '📋 Copiar pedido'}
        </button>
        {abierto && <button onClick={() => onEditar(p)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">✏️ Editar</button>}
        {p.estado === 'borrador' && (
          <button onClick={() => estado.mutate('enviado')} className="px-4 py-2 rounded-xl border border-cyan-200 text-sm font-semibold text-cyan-700">Marcar como enviado</button>
        )}
        {p.estado === 'enviado' && (
          <button onClick={() => estado.mutate('borrador')} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Volver a borrador</button>
        )}
        {abierto && (
          <button onClick={() => { if (confirm('¿Cancelar este pedido?')) estado.mutate('cancelado') }}
            className="px-4 py-2 rounded-xl border border-red-100 text-sm font-semibold text-red-500">Cancelar pedido</button>
        )}
        {(p.estado === 'borrador' || p.estado === 'cancelado') && (
          <button onClick={() => { if (confirm('¿Borrar este pedido? No se puede deshacer.')) borrar.mutate() }}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-red-500">Borrar</button>
        )}
      </div>
      {(estado.error || borrar.error) && <p className="text-sm text-red-500">{((estado.error || borrar.error) as Error).message}</p>}

      <details className="text-sm">
        <summary className="text-gray-400 cursor-pointer">Ver el texto que se copia</summary>
        <pre className="mt-2 bg-gray-50 rounded-xl p-4 whitespace-pre-wrap text-gray-700 font-sans">{textoPedido(p)}</pre>
      </details>
    </div>
  )
}

// ─── Contacto del proveedor ───────────────────────────────────────────────────

function ContactoProveedor({ proveedor }: { proveedor: Proveedor }) {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [tel, setTel] = useState(proveedor.telefono ?? '')
  const [mail, setMail] = useState(proveedor.email ?? '')
  useEffect(() => { setTel(proveedor.telefono ?? ''); setMail(proveedor.email ?? '') }, [proveedor])
  const guardar = useMutation({
    mutationFn: () => api.facturas.editarProveedor(proveedor.id, { nombre: proveedor.nombre, telefono: tel.trim() || null, email: mail.trim() || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas', 'proveedores'] }); setAbierto(false) },
  })
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="text-xs text-gray-500 hover:text-cyan-600">
        {proveedor.telefono || proveedor.email ? `📞 ${[proveedor.telefono, proveedor.email].filter(Boolean).join(' · ')}` : '+ teléfono / mail'}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Teléfono" className={`${inputCls} w-36`} />
      <input value={mail} onChange={e => setMail(e.target.value)} placeholder="Mail" className={`${inputCls} w-52`} />
      <button onClick={() => guardar.mutate()} className="text-xs font-semibold text-cyan-600">Guardar</button>
      <button onClick={() => setAbierto(false)} className="text-xs text-gray-400">✕</button>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'editor'; restaurantId: number; proveedorId: number; pedido?: Pedido }
  | { tipo: 'detalle'; id: number }

export default function PedidosPage() {
  useAdminEvents() // lo que el encargado recibe en el local aparece solo
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [restaurantId, setRestaurantId] = useState<number | undefined>(undefined)
  const [nuevoProv, setNuevoProv] = useState<number | ''>('')
  const [verCerrados, setVerCerrados] = useState(false)

  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const { data: proveedores = [] } = useQuery({ queryKey: ['facturas', 'proveedores'], queryFn: () => api.facturas.proveedores() })
  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos', 'lista', restaurantId],
    queryFn: () => api.pedidos.list({ restaurantId }),
  })

  if (vista.tipo === 'editor') {
    const proveedor = proveedores.find(p => p.id === vista.proveedorId)
    if (!proveedor) return <p className="text-sm text-gray-400">Cargando…</p>
    return (
      <div className="max-w-5xl mx-auto">
        <EditorPedido
          restaurantId={vista.restaurantId}
          proveedor={proveedor}
          pedido={vista.pedido}
          onDone={p => setVista(p ? { tipo: 'detalle', id: p.id } : vista.pedido ? { tipo: 'detalle', id: vista.pedido.id } : { tipo: 'lista' })}
        />
      </div>
    )
  }
  if (vista.tipo === 'detalle') {
    return (
      <div className="max-w-5xl mx-auto">
        <DetallePedido
          id={vista.id}
          onVolver={() => setVista({ tipo: 'lista' })}
          onEditar={p => setVista({ tipo: 'editor', restaurantId: p.restaurantId, proveedorId: p.proveedorId, pedido: p })}
        />
      </div>
    )
  }

  const provElegido = proveedores.find(p => p.id === nuevoProv)
  const secciones: { titulo: string; estados: EstadoPedido[] }[] = [
    { titulo: 'En camino', estados: ['enviado'] },
    { titulo: 'Borradores', estados: ['borrador'] },
    { titulo: 'Recibidos', estados: ['recibido', 'recibido_diferencias'] },
  ]
  const cancelados = pedidos.filter(p => p.estado === 'cancelado')

  const Tarjeta = ({ p }: { p: Pedido }) => (
    <button onClick={() => setVista({ tipo: 'detalle', id: p.id })}
      className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{p.proveedor.nombre} <span className="font-normal text-gray-400">→ {p.restaurant.nombre}</span></p>
        <p className="text-xs text-gray-400">
          #{p.id} · {fmtDia(p.enviadoAt ?? p.createdAt)} · {p.lineas.length} producto{p.lineas.length !== 1 ? 's' : ''}
        </p>
      </div>
      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${ESTADOS[p.estado].cls}`}>{ESTADOS[p.estado].label}</span>
      <span className="w-24 text-right text-sm font-bold text-gray-700">{eur(totalPedido(p))}</span>
    </button>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-800">📦 Pedidos a proveedores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Un pedido por restaurante y proveedor, en cajas, barriles o sueltos. Los productos, su proveedor y cómo llegan
          se configuran en Inventario → Catálogo. Al llegar, el encargado lo recibe con el albarán.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ id: undefined as number | undefined, nombre: 'Todos' }, ...restaurantes].map(r => (
          <button key={r.id ?? 'todos'} onClick={() => setRestaurantId(r.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              restaurantId === r.id ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {r.nombre}
          </button>
        ))}
      </div>

      {/* Nuevo pedido */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="font-bold text-gray-800">Nuevo pedido</h2>
        {proveedores.length === 0 ? (
          <p className="text-sm text-gray-500">No hay proveedores todavía. Créalos al editar un producto en Inventario → Catálogo.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={nuevoProv} onChange={e => setNuevoProv(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
              <option value="">Proveedor…</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}{p._count?.productos ? ` (${p._count.productos})` : ''}</option>)}
            </select>
            <span className="text-sm text-gray-400">para</span>
            {restaurantId === undefined && <span className="text-sm text-amber-600">elige un restaurante arriba</span>}
            {restaurantId !== undefined && <b className="text-sm text-gray-700">{restaurantes.find(r => r.id === restaurantId)?.nombre}</b>}
            <button
              disabled={!nuevoProv || restaurantId === undefined}
              onClick={() => setVista({ tipo: 'editor', restaurantId: restaurantId!, proveedorId: Number(nuevoProv) })}
              className="ml-auto px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-bold disabled:opacity-40">
              Armar pedido
            </button>
          </div>
        )}
        {provElegido && <ContactoProveedor proveedor={provElegido} />}
      </div>

      {isLoading && <p className="text-sm text-gray-400">Cargando pedidos…</p>}
      {!isLoading && pedidos.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Todavía no hay pedidos.</p>}

      {secciones.map(s => {
        const lista = pedidos.filter(p => s.estados.includes(p.estado))
        if (lista.length === 0) return null
        return (
          <div key={s.titulo}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{s.titulo} ({lista.length})</h3>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {lista.map(p => <Tarjeta key={p.id} p={p} />)}
            </div>
          </div>
        )
      })}
      {cancelados.length > 0 && (
        <div>
          <button onClick={() => setVerCerrados(v => !v)} className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            {verCerrados ? '▾' : '▸'} Cancelados ({cancelados.length})
          </button>
          {verCerrados && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {cancelados.map(p => <Tarjeta key={p.id} p={p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
