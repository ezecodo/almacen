import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

// Accesos rápidos de la carta en sala: hasta MAX platos arriba de COMIDA / BEBIDAS al abrir una
// mesa, para marchar las primeras bebidas sin entrar en categorías. Por local:
//   - fijos: los elige el admin en /admin/accesos-rapidos (en su orden)
//   - si Restaurant.accesoRapidoAuto, los huecos se completan con las bebidas más vendidas
//     de los últimos DIAS días (unidades, por nombre; un combinado cuenta para su destilado)

const MAX = 9
const DIAS = 30
const esGrupoBarra = (g: string) => /vino|bebida/i.test(g) // mismo criterio que la sala
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const restQuery = z.object({ restaurantId: z.coerce.number().int().positive() })
const guardarSchema = z.object({
  restaurantId: z.number().int().positive(),
  auto: z.boolean(),
  menuItemIds: z.array(z.number().int().positive()).max(MAX),
})

// Lo que el camarero puede pedir en ese local (mismo filtro que el picker de sala)
async function cartaVisible(restaurantId: number) {
  const [items, cats] = await Promise.all([
    prisma.menuItem.findMany({
      where: { activo: true, ocultoEnCarta: false, autoPorPax: false, OR: [{ restaurantId: null }, { restaurantId }] },
      select: { id: true, nombre: true, categoria: true },
    }),
    prisma.menuCategoria.findMany({
      where: { OR: [{ restaurantId: null }, { restaurantId }] },
      select: { nombre: true, grupo: true },
    }),
  ])
  const grupoDe = new Map(cats.map(c => [c.nombre, c.grupo]))
  return items.map(i => ({ ...i, barra: esGrupoBarra(grupoDe.get(i.categoria) ?? '') }))
}

// Bebidas de la carta ordenadas por unidades vendidas en el local (las que no se vendieron, fuera).
// Se cachea un rato: se pide cada vez que un camarero abre una mesa.
const cache = new Map<number, { at: number; lista: { id: number; vendidas: number }[] }>()
async function masVendidas(restaurantId: number) {
  const c = cache.get(restaurantId)
  if (c && Date.now() - c.at < 10 * 60_000) return c.lista

  const desde = new Date(Date.now() - DIAS * 86_400_000)
  const vendidos = await prisma.comandaItem.findMany({
    where: { tipo: 'barra', autoGenerado: false, comanda: { restaurantId, createdAt: { gte: desde } } },
    select: { nombre: true, cantidad: true },
  })
  const porNombre = new Map<string, number>()
  for (const v of vendidos) {
    const base = norm(v.nombre.split(' + ')[0]) // "Vodka Absolut + Coca-Cola" → vodka absolut
    porNombre.set(base, (porNombre.get(base) ?? 0) + v.cantidad)
  }
  const carta = await cartaVisible(restaurantId)
  const lista = carta
    .filter(i => i.barra && porNombre.has(norm(i.nombre)))
    .map(i => ({ id: i.id, vendidas: porNombre.get(norm(i.nombre))! }))
    .sort((a, b) => b.vendidas - a.vendidas)
  cache.set(restaurantId, { at: Date.now(), lista })
  return lista
}

async function fijosDe(restaurantId: number) {
  const fijos = await prisma.accesoRapido.findMany({ where: { restaurantId }, orderBy: { orden: 'asc' }, select: { menuItemId: true } })
  return fijos.map(f => f.menuItemId)
}

export async function accesoRapidoRoutes(app: FastifyInstance) {
  // Sala: los ids a mostrar, en orden
  app.get('/accesos-rapidos', async req => {
    const { restaurantId } = restQuery.parse(req.query)
    const [rest, fijos, carta] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { accesoRapidoAuto: true } }),
      fijosDe(restaurantId),
      cartaVisible(restaurantId),
    ])
    const visibles = new Set(carta.map(i => i.id))
    const ids = fijos.filter(id => visibles.has(id)) // un fijo que se ocultó o desactivó no sale
    if (rest?.accesoRapidoAuto) {
      for (const v of await masVendidas(restaurantId)) {
        if (ids.length >= MAX) break
        if (!ids.includes(v.id)) ids.push(v.id)
      }
    }
    return ids.slice(0, MAX)
  })

  // Admin: configuración del local + las más vendidas (para elegir con el dato a la vista)
  app.get('/admin/accesos-rapidos', async req => {
    const { restaurantId } = restQuery.parse(req.query)
    const [rest, fijos, vendidas] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { accesoRapidoAuto: true } }),
      fijosDe(restaurantId),
      masVendidas(restaurantId),
    ])
    return { max: MAX, dias: DIAS, auto: rest?.accesoRapidoAuto ?? true, fijos, masVendidas: vendidas.slice(0, 30) }
  })

  app.put('/admin/accesos-rapidos', async (req, reply) => {
    const { restaurantId, auto, menuItemIds } = guardarSchema.parse(req.body)
    const ids = [...new Set(menuItemIds)]
    const visibles = new Set((await cartaVisible(restaurantId)).map(i => i.id))
    if (ids.some(id => !visibles.has(id))) return reply.status(400).send({ error: 'Hay platos que no están en la carta de este local' })
    await prisma.$transaction([
      prisma.restaurant.update({ where: { id: restaurantId }, data: { accesoRapidoAuto: auto } }),
      prisma.accesoRapido.deleteMany({ where: { restaurantId } }),
      prisma.accesoRapido.createMany({ data: ids.map((menuItemId, orden) => ({ restaurantId, menuItemId, orden })) }),
    ])
    broadcast(restaurantId, 'accesos-rapidos')
    return { ok: true }
  })
}
