import { prisma } from './server'
import { cargarCostes } from './costes'

// Margen teórico de lo cobrado: cada línea de comanda que sale de un plato de la carta
// (ComandaItem.menuItemId) cuesta lo que dice su escandallo. Es lo que *debería* haber costado según
// la receta, no el gasto real (eso sale de conteos y facturas). Solo para admin y Pulso.

const r2 = (n: number) => Math.round(n * 100) / 100

type Linea = { menuItemId: number | null; nombre: string; precio: number; cantidad: number; invitacion: boolean; autoGenerado: boolean }
type ComandaConItems = { items: Linea[] }
type MermaConPlato = { menuItemId: number | null; cantidad: number; motivo: string }

export type Margen = { costeVendido: number; costeMermas: number; ventasConEscandallo: number }

// Platos de la carta del local (globales + suyos) por nombre exacto, para lo que llega sin ficha
// (los platos de un menú de grupo se guardan por nombre en la plantilla)
export async function platosPorNombre(restaurantId: number, nombres: string[]): Promise<Map<string, number>> {
  if (nombres.length === 0) return new Map()
  const items = await prisma.menuItem.findMany({
    where: { nombre: { in: [...new Set(nombres)] }, OR: [{ restaurantId: null }, { restaurantId }] },
    select: { id: true, nombre: true, restaurantId: true, activo: true },
  })
  // Si hay dos con el mismo nombre: el del local antes que el global, el activo antes que el apagado
  items.sort((a, b) => Number(b.activo) - Number(a.activo) || Number(b.restaurantId !== null) - Number(a.restaurantId !== null))
  const porNombre = new Map<string, number>()
  for (const i of items) if (!porNombre.has(i.nombre)) porNombre.set(i.nombre, i.id)
  return porNombre
}

// Coste de una ración de cada plato; null = sin receta o le falta algún precio (no cuenta)
async function costesDePlatos(ids: number[]): Promise<Map<number, number | null>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const [recetas, costes] = await Promise.all([
    prisma.receta.findMany({ where: { menuItemId: { in: unicos } }, include: { lineas: true } }),
    cargarCostes(),
  ])
  const porPlato = new Map<number, number | null>()
  for (const r of recetas) {
    if (r.menuItemId === null || r.lineas.length === 0 || r.raciones <= 0) continue
    let total = 0
    let completo = true
    for (const l of r.lineas) {
      const cu = costes.coste(l.productoId)
      if (cu === null) { completo = false; break }
      total += cu * l.cantidad
    }
    porPlato.set(r.menuItemId, completo ? total / r.raciones : null)
  }
  return porPlato
}

export async function margenDe(comandas: ComandaConItems[], mermas: MermaConPlato[]): Promise<Margen> {
  const ids = [
    ...comandas.flatMap(c => c.items.map(i => i.menuItemId)),
    ...mermas.map(m => m.menuItemId),
  ].filter((id): id is number => id !== null)
  const coste = await costesDePlatos(ids)
  const costeDe = (id: number | null) => (id === null ? null : coste.get(id) ?? null)

  let costeVendido = 0
  let ventasConEscandallo = 0
  for (const c of comandas) {
    let platosDeMenu = false
    for (const i of c.items) {
      const cu = costeDe(i.menuItemId)
      if (cu === null) continue
      // Una invitación cuesta igual y no cobra nada: sube el food cost, como tiene que ser
      costeVendido += cu * i.cantidad
      if (!i.invitacion) ventasConEscandallo += i.precio * i.cantidad
      if (i.precio === 0 && !i.invitacion) platosDeMenu = true
    }
    // Menú de grupo: los platos van a 0 € y se cobra la línea "Menú X" (precio × pax). Si sus platos
    // tienen escandallo, lo cobrado por el menú es la venta que les corresponde.
    if (platosDeMenu) {
      for (const i of c.items) {
        if (i.autoGenerado && i.menuItemId === null && !i.invitacion && i.nombre.startsWith('Menú ')) ventasConEscandallo += i.precio * i.cantidad
      }
    }
  }
  let costeMermas = 0
  for (const m of mermas) {
    // "No servido" = el plato no se llegó a hacer: no gastó materia prima
    if (m.motivo === 'no_servido') continue
    const cu = costeDe(m.menuItemId)
    if (cu !== null) costeMermas += cu * m.cantidad
  }
  return { costeVendido: r2(costeVendido), costeMermas: r2(costeMermas), ventasConEscandallo: r2(ventasConEscandallo) }
}

// Lo que se enseña: margen = ventas sin IVA − coste de lo vendido − mermas; food cost sobre la parte
// de lo vendido que tiene escandallo; cobertura = cuánto de lo vendido tenía escandallo
export function resumenMargen(ventas: number, m: Margen, tasaIva: number) {
  const sinIva = (n: number) => n / (1 + tasaIva / 100)
  const ventasSinIva = sinIva(ventas)
  const cubiertoSinIva = sinIva(m.ventasConEscandallo)
  return {
    ...m,
    margen: r2(ventasSinIva - m.costeVendido - m.costeMermas),
    foodCost: cubiertoSinIva > 0 ? Math.round((m.costeVendido / cubiertoSinIva) * 1000) / 10 : null,
    cobertura: ventas > 0 ? Math.round((m.ventasConEscandallo / ventas) * 100) : null,
  }
}

export async function tasaIva() {
  return (await prisma.empresaConfig.findFirst())?.tasaIva ?? 10
}
