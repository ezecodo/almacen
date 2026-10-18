import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { appendPropinaToSheet, appendRestauranteToSheet, clearRemovedTurnosFromSheet } from '../sheets'

const createSchema = z.object({
  restaurantId: z.number().int().positive(),
  fecha:        z.string(), // ISO date string
  efectivo:     z.number().min(0).default(0),
  tarjeta:      z.number().min(0).default(0),
  turnoId:      z.number().int().positive().optional(),
  turnos: z.array(z.object({
    empleadoId: z.number().int().positive(),
    horas:      z.number().positive().max(24).default(8),
  })).min(1),
})

const updateSchema = z.object({
  efectivo: z.number().min(0).default(0),
  tarjeta:  z.number().min(0).default(0),
  turnos: z.array(z.object({
    empleadoId: z.number().int().positive(),
    horas:      z.number().positive().max(24).default(8),
  })).min(1),
})

const filtersSchema = z.object({
  restaurantId: z.coerce.number().optional(),
  desde:        z.string().optional(),
  hasta:        z.string().optional(),
  page:         z.coerce.number().default(1),
  limit:        z.coerce.number().default(30),
})

type Reparto = z.infer<typeof updateSchema>

async function crearPropina(datos: z.infer<typeof createSchema>) {
  const { restaurantId, fecha, efectivo, tarjeta, turnos } = datos
  const total = efectivo + tarjeta
  const totalHoras = turnos.reduce((sum, t) => sum + t.horas, 0)

  const propinaDia = await prisma.propinaDia.create({
    data: {
      restaurantId,
      fecha:    new Date(fecha),
      efectivo,
      tarjeta,
      total,
      turnoId: datos.turnoId ?? undefined,
      turnos: {
        create: turnos.map((t) => ({
          empleadoId: t.empleadoId,
          horas:      t.horas,
          propina:    Math.round((total * (t.horas / totalHoras)) * 100) / 100,
        })),
      },
    },
    include: {
      restaurant: true,
      turnos: { include: { empleado: true } },
    },
  })

  appendPropinaToSheet(propinaDia)
  appendRestauranteToSheet(propinaDia)
  return propinaDia
}

// Recalcula y reescribe sheets. null si no existe.
async function actualizarPropina(id: number, { efectivo, tarjeta, turnos }: Reparto) {
  const total = efectivo + tarjeta
  const totalHoras = turnos.reduce((s, t) => s + t.horas, 0)

  // Fetch old propina with turnos BEFORE deleting (to know which employees to clear in sheets)
  const oldPropina = await prisma.propinaDia.findUnique({
    where: { id },
    include: { restaurant: true, turnos: { include: { empleado: true } } },
  })
  if (!oldPropina) return null

  const newEmpleadoIds = new Set(turnos.map(t => t.empleadoId))
  const removedTurnos = oldPropina.turnos.filter(t => !newEmpleadoIds.has(t.empleadoId))

  await prisma.propinaTurno.deleteMany({ where: { propinaDiaId: id } })

  const updated = await prisma.propinaDia.update({
    where: { id },
    data: {
      efectivo,
      tarjeta,
      total,
      turnos: {
        create: turnos.map((t) => ({
          empleadoId: t.empleadoId,
          horas:      t.horas,
          propina:    Math.round((total * (t.horas / totalHoras)) * 100) / 100,
        })),
      },
    },
    include: {
      restaurant: true,
      turnos: { include: { empleado: true } },
    },
  })

  // First clear removed employees, then write updated data
  clearRemovedTurnosFromSheet(updated, removedTurnos)
  appendPropinaToSheet(updated)
  appendRestauranteToSheet(updated)
  return updated
}

export async function propinaRoutes(app: FastifyInstance) {

  // ── Reparto desde la app de sala (el encargado, en su teléfono) ──
  // Solo turnos cerrados de SU local (el de la sesión). Se puede repartir y corregir desde donde
  // esté (va en CONSULTA_ENCARGADO): pasa a menudo al llegar a casa o al día siguiente.
  const localDeSesion = (req: { user: { restaurantId?: number } }) => req.user.restaurantId ?? null

  app.get('/propinas/encargado/turnos', async (req, reply) => {
    const rid = localDeSesion(req)
    if (!rid) return reply.status(403).send({ error: 'Vuelve a entrar con tu PIN' })
    const hace = new Date(Date.now() - 21 * 24 * 3600_000)
    return prisma.turno.findMany({
      where: { restaurantId: rid, estado: 'cerrado', cierreAt: { gte: hace } },
      orderBy: { cierreAt: 'desc' },
      take: 30,
      select: {
        id: true, encargadoNombre: true, aperturaAt: true, cierreAt: true, totalPropinas: true, totalVentas: true,
        propina: { select: { id: true, efectivo: true, tarjeta: true, total: true,
          turnos: { select: { empleadoId: true, horas: true, propina: true, empleado: { select: { nombre: true, tipo: true } } } } } },
      },
    })
  })

  // Para picar quién trabajó: solo nombre y tipo (la ficha entera es de administración)
  app.get('/propinas/encargado/empleados', async () => {
    return prisma.empleado.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, tipo: true },
      orderBy: { nombre: 'asc' },
    })
  })

  // Cuánto lleva cada empleado en un período (el de la hoja: 25 → 24), solo en este local
  app.get('/propinas/encargado/resumen', async (req, reply) => {
    const rid = localDeSesion(req)
    if (!rid) return reply.status(403).send({ error: 'Vuelve a entrar con tu PIN' })
    const { desde, hasta } = req.query as { desde?: string; hasta?: string }
    if (!desde || !hasta) return reply.status(400).send({ error: 'desde y hasta requeridos' })
    const fin = new Date(hasta); fin.setUTCDate(fin.getUTCDate() + 1)
    const filas = await prisma.propinaTurno.findMany({
      where: { propinaDia: { restaurantId: rid, fecha: { gte: new Date(desde), lt: fin } } },
      select: { empleadoId: true, horas: true, propina: true, empleado: { select: { nombre: true, tipo: true } } },
    })
    const mapa = new Map<number, { empleadoId: number; nombre: string; tipo: string; horas: number; propina: number; turnos: number }>()
    for (const f of filas) {
      const p = mapa.get(f.empleadoId) ?? { empleadoId: f.empleadoId, nombre: f.empleado.nombre, tipo: f.empleado.tipo, horas: 0, propina: 0, turnos: 0 }
      p.horas += f.horas; p.propina = Math.round((p.propina + f.propina) * 100) / 100; p.turnos += 1
      mapa.set(f.empleadoId, p)
    }
    const empleados = [...mapa.values()].sort((a, b) => b.propina - a.propina)
    return { empleados, total: Math.round(empleados.reduce((s, e) => s + e.propina, 0) * 100) / 100 }
  })

  // Repartir (o corregir el reparto de) un turno cerrado del local
  app.put('/propinas/encargado/turnos/:turnoId', async (req, reply) => {
    const rid = localDeSesion(req)
    if (!rid) return reply.status(403).send({ error: 'Vuelve a entrar con tu PIN' })
    const turnoId = Number((req.params as { turnoId: string }).turnoId)
    const result = updateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    if (result.data.efectivo + result.data.tarjeta <= 0) return reply.status(400).send({ error: 'No hay nada que repartir' })

    const turno = await prisma.turno.findUnique({ where: { id: turnoId }, include: { propina: true } })
    if (!turno || turno.restaurantId !== rid) return reply.status(404).send({ error: 'Turno no encontrado' })
    if (turno.estado !== 'cerrado') return reply.status(409).send({ error: 'Primero hay que cerrar el turno' })

    if (turno.propina) return actualizarPropina(turno.propina.id, result.data)
    return reply.status(201).send(await crearPropina({
      restaurantId: rid,
      fecha: (turno.cierreAt ?? turno.aperturaAt).toISOString().slice(0, 10),
      turnoId,
      ...result.data,
    }))
  })

  // Crear propina del día
  app.post('/propinas', async (req, reply) => {
    const result = createSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    return reply.status(201).send(await crearPropina(result.data))
  })

  // Listar propinas con filtros
  app.get('/propinas', async (req, reply) => {
    const result = filtersSchema.safeParse(req.query)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { restaurantId, desde, hasta, page, limit } = result.data
    const where: any = {}
    if (restaurantId) where.restaurantId = restaurantId
    if (desde || hasta) {
      where.fecha = {}
      if (desde) where.fecha.gte = new Date(desde)
      if (hasta) where.fecha.lte = new Date(hasta)
    }

    const [propinas, total] = await Promise.all([
      prisma.propinaDia.findMany({
        where,
        include: { restaurant: true, turnos: { include: { empleado: true } } },
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.propinaDia.count({ where }),
    ])

    return { propinas, total, page, limit, pages: Math.ceil(total / limit) }
  })

  // Detalle de una propina
  app.get('/propinas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const propina = await prisma.propinaDia.findUnique({
      where: { id },
      include: { restaurant: true, turnos: { include: { empleado: true } } },
    })
    if (!propina) return reply.status(404).send({ error: 'No encontrado' })
    return propina
  })

  // Actualizar propina (recalcula y reescribe sheets)
  app.patch('/propinas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = updateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const updated = await actualizarPropina(id, result.data)
    if (!updated) return reply.status(404).send({ error: 'Propina no encontrada' })
    return updated
  })

  // Eliminar propina
  app.delete('/propinas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.propinaTurno.deleteMany({ where: { propinaDiaId: id } })
    await prisma.propinaDia.delete({ where: { id } })
    return reply.status(204).send()
  })

  // Turnos personales de un empleado (para vista "Mis propinas")
  app.get('/propinas/mis-turnos', async (req, reply) => {
    const { empleadoId, desde, hasta } = req.query as { empleadoId?: string; desde?: string; hasta?: string }
    if (!empleadoId) return reply.status(400).send({ error: 'empleadoId requerido' })
    // Cada empleado ve solo las suyas
    if (req.user.tipo === 'sala' && req.user.empleadoId !== Number(empleadoId)) {
      return reply.status(403).send({ error: 'No tienes permiso para esto' })
    }

    const where: any = { empleadoId: Number(empleadoId) }
    if (desde || hasta) {
      where.propinaDia = { fecha: {} }
      if (desde) where.propinaDia.fecha.gte = new Date(desde)
      if (hasta) where.propinaDia.fecha.lte = new Date(hasta)
    }

    const turnos = await prisma.propinaTurno.findMany({
      where,
      include: {
        propinaDia: {
          include: { restaurant: true },
        },
      },
      orderBy: { propinaDia: { fecha: 'desc' } },
    })

    return turnos.map(t => ({
      id:          t.id,
      fecha:       t.propinaDia.fecha,
      restaurante: t.propinaDia.restaurant.nombre,
      horas:       t.horas,
      propina:     t.propina,
      efectivo:    t.propinaDia.efectivo,
      tarjeta:     t.propinaDia.tarjeta,
      totalDia:    t.propinaDia.total,
    }))
  })

  // Resumen mensual por empleado
  app.get('/propinas/resumen/empleados', async (req, reply) => {
    const { mes, restaurantId } = req.query as { mes?: string; restaurantId?: string }

    const fecha = mes ? new Date(mes) : new Date()
    const desde = new Date(fecha.getFullYear(), fecha.getMonth(), 1)
    const hasta  = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59)

    const where: any = { propinaDia: { fecha: { gte: desde, lte: hasta } } }
    if (restaurantId) where.propinaDia.restaurantId = Number(restaurantId)

    const turnos = await prisma.propinaTurno.findMany({
      where,
      include: { empleado: true },
    })

    // Agrupar por empleado
    const mapa = new Map<number, { empleadoId: number; nombre: string; tipo: string; totalPropina: number; totalHoras: number; turnos: number }>()
    for (const t of turnos) {
      const prev = mapa.get(t.empleadoId) ?? {
        empleadoId: t.empleadoId,
        nombre: t.empleado.nombre,
        tipo: t.empleado.tipo,
        totalPropina: 0,
        totalHoras: 0,
        turnos: 0,
      }
      mapa.set(t.empleadoId, {
        ...prev,
        totalPropina: Math.round((prev.totalPropina + t.propina) * 100) / 100,
        totalHoras:   prev.totalHoras + t.horas,
        turnos:       prev.turnos + 1,
      })
    }

    return Array.from(mapa.values()).sort((a, b) => b.totalPropina - a.totalPropina)
  })
}
