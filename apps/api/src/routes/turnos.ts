import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

export async function turnoRoutes(app: FastifyInstance) {

  // Turno activo de un restaurante
  app.get('/turnos/activo', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const turno = await prisma.turno.findFirst({
      where: { restaurantId: Number(restaurantId), estado: 'abierto' },
      orderBy: { aperturaAt: 'desc' },
    })
    return turno ?? null
  })

  // Todos los turnos activos (para dashboard global)
  app.get('/turnos/activos', async (_req, _reply) => {
    return prisma.turno.findMany({
      where: { estado: 'abierto' },
      include: { restaurant: true },
      orderBy: { aperturaAt: 'asc' },
    })
  })

  // Abrir turno
  app.post('/turnos', async (req, reply) => {
    const schema = z.object({
      restaurantId:    z.number().int().positive(),
      encargadoNombre: z.string().optional(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    // Solo puede haber un turno abierto por restaurante
    const existente = await prisma.turno.findFirst({
      where: { restaurantId: result.data.restaurantId, estado: 'abierto' },
    })
    if (existente) return reply.status(409).send({ error: 'Ya hay un turno abierto para este restaurante' })

    const turno = await prisma.turno.create({
      data: { restaurantId: result.data.restaurantId, encargadoNombre: result.data.encargadoNombre },
    })
    return reply.status(201).send(turno)
  })

  // Cerrar turno (calcula totales del día)
  app.patch('/turnos/:id/cerrar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const turno = await prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.status(404).send({ error: 'Turno no encontrado' })
    if (turno.estado === 'cerrado') return reply.status(409).send({ error: 'El turno ya está cerrado' })

    // Comandas cerradas durante el turno
    const comandas = await prisma.comanda.findMany({
      where: {
        restaurantId: turno.restaurantId,
        estado: 'cerrada',
        closedAt: { gte: turno.aperturaAt },
      },
      include: { items: true },
    })

    // Mermas registradas durante el turno
    const mermas = await prisma.merma.findMany({
      where: {
        restaurantId: turno.restaurantId,
        createdAt: { gte: turno.aperturaAt },
      },
    })

    // Calcular totales
    const totalEfectivo = comandas
      .filter(c => c.metodoPago === 'cash')
      .reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.precio * i.cantidad, 0), 0)

    const totalTarjeta = comandas
      .filter(c => c.metodoPago === 'tarjeta')
      .reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.precio * i.cantidad, 0), 0)

    const totalMermas   = mermas.reduce((s, m) => s + m.precio * m.cantidad, 0)
    const totalPropinas = comandas.reduce((s, c) => s + (c.propina ?? 0), 0)

    const now = new Date()
    const updated = await prisma.turno.update({
      where: { id },
      data: {
        estado:       'cerrado',
        cierreAt:     now,
        totalEfectivo,
        totalTarjeta,
        totalVentas:  totalEfectivo + totalTarjeta,
        totalMermas,
        totalPropinas,
        numComandas:  comandas.length,
      },
    })

    return updated
  })

  // Historial de turnos de un restaurante
  app.get('/turnos', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    return prisma.turno.findMany({
      where: { restaurantId: Number(restaurantId) },
      include: {
        propina: {
          include: { turnos: { include: { empleado: true } } },
        },
      },
      orderBy: { aperturaAt: 'desc' },
      take: 30,
    })
  })

  // Comandas cobradas durante un turno
  app.get('/turnos/:id/comandas', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const turno = await prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.status(404).send({ error: 'Turno no encontrado' })

    const hasta = turno.cierreAt ?? new Date()

    return prisma.comanda.findMany({
      where: {
        restaurantId: turno.restaurantId,
        estado: 'cerrada',
        closedAt: { gte: turno.aperturaAt, lte: hasta },
      },
      include: { items: true, mermas: true, mesa: true },
      orderBy: { closedAt: 'asc' },
    })
  })

  // Eliminar turno cerrado
  app.delete('/turnos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const turno = await prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.status(404).send({ error: 'Turno no encontrado' })
    if (turno.estado === 'abierto') return reply.status(409).send({ error: 'No se puede eliminar un turno abierto' })

    await prisma.turno.delete({ where: { id } })
    return reply.status(204).send()
  })
}
