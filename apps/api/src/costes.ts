import { prisma } from './server'

// Coste de los productos del inventario para los escandallos. Un producto comprado vale su
// precioCoste; una elaboración (salsa, fondo, premix… con receta propia) vale lo que cuestan sus
// ingredientes ÷ lo que rinde la tanda, y puede llevar otras elaboraciones dentro.

export type Producto = { unidad: string; precioCoste: number | null; unidadBase: string | null; contenido: number | null; mermaPct: number }

// Una elaboración dentro de otra, hasta este fondo (fondo → salsa → plato ya son 2)
export const PROFUNDIDAD_MAX = 4

// En qué se mide el producto dentro de una receta y cuántas de esas unidades trae la unidad de compra
export function base(p: Pick<Producto, 'unidad' | 'unidadBase' | 'contenido'>): { unidadBase: string; contenido: number } {
  const porDefecto: Record<string, { unidadBase: string; contenido: number }> = {
    kg: { unidadBase: 'g', contenido: 1000 },
    l: { unidadBase: 'ml', contenido: 1000 },
    botella: { unidadBase: 'ml', contenido: 750 },
    caja: { unidadBase: 'ud', contenido: 1 },
    ud: { unidadBase: 'ud', contenido: 1 },
  }
  const d = porDefecto[p.unidad] ?? porDefecto.ud
  return { unidadBase: p.unidadBase ?? d.unidadBase, contenido: p.contenido && p.contenido > 0 ? p.contenido : d.contenido }
}

// € por unidad base ya aprovechable de un producto comprado (la merma encarece lo que queda)
function costeComprado(p: Producto): number | null {
  if (p.precioCoste === null || p.precioCoste === undefined) return null
  const aprovechable = 1 - Math.min(95, Math.max(0, p.mermaPct)) / 100
  return p.precioCoste / base(p).contenido / aprovechable
}

const conElaboracion = { elaboracion: { include: { lineas: { orderBy: { orden: 'asc' as const } } } } }

// Carga todo el catálogo una vez y calcula el coste de cada producto bajo demanda (con memoria).
// null = falta algún precio (de él o de algo que lleva dentro) o la receta da la vuelta sobre sí misma.
export async function cargarCostes() {
  const productos = await prisma.inventarioProducto.findMany({ include: conElaboracion })
  const porId = new Map(productos.map(p => [p.id, p]))
  const memo = new Map<number, number | null>()

  const esElaboracion = (id: number) => {
    const e = porId.get(id)?.elaboracion
    return !!e && e.lineas.length > 0 && (e.rendimiento ?? 0) > 0
  }

  const calcular = (id: number, pila: number[]): number | null => {
    if (memo.has(id)) return memo.get(id)!
    const p = porId.get(id)
    if (!p) return null
    if (!esElaboracion(id)) {
      const c = costeComprado(p)
      memo.set(id, c)
      return c
    }
    if (pila.includes(id) || pila.length >= PROFUNDIDAD_MAX) return null
    let total = 0
    for (const l of p.elaboracion!.lineas) {
      const c = calcular(l.productoId, [...pila, id])
      if (c === null) { memo.set(id, null); return null }
      total += c * l.cantidad
    }
    const c = total / p.elaboracion!.rendimiento!
    memo.set(id, c)
    return c
  }

  return { porId, esElaboracion, coste: (id: number) => calcular(id, []) }
}

// ¿Llegar a `objetivo` siguiendo las recetas desde `desde`? (para no guardar una receta circular)
export function alcanza(porId: Awaited<ReturnType<typeof cargarCostes>>['porId'], desde: number, objetivo: number, profundidad = 0): boolean {
  if (desde === objetivo) return true
  if (profundidad > PROFUNDIDAD_MAX) return true
  const lineas = porId.get(desde)?.elaboracion?.lineas ?? []
  return lineas.some(l => alcanza(porId, l.productoId, objetivo, profundidad + 1))
}

// Deja en precioCoste de cada elaboración lo que vale hoy (por kg / l / ud), para Inventario → Costes
// y los pedidos. Se llama cuando cambia un precio o una receta; los escandallos calculan al vuelo igual.
export async function refrescarElaboraciones() {
  const { porId, esElaboracion, coste } = await cargarCostes()
  for (const p of porId.values()) {
    if (!esElaboracion(p.id)) continue
    const cu = coste(p.id)
    const precio = cu === null ? null : Math.round(cu * base(p).contenido * 10000) / 10000
    if (precio !== p.precioCoste || p.precioOrigen !== 'receta') {
      await prisma.inventarioProducto.update({ where: { id: p.id }, data: { precioCoste: precio, precioOrigen: 'receta' } })
    }
  }
}
