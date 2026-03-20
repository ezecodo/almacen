import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const createSchema = z.object({
  nombre:   z.string().min(1),
  tipo:     z.enum(['cocina', 'sala']).default('cocina'),
  pin:      z.string().length(4).regex(/^\d{4}$/),
  telefono: z.string().optional(),
})

const updateSchema = z.object({
  nombre:   z.string().min(1).optional(),
  tipo:     z.enum(['cocina', 'sala']).optional(),
  pin:      z.string().length(4).regex(/^\d{4}$/).optional(),
  telefono: z.string().optional().nullable(),
  activo:   z.boolean().optional(),
})

export async function empleadoRoutes(app: FastifyInstance) {

  // Auth por PIN (solo cocina)
  app.post('/empleados/auth', async (req, reply) => {
    const { pin } = req.body as { pin: string }
    if (!pin) return reply.status(400).send({ error: 'PIN requerido' })

    const empleado = await prisma.empleado.findUnique({ where: { pin } })
    if (!empleado || !empleado.activo) {
      return reply.status(401).send({ error: 'PIN incorrecto' })
    }

    return empleado
  })

  // Listar empleados con filtro opcional por tipo
  app.get('/empleados', async (req) => {
    const { tipo } = req.query as { tipo?: string }
    return prisma.empleado.findMany({
      where: tipo ? { tipo, activo: true } : undefined,
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    })
  })

  // Crear empleado
  app.post('/empleados', async (req, reply) => {
    const result = createSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    if (result.data.pin) {
      const existe = await prisma.empleado.findUnique({ where: { pin: result.data.pin } })
      if (existe) return reply.status(409).send({ error: 'Este PIN ya está en uso' })
    }

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

  // Desactivar empleado (soft delete)
  app.patch('/empleados/:id/desactivar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const empleado = await prisma.empleado.update({ where: { id }, data: { activo: false } })
    return empleado
  })

  // Eliminar empleado (hard delete — falla si tiene retiros)
  app.delete('/empleados/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const tieneRetiros = await prisma.retiro.count({ where: { empleadoId: id } })
    if (tieneRetiros > 0) {
      return reply.status(409).send({
        error: 'Este empleado tiene retiros registrados. Usa "Desactivar" en su lugar.',
      })
    }

    // Borrar turnos de propinas y luego el empleado
    await prisma.propinaTurno.deleteMany({ where: { empleadoId: id } })
    await prisma.empleado.delete({ where: { id } })
    return reply.status(204).send()
  })
}
