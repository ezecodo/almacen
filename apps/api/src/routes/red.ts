import { FastifyInstance, FastifyRequest } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { prisma } from '../server'
import { requireAdmin } from '../auth'
import { normalizarPiCodigo, onConectado, publicarConfigPi } from '../mqtt'
import { avisoDeHQ } from '../sync-hq'

// "Dónde estás": la sala de un restaurante solo se opera desde la red del local.
// El servidor aprende esa red sin que nadie la cargue: la Pi, que vive enchufada al router del
// local, manda un latido cada minuto y se anota la dirección pública desde la que llega.
// El PIN sigue siendo quién sos; la red es dónde estás.

// Una red vale una semana desde el último latido de la Pi: si la Pi se apaga un rato, el local
// sigue trabajando. No hay forma de autorizar una red a mano (decisión de Eze, 2026-10-12): la red
// la define la Pi. Si algo falla, el plan B es apagar el interruptor del local desde /admin/red.
const VIGENCIA_PI_MS = 7 * 24 * 60 * 60 * 1000

// Nginx pone la dirección del visitante en X-Real-IP (y la pisa: no se puede falsear desde fuera)
export const ipDe = (req: FastifyRequest) => String(req.headers['x-real-ip'] ?? req.ip)

interface RedDeLocal { restringido: boolean; ips: Set<string> }
// Se consulta en cada llamada de sala: caché corta en memoria, se vacía al cambiar algo
const cache = new Map<number, { hasta: number; red: RedDeLocal }>()
let hayRestringidos: { hasta: number; valor: boolean } | null = null
const olvidar = () => { cache.clear(); hayRestringidos = null }

export async function redDe(restaurantId: number): Promise<RedDeLocal | null> {
  const guardada = cache.get(restaurantId)
  if (guardada && guardada.hasta > Date.now()) return guardada.red
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { restringirPorRed: true, redes: true },
  })
  if (!r) return null
  const ahora = Date.now()
  const red = {
    restringido: r.restringirPorRed,
    ips: new Set(r.redes.filter(x => vigente(x, ahora)).map(x => x.ip)),
  }
  cache.set(restaurantId, { hasta: ahora + 20_000, red })
  return red
}

export async function algunRestringido(): Promise<boolean> {
  if (hayRestringidos && hayRestringidos.hasta > Date.now()) return hayRestringidos.valor
  const valor = (await prisma.restaurant.count({ where: { restringirPorRed: true } })) > 0
  hayRestringidos = { hasta: Date.now() + 20_000, valor }
  return valor
}

function vigente(red: { origen: string; vistaAt: Date }, ahora = Date.now()) {
  return red.origen === 'pi' && ahora - red.vistaAt.getTime() < VIGENCIA_PI_MS
}

// Le dice a la Pi vinculada a un restaurante a dónde mandar el latido (o se lo borra)
export async function anunciarLatido(restaurantId: number) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { piCodigo: true, piSecreto: true } })
  if (!r?.piCodigo || !r.piSecreto || !process.env.FRONTEND_URL) return
  publicarConfigPi(r.piCodigo, { latido_url: `${process.env.FRONTEND_URL}/api/pi/latido`, token: r.piSecreto })
}

export async function redRoutes(app: FastifyInstance) {
  // Al (re)conectar con el broker se vuelve a anunciar la config de todas las Pi vinculadas.
  // Las que se vincularon antes de existir el latido no tienen secreto: se les genera.
  onConectado(async () => {
    try {
      const vinculados = await prisma.restaurant.findMany({ where: { piCodigo: { not: null } }, select: { id: true, piSecreto: true } })
      for (const r of vinculados) {
        if (!r.piSecreto) {
          const { randomBytes } = await import('crypto')
          await prisma.restaurant.update({ where: { id: r.id }, data: { piSecreto: randomBytes(24).toString('hex') } })
        }
        await anunciarLatido(r.id)
      }
    } catch (err) {
      console.error('[red] no se pudo anunciar el latido a las Pi', err)
    }
  })

  // POST /pi/latido { codigo, token } — la Pi, cada minuto. Pública: se valida con su secreto.
  app.post('/pi/latido', async (req, reply) => {
    const body = z.object({ codigo: z.string().max(20), token: z.string().max(100) }).safeParse(req.body)
    const codigo = body.success ? normalizarPiCodigo(body.data.codigo) : null
    if (!body.success || !codigo) return reply.status(400).send({ error: 'Datos inválidos' })
    const r = await prisma.restaurant.findUnique({ where: { piCodigo: codigo }, select: { id: true, piSecreto: true } })
    const a = Buffer.from(body.data.token)
    const b = Buffer.from(r?.piSecreto ?? '')
    if (!r || !b.length || a.length !== b.length || !timingSafeEqual(a, b)) return reply.status(401).send({ error: 'No autorizado' })

    const ip = ipDe(req)
    const antes = await prisma.redLocal.findUnique({ where: { restaurantId_ip: { restaurantId: r.id, ip } } })
    await prisma.redLocal.upsert({
      where: { restaurantId_ip: { restaurantId: r.id, ip } },
      create: { restaurantId: r.id, ip, origen: 'pi' },
      update: { origen: 'pi', vistaAt: new Date(), caducaAt: null },
    })
    if (!antes || !vigente(antes)) {
      olvidar()
      console.log(`[red] la Pi ${codigo} informó una red nueva para el restaurante ${r.id}`)
    }
    return { ok: true }
  })

  // POST /suite/sincronizar — el back-office avisa de que cambió algo de este cliente (le asignó o
  // le quitó una Pi) para que se aplique ya. Pública: se valida con el secreto de la suite. No recibe
  // datos: solo dispara la consulta de siempre a HQ, que es quien dice qué hay que hacer.
  app.post('/suite/sincronizar', async (req, reply) => {
    const esperado = Buffer.from(process.env.SUITE_TOKEN ?? '')
    const recibido = Buffer.from(String(req.headers['x-suite-token'] ?? ''))
    if (!esperado.length || recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
      return reply.status(401).send({ error: 'No autorizado' })
    }
    avisoDeHQ()
    return { ok: true }
  })

  // GET /red/estado — la app de sala pregunta si está en el local (para mostrar el modo consulta)
  app.get('/red/estado', async (req) => {
    const restaurantId = req.user.restaurantId ?? null
    const red = restaurantId ? await redDe(restaurantId) : null
    return {
      restaurantId,
      restringido: red?.restringido ?? false,
      enLocal: red ? red.ips.has(ipDe(req)) : false,
    }
  })

  // ── Panel de administración ──────────────────────────────────────────────────

  app.get('/admin/red', { preHandler: requireAdmin }, async (req) => {
    const restaurantes = await prisma.restaurant.findMany({
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, piCodigo: true, restringirPorRed: true, redes: { orderBy: { vistaAt: 'desc' } } },
    })
    return {
      tuIp: ipDe(req),
      restaurantes: restaurantes.map(r => ({ ...r, redes: r.redes.map(x => ({ ...x, vigente: vigente(x) })) })),
    }
  })

  app.patch('/admin/red/:restaurantId', { preHandler: requireAdmin }, async (req, reply) => {
    const { restaurantId } = z.object({ restaurantId: z.coerce.number().int().positive() }).parse(req.params)
    const body = z.object({ restringirPorRed: z.boolean() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Datos inválidos' })
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { redes: true } })
    if (!r) return reply.status(404).send({ error: 'Restaurante no encontrado' })
    // Sin ninguna red conocida, activarlo dejaría a todo el local sin poder trabajar
    if (body.data.restringirPorRed && !r.redes.some(x => vigente(x))) {
      return reply.status(409).send({ error: 'Todavía no se conoce la red de este local: aparece sola cuando su Pi está encendida y vinculada.' })
    }
    await prisma.restaurant.update({ where: { id: restaurantId }, data: { restringirPorRed: body.data.restringirPorRed } })
    olvidar()
    return { ok: true }
  })

  app.delete('/admin/red/redes/:id', { preHandler: requireAdmin }, async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    await prisma.redLocal.deleteMany({ where: { id } })
    olvidar()
    return { ok: true }
  })
}
