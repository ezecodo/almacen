import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

async function fetchPlaceReviews(placeId: string): Promise<{ total: number; rating: number } | null> {
  if (!PLACES_API_KEY) return null
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=user_ratings_total,rating&key=${PLACES_API_KEY}`
  const res = await fetch(url)
  const json = await res.json() as { status: string; result?: { user_ratings_total: number; rating: number } }
  if (json.status !== 'OK' || !json.result) return null
  return { total: json.result.user_ratings_total, rating: json.result.rating }
}

export async function reviewRoutes(app: FastifyInstance) {

  // Obtener último snapshot de reviews por restaurante
  app.get('/reviews', async () => {
    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    const restaurantes = await prisma.restaurant.findMany({
      where: { placeId: { not: null } },
      include: {
        reviews: {
          orderBy: { fecha: 'desc' },
          take: 2,
        },
      },
    })

    const ids = restaurantes.map(r => r.id)

    // Primer snapshot del mes para calcular reviews ganadas este mes
    const primerosDelMes = await prisma.reviewSnapshot.findMany({
      where: { restaurantId: { in: ids }, fecha: { gte: inicioMes } },
      orderBy: { fecha: 'asc' },
      distinct: ['restaurantId'],
    })
    const primeroMesMap = new Map(primerosDelMes.map(s => [s.restaurantId, s]))

    // Total pax de comandas cerradas este mes por restaurante
    const paxMes = await prisma.comanda.groupBy({
      by: ['restaurantId'],
      where: {
        restaurantId: { in: ids },
        estado: 'cerrada',
        closedAt: { gte: inicioMes },
      },
      _sum: { pax: true },
    })
    const paxMesMap = new Map(paxMes.map(p => [p.restaurantId, p._sum.pax ?? 0]))

    return restaurantes.map((r) => {
      const ultimo = r.reviews[0] ?? null
      const anterior = r.reviews[1] ?? null
      const diff = ultimo && anterior ? ultimo.total - anterior.total : null
      const ratingDiff = ultimo && anterior ? +(ultimo.rating - anterior.rating).toFixed(1) : null

      const primeroMes = primeroMesMap.get(r.id)
      const totalMes = ultimo && primeroMes ? ultimo.total - primeroMes.total : null

      const tasa = r.reviewObjetivoTasa ?? null
      const paxDelMes = paxMesMap.get(r.id) ?? 0
      const objetivoDinamico = tasa && paxDelMes > 0 ? Math.floor(paxDelMes / tasa) : null

      return {
        restaurantId: r.id,
        nombre: r.nombre,
        total: ultimo?.total ?? null,
        rating: ultimo?.rating ?? null,
        ratingAnterior: anterior?.rating ?? null,
        ratingDiff,
        diff,
        fecha: ultimo?.fecha ?? null,
        totalMes,
        tasa,
        paxMes: paxDelMes,
        objetivoDinamico,
      }
    })
  })

  // Configurar tasa de objetivo de reviews (1 review cada X comensales)
  app.patch('/reviews/objetivo', async (req, reply) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      tasa: z.number().int().min(1),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const updated = await prisma.restaurant.update({
      where: { id: result.data.restaurantId },
      data: { reviewObjetivoTasa: result.data.tasa },
    })
    return { restaurantId: updated.id, tasa: updated.reviewObjetivoTasa }
  })

  // Actualizar reviews de todos los restaurantes (una vez al día)
  app.post('/reviews/sync', async (req, reply) => {
    const secret = process.env.SYNC_SECRET
    const { authorization } = req.headers
    if (secret && authorization !== `Bearer ${secret}`) {
      return reply.status(401).send({ error: 'No autorizado' })
    }

    // Evitar doble sync en el mismo día
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const yaSync = await prisma.reviewSnapshot.findFirst({
      where: { fecha: { gte: hoy } },
    })
    if (yaSync) {
      return { synced: 0, mensaje: 'Ya se sincronizó hoy' }
    }

    const restaurantes = await prisma.restaurant.findMany({
      where: { placeId: { not: null } },
    })

    const resultados = []
    for (const r of restaurantes) {
      const data = await fetchPlaceReviews(r.placeId!)
      if (!data) continue
      await prisma.reviewSnapshot.create({
        data: { restaurantId: r.id, total: data.total, rating: data.rating },
      })
      resultados.push({ nombre: r.nombre, ...data })
    }

    return { synced: resultados.length, resultados }
  })
}
