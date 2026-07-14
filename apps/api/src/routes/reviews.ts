import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

type ReviewData = { rating: number; text: string; author: string; time: number }
type PlaceResult = { total: number; rating: number; reviewsData: ReviewData[] }

async function fetchPlaceReviews(placeId: string): Promise<PlaceResult | null> {
  if (!PLACES_API_KEY) return null
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=user_ratings_total,rating,reviews&reviews_sort=newest&key=${PLACES_API_KEY}`
  const res = await fetch(url)
  const json = await res.json() as {
    status: string
    result?: {
      user_ratings_total: number
      rating: number
      reviews?: { rating: number; text: string; author_name: string; time: number }[]
    }
  }
  if (json.status !== 'OK' || !json.result) return null
  const reviewsData = (json.result.reviews ?? []).map(r => ({
    rating: r.rating, text: r.text, author: r.author_name, time: r.time,
  }))
  return { total: json.result.user_ratings_total, rating: json.result.rating, reviewsData }
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
        activo: r.reviewsCheckActivo,
        total: ultimo?.total ?? null,
        rating: ultimo?.rating ?? null,
        ratingAnterior: anterior?.rating ?? null,
        ratingDiff,
        diff,
        fecha: ultimo?.fecha ?? null,
        negativasNuevas: (ultimo?.negativasNuevas as ReviewData[] | null) ?? [],
        posibleOculta: ultimo?.posibleOculta ?? false,
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

  // Activar/desactivar la consulta automática de reviews para un restaurante
  app.patch('/reviews/activo', async (req, reply) => {
    const schema = z.object({
      restaurantId: z.number().int().positive(),
      activo: z.boolean(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const updated = await prisma.restaurant.update({
      where: { id: result.data.restaurantId },
      data: { reviewsCheckActivo: result.data.activo },
    })
    return { restaurantId: updated.id, activo: updated.reviewsCheckActivo }
  })

  // Sync automático — pensado para correr cada hora vía cron. Solo restaurantes con
  // reviewsCheckActivo=true. Detecta reviews nuevas desde el snapshot anterior comparando
  // por timestamp; si alguna es negativa (rating <= 3) la marca. Si entraron más reviews
  // de las 5 que Google devuelve en detalle, marca posibleOculta para avisar en la UI.
  app.post('/reviews/sync', async (req, reply) => {
    const secret = process.env.SYNC_SECRET
    const { authorization } = req.headers
    if (secret && authorization !== `Bearer ${secret}`) {
      return reply.status(401).send({ error: 'No autorizado' })
    }

    const restaurantes = await prisma.restaurant.findMany({
      where: { placeId: { not: null }, reviewsCheckActivo: true },
    })

    const haceUnRato = new Date(Date.now() - 50 * 60_000)

    const resultados = []
    for (const r of restaurantes) {
      // Evitar doble sync del mismo restaurante si el cron se disparó dos veces seguidas
      const reciente = await prisma.reviewSnapshot.findFirst({
        where: { restaurantId: r.id, fecha: { gte: haceUnRato } },
      })
      if (reciente) continue

      const data = await fetchPlaceReviews(r.placeId!)
      if (!data) continue

      const anterior = await prisma.reviewSnapshot.findFirst({
        where: { restaurantId: r.id },
        orderBy: { fecha: 'desc' },
      })

      let nuevas: ReviewData[] = []
      let posibleOculta = false
      if (anterior) {
        const anteriorData = (anterior.reviewsData as ReviewData[] | null) ?? []
        const maxTimeAnterior = anteriorData.reduce((max, rv) => Math.max(max, rv.time), 0)
        nuevas = data.reviewsData.filter(rv => rv.time > maxTimeAnterior)
        const subioMasDeLoVisible = data.total - anterior.total
        if (subioMasDeLoVisible > nuevas.length) posibleOculta = true
      }
      const negativasNuevas = nuevas.filter(rv => rv.rating <= 3)

      await prisma.reviewSnapshot.create({
        data: {
          restaurantId: r.id,
          total: data.total,
          rating: data.rating,
          reviewsData: data.reviewsData,
          negativasNuevas,
          posibleOculta,
        },
      })
      resultados.push({ nombre: r.nombre, total: data.total, rating: data.rating, negativasNuevas, posibleOculta })
    }

    return { synced: resultados.length, resultados }
  })
}
