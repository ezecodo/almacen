import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'
import { requireEncargado } from '../auth'

// Gastos del día: la libreta del encargado (pan, hielo, frutería, velas…). Los habituales se cargan en
// /admin/gastos y en la sala son botones (💼 → 🧾 Gastos). Cada apunte lleva cantidades (por tipo si
// el habitual los tiene: HIELO → PILE, CUBO), importe y forma de pago: 'efectivo' sale de la caja del
// turno; 'cuenta' queda pendiente hasta que se paga ("Pagar" en la sala o en el admin).
// Al cerrar el turno, Turno.totalGastos = efectivo que salió de la caja durante el turno.

const PAGOS = ['efectivo', 'cuenta'] as const
const linea = z.object({ tipo: z.string().max(60).nullable(), cantidad: z.number().min(0).max(9999) })

const apunteSchema = z.object({
  restaurantId: z.number().int().positive(),
  habitualId: z.number().int().positive().nullable().optional(),
  nombre: z.string().trim().max(80).optional(), // obligatorio si es libre
  lineas: z.array(linea).max(20).default([]),
  importe: z.number().min(0).max(100000).nullable().optional(),
  pago: z.enum(PAGOS),
})
const pagarSchema = z.object({
  importe: z.number().min(0).max(100000).nullable().optional(),
  con: z.enum(['efectivo', 'otro']).default('efectivo'),
})
const tipoSchema = z.object({ nombre: z.string().trim().min(1).max(60), precio: z.number().min(0).nullable().optional() })
const habitualSchema = z.object({
  restaurantId: z.number().int().positive().nullable().optional(), // solo al crear: null = global
  nombre: z.string().trim().min(1).max(60),
  icono: z.string().max(8).default(''),
  unidad: z.string().trim().max(30).default(''),
  precio: z.number().min(0).nullable().optional(),
  pago: z.enum(PAGOS).default('efectivo'),
  orden: z.number().int().default(0),
  tipos: z.array(tipoSchema).max(10).default([]),
})
const idParams = z.object({ id: z.coerce.number().int().positive() })
const restQuery = z.object({ restaurantId: z.coerce.number().int().positive() })

const conTipos = { tipos: { orderBy: [{ orden: 'asc' as const }, { id: 'asc' as const }] } }

// Una sesión de sala solo toca su local
function otroLocal(req: FastifyRequest, restaurantId: number) {
  return req.user.tipo === 'sala' && req.user.restaurantId !== undefined && req.user.restaurantId !== restaurantId
}

// Desde cuándo es "hoy" para la sala: la apertura del turno abierto, o las últimas 18 h
async function inicioDelTurno(restaurantId: number) {
  const turno = await prisma.turno.findFirst({ where: { restaurantId, estado: 'abierto' }, orderBy: { aperturaAt: 'desc' } })
  return turno?.aperturaAt ?? new Date(Date.now() - 18 * 3600_000)
}

// Efectivo que salió de la caja entre dos momentos: apuntes pagados en efectivo + deudas pagadas en efectivo
export async function efectivoGastado(restaurantId: number, desde: Date, hasta: Date = new Date()) {
  const [apuntes, saldados] = await Promise.all([
    prisma.gasto.aggregate({ _sum: { importe: true }, where: { restaurantId, pago: 'efectivo', createdAt: { gte: desde, lte: hasta } } }),
    prisma.gasto.aggregate({ _sum: { importe: true }, where: { restaurantId, pago: 'cuenta', pagadoCon: 'efectivo', pagadoAt: { gte: desde, lte: hasta } } }),
  ])
  return (apuntes._sum.importe ?? 0) + (saldados._sum.importe ?? 0)
}

async function pagar(req: FastifyRequest, soloLocal: boolean) {
  const { id } = idParams.parse(req.params)
  const { importe, con } = pagarSchema.parse(req.body ?? {})
  const gasto = await prisma.gasto.findUnique({ where: { id } })
  if (!gasto || (soloLocal && otroLocal(req, gasto.restaurantId))) return { status: 404, body: { error: 'Ese gasto no existe' } }
  if (gasto.pago !== 'cuenta' || gasto.pagadoAt) return { status: 409, body: { error: 'Ese gasto ya estaba pagado' } }
  const imp = importe ?? gasto.importe
  if (con === 'efectivo' && imp == null) return { status: 400, body: { error: 'Pon cuánto se pagó' } }
  const hecho = await prisma.gasto.update({
    where: { id },
    data: { importe: imp, pagadoAt: new Date(), pagadoPor: req.user.nombre, pagadoCon: con },
  })
  broadcast(gasto.restaurantId, 'gastos')
  return { status: 200, body: hecho }
}

export async function gastoRoutes(app: FastifyInstance) {
  // ── Sala (encargado) ────────────────────────────────────────────────────────────────────────
  // Los globales + los de este local
  app.get('/gastos/habituales', async req => {
    const { restaurantId } = restQuery.parse(req.query)
    return prisma.gastoHabitual.findMany({
      where: { activo: true, OR: [{ restaurantId: null }, { restaurantId }] },
      include: conTipos, orderBy: [{ restaurantId: { sort: 'asc', nulls: 'first' } }, { orden: 'asc' }, { nombre: 'asc' }],
    })
  })

  // Lo apuntado en el turno + lo que el local debe a cuenta (de cualquier día)
  app.get('/gastos', { preHandler: requireEncargado }, async (req, reply) => {
    const { restaurantId } = restQuery.parse(req.query)
    if (otroLocal(req, restaurantId)) return reply.status(403).send({ error: 'Eso es de otro local' })
    const desde = await inicioDelTurno(restaurantId)
    const [hoy, pendientes, efectivo] = await Promise.all([
      prisma.gasto.findMany({ where: { restaurantId, createdAt: { gte: desde } }, orderBy: { createdAt: 'desc' } }),
      prisma.gasto.findMany({ where: { restaurantId, pago: 'cuenta', pagadoAt: null }, orderBy: { createdAt: 'asc' } }),
      efectivoGastado(restaurantId, desde),
    ])
    return { desde, hoy, pendientes, efectivo }
  })

  app.post('/gastos', { preHandler: requireEncargado }, async (req, reply) => {
    const d = apunteSchema.parse(req.body)
    if (otroLocal(req, d.restaurantId)) return reply.status(403).send({ error: 'Eso es de otro local' })
    let nombre = d.nombre ?? ''
    if (d.habitualId) {
      const h = await prisma.gastoHabitual.findUnique({ where: { id: d.habitualId } })
      if (!h) return reply.status(404).send({ error: 'Ese gasto habitual ya no existe' })
      nombre = h.nombre
    }
    if (!nombre) return reply.status(400).send({ error: 'Escribe qué es' })
    if (d.pago === 'efectivo' && d.importe == null) return reply.status(400).send({ error: 'Pon cuánto se pagó' })
    const gasto = await prisma.gasto.create({ data: {
      restaurantId: d.restaurantId, habitualId: d.habitualId ?? null, nombre: nombre.toUpperCase(),
      lineas: d.lineas.filter(l => l.cantidad > 0), importe: d.importe ?? null, pago: d.pago, creadoPor: req.user.nombre,
    } })
    broadcast(d.restaurantId, 'gastos')
    return reply.status(201).send(gasto)
  })

  // Borrar un apunte equivocado: la sala solo los de su turno y sin pagar después
  app.delete('/gastos/:id', { preHandler: requireEncargado }, async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const gasto = await prisma.gasto.findUnique({ where: { id } })
    if (!gasto || otroLocal(req, gasto.restaurantId)) return reply.status(404).send({ error: 'Ese gasto no existe' })
    if (req.user.tipo !== 'admin') {
      if (gasto.createdAt < await inicioDelTurno(gasto.restaurantId)) return reply.status(409).send({ error: 'Es de otro turno: se borra desde el admin' })
      if (gasto.pagadoAt) return reply.status(409).send({ error: 'Ya se pagó: se borra desde el admin' })
    }
    await prisma.gasto.delete({ where: { id } })
    broadcast(gasto.restaurantId, 'gastos')
    return { ok: true }
  })

  app.patch('/gastos/:id/pagar', { preHandler: requireEncargado }, async (req, reply) => {
    const r = await pagar(req, true)
    return reply.status(r.status).send(r.body)
  })

  // ── Admin ───────────────────────────────────────────────────────────────────────────────────
  // Sin restaurantId: solo los globales. Con él: globales + los de ese local
  app.get('/admin/gastos/habituales', async req => {
    const { restaurantId } = z.object({ restaurantId: z.coerce.number().int().positive().optional() }).parse(req.query)
    return prisma.gastoHabitual.findMany({
      where: { activo: true, OR: [{ restaurantId: null }, ...(restaurantId ? [{ restaurantId }] : [])] },
      include: { ...conTipos, _count: { select: { gastos: true } } },
      orderBy: [{ restaurantId: { sort: 'asc', nulls: 'first' } }, { orden: 'asc' }, { nombre: 'asc' }],
    })
  })

  app.post('/admin/gastos/habituales', async (req, reply) => {
    const { tipos, ...d } = habitualSchema.parse(req.body)
    const h = await prisma.gastoHabitual.create({
      data: { ...d, restaurantId: d.restaurantId ?? null, nombre: d.nombre.toUpperCase(), tipos: { create: tipos.map((t, i) => ({ nombre: t.nombre.toUpperCase(), precio: t.precio ?? null, orden: i })) } },
      include: conTipos,
    })
    return reply.status(201).send(h)
  })

  // Reemplaza los tipos enteros (los apuntes viejos guardan el nombre del tipo, no su id)
  app.put('/admin/gastos/habituales/:id', async req => {
    const { id } = idParams.parse(req.params)
    const { tipos, restaurantId: _, ...d } = habitualSchema.parse(req.body) // el ámbito no se cambia al editar
    return prisma.$transaction(async tx => {
      await tx.gastoTipo.deleteMany({ where: { habitualId: id } })
      return tx.gastoHabitual.update({
        where: { id },
        data: { ...d, nombre: d.nombre.toUpperCase(), tipos: { create: tipos.map((t, i) => ({ nombre: t.nombre.toUpperCase(), precio: t.precio ?? null, orden: i })) } },
        include: conTipos,
      })
    })
  })

  // Con apuntes se desactiva (desaparece de la sala); sin apuntes se borra
  app.delete('/admin/gastos/habituales/:id', async req => {
    const { id } = idParams.parse(req.params)
    const usados = await prisma.gasto.count({ where: { habitualId: id } })
    if (usados) await prisma.gastoHabitual.update({ where: { id }, data: { activo: false } })
    else await prisma.gastoHabitual.delete({ where: { id } })
    return { ok: true }
  })

  app.get('/admin/gastos', async req => {
    const q = z.object({
      restaurantId: z.coerce.number().int().positive().optional(),
      mes: z.string().regex(/^\d{4}-\d{2}$/),
    }).parse(req.query)
    const [y, m] = q.mes.split('-').map(Number)
    const desde = new Date(Date.UTC(y, m - 1, 1)), hasta = new Date(Date.UTC(y, m, 1))
    const where = q.restaurantId ? { restaurantId: q.restaurantId } : {}
    const [gastos, pendientes] = await Promise.all([
      prisma.gasto.findMany({ where: { ...where, createdAt: { gte: desde, lt: hasta } }, orderBy: { createdAt: 'desc' }, include: { restaurant: { select: { nombre: true } } } }),
      prisma.gasto.findMany({ where: { ...where, pago: 'cuenta', pagadoAt: null }, orderBy: { createdAt: 'asc' }, include: { restaurant: { select: { nombre: true } } } }),
    ])
    return { gastos, pendientes }
  })

  app.patch('/admin/gastos/:id/pagar', async (req, reply) => {
    const r = await pagar(req, false)
    return reply.status(r.status).send(r.body)
  })

  app.delete('/admin/gastos/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const gasto = await prisma.gasto.findUnique({ where: { id } })
    if (!gasto) return reply.status(404).send({ error: 'Ese gasto no existe' })
    await prisma.gasto.delete({ where: { id } })
    broadcast(gasto.restaurantId, 'gastos')
    return { ok: true }
  })
}
