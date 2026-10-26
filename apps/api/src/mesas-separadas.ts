// ── Mesas que se separan: dónde y de qué tamaño se dibujan las mitades ─────────────────────────
// La 2 del mapa son la 2 y la 3 juntas: la 3 es otra fila (parteDeId = la 2) que solo aparece
// cuando se separan. Separadas, las dos mitades se dibujan en el sitio de la mesa entera, así no hay
// que dibujarlas aparte en el admin. Mismas medidas que el mapa de la sala.
// ⚠️ Lo usan la API (GET /salon) y el editor del admin (vista del teléfono, apps/web importa este
// archivo): sin imports, para que valga en los dos lados.

export const SQUARE_SIZE = 80, RECT_W = 160, RECT_H = 80, BARRA_W = 240, BARRA_H = 80, SILLA_ALTA = 56
export const HUECO = 10 // el hueco de la rejilla del editor: una mesa "Doble" se parte en dos del tamaño base
const MIN_MITAD = 60
const TIPOS_RECT = ['barra', 'pared', 'columna', 'ventana', 'entrada']

export type MesaPlano = {
  id: number; numero: number; tipo: string; x: number; y: number; capacidad: number; rotacion: number
  ancho?: number | null; alto?: number | null; floorPlanId: number; parteDeId?: number | null; separada?: boolean
}
export type MesaVista<M extends MesaPlano> = M & { separable?: boolean; separada?: boolean; pareja?: number; paxPareja?: number; idPareja?: number }

// Ancho y alto de una mesa como la dibuja el mapa
export function medidas(m: MesaPlano) {
  if (TIPOS_RECT.includes(m.tipo)) return { w: m.ancho ?? BARRA_W, h: m.alto ?? BARRA_H }
  if (m.tipo === 'rectangular') return { w: m.ancho ?? RECT_W, h: m.alto ?? RECT_H }
  const l = m.ancho ?? (m.tipo === 'silla_alta' ? SILLA_ALTA : SQUARE_SIZE)
  return { w: l, h: l }
}

// Caja que ocupa en el mapa (girada 90° o 270°, ancho y alto se cambian)
export function caja(m: MesaPlano) {
  const { w, h } = medidas(m)
  const girada = Math.abs(m.rotacion % 180) === 90
  const cw = girada ? h : w, ch = girada ? w : h
  const cx = m.x + w / 2, cy = m.y + h / 2
  return { x1: cx - cw / 2, y1: cy - ch / 2, x2: cx + cw / 2, y2: cy + ch / 2 }
}

// Distancia entre dos mesas (negativo = se pisan)
export function separacion(a: MesaPlano, b: MesaPlano) {
  const p = caja(a), q = caja(b)
  return Math.max(q.x1 - p.x2, p.x1 - q.x2, q.y1 - p.y2, p.y1 - q.y2)
}

// Cuánto aire queda entre unas mesas y las demás del salón
function aire(mesas: MesaPlano[], otras: MesaPlano[]) {
  let min = Infinity
  for (const m of mesas) for (const o of otras) min = Math.min(min, separacion(m, o))
  return min
}

// lado: el de las mesas normales de esos pax en el mismo salón (Eze: separadas tienen que verse
// como las de 2). Sin ninguna de referencia, cada mitad es media mesa entera.
// deLado: una al lado de la otra; si no, una encima de la otra (por defecto, por su lado largo)
function partir<M extends MesaPlano>(entera: M, mitad: M, lado?: number, deLadoPedido?: boolean): [MesaVista<M>, MesaVista<M>] {
  const { w, h } = medidas(entera)
  const deLado = deLadoPedido ?? w > h
  // Media mesa redonda o cuadrada queda diminuta (una redonda de 80 → dos de 35, sin sitio para el
  // número): entonces cada mitad toma un tamaño mínimo y salen del sitio de la entera
  if (!lado && Math.min(deLado ? (w - HUECO) / 2 : w, deLado ? h : (h - HUECO) / 2) < MIN_MITAD) lado = MIN_MITAD
  const mw = lado ?? (deLado ? (w - HUECO) / 2 : w)
  const mh = lado ?? (deLado ? h : (h - HUECO) / 2)
  const desp = lado ? (lado + HUECO) / 2 : ((deLado ? w : h) + HUECO) / 4
  const rad = (entera.rotacion * Math.PI) / 180
  const cx = entera.x + w / 2, cy = entera.y + h / 2
  const forma = (m: M, signo: number, capacidad: number, pareja: number): MesaVista<M> => {
    const dx = deLado ? signo * desp : 0, dy = deLado ? 0 : signo * desp
    const centroX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
    const centroY = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    const redonda = entera.tipo === 'round'
    const l = Math.round(Math.min(mw, mh))
    const cuadrada = redonda || Math.abs(mw - mh) < 1
    const ancho = cuadrada ? l : Math.round(mw)
    const alto = cuadrada ? l : Math.round(mh)
    return {
      ...m, floorPlanId: entera.floorPlanId, rotacion: entera.rotacion, capacidad,
      tipo: redonda ? 'round' : cuadrada ? 'square' : 'rectangular',
      ancho, alto, x: centroX - ancho / 2, y: centroY - alto / 2,
      separada: true, pareja,
    }
  }
  // El número menor se queda con la mitad de arriba o de la izquierda (ya girada): así el mapa sigue
  // en orden (1, 2, 3, 4) aunque la mesa esté rotada o la otra mitad tenga el número menor (12 y 11)
  const ox = deLado ? -desp * Math.cos(rad) : desp * Math.sin(rad)
  const oy = deLado ? -desp * Math.sin(rad) : -desp * Math.cos(rad)
  const primera = ((Math.abs(ox) > Math.abs(oy) ? ox : oy) <= 0 ? -1 : 1) * (mitad.numero < entera.numero ? -1 : 1)
  return [
    forma(entera, primera, Math.max(1, entera.capacidad - mitad.capacidad), mitad.numero),
    forma(mitad, -primera, mitad.capacidad, entera.numero),
  ]
}

type ConMitad<M extends MesaPlano> = M & { mitad?: M | null }

// El tamaño más repetido entre las mesas sueltas de esos pax del salón (cuadradas, o redondas si
// la que se parte es redonda)
function ladoDe<M extends MesaPlano>(mesas: ConMitad<M>[], capacidad: number, tipo: 'square' | 'round') {
  const n = new Map<number, number>()
  for (const m of mesas) {
    if (m.parteDeId || m.mitad || m.tipo !== tipo || m.capacidad !== capacidad) continue
    const l = m.ancho ?? SQUARE_SIZE
    n.set(l, (n.get(l) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// Las mesas tal como están ahora: juntas (la entera, con su pareja escondida) o las dos mitades
// (mesas: las de un mismo salón). todas: el editor pide verlas todas juntas o todas separadas.
export function mesasVisibles<M extends MesaPlano>(mesas: ConMitad<M>[], todas?: 'juntas' | 'separadas'): MesaVista<M>[] {
  const r: MesaVista<M>[] = []
  for (const { mitad, ...resto } of mesas) {
    const m = resto as unknown as M
    if (m.parteDeId) continue // sale con su mesa entera
    if (!mitad) { r.push(m); continue }
    const separada = todas ? todas === 'separadas' : m.separada
    if (!separada) { r.push({ ...m, separada: false, separable: true, pareja: mitad.numero, paxPareja: mitad.capacidad, idPareja: mitad.id }); continue }
    // Redonda sin redondas de esos pax en el salón: del tamaño de las cuadradas de esos pax
    const lado = (m.tipo === 'round' ? ladoDe(mesas, mitad.capacidad, 'round') : undefined) ?? ladoDe(mesas, mitad.capacidad, 'square')
    const { w, h } = medidas(m)
    if (w !== h) { r.push(...partir(m, mitad, lado)); continue }
    // Redonda o cuadrada: al lado o encima, la que deje más aire con las demás mesas (Eze: aprovechar
    // el ancho que hay); si da igual, al lado
    const otras = mesas.filter(o => o.id !== m.id && !o.parteDeId)
    const alLado = partir(m, mitad, lado, true), encima = partir(m, mitad, lado, false)
    r.push(...(aire(encima, otras) > aire(alLado, otras) ? encima : alLado))
  }
  return r.sort((a, b) => a.numero - b.numero)
}
