import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ADMIN_TOKEN_KEY, Elaboracion, EscandalloPlato, EstadoEscandallo, Ficha, FichaBody, Ingrediente, IngredienteBody, TipoFicha } from '../api'
import { comprimirFoto } from '../lib/imagen'

// Escandallos: qué cuesta en materia prima cada plato y qué margen deja.
// Paleta oscura de marca (la misma del monitor Veri*factu y de Pulso), sin animaciones:
// es una herramienta de trabajo con cifras.

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Clases completas: Tailwind no ve las que se arman por partes
const ESTADO: Record<EstadoEscandallo, { punto: string; texto: string; barra: string; etiqueta: string }> = {
  verde:      { punto: 'bg-[#4CC8A0]', texto: 'text-[#4CC8A0]', barra: 'bg-[#4CC8A0]', etiqueta: 'Margen óptimo' },
  ambar:      { punto: 'bg-amber-400', texto: 'text-amber-300', barra: 'bg-amber-400', etiqueta: 'Margen ajustado' },
  rojo:       { punto: 'bg-red-500',   texto: 'text-red-400',   barra: 'bg-red-500',   etiqueta: 'No rentable' },
  incompleta: { punto: 'bg-slate-500 ring-2 ring-amber-400', texto: 'text-amber-300', barra: 'bg-slate-500', etiqueta: 'Falta algún precio' },
  sin_receta: { punto: 'bg-slate-600', texto: 'text-slate-500', barra: 'bg-slate-600', etiqueta: 'Sin escandallo' },
}
const estadoDe = (foodCost: number, verde: number, ambar: number): EstadoEscandallo => (foodCost <= verde ? 'verde' : foodCost <= ambar ? 'ambar' : 'rojo')

const campo = 'bg-[#0f1a2e] border border-white/15 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#4CC8A0]'
const tarjeta = 'rounded-2xl border border-white/10 bg-[#16213a]'

// ── PIN: los costes son sensibles, la API exige la sesión firmada de admin ─────
function PinServidor({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState('')
  const login = useMutation({
    mutationFn: () => api.auth.admin(pin),
    onSuccess: ({ token }) => { sessionStorage.setItem(ADMIN_TOKEN_KEY, token); onOk() },
  })
  return (
    <div className={`max-w-sm mx-auto p-6 mt-10 text-center ${tarjeta}`}>
      <h1 className="text-lg font-bold text-white mb-1">Escandallos</h1>
      <p className="text-slate-400 text-sm mb-5">Confirma el PIN de admin para ver los costes</p>
      <form onSubmit={e => { e.preventDefault(); login.mutate() }} className="space-y-3">
        <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} autoFocus placeholder="····"
          className="w-full text-center text-2xl tracking-widest bg-[#0f1a2e] border-2 border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#4CC8A0]" />
        {login.isError && <p className="text-red-400 text-sm">{(login.error as Error).message}</p>}
        <button type="submit" disabled={!pin || login.isPending}
          className="w-full bg-[#4CC8A0] text-[#0f1a2e] font-bold py-3 rounded-xl disabled:opacity-50">
          {login.isPending ? 'Comprobando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

// ── Alta / edición de un ingrediente ───────────────────────────────────────────
const BASE_POR_DEFECTO: Record<string, { unidadBase: string; contenido: number }> = {
  kg: { unidadBase: 'g', contenido: 1000 }, l: { unidadBase: 'ml', contenido: 1000 },
  botella: { unidadBase: 'ml', contenido: 750 }, caja: { unidadBase: 'ud', contenido: 6 }, ud: { unidadBase: 'ud', contenido: 1 },
}

function IngredienteForm({ inicial, nombreInicial, onGuardado, onCancelar }: {
  inicial?: Ingrediente
  nombreInicial?: string
  onGuardado: (i: Ingrediente) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? nombreInicial ?? '')
  const [unidad, setUnidad] = useState(inicial?.unidad ?? 'kg')
  const [precio, setPrecio] = useState(inicial?.precioCoste?.toString() ?? '')
  const [contenido, setContenido] = useState((inicial?.contenido ?? BASE_POR_DEFECTO.kg.contenido).toString())
  const [unidadBase, setUnidadBase] = useState(inicial?.unidadBase ?? 'g')
  const [merma, setMerma] = useState((inicial?.mermaPct ?? 0).toString())

  const cambiarUnidad = (u: string) => {
    setUnidad(u)
    setUnidadBase(BASE_POR_DEFECTO[u].unidadBase)
    setContenido(BASE_POR_DEFECTO[u].contenido.toString())
  }
  // kg y l tienen conversión fija; botella y caja dependen del formato que se compre
  const pideContenido = unidad === 'botella' || unidad === 'caja'

  const guardar = useMutation({
    mutationFn: () => {
      const body: IngredienteBody = {
        nombre: nombre.trim(), unidad,
        precioCoste: precio.trim() === '' ? null : num(precio),
        unidadBase, contenido: num(contenido), mermaPct: num(merma) || 0,
      }
      return inicial ? api.escandallos.editarIngrediente(inicial.id, body) : api.escandallos.crearIngrediente(body)
    },
    onSuccess: onGuardado,
  })
  const valido = nombre.trim() && (precio.trim() === '' || num(precio) >= 0) && num(contenido) > 0

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (valido) guardar.mutate() }}
      className="rounded-xl border border-[#4B9EDF]/40 bg-[#0f1a2e] p-3 space-y-2"
    >
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del ingrediente" className={`${campo} w-full`} autoFocus={!inicial} />
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
        <span>Se compra por</span>
        <select value={unidad} onChange={e => cambiarUnidad(e.target.value)} className={campo}>
          <option value="kg">kg</option><option value="l">litro</option><option value="ud">unidad</option>
          <option value="botella">botella</option><option value="caja">caja</option>
        </select>
        <span>a</span>
        <input value={precio} onChange={e => setPrecio(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${campo} w-24 text-right font-mono`} />
        <span>€</span>
      </div>
      {pideContenido && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <span>Cada {unidad} trae</span>
          <input value={contenido} onChange={e => setContenido(e.target.value)} inputMode="decimal" className={`${campo} w-24 text-right font-mono`} />
          <select value={unidadBase} onChange={e => setUnidadBase(e.target.value)} className={campo}>
            <option value="ml">ml</option><option value="g">g</option><option value="ud">ud</option>
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
        <span>Merma al limpiar o cocinar</span>
        <input value={merma} onChange={e => setMerma(e.target.value)} inputMode="decimal" className={`${campo} w-20 text-right font-mono`} />
        <span>%</span>
      </div>
      {guardar.isError && <p className="text-red-400 text-xs">{(guardar.error as Error).message}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancelar} className="text-sm text-slate-400 px-3 py-1.5">Cancelar</button>
        <button type="submit" disabled={!valido || guardar.isPending} className="text-sm font-bold bg-[#4B9EDF] text-white rounded-lg px-3 py-1.5 disabled:opacity-40">
          {inicial ? 'Guardar ingrediente' : 'Crear ingrediente'}
        </button>
      </div>
    </form>
  )
}

// ── Líneas de una receta (plato o elaboración): ingredientes, cantidades, alta y edición ──
// cantidad es lo que se escribe: un número (en g / ml / ud) o un texto que se lee tal cual
// ("c/s", "6 granos"), que no cuesta
interface LineaEdit { productoId: number; cantidad: string }
const esNumero = (v: string) => /^\s*\d+([.,]\d+)?\s*$/.test(v)

function calcularFilas(lineas: LineaEdit[], porId: Map<number, Ingrediente>) {
  return lineas.map(l => {
    const ing = porId.get(l.productoId)
    const conCantidad = esNumero(l.cantidad) && num(l.cantidad) > 0
    const cantidad = conCantidad ? num(l.cantidad) : 0
    const coste = ing && ing.costeUnitario !== null && conCantidad ? ing.costeUnitario * cantidad : null
    // Falta precio solo si la línea cuesta algo
    const sinPrecio = !!ing && ing.costeUnitario === null && conCantidad
    return { ...l, ing, coste, conCantidad, sinPrecio }
  })
}

// Precio de un ingrediente para mostrar: el de compra o, si es elaboración, lo que vale por kg / l / ud
function textoPrecio(i: Ingrediente) {
  if (i.elaboracion) return i.costeUnitario === null ? '⚗️ falta algún precio en su receta' : `⚗️ ${eur(i.costeUnitario * i.contenido)} / ${i.unidad}`
  return i.precioCoste === null ? null : `${eur(i.precioCoste)} / ${i.unidad}`
}

function LineasReceta({ ingredientes, lineas, setLineas, divisor, excluirId, onCambioIngredientes, vacio }: {
  ingredientes: Ingrediente[]
  lineas: LineaEdit[]
  setLineas: (f: (l: LineaEdit[]) => LineaEdit[]) => void
  divisor: number            // el coste de cada línea se muestra ÷ esto (raciones del plato; 1 en una tanda)
  excluirId?: number         // una elaboración no se lleva a sí misma
  onCambioIngredientes: () => void
  vacio: string
}) {
  const [busca, setBusca] = useState('')
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const porId = useMemo(() => new Map(ingredientes.map(i => [i.id, i])), [ingredientes])
  const filas = calcularFilas(lineas, porId)
  const agregar = (id: number) => { setLineas(l => [...l, { productoId: id, cantidad: '' }]); setBusca('') }
  const usados = new Set(lineas.map(l => l.productoId))
  const nb = norm(busca.trim())
  const candidatos = nb ? ingredientes.filter(i => i.id !== excluirId && !usados.has(i.id) && norm(i.nombre).includes(nb)).slice(0, 8) : []

  return (
    <>
      <div className="space-y-1.5">
        {filas.length === 0 && <p className="text-sm text-slate-500 py-3">{vacio}</p>}
        {filas.map((f, i) => {
          const precio = f.ing ? textoPrecio(f.ing) : null
          return (
            <div key={`${f.productoId}-${i}`}>
              <div className={`${tarjeta} flex items-center gap-2 px-3 py-2`}>
                <button onClick={() => !f.ing?.elaboracion && setEditandoId(editandoId === f.productoId ? null : f.productoId)} className="min-w-0 flex-1 text-left"
                  title={f.ing?.elaboracion ? 'Su coste sale de su receta (pestaña Elaboraciones)' : 'Editar precio y merma del ingrediente'}>
                  <p className="text-sm font-semibold text-white truncate">{f.ing?.elaboracion && '⚗️ '}{f.ing?.nombre ?? '…'}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {precio === null
                      ? <span className="text-amber-300">sin precio de coste — toca para ponerlo</span>
                      : <span className={f.ing?.costeUnitario === null ? 'text-amber-300' : ''}>{precio}{!f.ing?.elaboracion && f.ing && f.ing.mermaPct > 0 ? ` · merma ${f.ing.mermaPct} %` : ''}</span>}
                  </p>
                </button>
                <input
                  value={f.cantidad}
                  onChange={ev => setLineas(l => l.map((x, k) => (k === i ? { ...x, cantidad: ev.target.value } : x)))}
                  placeholder="c/s" autoFocus={f.cantidad === ''} title="Cantidad, o un texto: c/s, 6 granos…"
                  className={`${campo} w-24 text-right font-mono`}
                />
                <span className="w-6 text-xs text-slate-400">{esNumero(f.cantidad) ? f.ing?.unidadBase : ''}</span>
                <span className="w-20 text-right text-sm font-mono tabular-nums text-white">{f.coste !== null ? eur(f.coste / divisor) : f.conCantidad ? '—' : <span className="text-slate-500">no cuesta</span>}</span>
                <button onClick={() => setLineas(l => l.filter((_, k) => k !== i))} className="text-slate-500 hover:text-red-400 px-1">✕</button>
              </div>
              {editandoId === f.productoId && f.ing && (
                <div className="mt-1.5">
                  <IngredienteForm inicial={f.ing} onCancelar={() => setEditandoId(null)} onGuardado={() => { setEditandoId(null); onCambioIngredientes() }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Añadir ingrediente (o elaboración) */}
      <div className="mt-3">
        {creando ? (
          <IngredienteForm nombreInicial={busca.trim()} onCancelar={() => setCreando(false)} onGuardado={i => { setCreando(false); onCambioIngredientes(); agregar(i.id) }} />
        ) : (
          <>
            <input value={busca} onChange={ev => setBusca(ev.target.value)} placeholder="+ Añadir ingrediente o elaboración (escribe para buscar)" className={`${campo} w-full py-2.5`} />
            {nb && (
              <div className={`${tarjeta} mt-1.5 overflow-hidden`}>
                {candidatos.map(i => (
                  <button key={i.id} onClick={() => agregar(i.id)} className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5">
                    <span className="text-white">{i.elaboracion && '⚗️ '}{i.nombre}</span>
                    <span className="text-xs text-slate-500">{textoPrecio(i) ?? 'sin precio'}</span>
                  </button>
                ))}
                <button onClick={() => setCreando(true)} className="w-full px-3 py-2 text-left text-sm font-semibold text-[#4B9EDF] hover:bg-white/5 border-t border-white/10">
                  + Crear ingrediente «{busca.trim()}»
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ── Ficha técnica: partes con ingredientes y pasos, emplatado, notas y foto ─────
interface ParteEdit { clave: number; nombre: string; pasos: string; lineas: LineaEdit[] } // pasos: uno por renglón
let siguienteClave = 1
const parteNueva = (nombre = '', lineas: LineaEdit[] = []): ParteEdit => ({ clave: siguienteClave++, nombre, pasos: '', lineas })

const partesDe = (f: Ficha): ParteEdit[] => f.partes.length === 0 ? [parteNueva()] : f.partes.map(p => ({
  clave: siguienteClave++, nombre: p.nombre, pasos: p.pasos.join('\n'),
  lineas: p.lineas.map(l => ({ productoId: l.productoId, cantidad: l.texto ?? (l.cantidad > 0 ? String(l.cantidad) : 'c/s') })),
}))

const fichaBody = (partes: ParteEdit[], emplatado: string, notas: string): FichaBody => ({
  partes: partes
    .map(p => ({
      nombre: p.nombre.trim(),
      pasos: p.pasos.split('\n').map(x => x.replace(/^\s*\d+[.)-]?\s*/, '').trim()).filter(Boolean),
      lineas: p.lineas.map(l => esNumero(l.cantidad) && num(l.cantidad) > 0
        ? { productoId: l.productoId, cantidad: num(l.cantidad), texto: null }
        : { productoId: l.productoId, cantidad: 0, texto: esNumero(l.cantidad) ? 'c/s' : l.cantidad.trim() || 'c/s' }),
    }))
    .filter(p => p.nombre || p.pasos.length || p.lineas.length),
  emplatado: emplatado.trim(),
  notas: notas.trim(),
})

function FichaPartes({ partes, setPartes, ingredientes, divisor, excluirId, onCambioIngredientes, conElaboraciones }: {
  partes: ParteEdit[]
  setPartes: (f: (p: ParteEdit[]) => ParteEdit[]) => void
  ingredientes: Ingrediente[]
  divisor: number
  excluirId?: number
  onCambioIngredientes: () => void
  conElaboraciones: boolean // en un plato se puede sumar una elaboración compartida como parte
}) {
  const [usando, setUsando] = useState(false)
  const [busca, setBusca] = useState('')
  const cambiar = (clave: number, f: (p: ParteEdit) => ParteEdit) => setPartes(ps => ps.map(p => (p.clave === clave ? f(p) : p)))
  const mover = (k: number, d: -1 | 1) => setPartes(ps => {
    const n = [...ps]; const j = k + d
    if (j < 0 || j >= n.length) return ps
    ;[n[k], n[j]] = [n[j], n[k]]
    return n
  })
  const nb = norm(busca.trim())
  const elaboraciones = ingredientes.filter(i => i.elaboracion && i.id !== excluirId && (!nb || norm(i.nombre).includes(nb))).slice(0, 10)

  return (
    <div className="space-y-4">
      {partes.map((p, k) => (
        <div key={p.clave} className={`${tarjeta} p-3 space-y-3`}>
          <div className="flex items-center gap-2">
            <input value={p.nombre} onChange={ev => cambiar(p.clave, x => ({ ...x, nombre: ev.target.value }))}
              placeholder={partes.length > 1 ? 'Nombre de la parte (ej. CREMA DE MAÍZ)' : 'Nombre de la parte (opcional)'}
              className={`${campo} flex-1 font-bold uppercase tracking-wide`} />
            {partes.length > 1 && <>
              <button onClick={() => mover(k, -1)} disabled={k === 0} className="text-slate-400 px-1 disabled:opacity-30" title="Subir">▲</button>
              <button onClick={() => mover(k, 1)} disabled={k === partes.length - 1} className="text-slate-400 px-1 disabled:opacity-30" title="Bajar">▼</button>
              <button onClick={() => setPartes(ps => ps.filter(x => x.clave !== p.clave))} className="text-slate-500 hover:text-red-400 px-1" title="Quitar la parte">✕</button>
            </>}
          </div>
          <LineasReceta ingredientes={ingredientes} lineas={p.lineas} setLineas={f => cambiar(p.clave, x => ({ ...x, lineas: f(x.lineas) }))}
            divisor={divisor} excluirId={excluirId} onCambioIngredientes={onCambioIngredientes}
            vacio="Sin ingredientes. Búscalos abajo; la cantidad puede ser un número o un texto (c/s, 6 granos)." />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Elaboración · un paso por renglón</p>
            <textarea value={p.pasos} onChange={ev => cambiar(p.clave, x => ({ ...x, pasos: ev.target.value }))} rows={Math.max(3, p.pasos.split('\n').length + 1)}
              placeholder={'Hervir el maíz con el caldo 10 min.\nTriturar con la nata y la mantequilla.\nColar y rectificar de sal.'}
              className={`${campo} w-full leading-relaxed`} />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-3">
        <button onClick={() => setPartes(ps => [...ps, parteNueva()])} className="text-sm font-bold text-[#4B9EDF]">+ Parte</button>
        {conElaboraciones && <button onClick={() => setUsando(!usando)} className="text-sm font-bold text-[#4CC8A0]">⚗️ Usar una elaboración</button>}
      </div>
      {usando && (
        <div className={`${tarjeta} p-3 space-y-2`}>
          <p className="text-xs text-slate-400">La elaboración tiene su propia ficha (pestaña ⚗️ Elaboraciones). Aquí solo se pone cuánta lleva el plato.</p>
          <input value={busca} onChange={ev => setBusca(ev.target.value)} autoFocus placeholder="Buscar elaboración" className={`${campo} w-full`} />
          {elaboraciones.map(i => (
            <button key={i.id} onClick={() => { setPartes(ps => [...ps, parteNueva(i.nombre.toUpperCase(), [{ productoId: i.id, cantidad: '' }])]); setUsando(false); setBusca('') }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm hover:bg-white/5">
              <span className="text-white">⚗️ {i.nombre}</span>
              <span className="text-xs text-slate-500">{textoPrecio(i)}</span>
            </button>
          ))}
          {elaboraciones.length === 0 && <p className="text-sm text-slate-500">No hay elaboraciones con receta{nb ? ' con ese nombre' : ''}.</p>}
        </div>
      )}
    </div>
  )
}

// Foto de la ficha: se sube al momento (aparte de "Guardar")
function FotoFicha({ tipo, id, fotoAt, onCambio }: { tipo: TipoFicha; id: number; fotoAt: string | null; onCambio: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  useEffect(() => {
    if (!fotoAt) { setUrl(null); return }
    let viva = true
    let u: string | null = null
    api.escandallos.foto(tipo, id).then(b => { if (viva) { u = URL.createObjectURL(b); setUrl(u) } }).catch(() => {})
    return () => { viva = false; if (u) URL.revokeObjectURL(u) }
  }, [tipo, id, fotoAt])
  const subir = async (file: File) => {
    setError(''); setSubiendo(true)
    try { await api.escandallos.subirFoto(tipo, id, await comprimirFoto(file, 1600)); onCambio() }
    catch (e) { setError((e as Error).message) }
    finally { setSubiendo(false) }
  }
  const quitar = async () => { await api.escandallos.quitarFoto(tipo, id); onCambio() }
  return (
    <div className="flex items-center gap-3">
      {url
        ? <img src={url} alt="" className="w-28 h-28 rounded-xl object-cover border border-white/10" />
        : <div className="w-28 h-28 rounded-xl border border-dashed border-white/20 flex items-center justify-center text-3xl text-slate-600">📷</div>}
      <div className="space-y-1.5">
        <label className="block text-sm font-bold text-[#4B9EDF] cursor-pointer">
          {subiendo ? 'Subiendo…' : url ? 'Cambiar foto' : 'Subir foto'}
          <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={ev => { const f = ev.target.files?.[0]; if (f) subir(f); ev.target.value = '' }} />
        </label>
        {url && <button onClick={quitar} className="block text-xs text-slate-500 hover:text-red-400">Quitar</button>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}

// ── Detalle del plato: receta, reparto del coste y precio objetivo ─────────────

function DetallePlato({ menuItemId, restaurantId, onClose }: { menuItemId: number; restaurantId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: detalle } = useQuery({ queryKey: ['escandallo', menuItemId], queryFn: () => api.escandallos.detalle(menuItemId) })
  const { data: ingredientes = [] } = useQuery({ queryKey: ['escandallo-ingredientes', restaurantId], queryFn: () => api.escandallos.ingredientes(restaurantId) })

  const [partes, setPartes] = useState<ParteEdit[] | null>(null)
  const [emplatado, setEmplatado] = useState('')
  const [notas, setNotas] = useState('')
  const [raciones, setRaciones] = useState('1')
  const [objetivo, setObjetivo] = useState('')

  // Copia editable de la ficha: se carga una vez por plato
  useEffect(() => {
    if (!detalle || partes !== null) return
    setPartes(partesDe(detalle))
    setEmplatado(detalle.emplatado)
    setNotas(detalle.notas)
    setRaciones(String(detalle.raciones))
    setObjetivo(String(detalle.verde))
  }, [detalle, partes])

  const porId = useMemo(() => new Map(ingredientes.map(i => [i.id, i])), [ingredientes])
  const filas = calcularFilas((partes ?? []).flatMap(p => p.lineas), porId)
  const nRaciones = num(raciones) > 0 ? num(raciones) : 1
  const costeTotal = filas.reduce((s, f) => s + (f.coste ?? 0), 0) / nRaciones
  const sinPrecio = new Set(filas.filter(f => f.sinPrecio).map(f => f.productoId)).size
  const hayReceta = filas.some(f => f.conCantidad)
  const sinIva = detalle?.precioSinIva ?? 0
  const foodCost = hayReceta && sinIva > 0 ? (costeTotal / sinIva) * 100 : null
  const estado: EstadoEscandallo = !hayReceta || foodCost === null ? 'sin_receta' : sinPrecio > 0 ? 'incompleta' : estadoDe(foodCost, detalle?.verde ?? 30, detalle?.ambar ?? 35)
  const precioObjetivo = hayReceta && num(objetivo) > 0 && detalle ? (costeTotal / (num(objetivo) / 100)) * (1 + detalle.tasaIva / 100) : null

  const guardar = useMutation({
    mutationFn: () => api.escandallos.guardar(menuItemId, { raciones: nRaciones, ...fichaBody(partes ?? [], emplatado, notas) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escandallos'] })
      qc.invalidateQueries({ queryKey: ['escandallo', menuItemId] })
      onClose()
    },
  })

  const refrescarIngredientes = () => {
    qc.invalidateQueries({ queryKey: ['escandallo-ingredientes'] })
    qc.invalidateQueries({ queryKey: ['escandallos'] })
    qc.invalidateQueries({ queryKey: ['elaboraciones'] })
  }
  // El mismo ingrediente en varias partes (la mantequilla, la nata) suma en una sola barra
  const porIngrediente = new Map<number, (typeof filas)[number]>()
  for (const f of filas) {
    if (f.coste === null) continue
    const a = porIngrediente.get(f.productoId)
    porIngrediente.set(f.productoId, a ? { ...a, coste: (a.coste ?? 0) + f.coste } : f)
  }
  const ranking = [...porIngrediente.values()].sort((a, b) => (b.coste ?? 0) - (a.coste ?? 0))
  const maxCoste = ranking[0]?.coste ?? 0
  const e = ESTADO[estado]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[#0f1a2e] border-l border-[#4B9EDF]/40 text-slate-200" onClick={ev => ev.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0f1a2e] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{detalle?.categoria ?? '…'}</p>
            <h2 className="text-xl font-black text-white truncate">{detalle?.nombre ?? 'Cargando…'}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl px-2">✕</button>
        </div>

        {detalle && partes !== null && (
          <div className="p-5 space-y-5">
            {/* Resumen en vivo: cambia mientras se edita la receta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { t: 'PVP', v: eur(detalle.precio), s: `${eur(sinIva)} sin IVA`, c: 'text-white' },
                { t: 'Coste', v: hayReceta ? eur(costeTotal) : '—', s: nRaciones !== 1 ? 'por ración' : 'materia prima', c: 'text-white' },
                { t: 'Food cost', v: foodCost === null ? '—' : `${foodCost.toFixed(1)} %`, s: e.etiqueta, c: e.texto },
                { t: 'Margen bruto', v: hayReceta ? eur(sinIva - costeTotal) : '—', s: 'por plato vendido', c: hayReceta && sinIva - costeTotal < 0 ? 'text-red-400' : 'text-[#4CC8A0]' },
              ].map(k => (
                <div key={k.t} className={`${tarjeta} px-3 py-2.5`}>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400">{k.t}</p>
                  <p className={`text-xl font-black font-mono tabular-nums ${k.c}`}>{k.v}</p>
                  <p className="text-[11px] text-slate-500 truncate">{k.s}</p>
                </div>
              ))}
            </div>
            {sinPrecio > 0 && (
              <p className="text-sm text-amber-300 border border-amber-400/40 bg-amber-400/10 rounded-xl px-3 py-2">
                {sinPrecio === 1 ? 'Hay 1 ingrediente' : `Hay ${sinPrecio} ingredientes`} sin precio de coste: el coste real es mayor que el que se muestra. Toca su nombre para ponérselo.
              </p>
            )}

            {/* Ficha técnica */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Ficha técnica</h3>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  La receta es para
                  <input value={raciones} onChange={ev => setRaciones(ev.target.value)} inputMode="decimal" className={`${campo} w-14 text-right font-mono`} />
                  {nRaciones === 1 ? 'ración' : 'raciones'}
                </label>
              </div>
              {/* Lo primero que lee la cocina en pleno servicio */}
              <div className="rounded-2xl border border-[#4CC8A0]/40 bg-[#4CC8A0]/5 p-3 mb-4">
                <p className="text-xs font-black uppercase tracking-wider text-[#4CC8A0] mb-1">🍽 Al pase · cómo sale el plato</p>
                <p className="text-[11px] text-slate-400 mb-2">Un paso por renglón. En la cocina sale arriba de todo, antes de la preparación.</p>
                <textarea value={emplatado} onChange={ev => setEmplatado(ev.target.value)} rows={Math.max(4, emplatado.split('\n').length + 1)}
                  placeholder={'Base de velouté y crema de maíz.\n3 trozos de pulpo marcados a la plancha.\nEncurtidos, cancha y salicornia.\nBrotes y unas gotas de AOVE.'}
                  className={`${campo} w-full leading-relaxed`} />
              </div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">🔪 Preparación · mise en place</p>
              <FichaPartes partes={partes} setPartes={f => setPartes(p => f(p ?? []))} ingredientes={ingredientes} divisor={nRaciones}
                onCambioIngredientes={refrescarIngredientes} conElaboraciones />
            </div>

            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
              <FotoFicha tipo="plato" id={menuItemId} fotoAt={detalle.fotoAt} onCambio={() => qc.invalidateQueries({ queryKey: ['escandallo', menuItemId] })} />
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Notas</p>
                  <textarea value={notas} onChange={ev => setNotas(ev.target.value)} rows={2} placeholder="Conservación, reposo, mise en place…" className={`${campo} w-full leading-relaxed`} />
                </div>
              </div>
            </div>

            {/* Qué ingredientes pesan más en el coste */}
            {ranking.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Qué pesa más en el coste</h3>
                <div className="space-y-1.5">
                  {ranking.map(f => {
                    const pct = costeTotal > 0 ? ((f.coste ?? 0) / nRaciones / costeTotal) * 100 : 0
                    return (
                      <div key={f.productoId} className="flex items-center gap-3 text-sm">
                        <span className="w-36 shrink-0 truncate text-slate-300">{f.ing?.nombre}</span>
                        <div className="flex-1 h-5 rounded bg-white/5 overflow-hidden">
                          <div className="h-full rounded bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0]" style={{ width: `${maxCoste > 0 ? ((f.coste ?? 0) / maxCoste) * 100 : 0}%` }} />
                        </div>
                        <span className="w-14 text-right font-mono tabular-nums text-white">{pct.toFixed(0)} %</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Precio objetivo */}
            {hayReceta && (
              <div className={`${tarjeta} px-4 py-3 flex flex-wrap items-center gap-2 text-sm`}>
                <span className="text-slate-300">Para un food cost del</span>
                <input value={objetivo} onChange={ev => setObjetivo(ev.target.value)} inputMode="decimal" className={`${campo} w-16 text-right font-mono`} />
                <span className="text-slate-300">% el plato debería venderse a</span>
                <span className="text-lg font-black font-mono text-[#4CC8A0]">{precioObjetivo === null ? '—' : eur(precioObjetivo)}</span>
                <span className="text-slate-500">(IVA incluido)</span>
              </div>
            )}

            {guardar.isError && <p className="text-red-400 text-sm">{(guardar.error as Error).message}</p>}
            <div className="flex justify-end gap-2 pb-6">
              <button onClick={onClose} className="text-sm text-slate-400 px-4 py-2.5">Cerrar sin guardar</button>
              <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="text-sm font-bold bg-[#4CC8A0] text-[#0f1a2e] rounded-xl px-5 py-2.5 disabled:opacity-50">
                {guardar.isPending ? 'Guardando…' : 'Guardar ficha'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ⚗️ Elaboraciones: receta por tanda de salsas, fondos, premixes… ─────────────
const fmtCant = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
// La tanda se escribe en kg / l / ud y se guarda en la unidad base (g / ml / ud)
const porUnidadBase = (unidad: string) => (unidad === 'kg' || unidad === 'l' ? 1000 : 1)

function DetalleElaboracion({ productoId, restaurantId, onClose }: { productoId: number; restaurantId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: detalle } = useQuery({ queryKey: ['elaboracion', productoId], queryFn: () => api.escandallos.elaboracion(productoId) })
  const { data: ingredientes = [] } = useQuery({ queryKey: ['escandallo-ingredientes', restaurantId], queryFn: () => api.escandallos.ingredientes(restaurantId) })
  const [partes, setPartes] = useState<ParteEdit[] | null>(null)
  const [notas, setNotas] = useState('')
  const [rinde, setRinde] = useState('')

  useEffect(() => {
    if (!detalle || partes !== null) return
    setPartes(partesDe(detalle))
    setNotas(detalle.notas)
    setRinde(detalle.rendimiento ? String(detalle.rendimiento / porUnidadBase(detalle.unidad)) : '')
  }, [detalle, partes])

  const porId = useMemo(() => new Map(ingredientes.map(i => [i.id, i])), [ingredientes])
  const filas = calcularFilas((partes ?? []).flatMap(p => p.lineas), porId)
  const costeTanda = filas.reduce((s, f) => s + (f.coste ?? 0), 0)
  const sinPrecio = new Set(filas.filter(f => f.sinPrecio).map(f => f.productoId)).size
  const rindeNum = num(rinde)
  const conCoste = filas.some(f => f.conCantidad)
  const porUnidad = rindeNum > 0 && conCoste ? costeTanda / rindeNum : null
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['escandallo-ingredientes'] })
    qc.invalidateQueries({ queryKey: ['escandallos'] })
    qc.invalidateQueries({ queryKey: ['elaboraciones'] })
  }
  const guardar = useMutation({
    mutationFn: () => api.escandallos.guardarElaboracion(productoId, {
      rendimiento: rindeNum > 0 ? rindeNum * porUnidadBase(detalle!.unidad) : null,
      ...fichaBody(partes ?? [], '', notas),
    }),
    onSuccess: () => { refrescar(); qc.invalidateQueries({ queryKey: ['elaboracion', productoId] }); onClose() },
  })
  const listo = rindeNum > 0 || !conCoste

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[#0f1a2e] border-l border-[#4B9EDF]/40 text-slate-200" onClick={ev => ev.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0f1a2e] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400 uppercase tracking-wider">⚗️ Elaboración · {detalle?.categoria ?? '…'}</p>
            <h2 className="text-xl font-black text-white truncate">{detalle?.nombre ?? 'Cargando…'}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl px-2">✕</button>
        </div>

        {detalle && partes !== null && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <div className={`${tarjeta} px-3 py-2.5`}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Coste de la tanda</p>
                <p className="text-xl font-black font-mono tabular-nums text-white">{conCoste ? eur(costeTanda) : '—'}</p>
              </div>
              <div className={`${tarjeta} px-3 py-2.5`}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">Coste por {detalle.unidad}</p>
                <p className="text-xl font-black font-mono tabular-nums text-[#4CC8A0]">{porUnidad === null ? '—' : eur(porUnidad)}</p>
                <p className="text-[11px] text-slate-500">es lo que cuesta en cada plato</p>
              </div>
            </div>
            {sinPrecio > 0 && (
              <p className="text-sm text-amber-300 border border-amber-400/40 bg-amber-400/10 rounded-xl px-3 py-2">
                {sinPrecio === 1 ? 'Hay 1 ingrediente' : `Hay ${sinPrecio} ingredientes`} sin precio: los platos que la llevan salen como "falta algún precio".
              </p>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Ficha de la tanda</h3>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Salen
                  <input value={rinde} onChange={ev => setRinde(ev.target.value)} inputMode="decimal" placeholder="0" className={`${campo} w-20 text-right font-mono ${listo ? '' : 'border-amber-400'}`} />
                  {detalle.unidad}
                </label>
              </div>
              <FichaPartes partes={partes} setPartes={f => setPartes(p => f(p ?? []))} ingredientes={ingredientes} divisor={1} excluirId={productoId}
                onCambioIngredientes={refrescar} conElaboraciones={false} />
            </div>

            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
              <FotoFicha tipo="elab" id={productoId} fotoAt={detalle.fotoAt} onCambio={() => qc.invalidateQueries({ queryKey: ['elaboracion', productoId] })} />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Notas</p>
                <textarea value={notas} onChange={ev => setNotas(ev.target.value)} rows={3} placeholder="Conservación, reposo (ej. reposar mínimo 24 h en frío), envasado…" className={`${campo} w-full leading-relaxed`} />
              </div>
            </div>

            {detalle.usadaEn.length > 0 && (
              <p className="text-xs text-slate-400">Se usa en: {detalle.usadaEn.join(' · ')}</p>
            )}

            {guardar.isError && <p className="text-red-400 text-sm">{(guardar.error as Error).message}</p>}
            {!listo && <p className="text-amber-300 text-xs text-right">Falta cuánto sale de la tanda</p>}
            <div className="flex justify-end gap-2 pb-6">
              <button onClick={onClose} className="text-sm text-slate-400 px-4 py-2.5">Cerrar sin guardar</button>
              <button onClick={() => guardar.mutate()} disabled={guardar.isPending || !listo} className="text-sm font-bold bg-[#4CC8A0] text-[#0f1a2e] rounded-xl px-5 py-2.5 disabled:opacity-50">
                {guardar.isPending ? 'Guardando…' : 'Guardar ficha'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ElaboracionesVista({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()
  const { data: lista = [], isLoading, error } = useQuery({ queryKey: ['elaboraciones'], queryFn: api.escandallos.elaboraciones })
  const [abierta, setAbierta] = useState<number | null>(null)
  const [nueva, setNueva] = useState<{ nombre: string; unidad: 'kg' | 'l' | 'ud'; produccion: 'cocina' | 'sala' } | null>(null)
  const crear = useMutation({
    mutationFn: () => api.escandallos.crearElaboracion({ ...nueva!, nombre: nueva!.nombre.trim() }),
    onSuccess: r => { setNueva(null); qc.invalidateQueries({ queryKey: ['elaboraciones'] }); qc.invalidateQueries({ queryKey: ['escandallo-ingredientes'] }); setAbierta(r.id) },
  })
  const pill = (activo: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold ${activo ? 'bg-[#4CC8A0] text-[#0f1a2e]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`

  const fila = (e: Elaboracion) => {
    const sinReceta = e.ingredientes === 0
    return (
      <tr key={e.id} onClick={() => setAbierta(e.id)} className="cursor-pointer hover:bg-white/5 border-t border-white/5">
        <td className="pl-4 pr-2 py-2.5">
          <p className="font-semibold text-white">⚗️ {e.nombre}</p>
          <p className="text-[11px] text-slate-500">{e.categoria}{e.produccion ? ` · la hace ${e.produccion}` : ''}</p>
        </td>
        <td className="px-2 py-2.5 text-right text-slate-400 text-xs">
          {sinReceta ? '—' : `${e.ingredientes} ingr. · salen ${e.rendimiento ? fmtCant(e.rendimiento / porUnidadBase(e.unidad)) : '?'} ${e.unidad}`}
        </td>
        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
          {sinReceta ? <span className="text-xs text-slate-500">sin receta · <span className="text-[#4B9EDF] font-semibold">crear</span></span>
            : e.precioPorUnidad === null ? <span className="text-xs text-amber-300">falta algún precio</span>
            : <span className="font-bold text-[#4CC8A0]">{eur(e.precioPorUnidad)} / {e.unidad}</span>}
        </td>
        <td className="px-2 py-2.5 text-right text-xs text-slate-400">{e.usadaEn ? `en ${e.usadaEn} ${e.usadaEn === 1 ? 'receta' : 'recetas'}` : 'sin usar'}</td>
        <td className="pr-4 pl-1 py-2.5 text-slate-500">›</td>
      </tr>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Lo que se prepara en casa y entra en varios platos (salsas, fondos, premixes). Se escribe la receta de una tanda y cuánto sale;
        su coste por kg pasa solo a cada plato que la lleva, y si sube un ingrediente se encarecen todos.
      </p>
      {nueva ? (
        <div className={`${tarjeta} p-3 flex flex-wrap items-center gap-2`}>
          <input value={nueva.nombre} onChange={ev => setNueva({ ...nueva, nombre: ev.target.value })} autoFocus placeholder="Nombre (ej. Salsa brava)" className={`${campo} flex-1 min-w-[180px]`} />
          <span className="text-xs text-slate-400">se mide en</span>
          {(['kg', 'l', 'ud'] as const).map(u => <button key={u} onClick={() => setNueva({ ...nueva, unidad: u })} className={pill(nueva.unidad === u)}>{u}</button>)}
          <span className="text-xs text-slate-400 ml-2">la hace</span>
          {(['cocina', 'sala'] as const).map(u => <button key={u} onClick={() => setNueva({ ...nueva, produccion: u })} className={pill(nueva.produccion === u)}>{u}</button>)}
          <button onClick={() => crear.mutate()} disabled={!nueva.nombre.trim() || crear.isPending} className="ml-auto text-sm font-bold bg-[#4CC8A0] text-[#0f1a2e] rounded-xl px-4 py-2 disabled:opacity-50">Crear</button>
          <button onClick={() => setNueva(null)} className="text-sm text-slate-400 px-2">Cancelar</button>
          {crear.isError && <p className="w-full text-red-400 text-xs">{(crear.error as Error).message}</p>}
        </div>
      ) : (
        <button onClick={() => setNueva({ nombre: '', unidad: 'kg', produccion: 'cocina' })} className="text-sm font-bold text-[#4B9EDF]">+ Nueva elaboración</button>
      )}
      <div className={`${tarjeta} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-slate-400">
              <th className="pl-4 pr-2 py-2.5 text-left font-medium">Elaboración</th>
              <th className="px-2 py-2.5 text-right font-medium">Tanda</th>
              <th className="px-2 py-2.5 text-right font-medium">Coste</th>
              <th className="px-2 py-2.5 text-right font-medium">Se usa</th>
              <th />
            </tr>
          </thead>
          <tbody>{lista.map(fila)}</tbody>
        </table>
        {isLoading && <p className="px-4 py-6 text-sm text-slate-500">Cargando…</p>}
        {error && <p className="px-4 py-6 text-sm text-red-400">{(error as Error).message}</p>}
        {!isLoading && !error && lista.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Todavía no hay elaboraciones.</p>}
      </div>
      {abierta !== null && <DetalleElaboracion key={abierta} productoId={abierta} restaurantId={restaurantId} onClose={() => setAbierta(null)} />}
    </div>
  )
}

// ── Página: matriz de platos ───────────────────────────────────────────────────
type Orden = 'peor' | 'margen' | 'nombre'
const PESO_ESTADO: Record<EstadoEscandallo, number> = { rojo: 0, ambar: 1, incompleta: 2, verde: 3, sin_receta: 4 }

export default function EscandallosPage() {
  const qc = useQueryClient()
  const [conSesion, setConSesion] = useState(() => !!sessionStorage.getItem(ADMIN_TOKEN_KEY))
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const [ridSel, setRidSel] = useState<number | null>(null)
  const rid = ridSel ?? restaurantes[0]?.id ?? null

  const matriz = useQuery({
    queryKey: ['escandallos', rid],
    queryFn: () => api.escandallos.matriz(rid!),
    enabled: conSesion && rid !== null,
    retry: false,
  })
  const [grupoSel, setGrupoSel] = useState<string | null>(null)
  const [soloEstado, setSoloEstado] = useState<EstadoEscandallo | null>(null)
  const [orden, setOrden] = useState<Orden>('peor')
  const [porCategoria, setPorCategoria] = useState(true)
  const [vista, setVista] = useState<'platos' | 'elaboraciones'>('platos')
  const [catSel, setCatSel] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [umbrales, setUmbrales] = useState<{ verde: string; ambar: string } | null>(null)

  const guardarUmbrales = useMutation({
    mutationFn: () => api.escandallos.umbrales({ verde: num(umbrales!.verde), ambar: num(umbrales!.ambar) }),
    onSuccess: () => { setUmbrales(null); qc.invalidateQueries({ queryKey: ['escandallos'] }) },
  })

  // Token ausente o caducado → se vuelve a pedir el PIN
  const sesionCaida = matriz.isError && /sesi[oó]n|401|administraci/i.test((matriz.error as Error).message)
  if (!conSesion || sesionCaida) {
    return (
      <div className="min-h-full bg-[#0f1a2e] p-4">
        <PinServidor onOk={() => { setConSesion(true); qc.invalidateQueries({ queryKey: ['escandallos'] }) }} />
      </div>
    )
  }

  const platos = matriz.data?.platos ?? []
  const grupos = [...new Set(platos.map(p => p.grupo).filter(Boolean))]
  const grupo = grupoSel ?? grupos.find(g => /comida/i.test(g)) ?? grupos[0] ?? null
  const delSeccion = platos.filter(p => p.grupo === grupo)
  // Categorías de la sección en el orden de la carta
  const categorias = [...new Map(delSeccion.map(p => [p.categoria, p.categoriaOrden])).entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'es')).map(([c]) => c)
  const cat = catSel !== null && categorias.includes(catSel) ? catSel : null
  const delGrupo = cat === null ? delSeccion : delSeccion.filter(p => p.categoria === cat)
  const conCoste = delGrupo.filter(p => p.coste !== null && p.foodCost !== null)
  const visibles = delGrupo
    .filter(p => soloEstado === null || p.estado === soloEstado)
    .sort((a, b) =>
      orden === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es')
        : orden === 'margen' ? (b.margen ?? -Infinity) - (a.margen ?? -Infinity)
        : PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado] || (b.foodCost ?? 0) - (a.foodCost ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))

  const media = conCoste.length ? conCoste.reduce((s, p) => s + (p.foodCost ?? 0), 0) / conCoste.length : null
  const cuenta = (e: EstadoEscandallo) => delGrupo.filter(p => p.estado === e).length
  const mejor = [...conCoste].sort((a, b) => (b.margen ?? 0) - (a.margen ?? 0))[0]
  const verde = matriz.data?.verde ?? 30
  const ambar = matriz.data?.ambar ?? 35
  const foodCostMedio = (ps: EscandalloPlato[]) => {
    const c = ps.filter(p => p.foodCost !== null)
    return c.length ? c.reduce((s, p) => s + (p.foodCost ?? 0), 0) / c.length : null
  }
  const bloques: { categoria: string | null; platos: EscandalloPlato[] }[] = porCategoria
    ? categorias.map(c => ({ categoria: c, platos: visibles.filter(p => p.categoria === c) })).filter(b => b.platos.length > 0)
    : [{ categoria: null, platos: visibles }]
  const cabecera = (c: string, ps: EscandalloPlato[]) => {
    const todos = delGrupo.filter(p => p.categoria === c)
    const con = todos.filter(p => p.estado !== 'sin_receta').length
    const m = foodCostMedio(todos)
    return (
      <tr key={`cat-${c}`} className="bg-white/[0.03] border-t border-white/10">
        <td colSpan={8} className="px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-white">{c}</span>
            <span className="text-[11px] text-slate-500">{con} / {todos.length} con escandallo{ps.length < todos.length ? ` · se ven ${ps.length}` : ''}</span>
            {m !== null && <span className={`ml-auto text-[11px] font-mono font-bold ${ESTADO[estadoDe(m, verde, ambar)].texto}`}>food cost medio {m.toFixed(1)} %</span>}
          </div>
        </td>
      </tr>
    )
  }
  const pill = (activo: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activo ? 'bg-[#4CC8A0] text-[#0f1a2e]' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`

  const fila = (p: EscandalloPlato) => {
    const e = ESTADO[p.estado]
    return (
      <tr key={p.id} onClick={() => setAbierto(p.id)} className="cursor-pointer hover:bg-white/5 border-t border-white/5">
        <td className="pl-4 pr-2 py-2.5"><span className={`block w-3 h-3 rounded-full ${e.punto}`} title={e.etiqueta} /></td>
        <td className="px-2 py-2.5">
          <p className="font-semibold text-white">{p.nombre}{p.restaurantId === null && <span className="ml-1.5 text-[10px] text-slate-500" title="Plato global">🌐</span>}</p>
          {!porCategoria && <p className="text-[11px] text-slate-500">{p.categoria}</p>}
        </td>
        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-slate-200">{eur(p.precio)}</td>
        <td className="hidden md:table-cell px-2 py-2.5 text-right font-mono tabular-nums text-slate-500">{eur(p.precioSinIva)}</td>
        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-white">{p.coste === null ? '—' : eur(p.coste)}</td>
        <td className="px-2 py-2.5 w-[26%] min-w-[150px]">
          {p.foodCost === null ? (
            <span className="text-xs text-slate-500">sin escandallo · <span className="text-[#4B9EDF] font-semibold">crear</span></span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${e.barra}`} style={{ width: `${Math.min(100, (p.foodCost / 60) * 100)}%` }} />
              </div>
              <span className={`w-14 text-right font-mono tabular-nums font-bold ${e.texto}`}>{p.foodCost.toFixed(1)} %</span>
            </div>
          )}
          {p.estado === 'incompleta' && <p className="text-[10px] text-amber-300 mt-0.5">falta el precio de {p.sinPrecio} {p.sinPrecio === 1 ? 'ingrediente' : 'ingredientes'}</p>}
        </td>
        <td className={`px-2 py-2.5 text-right font-mono tabular-nums font-bold ${p.margen === null ? 'text-slate-600' : p.margen < 0 ? 'text-red-400' : 'text-[#4CC8A0]'}`}>{p.margen === null ? '—' : eur(p.margen)}</td>
        <td className="pr-4 pl-1 py-2.5 text-slate-500">›</td>
      </tr>
    )
  }

  return (
    <div className="min-h-full bg-[#0f1a2e] text-slate-200 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Recetas y costes</h1>
          <p className="text-sm text-slate-400">La ficha técnica de cada plato y elaboración (partes, pasos, emplatado, foto) con su coste, food cost y margen. Precios de venta sin IVA ({matriz.data?.tasaIva ?? 10} %).</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {restaurantes.map(r => <button key={r.id} onClick={() => { setRidSel(r.id); setGrupoSel(null); setCatSel(null) }} className={pill(rid === r.id)}>{r.nombre}</button>)}
        </div>
      </div>

      <div className="flex gap-1.5">
        <button onClick={() => setVista('platos')} className={pill(vista === 'platos')}>🍽 Platos</button>
        <button onClick={() => setVista('elaboraciones')} className={pill(vista === 'elaboraciones')}>⚗️ Elaboraciones</button>
      </div>

      {vista === 'elaboraciones' && rid !== null && <ElaboracionesVista restaurantId={rid} />}
      {vista === 'platos' && <>
      {/* Cifras de la sección elegida */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${tarjeta} px-4 py-3`}>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Food cost medio</p>
          <p className={`text-3xl font-black font-mono tabular-nums ${media === null ? 'text-slate-600' : ESTADO[estadoDe(media, verde, ambar)].texto}`}>{media === null ? '—' : `${media.toFixed(1)} %`}</p>
          <p className="text-[11px] text-slate-500">media simple de los platos con escandallo</p>
        </div>
        <div className={`${tarjeta} px-4 py-3`}>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Platos no rentables</p>
          <p className={`text-3xl font-black font-mono tabular-nums ${cuenta('rojo') > 0 ? 'text-red-400' : 'text-[#4CC8A0]'}`}>{cuenta('rojo')}</p>
          <p className="text-[11px] text-slate-500">{cuenta('ambar')} con el margen ajustado</p>
        </div>
        <div className={`${tarjeta} px-4 py-3`}>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Con escandallo</p>
          <p className="text-3xl font-black font-mono tabular-nums text-white">{delGrupo.length - cuenta('sin_receta')}<span className="text-lg text-slate-500"> / {delGrupo.length}</span></p>
          <p className="text-[11px] text-slate-500">{cuenta('sin_receta')} platos por cargar</p>
        </div>
        <div className={`${tarjeta} px-4 py-3`}>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">Mayor margen por plato</p>
          <p className="text-xl font-black text-white truncate">{mejor?.nombre ?? '—'}</p>
          <p className="text-[11px] text-[#4CC8A0] font-mono">{mejor?.margen != null ? eur(mejor.margen) : ''}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {grupos.map(g => <button key={g} onClick={() => { setGrupoSel(g); setCatSel(null) }} className={pill(grupo === g)}>{g}</button>)}
        <span className="w-px h-5 bg-white/10 mx-1" />
        {(['rojo', 'ambar', 'verde', 'sin_receta'] as EstadoEscandallo[]).map(e => (
          <button key={e} onClick={() => setSoloEstado(soloEstado === e ? null : e)} className={`flex items-center gap-1.5 ${pill(soloEstado === e)}`}>
            <span className={`w-2 h-2 rounded-full ${ESTADO[e].punto}`} />{ESTADO[e].etiqueta} · {cuenta(e)}
          </button>
        ))}
        <select value={orden} onChange={e => setOrden(e.target.value as Orden)} className={`${campo} ml-auto`}>
          <option value="peor">Peor primero</option>
          <option value="margen">Mayor margen</option>
          <option value="nombre">Por nombre</option>
        </select>
        <button onClick={() => setPorCategoria(!porCategoria)} className={pill(porCategoria)}>▤ Por categoría</button>
      </div>
      {categorias.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setCatSel(null)} className={pill(cat === null)}>Todas</button>
          {categorias.map(c => <button key={c} onClick={() => setCatSel(c)} className={pill(cat === c)}>{c}</button>)}
        </div>
      )}

      {/* Matriz */}
      <div className={`${tarjeta} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-slate-400">
              <th className="pl-4 pr-2 py-2.5" />
              <th className="px-2 py-2.5 text-left font-medium">Plato</th>
              <th className="px-2 py-2.5 text-right font-medium">PVP</th>
              <th className="hidden md:table-cell px-2 py-2.5 text-right font-medium">Sin IVA</th>
              <th className="px-2 py-2.5 text-right font-medium">Coste</th>
              <th className="px-2 py-2.5 text-left font-medium">Food cost</th>
              <th className="px-2 py-2.5 text-right font-medium">Margen</th>
              <th />
            </tr>
          </thead>
          <tbody>{bloques.map(b => b.categoria === null ? b.platos.map(fila) : [cabecera(b.categoria, b.platos), ...b.platos.map(fila)])}</tbody>
        </table>
        {matriz.isLoading && <p className="px-4 py-6 text-sm text-slate-500">Cargando…</p>}
        {matriz.isError && !sesionCaida && <p className="px-4 py-6 text-sm text-red-400">{(matriz.error as Error).message}</p>}
        {!matriz.isLoading && !matriz.isError && visibles.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No hay platos con ese filtro.</p>}
      </div>

      {/* Semáforo */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {umbrales === null ? (
          <>
            <span>Semáforo: verde hasta {verde} % · ámbar hasta {ambar} % · rojo por encima.</span>
            <button onClick={() => setUmbrales({ verde: String(verde), ambar: String(ambar) })} className="text-[#4B9EDF] font-semibold">Cambiar</button>
          </>
        ) : (
          <>
            <span>Verde hasta</span>
            <input value={umbrales.verde} onChange={e => setUmbrales({ ...umbrales, verde: e.target.value })} className={`${campo} w-16 text-right font-mono`} />
            <span>% · ámbar hasta</span>
            <input value={umbrales.ambar} onChange={e => setUmbrales({ ...umbrales, ambar: e.target.value })} className={`${campo} w-16 text-right font-mono`} />
            <span>%</span>
            <button onClick={() => guardarUmbrales.mutate()} disabled={!(num(umbrales.verde) > 0 && num(umbrales.ambar) >= num(umbrales.verde))} className="font-bold text-[#4CC8A0] disabled:opacity-40">Guardar</button>
            <button onClick={() => setUmbrales(null)}>Cancelar</button>
            {guardarUmbrales.isError && <span className="text-red-400">{(guardarUmbrales.error as Error).message}</span>}
          </>
        )}
      </div>

      </>}

      {abierto !== null && rid !== null && <DetallePlato key={abierto} menuItemId={abierto} restaurantId={rid} onClose={() => setAbierto(null)} />}
    </div>
  )
}
