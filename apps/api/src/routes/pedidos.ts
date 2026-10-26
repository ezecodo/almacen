import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

// Pedidos a proveedores. El dueño los arma en /admin/pedidos, por restaurante y proveedor, con las
// cantidades en formatos de compra (3 cajas de 24). La app no le escribe al proveedor: "Copiar pedido"
// deja el texto para WhatsApp o mail. Después el encargado lo recibe con el albarán (paso 3).
// Estados: borrador → enviado → recibido | recibido_diferencias; cancelado desde borrador o enviado.

const lineaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().positive().max(100000),
  precioFormato: z.number().min(0).max(1000000).nullable().optional(),
})
const pedidoSchema = z.object({
  restaurantId: z.number().int().positive(),
  proveedorId: z.number().int().positive(),
  nota: z.string().trim().max(500).default(''),
  lineas: z.array(lineaSchema).min(1).max(300),
  enviar: z.boolean().default(false),
})
const editarSchema = pedidoSchema.pick({ nota: true, lineas: true })
const idParams = z.object({ id: z.coerce.number().int().positive() })

const incluir = {
  proveedor: { select: { id: true, nombre: true, telefono: true, email: true } },
  restaurant: { select: { id: true, nombre: true } },
  lineas: { orderBy: { orden: 'asc' as const } },
}

// Copia del producto en cada línea (si después cambia el formato, el pedido sigue diciendo lo que se pidió).
// Los productos sin proveedor pasan a ser de este: se pidieron a él.
async function armarLineas(proveedorId: number, lineas: z.infer<typeof lineaSchema>[]) {
  const productos = await prisma.inventarioProducto.findMany({ where: { id: { in: lineas.map(l => l.productoId) } } })
  const sinProveedor = productos.filter(p => p.proveedorId === null).map(p => p.id)
  if (sinProveedor.length) {
    await prisma.inventarioProducto.updateMany({ where: { id: { in: sinProveedor } }, data: { proveedorId } })
  }
  return lineas.flatMap((l, orden) => {
    const p = productos.find(x => x.id === l.productoId)
    if (!p) return []
    const upf = p.formatoCompra ? p.unidadesPorFormato : 1
    return [{
      productoId: p.id,
      nombre: p.nombre,
      unidad: p.unidad,
      formato: p.formatoCompra,
      unidadesPorFormato: upf,
      cantidad: l.cantidad,
      precioFormato: l.precioFormato !== undefined ? l.precioFormato : p.precioCoste !== null ? p.precioCoste * upf : null,
      orden,
    }]
  })
}

export async function pedidoRoutes(app: FastifyInstance) {

  // GET /pedidos?restaurantId=&estado=&proveedorId=
  app.get('/pedidos', async (req) => {
    const q = z.object({
      restaurantId: z.coerce.number().int().positive().optional(),
      proveedorId: z.coerce.number().int().positive().optional(),
      estado: z.string().optional(),
    }).parse(req.query)
    return prisma.pedido.findMany({
      where: {
        restaurantId: q.restaurantId,
        proveedorId: q.proveedorId,
        estado: q.estado ? { in: q.estado.split(',') } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: incluir,
    })
  })

  // Productos de un proveedor para armar el pedido de un restaurante, con lo que quedaba en el
  // último conteo de ese local, lo que ya viene en camino y una cantidad sugerida en formatos.
  app.get('/pedidos/sugerencia', async (req, reply) => {
    const q = z.object({
      restaurantId: z.coerce.number().int().positive(),
      proveedorId: z.coerce.number().int().positive(),
    }).safeParse(req.query)
    if (!q.success) return reply.status(400).send({ error: 'restaurantId y proveedorId son requeridos' })
    const { restaurantId, proveedorId } = q.data

    const productos = await prisma.inventarioProducto.findMany({
      where: { activo: true, proveedorId, OR: [{ restaurantId: null }, { restaurantId }] },
      orderBy: [{ categoria: { orden: 'asc' } }, { orden: 'asc' }, { nombre: 'asc' }],
      include: { categoria: { select: { nombre: true } } },
    })
    const ids = productos.map(p => p.id)

    const conteos = await prisma.inventarioConteoItem.findMany({
      where: { productoId: { in: ids }, conteo: { restaurantId } },
      orderBy: { conteo: { fecha: 'desc' } },
      include: { conteo: { select: { fecha: true } } },
    })
    const enCamino = await prisma.pedidoLinea.findMany({
      where: { productoId: { in: ids }, pedido: { restaurantId, estado: 'enviado' } },
    })

    return productos.map(p => {
      const ultimo = conteos.find(c => c.productoId === p.id)
      const upf = p.formatoCompra ? p.unidadesPorFormato : 1
      const llegando = enCamino.filter(l => l.productoId === p.id).reduce((n, l) => n + l.cantidad * l.unidadesPorFormato, 0)
      const falta = ultimo && p.stockMinimo > 0 ? p.stockMinimo - ultimo.cantidad - llegando : 0
      return {
        productoId: p.id,
        nombre: p.nombre,
        categoria: p.categoria.nombre,
        unidad: p.unidad,
        formato: p.formatoCompra,
        unidadesPorFormato: upf,
        precioFormato: p.precioCoste !== null ? p.precioCoste * upf : null,
        precioOrigen: p.precioOrigen,
        stockMinimo: p.stockMinimo,
        stock: ultimo?.cantidad ?? null,
        stockFecha: ultimo?.conteo.fecha ?? null,
        enCamino: llegando,
        sugerido: falta > 0 ? Math.ceil(falta / upf) : 0,
      }
    })
  })

  app.get('/pedidos/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const pedido = await prisma.pedido.findUnique({ where: { id }, include: incluir })
    if (!pedido) return reply.status(404).send({ error: 'Pedido no encontrado' })
    return pedido
  })

  app.post('/pedidos', async (req, reply) => {
    const r = pedidoSchema.safeParse(req.body)
    if (!r.success) return reply.status(400).send({ error: 'Pedido inválido' })
    const { restaurantId, proveedorId, nota, lineas, enviar } = r.data
    const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } })
    if (!proveedor) return reply.status(404).send({ error: 'Proveedor no encontrado' })

    const datos = await armarLineas(proveedorId, lineas)
    if (datos.length === 0) return reply.status(400).send({ error: 'Ningún producto válido' })
    const pedido = await prisma.pedido.create({
      data: {
        restaurantId, proveedorId, nota,
        creadoPor: req.user?.nombre ?? '',
        estado: enviar ? 'enviado' : 'borrador',
        enviadoAt: enviar ? new Date() : null,
        lineas: { create: datos },
      },
      include: incluir,
    })
    broadcast(restaurantId, 'pedidos')
    return reply.status(201).send(pedido)
  })

  // Corregir líneas o nota mientras no se haya recibido
  app.put('/pedidos/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const r = editarSchema.safeParse(req.body)
    if (!r.success) return reply.status(400).send({ error: 'Pedido inválido' })
    const actual = await prisma.pedido.findUnique({ where: { id } })
    if (!actual) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (actual.estado !== 'borrador' && actual.estado !== 'enviado') {
      return reply.status(409).send({ error: 'El pedido ya está recibido o cancelado' })
    }
    const datos = await armarLineas(actual.proveedorId, r.data.lineas)
    if (datos.length === 0) return reply.status(400).send({ error: 'Ningún producto válido' })
    const [, pedido] = await prisma.$transaction([
      prisma.pedidoLinea.deleteMany({ where: { pedidoId: id } }),
      prisma.pedido.update({ where: { id }, data: { nota: r.data.nota, lineas: { create: datos } }, include: incluir }),
    ])
    broadcast(actual.restaurantId, 'pedidos')
    return pedido
  })

  app.patch('/pedidos/:id/estado', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const r = z.object({ estado: z.enum(['borrador', 'enviado', 'cancelado']) }).safeParse(req.body)
    if (!r.success) return reply.status(400).send({ error: 'Estado inválido' })
    const actual = await prisma.pedido.findUnique({ where: { id } })
    if (!actual) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (actual.estado.startsWith('recibido')) return reply.status(409).send({ error: 'El pedido ya se recibió' })
    const { estado } = r.data
    const pedido = await prisma.pedido.update({
      where: { id },
      data: {
        estado,
        enviadoAt: estado === 'enviado' ? (actual.enviadoAt ?? new Date()) : estado === 'borrador' ? null : actual.enviadoAt,
      },
      include: incluir,
    })
    broadcast(actual.restaurantId, 'pedidos')
    return pedido
  })

  // Solo borradores y cancelados (uno enviado se cancela, así queda constancia)
  app.delete('/pedidos/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const actual = await prisma.pedido.findUnique({ where: { id } })
    if (!actual) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (actual.estado !== 'borrador' && actual.estado !== 'cancelado') {
      return reply.status(409).send({ error: 'Un pedido enviado se cancela, no se borra' })
    }
    await prisma.pedido.delete({ where: { id } })
    broadcast(actual.restaurantId, 'pedidos')
    return reply.status(204).send()
  })
}
