import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const createRetiroSchema = z.object({
  empleadoId: z.number().int().positive(),
  restaurantId: z.number().int().positive(),
  items: z.array(z.object({
    barcode: z.string().min(1),
    nombre: z.string().min(1),
    cantidad: z.number().positive(),
    unidad: z.enum(['kg', 'ud', 'l', 'g'])
  })).min(1)
})

const filtersSchema = z.object({
  restaurantId: z.coerce.number().optional(),
  empleadoId: z.coerce.number().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20)
})

export async function retiroRoutes(app: FastifyInstance) {

  app.post('/retiros', async (req, reply) => {
    const result = createRetiroSchema.safeParse(req.body)
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() })
    }

    const { empleadoId, restaurantId, items } = result.data

    const retiro = await prisma.retiro.create({
      data: {
        empleadoId,
        restaurantId,
        items: { create: items }
      },
      include: {
        empleado: true,
        restaurant: true,
        items: true
      }
    })

    return reply.status(201).send(retiro)
  })

  app.get('/retiros', async (req, reply) => {
    const result = filtersSchema.safeParse(req.query)
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() })
    }

    const { restaurantId, empleadoId, desde, hasta, page, limit } = result.data
    const where: any = {}
    if (restaurantId) where.restaurantId = restaurantId
    if (empleadoId) where.empleadoId = empleadoId
    if (desde || hasta) {
      where.createdAt = {}
      if (desde) where.createdAt.gte = new Date(desde)
      if (hasta) where.createdAt.lte = new Date(hasta)
    }

    const [retiros, total] = await Promise.all([
      prisma.retiro.findMany({
        where,
        include: { empleado: true, restaurant: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.retiro.count({ where })
    ])

    return { retiros, total, page, limit, pages: Math.ceil(total / limit) }
  })

  app.get('/retiros/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const retiro = await prisma.retiro.findUnique({
      where: { id: Number(id) },
      include: { empleado: true, restaurant: true, items: true }
    })
    if (!retiro) return reply.status(404).send({ error: 'Retiro no encontrado' })
    return retiro
  })
}
