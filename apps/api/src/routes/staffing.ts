import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

export async function staffingRoutes(app: FastifyInstance) {

  // ── Tipos de turno ───────────────────────────────────────────────────────────

  const tipoSchema = z.object({
    restaurantId:        z.number().int().nullable().optional(),
    nombre:              z.string().min(1),
    horaInicio:          z.string().regex(/^\d{2}:\d{2}$/),
    horaFin:             z.string().regex(/^\d{2}:\d{2}$/),
    horas:               z.number().min(0),
    color:               z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
    tipoEmpleado:        z.enum(['cocina', 'sala']).nullable().optional(),
    rolEmpleado:         z.enum(['friegaplatos','cocinero','jefe_cocina','produccion','camarero','encargado']).nullable().optional(),
    excluirAutoPlanning: z.boolean().optional(),
  })

  // GET /staffing/tipos?restaurantId=X  — devuelve globales + específicos del restaurante
  app.get('/staffing/tipos', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.turnoTipo.findMany({
      where: {
        activo: true,
        OR: [
          { restaurantId: null },
          { restaurantId: Number(restaurantId) },
        ],
      },
      orderBy: [{ restaurantId: 'asc' }, { horaInicio: 'asc' }],
    })
  })

  // POST /staffing/tipos
  app.post('/staffing/tipos', async (req, reply) => {
    const result = tipoSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const tipo = await prisma.turnoTipo.create({ data: result.data })
    return reply.status(201).send(tipo)
  })

  // PUT /staffing/tipos/:id
  app.put('/staffing/tipos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = tipoSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const tipo = await prisma.turnoTipo.update({ where: { id }, data: result.data })
    return tipo
  })

  // DELETE /staffing/tipos/:id
  app.delete('/staffing/tipos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.turnoTipo.update({ where: { id }, data: { activo: false } })
    return reply.status(204).send()
  })

  // ── Turnos empleados ─────────────────────────────────────────────────────────

  // GET /staffing/turnos?restaurantId=X&fecha=YYYY-MM-DD
  app.get('/staffing/turnos', async (req, reply) => {
    const { restaurantId, fecha } = req.query as { restaurantId?: string; fecha?: string }
    if (!restaurantId || !fecha) return reply.status(400).send({ error: 'restaurantId y fecha requeridos' })

    const id = Number(restaurantId)
    const dateStart = new Date(`${fecha}T00:00:00.000Z`)
    const dateEnd   = new Date(`${fecha}T23:59:59.999Z`)

    const turnos = await prisma.turnoEmpleado.findMany({
      where: {
        restaurantId: id,
        fecha: { gte: dateStart, lte: dateEnd },
      },
      include: { empleado: true, tipo: true },
      orderBy: [{ horaInicio: 'asc' }],
    })
    return turnos
  })

  // GET /staffing/turnos/semana?restaurantId=X&desde=YYYY-MM-DD
  app.get('/staffing/turnos/semana', async (req, reply) => {
    const { restaurantId, desde } = req.query as { restaurantId?: string; desde?: string }
    if (!restaurantId || !desde) return reply.status(400).send({ error: 'restaurantId y desde requeridos' })

    const id = Number(restaurantId)
    const dateStart = new Date(`${desde}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    const turnos = await prisma.turnoEmpleado.findMany({
      where: {
        restaurantId: id,
        fecha: { gte: dateStart, lte: dateEnd },
      },
      include: { empleado: true, tipo: true },
      orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
    })
    return turnos
  })

  // GET /staffing/turnos/semana-global?restaurantId=X&desde=YYYY-MM-DD
  // Turnos de la semana de TODOS los empleados del restaurante, en TODOS los restaurantes
  app.get('/staffing/turnos/semana-global', async (req, reply) => {
    const { restaurantId, desde } = req.query as { restaurantId?: string; desde?: string }
    if (!restaurantId || !desde) return reply.status(400).send({ error: 'restaurantId y desde requeridos' })

    const rid = Number(restaurantId)
    const dateStart = new Date(`${desde}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    // Empleados que tienen turno en este restaurante esta semana (incluyendo visitantes de otros restaurantes)
    const turnosRestaurante = await prisma.turnoEmpleado.findMany({
      where: { restaurantId: rid, fecha: { gte: dateStart, lte: dateEnd } },
      select: { empleadoId: true },
    })
    const empIds = [...new Set(turnosRestaurante.map(t => t.empleadoId))]

    if (empIds.length === 0) return []

    // Todos sus turnos de la semana en CUALQUIER restaurante
    const turnos = await prisma.turnoEmpleado.findMany({
      where: { empleadoId: { in: empIds }, fecha: { gte: dateStart, lte: dateEnd } },
      select: { empleadoId: true, horaInicio: true, horaFin: true, restaurantId: true },
    })
    return turnos
  })

  // GET /staffing/empleado/:id/semana?desde=YYYY-MM-DD
  // Todos los turnos de un empleado en la semana, en todos los restaurantes
  app.get('/staffing/empleado/:id/semana', async (req, reply) => {
    const empId = Number((req.params as { id: string }).id)
    const { desde } = req.query as { desde?: string }
    if (!desde) return reply.status(400).send({ error: 'desde requerido' })

    const dateStart = new Date(`${desde}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    const turnos = await prisma.turnoEmpleado.findMany({
      where: { empleadoId: empId, fecha: { gte: dateStart, lte: dateEnd } },
      include: { tipo: true, restaurant: { select: { id: true, nombre: true } } },
      orderBy: [{ fecha: 'asc' }],
    })
    return turnos
  })

  // DELETE /staffing/turnos/semana-todos?desde=YYYY-MM-DD&restaurantIds=1,2,3
  app.delete('/staffing/turnos/semana-todos', async (req, reply) => {
    const { desde, restaurantIds } = req.query as { desde?: string; restaurantIds?: string }
    if (!desde || !restaurantIds) return reply.status(400).send({ error: 'desde y restaurantIds requeridos' })

    const ids       = restaurantIds.split(',').map(Number).filter(n => !isNaN(n))
    const dateStart = new Date(`${desde}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    const { count } = await prisma.turnoEmpleado.deleteMany({
      where: {
        restaurantId: { in: ids },
        fecha: { gte: dateStart, lte: dateEnd },
      },
    })

    return { deleted: count }
  })

  // DELETE /staffing/turnos/semana?restaurantId=X&desde=YYYY-MM-DD
  app.delete('/staffing/turnos/semana', async (req, reply) => {
    const { restaurantId, desde } = req.query as { restaurantId?: string; desde?: string }
    if (!restaurantId || !desde) return reply.status(400).send({ error: 'restaurantId y desde requeridos' })

    const id        = Number(restaurantId)
    const dateStart = new Date(`${desde}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    const { count } = await prisma.turnoEmpleado.deleteMany({
      where: {
        restaurantId: id,
        fecha: { gte: dateStart, lte: dateEnd },
      },
    })

    return { deleted: count }
  })

  // POST /staffing/turnos
  app.post('/staffing/turnos', async (req, reply) => {
    const schema = z.object({
      restaurantId: z.number().int(),
      empleadoId:   z.number().int(),
      tipoId:       z.number().int().optional().nullable(),
      fecha:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      horaInicio:   z.string().regex(/^\d{2}:\d{2}$/),
      horaFin:      z.string().regex(/^\d{2}:\d{2}$/),
      esExtra:      z.boolean().optional(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { fecha, ...rest } = result.data
    const fechaDate = new Date(`${fecha}T00:00:00.000Z`)

    const turno = await prisma.turnoEmpleado.create({
      data: { ...rest, fecha: fechaDate },
      include: { empleado: true, tipo: true },
    })
    return reply.status(201).send(turno)
  })

  // PATCH /staffing/turnos/:id
  app.patch('/staffing/turnos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const schema = z.object({
      estado:       z.string().optional(),
      tipoId:       z.number().int().optional().nullable(),
      horaInicio:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
      horaFin:      z.string().regex(/^\d{2}:\d{2}$/).optional(),
      fecha:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      empleadoId:   z.number().int().optional(),
      restaurantId: z.number().int().optional(),
      esExtra:      z.boolean().optional(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { fecha, ...rest } = result.data
    const turno = await prisma.turnoEmpleado.update({
      where: { id },
      data:  { ...rest, ...(fecha ? { fecha: new Date(`${fecha}T00:00:00.000Z`) } : {}) },
      include: { empleado: true, tipo: true },
    })
    return turno
  })

  // DELETE /staffing/turnos/:id
  app.delete('/staffing/turnos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.turnoEmpleado.delete({ where: { id } })
    return reply.status(204).send()
  })

  // GET /staffing/exceso-personal?rol=X&fecha=YYYY-MM-DD&restaurantId=X
  // Devuelve empleados en otros restaurantes donde ese rol tiene MÁS gente de la necesaria ese día
  app.get('/staffing/exceso-personal', async (req, reply) => {
    const { rol, fecha, restaurantId } = req.query as { rol?: string; fecha?: string; restaurantId?: string }
    if (!rol || !fecha || !restaurantId) return reply.status(400).send({ error: 'rol, fecha y restaurantId requeridos' })

    type SlotKey = 'jefeCocina' | 'cocineros' | 'friegaplatos' | 'produccion' | 'camareros' | 'encargados'
    const slotKey  = rol as SlotKey
    const rid      = Number(restaurantId)
    const dateStart = new Date(`${fecha}T00:00:00.000Z`)
    const dateEnd   = new Date(`${fecha}T23:59:59.999Z`)
    const rawDay    = dateStart.getUTCDay()
    const diaSemana = rawDay === 0 ? 6 : rawDay - 1  // 0=Lun … 6=Dom

    const SLOT_TO_ROLES: Record<SlotKey, string[]> = {
      jefeCocina:   ['jefe_cocina'],
      cocineros:    ['cocinero'],
      friegaplatos: ['friegaplatos'],
      produccion:   ['produccion'],
      camareros:    ['camarero'],
      encargados:   ['encargado'],
    }
    const roles = SLOT_TO_ROLES[slotKey] ?? []

    const restaurantes = await prisma.restaurant.findMany({
      where: { id: { not: rid } },
      orderBy: { nombre: 'asc' },
    })

    const resultados = await Promise.all(
      restaurantes.map(async r => {
        const [necesidadDia, necesidadFecha, turnosDelDia] = await Promise.all([
          prisma.staffingNecesidadDia.findUnique({
            where: { restaurantId_diaSemana: { restaurantId: r.id, diaSemana } },
          }),
          prisma.staffingNecesidadFecha.findFirst({
            where: { restaurantId: r.id, fecha: { gte: dateStart, lte: dateEnd } },
          }),
          prisma.turnoEmpleado.findMany({
            where: { restaurantId: r.id, fecha: { gte: dateStart, lte: dateEnd } },
            include: { empleado: true },
          }),
        ])

        const needed = (necesidadDia?.[slotKey] ?? 0) + (necesidadFecha?.[slotKey] ?? 0)

        const matchingTurnos = turnosDelDia.filter(t => {
          const e = t.empleado
          if (slotKey === 'jefeCocina') return e.rol === 'jefe_cocina' || (e.rol === 'cocinero' && e.puedeJefeCocina)
          if (slotKey === 'encargados') return e.rol === 'encargado'   || (e.rol === 'camarero' && e.puedeEncargado)
          return roles.includes(e.rol ?? '')
        })

        const exceso = matchingTurnos.length - needed
        if (exceso <= 0) return null

        // Devolver los empleados "sobrantes" (los últimos N según criterio de exceso)
        const empleadosExceso = matchingTurnos.slice(needed < 0 ? 0 : needed).map(t => ({
          turnoId:    t.id,
          empleadoId: t.empleado.id,
          nombre:     t.empleado.nombre,
          rol:        t.empleado.rol,
          horaInicio: t.horaInicio,
          horaFin:    t.horaFin,
        }))

        return {
          restaurantId: r.id,
          nombre: r.nombre,
          needed,
          covered: matchingTurnos.length,
          exceso,
          empleados: empleadosExceso,
        }
      })
    )

    return resultados.filter(Boolean)
  })

  // GET /staffing/transferir-destinos?empId=X&fecha=YYYY-MM-DD&origenId=X
  // Devuelve restaurantes (excepto el origen) donde el rol del empleado aún hace falta ese día
  app.get('/staffing/transferir-destinos', async (req, reply) => {
    const { empId, fecha, origenId } = req.query as { empId?: string; fecha?: string; origenId?: string }
    if (!empId || !fecha || !origenId) return reply.status(400).send({ error: 'empId, fecha y origenId requeridos' })

    const emp = await prisma.empleado.findUnique({ where: { id: Number(empId) } })
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' })

    type SlotKey = 'jefeCocina' | 'cocineros' | 'friegaplatos' | 'produccion' | 'camareros' | 'encargados'
    const ROL_TO_SLOT: Record<string, SlotKey> = {
      jefe_cocina: 'jefeCocina', cocinero: 'cocineros', friegaplatos: 'friegaplatos',
      produccion: 'produccion', camarero: 'camareros', encargado: 'encargados',
    }
    const slotKey = emp.rol ? ROL_TO_SLOT[emp.rol] : null
    if (!slotKey) return []   // sin rol definido → no hay destinos significativos

    const dateStart  = new Date(`${fecha}T00:00:00.000Z`)
    const dateEnd    = new Date(`${fecha}T23:59:59.999Z`)
    const rawDay     = dateStart.getUTCDay()
    const diaSemana  = rawDay === 0 ? 6 : rawDay - 1  // 0=Lun … 6=Dom

    const restaurantes = await prisma.restaurant.findMany({ orderBy: { nombre: 'asc' } })

    const resultados = await Promise.all(
      restaurantes
        .filter(r => r.id !== Number(origenId))
        .map(async r => {
          const [necesidadDia, necesidadFecha, turnosDelDia] = await Promise.all([
            prisma.staffingNecesidadDia.findUnique({
              where: { restaurantId_diaSemana: { restaurantId: r.id, diaSemana } },
            }),
            prisma.staffingNecesidadFecha.findFirst({
              where: { restaurantId: r.id, fecha: { gte: dateStart, lte: dateEnd } },
            }),
            prisma.turnoEmpleado.findMany({
              where: { restaurantId: r.id, fecha: { gte: dateStart, lte: dateEnd } },
              include: { empleado: true },
            }),
          ])

          const needed = (necesidadDia?.[slotKey] ?? 0) + (necesidadFecha?.[slotKey] ?? 0)
          if (needed === 0) return null

          const covered = turnosDelDia.filter(t => {
            const e = t.empleado
            if (slotKey === 'jefeCocina')  return e.rol === 'jefe_cocina' || (e.rol === 'cocinero' && e.puedeJefeCocina)
            if (slotKey === 'encargados')  return e.rol === 'encargado'   || (e.rol === 'camarero' && e.puedeEncargado)
            const rolMap: Record<string, string> = {
              cocineros: 'cocinero', friegaplatos: 'friegaplatos',
              produccion: 'produccion', camareros: 'camarero',
            }
            return e.rol === rolMap[slotKey]
          }).length

          if (covered >= needed) return null

          return { restaurantId: r.id, nombre: r.nombre, needed, covered, deficit: needed - covered }
        })
    )

    return resultados.filter(Boolean)
  })

  // GET /staffing/disponibles?restaurantId=X&fecha=YYYY-MM-DD&rol=X
  // Devuelve empleados de OTROS restaurantes (o rotativos) que no tienen turno ese día
  // y cuyo rol coincide con el requerido (incluyendo suplentes puedeJefeCocina/puedeEncargado)
  app.get('/staffing/disponibles', async (req, reply) => {
    const { restaurantId, fecha, rol } = req.query as { restaurantId?: string; fecha?: string; rol?: string }
    if (!restaurantId || !fecha || !rol) {
      return reply.status(400).send({ error: 'restaurantId, fecha y rol requeridos' })
    }

    const rid       = Number(restaurantId)
    const dateStart = new Date(`${fecha}T00:00:00.000Z`)
    const dateEnd   = new Date(`${fecha}T23:59:59.999Z`)

    // Semana completa del día solicitado (Lun–Dom)
    const dow       = dateStart.getUTCDay()
    const daysToMon = dow === 0 ? 6 : dow - 1
    const weekStart = new Date(dateStart)
    weekStart.setUTCDate(weekStart.getUTCDate() - daysToMon)
    const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    // Todos los empleados activos que NO son de este restaurante
    const candidatos = await prisma.empleado.findMany({
      where: {
        activo: true,
        OR: [{ restaurantId: null }, { restaurantId: { not: rid } }],
      },
      include: { restaurant: { select: { id: true, nombre: true } } },
    })

    const empIds = candidatos.map(e => e.id)

    // Empleados que ya tienen turno ESE DÍA (en cualquier restaurante)
    const [ocupadosHoy, turnosSemana] = await Promise.all([
      prisma.turnoEmpleado.findMany({
        where: { empleadoId: { in: empIds }, fecha: { gte: dateStart, lte: dateEnd } },
        select: { empleadoId: true },
      }),
      // Turnos de toda la semana → para calcular horas ya asignadas
      prisma.turnoEmpleado.findMany({
        where: { empleadoId: { in: empIds }, fecha: { gte: weekStart, lte: weekEnd } },
        select: { empleadoId: true, horaInicio: true, horaFin: true },
      }),
    ])
    const ocupadosSet = new Set(ocupadosHoy.map(t => t.empleadoId))

    // Minutos ya asignados esta semana por empleado (todos sus restaurantes)
    function calcMinsDisp(ini: string, fin: string): number {
      const [hI, mI] = ini.split(':').map(Number)
      const [hF, mF] = fin.split(':').map(Number)
      let m = (hF * 60 + mF) - (hI * 60 + mI)
      if (m <= 0) m += 24 * 60
      return m
    }
    const minsAsignadosMap = new Map<number, number>()
    for (const t of turnosSemana) {
      minsAsignadosMap.set(t.empleadoId, (minsAsignadosMap.get(t.empleadoId) ?? 0) + calcMinsDisp(t.horaInicio, t.horaFin))
    }

    // Mapeo rol → qué empleados pueden cubrirlo
    const ROL_MAP: Record<string, string[]> = {
      jefeCocina:   ['jefe_cocina'],
      cocineros:    ['cocinero'],
      friegaplatos: ['friegaplatos'],
      produccion:   ['produccion'],
      camareros:    ['camarero'],
      encargados:   ['encargado'],
    }
    const rolesExactos = ROL_MAP[rol] ?? []

    const disponibles = candidatos.filter(e => {
      if (ocupadosSet.has(e.id)) return false
      // Excluir si ya tiene las horas contractuales cubiertas esta semana
      const minsAsig   = minsAsignadosMap.get(e.id) ?? 0
      const minsContrato = (e.horasSemanales ?? 40) * 60
      if (minsAsig >= minsContrato) return false
      // Rol compatible
      if (e.rol && rolesExactos.includes(e.rol)) return true
      if (rol === 'jefeCocina' && e.rol === 'cocinero' && e.puedeJefeCocina) return true
      if (rol === 'encargados' && e.rol === 'camarero'  && e.puedeEncargado)  return true
      return false
    })

    return disponibles.map(e => ({
      id:               e.id,
      nombre:           e.nombre,
      rol:              e.rol,
      tipo:             e.tipo,
      horasSemanales:   e.horasSemanales,
      restaurantId:     e.restaurantId,
      restaurantNombre: e.restaurant?.nombre ?? null,
      horasRestantes:   Math.round(((e.horasSemanales ?? 40) * 60 - (minsAsignadosMap.get(e.id) ?? 0)) / 60 * 10) / 10,
      esSuplente:
        (rol === 'jefeCocina' && e.rol === 'cocinero') ||
        (rol === 'encargados' && e.rol === 'camarero'),
    }))
  })

  // GET /staffing/extras-candidatos?restaurantId=X&fecha=YYYY-MM-DD&rol=X
  // Empleados que coinciden con el rol y están libres ese día pero NO aparecen en /disponibles
  // (fijos del mismo restaurante, o de otros restaurantes con horas de contrato ya completadas)
  app.get('/staffing/extras-candidatos', async (req, reply) => {
    const { restaurantId, fecha, rol } = req.query as { restaurantId?: string; fecha?: string; rol?: string }
    if (!restaurantId || !fecha || !rol) {
      return reply.status(400).send({ error: 'restaurantId, fecha y rol requeridos' })
    }

    const rid       = Number(restaurantId)
    const dateStart = new Date(`${fecha}T00:00:00.000Z`)
    const dateEnd   = new Date(`${fecha}T23:59:59.999Z`)

    const dow       = dateStart.getUTCDay()
    const daysToMon = dow === 0 ? 6 : dow - 1
    const weekStart = new Date(dateStart)
    weekStart.setUTCDate(weekStart.getUTCDate() - daysToMon)
    const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    // Todos los empleados activos con rol compatible
    const ROL_MAP: Record<string, string[]> = {
      jefeCocina:   ['jefe_cocina'],
      cocineros:    ['cocinero'],
      friegaplatos: ['friegaplatos'],
      produccion:   ['produccion'],
      camareros:    ['camarero'],
      encargados:   ['encargado'],
    }
    const rolesExactos = ROL_MAP[rol] ?? []

    const todos = await prisma.empleado.findMany({
      where: { activo: true },
      include: { restaurant: { select: { id: true, nombre: true } } },
    })

    const empIds = todos.map(e => e.id)

    const [ocupadosHoy, turnosSemana] = await Promise.all([
      prisma.turnoEmpleado.findMany({
        where: { empleadoId: { in: empIds }, fecha: { gte: dateStart, lte: dateEnd } },
        select: { empleadoId: true },
      }),
      prisma.turnoEmpleado.findMany({
        where: { empleadoId: { in: empIds }, fecha: { gte: weekStart, lte: weekEnd } },
        select: { empleadoId: true, horaInicio: true, horaFin: true },
      }),
    ])
    const ocupadosSet = new Set(ocupadosHoy.map(t => t.empleadoId))

    function calcMinsExtra(ini: string, fin: string): number {
      const [hI, mI] = ini.split(':').map(Number)
      const [hF, mF] = fin.split(':').map(Number)
      let m = (hF * 60 + mF) - (hI * 60 + mI)
      if (m <= 0) m += 24 * 60
      return m
    }
    const minsAsignadosMap = new Map<number, number>()
    for (const t of turnosSemana) {
      minsAsignadosMap.set(t.empleadoId, (minsAsignadosMap.get(t.empleadoId) ?? 0) + calcMinsExtra(t.horaInicio, t.horaFin))
    }

    const extras = todos.filter(e => {
      if (ocupadosSet.has(e.id)) return false
      // Rol compatible
      const rolMatch =
        (e.rol && rolesExactos.includes(e.rol)) ||
        (rol === 'jefeCocina' && e.rol === 'cocinero' && e.puedeJefeCocina) ||
        (rol === 'encargados' && e.rol === 'camarero' && e.puedeEncargado)
      if (!rolMatch) return false
      // Solo los que NO aparecen en /disponibles:
      //   - fijos del mismo restaurante (siempre excluidos de disponibles)
      //   - o con horas de contrato ya completadas
      const esDelMismoRestaurante = e.restaurantId === rid
      const minsAsig = minsAsignadosMap.get(e.id) ?? 0
      const minsFull = (e.horasSemanales ?? 40) * 60
      const tieneHorasCompletas = minsAsig >= minsFull
      return esDelMismoRestaurante || tieneHorasCompletas
    })

    return extras.map(e => ({
      id:               e.id,
      nombre:           e.nombre,
      rol:              e.rol,
      tipo:             e.tipo,
      horasSemanales:   e.horasSemanales,
      restaurantId:     e.restaurantId,
      restaurantNombre: e.restaurant?.nombre ?? null,
      horasAsignadas:   Math.round((minsAsignadosMap.get(e.id) ?? 0) / 60 * 10) / 10,
      esSuplente:
        (rol === 'jefeCocina' && e.rol === 'cocinero') ||
        (rol === 'encargados' && e.rol === 'camarero'),
    }))
  })

  // GET /staffing/huecos-empleado?empId=X&lunes=YYYY-MM-DD
  // Para un empleado con horas libres: días de la semana donde su rol tiene déficit en algún restaurante y él no tiene turno
  app.get('/staffing/huecos-empleado', async (req, reply) => {
    const { empId, lunes } = req.query as { empId?: string; lunes?: string }
    if (!empId || !lunes) return reply.status(400).send({ error: 'empId y lunes requeridos' })

    const emp = await prisma.empleado.findUnique({ where: { id: Number(empId) } })
    if (!emp) return reply.status(404).send({ error: 'Empleado no encontrado' })

    type SlotKey = 'jefeCocina' | 'cocineros' | 'friegaplatos' | 'produccion' | 'camareros' | 'encargados'
    const ROL_TO_SLOT: Record<string, SlotKey> = {
      jefe_cocina: 'jefeCocina', cocinero: 'cocineros', friegaplatos: 'friegaplatos',
      produccion: 'produccion', camarero: 'camareros', encargado: 'encargados',
    }
    const slotKey = emp.rol ? ROL_TO_SLOT[emp.rol] : null
    if (!slotKey) return []

    const weekStart = new Date(`${lunes}T00:00:00.000Z`)
    const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    const [restaurantes, turnosSemana] = await Promise.all([
      prisma.restaurant.findMany({ orderBy: { nombre: 'asc' } }),
      prisma.turnoEmpleado.findMany({
        where: { fecha: { gte: weekStart, lte: weekEnd } },
        include: { empleado: true },
      }),
    ])

    // Días donde el empleado ya tiene turno asignado (cualquier restaurante)
    const diasOcupados = new Set(
      turnosSemana
        .filter(t => t.empleadoId === emp.id)
        .map(t => t.fecha.toISOString().slice(0, 10))
    )

    const SLOT_TO_ROLES: Record<SlotKey, string[]> = {
      jefeCocina:   ['jefe_cocina'],
      cocineros:    ['cocinero'],
      friegaplatos: ['friegaplatos'],
      produccion:   ['produccion'],
      camareros:    ['camarero'],
      encargados:   ['encargado'],
    }
    const roles = SLOT_TO_ROLES[slotKey] ?? []

    const huecos: Array<{ fecha: string; restaurantId: number; restaurantNombre: string; needed: number; covered: number; deficit: number }> = []

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000)
      const dayStr   = day.toISOString().slice(0, 10)
      const rawDay   = day.getUTCDay()
      const diaSemana = rawDay === 0 ? 6 : rawDay - 1

      // Si el empleado ya trabaja ese día, skip
      if (diasOcupados.has(dayStr)) continue

      const dayStart = new Date(`${dayStr}T00:00:00.000Z`)
      const dayEnd   = new Date(`${dayStr}T23:59:59.999Z`)

      const [necsDia, necsFecha] = await Promise.all([
        prisma.staffingNecesidadDia.findMany({ where: { diaSemana } }),
        prisma.staffingNecesidadFecha.findMany({ where: { fecha: { gte: dayStart, lte: dayEnd } } }),
      ])

      const turnosDia = turnosSemana.filter(t => t.fecha.toISOString().slice(0, 10) === dayStr)

      for (const r of restaurantes) {
        const necDia   = necsDia.find(n => n.restaurantId === r.id)
        const necFecha = necsFecha.find(n => n.restaurantId === r.id)
        const needed   = (necDia?.[slotKey] ?? 0) + (necFecha?.[slotKey] ?? 0)
        if (needed === 0) continue

        const covered = turnosDia.filter(t => {
          if (t.restaurantId !== r.id) return false
          const e = t.empleado
          if (slotKey === 'jefeCocina') return e.rol === 'jefe_cocina' || (e.rol === 'cocinero' && e.puedeJefeCocina)
          if (slotKey === 'encargados') return e.rol === 'encargado'   || (e.rol === 'camarero' && e.puedeEncargado)
          return roles.includes(e.rol ?? '')
        }).length

        const deficit = needed - covered
        if (deficit > 0) {
          huecos.push({ fecha: dayStr, restaurantId: r.id, restaurantNombre: r.nombre, needed, covered, deficit })
        }
      }
    }

    return huecos
  })

  // GET /staffing/cobertura?lunes=YYYY-MM-DD  — horas asignadas vs contrato por empleado para la semana
  app.get('/staffing/cobertura', async (req, reply) => {
    const { lunes } = req.query as { lunes?: string }
    if (!lunes) return reply.status(400).send({ error: 'lunes requerido' })

    const weekStart = new Date(`${lunes}T00:00:00.000Z`)
    const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    const [empleados, turnos] = await Promise.all([
      prisma.empleado.findMany({
        where: { activo: true },
        include: { restaurant: { select: { id: true, nombre: true } } },
        orderBy: { nombre: 'asc' },
      }),
      prisma.turnoEmpleado.findMany({
        where: { fecha: { gte: weekStart, lte: weekEnd } },
        include: { restaurant: { select: { id: true, nombre: true } } },
      }),
    ])

    const calcMins = (ini: string, fin: string) => {
      const [hI, mI] = ini.split(':').map(Number)
      const [hF, mF] = fin.split(':').map(Number)
      let m = (hF * 60 + mF) - (hI * 60 + mI)
      if (m <= 0) m += 24 * 60
      return m
    }

    // Agrupar turnos por empleado
    const turnosPorEmp = new Map<number, typeof turnos>()
    for (const t of turnos) {
      if (!turnosPorEmp.has(t.empleadoId)) turnosPorEmp.set(t.empleadoId, [])
      turnosPorEmp.get(t.empleadoId)!.push(t)
    }

    return empleados.map(e => {
      const ts           = turnosPorEmp.get(e.id) ?? []
      const minsAsig     = ts.reduce((s, t) => s + calcMins(t.horaInicio, t.horaFin), 0)
      // Restaurantes distintos donde tiene turnos esta semana
      const restsSet     = new Set(ts.map(t => t.restaurantId))
      const restaurants  = [...restsSet].map(rid => {
        const t = ts.find(x => x.restaurantId === rid)
        return { id: rid, nombre: t?.restaurant?.nombre ?? '' }
      })
      return {
        id:             e.id,
        nombre:         e.nombre,
        tipo:           e.tipo,
        rol:            e.rol,
        horasSemanales: e.horasSemanales ?? 40,
        horasAsignadas: Math.round(minsAsig / 60 * 10) / 10,
        excluirPlanning: e.excluirPlanning,
        restaurants,
      }
    })
  })

  // PATCH /staffing/empleados/:id
  app.patch('/staffing/empleados/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const schema = z.object({
      horasSemanales:    z.number().int().min(0).optional(),
      faseLibreRotacion: z.number().int().min(0).max(3).optional(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const empleado = await prisma.empleado.update({
      where: { id },
      data:  result.data,
    })
    return empleado
  })

  // ── Necesidades por día de semana ────────────────────────────────────────────

  const necesidadFields = z.object({
    jefeCocina:   z.number().int().min(0),
    cocineros:    z.number().int().min(0),
    friegaplatos: z.number().int().min(0),
    produccion:   z.number().int().min(0),
    camareros:    z.number().int().min(0),
    encargados:   z.number().int().min(0),
  })

  // GET /staffing/necesidades?restaurantId=X  — devuelve 7 registros (uno por día)
  app.get('/staffing/necesidades', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    const rid = Number(restaurantId)

    const existing = await prisma.staffingNecesidadDia.findMany({
      where: { restaurantId: rid },
      orderBy: { diaSemana: 'asc' },
    })

    const blank = { jefeCocina: 0, cocineros: 0, friegaplatos: 0, produccion: 0, camareros: 0, encargados: 0 }
    return Array.from({ length: 7 }, (_, i) =>
      existing.find(n => n.diaSemana === i) ?? { id: null, restaurantId: rid, diaSemana: i, ...blank }
    )
  })

  // PUT /staffing/necesidades  — guarda los 7 días de golpe
  app.put('/staffing/necesidades', async (req, reply) => {
    const schema = z.object({
      restaurantId: z.number().int(),
      dias: z.array(z.object({ diaSemana: z.number().int().min(0).max(6), ...necesidadFields.shape })).length(7),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantId, dias } = result.data

    await Promise.all(dias.map(d =>
      prisma.staffingNecesidadDia.upsert({
        where:  { restaurantId_diaSemana: { restaurantId, diaSemana: d.diaSemana } },
        create: { restaurantId, ...d },
        update: d,
      })
    ))
    return { ok: true }
  })

  // ── Extras por fecha concreta ─────────────────────────────────────────────────

  // GET /staffing/necesidades/fecha?restaurantId=X&desde=Y&hasta=Z
  app.get('/staffing/necesidades/fecha', async (req, reply) => {
    const { restaurantId, desde, hasta } = req.query as { restaurantId?: string; desde?: string; hasta?: string }
    if (!restaurantId || !desde || !hasta) return reply.status(400).send({ error: 'restaurantId, desde y hasta requeridos' })

    return prisma.staffingNecesidadFecha.findMany({
      where: {
        restaurantId: Number(restaurantId),
        fecha: {
          gte: new Date(`${desde}T00:00:00.000Z`),
          lte: new Date(`${hasta}T23:59:59.999Z`),
        },
      },
      orderBy: { fecha: 'asc' },
    })
  })

  // PUT /staffing/necesidades/fecha  — upsert un día concreto
  app.put('/staffing/necesidades/fecha', async (req, reply) => {
    const schema = z.object({
      restaurantId: z.number().int(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notas: z.string().optional().nullable(),
      ...necesidadFields.shape,
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantId, fecha, ...data } = result.data
    const fechaDate = new Date(`${fecha}T00:00:00.000Z`)

    const record = await prisma.staffingNecesidadFecha.upsert({
      where:  { restaurantId_fecha: { restaurantId, fecha: fechaDate } },
      create: { restaurantId, fecha: fechaDate, ...data },
      update: data,
    })
    return record
  })

  // DELETE /staffing/necesidades/fecha/:id
  app.delete('/staffing/necesidades/fecha/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.staffingNecesidadFecha.delete({ where: { id } })
    return reply.status(204).send()
  })

  // POST /staffing/auto-planning
  app.post('/staffing/auto-planning', async (req, reply) => {
    const schema = z.object({
      restaurantId: z.number().int(),
      weekStart:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      preview:      z.boolean().optional().default(false),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const { restaurantId, weekStart, preview } = result.data

    const dateStart = new Date(`${weekStart}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

    // 7 day strings for the week (index 0=Mon ... 6=Sun)
    const days: string[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(dateStart)
      d.setUTCDate(d.getUTCDate() + i)
      return d.toISOString().slice(0, 10)
    })

    const [empleados, tipos, existingShifts, necesidadesDia, necesidadesFecha] = await Promise.all([
      prisma.empleado.findMany({
        where: { activo: true, OR: [{ restaurantId }, { restaurantId: null }] },
        orderBy: { nombre: 'asc' },
      }),
      prisma.turnoTipo.findMany({
        where: { activo: true, OR: [{ restaurantId: null }, { restaurantId }] },
      }),
      prisma.turnoEmpleado.findMany({
        where: { restaurantId, fecha: { gte: dateStart, lte: dateEnd } },
      }),
      prisma.staffingNecesidadDia.findMany({ where: { restaurantId } }),
      prisma.staffingNecesidadFecha.findMany({
        where: { restaurantId, fecha: { gte: dateStart, lte: dateEnd } },
      }),
    ])

    // Turnos de estos empleados en OTROS restaurantes esta semana
    // → para saber qué horas ya tienen cubiertas y qué días ya trabajan en otro sitio
    const empIds = empleados.map(e => e.id)
    const otherRestaurantShifts = await prisma.turnoEmpleado.findMany({
      where: {
        empleadoId: { in: empIds },
        restaurantId: { not: restaurantId },
        fecha: { gte: dateStart, lte: dateEnd },
      },
    })

    // Build needs per day (base + extras)
    type Slots = { jefeCocina: number; cocineros: number; friegaplatos: number; produccion: number; camareros: number; encargados: number }
    const blank: Slots = { jefeCocina: 0, cocineros: 0, friegaplatos: 0, produccion: 0, camareros: 0, encargados: 0 }

    const needsPerDay: Slots[] = days.map((dayStr, dayIdx) => {
      const base  = necesidadesDia.find(n => n.diaSemana === dayIdx) ?? blank
      const extra = necesidadesFecha.find(f => f.fecha.toISOString().slice(0, 10) === dayStr)
      return {
        jefeCocina:   base.jefeCocina   + (extra?.jefeCocina   ?? 0),
        cocineros:    base.cocineros    + (extra?.cocineros    ?? 0),
        friegaplatos: base.friegaplatos + (extra?.friegaplatos ?? 0),
        produccion:   base.produccion   + (extra?.produccion   ?? 0),
        camareros:    base.camareros    + (extra?.camareros    ?? 0),
        encargados:   base.encargados   + (extra?.encargados   ?? 0),
      }
    })

    // Check if there are any needs configured at all
    const hasNeeds = needsPerDay.some(n => Object.values(n).some(v => v > 0))

    function calcMins(ini: string, fin: string): number {
      const [hI, mI] = ini.split(':').map(Number)
      const [hF, mF] = fin.split(':').map(Number)
      let mins = (hF * 60 + mF) - (hI * 60 + mI)
      if (mins <= 0) mins += 24 * 60
      return mins
    }

    function defaultSchedule(targetMins: number): { horaInicio: string; horaFin: string } {
      const totalEndMins = 9 * 60 + targetMins
      const endH = Math.floor(totalEndMins / 60) % 24
      const endM = totalEndMins % 60
      return { horaInicio: '09:00', horaFin: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}` }
    }

    const plan: Array<{
      empleadoId: number; empleadoNombre: string; fecha: string
      horaInicio: string; horaFin: string; tipoId: number | null; tipoNombre: string | null
    }> = []

    const existingSet      = new Set(existingShifts.map(s => `${s.empleadoId}-${s.fecha.toISOString().slice(0, 10)}`))
    const empIdsWithShifts = new Set(existingShifts.map(s => s.empleadoId))

    // ── 4-week rotation patterns (0=Lun … 6=Dom) ─────────────────────────────
    // Cada fase se asigna por POSICIÓN del empleado dentro de su grupo tipo (cocina/sala),
    // no por emp.id % 4. Esto garantiza distribución uniforme independientemente de los IDs.
    //
    // Patrones diseñados para restaurante: todos los pares son CONSECUTIVOS (o cierran el ciclo semanal).
    // El "día doble" (aparece en 2 patrones) es el Lunes — día más tranquilo en restaurantes.
    //   Phase 0: Lun+Mar  → días tranquilos
    //   Phase 1: Mié+Jue  → días medios
    //   Phase 2: Vie+Sáb  → fin de semana (solo 25% del equipo libra)
    //   Phase 3: Dom+Lun  → cierra el ciclo; Lun aparece también en phase 0 (50%), Dom solo aquí (25%)
    const OFF_PATTERNS_2: number[][] = [[0,1],[2,3],[4,5],[6,0]]
    // Para contratos con 3 días libres (no se usa actualmente, daysOffCount=2 siempre)
    const OFF_PATTERNS_3: number[][] = [[0,1,2],[3,4,5],[1,5,6],[0,2,4]]

    // ── Empleados excluidos del auto-planning ─────────────────────────────────
    const isExcluded = (emp: typeof empleados[0]) =>
      emp.excluirPlanning ||
      tipos.some(t =>
        t.excluirAutoPlanning &&
        (!t.tipoEmpleado || t.tipoEmpleado === emp.tipo) &&
        (!t.rolEmpleado  || t.rolEmpleado  === emp.rol)
      )

    // ── Split: fixed (this restaurant) vs rotating (restaurantId=null) ─────────
    const fixedEmps    = [...empleados].filter(e => e.restaurantId === restaurantId && !isExcluded(e)).sort((a, b) => a.id - b.id)
    const rotatingEmps = [...empleados].filter(e => e.restaurantId === null && !isExcluded(e)).sort((a, b) => a.id - b.id)

    // ── Off-day computation ───────────────────────────────────────────────────
    // empIdxInGroup: posición del empleado dentro de su grupo tipo (cocina/sala).
    // Usar índice posicional garantiza distribución uniforme sin depender de los IDs.
    function getOffDays(emp: typeof empleados[0], empIdxInGroup: number, phaseOverride?: number): Set<number> {
      const daysOffCount = 2 // siempre 2 días libres, independientemente de las horas contratadas
      const fixed        = emp.diasLibresFijos ?? []
      const off          = new Set(fixed)
      const extra        = daysOffCount - fixed.length

      if (extra > 0) {
        if (fixed.length > 0) {
          // Tiene días fijos: añadir días consecutivos a partir del último fijo
          const anchor = [...fixed].sort((a, b) => a - b).at(-1)!
          let added = 0
          for (let i = 1; i <= 7 && added < extra; i++) {
            const c = (anchor + i) % 7
            if (!off.has(c)) { off.add(c); added++ }
          }
        } else {
          // Sin días fijos: fase = posición en grupo + avance de rotación semanal
          const patterns = daysOffCount >= 3 ? OFF_PATTERNS_3 : OFF_PATTERNS_2
          const phase    = phaseOverride !== undefined
            ? phaseOverride
            : (empIdxInGroup + (emp.faseLibreRotacion ?? 0)) % 4
          patterns[phase].forEach(d => off.add(d))
        }
      }

      return off
    }

    // Dado un conjunto de fases ya usadas, devuelve la fase que minimiza días sin cubrir
    // combinada con las fases existentes (para garantizar máxima cobertura semanal)
    function bestComplementPhase(usedPhases: Set<number>, naturalPhase: number): number {
      const allDays = [0, 1, 2, 3, 4, 5, 6]
      const existingWorking = new Set(
        allDays.filter(d => [...usedPhases].some(p => !OFF_PATTERNS_2[p].includes(d)))
      )
      let bestPhase  = naturalPhase
      let bestCoverage = -1
      for (let p = 0; p < 4; p++) {
        if (usedPhases.has(p)) continue
        const combined = new Set([...existingWorking, ...allDays.filter(d => !OFF_PATTERNS_2[p].includes(d))])
        if (combined.size > bestCoverage) { bestCoverage = combined.size; bestPhase = p }
      }
      return bestPhase
    }

    // Índice posicional dentro del grupo tipo → distribución uniforme de patrones
    const cocinaFijos = fixedEmps.filter(e => e.tipo === 'cocina')
    const salaFijos   = fixedEmps.filter(e => e.tipo === 'sala')
    const offDaysMap  = new Map<number, Set<number>>()
    cocinaFijos.forEach((emp, idx) => offDaysMap.set(emp.id, getOffDays(emp, idx)))
    salaFijos.forEach((emp, idx)   => offDaysMap.set(emp.id, getOffDays(emp, idx)))

    // ── Role helpers (shared) ─────────────────────────────────────────────────
    const ROLE_KEYS: (keyof Slots)[] = ['jefeCocina','cocineros','friegaplatos','produccion','camareros','encargados']
    const ROL_MAP: Record<keyof Slots, string[]> = {
      jefeCocina:   ['jefe_cocina'],
      cocineros:    ['cocinero'],
      friegaplatos: ['friegaplatos'],
      produccion:   ['produccion'],
      camareros:    ['camarero'],
      encargados:   ['encargado'],
    }
    const ROL_MAP_FALLBACK: Partial<Record<keyof Slots, string>> = {
      jefeCocina:   '_cocina',
      cocineros:    '_cocina',
      friegaplatos: '_cocina',
      produccion:   '_cocina',
      camareros:    '_sala',
      encargados:   '_sala',
    }
    const empRolKey = (e: typeof empleados[0]) => e.rol ?? (e.tipo === 'cocina' ? '_cocina' : '_sala')
    const empMatchesRole = (e: typeof empleados[0], roleKey: keyof Slots) => {
      const key = empRolKey(e)
      if (ROL_MAP[roleKey].includes(key) || ROL_MAP_FALLBACK[roleKey] === key) return true
      if (roleKey === 'encargados' && e.rol === 'camarero' && e.puedeEncargado) return true
      if (roleKey === 'jefeCocina' && e.rol === 'cocinero' && e.puedeJefeCocina) return true
      return false
    }

    // ── Helper: add shifts for one employee (mezcla tipos para alcanzar horas semanales exactas) ──
    // applyNeedsFilter=true solo para rotativos: no añadir si el rol ya está cubierto.
    // Para fijos (contratados) siempre se generan sus 5 días de trabajo.
    function addShiftsForEmp(emp: typeof empleados[0], offDays: Set<number>, applyNeedsFilter = false) {
      const horasSemanales = emp.horasSemanales ?? 40

      // Horas y días ya asignados en OTROS restaurantes esta semana
      const shiftsOtros = otherRestaurantShifts.filter(s => s.empleadoId === emp.id)
      const minsYaOtros = shiftsOtros.reduce((s, t) => s + calcMins(t.horaInicio, t.horaFin), 0)
      const diasOtros   = new Set(shiftsOtros.map(s => s.fecha.toISOString().slice(0, 10)))

      // Target = horas de contrato menos lo ya cubierto en otros restaurantes
      const targetTotalMins = Math.max(0, horasSemanales * 60 - minsYaOtros)
      // Si ya tiene las horas completas en otros restaurantes, no planificar aquí
      if (targetTotalMins === 0) return

      // Pool de tipos elegibles (rol específico primero, luego genérico de tipo)
      const byRol  = tipos.filter(t => t.rolEmpleado === emp.rol && (!t.tipoEmpleado || t.tipoEmpleado === emp.tipo))
      const byTipo = tipos.filter(t => !t.rolEmpleado && (!t.tipoEmpleado || t.tipoEmpleado === emp.tipo))
      const pool   = (byRol.length > 0 ? byRol : byTipo)
        .sort((a, b) => calcMins(b.horaInicio, b.horaFin) - calcMins(a.horaInicio, a.horaFin))

      let workingDays = days
        .map((dayStr, dayIdx) => ({ dayStr, dayIdx }))
        // Excluir días libres fijos + días ya trabajados en otro restaurante
        .filter(d => !offDays.has(d.dayIdx) && !diasOtros.has(d.dayStr))

      // Para rotativos: prioridad 3 niveles para garantizar horas de contrato
      // Nivel 1 (déficit): needed > 0 y aún no cubierto  → siempre incluir
      // Nivel 2 (cubierto-pero-necesario): needed > 0 pero ya cubierto → añadir si nivel 1 no alcanza el contrato
      // Nivel 3 (no necesario): needed = 0 → último recurso
      if (hasNeeds && applyNeedsFilter) {
        const strictRoleKey = ROLE_KEYS.find(rk => ROL_MAP[rk].includes(empRolKey(emp)))
        if (strictRoleKey) {
          const tier1: typeof workingDays = []
          const tier2: typeof workingDays = []
          const tier3: typeof workingDays = []

          for (const d of workingDays) {
            const needed = needsPerDay[d.dayIdx][strictRoleKey]
            if (!needed) { tier3.push(d); continue }
            const alreadyCovered =
              plan.filter(p => {
                const e2 = empleados.find(x => x.id === p.empleadoId)
                return e2 && empMatchesRole(e2, strictRoleKey) && p.fecha === d.dayStr
              }).length +
              existingShifts.filter(s => {
                const e2 = empleados.find(x => x.id === s.empleadoId)
                return e2 && empMatchesRole(e2, strictRoleKey) && s.fecha.toISOString().slice(0, 10) === d.dayStr
              }).length
            if (alreadyCovered < needed) tier1.push(d)
            else tier2.push(d)
          }

          // Rellenar hasta los días disponibles de la semana (tier1 primero, luego tier2, luego tier3)
          // Siempre se intenta dar al empleado su semana completa (p.ej. 5 días × 4h = 20h)
          const targetDays = workingDays.length // días disponibles antes del filtro (típicamente 5)
          const result: typeof workingDays = [...tier1]
          for (const d of [...tier2, ...tier3]) {
            if (result.length >= targetDays) break
            result.push(d)
          }
          workingDays = result
        }
      }

      type Assignment = { horaInicio: string; horaFin: string; tipoId: number | null; tipoNombre: string | null }
      let assignments: Assignment[]

      const numWorkingDays   = workingDays.length > 0 ? workingDays.length : 5
      const targetMinsPerDay = Math.round(targetTotalMins / numWorkingDays)

      if (pool.length === 0 || workingDays.length === 0) {
        // Sin tipos configurados: horario uniforme por defecto
        const sched = defaultSchedule(targetMinsPerDay)
        assignments = workingDays.map(() => ({ ...sched, tipoId: null, tipoNombre: null }))
      } else {
        const tipoMinsArr = pool.map(t => calcMins(t.horaInicio, t.horaFin))
        const minTipoMins = Math.min(...tipoMinsArr)

        if (targetTotalMins < minTipoMins * workingDays.length) {
          // Ningún tipo cabe uniformemente (ej: 25h con mínimo de 5.5h/día = 27.5h)
          // → horario uniforme manual sin tipo asignado
          const sched = defaultSchedule(targetMinsPerDay)
          assignments = workingDays.map(() => ({ ...sched, tipoId: null, tipoNombre: null }))
        } else if (pool.length === 1) {
          const t = pool[0]
          const tipoMins = calcMins(t.horaInicio, t.horaFin)
          if (tipoMins <= targetMinsPerDay + 30) {
            assignments = workingDays.map(() => ({ horaInicio: t.horaInicio, horaFin: t.horaFin, tipoId: t.id, tipoNombre: t.nombre }))
          } else {
            // El único tipo disponible es demasiado largo para las horas contratadas → horario manual
            const sched = defaultSchedule(targetMinsPerDay)
            assignments = workingDays.map(() => ({ ...sched, tipoId: null, tipoNombre: null }))
          }
        } else {
          // Seleccionar cada día el tipo más cercano a (horas_restantes / días_restantes)
          // Esto da distribución uniforme cuando es posible (25h→5×5h) y mezcla
          // natural cuando no (35h con [8h,5.5h] → 3×8h + 2×5.5h)
          let remaining = targetTotalMins
          assignments = []
          for (let i = 0; i < workingDays.length; i++) {
            const daysLeft   = workingDays.length - i
            const targetToday = remaining / daysLeft
            const best = pool.reduce((prev, curr) =>
              Math.abs(calcMins(curr.horaInicio, curr.horaFin) - targetToday) <
              Math.abs(calcMins(prev.horaInicio, prev.horaFin) - targetToday)
                ? curr : prev
            )
            assignments.push({ horaInicio: best.horaInicio, horaFin: best.horaFin, tipoId: best.id, tipoNombre: best.nombre })
            remaining -= calcMins(best.horaInicio, best.horaFin)
          }
        }
      }

      for (let i = 0; i < workingDays.length; i++) {
        const { dayStr } = workingDays[i]
        const key = `${emp.id}-${dayStr}`
        if (existingSet.has(key)) continue
        plan.push({ empleadoId: emp.id, empleadoNombre: emp.nombre, fecha: dayStr, ...assignments[i] })
      }
    }

    // ── Generate shifts for fixed employees ───────────────────────────────────
    for (const emp of fixedEmps) {
      if (empIdsWithShifts.has(emp.id)) continue
      addShiftsForEmp(emp, offDaysMap.get(emp.id)!)
    }

    // ── Pull in rotating employees only where still understaffed ─────────────
    // Enfoque iterativo: por cada rol, sigue añadiendo rotativos hasta cubrir el déficit
    // (o hasta que no queden rotativos disponibles). coveredByPlan se recalcula cada vez.
    if (hasNeeds) {
      const coveredByPlan = (roleKey: keyof Slots, dayIdx: number) =>
        existingShifts.filter(s => {
          const e = empleados.find(x => x.id === s.empleadoId)
          return e && empMatchesRole(e, roleKey) && s.fecha.toISOString().slice(0, 10) === days[dayIdx]
        }).length +
        plan.filter(p => {
          const e = empleados.find(x => x.id === p.empleadoId)
          return e && empMatchesRole(e, roleKey) && p.fecha === days[dayIdx]
        }).length

      const maxDeficitForRole = (roleKey: keyof Slots) => {
        let max = 0
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          const needed = needsPerDay[dayIdx][roleKey]
          if (!needed) continue
          max = Math.max(max, needed - coveredByPlan(roleKey, dayIdx))
        }
        return max
      }

      // Fases de días-libres ya usadas por rol → garantiza patrones complementarios
      const usedPhasesForRole: Partial<Record<keyof Slots, Set<number>>> = {}

      for (const roleKey of ROLE_KEYS) {
        // Añade rotativos de uno en uno hasta que no hay déficit (o no quedan disponibles)
        const usedInThisRole = new Set<number>() // evita reintentar el mismo empleado
        if (!usedPhasesForRole[roleKey]) usedPhasesForRole[roleKey] = new Set()
        const usedPhases = usedPhasesForRole[roleKey]!

        for (let attempt = 0; attempt < rotatingEmps.length; attempt++) {
          if (maxDeficitForRole(roleKey) <= 0) break

          const pool = rotatingEmps
            .filter(e =>
              empMatchesRole(e, roleKey) &&
              !empIdsWithShifts.has(e.id) &&
              !plan.some(p => p.empleadoId === e.id) &&
              !usedInThisRole.has(e.id)
            )
            .sort((a, b) => {
              // Prioridad: rol exacto primero, luego por horas libres (más horas libres → antes)
              const aExact = ROL_MAP[roleKey].includes(a.rol ?? '') ? 1 : 0
              const bExact = ROL_MAP[roleKey].includes(b.rol ?? '') ? 1 : 0
              if (bExact !== aExact) return bExact - aExact
              const aMins = otherRestaurantShifts.filter(s => s.empleadoId === a.id).reduce((s, t) => s + calcMins(t.horaInicio, t.horaFin), 0)
              const bMins = otherRestaurantShifts.filter(s => s.empleadoId === b.id).reduce((s, t) => s + calcMins(t.horaInicio, t.horaFin), 0)
              return aMins - bMins
            })

          if (pool.length === 0) break

          const emp = pool[0]
          usedInThisRole.add(emp.id)

          // Calcular días libres ANTES de decidir si añadir al empleado
          if (!offDaysMap.has(emp.id)) {
            const rotIdx       = rotatingEmps.filter(e => e.tipo === emp.tipo).indexOf(emp)
            const fixed        = emp.diasLibresFijos ?? []
            const naturalPhase = (rotIdx + (emp.faseLibreRotacion ?? 0)) % 4
            const resolvedPhase = fixed.length === 0 && usedPhases.has(naturalPhase)
              ? bestComplementPhase(usedPhases, naturalPhase)
              : naturalPhase
            if (fixed.length === 0) usedPhases.add(resolvedPhase)
            offDaysMap.set(emp.id, getOffDays(emp, rotIdx, fixed.length === 0 ? resolvedPhase : undefined))
          }

          // Solo añadir el rotativo si puede cubrir al menos un día con déficit.
          // Si sus días libres coinciden exactamente con los días deficitarios,
          // no puede ayudar — evitar que genere exceso sin resolver el déficit.
          const empOffDays = offDaysMap.get(emp.id)!
          const deficitDayNums = days
            .map((_, i) => i)
            .filter(i => needsPerDay[i][roleKey] > 0 && coveredByPlan(roleKey, i) < needsPerDay[i][roleKey])
          const otherDiasBloqueados = new Set(
            otherRestaurantShifts
              .filter(s => s.empleadoId === emp.id)
              .map(s => s.fecha.toISOString().slice(0, 10))
          )
          const puedeAlgunDeficit = deficitDayNums.some(
            i => !empOffDays.has(i) && !otherDiasBloqueados.has(days[i])
          )
          if (deficitDayNums.length > 0 && !puedeAlgunDeficit) continue // no puede ayudar, skip

          addShiftsForEmp(emp, empOffDays, true)
        }
      }
    }

    // ── Pruning: eliminar exceso de fijos cuando coverage > need ─────────────
    // Si la necesidad es 1 encargado/día y hay 2 fijos disponibles ese día,
    // el excedente se elimina del plan → queda libre para otros restaurantes.
    // IMPORTANTE: usa matching estricto (solo rol exacto, sin sustitutos)
    // para no confundir un cocinero-con-puedeJefeCocina con un jefe de cocina real.
    if (hasNeeds) {
      const empMatchesRoleStrict = (e: typeof empleados[0], roleKey: keyof Slots) =>
        ROL_MAP[roleKey].includes(empRolKey(e))

      const toRemoveKeys = new Set<string>() // `${empId}-${fecha}`

      // Helper: contar turnos activos de un empleado (excluyendo ya marcados)
      const activeCount = (empId: number) =>
        plan.filter(p => p.empleadoId === empId && !toRemoveKeys.has(`${p.empleadoId}-${p.fecha}`)).length

      for (const roleKey of ROLE_KEYS) {
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          const needed = needsPerDay[dayIdx][roleKey]
          if (!needed) continue
          const dayStr = days[dayIdx]

          const existingCount = existingShifts.filter(s => {
            const e = empleados.find(x => x.id === s.empleadoId)
            return e && empMatchesRoleStrict(e, roleKey) && s.fecha.toISOString().slice(0, 10) === dayStr
          }).length

          const activeEntries = plan.filter(p => {
            if (toRemoveKeys.has(`${p.empleadoId}-${p.fecha}`)) return false
            const e = empleados.find(x => x.id === p.empleadoId)
            return e && empMatchesRoleStrict(e, roleKey) && p.fecha === dayStr
          })

          const excess = activeEntries.length + existingCount - needed
          if (excess <= 0) continue

          // Quitar de los empleados con más turnos asignados (los que "sobran" más),
          // PERO solo si el empleado sigue cubriendo sus horas contractuales tras la eliminación.
          const candidates = [...activeEntries]
            .filter(c => {
              const emp = empleados.find(x => x.id === c.empleadoId)
              if (!emp) return true
              // Horas en otros restaurantes esta semana (invariantes)
              const minsOtros = otherRestaurantShifts
                .filter(s => s.empleadoId === c.empleadoId)
                .reduce((s, t) => s + calcMins(t.horaInicio, t.horaFin), 0)
              // Horas en este restaurante si se quita este turno
              const minsRestantes = plan
                .filter(p => p.empleadoId === c.empleadoId && p.fecha !== c.fecha && !toRemoveKeys.has(`${p.empleadoId}-${p.fecha}`))
                .reduce((s, p) => s + calcMins(p.horaInicio, p.horaFin), 0)
              // Solo eliminar si sigue cubriendo el contrato
              return (minsRestantes + minsOtros) >= (emp.horasSemanales ?? 40) * 60
            })
            .sort((a, b) => activeCount(b.empleadoId) - activeCount(a.empleadoId))
            .slice(0, excess)

          for (const c of candidates) {
            toRemoveKeys.add(`${c.empleadoId}-${c.fecha}`)
          }
        }
      }

      // Aplicar eliminaciones
      for (let i = plan.length - 1; i >= 0; i--) {
        const p = plan[i]
        if (toRemoveKeys.has(`${p.empleadoId}-${p.fecha}`)) plan.splice(i, 1)
      }
    }

    const empleadosConTurnosFinal = [...new Set(existingShifts.map(s => s.empleadoId))]

    // Cobertura por rol y día (para el preview)
    const coverage = days.map((dayStr, dayIdx) => {
      const needed = needsPerDay[dayIdx]
      const covered: Slots = { jefeCocina: 0, cocineros: 0, friegaplatos: 0, produccion: 0, camareros: 0, encargados: 0 }
      for (const roleKey of ROLE_KEYS) {
        covered[roleKey] =
          plan.filter(p => {
            const e = empleados.find(x => x.id === p.empleadoId)
            return e && empMatchesRole(e, roleKey) && p.fecha === dayStr
          }).length +
          existingShifts.filter(s => {
            const e = empleados.find(x => x.id === s.empleadoId)
            return e && empMatchesRole(e, roleKey) && s.fecha.toISOString().slice(0, 10) === dayStr
          }).length
      }
      const roles = ROLE_KEYS.filter(rk => needed[rk] > 0)
      const ok      = roles.every(rk => covered[rk] >= needed[rk])
      const partial = !ok && roles.some(rk => covered[rk] > 0)
      return { fecha: dayStr, needed, covered, ok, partial }
    })

    if (preview) {
      return { plan, empleadosConTurnos: empleadosConTurnosFinal, hasNeeds, coverage }
    }

    await Promise.all(
      plan.map(p =>
        prisma.turnoEmpleado.create({
          data: {
            restaurantId, empleadoId: p.empleadoId, tipoId: p.tipoId,
            fecha: new Date(`${p.fecha}T00:00:00.000Z`),
            horaInicio: p.horaInicio, horaFin: p.horaFin,
          },
        })
      )
    )

    // Avanzar faseLibreRotacion para empleados que usaron el patrón de rotación
    // (solo los que no tienen días fijos — los que sí los tienen usan ancla fija)
    const empIdsPlanned = new Set(plan.map(p => p.empleadoId))
    const rotatingPlanned = [...fixedEmps, ...rotatingEmps].filter(e =>
      empIdsPlanned.has(e.id) && (e.diasLibresFijos ?? []).length === 0
    )
    if (rotatingPlanned.length > 0) {
      await Promise.all(rotatingPlanned.map(e =>
        prisma.empleado.update({
          where: { id: e.id },
          data:  { faseLibreRotacion: (((e.faseLibreRotacion ?? 0) + 1) % 4) },
        })
      ))
    }

    return reply.status(201).send({ created: plan.length, plan })
  })
}
