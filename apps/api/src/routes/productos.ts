import { FastifyInstance } from 'fastify'

export async function productoRoutes(app: FastifyInstance) {
  app.get('/producto/:barcode', async (req, reply) => {
    const { barcode } = req.params as { barcode: string }

    if (!barcode || barcode.length < 4) {
      return reply.status(400).send({ error: 'Barcode inválido' })
    }

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
      )
      const data = await res.json() as any

      if (data.status === 1 && data.product) {
        const nombre =
          data.product.product_name_es ||
          data.product.product_name ||
          null

        return {
          barcode,
          nombre: nombre || 'Producto sin nombre',
          found: !!nombre
        }
      }

      return { barcode, nombre: '', found: false }

    } catch (err) {
      app.log.warn(`Open Food Facts error: ${err}`)
      return { barcode, nombre: '', found: false }
    }
  })
}
