import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const productoSchema = z.object({
  barcode: z.string().min(1),
  nombre:  z.string().min(1),
  unidad:  z.enum(['kg', 'ud', 'l', 'g']).default('ud'),
})

export async function productoRoutes(app: FastifyInstance) {

  // Lookup: DB local primero, luego Open Food Facts
  app.get('/producto/:barcode', async (req, reply) => {
    const { barcode } = req.params as { barcode: string }
    if (!barcode || barcode.length < 4) {
      return reply.status(400).send({ error: 'Barcode inválido' })
    }

    // 1. Buscar en DB local
    const local = await prisma.producto.findUnique({ where: { barcode } })
    if (local) {
      return { barcode, nombre: local.nombre, unidad: local.unidad, encontrado: true, fuente: 'local' }
    }

    // 2. Fallback a Open Food Facts
    try {
      const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const data = await res.json() as any
      if (data.status === 1 && data.product) {
        const nombre = data.product.product_name_es || data.product.product_name || null
        return { barcode, nombre: nombre || '', encontrado: !!nombre, fuente: 'openfoodfacts' }
      }
    } catch (err) {
      app.log.warn(`Open Food Facts error: ${err}`)
    }

    return { barcode, nombre: '', encontrado: false, fuente: null }
  })

  // Listar todos los productos del catálogo
  app.get('/productos', async () => {
    return prisma.producto.findMany({ orderBy: { nombre: 'asc' } })
  })

  // Crear producto
  app.post('/productos', async (req, reply) => {
    const result = productoSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { barcode, nombre, unidad } = result.data
    const producto = await prisma.producto.upsert({
      where:  { barcode },
      update: { nombre, unidad },
      create: { barcode, nombre, unidad },
    })
    return reply.status(201).send(producto)
  })

  // Editar producto
  app.put('/productos/:barcode', async (req, reply) => {
    const { barcode } = req.params as { barcode: string }
    const result = productoSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const producto = await prisma.producto.update({
      where: { barcode },
      data:  result.data,
    })
    return producto
  })

  // Eliminar producto
  app.delete('/productos/:barcode', async (req, reply) => {
    const { barcode } = req.params as { barcode: string }
    await prisma.producto.delete({ where: { barcode } })
    return reply.status(204).send()
  })
}
