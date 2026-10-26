import { FastifyInstance } from 'fastify'
import { prisma } from '../server'
import { refrescarElaboraciones } from '../costes'

// ── Compras: proveedor y formato de compra de un producto ──────────────────────

// 'receta' = elaboración: el precio sale de sus ingredientes (src/costes.ts), no se escribe a mano
export const ORIGENES_PRECIO = ['pedido', 'chef', 'referencia', 'estimado', 'receta'] as const

type DatosCompra = {
  proveedorId?: number | null
  formatoCompra?: string | null
  unidadesPorFormato?: number
  precioOrigen?: string | null
}

// Solo los campos que vinieron en el body (así un PATCH parcial no los pisa)
function datosCompra(body: DatosCompra): { data: DatosCompra } | { error: string } {
  const data: DatosCompra = {}
  if (body.proveedorId !== undefined) data.proveedorId = body.proveedorId || null
  if (body.formatoCompra !== undefined) data.formatoCompra = body.formatoCompra?.trim().slice(0, 40) || null
  if (body.unidadesPorFormato !== undefined) {
    const n = Number(body.unidadesPorFormato)
    if (!Number.isFinite(n) || n <= 0 || n > 100000) return { error: 'Unidades por formato inválidas' }
    data.unidadesPorFormato = n
  }
  if (body.precioOrigen !== undefined) {
    if (body.precioOrigen !== null && !ORIGENES_PRECIO.includes(body.precioOrigen as typeof ORIGENES_PRECIO[number])) {
      return { error: 'Origen del precio inválido' }
    }
    data.precioOrigen = body.precioOrigen
  }
  // Suelto = una unidad por "formato"
  if (data.formatoCompra === null) data.unidadesPorFormato = 1
  return { data }
}

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
          include: { proveedor: { select: { id: true, nombre: true } } },
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
    const { nombre, categoriaId, unidad, stockMinimo, restaurantId, precioCoste, precioVenta } = req.body as {
      nombre: string
      categoriaId: number
      unidad: string
      stockMinimo: number
      restaurantId?: number
      precioCoste?: number | null
      precioVenta?: number | null
    } & DatosCompra

    if (!nombre || !categoriaId) {
      return reply.status(400).send({ error: 'nombre y categoriaId son requeridos' })
    }
    const compra = datosCompra(req.body as DatosCompra)
    if ('error' in compra) return reply.status(400).send({ error: compra.error })

    const producto = await prisma.inventarioProducto.create({
      data: {
        nombre,
        categoriaId,
        unidad: unidad ?? 'ud',
        stockMinimo: stockMinimo ?? 0,
        restaurantId: restaurantId ?? null,
        precioCoste: precioCoste ?? null,
        precioVenta: precioVenta ?? null,
        ...compra.data,
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
    const compra = datosCompra(req.body as DatosCompra)
    if ('error' in compra) return reply.status(400).send({ error: compra.error })

    const producto = await prisma.inventarioProducto.update({
      where: { id },
      data: {
        ...compra.data,
        ...(nombre !== undefined && { nombre }),
        ...(unidad !== undefined && { unidad }),
        ...(stockMinimo !== undefined && { stockMinimo }),
        ...(activo !== undefined && { activo }),
        ...(orden !== undefined && { orden }),
        ...(precioCoste !== undefined && { precioCoste }),
        ...(precioVenta !== undefined && { precioVenta }),
      },
    })
    // Lo que lleve este producto dentro cambia de coste
    if (precioCoste !== undefined || unidad !== undefined) await refrescarElaboraciones()

    return producto
  })

  // DELETE /inventario/productos/:id
  app.delete('/inventario/productos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    // Soft delete — mark as inactive rather than hard delete if it has conteo items
    // o si es ingrediente de alguna receta (borrarlo abarataría el plato en silencio)
    const itemCount = (await prisma.inventarioConteoItem.count({ where: { productoId: id } }))
      + (await prisma.recetaLinea.count({ where: { productoId: id } }))
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

  // ── Traer de la carta ──────────────────────────────────────────────────────────
  // Crea productos de inventario a partir de una categoría del menú (y sus subcategorías):
  // una categoría de inventario por cada una que tenga platos, un producto por plato,
  // enlazado al plato. Lo que ya existe (mismo plato o mismo nombre) se salta.
  // Sin `confirmar` solo devuelve qué haría. `soloIds` = platos marcados en la vista previa
  // (la carta vende porciones: CAÑA y PINTA salen del mismo barril, y no todo es un producto).
  app.post('/inventario/desde-carta', async (req, reply) => {
    const { menuCategoriaId, confirmar, soloIds } = req.body as { menuCategoriaId?: number; confirmar?: boolean; soloIds?: number[] }
    const cat = menuCategoriaId
      ? await prisma.menuCategoria.findUnique({ where: { id: Number(menuCategoriaId) } })
      : null
    if (!cat) return reply.status(404).send({ error: 'Categoría del menú no encontrada' })

    const subcats = await prisma.menuCategoria.findMany({ where: { parentId: cat.id }, orderBy: { orden: 'asc' } })
    const esBotella = (nombre: string) => /vino|cava|champ|botella|espum/i.test(nombre)

    const grupos: { categoria: string; crear: { id: number; nombre: string }[]; yaEstan: string[] }[] = []
    let creados = 0

    for (const c of [cat, ...subcats]) {
      const items = await prisma.menuItem.findMany({
        where: { categoria: c.nombre, activo: true, autoPorPax: false },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      })
      if (items.length === 0) continue

      const existentes = await prisma.inventarioProducto.findMany({
        where: {
          activo: true,
          OR: [
            { menuItemId: { in: items.map(i => i.id) } },
            ...items.map(i => ({ nombre: { equals: i.nombre, mode: 'insensitive' as const }, restaurantId: i.restaurantId })),
          ],
        },
      })
      const yaEsta = (i: typeof items[number]) => existentes.find(p =>
        p.menuItemId === i.id || (p.restaurantId === i.restaurantId && p.nombre.toLowerCase() === i.nombre.toLowerCase()))

      const sinCrear = items.filter(i => !yaEsta(i))
      grupos.push({ categoria: c.nombre, crear: sinCrear.map(i => ({ id: i.id, nombre: i.nombre })), yaEstan: items.filter(i => yaEsta(i)).map(i => i.nombre) })
      const nuevos = soloIds ? sinCrear.filter(i => soloIds.includes(i.id)) : sinCrear
      if (!confirmar) continue

      // Enlazar al plato los que ya existían con el mismo nombre
      for (const i of items) {
        const p = yaEsta(i)
        if (p && p.menuItemId === null) await prisma.inventarioProducto.update({ where: { id: p.id }, data: { menuItemId: i.id } })
      }
      if (nuevos.length === 0) continue

      const invCat = await prisma.inventarioCategoria.findFirst({
        where: { restaurantId: null, nombre: { equals: c.nombre, mode: 'insensitive' } },
      }) ?? await prisma.inventarioCategoria.create({
        data: { nombre: c.nombre, orden: await prisma.inventarioCategoria.count() },
      })
      const botella = esBotella(c.nombre) || esBotella(cat.nombre)
      const res = await prisma.inventarioProducto.createMany({
        data: nuevos.map((i, n) => ({
          nombre: i.nombre,
          categoriaId: invCat.id,
          restaurantId: i.restaurantId,
          unidad: botella || i.combinable ? 'botella' : 'ud',
          menuItemId: i.id,
          orden: n,
        })),
      })
      creados += res.count
    }

    return { grupos, creados }
  })
}
