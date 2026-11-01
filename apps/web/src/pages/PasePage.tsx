import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, MesaPase, Pase, PlatoPase } from '../api'
import { enModoLocal } from '../lib/conexion'
import { nombreNivel } from '../components/NivelEtiqueta'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'

// Pantalla de pase (/pase/mesas): la misma en la tablet de abajo y en la de arriba. Una tarjeta por
// mesa, la que más lleva esperando primero. Un toque en un plato: 🟡 en cocina → 🟢 listo (jefe de
// cocina) → ⚪ servido (el del pase). Mantener apretado: marcar solo algunos o deshacer.
// 🔔 Sigue = "porfa, la 8 sigue": lo pide el camarero que ve la demora, desde su mesa en la sala. La tarjeta
// late en las dos tablets hasta que cocina marque algo listo de esa mesa.
// Seguimiento: arriba el resumen del servicio; en cada mesa, cómo va y qué falta. Dos avisos: un plato
// listo que nadie recoge (se enfría en el pase) y el plato que retiene a una mesa con su nivel ya listo.
// También sin tocar la pantalla: un cursor que se maneja con el teclado (ver TECLAS). Las teclas solo
// dicen qué acción quieren; un joystick se conectaría a las mismas acciones.

const PLANTA_KEY = 'pase_planta' // cada tablet recuerda la suya
const APRETADO_MS = 450
const DOBLE_TOQUE_MS = 600 // un toque nervioso no se salta de en cocina a servido
const VERDE_ESPERA_MIN = 5  // listo y sin recoger: se está enfriando
const RETENIDO_MIN = 10     // lo que falta de un nivel que ya está casi listo

type Accion = 'arriba' | 'abajo' | 'izquierda' | 'derecha' | 'entrar' | 'salir' | 'deshacer'
const TECLAS: Record<string, Accion> = {
  ArrowUp: 'arriba', ArrowDown: 'abajo', ArrowLeft: 'izquierda', ArrowRight: 'derecha',
  Numpad8: 'arriba', Numpad2: 'abajo', Numpad4: 'izquierda', Numpad6: 'derecha',
  NumpadEnter: 'entrar', Enter: 'entrar',
  NumLock: 'salir', Escape: 'salir', // se lee la tecla física: que Bloq Num cambie de estado no afecta a las demás
  NumpadDecimal: 'deshacer', Backspace: 'deshacer',
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
const colorTiempo = (min: number) => (min >= 25 ? 'text-red-400' : min >= 15 ? 'text-amber-300' : 'text-slate-300')

function colorPlato(p: PlatoPase) {
  if (p.servidos >= p.cantidad) return 'bg-white/[0.04] border-white/10 text-slate-500 line-through'
  if (p.listos >= p.cantidad) return 'bg-emerald-500/25 border-emerald-400 text-emerald-50'
  return 'bg-amber-400/15 border-amber-400/70 text-amber-50'
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
      className={`w-full min-h-[3.5rem] rounded-xl border-2 px-3 py-2 text-left select-none ${colorPlato(p)} ${apagado && !cursor ? 'opacity-45' : ''} ${cursor ? 'ring-4 ring-white' : retenido || seEnfria(p, ahora) ? 'ring-2 ring-red-500' : ''}`}>
      <span className="flex items-baseline gap-2">
        <span className="text-xl font-black tabular-nums shrink-0">{p.cantidad}×</span>
        <span className="flex-1 min-w-0 text-lg font-bold uppercase leading-tight">{p.nombre}</span>
      </span>
      {p.nota && <span className="block text-sm font-semibold text-amber-200 no-underline">» {p.nota}</span>}
      {parcial && <span className="block text-sm font-black text-emerald-300 no-underline">{p.listos} listos · {p.servidos} servidos</span>}
      {seEnfria(p, ahora) && <span className="block text-sm font-black text-red-300 no-underline">🥶 Lleva {minutosVerde(p, ahora)}′ sin recoger</span>}
      {retenido && <span className="block text-sm font-black text-red-300 no-underline">⏳ La mesa espera por este · {minutosDesde(p.enviadoAt, ahora)}′</span>}
    </button>
  )
}

function Tarjeta({ m, ahora, elegida, ventana, platoCursor, onMarcar, onDetalle }: { m: MesaPase; ahora: number; elegida?: boolean; ventana?: boolean; platoCursor?: number | null; onMarcar: (p: PlatoPase, listos: number, servidos: number) => void; onDetalle: (p: PlatoPase) => void }) {
  const min = minutosDesde(m.desde, ahora)
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
  const faltan = m.items.filter(i => enCocina(i) > 0)
  const nFaltan = sumar(faltan, enCocina)
  return (
    <section data-mesa={ventana ? undefined : m.comandaId}
      className={`relative break-inside-avoid mb-3 scroll-mt-20 rounded-2xl border bg-[#16233a] overflow-hidden ${m.sigueAt ? 'border-red-400' : 'border-white/10'} ${elegida ? 'ring-4 ring-[#4B9EDF]' : ''}`}>
      {/* Late el marco, no la tarjeta: los platos se tienen que seguir leyendo */}
      {m.sigueAt && <span className="absolute inset-0 z-10 rounded-2xl ring-4 ring-inset ring-red-500 animate-pulse pointer-events-none" />}
      <header className="flex items-center gap-3 px-3 py-2 bg-white/5">
        <span className="text-3xl font-black tabular-nums">{m.mesa ?? '—'}</span>
        <span className="flex-1 min-w-0 text-xs text-slate-300 leading-tight truncate">{m.salon}<br />{m.pax} pax{m.camarero ? ` · ${m.camarero.split(' ')[0]}` : ''}</span>
        <span className={`text-2xl font-black tabular-nums ${colorTiempo(min)}`}>{min}′</span>
      </header>
      {m.sigueAt && (
        <p className="px-3 py-2 bg-red-500 text-white text-base font-black">
          🔔 Sigue{m.siguePor ? ` · lo pide ${m.siguePor.split(' ')[0]}` : ''} · hace {minutosDesde(m.sigueAt, ahora)}′
        </p>
      )}
      {m.alergias.length > 0 && <p className="px-3 py-1.5 bg-red-600 text-white text-sm font-black uppercase">🚫 Alérgico: {m.alergias.join(', ')}</p>}
      {(m.noComparten || m.nota) && <p className="px-3 py-1.5 bg-amber-400/15 text-amber-200 text-sm font-bold">{[m.noComparten && 'NO COMPARTEN', m.nota].filter(Boolean).join(' · ')}</p>}
      {servidos < total && (
        <div className="px-3 pt-2.5">
          <div className="flex h-2.5 rounded-full overflow-hidden bg-amber-400/30">
            <span className="bg-slate-300" style={{ width: `${(servidos / total) * 100}%` }} />
            <span className="bg-emerald-400" style={{ width: `${(listos / total) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-sm font-bold text-slate-200">{servidos} de {total} servidos</p>
          <p className="text-sm text-slate-300 leading-snug">
            {nFaltan > 0 ? `Faltan ${nFaltan}: ${faltan.map(i => `${enCocina(i)}× ${i.nombre}`).join(', ')}` : 'Nada en cocina · todo por recoger'}
          </p>
        </div>
      )}
      <div className="p-2.5 space-y-2.5">
        {niveles.map(n => (
          <div key={n} className="space-y-1.5">
            <p className="text-[11px] font-black tracking-wider text-slate-400">{nombreNivel(n)}</p>
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
      <button onClick={() => poner(v - 1)} disabled={v === 0} className="w-16 h-16 rounded-2xl bg-white/10 text-3xl font-black disabled:opacity-30">−</button>
      <span className="w-12 text-center text-3xl font-black tabular-nums">{v}</span>
      <button onClick={() => poner(v + 1)} disabled={v === p.cantidad} className="w-16 h-16 rounded-2xl bg-white/10 text-3xl font-black disabled:opacity-30">+</button>
    </div>
  )
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-3xl bg-[#16233a] border border-white/15 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-sm text-slate-400">Mesa {mesa ?? '—'}</p>
          <p className="text-2xl font-black uppercase leading-tight">{p.cantidad}× {p.nombre}</p>
        </div>
        {fila('🟢 Listos', listos, n => { setListos(n); setServidos(s => Math.min(s, n)) })}
        {fila('⚪ Servidos', servidos, n => { setServidos(n); setListos(l => Math.max(l, n)) })}
        <div className="flex gap-3 pt-1">
          <button onClick={() => { setListos(0); setServidos(0) }} className="h-14 px-4 rounded-2xl bg-white/10 font-bold">Todo en cocina</button>
          <button onClick={() => onGuardar(listos, servidos)} className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e] text-lg font-black">Guardar</button>
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
  const [planta, setPlanta] = useState(() => localStorage.getItem(PLANTA_KEY) ?? '')
  const { data: salones = [] } = useQuery({ queryKey: ['salon-planes', rid], queryFn: () => api.salon.list(rid!), enabled: !!sesion && !!rid })
  const elegirPlanta = (nombre: string) => { setPlanta(nombre); localStorage.setItem(PLANTA_KEY, nombre) }
  // Cursor del teclado: la mesa elegida y, con la mesa abierta, el plato
  const [cursor, setCursor] = useState<{ mesa: number | null; plato: number | null }>({ mesa: null, plato: null })
  const [abierta, setAbierta] = useState(false)

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
    if (mesaAbierta) {
      const i = mesaAbierta.items.findIndex(p => p.id === cursor.plato)
      const plato = mesaAbierta.items[i]
      if (a === 'arriba' || a === 'abajo') {
        const otro = mesaAbierta.items[i + (a === 'abajo' ? 1 : -1)]
        if (otro) setCursor({ mesa: mesaAbierta.comandaId, plato: otro.id })
      } else if (a === 'izquierda' || a === 'derecha') {
        const lista = mesasVistas.filter(m => m.items.some(p => p.servidos < p.cantidad))
        const otra = lista[lista.findIndex(m => m.comandaId === mesaAbierta.comandaId) + (a === 'derecha' ? 1 : -1)]
        if (otra) setCursor({ mesa: otra.comandaId, plato: primerPlato(otra) })
      } else if (a === 'entrar' && plato && plato.servidos < plato.cantidad) {
        marcar.mutate({ id: plato.id, ...siguiente(plato) })
      } else if (a === 'deshacer' && plato) {
        // Un paso atrás de toda la línea
        marcar.mutate({ id: plato.id, listos: plato.servidos > 0 ? plato.listos : 0, servidos: 0 })
      } else if (a === 'salir') setAbierta(false)
      return
    }
    const elegida = mesasVistas.find(m => m.comandaId === cursor.mesa)
    if (a === 'arriba' || a === 'abajo' || a === 'izquierda' || a === 'derecha') setCursor({ mesa: mesaVecina(cursor.mesa, a), plato: null })
    else if (a === 'entrar') {
      if (!elegida) setCursor({ mesa: mesaVecina(null, a), plato: null })
      else { setCursor({ mesa: elegida.comandaId, plato: primerPlato(elegida) }); setAbierta(true) }
    } else if (a === 'salir') setCursor({ mesa: null, plato: null })
  }
  const accionActual = useRef(accion)
  accionActual.current = accion
  const hayDetalle = useRef(false)
  hayDetalle.current = !!detalle
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => {
      const a = TECLAS[e.code]
      if (!a || hayDetalle.current || e.repeat && (a === 'entrar' || a === 'deshacer')) return
      e.preventDefault()
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
    <div className="min-h-screen bg-[#0f1a2e] text-slate-100">
      <header className="sticky top-0 z-30 flex items-center gap-4 px-4 py-2.5 bg-[#0f1a2e]/95 border-b border-white/10">
        <div className="min-w-0">
          <p className="text-[#4CC8A0] text-xs font-semibold">{restaurante?.nombre}</p>
          <h1 className="text-xl font-black leading-tight">Pase · {enMarcha.length} {enMarcha.length === 1 ? 'mesa' : 'mesas'}</h1>
        </div>
        <div className="flex-1 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-base font-bold">
          <span className="text-amber-300">🟡 {nCocina} en cocina</span>
          <span className="text-emerald-300">🟢 {nRecoger} por recoger</span>
          {nEnfrian > 0 && <span className="text-red-300">🥶 {nEnfrian} {nEnfrian === 1 ? 'se enfría' : 'se enfrían'}</span>}
          {masVieja && <span className="text-slate-300">Más espera: la {masVieja.mesa ?? '—'}, {minutosDesde(masVieja.desde, ahora)}′</span>}
        </div>
        <button onClick={salir} className="h-11 px-3 rounded-xl bg-white/10 text-sm font-bold">Salir</button>
      </header>
      {salones.length > 1 && (
        <div className="flex gap-2 px-3 pt-3 overflow-x-auto">
          {[{ nombre: '', texto: 'Todas' }, ...salones.map(p => ({ nombre: p.nombre, texto: p.nombre }))].map(p => (
            <button key={p.nombre} onClick={() => elegirPlanta(p.nombre)}
              className={`shrink-0 h-12 px-5 rounded-xl text-base font-black ${planta === p.nombre ? 'bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e]' : 'bg-white/5 text-slate-300'}`}>
              {p.texto}
            </button>
          ))}
        </div>
      )}

      {(isError || enModoLocal()) && (
        <p className="px-4 py-3 bg-red-600 text-white font-black text-center">Sin conexión · seguid con los tickets</p>
      )}

      {data && !data.activa ? (
        <p className="p-10 text-center text-lg text-slate-400">La pantalla de pase no está activada en este local. Se activa en el panel, en Restaurantes.</p>
      ) : (
        <main className="p-3">
          {data && enMarcha.length === 0 && <p className="p-10 text-center text-2xl font-bold text-slate-500">Sin platos en cocina 👌</p>}
          <div className="columns-1 sm:columns-2 xl:columns-3 gap-3">{enMarcha.map(tarjeta)}</div>
          {servidas.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setVerServidas(v => !v)} className="w-full h-14 rounded-2xl bg-white/5 text-slate-300 text-lg font-bold">
                {verServidas ? '▾' : '▸'} Servidas ({servidas.length})
              </button>
              {verServidas && <div className="columns-1 sm:columns-2 xl:columns-3 gap-3 mt-3">{servidas.map(tarjeta)}</div>}
            </div>
          )}
        </main>
      )}

      {mesaAbierta && (
        <div className="fixed inset-0 z-[35] bg-black/75 overflow-y-auto p-4 pb-20" onClick={() => setAbierta(false)}>
          <div className="max-w-2xl mx-auto" onClick={e => e.stopPropagation()}>
            <Tarjeta m={mesaAbierta} ahora={ahora} elegida ventana platoCursor={cursor.plato}
              onMarcar={(p, listos, servidos) => marcar.mutate({ id: p.id, listos, servidos })}
              onDetalle={plato => setDetalle({ mesa: mesaAbierta.mesa, plato })} />
          </div>
        </div>
      )}
      {cursor.mesa !== null && (
        <p className="fixed bottom-0 inset-x-0 z-[36] bg-[#0f1a2e] border-t border-white/10 px-4 py-2 text-center text-sm font-semibold text-slate-300">
          {mesaAbierta
            ? '↑↓ plato · ←→ otra mesa · Enter marcar · , deshacer · Num salir'
            : 'Flechas elegir mesa · Enter abrir · Num quitar cursor'}
        </p>
      )}
      {detalle && (
        <DetallePlato mesa={detalle.mesa} p={detalle.plato} onCerrar={() => setDetalle(null)}
          onGuardar={(listos, servidos) => { marcar.mutate({ id: detalle.plato.id, listos, servidos }); setDetalle(null) }} />
      )}
    </div>
  )
}
