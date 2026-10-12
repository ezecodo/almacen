import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { requireAdmin } from '../auth'

const nombreSchema = z.object({ nombre: z.string().trim().min(2).max(80) })

export async function restauranteRoutes(app: FastifyInstance) {
  app.get('/restaurantes', async () => {
    // Es pública (la usa un dispositivo de sala antes de que nadie entre): solo lo que hace falta
    return prisma.restaurant.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } })
  })

  // Alta y cambio de nombre: una instalación nueva arranca sin restaurantes y se cargan desde
  // /admin/restaurantes. No hay borrado: de un restaurante cuelga todo (comandas, turnos, carta).
  app.post('/admin/restaurantes', { preHandler: requireAdmin }, async (req, reply) => {
    const body = nombreSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'El nombre debe tener entre 2 y 80 caracteres' })
    const { nombre } = body.data
    return reply.status(201).send(await prisma.restaurant.create({ data: { nombre } }))
  })

  app.put('/admin/restaurantes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const body = nombreSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'El nombre debe tener entre 2 y 80 caracteres' })
    const { nombre } = body.data
    if (!(await prisma.restaurant.findUnique({ where: { id } }))) return reply.status(404).send({ error: 'Restaurante no encontrado' })
    return prisma.restaurant.update({ where: { id }, data: { nombre } })
  })
}
