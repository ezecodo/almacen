import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// restaurantId null = global, number = específico de restaurante
const catSchema = z.object({
  restaurantId: z.number().int().positive().nullable().optional(),
  grupo:        z.string().default(''),
  nombre:       z.string().min(1),
  icono:        z.string().default(''),
  orden:        z.number().int().default(0),
  parentId:     z.number().int().positive().nullable().optional(),
})

const catUpdateSchema = catSchema.partial().omit({ restaurantId: true })

const itemSchema = z.object({
  restaurantId: z.number().int().positive().nullable().optional(),
  categoria:    z.string().min(1),
  nombre:       z.string().min(1),
  descripcion:  z.string().default(''),
  precio:       z.number().min(0),
  orden:        z.number().int().default(0),
  alergenos:    z.number().int().min(0).default(0),
})

const updateSchema = itemSchema.partial().omit({ restaurantId: true })

export async function menuRoutes(app: FastifyInstance) {

  // ── Categorías ──────────────────────────────────────────────────────────────

  // GET /menu/categorias?restaurantId=1  (omitir param = solo globales)
  app.get('/menu/categorias', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    const rid = restaurantId ? Number(restaurantId) : null

    const where = rid
      ? { OR: [{ restaurantId: null }, { restaurantId: rid }] }
      : { restaurantId: null }

    // En contexto de restaurante: limpiar automáticamente las categorías específicas que
    // duplican una global (mismo nombre). Estos duplicados se generaban antes de la fix.
    if (rid) {
      const [globalCats, restaurantCats] = await Promise.all([
        prisma.menuCategoria.findMany({ where: { restaurantId: null }, select: { nombre: true } }),
        prisma.menuCategoria.findMany({ where: { restaurantId: rid }, select: { id: true, nombre: true } }),
      ])
      const globalNames = new Set(globalCats.map(c => c.nombre))
      const duplicateIds = restaurantCats
        .filter(c => globalNames.has(c.nombre))
        .map(c => c.id)
      if (duplicateIds.length > 0) {
        // Las subcategorías de un duplicado vuelven al nivel superior antes de borrarlo
        await prisma.menuCategoria.updateMany({ where: { parentId: { in: duplicateIds } }, data: { parentId: null } })
        await prisma.menuCategoria.deleteMany({ where: { id: { in: duplicateIds } } })
      }
    }

    const allCats = await prisma.menuCategoria.findMany({
      where,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })

    // Contar items por categoría (globales o del restaurante según contexto)
    const itemWhere = rid
      ? { OR: [{ restaurantId: null }, { restaurantId: rid }] }
      : { restaurantId: null }

    const itemCounts = await prisma.menuItem.groupBy({
      by: ['categoria'],
      where: itemWhere,
      _count: { id: true },
    })
    const countMap: Record<string, number> = {}
    for (const c of itemCounts) countMap[c.categoria] = c._count.id

    return allCats.map(c => ({ ...c, itemCount: countMap[c.nombre] ?? 0 }))
  })

  // POST /menu/categorias
  app.post('/menu/categorias', async (req, reply) => {
    const result = catSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    // Crear directamente como subcategoría: valida el padre y hereda su grupo
    let parentId: number | null = null
    let grupo = result.data.grupo
    if (result.data.parentId) {
      const parent = await prisma.menuCategoria.findUnique({ where: { id: result.data.parentId } })
      if (!parent) return reply.status(404).send({ error: 'Categoría padre no encontrada' })
      if (parent.parentId !== null) return reply.status(400).send({ error: 'Solo se permite un nivel de subcategorías' })
      parentId = parent.id
      grupo = parent.grupo
    }

    const cat = await prisma.menuCategoria.create({ data: {
      restaurantId: result.data.restaurantId ?? null,
      grupo,
      nombre:       result.data.nombre,
      icono:        result.data.icono,
      orden:        result.data.orden,
      parentId,
    }})
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
        // Categoría global: actualizar también los items específicos de restaurante
        // que conviven bajo ella (si no, quedan huérfanos con el nombre viejo).
        // Categoría de restaurante: solo los items de ese scope.
        await prisma.menuItem.updateMany({
          where: {
            categoria: old.nombre,
            ...(old.restaurantId !== null && { restaurantId: old.restaurantId }),
          },
          data: { categoria: result.data.nombre },
        })
      }
    }

    const cat = await prisma.menuCategoria.update({ where: { id }, data: result.data })
    return cat
  })

  // POST /menu/categorias/:id/anidar — mete/saca una categoría como subcategoría de otra
  // body: { parentId: number | null }  (null = sacarla al nivel superior)
  app.post('/menu/categorias/:id/anidar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { parentId } = req.body as { parentId: number | null }
    if (parentId === id) return reply.status(400).send({ error: 'Una categoría no puede contenerse a sí misma' })

    const cat = await prisma.menuCategoria.findUnique({ where: { id }, include: { children: true } })
    if (!cat) return reply.status(404).send({ error: 'Categoría no encontrada' })

    if (parentId === null) {
      return prisma.menuCategoria.update({ where: { id }, data: { parentId: null } })
    }

    const parent = await prisma.menuCategoria.findUnique({ where: { id: parentId } })
    if (!parent) return reply.status(404).send({ error: 'Categoría destino no encontrada' })
    if (parent.parentId !== null) return reply.status(400).send({ error: 'Solo se permite un nivel de subcategorías' })
    if (cat.children.length > 0) return reply.status(400).send({ error: 'Esta categoría tiene subcategorías; sácalas primero' })

    // Hereda el grupo del padre para que el ruteo barra/cocina siga funcionando
    return prisma.menuCategoria.update({ where: { id }, data: { parentId, grupo: parent.grupo } })
  })

  // DELETE /menu/categorias/:id
  app.delete('/menu/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const cat = await prisma.menuCategoria.findUnique({ where: { id } })
    if (!cat) return reply.status(404).send({ error: 'No encontrada' })

    // Las subcategorías vuelven al nivel superior (no se borran en cascada)
    await prisma.menuCategoria.updateMany({ where: { parentId: id }, data: { parentId: null } })
    // Solo eliminar items del mismo scope que la categoría
    await prisma.menuItem.deleteMany({
      where: { restaurantId: cat.restaurantId, categoria: cat.nombre },
    })
    await prisma.menuCategoria.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Items ───────────────────────────────────────────────────────────────────

  // GET /menu?restaurantId=1[&categoria=X]  (omitir param = solo globales)
  app.get('/menu', async (req, reply) => {
    const { restaurantId, categoria } = req.query as { restaurantId?: string; categoria?: string }
    const rid = restaurantId ? Number(restaurantId) : null

    const baseWhere = rid
      ? { OR: [{ restaurantId: null }, { restaurantId: rid }] }
      : { restaurantId: null }

    const items = await prisma.menuItem.findMany({
      where: {
        ...baseWhere,
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
    const item = await prisma.menuItem.create({ data: {
      restaurantId: result.data.restaurantId ?? null,
      categoria:    result.data.categoria,
      nombre:       result.data.nombre,
      descripcion:  result.data.descripcion,
      precio:       result.data.precio,
      orden:        result.data.orden,
      alergenos:    result.data.alergenos,
    }})
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

  // PATCH /menu/:id/mover-restaurante  — mueve un item global a un restaurante específico
  app.patch('/menu/:id/mover-restaurante', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const schema = z.object({ restaurantId: z.number().int().positive() })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const item = await prisma.menuItem.findUnique({ where: { id } })
    if (!item) return reply.status(404).send({ error: 'Item no encontrado' })

    // Solo crear categoría específica si NO existe ninguna global con ese nombre.
    // Si ya hay una global "Cocteles", el item simplemente convive bajo ella.
    const catGlobal = await prisma.menuCategoria.findFirst({
      where: { restaurantId: null, nombre: item.categoria },
    })
    if (!catGlobal) {
      const catEspecifica = await prisma.menuCategoria.findFirst({
        where: { restaurantId: result.data.restaurantId, nombre: item.categoria },
      })
      if (!catEspecifica) {
        await prisma.menuCategoria.create({
          data: { restaurantId: result.data.restaurantId, nombre: item.categoria, icono: '', grupo: '', orden: 0 },
        })
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: { restaurantId: result.data.restaurantId },
    })
    return updated
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
            data: { restaurantId: rid, categoria: item.categoria, nombre: item.nombre,
                    descripcion: item.descripcion, precio: item.precio, orden: item.orden },
          })
          copiados++
        }
      }
      resultados.push({ restaurantId: rid, copiados, omitidos })
    }

    return { resultados }
  })

  // POST /menu/migrar-a-global
  // Convierte todas las categorías e items de un restaurante en globales (restaurantId = null).
  // Si ya existe una categoría/item global con el mismo nombre, fusiona (omite duplicados).
  app.post('/menu/migrar-a-global', async (req, reply) => {
    const schema = z.object({ restaurantId: z.number().int().positive() })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const rid = result.data.restaurantId

    // 1. Migrar ítems: mover a global o eliminar si ya existe globalmente
    const itemsPropios = await prisma.menuItem.findMany({ where: { restaurantId: rid } })
    let itemsMigrados = 0
    let itemsOmitidos = 0

    for (const item of itemsPropios) {
      const globalExiste = await prisma.menuItem.findFirst({
        where: { restaurantId: null, categoria: item.categoria, nombre: item.nombre },
      })
      if (globalExiste) {
        await prisma.menuItem.delete({ where: { id: item.id } })
        itemsOmitidos++
      } else {
        await prisma.menuItem.update({ where: { id: item.id }, data: { restaurantId: null } })
        itemsMigrados++
      }
    }

    // 2. Migrar categorías: mover a global o eliminar si ya existe globalmente
    const catsPropias = await prisma.menuCategoria.findMany({ where: { restaurantId: rid } })
    let categoriasMigradas = 0
    let categoriasOmitidas = 0

    for (const cat of catsPropias) {
      const globalExiste = await prisma.menuCategoria.findFirst({
        where: { restaurantId: null, nombre: cat.nombre },
      })
      if (globalExiste) {
        await prisma.menuCategoria.delete({ where: { id: cat.id } })
        categoriasOmitidas++
      } else {
        await prisma.menuCategoria.update({ where: { id: cat.id }, data: { restaurantId: null } })
        categoriasMigradas++
      }
    }

    return { categoriasMigradas, categoriasOmitidas, itemsMigrados, itemsOmitidos }
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

    const catExiste = await prisma.menuCategoria.findFirst({
      where: { restaurantId: result.data.restaurantId, nombre: result.data.categoria },
    })
    if (!catExiste) {
      const catOrigen = await prisma.menuCategoria.findFirst({
        where: { restaurantId: item.restaurantId, nombre: item.categoria },
      })
      await prisma.menuCategoria.create({
        data: { restaurantId: result.data.restaurantId, nombre: result.data.categoria,
                icono: catOrigen?.icono ?? '', grupo: catOrigen?.grupo ?? '', orden: catOrigen?.orden ?? 0 },
      })
    }

    const nuevo = await prisma.menuItem.create({
      data: { restaurantId: result.data.restaurantId, categoria: result.data.categoria,
              nombre: item.nombre, descripcion: item.descripcion, precio: item.precio, orden: item.orden },
    })
    return reply.status(201).send(nuevo)
  })
}
