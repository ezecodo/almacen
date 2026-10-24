import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

// Accesos rápidos de la carta en sala: hasta MAX platos arriba de COMIDA / BEBIDAS al abrir una
// mesa, para marchar las primeras bebidas sin entrar en categorías (en el teléfono se ven tres
// filas y el resto con scroll).
//   - fijos: los elige el admin en /admin/accesos-rapidos (en su orden). Hay una lista del grupo
//     (restaurantId null) y cada local la usa o tiene la suya (Restaurant.accesoRapidoPropia;
//     null = nunca tocado → propia si tiene filas, así no se pierde lo configurado antes)
//   - si Restaurant.accesoRapidoAuto, los huecos hasta AUTO_HASTA se completan con las bebidas más
//     vendidas de los últimos DIAS días (unidades, por nombre; un combinado cuenta para su destilado).
//     Solo las tres primeras filas: con más huecos se colarían cosas que casi no se piden

const MAX = 24
const AUTO_HASTA = 9
const DIAS = 30
const esGrupoBarra = (g: string) => /vino|bebida/i.test(g) // mismo criterio que la sala
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const restQuery = z.object({ restaurantId: z.coerce.number().int().positive() })
const adminQuery = z.object({ restaurantId: z.coerce.number().int().positive().optional() }) // sin él: la del grupo
const guardarSchema = z.object({
  restaurantId: z.number().int().positive().nullable(),
  auto: z.boolean().optional(),
  propia: z.boolean().optional(),
  menuItemIds: z.array(z.number().int().positive()).max(MAX),
})

// Lo que el camarero puede pedir en ese local (mismo filtro que el picker de sala).
// Sin local: solo la carta global (la lista del grupo tiene que servir en todos)
async function cartaVisible(restaurantId: number | null) {
  const scope = restaurantId === null ? [{ restaurantId: null }] : [{ restaurantId: null }, { restaurantId }]
  const [items, cats] = await Promise.all([
    prisma.menuItem.findMany({
      where: { activo: true, ocultoEnCarta: false, autoPorPax: false, OR: scope },
      select: { id: true, nombre: true, categoria: true },
    }),
    prisma.menuCategoria.findMany({
      where: { OR: scope },
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

async function fijosDe(restaurantId: number | null) {
  const fijos = await prisma.accesoRapido.findMany({ where: { restaurantId }, orderBy: { orden: 'asc' }, select: { menuItemId: true } })
  return fijos.map(f => f.menuItemId)
}

// ¿El local usa su propia lista o la del grupo?
async function usaPropia(restaurantId: number, marcado: boolean | null | undefined) {
  if (marcado != null) return marcado
  return (await prisma.accesoRapido.count({ where: { restaurantId } })) > 0
}

export async function accesoRapidoRoutes(app: FastifyInstance) {
  // Sala: los ids a mostrar, en orden
  app.get('/accesos-rapidos', async req => {
    const { restaurantId } = restQuery.parse(req.query)
    const [rest, carta] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { accesoRapidoAuto: true, accesoRapidoPropia: true } }),
      cartaVisible(restaurantId),
    ])
    const fijos = await fijosDe(await usaPropia(restaurantId, rest?.accesoRapidoPropia) ? restaurantId : null)
    const visibles = new Set(carta.map(i => i.id))
    const ids = fijos.filter(id => visibles.has(id)) // un fijo que se ocultó o desactivó no sale
    if (rest?.accesoRapidoAuto) {
      for (const v of await masVendidas(restaurantId)) {
        if (ids.length >= AUTO_HASTA) break
        if (!ids.includes(v.id)) ids.push(v.id)
      }
    }
    return ids.slice(0, MAX)
  })

  // Admin: la lista del grupo (sin restaurantId) o la configuración de un local, con la del grupo
  // y las más vendidas a la vista
  app.get('/admin/accesos-rapidos', async req => {
    const { restaurantId } = adminQuery.parse(req.query)
    const grupo = await fijosDe(null)
    if (!restaurantId) return { max: MAX, autoHasta: AUTO_HASTA, dias: DIAS, auto: true, propia: false, fijos: grupo, fijosGrupo: grupo, masVendidas: [] }
    const [rest, fijos, vendidas] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { accesoRapidoAuto: true, accesoRapidoPropia: true } }),
      fijosDe(restaurantId),
      masVendidas(restaurantId),
    ])
    return {
      max: MAX, autoHasta: AUTO_HASTA, dias: DIAS,
      auto: rest?.accesoRapidoAuto ?? true,
      propia: await usaPropia(restaurantId, rest?.accesoRapidoPropia),
      fijos, fijosGrupo: grupo, masVendidas: vendidas.slice(0, 30),
    }
  })

  app.put('/admin/accesos-rapidos', async (req, reply) => {
    const { restaurantId, auto, propia, menuItemIds } = guardarSchema.parse(req.body)
    const ids = [...new Set(menuItemIds)]
    const visibles = new Set((await cartaVisible(restaurantId)).map(i => i.id))
    if (ids.some(id => !visibles.has(id))) {
      return reply.status(400).send({ error: restaurantId === null ? 'La lista del grupo solo admite platos de la carta global' : 'Hay platos que no están en la carta de este local' })
    }
    await prisma.$transaction([
      ...(restaurantId !== null && (auto !== undefined || propia !== undefined)
        ? [prisma.restaurant.update({ where: { id: restaurantId }, data: { accesoRapidoAuto: auto, accesoRapidoPropia: propia } })]
        : []),
      prisma.accesoRapido.deleteMany({ where: { restaurantId } }),
      prisma.accesoRapido.createMany({ data: ids.map((menuItemId, orden) => ({ restaurantId, menuItemId, orden })) }),
    ])
    const avisar = restaurantId !== null ? [restaurantId] : (await prisma.restaurant.findMany({ select: { id: true } })).map(r => r.id)
    for (const id of avisar) broadcast(id, 'accesos-rapidos')
    return { ok: true }
  })
}
