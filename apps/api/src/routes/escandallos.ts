import { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { prisma } from '../server'
import { requireAdmin } from '../auth'
import { alcanza, base, cargarCostes, Producto, refrescarElaboraciones } from '../costes'

// Escandallos: coste de materia prima de cada plato a partir de su receta.
// Los ingredientes son productos del catálogo de Inventario (global o del restaurante).
// Todo el módulo exige sesión de admin: los costes son información sensible.
// Elaboraciones (sub-recetas): salsas, fondos, premixes… productos del inventario con receta propia
// por tanda; su coste sale de sus ingredientes (src/costes.ts) y se usan como un ingrediente más.
// Ficha técnica: la receta va por partes (PULPO, CREMA DE MAÍZ…), cada una con sus ingredientes y sus
// pasos, más emplatado, notas y foto. Es lo que lee e imprime la cocina; el coste sale de las mismas líneas.

const FOTOS_DIR = process.env.RECETAS_DIR || path.join(__dirname, '..', '..', 'uploads', 'recetas')
const MAX_BYTES_FOTO = 1_000_000
type TipoFicha = 'plato' | 'elab'
export const archivoFoto = (tipo: TipoFicha, id: number) => path.join(FOTOS_DIR, `${tipo}-${id}.jpg`)

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000

type Estado = 'verde' | 'ambar' | 'rojo' | 'sin_receta' | 'incompleta'

async function config() {
  const c = (await prisma.empresaConfig.findFirst()) ?? (await prisma.empresaConfig.create({ data: {} }))
  return { tasaIva: c.tasaIva, verde: c.foodCostVerde, ambar: c.foodCostAmbar }
}

function serializarProducto<T extends Producto & { id: number; nombre: string; restaurantId: number | null }>(p: T, costeUnitario: number | null, elaboracion: boolean) {
  const b = base(p)
  return {
    id: p.id, nombre: p.nombre, restaurantId: p.restaurantId, unidad: p.unidad, precioCoste: p.precioCoste,
    unidadBase: b.unidadBase, contenido: b.contenido, mermaPct: p.mermaPct,
    costeUnitario: costeUnitario === null ? null : r4(costeUnitario),
    elaboracion,
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

const lineaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad:   z.number().min(0),                                // 0 = sin cantidad (c/s)
  texto:      z.string().trim().max(40).nullable().optional(),  // "c/s", "6 granos"
})
const fichaSchema = z.object({
  partes: z.array(z.object({
    nombre: z.string().trim().max(80).default(''),
    pasos:  z.array(z.string().trim().min(1).max(1000)).max(40).default([]),
    lineas: z.array(lineaSchema).max(60),
  })).max(15),
  emplatado: z.string().trim().max(3000).default(''),
  notas:     z.string().trim().max(3000).default(''),
})
type Ficha = z.infer<typeof fichaSchema>
const recetaSchema = fichaSchema.extend({ raciones: z.number().positive().default(1) })
const lineasDe = (f: Ficha) => f.partes.flatMap(p => p.lineas)

// Reemplaza la ficha entera (partes, pasos y líneas). Una ficha sin nada (ni ingredientes, ni pasos,
// ni emplatado, ni foto) se borra: el plato vuelve a "sin escandallo".
async function guardarFicha(donde: { menuItemId: number } | { productoId: number }, f: Ficha, extra: { raciones?: number; rendimiento?: number | null }) {
  const vacia = lineasDe(f).length === 0 && f.partes.every(p => p.pasos.length === 0) && !f.emplatado && !f.notas
  await prisma.$transaction(async tx => {
    const actual = await tx.receta.findUnique({ where: donde })
    if (vacia && !actual?.fotoAt) {
      if (actual) await tx.receta.delete({ where: { id: actual.id } })
      return
    }
    const datos = { ...extra, emplatado: f.emplatado, notas: f.notas }
    const receta = actual
      ? await tx.receta.update({ where: { id: actual.id }, data: datos })
      : await tx.receta.create({ data: { ...donde, ...datos } })
    await tx.recetaLinea.deleteMany({ where: { recetaId: receta.id } })
    await tx.recetaParte.deleteMany({ where: { recetaId: receta.id } })
    let orden = 0
    for (const [k, p] of f.partes.entries()) {
      const parte = await tx.recetaParte.create({ data: { recetaId: receta.id, nombre: p.nombre, pasos: p.pasos, orden: k } })
      await tx.recetaLinea.createMany({
        data: p.lineas.map(l => ({ recetaId: receta.id, parteId: parte.id, productoId: l.productoId, cantidad: l.cantidad, texto: l.texto || null, orden: orden++ })),
      })
    }
  })
}

const conFicha = {
  include: {
    lineas: { include: { producto: true }, orderBy: { orden: 'asc' as const } },
    partes: { orderBy: { orden: 'asc' as const } },
  },
}
type RecetaConFicha = Prisma.RecetaGetPayload<typeof conFicha>

// La ficha tal como la edita y la lee la cocina. Las líneas de antes de las partes van en una primera
// parte sin nombre.
function serializarFicha(r: RecetaConFicha | null, costes: Awaited<ReturnType<typeof cargarCostes>>) {
  const linea = (l: RecetaConFicha['lineas'][number]) => ({
    productoId: l.productoId, cantidad: l.cantidad, texto: l.texto,
    producto: serializarProducto(l.producto, costes.coste(l.productoId), costes.esElaboracion(l.productoId)),
  })
  const sueltas = (r?.lineas ?? []).filter(l => l.parteId === null)
  const partes = [
    ...(sueltas.length ? [{ nombre: '', pasos: [] as string[], lineas: sueltas.map(linea) }] : []),
    ...(r?.partes ?? []).map(p => ({
      nombre: p.nombre,
      pasos: Array.isArray(p.pasos) ? (p.pasos as string[]) : [],
      lineas: r!.lineas.filter(l => l.parteId === p.id).map(linea),
    })),
  ]
  return { partes, emplatado: r?.emplatado ?? '', notas: r?.notas ?? '', fotoAt: r?.fotoAt ?? null }
}
const elaboracionSchema = z.object({
  nombre:     z.string().trim().min(1).max(120),
  unidad:     z.enum(['kg', 'l', 'ud']),
  produccion: z.enum(['cocina', 'sala']).default('cocina'),
})

// Categoría global donde caen las elaboraciones nuevas: la de producción de cocina o de sala que
// ya exista (Inventario → ⚗️), o una nueva "Elaboraciones" / "Premixes"
async function categoriaProduccion(produccion: 'cocina' | 'sala') {
  // Nunca las de la demo (prisma/escandallos-demo.ts): su --borrar se llevaría lo creado a mano
  return (await prisma.inventarioCategoria.findFirst({ where: { restaurantId: null, personalProduccion: produccion, NOT: { nombre: { endsWith: '(demo)' } } }, orderBy: { orden: 'asc' } }))
    ?? prisma.inventarioCategoria.create({ data: { nombre: produccion === 'cocina' ? 'Elaboraciones' : 'Premixes', personalProduccion: produccion, orden: 98 } })
}

export async function escandalloRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin)
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: MAX_BYTES_FOTO }, (_req, body, done) => done(null, body))

  // Matriz: todos los platos activos del restaurante con su coste, food cost y margen
  app.get('/admin/escandallos', async (req, reply) => {
    const rid = Number((req.query as { restaurantId?: string }).restaurantId)
    if (!rid) return reply.status(400).send({ error: 'restaurantId requerido' })
    const cfg = await config()

    const [items, cats] = await Promise.all([
      prisma.menuItem.findMany({
        where: { activo: true, precio: { gt: 0 }, OR: [{ restaurantId: null }, { restaurantId: rid }] },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        include: { receta: { include: { lineas: true } } },
      }),
      prisma.menuCategoria.findMany({ where: { OR: [{ restaurantId: null }, { restaurantId: rid }] } }),
    ])
    const costes = await cargarCostes()
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
          if (l.cantidad <= 0) continue // c/s: sin cantidad no cuesta
          const cu = costes.coste(l.productoId)
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
    const costes = await cargarCostes()
    return productos.map(p => serializarProducto(p, costes.coste(p.id), costes.esElaboracion(p.id)))
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
    const costes = await cargarCostes()
    return reply.status(201).send(serializarProducto(producto, costes.coste(producto.id), false))
  })

  // Editar precio de coste / contenido / merma de un ingrediente
  app.patch('/admin/escandallos/ingredientes/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = ingredienteSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const producto = await prisma.inventarioProducto.update({ where: { id }, data: result.data })
    await refrescarElaboraciones()
    const costes = await cargarCostes()
    return serializarProducto(producto, costes.coste(id), costes.esElaboracion(id))
  })

  // ── Elaboraciones (sub-recetas) ───────────────────────────────────────────────

  // Las que tienen receta y los productos de las categorías de producción (⚗️ cocina / sala),
  // con su coste por unidad de compra y en cuántas recetas se usan
  app.get('/admin/escandallos/elaboraciones', async () => {
    const productos = await prisma.inventarioProducto.findMany({
      where: { activo: true, restaurantId: null, OR: [{ elaboracion: { isNot: null } }, { categoria: { personalProduccion: { not: null } } }] },
      include: { categoria: { select: { nombre: true, personalProduccion: true } }, elaboracion: { include: { _count: { select: { lineas: true } } } }, _count: { select: { recetaLineas: true } } },
      orderBy: [{ categoria: { orden: 'asc' } }, { nombre: 'asc' }],
    })
    const costes = await cargarCostes()
    return productos.map(p => {
      const cu = costes.coste(p.id)
      const b = base(p)
      return {
        id: p.id, nombre: p.nombre, unidad: p.unidad, unidadBase: b.unidadBase, contenido: b.contenido,
        categoria: p.categoria.nombre, produccion: p.categoria.personalProduccion,
        rendimiento: p.elaboracion?.rendimiento ?? null,
        ingredientes: p.elaboracion?._count.lineas ?? 0,
        costeUnitario: cu === null ? null : r4(cu),
        precioPorUnidad: cu === null ? null : r2(cu * b.contenido),
        usadaEn: p._count.recetaLineas,
      }
    })
  })

  app.post('/admin/escandallos/elaboraciones', async (req, reply) => {
    const r = elaboracionSchema.safeParse(req.body)
    if (!r.success) return reply.status(400).send({ error: 'Nombre y unidad son obligatorios' })
    const repetido = await prisma.inventarioProducto.findFirst({ where: { restaurantId: null, activo: true, nombre: { equals: r.data.nombre, mode: 'insensitive' } } })
    if (repetido) return reply.status(409).send({ error: `Ya existe "${repetido.nombre}" en el inventario` })
    const categoria = await categoriaProduccion(r.data.produccion)
    const b = base({ unidad: r.data.unidad, unidadBase: null, contenido: null })
    const producto = await prisma.inventarioProducto.create({
      data: { nombre: r.data.nombre, unidad: r.data.unidad, unidadBase: b.unidadBase, contenido: b.contenido, categoriaId: categoria.id, precioOrigen: 'receta' },
    })
    return reply.status(201).send({ id: producto.id })
  })

  app.get('/admin/escandallos/elaboraciones/:productoId', async (req, reply) => {
    const productoId = Number((req.params as { productoId: string }).productoId)
    const p = await prisma.inventarioProducto.findUnique({
      where: { id: productoId },
      include: {
        categoria: { select: { nombre: true } },
        elaboracion: conFicha,
        recetaLineas: { include: { receta: { include: { menuItem: { select: { nombre: true } }, producto: { select: { nombre: true } } } } } },
      },
    })
    if (!p) return reply.status(404).send({ error: 'Elaboración no encontrada' })
    const costes = await cargarCostes()
    const b = base(p)
    return {
      id: p.id, nombre: p.nombre, unidad: p.unidad, unidadBase: b.unidadBase, contenido: b.contenido, categoria: p.categoria.nombre,
      rendimiento: p.elaboracion?.rendimiento ?? null,
      ...serializarFicha(p.elaboracion, costes),
      usadaEn: p.recetaLineas.map(l => l.receta.menuItem?.nombre ?? `⚗️ ${l.receta.producto?.nombre ?? ''}`),
    }
  })

  // Guardar la ficha de la tanda. Sin ingredientes con cantidad deja de ser elaboración para el coste
  // (vuelve a valer su precioCoste), pero conserva sus pasos
  app.put('/admin/escandallos/elaboraciones/:productoId', async (req, reply) => {
    const productoId = Number((req.params as { productoId: string }).productoId)
    const r = fichaSchema.extend({ rendimiento: z.number().positive().max(1_000_000).nullable() }).safeParse(req.body)
    if (!r.success) return reply.status(400).send({ error: 'Revisa la ficha: falta algún dato' })
    const lineas = lineasDe(r.data)
    if (lineas.some(l => l.cantidad > 0) && !r.data.rendimiento) return reply.status(400).send({ error: 'Falta cuánto rinde la tanda' })
    const producto = await prisma.inventarioProducto.findUnique({ where: { id: productoId } })
    if (!producto) return reply.status(404).send({ error: 'Elaboración no encontrada' })

    // Que ningún ingrediente la lleve dentro (directa o indirectamente)
    const { porId } = await cargarCostes()
    const circular = lineas.find(l => alcanza(porId, l.productoId, productoId))
    if (circular) {
      const nombre = porId.get(circular.productoId)?.nombre ?? 'un ingrediente'
      return reply.status(409).send({ error: circular.productoId === productoId ? 'Una elaboración no puede llevarse a sí misma' : `"${nombre}" ya lleva ${producto.nombre} dentro` })
    }

    await guardarFicha({ productoId }, r.data, { rendimiento: r.data.rendimiento })
    await refrescarElaboraciones()
    return reply.status(204).send()
  })

  // Detalle de un plato: su receta con el coste de cada línea
  app.get('/admin/escandallos/:menuItemId', async (req, reply) => {
    const menuItemId = Number((req.params as { menuItemId: string }).menuItemId)
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: { receta: conFicha },
    })
    if (!item) return reply.status(404).send({ error: 'Plato no encontrado' })
    const cfg = await config()
    const costes = await cargarCostes()
    return {
      ...cfg,
      id: item.id, nombre: item.nombre, categoria: item.categoria, precio: item.precio,
      precioSinIva: r2(item.precio / (1 + cfg.tasaIva / 100)),
      raciones: item.receta?.raciones ?? 1,
      ...serializarFicha(item.receta, costes),
    }
  })

  // Guardar la ficha completa del plato (reemplaza partes y líneas)
  app.put('/admin/escandallos/:menuItemId', async (req, reply) => {
    const menuItemId = Number((req.params as { menuItemId: string }).menuItemId)
    const result = recetaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Revisa la ficha: falta algún dato' })
    const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } })
    if (!item) return reply.status(404).send({ error: 'Plato no encontrado' })
    await guardarFicha({ menuItemId }, result.data, { raciones: result.data.raciones })
    return reply.status(204).send()
  })

  // ── Foto de la ficha (plato o elaboración): un JPEG, ya reducido en el navegador ──
  const fotoParams = z.object({ tipo: z.enum(['plato', 'elab']), id: z.coerce.number().int().positive() })
  const dondeFoto = (tipo: TipoFicha, id: number) => (tipo === 'plato' ? { menuItemId: id } : { productoId: id })

  app.post('/admin/escandallos/foto/:tipo/:id', async (req, reply) => {
    const { tipo, id } = fotoParams.parse(req.params)
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
      return reply.status(400).send({ error: 'La foto debe ser una imagen JPEG' })
    }
    const existe = tipo === 'plato'
      ? await prisma.menuItem.findUnique({ where: { id }, select: { id: true } })
      : await prisma.inventarioProducto.findUnique({ where: { id }, select: { id: true } })
    if (!existe) return reply.status(404).send({ error: 'No encontrado' })
    await fs.mkdir(FOTOS_DIR, { recursive: true })
    await fs.writeFile(archivoFoto(tipo, id), body)
    const fotoAt = new Date()
    await prisma.receta.upsert({ where: dondeFoto(tipo, id), create: { ...dondeFoto(tipo, id), fotoAt }, update: { fotoAt } })
    return { fotoAt }
  })

  app.get('/admin/escandallos/foto/:tipo/:id', async (req, reply) => {
    const { tipo, id } = fotoParams.parse(req.params)
    try {
      const jpg = await fs.readFile(archivoFoto(tipo, id))
      return reply.header('Cache-Control', 'private, max-age=86400').type('image/jpeg').send(jpg)
    } catch {
      return reply.status(404).send({ error: 'Sin foto' })
    }
  })

  app.delete('/admin/escandallos/foto/:tipo/:id', async (req, reply) => {
    const { tipo, id } = fotoParams.parse(req.params)
    await fs.rm(archivoFoto(tipo, id), { force: true })
    await prisma.receta.updateMany({ where: dondeFoto(tipo, id), data: { fotoAt: null } })
    return reply.status(204).send()
  })
}
