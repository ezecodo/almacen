import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import type { Mesa } from '@prisma/client'
import { broadcast } from '../sse'
import { diaDeServicio } from '../dia-servicio'

const TIPOS_MESA = ['round', 'square', 'rectangular', 'barra', 'silla_alta', 'pared', 'columna', 'ventana', 'entrada'] as const

const mesaSchema = z.object({
  numero:    z.number().int().min(0),
  tipo:      z.enum(TIPOS_MESA),
  x:         z.number(),
  y:         z.number(),
  capacidad: z.number().int().min(0),
  rotacion:  z.number().int().optional().default(0),
  ancho:     z.number().int().positive().optional(),
  alto:      z.number().int().positive().optional(),
})

const updateMesaSchema = z.object({
  numero:    z.number().int().min(0).optional(),
  tipo:      z.enum(TIPOS_MESA).optional(),
  x:         z.number().optional(),
  y:         z.number().optional(),
  capacidad: z.number().int().min(0).optional(),
  rotacion:  z.number().int().optional(),
  ancho:     z.number().int().positive().optional(),
  alto:      z.number().int().positive().optional(),
})

const batchSchema = z.array(z.object({
  id: z.number().int().positive(),
  x:  z.number(),
  y:  z.number(),
}))

// ── Mesas que se separan ─────────────────────────────────────────────────────────────────────
// La 2 del mapa son la 2 y la 3 juntas: la 3 es otra fila (parteDeId = la 2) que solo aparece
// cuando se separan. Separadas, las dos mitades se dibujan partiendo el sitio de la mesa entera por
// su lado largo, así no hay que dibujarlas aparte en el admin. Mismas medidas que el mapa de la sala.
const SQUARE_SIZE = 80, RECT_W = 160, RECT_H = 80, HUECO = 6
const TIPOS_SEPARABLES = ['round', 'square', 'rectangular']

type MesaConMitad = Mesa & { mitad: Mesa | null }
export type MesaVista = Mesa & { separable?: boolean; pareja?: number }

function partir(entera: Mesa, mitad: Mesa): [MesaVista, MesaVista] {
  const rect = entera.tipo === 'rectangular'
  const w = rect ? entera.ancho ?? RECT_W : entera.ancho ?? SQUARE_SIZE
  const h = rect ? entera.alto ?? RECT_H : entera.ancho ?? SQUARE_SIZE
  const deLado = w >= h
  const mw = deLado ? (w - HUECO) / 2 : w
  const mh = deLado ? h : (h - HUECO) / 2
  const desp = ((deLado ? w : h) + HUECO) / 4
  const rad = (entera.rotacion * Math.PI) / 180
  const cx = entera.x + w / 2, cy = entera.y + h / 2
  const forma = (m: Mesa, signo: number, capacidad: number, pareja: number): MesaVista => {
    const dx = deLado ? signo * desp : 0, dy = deLado ? 0 : signo * desp
    const centroX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
    const centroY = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    const redonda = entera.tipo === 'round'
    const lado = Math.round(Math.min(mw, mh))
    const cuadrada = redonda || Math.abs(mw - mh) < 1
    const ancho = cuadrada ? lado : Math.round(mw)
    const alto = cuadrada ? lado : Math.round(mh)
    return {
      ...m, floorPlanId: entera.floorPlanId, rotacion: entera.rotacion, capacidad,
      tipo: redonda ? 'round' : cuadrada ? 'square' : 'rectangular',
      ancho, alto, x: centroX - ancho / 2, y: centroY - alto / 2,
      separada: true, pareja,
    }
  }
  // La mesa entera se queda con la mitad de arriba o de la izquierda (ya girada): así el mapa sigue
  // en orden (1, 2, 3, 4) aunque la mesa esté rotada
  const ox = deLado ? -desp * Math.cos(rad) : desp * Math.sin(rad)
  const oy = deLado ? -desp * Math.sin(rad) : -desp * Math.cos(rad)
  const primera = (Math.abs(ox) > Math.abs(oy) ? ox : oy) <= 0 ? -1 : 1
  return [
    forma(entera, primera, Math.max(1, entera.capacidad - mitad.capacidad), mitad.numero),
    forma(mitad, -primera, mitad.capacidad, entera.numero),
  ]
}

// Las mesas tal como están ahora: juntas (la entera, con su pareja escondida) o las dos mitades
function mesasVisibles(mesas: MesaConMitad[]): MesaVista[] {
  const r: MesaVista[] = []
  for (const { mitad, ...m } of mesas) {
    if (m.parteDeId) continue // sale con su mesa entera
    if (!mitad) { r.push(m); continue }
    if (m.separada) r.push(...partir(m, mitad))
    else r.push({ ...m, separable: true, pareja: mitad.numero })
  }
  return r.sort((a, b) => a.numero - b.numero)
}

const OCUPADA = ['abierta', 'enviada', 'facturada']
const ocupadas = (ids: number[]) => prisma.comanda.count({ where: { mesaId: { in: ids }, estado: { in: OCUPADA } } })

// Junta una mesa separada: las reservas que esperaban la otra mitad pasan a la mesa entera
async function juntar(entera: Mesa, mitadId: number) {
  await prisma.$transaction([
    prisma.reserva.updateMany({
      where: { mesaId: mitadId, estado: 'confirmada', fecha: { gte: new Date(diaDeServicio() + 'T00:00:00.000Z') } },
      data: { mesaId: entera.id },
    }),
    prisma.mesa.update({ where: { id: entera.id }, data: { separada: false } }),
  ])
}

// Al cerrar el turno: las mesas que quedaron separadas y libres vuelven a juntarse
export async function juntarMesasLibres(restaurantId: number) {
  const separadas = await prisma.mesa.findMany({
    where: { separada: true, floorPlan: { restaurantId } }, include: { mitad: true },
  })
  let n = 0
  for (const m of separadas) {
    if (!m.mitad || await ocupadas([m.id, m.mitad.id])) continue
    await juntar(m, m.mitad.id)
    n++
  }
  if (n) broadcast(restaurantId, 'salon')
  return n
}

export async function salonRoutes(app: FastifyInstance) {

  // Listar planos de un restaurante
  app.get('/salon', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const { editar } = req.query as { editar?: string }
    const planes = await prisma.floorPlan.findMany({
      where: { restaurantId: Number(restaurantId) },
      include: { mesas: { orderBy: { numero: 'asc' }, include: { mitad: true } } },
      orderBy: { createdAt: 'asc' },
    })
    // El editor del admin ve las filas tal cual (la mitad escondida va dentro de su mesa)
    if (editar) return planes.map(p => ({ ...p, mesas: p.mesas.filter(m => !m.parteDeId) }))
    return planes.map(p => ({ ...p, mesas: mesasVisibles(p.mesas) }))
  })

  // Mesa de la sesión de sala: tiene que ser del local donde está el dispositivo
  async function enteraDe(req: { user: { tipo: string; restaurantId?: number } }, id: number) {
    const m = await prisma.mesa.findUnique({ where: { id }, include: { floorPlan: true } })
    if (!m) return { ok: false as const, error: 404, msg: 'Mesa no encontrada' }
    const entera = m.parteDeId
      ? await prisma.mesa.findUnique({ where: { id: m.parteDeId }, include: { floorPlan: true, mitad: true } })
      : await prisma.mesa.findUnique({ where: { id }, include: { floorPlan: true, mitad: true } })
    if (!entera?.mitad) return { ok: false as const, error: 409, msg: 'Esta mesa no se puede separar' }
    if (req.user.tipo === 'sala' && req.user.restaurantId !== entera.floorPlan.restaurantId) {
      return { ok: false as const, error: 403, msg: 'La mesa es de otro local' }
    }
    return { ok: true as const, entera, mitad: entera.mitad }
  }

  // Separar la 2 en la 2 y la 3 (cualquier camarero, con la mesa libre)
  app.patch('/salon/mesas/:id/separar', async (req, reply) => {
    const r = await enteraDe(req, Number((req.params as { id: string }).id))
    if (!r.ok) return reply.status(r.error).send({ error: r.msg })
    if (r.entera.separada) return { ok: true }
    if (await ocupadas([r.entera.id])) return reply.status(409).send({ error: `La ${r.entera.numero} tiene gente: libérala antes de separarla` })
    await prisma.mesa.update({ where: { id: r.entera.id }, data: { separada: true } })
    broadcast(r.entera.floorPlan.restaurantId, 'salon')
    return { ok: true }
  })

  // Volver a juntarlas (las dos libres)
  app.patch('/salon/mesas/:id/juntar', async (req, reply) => {
    const r = await enteraDe(req, Number((req.params as { id: string }).id))
    if (!r.ok) return reply.status(r.error).send({ error: r.msg })
    if (!r.entera.separada) return { ok: true }
    if (await ocupadas([r.entera.id, r.mitad.id])) {
      return reply.status(409).send({ error: `Para juntarlas, la ${r.entera.numero} y la ${r.mitad.numero} tienen que estar libres` })
    }
    await juntar(r.entera, r.mitad.id)
    broadcast(r.entera.floorPlan.restaurantId, 'salon')
    broadcast(r.entera.floorPlan.restaurantId, 'update') // reservas que pasaron a la mesa entera
    return { ok: true }
  })

  // Admin: hacer separable una mesa (o cambiar el número / los pax de la otra mitad)
  app.put('/salon/mesas/:id/mitad', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z.object({ numero: z.number().int().min(0), capacidad: z.number().int().min(1) }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const entera = await prisma.mesa.findUnique({ where: { id }, include: { floorPlan: true, mitad: true } })
    if (!entera || entera.parteDeId) return reply.status(404).send({ error: 'Mesa no encontrada' })
    if (!TIPOS_SEPARABLES.includes(entera.tipo)) return reply.status(400).send({ error: 'Solo se separan mesas redondas, cuadradas o rectangulares' })
    if (body.data.capacidad >= entera.capacidad) {
      return reply.status(400).send({ error: `La otra mitad tiene que tener menos de ${entera.capacidad} pax` })
    }
    const repetida = await prisma.mesa.findFirst({
      where: { numero: body.data.numero, floorPlan: { restaurantId: entera.floorPlan.restaurantId }, id: { not: entera.mitad?.id ?? -1 } },
    })
    if (repetida) return reply.status(409).send({ error: `Ya hay una mesa ${body.data.numero} en este local` })
    const mitad = entera.mitad
      ? await prisma.mesa.update({ where: { id: entera.mitad.id }, data: body.data })
      : await prisma.mesa.create({
          data: { ...body.data, floorPlanId: entera.floorPlanId, parteDeId: entera.id, tipo: 'square', x: entera.x, y: entera.y },
        })
    broadcast(entera.floorPlan.restaurantId, 'salon')
    return mitad
  })

  // Admin: que deje de ser separable (borra la otra mitad)
  app.delete('/salon/mesas/:id/mitad', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const entera = await prisma.mesa.findUnique({ where: { id }, include: { floorPlan: true, mitad: true } })
    if (!entera?.mitad) return reply.status(204).send()
    const mitadId = entera.mitad.id
    if (await prisma.comanda.count({ where: { mesaId: mitadId, estado: { not: 'cerrada' } } })) {
      return reply.status(409).send({ error: `La ${entera.mitad.numero} tiene una mesa sin cobrar` })
    }
    await juntar(entera, mitadId)
    await prisma.$transaction([
      prisma.comanda.updateMany({ where: { mesaId: mitadId }, data: { mesaId: null } }),
      prisma.reserva.updateMany({ where: { mesaId: mitadId }, data: { mesaId: null } }),
      prisma.mesa.delete({ where: { id: mitadId } }),
    ])
    broadcast(entera.floorPlan.restaurantId, 'salon')
    return reply.status(204).send()
  })

  // Crear plano
  app.post('/salon', async (req, reply) => {
    const { restaurantId, nombre } = req.body as { restaurantId: number; nombre: string }
    if (!restaurantId || !nombre) return reply.status(400).send({ error: 'restaurantId y nombre requeridos' })

    const plan = await prisma.floorPlan.create({
      data: { restaurantId, nombre },
      include: { mesas: true },
    })
    return reply.status(201).send(plan)
  })

  // Renombrar plano
  app.put('/salon/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { nombre } = req.body as { nombre: string }
    if (!nombre) return reply.status(400).send({ error: 'nombre requerido' })

    const plan = await prisma.floorPlan.update({ where: { id }, data: { nombre }, include: { mesas: true } })
    return plan
  })

  // Eliminar plano (en cascada elimina mesas)
  app.delete('/salon/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.floorPlan.delete({ where: { id } })
    return reply.status(204).send()
  })

  // Añadir mesa
  app.post('/salon/:id/mesas', async (req, reply) => {
    const floorPlanId = Number((req.params as { id: string }).id)
    const result = mesaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const mesa = await prisma.mesa.create({ data: { ...result.data, floorPlanId } })
    return reply.status(201).send(mesa)
  })

  // Actualizar mesa (posición, capacidad, tipo, número)
  app.put('/salon/:id/mesas/:mesaId', async (req, reply) => {
    const mesaId = Number((req.params as { id: string; mesaId: string }).mesaId)
    const result = updateMesaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const mesa = await prisma.mesa.update({ where: { id: mesaId }, data: result.data })
    return mesa
  })

  // Eliminar mesa
  app.delete('/salon/:id/mesas/:mesaId', async (req, reply) => {
    const mesaId = Number((req.params as { id: string; mesaId: string }).mesaId)
    const activas = await prisma.comanda.count({
      where: { mesaId, estado: { notIn: ['cerrada'] } },
    })
    if (activas > 0) {
      return reply.status(409).send({ error: 'La mesa tiene comandas activas y no se puede eliminar' })
    }
    // Si se separa, su otra mitad se va con ella
    const mitad = await prisma.mesa.findUnique({ where: { parteDeId: mesaId } })
    const ids = mitad ? [mesaId, mitad.id] : [mesaId]
    if (mitad && await prisma.comanda.count({ where: { mesaId: mitad.id, estado: { notIn: ['cerrada'] } } })) {
      return reply.status(409).send({ error: `La ${mitad.numero} (su otra mitad) tiene comandas activas` })
    }
    // Desvincular comandas cerradas históricas antes de eliminar
    await prisma.comanda.updateMany({ where: { mesaId: { in: ids } }, data: { mesaId: null } })
    await prisma.reserva.updateMany({ where: { mesaId: { in: ids } }, data: { mesaId: null } })
    await prisma.mesa.delete({ where: { id: mesaId } })
    return reply.status(204).send()
  })

  // Guardar posiciones en batch (drag-and-drop)
  app.patch('/salon/:id/mesas', async (req, reply) => {
    const result = batchSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    await Promise.all(
      result.data.map(({ id, x, y }) => prisma.mesa.update({ where: { id }, data: { x, y } }))
    )
    return { ok: true }
  })
}
