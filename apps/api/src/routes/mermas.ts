import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const mermaSchema = z.object({
  restaurantId:   z.number().int().positive(),
  mesaNumero:     z.number().int().optional(),
  planNombre:     z.string().optional(),
  comandaId:      z.number().int().optional(),
  itemNombre:     z.string().min(1),
  cantidad:       z.number().int().positive().default(1),
  camareroNombre: z.string().optional(),
  motivo:         z.enum(['no_servido', 'queja_cliente', 'otro']),
  descripcion:    z.string().optional(),
})

export async function mermaRoutes(app: FastifyInstance) {

  app.post('/mermas', async (req, reply) => {
    const result = mermaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const merma = await prisma.merma.create({ data: result.data })
    return reply.status(201).send(merma)
  })

  app.get('/mermas', async (req, reply) => {
    const { restaurantId, desde, hasta, page = '1', limit = '30' } = req.query as {
      restaurantId?: string; desde?: string; hasta?: string; page?: string; limit?: string
    }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const where: Record<string, unknown> = { restaurantId: Number(restaurantId) }
    if (desde || hasta) {
      where.createdAt = {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(hasta + 'T23:59:59') } : {}),
      }
    }

    const [mermas, total] = await Promise.all([
      prisma.merma.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.merma.count({ where }),
    ])

    return { mermas, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
  })
}
