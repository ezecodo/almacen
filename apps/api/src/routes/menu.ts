import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// ── Categorías ────────────────────────────────────────────────────────────────

const catSchema = z.object({
  restaurantId: z.number().int().positive(),
  grupo:        z.string().default(''),
  nombre:       z.string().min(1),
  icono:        z.string().default(''),
  orden:        z.number().int().default(0),
})

const catUpdateSchema = catSchema.partial().omit({ restaurantId: true })

// ── Items ─────────────────────────────────────────────────────────────────────

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

  // ── Categorías ──────────────────────────────────────────────────────────────

  // GET /menu/categorias?restaurantId=1
  app.get('/menu/categorias', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const rid = Number(restaurantId)

    // Auto-migrar: crear MenuCategoria para categorías que existen en items pero no están gestionadas
    const [cats, itemCounts] = await Promise.all([
      prisma.menuCategoria.findMany({ where: { restaurantId: rid } }),
      prisma.menuItem.groupBy({
        by: ['categoria'],
        where: { restaurantId: rid },
        _count: { id: true },
      }),
    ])

    const managedNames = new Set(cats.map(c => c.nombre))
    const toCreate = itemCounts
      .map(c => c.categoria)
      .filter(nombre => !managedNames.has(nombre))

    if (toCreate.length > 0) {
      await prisma.menuCategoria.createMany({
        data: toCreate.map((nombre, i) => ({ restaurantId: rid, nombre, icono: '', orden: i })),
        skipDuplicates: true,
      })
    }

    // Volver a cargar con las nuevas
    const allCats = await prisma.menuCategoria.findMany({
      where: { restaurantId: rid },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })

    const countMap: Record<string, number> = {}
    for (const c of itemCounts) countMap[c.categoria] = c._count.id

    return allCats.map(c => ({ ...c, itemCount: countMap[c.nombre] ?? 0 }))
  })

  // POST /menu/categorias
  app.post('/menu/categorias', async (req, reply) => {
    const result = catSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const cat = await prisma.menuCategoria.create({ data: result.data })
    return reply.status(201).send({ ...cat, itemCount: 0 })
  })

  // PUT /menu/categorias/:id
  app.put('/menu/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = catUpdateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    // Si cambia el nombre, actualizar todos los items de esa categoría
    if (result.data.nombre) {
      const old = await prisma.menuCategoria.findUnique({ where: { id } })
      if (old && old.nombre !== result.data.nombre) {
        await prisma.menuItem.updateMany({
          where: { restaurantId: old.restaurantId, categoria: old.nombre },
          data: { categoria: result.data.nombre },
        })
      }
    }

    const cat = await prisma.menuCategoria.update({ where: { id }, data: result.data })
    return cat
  })

  // DELETE /menu/categorias/:id
  app.delete('/menu/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const cat = await prisma.menuCategoria.findUnique({ where: { id } })
    if (!cat) return reply.status(404).send({ error: 'No encontrada' })

    const itemCount = await prisma.menuItem.count({
      where: { restaurantId: cat.restaurantId, categoria: cat.nombre },
    })
    if (itemCount > 0) {
      return reply.status(409).send({ error: `Tiene ${itemCount} items. Elimínalos primero.` })
    }

    await prisma.menuCategoria.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Items ───────────────────────────────────────────────────────────────────

  // GET /menu?restaurantId=1[&categoria=X]
  app.get('/menu', async (req, reply) => {
    const { restaurantId, categoria } = req.query as { restaurantId?: string; categoria?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const items = await prisma.menuItem.findMany({
      where: {
        restaurantId: Number(restaurantId),
        ...(categoria ? { categoria } : {}),
      },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
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

  // PATCH /menu/:id/toggleAutoPorPax
  app.patch('/menu/:id/toggleAutoPorPax', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const current = await prisma.menuItem.findUnique({ where: { id } })
    if (!current) return reply.status(404).send({ error: 'No encontrado' })
    const item = await prisma.menuItem.update({ where: { id }, data: { autoPorPax: !current.autoPorPax } })
    return item
  })

  // DELETE /menu/:id
  app.delete('/menu/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.menuItem.delete({ where: { id } })
    return reply.status(204).send()
  })

  // POST /menu/categorias/:id/copiar
  app.post('/menu/categorias/:id/copiar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const schema = z.object({
      restaurantIds: z.array(z.number().int().positive()),
      incluirItems:  z.boolean().default(true),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const cat = await prisma.menuCategoria.findUnique({ where: { id } })
    if (!cat) return reply.status(404).send({ error: 'Categoría no encontrada' })

    const items = result.data.incluirItems
      ? await prisma.menuItem.findMany({ where: { restaurantId: cat.restaurantId, categoria: cat.nombre } })
      : []

    const resultados = []
    for (const rid of result.data.restaurantIds) {
      // Crear categoría si no existe en el destino
      const catExiste = await prisma.menuCategoria.findFirst({
        where: { restaurantId: rid, nombre: cat.nombre },
      })
      if (!catExiste) {
        await prisma.menuCategoria.create({
          data: { restaurantId: rid, nombre: cat.nombre, icono: cat.icono, grupo: cat.grupo, orden: cat.orden },
        })
      }

      let copiados = 0
      let omitidos = 0
      if (items.length > 0) {
        const existentes = await prisma.menuItem.findMany({
          where: { restaurantId: rid, categoria: cat.nombre },
          select: { nombre: true },
        })
        const nombresExistentes = new Set(existentes.map(i => i.nombre))

        for (const item of items) {
          if (nombresExistentes.has(item.nombre)) { omitidos++; continue }
          await prisma.menuItem.create({
            data: {
              restaurantId: rid,
              categoria:    item.categoria,
              nombre:       item.nombre,
              descripcion:  item.descripcion,
              precio:       item.precio,
              orden:        item.orden,
            },
          })
          copiados++
        }
      }
      resultados.push({ restaurantId: rid, copiados, omitidos })
    }

    return { resultados }
  })

  // POST /menu/items/:id/copiar
  app.post('/menu/items/:id/copiar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      categoria:    z.string().min(1),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const item = await prisma.menuItem.findUnique({ where: { id } })
    if (!item) return reply.status(404).send({ error: 'Item no encontrado' })

    const yaExiste = await prisma.menuItem.findFirst({
      where: { restaurantId: result.data.restaurantId, categoria: result.data.categoria, nombre: item.nombre },
    })
    if (yaExiste) return reply.status(409).send({ error: `Ya existe "${item.nombre}" en esa categoría` })

    // Crear la categoría destino si no existe
    const catExiste = await prisma.menuCategoria.findFirst({
      where: { restaurantId: result.data.restaurantId, nombre: result.data.categoria },
    })
    if (!catExiste) {
      const catOrigen = await prisma.menuCategoria.findFirst({
        where: { restaurantId: item.restaurantId, nombre: item.categoria },
      })
      await prisma.menuCategoria.create({
        data: {
          restaurantId: result.data.restaurantId,
          nombre:       result.data.categoria,
          icono:        catOrigen?.icono ?? '',
          grupo:        catOrigen?.grupo ?? '',
          orden:        catOrigen?.orden ?? 0,
        },
      })
    }

    const nuevo = await prisma.menuItem.create({
      data: {
        restaurantId: result.data.restaurantId,
        categoria:    result.data.categoria,
        nombre:       item.nombre,
        descripcion:  item.descripcion,
        precio:       item.precio,
        orden:        item.orden,
      },
    })
    return reply.status(201).send(nuevo)
  })
}
