import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const createSchema = z.object({
  nombre: z.string().min(1),
  pin:    z.string().length(4).regex(/^\d{4}$/),
})

const updateSchema = createSchema.partial().extend({
  activo: z.boolean().optional(),
})

export async function empleadoRoutes(app: FastifyInstance) {

  // Auth por PIN
  app.post('/empleados/auth', async (req, reply) => {
    const { pin } = req.body as { pin: string }
    if (!pin) return reply.status(400).send({ error: 'PIN requerido' })

    const empleado = await prisma.empleado.findUnique({
      where: { pin },
    })

    if (!empleado || !empleado.activo) {
      return reply.status(401).send({ error: 'PIN incorrecto' })
    }

    return empleado
  })

  // Listar todos los empleados (admin)
  app.get('/empleados', async () => {
    return prisma.empleado.findMany({ orderBy: { nombre: 'asc' } })
  })

  // Crear empleado
  app.post('/empleados', async (req, reply) => {
    const result = createSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const existe = await prisma.empleado.findUnique({ where: { pin: result.data.pin } })
    if (existe) return reply.status(409).send({ error: 'Este PIN ya está en uso' })

    const empleado = await prisma.empleado.create({ data: result.data })
    return reply.status(201).send(empleado)
  })

  // Editar empleado
  app.put('/empleados/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = updateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    if (result.data.pin) {
      const existe = await prisma.empleado.findFirst({
        where: { pin: result.data.pin, NOT: { id } },
      })
      if (existe) return reply.status(409).send({ error: 'Este PIN ya está en uso' })
    }

    const empleado = await prisma.empleado.update({ where: { id }, data: result.data })
    return empleado
  })

  // Eliminar empleado
  app.delete('/empleados/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.empleado.update({ where: { id }, data: { activo: false } })
    return reply.status(204).send()
  })
}
