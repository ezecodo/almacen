import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import path from 'path'
import fs from 'fs/promises'
import { PDFDocument } from 'pdf-lib'
import { prisma } from '../server'
import { broadcast } from '../sse'
import { requireAdmin, requireEncargado } from '../auth'

// Las páginas viven en disco, fuera de lo que sirve Nginx: apps/api/uploads/facturas/<id>/<n>.jpg
const FACTURAS_DIR = process.env.FACTURAS_DIR || path.join(__dirname, '..', '..', 'uploads', 'facturas')
const MAX_PAGINAS = 20
// Nginx corta en 1 MB por defecto — el cliente comprime cada foto por debajo de eso.
const MAX_BYTES_PAGINA = 5 * 1024 * 1024
const A4_ANCHO = 595

const dirFactura = (id: number) => path.join(FACTURAS_DIR, String(id))
const archivoPagina = (id: number, n: number) => path.join(dirFactura(id), `${n}.jpg`)

const crearSchema = z.object({
  restaurantId: z.number().int().positive(),
  // Del catálogo (proveedorId) o, si no está en la lista, escrito a mano (proveedor)
  proveedorId:  z.number().int().positive().optional(),
  proveedor:    z.string().trim().min(1).max(120).optional(),
  numero:       z.string().trim().max(60).optional(),
  nota:         z.string().trim().max(500).optional(),
})

const estadoSchema = z.object({ estado: z.enum(['pendiente', 'revisada']) })

const proveedorSchema = z.object({ nombre: z.string().trim().min(1).max(120) })

const buscarProveedor = (nombre: string) =>
  prisma.proveedor.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } })

async function borrarFactura(id: number) {
  await prisma.factura.delete({ where: { id } })
  await fs.rm(dirFactura(id), { recursive: true, force: true })
}

export async function facturaRoutes(app: FastifyInstance) {

  // Cada página llega como JPEG crudo en el body (una request por página)
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: MAX_BYTES_PAGINA }, (_req, body, done) => done(null, body))

  // ── Subida (encargado, desde /sala) ───────────────────────────────────────────

  // 1) Crear la factura en estado 'subiendo'
  app.post('/facturas', { preHandler: requireEncargado }, async (req, reply) => {
    const result = crearSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Datos de factura inválidos' })

    // Si lo escrito a mano coincide con uno del catálogo, se vincula igual
    const catalogado = result.data.proveedorId
      ? await prisma.proveedor.findUnique({ where: { id: result.data.proveedorId } })
      : result.data.proveedor ? await buscarProveedor(result.data.proveedor) : null
    if (result.data.proveedorId && !catalogado) return reply.status(400).send({ error: 'Proveedor no encontrado' })
    const proveedor = catalogado?.nombre ?? result.data.proveedor
    if (!proveedor) return reply.status(400).send({ error: 'Falta el proveedor' })

    // Limpieza: subidas que quedaron a medias hace más de un día
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const colgadas = await prisma.factura.findMany({ where: { estado: 'subiendo', createdAt: { lt: ayer } }, select: { id: true } })
    for (const f of colgadas) await borrarFactura(f.id)

    const factura = await prisma.factura.create({
      data: {
        restaurantId: result.data.restaurantId,
        proveedor,
        proveedorId: catalogado?.id ?? null,
        numero:      result.data.numero || null,
        nota:        result.data.nota || null,
        subidoPor:   req.user.nombre,
        subidoPorId: req.user.empleadoId ?? null,
      },
    })
    return reply.status(201).send(factura)
  })

  // 2) Añadir una página
  app.post('/facturas/:id/paginas', { preHandler: requireEncargado }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
      return reply.status(400).send({ error: 'La página debe ser una imagen JPEG' })
    }
    const factura = await prisma.factura.findUnique({ where: { id } })
    if (!factura) return reply.status(404).send({ error: 'Factura no encontrada' })
    if (factura.estado !== 'subiendo') return reply.status(409).send({ error: 'La factura ya fue enviada' })
    if (factura.paginas >= MAX_PAGINAS) return reply.status(400).send({ error: `Máximo ${MAX_PAGINAS} páginas por factura` })

    const n = factura.paginas + 1
    await fs.mkdir(dirFactura(id), { recursive: true })
    await fs.writeFile(archivoPagina(id, n), body)
    const actualizada = await prisma.factura.update({ where: { id }, data: { paginas: n } })
    return reply.status(201).send(actualizada)
  })

  // 3) Enviar: pasa a 'pendiente' y aparece en la bandeja del admin
  app.patch('/facturas/:id/enviar', { preHandler: requireEncargado }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const factura = await prisma.factura.findUnique({ where: { id } })
    if (!factura) return reply.status(404).send({ error: 'Factura no encontrada' })
    if (factura.estado !== 'subiendo') return reply.status(409).send({ error: 'La factura ya fue enviada' })
    if (factura.paginas === 0) return reply.status(400).send({ error: 'La factura no tiene páginas' })

    const enviada = await prisma.factura.update({ where: { id }, data: { estado: 'pendiente' } })
    broadcast(enviada.restaurantId, 'facturas')
    return enviada
  })

  // ── Consulta ──────────────────────────────────────────────────────────────────

  // Admin: todas (filtros opcionales). Encargado: solo las de un restaurante.
  app.get('/facturas', { preHandler: requireEncargado }, async (req, reply) => {
    const { restaurantId, estado, mes, proveedorId } = req.query as { restaurantId?: string; estado?: string; mes?: string; proveedorId?: string }
    if (req.user.tipo !== 'admin' && !restaurantId) {
      return reply.status(400).send({ error: 'restaurantId requerido' })
    }

    let rango: { gte: Date; lt: Date } | undefined
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [y, m] = mes.split('-').map(Number)
      rango = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) }
    }

    return prisma.factura.findMany({
      where: {
        restaurantId: restaurantId ? Number(restaurantId) : undefined,
        proveedorId: proveedorId ? Number(proveedorId) : undefined,
        estado: estado === 'pendiente' || estado === 'revisada' ? estado : { not: 'subiendo' },
        createdAt: rango,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { restaurant: { select: { id: true, nombre: true } } },
    })
  })

  // ── Catálogo de proveedores ───────────────────────────────────────────────────

  app.get('/facturas/proveedores', { preHandler: requireEncargado }, async () => {
    return prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { facturas: true } } },
    })
  })

  // Alta (o reactivación si ya existía). Vincula las facturas que se subieron
  // con ese mismo nombre escrito a mano.
  app.post('/facturas/proveedores', { preHandler: requireAdmin }, async (req, reply) => {
    const result = proveedorSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Nombre de proveedor inválido' })
    const { nombre } = result.data

    const existente = await buscarProveedor(nombre)
    if (existente?.activo) return reply.status(409).send({ error: `"${existente.nombre}" ya está en el catálogo` })
    const proveedor = existente
      ? await prisma.proveedor.update({ where: { id: existente.id }, data: { activo: true, nombre } })
      : await prisma.proveedor.create({ data: { nombre } })

    await prisma.factura.updateMany({
      where: { proveedorId: null, proveedor: { equals: nombre, mode: 'insensitive' } },
      data: { proveedorId: proveedor.id, proveedor: proveedor.nombre },
    })
    return reply.status(201).send(proveedor)
  })

  // Renombrar: actualiza también el nombre en sus facturas
  app.put('/facturas/proveedores/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = proveedorSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Nombre de proveedor inválido' })
    const { nombre } = result.data

    const otro = await buscarProveedor(nombre)
    if (otro && otro.id !== id) return reply.status(409).send({ error: `Ya existe un proveedor "${otro.nombre}"` })
    const actual = await prisma.proveedor.findUnique({ where: { id } })
    if (!actual) return reply.status(404).send({ error: 'Proveedor no encontrado' })

    const [proveedor] = await prisma.$transaction([
      prisma.proveedor.update({ where: { id }, data: { nombre } }),
      prisma.factura.updateMany({ where: { proveedorId: id }, data: { proveedor: nombre } }),
    ])
    return proveedor
  })

  // Quitar del catálogo: si tiene facturas se desactiva (las facturas conservan el vínculo)
  app.delete('/facturas/proveedores/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const usadas = await prisma.factura.count({ where: { proveedorId: id } })
    if (usadas > 0) await prisma.proveedor.update({ where: { id }, data: { activo: false } })
    else await prisma.proveedor.deleteMany({ where: { id } })
    return reply.status(204).send()
  })

  app.get('/facturas/:id/paginas/:n', { preHandler: requireEncargado }, async (req, reply) => {
    const { id, n } = req.params as { id: string; n: string }
    const factura = await prisma.factura.findUnique({ where: { id: Number(id) } })
    const num = Number(n)
    if (!factura || !Number.isInteger(num) || num < 1 || num > factura.paginas) {
      return reply.status(404).send({ error: 'Página no encontrada' })
    }
    try {
      const jpg = await fs.readFile(archivoPagina(factura.id, num))
      return reply.header('Cache-Control', 'private, no-store').type('image/jpeg').send(jpg)
    } catch {
      return reply.status(404).send({ error: 'Archivo de la página no encontrado en el servidor' })
    }
  })

  // PDF armado al vuelo con todas las páginas (ancho A4)
  app.get('/facturas/:id/pdf', { preHandler: requireEncargado }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const factura = await prisma.factura.findUnique({ where: { id } })
    if (!factura || factura.paginas === 0) return reply.status(404).send({ error: 'Factura no encontrada' })

    try {
      const pdf = await PDFDocument.create()
      pdf.setTitle(`Factura ${factura.proveedor} ${factura.numero ?? `#${factura.id}`}`)
      for (let n = 1; n <= factura.paginas; n++) {
        const img = await pdf.embedJpg(await fs.readFile(archivoPagina(id, n)))
        const alto = (img.height / img.width) * A4_ANCHO
        pdf.addPage([A4_ANCHO, alto]).drawImage(img, { x: 0, y: 0, width: A4_ANCHO, height: alto })
      }
      const bytes = await pdf.save()
      return reply.header('Cache-Control', 'private, no-store').type('application/pdf').send(Buffer.from(bytes))
    } catch (err) {
      req.log.error(err)
      return reply.status(500).send({ error: 'No se pudo generar el PDF' })
    }
  })

  // ── Gestión ───────────────────────────────────────────────────────────────────

  app.patch('/facturas/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = estadoSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Estado inválido' })
    const factura = await prisma.factura.findUnique({ where: { id } })
    if (!factura || factura.estado === 'subiendo') return reply.status(404).send({ error: 'Factura no encontrada' })

    const actualizada = await prisma.factura.update({
      where: { id },
      data: { estado: result.data.estado, revisadaAt: result.data.estado === 'revisada' ? new Date() : null },
    })
    broadcast(actualizada.restaurantId, 'facturas')
    return actualizada
  })

  // Admin borra cualquiera; el encargado solo las suyas mientras no estén revisadas
  // (corregir una subida equivocada).
  app.delete('/facturas/:id', { preHandler: requireEncargado }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const factura = await prisma.factura.findUnique({ where: { id } })
    if (!factura) return reply.status(404).send({ error: 'Factura no encontrada' })
    if (req.user.tipo !== 'admin') {
      const propia = factura.subidoPorId != null && factura.subidoPorId === req.user.empleadoId
      if (!propia) return reply.status(403).send({ error: 'Solo puedes borrar facturas que subiste tú' })
      if (factura.estado === 'revisada') return reply.status(409).send({ error: 'La factura ya fue revisada por administración' })
    }
    await borrarFactura(id)
    broadcast(factura.restaurantId, 'facturas')
    return reply.status(204).send()
  })
}
