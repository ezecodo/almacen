import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import type { Mesa, Prisma } from '@prisma/client'
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
const SQUARE_SIZE = 80, RECT_W = 160, RECT_H = 80, HUECO = 10, MIN_MITAD = 60 // el hueco de la rejilla del editor: una mesa "Doble" se parte en dos del tamaño base
const TIPOS_SEPARABLES = ['round', 'square', 'rectangular']

type MesaConMitad = Mesa & { mitad: Mesa | null }
export type MesaVista = Mesa & { separable?: boolean; pareja?: number; paxPareja?: number; idPareja?: number }

// lado: el de las mesas normales de esos pax en el mismo salón (Eze: separadas tienen que verse
// como las de 2). Sin ninguna de referencia, cada mitad es media mesa entera.
function partir(entera: Mesa, mitad: Mesa, lado?: number): [MesaVista, MesaVista] {
  const rect = entera.tipo === 'rectangular'
  const w = rect ? entera.ancho ?? RECT_W : entera.ancho ?? SQUARE_SIZE
  const h = rect ? entera.alto ?? RECT_H : entera.ancho ?? SQUARE_SIZE
  const deLado = w > h // cuadrada: una encima de la otra
  // Media mesa redonda o cuadrada queda diminuta (una redonda de 80 → dos de 35, sin sitio para el
  // número): entonces cada mitad toma un tamaño mínimo y salen del sitio de la entera
  if (!lado && Math.min(deLado ? (w - HUECO) / 2 : w, deLado ? h : (h - HUECO) / 2) < MIN_MITAD) lado = MIN_MITAD
  const mw = lado ?? (deLado ? (w - HUECO) / 2 : w)
  const mh = lado ?? (deLado ? h : (h - HUECO) / 2)
  const desp = lado ? (lado + HUECO) / 2 : ((deLado ? w : h) + HUECO) / 4
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

// El tamaño más repetido entre las mesas sueltas de esos pax del salón (cuadradas, o redondas si
// la que se parte es redonda)
function ladoDe(mesas: MesaConMitad[], capacidad: number, tipo: 'square' | 'round') {
  const n = new Map<number, number>()
  for (const m of mesas) {
    if (m.parteDeId || m.mitad || m.tipo !== tipo || m.capacidad !== capacidad) continue
    const l = m.ancho ?? SQUARE_SIZE
    n.set(l, (n.get(l) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// Las mesas tal como están ahora: juntas (la entera, con su pareja escondida) o las dos mitades
// (mesas: las de un mismo salón)
function mesasVisibles(mesas: MesaConMitad[]): MesaVista[] {
  const r: MesaVista[] = []
  for (const { mitad, ...m } of mesas) {
    if (m.parteDeId) continue // sale con su mesa entera
    if (!mitad) { r.push(m); continue }
    // Redonda sin redondas de esos pax en el salón: del tamaño de las cuadradas de esos pax
    const lado = (m.tipo === 'round' ? ladoDe(mesas, mitad.capacidad, 'round') : undefined) ?? ladoDe(mesas, mitad.capacidad, 'square')
    if (m.separada) r.push(...partir(m, mitad, lado))
    else r.push({ ...m, separable: true, pareja: mitad.numero, paxPareja: mitad.capacidad, idPareja: mitad.id })
  }
  return r.sort((a, b) => a.numero - b.numero)
}

const OCUPADA = ['abierta', 'enviada', 'facturada']
const ocupadas = (ids: number[]) => prisma.comanda.count({ where: { mesaId: { in: ids }, estado: { in: OCUPADA } } })

// Junta una mesa separada. Las reservas de la otra mitad se quedan en ella (el plano de reservas
// las enseña dentro de la mesa junta, y al sentarlas se vuelve a separar)
async function juntar(entera: Mesa) {
  await prisma.mesa.update({ where: { id: entera.id }, data: { separada: false } })
}

// Al abrir la mesa entera con los pax de una mitad (1 o 2 en una de 4), se separa: la gente se
// queda en esta y la otra mitad aparece libre al lado. Con más pax se abre entera.
// enPareja: llegaron primero los de la otra mitad (la 3) → se quedan ellos y la 2 queda libre.
// Devuelve en qué mesa se abre y si se separó (el aviso 'salon' va después de guardar).
// mesaId puede ser la 3 escondida (una reserva asignada a la 3): es lo mismo que enPareja.
// Con gente en la mesa junta no se separa nada.
export async function separarAlAbrir(tx: Prisma.TransactionClient, mesaId: number, pax: number, enPareja = false) {
  let m = await tx.mesa.findUnique({ where: { id: mesaId }, include: { mitad: true } })
  if (m?.parteDeId) {
    m = await tx.mesa.findUnique({ where: { id: m.parteDeId }, include: { mitad: true } })
    if (!m || m.separada) return { mesaId, separada: false } // ya separadas: la 3 se ve sola
    enPareja = true
  }
  if (!m?.mitad || m.separada) return { mesaId, separada: false }
  if (await tx.comanda.count({ where: { mesaId: m.id, estado: { in: OCUPADA } } })) return { mesaId: m.id, separada: false }
  const pareja = enPareja && pax <= m.mitad.capacidad
  if (!pareja && pax > Math.max(1, m.capacidad - m.mitad.capacidad)) return { mesaId, separada: false }
  await tx.mesa.update({ where: { id: m.id }, data: { separada: true } })
  return { mesaId: pareja ? m.mitad.id : mesaId, separada: true }
}

// Cuando las dos mitades quedan libres (y al cerrar el turno), vuelven a juntarse
export async function juntarMesasLibres(restaurantId: number) {
  const separadas = await prisma.mesa.findMany({
    where: { separada: true, floorPlan: { restaurantId } }, include: { mitad: true },
  })
  let n = 0
  for (const m of separadas) {
    if (!m.mitad || await ocupadas([m.id, m.mitad.id])) continue
    await juntar(m)
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
    await juntar(entera)
    await prisma.$transaction([
      // Las reservas por llegar de la mitad que desaparece pasan a la mesa entera
      prisma.reserva.updateMany({
        where: { mesaId: mitadId, estado: 'confirmada', fecha: { gte: new Date(diaDeServicio() + 'T00:00:00.000Z') } },
        data: { mesaId: entera.id },
      }),
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
