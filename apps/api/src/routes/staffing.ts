import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { planificar, PUESTOS, Necesidad } from '../planificador'

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
      where: { empleadoId: { in: empIds }, fecha: { gte: dateStart, lte: dateEnd }, estado: { not: 'ausente' } },
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

  // GET /staffing/mi-horario?desde=YYYY-MM-DD — "Mi horario": los turnos de la semana del empleado
  // de la sesión (el de nadie más), en todos los locales. desde = lunes; sin él, la semana actual.
  app.get('/staffing/mi-horario', async (req, reply) => {
    const empleadoId = req.user.empleadoId
    if (!empleadoId) return reply.status(400).send({ error: 'Entra con tu PIN para ver tu horario' })
    const { desde } = req.query as { desde?: string }
    let lunes: Date
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) lunes = new Date(`${desde}T00:00:00.000Z`)
    else {
      const hoy = new Date(`${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })}T00:00:00.000Z`)
      const dow = hoy.getUTCDay()
      lunes = new Date(hoy.getTime() - (dow === 0 ? 6 : dow - 1) * 24 * 60 * 60 * 1000)
    }
    const fin = new Date(lunes.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
    const turnos = await prisma.turnoEmpleado.findMany({
      where: { empleadoId, fecha: { gte: lunes, lte: fin } },
      select: {
        id: true, fecha: true, horaInicio: true, horaFin: true, estado: true,
        tipo: { select: { nombre: true, color: true } },
        restaurant: { select: { id: true, nombre: true } },
      },
      orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
    })
    return { desde: lunes.toISOString().slice(0, 10), turnos }
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
            where: { restaurantId: r.id, fecha: { gte: dateStart, lte: dateEnd }, estado: { not: 'ausente' } },
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
              where: { restaurantId: r.id, fecha: { gte: dateStart, lte: dateEnd }, estado: { not: 'ausente' } },
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
        where: { empleadoId: { in: empIds }, fecha: { gte: weekStart, lte: weekEnd }, estado: { not: 'ausente' } },
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
        where: { empleadoId: { in: empIds }, fecha: { gte: weekStart, lte: weekEnd }, estado: { not: 'ausente' } },
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
          if (t.restaurantId !== r.id || t.estado === 'ausente') return false
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
        where: { fecha: { gte: weekStart, lte: weekEnd }, estado: { not: 'ausente' } },
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
      horasSemanales:    z.number().int().refine(v => [20, 25, 30, 35, 40].includes(v), { message: 'Debe ser 20, 25, 30, 35 o 40' }).optional(),
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

  // ── Planning automático ("por necesidad", ver planificador.ts) ─────────────────────────
  // Carga todo lo que el planificador necesita para una semana y unos locales
  async function cargarPlan(weekStart: string, restaurantIds: number[], prestar: boolean) {
    const dateStart = new Date(`${weekStart}T00:00:00.000Z`)
    const dateEnd   = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
    const [empleados, tipos, existentes, necDia, necFecha] = await Promise.all([
      prisma.empleado.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.turnoTipo.findMany({ where: { activo: true } }),
      prisma.turnoEmpleado.findMany({ where: { fecha: { gte: dateStart, lte: dateEnd } } }),
      prisma.staffingNecesidadDia.findMany({ where: { restaurantId: { in: restaurantIds } } }),
      prisma.staffingNecesidadFecha.findMany({ where: { restaurantId: { in: restaurantIds }, fecha: { gte: dateStart, lte: dateEnd } } }),
    ])
    const dias = Array.from({ length: 7 }, (_, i) => new Date(dateStart.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    const necesidades: Record<number, Necesidad[]> = {}
    for (const r of restaurantIds) {
      necesidades[r] = dias.map((dia, d) => {
        const base = necDia.find(n => n.restaurantId === r && n.diaSemana === d)
        const extra = necFecha.find(n => n.restaurantId === r && n.fecha.toISOString().slice(0, 10) === dia)
        const v = (c: 'jefeCocina' | 'cocineros' | 'friegaplatos' | 'camareros' | 'encargados') => (base?.[c] ?? 0) + (extra?.[c] ?? 0)
        return { jefeCocina: v('jefeCocina'), cocineros: v('cocineros'), friegaplatos: v('friegaplatos'), camareros: v('camareros'), encargados: v('encargados') }
      })
    }
    // Fuera del automático: los marcados "excluir" y los que encajan con un tipo de turno marcado "excluir del auto-planning"
    const excluido = (e: typeof empleados[0]) => e.excluirPlanning || tipos.some(t =>
      t.excluirAutoPlanning && (!t.tipoEmpleado || t.tipoEmpleado === e.tipo) && (!t.rolEmpleado || t.rolEmpleado === e.rol))
    const resultado = planificar({
      restaurantIds, necesidades, tipos, prestar,
      empleados: empleados.filter(e => !excluido(e)).map(e => ({
        id: e.id, nombre: e.nombre, tipo: e.tipo, rol: e.rol, restaurantId: e.restaurantId, horasSemanales: e.horasSemanales,
        diasLibresFijos: e.diasLibresFijos ?? [], puedeEncargado: e.puedeEncargado, puedeJefeCocina: e.puedeJefeCocina,
      })),
      existentes: existentes.map(t => ({
        empleadoId: t.empleadoId, restaurantId: t.restaurantId, horaInicio: t.horaInicio, horaFin: t.horaFin, ausente: t.estado === 'ausente',
        dia: Math.round((new Date(`${t.fecha.toISOString().slice(0, 10)}T00:00:00.000Z`).getTime() - dateStart.getTime()) / (24 * 60 * 60 * 1000)),
      })),
    })
    const nombre = new Map(empleados.map(e => [e.id, e.nombre]))
    const plan = resultado.turnos.map(t => ({ ...t, empleadoNombre: nombre.get(t.empleadoId) ?? '', fecha: dias[t.dia] }))
    return { dias, resultado, plan, empleados }
  }

  async function guardarPlan(plan: Array<{ empleadoId: number; restaurantId: number; fecha: string; horaInicio: string; horaFin: string; tipoId: number | null }>) {
    if (!plan.length) return 0
    const { count } = await prisma.turnoEmpleado.createMany({
      data: plan.map(p => ({
        restaurantId: p.restaurantId, empleadoId: p.empleadoId, tipoId: p.tipoId,
        fecha: new Date(`${p.fecha}T00:00:00.000Z`), horaInicio: p.horaInicio, horaFin: p.horaFin,
      })),
    })
    return count
  }

  const planSchema = z.object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preview:   z.boolean().optional().default(false),
  })

  // POST /staffing/auto-planning — un solo local (con sus fijos y los rotativos; sin prestar fijos de otros
  // locales, que todavía no se planificaron). Lo ya planificado en la semana se respeta.
  app.post('/staffing/auto-planning', async (req, reply) => {
    const result = planSchema.extend({ restaurantId: z.number().int() }).safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantId, weekStart, preview } = result.data
    const { dias, resultado, plan } = await cargarPlan(weekStart, [restaurantId], false)
    const hasNeeds = resultado.cobertura[restaurantId].some(c => PUESTOS.some(p => c.needed[p] > 0))
    if (preview) {
      const coverage = resultado.cobertura[restaurantId].map((c, d) => {
        const pedidos = PUESTOS.filter(p => c.needed[p] > 0)
        const ok = pedidos.every(p => c.covered[p] >= c.needed[p])
        return {
          fecha: dias[d], ok, partial: !ok && pedidos.some(p => c.covered[p] > 0),
          needed: { ...c.needed, produccion: 0 }, covered: { ...c.covered, produccion: 0 },
        }
      })
      // Días sin turno de cada planificado (lo que antes era "su patrón de libres")
      const diasLibres: Record<number, { esta: number[]; siguiente: number[] }> = {}
      for (const id of new Set(plan.map(p => p.empleadoId))) {
        const trabaja = new Set(plan.filter(p => p.empleadoId === id).map(p => p.dia))
        diasLibres[id] = { esta: [0, 1, 2, 3, 4, 5, 6].filter(d => !trabaja.has(d)), siguiente: [] }
      }
      return { plan, empleadosConTurnos: [], hasNeeds, coverage, diasLibres, huecos: resultado.huecos, faltanHoras: resultado.faltanHoras }
    }
    const created = await guardarPlan(plan)
    return reply.status(201).send({ created, plan, huecos: resultado.huecos, faltanHoras: resultado.faltanHoras })
  })

  // POST /staffing/auto-planning-global — todos los locales elegidos a la vez: los rotativos van a donde más
  // falta y un fijo al que le sobra el día en su local se presta a otro que lo necesita.
  app.post('/staffing/auto-planning-global', async (req, reply) => {
    const result = planSchema.extend({ restaurantIds: z.array(z.number().int()).min(1) }).safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantIds, weekStart, preview } = result.data
    const { resultado, plan } = await cargarPlan(weekStart, restaurantIds, true)
    const porLocal: Record<number, number> = {}
    for (const r of restaurantIds) porLocal[r] = plan.filter(p => p.restaurantId === r).length
    const prestados = plan.filter(p => p.prestado).length
    const created = preview ? 0 : await guardarPlan(plan)
    return reply.status(preview ? 200 : 201).send({ created, porLocal, prestados, plan, huecos: resultado.huecos, faltanHoras: resultado.faltanHoras })
  })
}
