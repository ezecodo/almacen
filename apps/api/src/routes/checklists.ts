import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// ── Schemas ────────────────────────────────────────────────────────────────────

const sectorSchema = z.object({
  restaurantId: z.number().int().positive(),
  nombre:       z.string().min(1),
  orden:        z.number().int().default(0),
})

const itemSchema = z.object({
  sectorId: z.number().int().positive(),
  momento:  z.enum(['apertura', 'cierre']),
  texto:    z.string().min(1),
  orden:    z.number().int().default(0),
})

const ejecucionSchema = z.object({
  sectorId:      z.number().int().positive(),
  momento:       z.enum(['apertura', 'cierre']),
  completadoPor: z.string().min(1),
  itemsMarcados: z.array(z.object({
    texto:   z.string(),
    marcado: z.boolean(),
  })),
})

// Rango [inicio, fin) del día de una fecha (o de hoy)
function rangoDia(fecha?: string) {
  const base = fecha ? new Date(fecha) : new Date()
  const inicio = new Date(base)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 1)
  return { inicio, fin }
}

export async function checklistRoutes(app: FastifyInstance) {

  // ── Vista sala: sectores con ítems + ejecuciones de hoy ───────────────────────
  app.get('/checklists', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    const rid = Number(restaurantId)
    const { inicio, fin } = rangoDia()

    const sectores = await prisma.checklistSector.findMany({
      where: { restaurantId: rid },
      orderBy: { orden: 'asc' },
      include: {
        items: { orderBy: { orden: 'asc' } },
        ejecuciones: {
          where: { fecha: { gte: inicio, lt: fin } },
          orderBy: { fecha: 'desc' },
        },
      },
    })
    return sectores
  })

  // ── Sectores (admin) ──────────────────────────────────────────────────────────

  app.get('/checklists/sectores', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.checklistSector.findMany({
      where: { restaurantId: Number(restaurantId) },
      orderBy: { orden: 'asc' },
      include: { items: { orderBy: { orden: 'asc' } } },
    })
  })

  app.post('/checklists/sectores', async (req, reply) => {
    const result = sectorSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const sector = await prisma.checklistSector.create({ data: result.data })
    return reply.status(201).send(sector)
  })

  app.put('/checklists/sectores/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = sectorSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const sector = await prisma.checklistSector.update({ where: { id }, data: result.data })
    return sector
  })

  app.delete('/checklists/sectores/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    // Cascada: ejecuciones + ítems del sector
    await prisma.checklistEjecucion.deleteMany({ where: { sectorId: id } })
    await prisma.checklistItem.deleteMany({ where: { sectorId: id } })
    await prisma.checklistSector.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Ítems (admin) ─────────────────────────────────────────────────────────────

  app.post('/checklists/items', async (req, reply) => {
    const result = itemSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const item = await prisma.checklistItem.create({ data: result.data })
    return reply.status(201).send(item)
  })

  app.put('/checklists/items/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = itemSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const item = await prisma.checklistItem.update({ where: { id }, data: result.data })
    return item
  })

  app.delete('/checklists/items/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.checklistItem.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Ejecuciones ─────────────────────────────────────────────────────────────

  // Registrar checklist completado (desde la app de sala)
  app.post('/checklists/ejecuciones', async (req, reply) => {
    const result = ejecucionSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const sector = await prisma.checklistSector.findUnique({ where: { id: result.data.sectorId } })
    if (!sector) return reply.status(404).send({ error: 'Sector no encontrado' })
    const ejecucion = await prisma.checklistEjecucion.create({
      data: { ...result.data, restaurantId: sector.restaurantId },
    })
    return reply.status(201).send(ejecucion)
  })

  // Histórico (admin): ejecuciones de un restaurante por día
  app.get('/checklists/ejecuciones', async (req, reply) => {
    const { restaurantId, fecha } = req.query as { restaurantId?: string; fecha?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    const { inicio, fin } = rangoDia(fecha)
    return prisma.checklistEjecucion.findMany({
      where: {
        restaurantId: Number(restaurantId),
        fecha: { gte: inicio, lt: fin },
      },
      orderBy: { fecha: 'desc' },
      include: { sector: true },
    })
  })

  app.delete('/checklists/ejecuciones/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.checklistEjecucion.delete({ where: { id } })
    return reply.status(204).send()
  })
}
