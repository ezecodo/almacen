import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const itemSchema = z.object({
  restaurantId: z.number().int().positive(),
  categoria:    z.string().min(1),
  nombre:       z.string().min(1),
  descripcion:  z.string().default(''),
  precio:       z.number().min(0),
  orden:        z.number().int().default(0),
})

const updateSchema = itemSchema.partial().omit({ restaurantId: true })

export async function menuRoutes(app: FastifyInstance) {

  // GET /menu?restaurantId=1
  app.get('/menu', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const items = await prisma.menuItem.findMany({
      where: { restaurantId: Number(restaurantId) },
      orderBy: [{ categoria: 'asc' }, { orden: 'asc' }, { nombre: 'asc' }],
    })
    return items
  })

  // POST /menu
  app.post('/menu', async (req, reply) => {
    const result = itemSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const item = await prisma.menuItem.create({ data: result.data })
    return reply.status(201).send(item)
  })

  // PUT /menu/:id
  app.put('/menu/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = updateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const item = await prisma.menuItem.update({ where: { id }, data: result.data })
    return item
  })

  // PATCH /menu/:id/toggle
  app.patch('/menu/:id/toggle', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const current = await prisma.menuItem.findUnique({ where: { id } })
    if (!current) return reply.status(404).send({ error: 'No encontrado' })
    const item = await prisma.menuItem.update({ where: { id }, data: { activo: !current.activo } })
    return item
  })

  // DELETE /menu/:id
  app.delete('/menu/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.menuItem.delete({ where: { id } })
    return reply.status(204).send()
  })
}
