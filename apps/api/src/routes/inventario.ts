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

    // Filtrar productos por scope: global + específicos del restaurante (si aplica)
    const productosWhere = rId
      ? { activo: true, OR: [{ restaurantId: null }, { restaurantId: rId }] }
      : { activo: true, restaurantId: null }

    const categorias = await prisma.inventarioCategoria.findMany({
      where,
      orderBy: { orden: 'asc' },
      include: {
        productos: {
          where: productosWhere,
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
    const { nombre, orden, personalProduccion } = req.body as { nombre?: string; orden?: number; personalProduccion?: string | null }

    const categoria = await prisma.inventarioCategoria.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(orden !== undefined && { orden }),
        ...(personalProduccion !== undefined && { personalProduccion: personalProduccion ?? null }),
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
    const { nombre, unidad, stockMinimo, activo, orden, precioCoste, precioVenta } = req.body as {
      nombre?: string
      unidad?: string
      stockMinimo?: number
      activo?: boolean
      orden?: number
      precioCoste?: number | null
      precioVenta?: number | null
    }

    const producto = await prisma.inventarioProducto.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(unidad !== undefined && { unidad }),
        ...(stockMinimo !== undefined && { stockMinimo }),
        ...(activo !== undefined && { activo }),
        ...(orden !== undefined && { orden }),
        ...(precioCoste !== undefined && { precioCoste }),
        ...(precioVenta !== undefined && { precioVenta }),
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

  // ── Producciones ─────────────────────────────────────────────────────────────

  // GET /inventario/producciones?restaurantId=X
  app.get('/inventario/producciones', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const producciones = await prisma.inventarioProduccion.findMany({
      where: { restaurantId: Number(restaurantId) },
      orderBy: { fecha: 'desc' },
      include: { producto: { select: { nombre: true, unidad: true } } },
    })
    return producciones
  })

  // POST /inventario/producciones
  app.post('/inventario/producciones', async (req, reply) => {
    const { restaurantId, productoId, cantidad, unidad, creadoPor, notas, fecha } = req.body as {
      restaurantId: number
      productoId: number
      cantidad: number
      unidad: string
      creadoPor?: string
      notas?: string
      fecha?: string
    }
    if (!restaurantId || !productoId || !cantidad || !unidad) {
      return reply.status(400).send({ error: 'restaurantId, productoId, cantidad y unidad son requeridos' })
    }

    const produccion = await prisma.inventarioProduccion.create({
      data: {
        restaurantId,
        productoId,
        cantidad,
        unidad,
        creadoPor: creadoPor ?? null,
        notas: notas ?? null,
        fecha: fecha ? new Date(fecha) : new Date(),
      },
      include: { producto: { select: { nombre: true, unidad: true } } },
    })
    return reply.status(201).send(produccion)
  })

  // DELETE /inventario/producciones/:id
  app.delete('/inventario/producciones/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.inventarioProduccion.delete({ where: { id } })
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
        precioCoste:    item.producto.precioCoste,
        precioVenta:    item.producto.precioVenta,
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

  // GET /inventario/costes?baseId=X&finalId=Y
  // Compara dos conteos y calcula consumo real + coste por producto
  app.get('/inventario/costes', async (req, reply) => {
    const { baseId, finalId } = req.query as { baseId?: string; finalId?: string }
    if (!baseId || !finalId) return reply.status(400).send({ error: 'baseId y finalId requeridos' })

    const [base, final] = await Promise.all([
      prisma.inventarioConteo.findUnique({
        where: { id: Number(baseId) },
        include: { items: { include: { producto: { include: { categoria: true } } } } },
      }),
      prisma.inventarioConteo.findUnique({
        where: { id: Number(finalId) },
        include: { items: { include: { producto: { include: { categoria: true } } } } },
      }),
    ])

    if (!base || !final) return reply.status(404).send({ error: 'Conteo no encontrado' })

    // Unión de todos los productos entre ambos conteos
    const baseMap  = new Map(base.items.map(i  => [i.productoId, i]))
    const finalMap = new Map(final.items.map(i => [i.productoId, i]))
    const allIds   = new Set([...baseMap.keys(), ...finalMap.keys()])

    const rows = [...allIds].map(pid => {
      const bItem = baseMap.get(pid)
      const fItem = finalMap.get(pid)
      const prod  = (bItem ?? fItem)!.producto
      const cantBase  = bItem?.cantidad ?? 0
      const cantFinal = fItem?.cantidad ?? 0
      const consumido = cantBase - cantFinal          // positivo = se consumió
      const precio    = prod.precioCoste ?? null
      const coste     = precio !== null ? consumido * precio : null
      return {
        productoId:    prod.id,
        nombre:        prod.nombre,
        unidad:        prod.unidad,
        categoriaNombre: prod.categoria.nombre,
        precioCoste:    precio,
        precioVenta:    prod.precioVenta ?? null,
        cantBase,
        cantFinal,
        consumido,
        coste,
      }
    })

    rows.sort((a, b) => {
      const cc = a.categoriaNombre.localeCompare(b.categoriaNombre)
      return cc !== 0 ? cc : a.nombre.localeCompare(b.nombre)
    })

    const totalCoste = rows.reduce((s, r) => s + (r.coste ?? 0), 0)
    const sinPrecio  = rows.filter(r => r.precioCoste === null && r.consumido > 0).length

    return { rows, totalCoste, sinPrecio, baseFecha: base.fecha, finalFecha: final.fecha }
  })
}
