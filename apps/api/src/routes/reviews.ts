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

// Inicio de la ventana "17:44 → 17:44 del día siguiente" (coincide con la hora real del
// cron diario), anclada a la hora de Barcelona (Europe/Madrid) sin importar el huso
// horario del servidor donde corra esto.
function inicioVentanaMadrid(ahora: Date): Date {
  const offsetStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset',
  }).formatToParts(ahora).find(p => p.type === 'timeZoneName')!.value // "GMT+2" o "GMT+1"
  const offsetMin = parseInt(offsetStr.replace('GMT', ''), 10) * 60

  // Instante "etiquetado": mismos números de reloj que Madrid, pero tratado como UTC
  // para poder usar setUTCHours sin que el huso del proceso interfiera.
  const etiquetado = new Date(ahora.getTime() + offsetMin * 60_000)
  const hoyCorte = new Date(etiquetado)
  hoyCorte.setUTCHours(17, 44, 0, 0)
  if (etiquetado < hoyCorte) hoyCorte.setUTCDate(hoyCorte.getUTCDate() - 1)

  return new Date(hoyCorte.getTime() - offsetMin * 60_000) // instante real (UTC) equivalente
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

  // Consulta en vivo a Google — hasta 3 veces por turno abierto. La base de comparación
  // es el snapshot diario más reciente (el del cron ~18:00); si todavía no hay ninguno
  // para la ventana actual, esta misma consulta queda guardada como nueva base (diff 0).
  app.post('/reviews/live', async (req, reply) => {
    const schema = z.object({ restaurantId: z.number().int().positive() })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantId } = result.data

    const turno = await prisma.turno.findFirst({ where: { restaurantId, estado: 'abierto' } })
    if (!turno) return reply.status(400).send({ error: 'No hay turno abierto para este restaurante' })
    if (turno.reviewChecksUsados >= 3) {
      return reply.status(429).send({ error: 'Ya usaste las 3 consultas en vivo de este turno' })
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } })
    if (!restaurant?.placeId) return reply.status(400).send({ error: 'Este restaurante no tiene placeId configurado' })

    const live = await fetchPlaceReviews(restaurant.placeId)
    if (!live) return reply.status(502).send({ error: 'No se pudo consultar Google Places' })

    // Ventana del "día" del negocio: 18:00 (Madrid) de hoy → 18:00 de mañana. Solo cuenta
    // como base un snapshot dentro de esa ventana — uno viejo (ej: de un cron caído) no cuenta.
    const ahora = new Date()
    const inicioVentana = inicioVentanaMadrid(ahora)

    const baseline = await prisma.reviewSnapshot.findFirst({
      where: { restaurantId, fecha: { gte: inicioVentana, lte: ahora } },
      orderBy: { fecha: 'desc' },
    })

    let diff: number
    let baselineFecha: string
    let esNuevaBase = false
    if (baseline) {
      diff = live.total - baseline.total
      baselineFecha = baseline.fecha.toISOString()
    } else {
      // Sin base todavía (ej: primera consulta del día) — esta consulta la establece
      const nuevaBase = await prisma.reviewSnapshot.create({
        data: { restaurantId, total: live.total, rating: live.rating },
      })
      diff = 0
      baselineFecha = nuevaBase.fecha.toISOString()
      esNuevaBase = true
    }

    const resultado = { total: live.total, rating: live.rating, diff, baselineFecha, esNuevaBase }

    const actualizado = await prisma.turno.update({
      where: { id: turno.id },
      data: { reviewChecksUsados: { increment: 1 }, reviewLastCheck: resultado },
    })

    return {
      ...resultado,
      usados: actualizado.reviewChecksUsados,
      restantes: 3 - actualizado.reviewChecksUsados,
    }
  })
}
