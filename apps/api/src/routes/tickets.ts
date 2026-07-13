import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const empresaSchema = z.object({
  razonSocial: z.string().default(''),
  nif:         z.string().nullable().optional(),
  tasaIva:     z.number().min(0).max(100).default(10),
  mensajePie:  z.string().nullable().optional(),
})

const ticketConfigSchema = z.object({
  restaurantId:       z.number().int().positive(),
  nombreComercial:    z.string().min(1),
  direccion:          z.string().nullable().optional(),
  telefono:           z.string().nullable().optional(),
  mensajePieOverride: z.string().nullable().optional(),
})

const impresoraSchema = z.object({
  restaurantId: z.number().int().positive(),
  nombre:       z.string().min(1),
  ip:           z.string().min(1),
})

const rutaSchema = z.object({
  floorPlanId: z.number().int().positive(),
  tipoTicket:  z.enum(['cocina', 'barra', 'cobro']),
  impresoraId: z.number().int().positive(),
  copias:      z.number().int().min(1).max(5).default(1),
})

export async function ticketRoutes(app: FastifyInstance) {

  // ── Empresa (singleton) ───────────────────────────────────────────────────────

  // GET /empresa-config — crea la fila con valores por defecto si aún no existe
  app.get('/empresa-config', async () => {
    const existente = await prisma.empresaConfig.findFirst()
    if (existente) return existente
    return prisma.empresaConfig.create({ data: {} })
  })

  // PUT /empresa-config
  app.put('/empresa-config', async (req, reply) => {
    const result = empresaSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const existente = await prisma.empresaConfig.findFirst()
    if (existente) {
      return prisma.empresaConfig.update({ where: { id: existente.id }, data: result.data })
    }
    return prisma.empresaConfig.create({ data: result.data })
  })

  // ── Ticket config por restaurante ─────────────────────────────────────────────

  // GET /tickets/config?restaurantId=X
  app.get('/tickets/config', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.ticketConfig.findUnique({ where: { restaurantId: Number(restaurantId) } })
  })

  // PUT /tickets/config — upsert por restaurantId
  app.put('/tickets/config', async (req, reply) => {
    const result = ticketConfigSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantId, ...data } = result.data

    return prisma.ticketConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    })
  })

  // ── Impresoras (por restaurante) ──────────────────────────────────────────────

  // GET /tickets/impresoras?restaurantId=X
  app.get('/tickets/impresoras', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.impresora.findMany({
      where: { restaurantId: Number(restaurantId) },
      orderBy: { nombre: 'asc' },
    })
  })

  // POST /tickets/impresoras
  app.post('/tickets/impresoras', async (req, reply) => {
    const result = impresoraSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const impresora = await prisma.impresora.create({ data: result.data })
    return reply.status(201).send(impresora)
  })

  // PUT /tickets/impresoras/:id
  app.put('/tickets/impresoras/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = impresoraSchema.omit({ restaurantId: true }).partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.impresora.update({ where: { id }, data: result.data })
  })

  // DELETE /tickets/impresoras/:id — borra en cascada sus rutas de impresión
  app.delete('/tickets/impresoras/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.impresora.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Rutas de impresión (por sala) ──────────────────────────────────────────────

  // GET /tickets/rutas?floorPlanId=X
  app.get('/tickets/rutas', async (req, reply) => {
    const { floorPlanId } = req.query as { floorPlanId?: string }
    if (!floorPlanId) return reply.status(400).send({ error: 'floorPlanId requerido' })
    return prisma.impresionRuta.findMany({
      where: { floorPlanId: Number(floorPlanId) },
      include: { impresora: true },
      orderBy: { id: 'asc' },
    })
  })

  // POST /tickets/rutas
  app.post('/tickets/rutas', async (req, reply) => {
    const result = rutaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const ruta = await prisma.impresionRuta.create({ data: result.data, include: { impresora: true } })
    return reply.status(201).send(ruta)
  })

  // PUT /tickets/rutas/:id — cambiar copias o la impresora destino
  app.put('/tickets/rutas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = rutaSchema.omit({ floorPlanId: true, tipoTicket: true }).partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.impresionRuta.update({ where: { id }, data: result.data, include: { impresora: true } })
  })

  // DELETE /tickets/rutas/:id
  app.delete('/tickets/rutas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.impresionRuta.delete({ where: { id } })
    return reply.status(204).send()
  })
}
