import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { requireAdmin } from '../auth'

// Escandallos: coste de materia prima de cada plato a partir de su receta.
// Los ingredientes son productos del catálogo de Inventario (global o del restaurante).
// Todo el módulo exige sesión de admin: los costes son información sensible.

type Producto = { unidad: string; precioCoste: number | null; unidadBase: string | null; contenido: number | null; mermaPct: number }

// En qué se mide el producto dentro de una receta y cuántas de esas unidades trae la unidad de compra
function base(p: Pick<Producto, 'unidad' | 'unidadBase' | 'contenido'>): { unidadBase: string; contenido: number } {
  const porDefecto: Record<string, { unidadBase: string; contenido: number }> = {
    kg: { unidadBase: 'g', contenido: 1000 },
    l: { unidadBase: 'ml', contenido: 1000 },
    botella: { unidadBase: 'ml', contenido: 750 },
    caja: { unidadBase: 'ud', contenido: 1 },
    ud: { unidadBase: 'ud', contenido: 1 },
  }
  const d = porDefecto[p.unidad] ?? porDefecto.ud
  return { unidadBase: p.unidadBase ?? d.unidadBase, contenido: p.contenido && p.contenido > 0 ? p.contenido : d.contenido }
}

// € por unidad base ya aprovechable (la merma encarece lo que queda). null = sin precio de coste
function costeUnitario(p: Producto): number | null {
  if (p.precioCoste === null || p.precioCoste === undefined) return null
  const aprovechable = 1 - Math.min(95, Math.max(0, p.mermaPct)) / 100
  return p.precioCoste / base(p).contenido / aprovechable
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000

type Estado = 'verde' | 'ambar' | 'rojo' | 'sin_receta' | 'incompleta'

async function config() {
  const c = (await prisma.empresaConfig.findFirst()) ?? (await prisma.empresaConfig.create({ data: {} }))
  return { tasaIva: c.tasaIva, verde: c.foodCostVerde, ambar: c.foodCostAmbar }
}

function serializarProducto<T extends Producto & { id: number; nombre: string; restaurantId: number | null }>(p: T) {
  const b = base(p)
  const cu = costeUnitario(p)
  return {
    id: p.id, nombre: p.nombre, restaurantId: p.restaurantId, unidad: p.unidad, precioCoste: p.precioCoste,
    unidadBase: b.unidadBase, contenido: b.contenido, mermaPct: p.mermaPct,
    costeUnitario: cu === null ? null : r4(cu),
  }
}

const ingredienteSchema = z.object({
  nombre:      z.string().trim().min(1),
  unidad:      z.enum(['kg', 'l', 'ud', 'botella', 'caja']),
  precioCoste: z.number().min(0).nullable(),
  unidadBase:  z.enum(['g', 'ml', 'ud']).nullable().optional(),
  contenido:   z.number().positive().nullable().optional(),
  mermaPct:    z.number().min(0).max(95).default(0),
})

const recetaSchema = z.object({
  raciones: z.number().positive().default(1),
  lineas:   z.array(z.object({ productoId: z.number().int().positive(), cantidad: z.number().positive() })),
})

export async function escandalloRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin)

  // Matriz: todos los platos activos del restaurante con su coste, food cost y margen
  app.get('/admin/escandallos', async (req, reply) => {
    const rid = Number((req.query as { restaurantId?: string }).restaurantId)
    if (!rid) return reply.status(400).send({ error: 'restaurantId requerido' })
    const cfg = await config()

    const [items, cats] = await Promise.all([
      prisma.menuItem.findMany({
        where: { activo: true, precio: { gt: 0 }, OR: [{ restaurantId: null }, { restaurantId: rid }] },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        include: { receta: { include: { lineas: { include: { producto: true } } } } },
      }),
      prisma.menuCategoria.findMany({ where: { OR: [{ restaurantId: null }, { restaurantId: rid }] } }),
    ])
    const catPorNombre = new Map(cats.map(c => [c.nombre, c]))
    const catPorId = new Map(cats.map(c => [c.id, c]))
    // Orden de la carta: una subcategoría va detrás de su categoría padre
    const ordenCat = (c: (typeof cats)[number] | undefined) => {
      if (!c) return Number.MAX_SAFE_INTEGER
      const padre = c.parentId ? catPorId.get(c.parentId) : undefined
      return padre ? padre.orden * 1000 + 1 + c.orden : c.orden * 1000
    }

    const platos = items.map(item => {
      const cat = catPorNombre.get(item.categoria)
      const precioSinIva = item.precio / (1 + cfg.tasaIva / 100)
      const lineas = item.receta?.lineas ?? []
      let coste: number | null = null
      let sinPrecio = 0
      if (item.receta && lineas.length > 0) {
        coste = 0
        for (const l of lineas) {
          const cu = costeUnitario(l.producto)
          if (cu === null) sinPrecio++
          else coste += cu * l.cantidad
        }
        coste = coste / item.receta.raciones
      }
      const foodCost = coste === null ? null : (coste / precioSinIva) * 100
      const estado: Estado =
        coste === null || foodCost === null ? 'sin_receta'
          : sinPrecio > 0 ? 'incompleta'
          : foodCost <= cfg.verde ? 'verde'
          : foodCost <= cfg.ambar ? 'ambar'
          : 'rojo'
      return {
        id: item.id, nombre: item.nombre, categoria: item.categoria, categoriaOrden: ordenCat(cat), grupo: cat?.grupo ?? '', restaurantId: item.restaurantId,
        precio: item.precio, precioSinIva: r2(precioSinIva),
        coste: coste === null ? null : r2(coste),
        foodCost: foodCost === null ? null : Math.round(foodCost * 10) / 10,
        margen: coste === null ? null : r2(precioSinIva - coste),
        ingredientes: lineas.length, sinPrecio, estado,
      }
    })
    return { ...cfg, platos }
  })

  // Umbrales del semáforo (comunes a todo el grupo)
  app.put('/admin/escandallos/umbrales', async (req, reply) => {
    const result = z.object({ verde: z.number().min(1).max(100), ambar: z.number().min(1).max(100) }).safeParse(req.body)
    if (!result.success || result.data.ambar < result.data.verde) return reply.status(400).send({ error: 'El umbral ámbar debe ser mayor o igual que el verde' })
    const actual = (await prisma.empresaConfig.findFirst()) ?? (await prisma.empresaConfig.create({ data: {} }))
    await prisma.empresaConfig.update({ where: { id: actual.id }, data: { foodCostVerde: result.data.verde, foodCostAmbar: result.data.ambar } })
    return config()
  })

  // Ingredientes disponibles para un restaurante (catálogo de Inventario: globales + suyos)
  app.get('/admin/escandallos/ingredientes', async (req) => {
    const rid = Number((req.query as { restaurantId?: string }).restaurantId) || null
    const productos = await prisma.inventarioProducto.findMany({
      where: { activo: true, ...(rid ? { OR: [{ restaurantId: null }, { restaurantId: rid }] } : { restaurantId: null }) },
      orderBy: { nombre: 'asc' },
    })
    return productos.map(serializarProducto)
  })

  // Alta rápida de ingrediente desde el editor de recetas → categoría global "Materia prima"
  app.post('/admin/escandallos/ingredientes', async (req, reply) => {
    const result = ingredienteSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const repetido = await prisma.inventarioProducto.findFirst({ where: { restaurantId: null, activo: true, nombre: { equals: result.data.nombre, mode: 'insensitive' } } })
    if (repetido) return reply.status(409).send({ error: `Ya existe el ingrediente "${repetido.nombre}"` })
    const categoria =
      (await prisma.inventarioCategoria.findFirst({ where: { nombre: 'Materia prima', restaurantId: null } })) ??
      (await prisma.inventarioCategoria.create({ data: { nombre: 'Materia prima', orden: 99 } }))
    const producto = await prisma.inventarioProducto.create({ data: { ...result.data, categoriaId: categoria.id } })
    return reply.status(201).send(serializarProducto(producto))
  })

  // Editar precio de coste / contenido / merma de un ingrediente
  app.patch('/admin/escandallos/ingredientes/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = ingredienteSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const producto = await prisma.inventarioProducto.update({ where: { id }, data: result.data })
    return serializarProducto(producto)
  })

  // Detalle de un plato: su receta con el coste de cada línea
  app.get('/admin/escandallos/:menuItemId', async (req, reply) => {
    const menuItemId = Number((req.params as { menuItemId: string }).menuItemId)
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: { receta: { include: { lineas: { include: { producto: true }, orderBy: { orden: 'asc' } } } } },
    })
    if (!item) return reply.status(404).send({ error: 'Plato no encontrado' })
    const cfg = await config()
    return {
      ...cfg,
      id: item.id, nombre: item.nombre, categoria: item.categoria, precio: item.precio,
      precioSinIva: r2(item.precio / (1 + cfg.tasaIva / 100)),
      raciones: item.receta?.raciones ?? 1,
      lineas: (item.receta?.lineas ?? []).map(l => ({ productoId: l.productoId, cantidad: l.cantidad, producto: serializarProducto(l.producto) })),
    }
  })

  // Guardar la receta completa (reemplaza las líneas). Sin líneas = el plato vuelve a "sin escandallo"
  app.put('/admin/escandallos/:menuItemId', async (req, reply) => {
    const menuItemId = Number((req.params as { menuItemId: string }).menuItemId)
    const result = recetaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } })
    if (!item) return reply.status(404).send({ error: 'Plato no encontrado' })

    await prisma.$transaction(async tx => {
      if (result.data.lineas.length === 0) {
        await tx.receta.deleteMany({ where: { menuItemId } })
        return
      }
      const receta = await tx.receta.upsert({
        where: { menuItemId },
        create: { menuItemId, raciones: result.data.raciones },
        update: { raciones: result.data.raciones },
      })
      await tx.recetaLinea.deleteMany({ where: { recetaId: receta.id } })
      await tx.recetaLinea.createMany({
        data: result.data.lineas.map((l, orden) => ({ recetaId: receta.id, productoId: l.productoId, cantidad: l.cantidad, orden })),
      })
    })
    return reply.status(204).send()
  })
}
