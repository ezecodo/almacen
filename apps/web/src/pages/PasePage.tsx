import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, ItemAgotado, MenuCategoria, MenuItem, MesaPase, Pase, PlatoPase } from '../api'
import { enModoLocal } from '../lib/conexion'
import { nombreNivel } from '../components/NivelEtiqueta'
import CheckOverlay from '../components/CheckOverlay'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'

// Pantalla de pase (/pase/mesas): la misma en la tablet de abajo y en la de arriba. Una tarjeta por
// mesa, la que más lleva esperando primero. Un toque en un plato: 🟡 en cocina → 🟢 listo (jefe de
// cocina) → ⚪ servido (el del pase). Mantener apretado: marcar solo algunos o deshacer.
// 🔔 Sigue = "porfa, la 8 sigue": lo pide el camarero que ve la demora, desde su mesa en la sala. La tarjeta
// late en las dos tablets hasta que cocina marque algo listo de esa mesa.
// Seguimiento: arriba el resumen del servicio; en cada mesa, cómo va y qué falta. Dos avisos: un plato
// listo que nadie recoge (se enfría en el pase) y el plato que retiene a una mesa con su nivel ya listo.
// 🚫 ALTO: el jefe de cocina o el encargado (Num + Enter, o el botón de arriba) elige un plato de la carta
// y se agota igual que desde el panel 💼: sale ALTO en las impresoras y la sala ya no lo puede pedir.
// También sin tocar la pantalla: un cursor que se maneja con el teclado (ver TECLAS). Las teclas solo
// dicen qué acción quieren; un joystick se conectaría a las mismas acciones.

const PLANTA_KEY = 'pase_planta' // cada tablet recuerda la suya
const APRETADO_MS = 450
const DOBLE_TOQUE_MS = 600 // un toque nervioso no se salta de en cocina a servido
const VERDE_ESPERA_MIN = 5  // listo y sin recoger: se está enfriando
const RETENIDO_MIN = 10     // lo que falta de un nivel que ya está casi listo
// Una mesa dura hora y media o dos: lo que preocupa no es el tiempo total sino el que lleva sin salirle
// nada de cocina
const CIERRE_MESA_MS = 1000 // tras marcar, la mesa se cierra sola: Enter, Enter y a la siguiente
const CIERRE_SIN_TOCAR_MS = 4000 // abierta sin marcar nada: lo justo para leerla
const SIN_SALIR_AMBAR_MIN = 20
const SIN_SALIR_ROJO_MIN = 35

type Accion = 'arriba' | 'abajo' | 'izquierda' | 'derecha' | 'entrar' | 'salir' | 'deshacer' | 'alto' | 'planta'
const NUM_ENTER_MS = 800 // Num y luego Enter, seguidas: abre los altos
const TECLAS: Record<string, Accion> = {
  ArrowUp: 'arriba', ArrowDown: 'abajo', ArrowLeft: 'izquierda', ArrowRight: 'derecha',
  Numpad8: 'arriba', Numpad2: 'abajo', Numpad4: 'izquierda', Numpad6: 'derecha',
  NumpadEnter: 'entrar', Enter: 'entrar',
  NumLock: 'salir', Escape: 'salir', // se lee la tecla física: que Bloq Num cambie de estado no afecta a las demás
  NumpadDecimal: 'deshacer', Backspace: 'deshacer',
  NumpadMultiply: 'planta',
}

// La tarjeta más cercana en esa dirección, tal como se ven en pantalla (las columnas tienen alturas distintas)
function mesaVecina(actual: number | null, dir: Accion) {
  const cajas = [...document.querySelectorAll<HTMLElement>('[data-mesa]')].map(el => ({ id: Number(el.dataset.mesa), r: el.getBoundingClientRect() }))
  const yo = cajas.find(c => c.id === actual)
  if (!yo) return cajas[0]?.id ?? null
  const centro = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  const o = centro(yo.r)
  let mejor = { id: yo.id, nota: Infinity }
  for (const c of cajas) {
    if (c.id === yo.id) continue
    const { x, y } = centro(c.r)
    const horizontal = dir === 'izquierda' || dir === 'derecha'
    const avance = (horizontal ? x - o.x : y - o.y) * (dir === 'izquierda' || dir === 'arriba' ? -1 : 1)
    if (avance <= 1) continue
    const nota = avance + Math.abs(horizontal ? y - o.y : x - o.x) * 2
    if (nota < mejor.nota) mejor = { id: c.id, nota }
  }
  return mejor.id
}

const minutosDesde = (iso: string, ahora: number) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000))
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
// La banda del número es un semáforo: verde sobrio si la mesa va bien, y más caliente cuanto más lleva sin
// salirle nada. Es un verde oscuro para que el verde vivo de los platos listos siga saltando a la vista.
const colorBanda = (min: number | null) => (min === null || min < SIN_SALIR_AMBAR_MIN ? 'bg-emerald-900 text-white' : min < SIN_SALIR_ROJO_MIN ? 'bg-amber-400 text-slate-900' : 'bg-red-600 text-white')

// Un plato de un nivel que todavía no toca se ve neutro: lo que importa manda en color
function colorPlato(p: PlatoPase, apagado: boolean) {
  if (p.servidos >= p.cantidad) return 'bg-slate-100 border-slate-200 text-slate-400 line-through'
  if (p.listos >= p.cantidad) return 'bg-emerald-400 border-emerald-600 text-slate-900'
  if (apagado && p.listos === 0) return 'bg-white border-slate-200 text-slate-400'
  return 'bg-amber-100 border-amber-400 text-slate-900'
}

const sumar = (items: PlatoPase[], f: (p: PlatoPase) => number) => items.reduce((n, p) => n + f(p), 0)
const enCocina = (p: PlatoPase) => p.cantidad - p.listos
const porRecoger = (p: PlatoPase) => p.listos - p.servidos
// Minutos que un plato listo lleva esperando en el pase (null si no hay nada que recoger)
const minutosVerde = (p: PlatoPase, ahora: number) => (porRecoger(p) > 0 && p.listoAt ? minutosDesde(p.listoAt, ahora) : null)
const seEnfria = (p: PlatoPase, ahora: number) => (minutosVerde(p, ahora) ?? 0) >= VERDE_ESPERA_MIN

// Toque: lo siguiente que le toca a toda la línea
const siguiente = (p: PlatoPase) => (p.listos < p.cantidad ? { listos: p.cantidad, servidos: p.servidos } : { listos: p.listos, servidos: p.cantidad })

function Plato({ p, apagado, ahora, retenido, cursor, onMarcar, onDetalle }: { p: PlatoPase; apagado: boolean; ahora: number; retenido: boolean; cursor: boolean; onMarcar: (listos: number, servidos: number) => void; onDetalle: () => void }) {
  const reloj = useRef<number>()
  const largo = useRef(false)
  const ultimo = useRef(0)
  const empezar = () => {
    largo.current = false
    reloj.current = window.setTimeout(() => { largo.current = true; navigator.vibrate?.(30); onDetalle() }, APRETADO_MS)
  }
  const soltar = () => window.clearTimeout(reloj.current)
  const tocar = () => {
    if (largo.current || Date.now() - ultimo.current < DOBLE_TOQUE_MS || p.servidos >= p.cantidad) return
    ultimo.current = Date.now()
    const s = siguiente(p)
    onMarcar(s.listos, s.servidos)
  }
  const parcial = p.cantidad > 1 && (p.listos > 0 && p.listos < p.cantidad || p.servidos > 0 && p.servidos < p.cantidad)
  return (
    <button onPointerDown={empezar} onPointerUp={soltar} onPointerLeave={soltar} onPointerCancel={soltar} onClick={tocar}
      onContextMenu={e => e.preventDefault()}
      className={`w-full min-h-[2.75rem] 2xl:min-h-[2.25rem] border-2 px-2.5 py-1 2xl:py-0.5 text-left select-none ${colorPlato(p, apagado)} ${cursor ? 'ring-4 ring-blue-600' : retenido || seEnfria(p, ahora) ? 'ring-[3px] ring-red-600' : ''}`}>
      <span className="flex items-baseline gap-2">
        <span className="text-base font-black tabular-nums shrink-0">{p.cantidad}×</span>
        <span className="flex-1 min-w-0 text-base font-bold uppercase leading-tight">{p.nombre}</span>
      </span>
      {p.nota && <span className="block text-xs font-bold no-underline">» {p.nota}</span>}
      {parcial && <span className="block text-xs font-black text-emerald-700 no-underline">{p.listos} listos · {p.servidos} servidos</span>}
    </button>
  )
}

// Los platos de comida de la carta, por categoría y en el orden de la carta
function seccionesCarta(menu: MenuItem[], cats: MenuCategoria[]) {
  const porNombre = new Map(cats.map(c => [c.nombre, c]))
  const orden = (c: MenuCategoria) => {
    const padre = c.parentId ? cats.find(x => x.id === c.parentId) : undefined
    return padre ? padre.orden * 1000 + 1 + c.orden : c.orden * 1000
  }
  const grupos = new Map<string, MenuItem[]>()
  for (const m of menu) {
    const c = porNombre.get(m.categoria)
    if (!c || !m.activo || m.ocultoEnCarta || m.autoPorPax || /vino|bebida/i.test(c.grupo)) continue
    grupos.set(m.categoria, [...(grupos.get(m.categoria) ?? []), m])
  }
  return [...grupos.entries()].map(([nombre, platos]) => ({ nombre, platos })).sort((a, b) => orden(porNombre.get(a.nombre)!) - orden(porNombre.get(b.nombre)!))
}

function AltosPase({ secciones, cat, item, agotados, error, onElegir, onTocar, onCerrar }: {
  secciones: { nombre: string; platos: MenuItem[] }[]; cat: number; item: number; agotados: ItemAgotado[]; error: string
  onElegir: (cat: number, item: number) => void; onTocar: (m: MenuItem) => void; onCerrar: () => void
}) {
  const seccion = secciones[cat]
  useEffect(() => { document.querySelector('[data-alto-cursor]')?.scrollIntoView({ block: 'nearest' }) }, [cat, item])
  return (
    <div className="fixed inset-0 z-[37] bg-black/60 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="w-full max-w-3xl max-h-full flex flex-col bg-white text-slate-900" onClick={e => e.stopPropagation()}>
        <h2 className="px-4 py-3 bg-red-600 text-white text-2xl font-black">🚫 ALTO · ¿Qué se acabó?</h2>
        <div className="flex flex-wrap gap-1 p-2 border-b border-slate-300">
          {secciones.map((s, k) => (
            <button key={s.nombre} onClick={() => onElegir(k, 0)} className={`h-11 px-3 text-sm font-black uppercase ${k === cat ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'}`}>{s.nombre}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {seccion?.platos.map((m, k) => {
            const agotado = agotados.some(a => a.menuItemId === m.id)
            return (
              <button key={m.id} data-alto-cursor={k === item ? '' : undefined} onClick={() => onTocar(m)}
                className={`w-full min-h-[3rem] px-3 flex items-center justify-between border-2 text-lg font-bold uppercase text-left ${agotado ? 'bg-red-100 border-red-500 text-red-700 line-through' : 'bg-white border-slate-300'} ${k === item ? 'ring-4 ring-blue-600' : ''}`}>
                {m.nombre}
                {agotado && <span className="inline-block text-sm font-black no-underline">ALTO</span>}
              </button>
            )
          })}
          {!seccion && <p className="p-6 text-center text-slate-500">Cargando la carta…</p>}
        </div>
        {error && <p className="px-4 py-2 bg-red-600 text-white font-bold">{error}</p>}
        <p className="px-4 py-2 border-t border-slate-300 text-center text-sm font-semibold text-slate-600">↑↓ plato · ←→ categoría · Enter marcar o quitar el ALTO · Num salir</p>
      </div>
    </div>
  )
}

function Tarjeta({ m, ahora, elegida, ventana, platoCursor, onMarcar, onDetalle }: { m: MesaPase; ahora: number; elegida?: boolean; ventana?: boolean; platoCursor?: number | null; onMarcar: (p: PlatoPase, listos: number, servidos: number) => void; onDetalle: (p: PlatoPase) => void }) {
  const niveles = [...new Set(m.items.map(i => i.nivel))].sort((a, b) => a - b)
  // El primer nivel con algo por servir manda; los de después se ven apagados
  const enCurso = niveles.find(n => m.items.some(i => i.nivel === n && i.servidos < i.cantidad))
  const delNivel = m.items.filter(i => i.nivel === enCurso)
  // Retiene a la mesa: casi todo su nivel ya salió de cocina, este sigue y lleva rato
  const retenido = (p: PlatoPase) => p.nivel === enCurso && enCocina(p) > 0 && minutosDesde(p.enviadoAt, ahora) >= RETENIDO_MIN
    && delNivel.length > 1 && delNivel.filter(i => enCocina(i) > 0).length <= Math.floor(delNivel.length / 2)
  const total = sumar(m.items, i => i.cantidad)
  const servidos = sumar(m.items, i => i.servidos)
  const listos = sumar(m.items, porRecoger)
  const comandada = m.items.reduce((h, i) => (i.enviadoAt < h ? i.enviadoAt : h), m.items[0].enviadoAt)
  // Desde lo último que pasó en cocina: un plato comandado o uno que salió. Sin nada en cocina, no hay espera
  const ultimoMovimiento = m.items.reduce((h, i) => [i.enviadoAt, i.listoAt ?? ''].reduce((x, y) => (y > x ? y : x), h), comandada)
  const sinSalir = m.items.some(i => enCocina(i) > 0) ? minutosDesde(ultimoMovimiento, ahora) : null
  return (
    <section data-mesa={ventana ? undefined : m.comandaId}
      style={{ containerType: 'inline-size' }}
      className={`relative break-inside-avoid mb-2 scroll-mt-20 border bg-white shadow-sm overflow-hidden ${m.sigueAt ? 'border-red-500' : 'border-slate-300'} ${elegida ? 'ring-4 ring-blue-600' : ''}`}>
      {/* Late el marco, no la tarjeta: los platos se tienen que seguir leyendo */}
      {m.sigueAt && <span className="absolute inset-0 z-10 ring-4 ring-inset ring-red-500 animate-pulse pointer-events-none" />}
      {/* Lo primero que se busca desde el pase: el número de mesa, de lado a lado */}
      <header className={`text-center font-black tabular-nums leading-none py-1 ${colorBanda(sinSalir)}`} style={{ fontSize: 'min(44cqw, 8rem)' }}>
        {m.mesa ?? '—'}
      </header>
      <div className="flex items-baseline gap-2 px-2.5 py-1 border-b border-slate-200">
        <span className="text-2xl font-black tabular-nums text-slate-900">{fmtHora(comandada)}</span>
        <span className="flex-1 min-w-0 text-xs font-semibold text-slate-500 truncate">{m.pax} pax{m.camarero ? ` · ${m.camarero.split(' ')[0]}` : ''}</span>
        <span className="text-2xl font-black tabular-nums text-slate-900">{minutosDesde(comandada, ahora)}′</span>
      </div>
      {m.sigueAt && (
        <p className="px-2.5 py-1 bg-red-500 text-white text-sm font-black truncate">
          🔔 Sigue{m.siguePor ? ` · lo pide ${m.siguePor.split(' ')[0]}` : ''} · hace {minutosDesde(m.sigueAt, ahora)}′
        </p>
      )}
      {m.alergias.length > 0 && <p className="px-2.5 py-0.5 bg-red-600 text-white text-xs font-black uppercase">🚫 Alérgico: {m.alergias.join(', ')}</p>}
      {(m.noComparten || m.nota) && <p className="px-2.5 py-0.5 bg-amber-100 text-amber-900 text-xs font-bold">{[m.noComparten && 'NO COMPARTEN', m.nota].filter(Boolean).join(' · ')}</p>}
      {servidos < total && (
        <div className="flex items-center gap-2 px-2.5 pt-1">
          <div className="flex-1 flex h-2 overflow-hidden bg-amber-200">
            <span className="bg-slate-400" style={{ width: `${(servidos / total) * 100}%` }} />
            <span className="bg-emerald-500" style={{ width: `${(listos / total) * 100}%` }} />
          </div>
          <b className="text-sm tabular-nums text-slate-900">{servidos}/{total}</b>
        </div>
      )}
      <div className="px-1.5 pb-1.5 pt-1 space-y-1">
        {niveles.map(n => (
          <div key={n} className="space-y-1">
            <p className="px-1 text-[10px] font-black tracking-wider text-slate-500">{nombreNivel(n)}</p>
            {m.items.filter(i => i.nivel === n).map(p => (
              <Plato key={p.id} p={p} apagado={enCurso !== undefined && n > enCurso} ahora={ahora} retenido={retenido(p)} cursor={platoCursor === p.id} onMarcar={(l, s) => onMarcar(p, l, s)} onDetalle={() => onDetalle(p)} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

// Mantener apretado: 2 de las 3 bravas, o deshacer un toque equivocado
function DetallePlato({ mesa, p, onGuardar, onCerrar }: { mesa: number | null; p: PlatoPase; onGuardar: (listos: number, servidos: number) => void; onCerrar: () => void }) {
  const [listos, setListos] = useState(p.listos)
  const [servidos, setServidos] = useState(p.servidos)
  const fila = (texto: string, v: number, poner: (n: number) => void) => (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-xl font-bold">{texto}</span>
      <button onClick={() => poner(v - 1)} disabled={v === 0} className="w-16 h-16 bg-slate-200 text-3xl font-black disabled:opacity-30">−</button>
      <span className="w-12 text-center text-3xl font-black tabular-nums">{v}</span>
      <button onClick={() => poner(v + 1)} disabled={v === p.cantidad} className="w-16 h-16 bg-slate-200 text-3xl font-black disabled:opacity-30">+</button>
    </div>
  )
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="w-full max-w-md bg-white text-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-sm text-slate-500">Mesa {mesa ?? '—'}</p>
          <p className="text-2xl font-black uppercase leading-tight">{p.cantidad}× {p.nombre}</p>
        </div>
        {fila('🟢 Listos', listos, n => { setListos(n); setServidos(s => Math.min(s, n)) })}
        {fila('⚪ Servidos', servidos, n => { setServidos(n); setListos(l => Math.max(l, n)) })}
        <div className="flex gap-3 pt-1">
          <button onClick={() => { setListos(0); setServidos(0) }} className="h-14 px-4 bg-slate-200 font-bold">Todo en cocina</button>
          <button onClick={() => onGuardar(listos, servidos)} className="flex-1 h-14 bg-slate-900 text-white text-lg font-black">Guardar</button>
        </div>
      </div>
    </div>
  )
}

export default function PasePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sesion = (() => { try { return JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '') as { nombre: string } } catch { return null } })()
  const restaurante = (() => { try { return JSON.parse(localStorage.getItem('oidoops_restaurant') ?? '') as { id: number; nombre: string } } catch { return null } })()
  const rid = restaurante?.id ?? null
  useEffect(() => { if (!sesion || !rid) navigate('/pase', { replace: true }) }, [])
  useRestaurantEvents(sesion ? rid : null)
  const clave = ['pase', rid]
  const { data, isError } = useQuery({
    queryKey: clave, queryFn: () => api.pase.list(rid!), enabled: !!sesion && !!rid,
    refetchInterval: 15_000, retry: 1, // de respaldo, por si se pierde un aviso
  })
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [detalle, setDetalle] = useState<{ mesa: number | null; plato: PlatoPase } | null>(null)
  const [verServidas, setVerServidas] = useState(false)
  // La marca, al entrar: la viñeta del Oído con una barra de carga
  const [entrando, setEntrando] = useState(true)
  useEffect(() => { const t = setTimeout(() => setEntrando(false), 2000); return () => clearTimeout(t) }, [])
  const [planta, setPlanta] = useState(() => localStorage.getItem(PLANTA_KEY) ?? '')
  const { data: salones = [] } = useQuery({ queryKey: ['salon-planes', rid], queryFn: () => api.salon.list(rid!), enabled: !!sesion && !!rid })
  const elegirPlanta = (nombre: string) => { setPlanta(nombre); localStorage.setItem(PLANTA_KEY, nombre) }
  // Cursor del teclado: la mesa elegida y, con la mesa abierta, el plato
  const [cursor, setCursor] = useState<{ mesa: number | null; plato: number | null }>({ mesa: null, plato: null })
  const [abierta, setAbierta] = useState(false)
  const [alto, setAlto] = useState<{ cat: number; item: number } | null>(null)
  const [errorAlto, setErrorAlto] = useState('')
  const { data: menu = [] } = useQuery({ queryKey: ['menu', rid], queryFn: () => api.menu.list(rid), enabled: !!sesion && !!rid })
  const { data: menuCats = [] } = useQuery({ queryKey: ['menu-cats', rid], queryFn: () => api.menuCategorias.list(rid), enabled: !!sesion && !!rid })
  const { data: agotados = [] } = useQuery({ queryKey: ['agotados', rid], queryFn: () => api.agotados.list(rid!), enabled: !!sesion && !!rid })
  const secciones = seccionesCarta(menu, menuCats)
  const cantarAlto = useMutation({
    mutationFn: (m: MenuItem) => (agotados.some(a => a.menuItemId === m.id) ? api.agotados.reponer(rid!, m.id) : api.agotados.marcar(rid!, m.id)),
    onMutate: () => setErrorAlto(''),
    onError: () => { window.clearTimeout(cierre.current); setErrorAlto('Solo el jefe de cocina o el encargado pueden cantar un ALTO') },
    onSettled: () => qc.invalidateQueries({ queryKey: ['agotados', rid] }),
  })
  const cierre = useRef<number>()
  // Cantado el ALTO la ventana se cierra sola, igual que la mesa
  const cantar = (m: MenuItem) => {
    cantarAlto.mutate(m)
    window.clearTimeout(cierre.current)
    cierre.current = window.setTimeout(() => setAlto(null), CIERRE_MESA_MS)
  }
  const cerrarEnUnRato = (ms = CIERRE_MESA_MS) => {
    window.clearTimeout(cierre.current)
    cierre.current = window.setTimeout(() => { if (!hayDetalle.current) setAbierta(false) }, ms)
  }

  const marcar = useMutation({
    mutationFn: ({ id, listos, servidos }: { id: number; listos: number; servidos: number }) => api.pase.marcar(id, listos, servidos),
    // El color cambia al tocar, sin esperar a la red
    onMutate: async ({ id, listos, servidos }) => {
      await qc.cancelQueries({ queryKey: clave })
      const listoAt = new Date().toISOString()
      qc.setQueryData<Pase>(clave, d => d && { ...d, mesas: d.mesas.map(m => ({ ...m, items: m.items.map(i => (i.id === id ? { ...i, listos, servidos, listoAt: listos > i.listos ? listoAt : i.listoAt } : i)) })) })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: clave }),
  })

  // Lo que se ve en esta tablet: el jefe de cocina, todo; la de arriba, solo su planta
  const mesasVistas = (data?.mesas ?? []).filter(m => !planta || m.salon === planta)
  const mesaAbierta = abierta ? mesasVistas.find(m => m.comandaId === cursor.mesa) : undefined
  const primerPlato = (m: MesaPase) => (m.items.find(i => i.servidos < i.cantidad) ?? m.items[0]).id
  const accion = (a: Accion) => {
    if (a === 'planta') {
      if (alto || mesaAbierta || salones.length < 2) return
      const plantas = ['', ...salones.map(p => p.nombre)]
      elegirPlanta(plantas[(plantas.indexOf(planta) + 1) % plantas.length])
      setCursor({ mesa: null, plato: null })
      return
    }
    if (a === 'alto') {
      window.clearTimeout(cierre.current)
      setAbierta(false)
      setErrorAlto('')
      setAlto({ cat: 0, item: 0 })
      return
    }
    if (alto) {
      window.clearTimeout(cierre.current)
      const platos = secciones[alto.cat]?.platos ?? []
      if (a === 'arriba' || a === 'abajo') setAlto({ ...alto, item: Math.max(0, Math.min(platos.length - 1, alto.item + (a === 'abajo' ? 1 : -1))) })
      else if (a === 'izquierda' || a === 'derecha') setAlto({ cat: Math.max(0, Math.min(secciones.length - 1, alto.cat + (a === 'derecha' ? 1 : -1))), item: 0 })
      else if (a === 'entrar' && platos[alto.item]) cantar(platos[alto.item])
      else if (a === 'salir') setAlto(null)
      return
    }
    if (mesaAbierta) {
      cerrarEnUnRato(CIERRE_SIN_TOCAR_MS) // cualquier tecla le da más tiempo; marcar lo acorta abajo
      const i = mesaAbierta.items.findIndex(p => p.id === cursor.plato)
      const plato = mesaAbierta.items[i]
      if (a === 'arriba' || a === 'abajo') {
        const otro = mesaAbierta.items[i + (a === 'abajo' ? 1 : -1)]
        if (otro) setCursor({ mesa: mesaAbierta.comandaId, plato: otro.id })
      } else if (a === 'izquierda' || a === 'derecha') {
        // Sin dar la vuelta: en la primera o en la última mesa, se queda donde está
        const k = mesasVistas.findIndex(m => m.comandaId === mesaAbierta.comandaId)
        const hacia = a === 'derecha' ? mesasVistas.slice(k + 1) : mesasVistas.slice(0, k).reverse()
        const otra = hacia.find(m => m.items.some(p => p.servidos < p.cantidad))
        if (otra) setCursor({ mesa: otra.comandaId, plato: primerPlato(otra) })
      } else if (a === 'entrar' && plato && plato.servidos < plato.cantidad) {
        const marcaListo = plato.listos < plato.cantidad
        marcar.mutate({ id: plato.id, ...siguiente(plato) })
        // Baja solo al siguiente que pide lo mismo o, si no hay, al siguiente pendiente
        const debajo = mesaAbierta.items.slice(i + 1)
        const otro = debajo.find(p => (marcaListo ? p.listos < p.cantidad : p.listos > p.servidos)) ?? debajo.find(p => p.servidos < p.cantidad)
        if (otro) setCursor({ mesa: mesaAbierta.comandaId, plato: otro.id })
        cerrarEnUnRato()
      } else if (a === 'deshacer' && plato) {
        // Un paso atrás de toda la línea
        marcar.mutate({ id: plato.id, listos: plato.servidos > 0 ? plato.listos : 0, servidos: 0 })
      } else if (a === 'salir') { window.clearTimeout(cierre.current); setAbierta(false) }
      return
    }
    const elegida = mesasVistas.find(m => m.comandaId === cursor.mesa)
    if (a === 'arriba' || a === 'abajo' || a === 'izquierda' || a === 'derecha') setCursor({ mesa: mesaVecina(cursor.mesa, a), plato: null })
    else if (a === 'entrar') {
      if (!elegida) setCursor({ mesa: mesaVecina(null, a), plato: null })
      else { setCursor({ mesa: elegida.comandaId, plato: primerPlato(elegida) }); setAbierta(true); cerrarEnUnRato(CIERRE_SIN_TOCAR_MS) }
    } else if (a === 'salir') setCursor({ mesa: null, plato: null })
  }
  const accionActual = useRef(accion)
  accionActual.current = accion
  const hayDetalle = useRef(false)
  hayDetalle.current = !!detalle
  const ultimoNum = useRef(0)
  const altoAbierto = useRef(false)
  altoAbierto.current = !!alto
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => {
      const a = TECLAS[e.code]
      if (!a || hayDetalle.current || e.repeat && (a === 'entrar' || a === 'deshacer' || a === 'planta')) return
      e.preventDefault()
      if (a === 'entrar' && !altoAbierto.current && Date.now() - ultimoNum.current < NUM_ENTER_MS) {
        ultimoNum.current = 0
        accionActual.current('alto')
        return
      }
      if (e.code === 'NumLock') ultimoNum.current = Date.now()
      accionActual.current(a)
    }
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])
  useEffect(() => { if (cursor.mesa && !abierta) document.querySelector(`[data-mesa="${cursor.mesa}"]`)?.scrollIntoView({ block: 'nearest' }) }, [cursor.mesa, abierta])

  if (!sesion || !rid) return null
  const salir = () => { sessionStorage.removeItem('oidoops_camarero'); navigate('/pase', { replace: true }) }
  const mesas = mesasVistas
  // Se decide con los datos al momento: la tarjeta baja al servir el último plato
  const terminada = (m: MesaPase) => m.items.every(i => i.servidos >= i.cantidad)
  const enMarcha = mesas.filter(m => !terminada(m))
  const servidas = mesas.filter(terminada).reverse()
  const platos = enMarcha.flatMap(m => m.items)
  const nCocina = sumar(platos, enCocina)
  const nRecoger = sumar(platos, porRecoger)
  const nEnfrian = sumar(platos.filter(p => seEnfria(p, ahora)), porRecoger)
  const masVieja = enMarcha[0]
  const tarjeta = (m: MesaPase) => (
    <Tarjeta key={m.comandaId} m={m} ahora={ahora} elegida={cursor.mesa === m.comandaId}
      onMarcar={(p, listos, servidos) => marcar.mutate({ id: p.id, listos, servidos })}
      onDetalle={plato => setDetalle({ mesa: m.mesa, plato })} />
  )

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      {entrando && <CheckOverlay carga />}
      <header className="sticky top-0 z-30 flex items-center gap-4 px-4 py-2.5 bg-white border-b border-slate-300">
        <div className="shrink-0 flex items-center gap-2">
          <svg width="34" height="36" viewBox="0 0 68 72" aria-hidden="true">
            <defs>
              <linearGradient id="og-pase" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4B9EDF" />
                <stop offset="100%" stopColor="#4CC8A0" />
              </linearGradient>
            </defs>
            <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#og-pase)" />
            <path d="M15 34 L29 48 L55 18" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xl font-extrabold tracking-tight">Oido<span className="text-[#2fae87]">Ops</span></span>
        </div>
        <div className="min-w-0 pl-3 border-l border-slate-300">
          <p className="text-slate-500 text-xs font-semibold">{restaurante?.nombre}</p>
          <h1 className="text-xl font-black leading-tight">Pase · {enMarcha.length} {enMarcha.length === 1 ? 'mesa' : 'mesas'}</h1>
        </div>
        <div className="flex-1 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-base font-bold">
          <span className="text-amber-700">🟡 {nCocina} en cocina</span>
          <span className="text-emerald-700">🟢 {nRecoger} por recoger</span>
          {nEnfrian > 0 && <span className="text-red-700">🥶 {nEnfrian} {nEnfrian === 1 ? 'se enfría' : 'se enfrían'}</span>}
          {masVieja && <span className="text-slate-600">Más espera: la {masVieja.mesa ?? '—'}, {minutosDesde(masVieja.desde, ahora)}′</span>}
        </div>
        <button onClick={() => accion('alto')} className="h-11 px-3 bg-red-600 text-white text-sm font-black">🚫 ALTO{agotados.length > 0 ? ` · ${agotados.length}` : ''}</button>
        <button onClick={salir} className="h-11 px-3 bg-slate-200 text-sm font-bold">Salir</button>
      </header>
      {salones.length > 1 && (
        <div className="flex gap-2 px-3 pt-3 overflow-x-auto">
          {[{ nombre: '', texto: 'Todas' }, ...salones.map(p => ({ nombre: p.nombre, texto: p.nombre }))].map(p => (
            <button key={p.nombre} onClick={() => elegirPlanta(p.nombre)}
              className={`shrink-0 h-12 px-5 text-base font-black ${planta === p.nombre ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
              {p.texto}
            </button>
          ))}
        </div>
      )}

      {(isError || enModoLocal()) && (
        <p className="px-4 py-3 bg-red-600 text-white font-black text-center">Sin conexión · seguid con los tickets</p>
      )}

      {data && !data.activa ? (
        <p className="p-10 text-center text-lg text-slate-500">La pantalla de pase no está activada en este local. Se activa en el panel, en Restaurantes.</p>
      ) : (
        <main className="p-2">
          {data && enMarcha.length === 0 && <p className="p-10 text-center text-2xl font-bold text-slate-500">Sin platos en cocina 👌</p>}
          <div className="columns-[16rem] gap-2">{enMarcha.map(tarjeta)}</div>
          {servidas.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setVerServidas(v => !v)} className="w-full h-14 bg-white text-slate-600 text-lg font-bold">
                {verServidas ? '▾' : '▸'} Servidas ({servidas.length})
              </button>
              {verServidas && <div className="columns-[16rem] gap-2 mt-3">{servidas.map(tarjeta)}</div>}
            </div>
          )}
        </main>
      )}

      {mesaAbierta && (
        <div className="fixed inset-0 z-[35] bg-black/75 overflow-y-auto p-4 pb-20" onClick={() => setAbierta(false)}>
          <div className="max-w-2xl mx-auto" onClick={e => e.stopPropagation()}>
            <Tarjeta m={mesaAbierta} ahora={ahora} elegida ventana platoCursor={cursor.plato}
              onMarcar={(p, listos, servidos) => { marcar.mutate({ id: p.id, listos, servidos }); cerrarEnUnRato() }}
              onDetalle={plato => setDetalle({ mesa: mesaAbierta.mesa, plato })} />
          </div>
        </div>
      )}
      {cursor.mesa !== null && (
        <p className="fixed bottom-0 inset-x-0 z-[36] bg-white border-t border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-600">
          {mesaAbierta
            ? '↑↓ plato · ←→ otra mesa · Enter marcar · , deshacer · Num salir'
            : 'Flechas elegir mesa · Enter abrir · * cambiar planta · Num quitar cursor · Num + Enter ALTO'}
        </p>
      )}
      {alto && (
        <AltosPase secciones={secciones} cat={alto.cat} item={alto.item} agotados={agotados} error={errorAlto}
          onElegir={(cat, item) => setAlto({ cat, item })} onTocar={cantar} onCerrar={() => setAlto(null)} />
      )}
      {detalle && (
        <DetallePlato mesa={detalle.mesa} p={detalle.plato} onCerrar={() => setDetalle(null)}
          onGuardar={(listos, servidos) => { marcar.mutate({ id: detalle.plato.id, listos, servidos }); setDetalle(null); if (abierta) cerrarEnUnRato() }} />
      )}
    </div>
  )
}
