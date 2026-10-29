import type { Comanda, ComandaItem, FloorPlan, ItemAgotado, Mesa, MenuCategoria, MenuItem, Turno } from '../api'

// Modo práctica (asistente para aprender la app): el camarero usa la sala de verdad, pero las mesas y
// comandas las lleva este simulador dentro del teléfono. Toda llamada de la app pasa por pedir()
// (lib/conexion.ts), que en práctica pregunta aquí primero:
//   - lo que solo se lee (carta, salones, alérgenos…) va al servidor de verdad;
//   - mesas, comandas, turno, reservas y mermas los contesta el simulador;
//   - cualquier otra escritura se rechaza. Así es imposible que algo de la práctica imprima en cocina,
//     sume a la caja o le aparezca a otro.
// Vive en sessionStorage: dura hasta salir de la práctica o cerrar la app. Entrar y salir recargan la
// página, así la caché de React Query nunca mezcla datos reales con los de mentira.

const CLAVE = 'oidoops_practica'        // lección en curso (si está, la sala está en práctica)
const CLAVE_DB = 'oidoops_practica_db'
export const CLAVE_EVENTOS = 'oidoops_practica_eventos' // lo que pasó en el paso en curso (la guía)

export interface DbPractica {
  sigId: number
  comandas: Comanda[]
  turnoDesde: string
  // Lección de los altos: el plato que "marcó el encargado" (uno de comida de la carta, elegido al empezar)
  alto?: { menuItemId: number; nombre: string; categoria: string; desde: string }
}

// Lo que va pasando en la práctica: el motor de lecciones lo mira para saber si se hizo cada paso
export type EventoPractica =
  | { tipo: 'abrir' | 'enviar' | 'paraCocina' | 'pax' | 'facturar' | 'liberar' | 'cerrar' | 'vacia' | 'moverMesa'; comandaId: number }
  | { tipo: 'item' | 'itemEditado' | 'itemBorrado'; comandaId: number; itemId: number }
  | { tipo: 'gesto'; comandaId: 0; nombre: Gesto } // un deslizar de la sala (no pasa por el simulador)

// Los deslizar que enseña el asistente. La sala llama a gesto() en cada uno; fuera de la práctica no hace nada.
export type Gesto = 'salon' | 'pedido-carta' | 'categoria-siguiente' | 'categoria-atras' | 'grupos-atras' | 'salir-mapa' | 'ordenar-cerrar'

export function practicaActiva(): boolean {
  try { return !!sessionStorage.getItem(CLAVE) } catch { return false }
}

export interface EstadoLeccion { leccion: string; paso: number; desde: number }

export function leccionEnCurso(): EstadoLeccion | null {
  try {
    const v = sessionStorage.getItem(CLAVE)
    return v ? JSON.parse(v) as EstadoLeccion : null
  } catch { return null }
}

export function guardarLeccion(e: EstadoLeccion) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify(e)) } catch { /* sin almacenamiento no hay práctica */ }
}

// Entrar en la práctica con una lección. La mesa de práctica arranca vacía y se recarga la sala.
export function entrarPractica(leccion: string) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ leccion, paso: 0, desde: Date.now() } satisfies EstadoLeccion))
    sessionStorage.removeItem(CLAVE_DB)
    sessionStorage.removeItem(CLAVE_EVENTOS)
  } catch { return }
  location.reload()
}

// Pasar a otra lección sin salir: conserva las mesas de práctica (una lección puede seguir con lo
// que dejó la anterior) y recarga para que la guía arranque limpia.
export function cambiarLeccion(leccion: string) {
  guardarLeccion({ leccion, paso: 0, desde: Date.now() })
  try { sessionStorage.removeItem(CLAVE_EVENTOS) } catch { /* nada */ }
  location.reload()
}

export function salirPractica() {
  try {
    sessionStorage.removeItem(CLAVE)
    sessionStorage.removeItem(CLAVE_DB)
    sessionStorage.removeItem(CLAVE_EVENTOS)
  } catch { /* nada */ }
  location.reload()
}

// ── Base de datos de mentira ──────────────────────────────────────────────────────────────

function leerDb(): DbPractica {
  try {
    const v = sessionStorage.getItem(CLAVE_DB)
    if (v) return JSON.parse(v) as DbPractica
  } catch { /* se empieza de cero */ }
  return { sigId: 1_000_000, comandas: [], turnoDesde: new Date().toISOString() }
}

function guardarDb(db: DbPractica) {
  try { sessionStorage.setItem(CLAVE_DB, JSON.stringify(db)) } catch { /* nada */ }
}

export function dbPractica(): DbPractica { return leerDb() }

const oyentes = new Set<(e: EventoPractica) => void>()
export function alPasarEnPractica(fn: (e: EventoPractica) => void) {
  oyentes.add(fn)
  return () => { oyentes.delete(fn) }
}
export function gesto(nombre: Gesto) {
  if (practicaActiva()) avisar({ tipo: 'gesto', comandaId: 0, nombre })
}
function avisar(e: EventoPractica) {
  // Después de contestar: la pantalla ya tiene la respuesta cuando la guía avanza
  setTimeout(() => oyentes.forEach(fn => fn(e)), 0)
}

// ── Respuestas ────────────────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const vacia = () => new Response(null, { status: 204 })
const error = (status: number, mensaje: string) => json({ error: mensaje }, status)
const NO_SE_PUEDE = 'En la práctica esto todavía no se puede. Sal de la práctica para hacerlo de verdad.'

// Las mesas y la carta del local, del servidor de verdad (solo lectura), para armar comandas creíbles
let mesasCache: { rid: number; mesas: Mesa[] } | null = null
async function mesaDe(rid: number, mesaId: number): Promise<Mesa | null> {
  if (mesasCache?.rid !== rid) {
    const planes = await fetch(`/api/salon?restaurantId=${rid}`, { headers: cabeceras() }).then(r => r.ok ? r.json() as Promise<FloorPlan[]> : [])
    mesasCache = { rid, mesas: planes.flatMap(p => p.mesas) }
  }
  return mesasCache.mesas.find(m => m.id === mesaId) ?? null
}
async function automaticosPorPax(rid: number): Promise<MenuItem[]> {
  const menu = await fetch(`/api/menu?restaurantId=${rid}`, { headers: cabeceras() }).then(r => r.ok ? r.json() as Promise<MenuItem[]> : [])
  return menu.filter(m => m.restaurantId === rid && m.autoPorPax && m.activo)
}

// Lección de los altos: un plato de comida que se ve en la carta, siempre el mismo durante la práctica
const LECCION_ALTOS = 'altos'
async function elegirAlto(rid: number): Promise<DbPractica['alto']> {
  const [menu, cats] = await Promise.all([
    fetch(`/api/menu?restaurantId=${rid}`, { headers: cabeceras() }).then(r => r.ok ? r.json() as Promise<MenuItem[]> : []),
    fetch(`/api/menu/categorias?restaurantId=${rid}`, { headers: cabeceras() }).then(r => r.ok ? r.json() as Promise<MenuCategoria[]> : []),
  ])
  const grupo = new Map(cats.map(c => [c.nombre, c.grupo]))
  const plato = menu.find(m => m.activo && !m.ocultoEnCarta && !m.autoPorPax && !m.combinable && !m.esMixer
    && grupo.has(m.categoria) && !/vino|bebida/i.test(grupo.get(m.categoria) ?? ''))
  return plato ? { menuItemId: plato.id, nombre: plato.nombre, categoria: plato.categoria, desde: new Date().toISOString() } : undefined
}

// La sesión del camarero, para las lecturas que la piden
function cabeceras(): Record<string, string> {
  try {
    const s = JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? 'null') as { token?: string } | null
    return s?.token ? { Authorization: `Bearer ${s.token}` } : {}
  } catch { return {} }
}

function nuevoItem(db: DbPractica, comandaId: number, datos: Partial<ComandaItem>): ComandaItem {
  return {
    id: db.sigId++, comandaId, tipo: 'cocina', nombre: '', precio: 0, cantidad: 1, nota: '',
    nivel: null, ronda: 0, autoGenerado: false, invitacion: false, invitadoPor: null, invitacionMotivo: null,
    menuItemId: null, ...datos,
  }
}

// La cuenta impresa cambió: hay que reimprimirla antes de cobrar (igual que el servidor)
function cuentaCambia(c: Comanda) {
  if (c.estado === 'facturada' || c.estado === 'liberada') c.cuentaDesactualizada = true
}

// Contesta una llamada de la sala en práctica. null = que vaya al servidor de verdad (solo lecturas).
export async function simular(url: string, init?: RequestInit): Promise<Response | null> {
  const u = new URL(url, location.origin)
  const i = u.pathname.indexOf('/api/')
  if (i < 0) return null
  const ruta = u.pathname.slice(i + 4) // '/comandas/5/items'
  const q = u.searchParams
  const metodo = (init?.method ?? 'GET').toUpperCase()
  const body = (() => {
    try { return typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {} } catch { return {} }
  })()
  const p = ruta.split('/').filter(Boolean) // ['comandas', '5', 'items']

  const db = leerDb()
  const buscar = (id: string | undefined) => db.comandas.find(c => c.id === Number(id))

  // ── Lecturas que contesta el simulador ──
  if (metodo === 'GET') {
    if (ruta === '/comandas') {
      const estado = q.get('estado')
      const desde = q.get('desde')
      const rid = Number(q.get('restaurantId'))
      let lista = db.comandas.filter(c => c.restaurantId === rid)
      lista = estado ? lista.filter(c => c.estado === estado) : lista.filter(c => ['abierta', 'enviada', 'facturada'].includes(c.estado))
      if (desde) lista = lista.filter(c => c.closedAt && c.closedAt >= desde)
      return json([...lista].reverse())
    }
    if (p[0] === 'comandas' && p.length === 2) {
      const c = buscar(p[1])
      return c ? json(c) : error(404, 'No encontrada')
    }
    if (ruta === '/turnos/activo') {
      const rid = Number(q.get('restaurantId'))
      const turno: Turno = { id: -1, restaurantId: rid, estado: 'abierto', encargadoNombre: 'Práctica', aperturaAt: db.turnoDesde }
      return json(turno)
    }
    if (ruta === '/red/estado') return json({ restaurantId: null, restringido: false, enLocal: true })
    if (ruta === '/agotados') {
      if (leccionEnCurso()?.leccion !== LECCION_ALTOS) return json([])
      if (!db.alto) {
        db.alto = await elegirAlto(Number(q.get('restaurantId')))
        guardarDb(db)
      }
      const alto: ItemAgotado[] = db.alto
        ? [{ menuItemId: db.alto.menuItemId, marcadoPor: 'el encargado (práctica)', createdAt: db.alto.desde, menuItem: { nombre: db.alto.nombre } }]
        : []
      return json(alto)
    }
    if (ruta === '/reservas' || ruta === '/reservas/pool') return json([])
    if (ruta === '/mermas') return json({ mermas: [], total: 0, page: 1, limit: 50, pages: 1 })
    return null // el resto se lee del servidor de verdad
  }

  // ── Escrituras ──
  if (ruta === '/comandas' && metodo === 'POST') {
    const rid = Number(body.restaurantId), mesaId = Number(body.mesaId), pax = Number(body.pax)
    if (!rid || !mesaId || !pax) return error(400, 'restaurantId, mesaId y pax requeridos')
    if (db.comandas.some(c => c.mesaId === mesaId && c.estado === 'abierta')) return error(409, 'La mesa ya tiene una comanda abierta')
    const mesa = await mesaDe(rid, mesaId)
    if (!mesa) return error(404, 'Mesa no encontrada')
    const autos = await automaticosPorPax(rid)
    const id = db.sigId++
    const comanda: Comanda = {
      id, restaurantId: rid, mesaId, mesa, pax, estado: 'abierta', metodoPago: null, propina: 0,
      camareroNombre: (body.camareroNombre as string) ?? null, cuentaDesactualizada: false,
      noComparten: false, notaMesa: '', alergenoIds: [], enviadaAt: null, reserva: null,
      items: [], mermas: [], createdAt: new Date().toISOString(), closedAt: null,
    }
    comanda.items = autos.map(a => nuevoItem(db, id, { nombre: a.nombre, precio: a.precio, menuItemId: a.id, cantidad: pax, tipo: 'barra', autoGenerado: true }))
    db.comandas.push(comanda)
    guardarDb(db)
    avisar({ tipo: 'abrir', comandaId: id })
    return json(comanda, 201)
  }

  if (p[0] !== 'comandas' || !p[1]) return error(403, NO_SE_PUEDE)
  const c = buscar(p[1])
  if (!c) return error(404, 'Comanda no encontrada')
  const accion = p.slice(2).join('/') // 'items', 'items/7', 'enviar'…

  if (accion === 'items' && metodo === 'POST') {
    const datos = {
      nombre: String(body.nombre ?? ''), precio: Number(body.precio ?? 0), cantidad: Number(body.cantidad ?? 1),
      nota: String(body.nota ?? ''), tipo: (body.tipo === 'barra' ? 'barra' : 'cocina') as ComandaItem['tipo'],
      menuItemId: typeof body.menuItemId === 'number' ? body.menuItemId : null,
    }
    let item: ComandaItem
    if (body.directo) {
      const igual = c.items.find(x => x.nombre === datos.nombre && x.autoGenerado && x.nivel === 1 && !x.invitacion)
      if (igual) { igual.cantidad += datos.cantidad; item = igual }
      else { item = nuevoItem(db, c.id, { ...datos, autoGenerado: true, nivel: 1, ronda: 1 }); c.items.push(item) }
      cuentaCambia(c)
    } else {
      const igual = c.items.find(x => x.nombre === datos.nombre && x.tipo === datos.tipo && x.nivel === null && x.nota === datos.nota)
      if (igual) { igual.cantidad += datos.cantidad; item = igual }
      else { item = nuevoItem(db, c.id, datos); c.items.push(item) }
      c.estado = 'abierta'
    }
    guardarDb(db)
    avisar({ tipo: 'item', comandaId: c.id, itemId: item.id })
    return json(item, 201)
  }

  if (p[2] === 'items' && p[3] && metodo === 'PATCH') {
    const item = c.items.find(x => x.id === Number(p[3]))
    if (!item) return error(404, 'No encontrado')
    const cantidad = typeof body.cantidad === 'number' ? body.cantidad : undefined
    let res = item
    if (cantidad !== undefined && item.nivel != null && cantidad > item.cantidad) {
      // Ya comandado y piden más: lo de más queda pendiente para el próximo Oído (como el servidor)
      const delta = cantidad - item.cantidad
      const pendiente = c.items.find(x => x.nombre === item.nombre && x.tipo === item.tipo && x.nivel === null)
      if (pendiente) pendiente.cantidad += delta
      else c.items.push(res = nuevoItem(db, c.id, { nombre: item.nombre, precio: item.precio, menuItemId: item.menuItemId, tipo: item.tipo, cantidad: delta }))
      if (pendiente) res = pendiente
      c.estado = 'abierta'
    } else {
      if (cantidad !== undefined) item.cantidad = cantidad
      if (typeof body.nota === 'string') item.nota = body.nota
      if (typeof body.invitacion === 'boolean') {
        item.invitacion = body.invitacion
        item.invitadoPor = body.invitacion ? (body.invitadoPor as string) ?? null : null
        item.invitacionMotivo = body.invitacion ? (body.invitacionMotivo as string)?.trim() || null : null
      }
      if (cantidad !== undefined || body.invitacion !== undefined) cuentaCambia(c)
    }
    guardarDb(db)
    avisar({ tipo: 'itemEditado', comandaId: c.id, itemId: res.id })
    return json(res)
  }

  if (p[2] === 'items' && p[3] && metodo === 'DELETE') {
    const itemId = Number(p[3])
    c.items = c.items.filter(x => x.id !== itemId)
    cuentaCambia(c)
    guardarDb(db)
    avisar({ tipo: 'itemBorrado', comandaId: c.id, itemId })
    return vacia()
  }

  if (accion === 'para-cocina' && metodo === 'PATCH') {
    if (typeof body.noComparten === 'boolean') c.noComparten = body.noComparten
    if (typeof body.notaMesa === 'string') c.notaMesa = body.notaMesa.trim().slice(0, 200)
    if (Array.isArray(body.alergenoIds)) c.alergenoIds = body.alergenoIds as number[]
    guardarDb(db)
    avisar({ tipo: 'paraCocina', comandaId: c.id })
    return json(c)
  }

  if (accion === 'enviar' && metodo === 'PATCH') {
    const niveles = (body.niveles ?? []) as { itemId: number; nivel: number; nota?: string }[]
    const ronda = Math.max(0, ...c.items.filter(x => x.ronda > 0).map(x => x.ronda)) + 1
    for (const n of niveles) {
      const item = c.items.find(x => x.id === n.itemId)
      if (!item) continue
      item.nivel = n.nivel
      item.ronda = ronda
      if (n.nota !== undefined) item.nota = n.nota
    }
    c.estado = 'enviada'
    c.enviadaAt ??= new Date().toISOString()
    guardarDb(db)
    avisar({ tipo: 'enviar', comandaId: c.id })
    return json(c)
  }

  if (accion === 'pax' && metodo === 'PATCH') {
    const pax = Number(body.pax)
    if (!pax || pax < 1) return error(400, 'pax inválido')
    for (const x of c.items) if (x.autoGenerado) { x.cantidad = pax; x.nivel = null; x.ronda = 0 }
    c.pax = pax
    if (c.estado === 'enviada') c.estado = 'abierta'
    guardarDb(db)
    avisar({ tipo: 'pax', comandaId: c.id })
    return json(c)
  }

  if (accion === 'facturar' && metodo === 'PATCH') {
    c.estado = 'facturada'
    c.cuentaDesactualizada = false
    guardarDb(db)
    avisar({ tipo: 'facturar', comandaId: c.id })
    return json(c)
  }

  if (accion === 'liberar' && metodo === 'PATCH') {
    c.estado = 'liberada'
    guardarDb(db)
    avisar({ tipo: 'liberar', comandaId: c.id })
    return json(c)
  }

  if (accion === 'cerrar' && metodo === 'PATCH') {
    if (c.estado !== 'facturada' && c.estado !== 'liberada') return error(409, 'Primero hay que imprimir la cuenta')
    if (c.cuentaDesactualizada) return error(409, 'La cuenta cambió: reimprímela antes de cobrar')
    if (body.metodoPago !== 'cash' && body.metodoPago !== 'tarjeta') return error(400, 'Falta el método de pago')
    c.estado = 'cerrada'
    c.metodoPago = body.metodoPago
    c.propina = Number(body.propina ?? 0)
    c.closedAt = new Date().toISOString()
    guardarDb(db)
    avisar({ tipo: 'cerrar', comandaId: c.id })
    return json(c)
  }

  if (accion === 'vacia' && metodo === 'DELETE') {
    // Se borra si no se pidió nada (lo automático tipo pan × pax sin comandar no cuenta)
    const pedido = c.items.some(x => !(x.autoGenerado && x.ronda === 0))
    if (c.estado !== 'abierta' || pedido) return error(409, 'La mesa tiene cosas pedidas')
    db.comandas = db.comandas.filter(x => x.id !== c.id)
    guardarDb(db)
    avisar({ tipo: 'vacia', comandaId: c.id })
    return vacia()
  }

  if (accion === 'mover-mesa' && metodo === 'PATCH') {
    const mesa = await mesaDe(c.restaurantId, Number(body.mesaId))
    if (!mesa) return error(404, 'Mesa no encontrada')
    c.mesaId = mesa.id
    c.mesa = mesa
    guardarDb(db)
    avisar({ tipo: 'moverMesa', comandaId: c.id })
    return json(c)
  }

  return error(403, NO_SE_PUEDE)
}
