import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import path from 'path'
import fs from 'fs/promises'
import { prisma } from '../server'
import { broadcast } from '../sse'
import { requireEncargado } from '../auth'

// Pedidos a proveedores. El dueño los arma en /admin/pedidos, por restaurante y proveedor, con las
// cantidades en formatos de compra (3 cajas de 24). La app no le escribe al proveedor: "Copiar pedido"
// deja el texto para WhatsApp o mail. Después el encargado lo recibe con el albarán (paso 3).
// Estados: borrador → enviado → recibido | recibido_diferencias; cancelado desde borrador o enviado.
// Recepción (paso 3): el encargado, en el panel 💼, marca línea por línea qué llegó y fotografía el
// albarán; el precio de cada línea recibida pasa a ser el precioCoste del producto (precioOrigen 'pedido').

// Fotos del albarán en disco, fuera de lo que sirve Nginx (mismo esquema que las facturas)
const ALBARANES_DIR = process.env.ALBARANES_DIR || path.join(__dirname, '..', '..', 'uploads', 'albaranes')
const MAX_FOTOS = 10
const MAX_BYTES_FOTO = 5 * 1024 * 1024
const archivoFoto = (id: number, n: number) => path.join(ALBARANES_DIR, String(id), `${n}.jpg`)
// El encargado corrige una recepción equivocada hasta 2 días después; administración, siempre
const CORREGIR_RECEPCION_MS = 2 * 24 * 60 * 60 * 1000

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
const recibirSchema = z.object({
  nota: z.string().trim().max(500).default(''),
  lineas: z.array(z.object({
    id: z.number().int().positive(),
    cantidadRecibida: z.number().min(0).max(100000),
    incidencia: z.enum(['falta', 'roto', 'otro']).nullable().default(null),
    nota: z.string().trim().max(200).nullable().default(null),
  })).max(300),
})
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

// Un encargado solo toca los pedidos del local donde entró; administración, todos
function delLocal(req: FastifyRequest, restaurantId: number) {
  return req.user.tipo === 'admin' || req.user.restaurantId === restaurantId
}

// En sala no se ven precios de coste (el encargado coteja cantidades, no importes)
function sinPrecios<T extends { lineas: { precioFormato: number | null }[] }>(pedido: T): T {
  return { ...pedido, lineas: pedido.lineas.map(l => ({ ...l, precioFormato: null })) }
}

export async function pedidoRoutes(app: FastifyInstance) {

  // Cada foto del albarán llega como JPEG crudo en el body (una request por foto)
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: MAX_BYTES_FOTO }, (_req, body, done) => done(null, body))

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

  // ── Recepción (encargado, panel 💼 de /sala) ──────────────────────────────────

  // Lo que está en camino a este local y lo recibido en la última semana
  app.get('/pedidos/recepcion', { preHandler: requireEncargado }, async (req, reply) => {
    const q = z.object({ restaurantId: z.coerce.number().int().positive().optional() }).parse(req.query)
    const restaurantId = req.user.tipo === 'admin' ? q.restaurantId : req.user.restaurantId
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    const semana = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const pedidos = await prisma.pedido.findMany({
      where: {
        restaurantId,
        OR: [{ estado: 'enviado' }, { estado: { startsWith: 'recibido' }, recibidoAt: { gte: semana } }],
      },
      orderBy: [{ enviadoAt: 'asc' }, { id: 'asc' }],
      include: incluir,
    })
    return req.user.tipo === 'admin' ? pedidos : pedidos.map(sinPrecios)
  })

  // Añadir una foto del albarán (mientras el pedido esté en camino o se pueda corregir su recepción)
  app.post('/pedidos/:id/albaran', { preHandler: requireEncargado }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
      return reply.status(400).send({ error: 'La foto debe ser una imagen JPEG' })
    }
    const pedido = await prisma.pedido.findUnique({ where: { id } })
    if (!pedido || !delLocal(req, pedido.restaurantId)) return reply.status(404).send({ error: 'Pedido no encontrado' })
    if (pedido.estado !== 'enviado' && !pedido.estado.startsWith('recibido')) {
      return reply.status(409).send({ error: 'El pedido no está en camino' })
    }
    if (pedido.albaranFotos >= MAX_FOTOS) return reply.status(400).send({ error: `Máximo ${MAX_FOTOS} fotos por albarán` })
    const n = pedido.albaranFotos + 1
    await fs.mkdir(path.dirname(archivoFoto(id, n)), { recursive: true })
    await fs.writeFile(archivoFoto(id, n), body)
    const actualizado = await prisma.pedido.update({ where: { id }, data: { albaranFotos: n } })
    broadcast(pedido.restaurantId, 'pedidos')
    return reply.status(201).send({ albaranFotos: actualizado.albaranFotos })
  })

  app.get('/pedidos/:id/albaran/:n', { preHandler: requireEncargado }, async (req, reply) => {
    const { id, n } = z.object({ id: z.coerce.number().int().positive(), n: z.coerce.number().int().positive() }).parse(req.params)
    const pedido = await prisma.pedido.findUnique({ where: { id } })
    if (!pedido || !delLocal(req, pedido.restaurantId) || n > pedido.albaranFotos) {
      return reply.status(404).send({ error: 'Foto no encontrada' })
    }
    try {
      const jpg = await fs.readFile(archivoFoto(id, n))
      return reply.header('Cache-Control', 'private, no-store').type('image/jpeg').send(jpg)
    } catch {
      return reply.status(404).send({ error: 'Archivo de la foto no encontrado en el servidor' })
    }
  })

  // Quitar una foto (salió movida): las siguientes se corren un lugar
  app.delete('/pedidos/:id/albaran/:n', { preHandler: requireEncargado }, async (req, reply) => {
    const { id, n } = z.object({ id: z.coerce.number().int().positive(), n: z.coerce.number().int().positive() }).parse(req.params)
    const pedido = await prisma.pedido.findUnique({ where: { id } })
    if (!pedido || !delLocal(req, pedido.restaurantId) || n > pedido.albaranFotos) {
      return reply.status(404).send({ error: 'Foto no encontrada' })
    }
    await fs.rm(archivoFoto(id, n), { force: true })
    for (let i = n + 1; i <= pedido.albaranFotos; i++) {
      await fs.rename(archivoFoto(id, i), archivoFoto(id, i - 1)).catch(() => undefined)
    }
    const actualizado = await prisma.pedido.update({ where: { id }, data: { albaranFotos: pedido.albaranFotos - 1 } })
    broadcast(pedido.restaurantId, 'pedidos')
    return { albaranFotos: actualizado.albaranFotos }
  })

  // Cerrar la recepción: lo que llegó de cada línea. También corrige una recepción ya hecha.
  app.patch('/pedidos/:id/recibir', { preHandler: requireEncargado }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const r = recibirSchema.safeParse(req.body)
    if (!r.success) return reply.status(400).send({ error: 'Recepción inválida' })
    const pedido = await prisma.pedido.findUnique({ where: { id }, include: { lineas: true } })
    if (!pedido || !delLocal(req, pedido.restaurantId)) return reply.status(404).send({ error: 'Pedido no encontrado' })
    const corrigiendo = pedido.estado.startsWith('recibido')
    if (pedido.estado !== 'enviado' && !corrigiendo) {
      return reply.status(409).send({ error: pedido.estado === 'borrador' ? 'El pedido todavía no se envió al proveedor' : 'El pedido está cancelado' })
    }
    if (corrigiendo && req.user.tipo !== 'admin' && Date.now() - (pedido.recibidoAt?.getTime() ?? 0) > CORREGIR_RECEPCION_MS) {
      return reply.status(409).send({ error: 'Pasaron más de 2 días: la corrige administración' })
    }

    // Las líneas que no vinieron en la petición se dan por recibidas tal cual
    const porId = new Map(r.data.lineas.map(l => [l.id, l]))
    const lineas = pedido.lineas.map(l => {
      const x = porId.get(l.id)
      const cantidadRecibida = x ? x.cantidadRecibida : l.cantidad
      const incidencia = x?.incidencia ?? (cantidadRecibida < l.cantidad ? 'falta' : null)
      return { linea: l, cantidadRecibida, incidencia, nota: x?.nota || null }
    })
    const conDiferencias = lineas.some(x => x.cantidadRecibida !== x.linea.cantidad || x.incidencia !== null)

    // Lo que llegó fija el coste del producto: precio del pedido ÷ unidades del formato
    const precios = lineas.filter(x => x.linea.productoId !== null && x.linea.precioFormato !== null && x.cantidadRecibida > 0)

    await prisma.$transaction([
      prisma.pedido.update({
        where: { id },
        data: {
          estado: conDiferencias ? 'recibido_diferencias' : 'recibido',
          recibidoAt: corrigiendo ? pedido.recibidoAt : new Date(),
          recibidoPor: req.user.nombre,
          notaRecepcion: r.data.nota || null,
        },
      }),
      ...lineas.map(x => prisma.pedidoLinea.update({
        where: { id: x.linea.id },
        data: { cantidadRecibida: x.cantidadRecibida, incidencia: x.incidencia, notaRecepcion: x.nota },
      })),
      ...precios.map(x => prisma.inventarioProducto.update({
        where: { id: x.linea.productoId! },
        data: { precioCoste: Math.round((x.linea.precioFormato! / x.linea.unidadesPorFormato) * 10000) / 10000, precioOrigen: 'pedido' },
      })),
    ])
    const final = await prisma.pedido.findUniqueOrThrow({ where: { id }, include: incluir })
    broadcast(pedido.restaurantId, 'pedidos')
    return req.user.tipo === 'admin' ? final : sinPrecios(final)
  })
}
