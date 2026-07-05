import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// ── Schemas ────────────────────────────────────────────────────────────────────

const categoriaSchema = z.object({
  nombre: z.string().min(1),
  icono:  z.string().default(''),
  orden:  z.number().int().default(0),
})

// Guiones por idioma — sólo los que tengan texto son "escuchables"
const guionesSchema = z.object({
  en: z.string().optional(),
  fr: z.string().optional(),
  de: z.string().optional(),
}).default({})

const articuloSchema = z.object({
  categoriaId:  z.number().int().positive(),
  restaurantId: z.number().int().positive().nullable().default(null),
  titulo:       z.string().min(1),
  guiones:      guionesSchema,
  notas:        z.string().default(''),
  orden:        z.number().int().default(0),
})

export async function wikiRoutes(app: FastifyInstance) {

  // ── Vista combinada (sala): categorías con sus artículos activos ──────────────
  // Filtra artículos por scope: globales + específicos del restaurante indicado.
  app.get('/wiki', async (req) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    const rid = restaurantId ? Number(restaurantId) : null

    const categorias = await prisma.wikiCategoria.findMany({
      orderBy: { orden: 'asc' },
      include: {
        articulos: {
          where: {
            activo: true,
            ...(rid !== null
              ? { OR: [{ restaurantId: null }, { restaurantId: rid }] }
              : { restaurantId: null }),
          },
          orderBy: { orden: 'asc' },
        },
      },
    })
    return categorias
  })

  // ── Categorías (admin) ────────────────────────────────────────────────────────

  app.get('/wiki/categorias', async () => {
    return prisma.wikiCategoria.findMany({
      orderBy: { orden: 'asc' },
      include: { _count: { select: { articulos: true } } },
    })
  })

  app.post('/wiki/categorias', async (req, reply) => {
    const result = categoriaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const cat = await prisma.wikiCategoria.create({ data: result.data })
    return reply.status(201).send(cat)
  })

  app.put('/wiki/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = categoriaSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const cat = await prisma.wikiCategoria.update({ where: { id }, data: result.data })
    return cat
  })

  app.delete('/wiki/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    // Borrado en cascada: primero los artículos de la categoría
    await prisma.wikiArticulo.deleteMany({ where: { categoriaId: id } })
    await prisma.wikiCategoria.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Artículos (admin) ─────────────────────────────────────────────────────────
  // Scope como Menú: con restaurantId → globales + específicos; sin él → solo globales.
  app.get('/wiki/articulos', async (req) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    const where = restaurantId
      ? { OR: [{ restaurantId: null }, { restaurantId: Number(restaurantId) }] }
      : { restaurantId: null }
    return prisma.wikiArticulo.findMany({
      where,
      orderBy: [{ categoriaId: 'asc' }, { orden: 'asc' }],
    })
  })

  app.post('/wiki/articulos', async (req, reply) => {
    const result = articuloSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const art = await prisma.wikiArticulo.create({ data: result.data })
    return reply.status(201).send(art)
  })

  app.put('/wiki/articulos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = articuloSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const art = await prisma.wikiArticulo.update({ where: { id }, data: result.data })
    return art
  })

  app.patch('/wiki/articulos/:id/toggle', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const art = await prisma.wikiArticulo.findUnique({ where: { id } })
    return prisma.wikiArticulo.update({ where: { id }, data: { activo: !art?.activo } })
  })

  app.delete('/wiki/articulos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.wikiArticulo.delete({ where: { id } })
    return reply.status(204).send()
  })
}
