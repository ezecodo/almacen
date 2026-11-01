import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

// Pantalla de pase (/pase): lo que antes se decía a gritos entre cocina y pase. Una tablet abajo y otra
// arriba ven lo mismo: los platos de cocina de cada mesa, de la que más lleva esperando a la que menos.
// Un plato pasa de en cocina (sale solo con el Oído) a listo (jefe de cocina) y a servido (el del pase).
// Los tickets salen igual. Solo con internet: si se corta, se sigue con los tickets. Sin precios.

const ACTIVAS = ['abierta', 'enviada', 'facturada', 'liberada']
const VENTANA_MS = 16 * 3600_000 // una mesa olvidada abierta de ayer no ensucia la pantalla
const restQuery = z.object({ restaurantId: z.coerce.number().int().positive() })
const idParams = z.object({ id: z.coerce.number().int().positive() })
const marcaSchema = z.object({ listos: z.number().int().min(0), servidos: z.number().int().min(0) })

const deOtroLocal = (req: FastifyRequest, restaurantId: number) =>
  req.user.tipo === 'sala' && !!req.user.restaurantId && req.user.restaurantId !== restaurantId

export async function paseRoutes(app: FastifyInstance) {
  app.get('/pase', async (req, reply) => {
    const { restaurantId } = restQuery.parse(req.query)
    if (deOtroLocal(req, restaurantId)) return reply.status(403).send({ error: 'Este dispositivo es de otro local' })
    const local = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { pantallaPase: true } })
    if (!local?.pantallaPase) return { activa: false, mesas: [] }

    const [comandas, alergenos] = await Promise.all([
      prisma.comanda.findMany({
        where: {
          restaurantId, estado: { in: ACTIVAS }, createdAt: { gte: new Date(Date.now() - VENTANA_MS) },
          items: { some: { tipo: 'cocina', autoGenerado: false, nivel: { not: null } } },
        },
        include: {
          mesa: { select: { numero: true, floorPlan: { select: { nombre: true } } } },
          items: { where: { tipo: 'cocina', autoGenerado: false, nivel: { not: null } }, orderBy: [{ nivel: 'asc' }, { id: 'asc' }] },
        },
      }),
      prisma.alergeno.findMany({ select: { id: true, nombre: true } }),
    ])

    const mesas = comandas.map(c => {
      // Una merma o un plato quitado pueden dejar la cantidad por debajo de lo ya marcado
      const items = c.items.map(i => {
        const listos = Math.min(i.listos, i.cantidad)
        return {
          id: i.id, nombre: i.nombre, cantidad: i.cantidad, nota: i.nota, nivel: i.nivel!, listos,
          servidos: Math.min(i.servidos, listos), enviadoAt: i.enviadoAt ?? c.enviadaAt ?? c.createdAt, listoAt: i.listoAt,
        }
      })
      const faltan = items.filter(i => i.servidos < i.cantidad)
      const desde = (faltan.length ? faltan : items).reduce((m, i) => (i.enviadoAt < m ? i.enviadoAt : m), items[0].enviadoAt)
      return {
        comandaId: c.id, mesa: c.mesa?.numero ?? null, salon: c.mesa?.floorPlan.nombre ?? '', pax: c.pax, camarero: c.camareroNombre,
        noComparten: c.noComparten, nota: c.notaMesa, sigueAt: c.sigueAt, siguePor: c.siguePor, desde,
        alergias: alergenos.filter(a => c.alergenoIds.includes(a.id)).map(a => a.nombre), items,
      }
    }).sort((a, b) => a.desde.getTime() - b.desde.getTime())
    return { activa: true, mesas }
  })

  // Valores absolutos: si dos tablets marcan a la vez lo mismo, el resultado es el mismo
  app.patch('/pase/items/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const body = marcaSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Cantidades no válidas' })
    const item = await prisma.comandaItem.findUnique({ where: { id }, include: { comanda: { select: { restaurantId: true } } } })
    if (!item) return reply.status(404).send({ error: 'Ese plato ya no está en la mesa' })
    if (deOtroLocal(req, item.comanda.restaurantId)) return reply.status(403).send({ error: 'Este dispositivo es de otro local' })

    const listos = Math.min(body.data.listos, item.cantidad)
    const servidos = Math.min(body.data.servidos, listos)
    const ahora = new Date()
    const por = req.user.nombre
    await prisma.comandaItem.update({
      where: { id },
      data: {
        listos, servidos,
        ...(listos > item.listos && { listoAt: ahora, listoPor: por }),
        ...(servidos > item.servidos && { servidoAt: ahora, servidoPor: por }),
      },
    })
    // La cocina respondió al "sigue"
    if (listos > item.listos) await prisma.comanda.update({ where: { id: item.comandaId }, data: { sigueAt: null, siguePor: null } })
    broadcast(item.comanda.restaurantId, 'pase')
    return { ok: true }
  })

  // 🔔 "Porfa, la 8 sigue": el camarero que ve la demora lo pide desde su mesa y la tarjeta late en las
  // dos tablets. No se deshace: lo apaga cocina al marcar algo listo de esa mesa. Pedirlo otra vez no cambia nada.
  app.post('/pase/comandas/:id/sigue', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      select: { restaurantId: true, sigueAt: true, items: { where: { tipo: 'cocina', autoGenerado: false, nivel: { not: null } }, select: { cantidad: true, listos: true } } },
    })
    if (!comanda) return reply.status(404).send({ error: 'Esa mesa ya no está' })
    if (deOtroLocal(req, comanda.restaurantId)) return reply.status(403).send({ error: 'Este dispositivo es de otro local' })
    if (comanda.sigueAt) return { ok: true }
    // Lo que ya está en el pase no se pide: se va a buscar
    if (comanda.items.every(i => i.listos >= i.cantidad)) return reply.status(409).send({ error: 'No queda nada en cocina' })
    await prisma.comanda.update({ where: { id }, data: { sigueAt: new Date(), siguePor: req.user.nombre } })
    broadcast(comanda.restaurantId, 'pase')
    return { ok: true }
  })
}
