import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const TIPOS_MESA = ['round', 'square', 'rectangular', 'barra', 'silla_alta', 'pared', 'columna', 'ventana', 'entrada'] as const

const mesaSchema = z.object({
  numero:    z.number().int().min(0),
  tipo:      z.enum(TIPOS_MESA),
  x:         z.number(),
  y:         z.number(),
  capacidad: z.number().int().min(0),
  rotacion:  z.number().int().optional().default(0),
  ancho:     z.number().int().positive().optional(),
  alto:      z.number().int().positive().optional(),
})

const updateMesaSchema = z.object({
  numero:    z.number().int().min(0).optional(),
  tipo:      z.enum(TIPOS_MESA).optional(),
  x:         z.number().optional(),
  y:         z.number().optional(),
  capacidad: z.number().int().min(0).optional(),
  rotacion:  z.number().int().optional(),
  ancho:     z.number().int().positive().optional(),
  alto:      z.number().int().positive().optional(),
})

const batchSchema = z.array(z.object({
  id: z.number().int().positive(),
  x:  z.number(),
  y:  z.number(),
}))

export async function salonRoutes(app: FastifyInstance) {

  // Listar planos de un restaurante
  app.get('/salon', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    return prisma.floorPlan.findMany({
      where: { restaurantId: Number(restaurantId) },
      include: { mesas: { orderBy: { numero: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  })

  // Crear plano
  app.post('/salon', async (req, reply) => {
    const { restaurantId, nombre } = req.body as { restaurantId: number; nombre: string }
    if (!restaurantId || !nombre) return reply.status(400).send({ error: 'restaurantId y nombre requeridos' })

    const plan = await prisma.floorPlan.create({
      data: { restaurantId, nombre },
      include: { mesas: true },
    })
    return reply.status(201).send(plan)
  })

  // Renombrar plano
  app.put('/salon/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { nombre } = req.body as { nombre: string }
    if (!nombre) return reply.status(400).send({ error: 'nombre requerido' })

    const plan = await prisma.floorPlan.update({ where: { id }, data: { nombre }, include: { mesas: true } })
    return plan
  })

  // Eliminar plano (en cascada elimina mesas)
  app.delete('/salon/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.floorPlan.delete({ where: { id } })
    return reply.status(204).send()
  })

  // Añadir mesa
  app.post('/salon/:id/mesas', async (req, reply) => {
    const floorPlanId = Number((req.params as { id: string }).id)
    const result = mesaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const mesa = await prisma.mesa.create({ data: { ...result.data, floorPlanId } })
    return reply.status(201).send(mesa)
  })

  // Actualizar mesa (posición, capacidad, tipo, número)
  app.put('/salon/:id/mesas/:mesaId', async (req, reply) => {
    const mesaId = Number((req.params as { id: string; mesaId: string }).mesaId)
    const result = updateMesaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const mesa = await prisma.mesa.update({ where: { id: mesaId }, data: result.data })
    return mesa
  })

  // Eliminar mesa
  app.delete('/salon/:id/mesas/:mesaId', async (req, reply) => {
    const mesaId = Number((req.params as { id: string; mesaId: string }).mesaId)
    const activas = await prisma.comanda.count({
      where: { mesaId, estado: { notIn: ['cerrada'] } },
    })
    if (activas > 0) {
      return reply.status(409).send({ error: 'La mesa tiene comandas activas y no se puede eliminar' })
    }
    // Desvincular comandas cerradas históricas antes de eliminar
    await prisma.comanda.updateMany({ where: { mesaId }, data: { mesaId: null } })
    await prisma.mesa.delete({ where: { id: mesaId } })
    return reply.status(204).send()
  })

  // Guardar posiciones en batch (drag-and-drop)
  app.patch('/salon/:id/mesas', async (req, reply) => {
    const result = batchSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    await Promise.all(
      result.data.map(({ id, x, y }) => prisma.mesa.update({ where: { id }, data: { x, y } }))
    )
    return { ok: true }
  })
}
