import { FastifyInstance } from 'fastify'
import { prisma } from '../server'

export async function inventarioRoutes(app: FastifyInstance) {

  // ── Categorías ───────────────────────────────────────────────────────────────

  // GET /inventario/categorias?restaurantId=X
  app.get('/inventario/categorias', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    const rId = restaurantId ? Number(restaurantId) : undefined

    const where = rId
      ? { OR: [{ restaurantId: null }, { restaurantId: rId }] }
      : { restaurantId: null }

    const categorias = await prisma.inventarioCategoria.findMany({
      where,
      orderBy: { orden: 'asc' },
      include: {
        productos: {
          where: { activo: true },
          orderBy: { orden: 'asc' },
        },
      },
    })

    return categorias
  })

  // POST /inventario/categorias
  app.post('/inventario/categorias', async (req, reply) => {
    const { nombre, restaurantId } = req.body as { nombre: string; restaurantId?: number }
    if (!nombre) return reply.status(400).send({ error: 'nombre requerido' })

    const categoria = await prisma.inventarioCategoria.create({
      data: {
        nombre,
        restaurantId: restaurantId ?? null,
      },
      include: { productos: true },
    })

    return reply.status(201).send(categoria)
  })

  // PATCH /inventario/categorias/:id
  app.patch('/inventario/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { nombre, orden } = req.body as { nombre?: string; orden?: number }

    const categoria = await prisma.inventarioCategoria.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(orden !== undefined && { orden }),
      },
      include: { productos: true },
    })

    return categoria
  })

  // DELETE /inventario/categorias/:id
  app.delete('/inventario/categorias/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const activeCount = await prisma.inventarioProducto.count({
      where: { categoriaId: id, activo: true },
    })

    if (activeCount > 0) {
      return reply.status(400).send({ error: 'La categoría tiene productos activos' })
    }

    await prisma.inventarioCategoria.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Productos ────────────────────────────────────────────────────────────────

  // POST /inventario/productos
  app.post('/inventario/productos', async (req, reply) => {
    const { nombre, categoriaId, unidad, stockMinimo, restaurantId } = req.body as {
      nombre: string
      categoriaId: number
      unidad: string
      stockMinimo: number
      restaurantId?: number
    }

    if (!nombre || !categoriaId) {
      return reply.status(400).send({ error: 'nombre y categoriaId son requeridos' })
    }

    const producto = await prisma.inventarioProducto.create({
      data: {
        nombre,
        categoriaId,
        unidad: unidad ?? 'ud',
        stockMinimo: stockMinimo ?? 0,
        restaurantId: restaurantId ?? null,
      },
    })

    return reply.status(201).send(producto)
  })

  // PATCH /inventario/productos/:id
  app.patch('/inventario/productos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { nombre, unidad, stockMinimo, activo, orden } = req.body as {
      nombre?: string
      unidad?: string
      stockMinimo?: number
      activo?: boolean
      orden?: number
    }

    const producto = await prisma.inventarioProducto.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(unidad !== undefined && { unidad }),
        ...(stockMinimo !== undefined && { stockMinimo }),
        ...(activo !== undefined && { activo }),
        ...(orden !== undefined && { orden }),
      },
    })

    return producto
  })

  // DELETE /inventario/productos/:id
  app.delete('/inventario/productos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    // Soft delete — mark as inactive rather than hard delete if it has conteo items
    const itemCount = await prisma.inventarioConteoItem.count({ where: { productoId: id } })
    if (itemCount > 0) {
      await prisma.inventarioProducto.update({ where: { id }, data: { activo: false } })
    } else {
      await prisma.inventarioProducto.delete({ where: { id } })
    }

    return reply.status(204).send()
  })

  // ── Conteos ──────────────────────────────────────────────────────────────────

  // GET /inventario/conteos?restaurantId=X
  app.get('/inventario/conteos', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const conteos = await prisma.inventarioConteo.findMany({
      where: { restaurantId: Number(restaurantId) },
      orderBy: { fecha: 'desc' },
      include: {
        _count: { select: { items: true } },
      },
    })

    return conteos
  })

  // POST /inventario/conteos
  app.post('/inventario/conteos', async (req, reply) => {
    const { restaurantId, creadoPor, items } = req.body as {
      restaurantId: number
      creadoPor?: string
      items: { productoId: number; cantidad: number }[]
    }

    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    if (!items || items.length === 0) return reply.status(400).send({ error: 'items requerido' })

    const conteo = await prisma.inventarioConteo.create({
      data: {
        restaurantId,
        creadoPor: creadoPor ?? null,
        cerrado: true,
        items: {
          create: items.map(i => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
          })),
        },
      },
    })

    return reply.status(201).send(conteo)
  })

  // GET /inventario/conteos/:id
  app.get('/inventario/conteos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const conteo = await prisma.inventarioConteo.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            producto: {
              include: { categoria: true },
            },
          },
        },
      },
    })

    if (!conteo) return reply.status(404).send({ error: 'Conteo no encontrado' })

    // Find the previous conteo for this restaurant (the one right before this one by fecha)
    const prevConteo = await prisma.inventarioConteo.findFirst({
      where: {
        restaurantId: conteo.restaurantId,
        fecha: { lt: conteo.fecha },
        id: { not: id },
      },
      orderBy: { fecha: 'desc' },
      include: {
        items: true,
      },
    })

    // Build a map of previous quantities by productoId
    const prevMap = new Map<number, number>()
    if (prevConteo) {
      for (const item of prevConteo.items) {
        prevMap.set(item.productoId, item.cantidad)
      }
    }

    // Build response items
    const items = conteo.items.map(item => {
      const anterior = prevMap.has(item.productoId) ? prevMap.get(item.productoId)! : null
      const diferencia = anterior !== null ? item.cantidad - anterior : null

      return {
        productoId: item.productoId,
        nombre: item.producto.nombre,
        unidad: item.producto.unidad,
        stockMinimo: item.producto.stockMinimo,
        categoriaId: item.producto.categoriaId,
        categoriaNombre: item.producto.categoria.nombre,
        cantidad: item.cantidad,
        anterior,
        diferencia,
      }
    })

    // Sort: by category name then product name
    items.sort((a, b) => {
      const catCmp = a.categoriaNombre.localeCompare(b.categoriaNombre)
      if (catCmp !== 0) return catCmp
      return a.nombre.localeCompare(b.nombre)
    })

    return {
      conteo: {
        id: conteo.id,
        restaurantId: conteo.restaurantId,
        fecha: conteo.fecha,
        creadoPor: conteo.creadoPor,
        notas: conteo.notas,
        cerrado: conteo.cerrado,
        createdAt: conteo.createdAt,
      },
      items,
    }
  })

  // DELETE /inventario/conteos/:id
  app.delete('/inventario/conteos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    await prisma.inventarioConteo.delete({ where: { id } })
    return reply.status(204).send()
  })
}
