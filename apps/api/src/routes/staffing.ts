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
      estado:     z.string().optional(),
      tipoId:     z.number().int().optional().nullable(),
      horaInicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      horaFin:    z.string().regex(/^\d{2}:\d{2}$/).optional(),
      fecha:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      empleadoId: z.number().int().optional(),
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

    // Todos los empleados activos que NO son de este restaurante
    const candidatos = await prisma.empleado.findMany({
      where: {
        activo: true,
        OR: [{ restaurantId: null }, { restaurantId: { not: rid } }],
      },
      include: { restaurant: { select: { id: true, nombre: true } } },
    })

    // Empleados que ya tienen turno ese día (en cualquier restaurante)
    const ocupados = await prisma.turnoEmpleado.findMany({
      where: {
        empleadoId: { in: candidatos.map(e => e.id) },
        fecha: { gte: dateStart, lte: dateEnd },
      },
      select: { empleadoId: true },
    })
    const ocupadosSet = new Set(ocupados.map(t => t.empleadoId))

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
      if (e.rol && rolesExactos.includes(e.rol)) return true
      if (rol === 'jefeCocina' && e.rol === 'cocinero' && e.puedeJefeCocina) return true
      if (rol === 'encargados' && e.rol === 'camarero'  && e.puedeEncargado)  return true
      return false
    })

    return disponibles.map(e => ({
      id:           e.id,
      nombre:       e.nombre,
      rol:          e.rol,
      tipo:         e.tipo,
      horasSemanales: e.horasSemanales,
      restaurantId: e.restaurantId,
      restaurantNombre: e.restaurant?.nombre ?? null,
      esSuplente:
        (rol === 'jefeCocina' && e.rol === 'cocinero') ||
        (rol === 'encargados' && e.rol === 'camarero'),
    }))
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
    // Fases 2→3 crean efecto de 3 días seguidos entre semanas:
    //   Semana N  (fase 2): libra Dom+Lun
    //   Semana N+1 (fase 3): libra Lun+Mar
    //   → En el calendario: ...Sáb trabaja | Dom OFF | Lun OFF | Mar OFF | Mié trabaja...
    const OFF_PATTERNS_2: number[][] = [[2,3],[4,5],[6,0],[0,1]]
    // Para contratos <30h (3 días libres)
    const OFF_PATTERNS_3: number[][] = [[1,2,3],[3,4,5],[5,6,0],[0,1,2]]

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
    // Usa faseLibreRotacion persistida en el empleado para asegurar continuidad entre semanas.
    // Si el empleado tiene días fijos, se usan como ancla y no se avanza la fase.
    function getOffDays(emp: typeof empleados[0]): Set<number> {
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
          // Sin días fijos: escalonar por ID del empleado + avance de rotación semanal
          // → distintos empleados libran días distintos, y cada semana rotan
          const patterns = daysOffCount >= 3 ? OFF_PATTERNS_3 : OFF_PATTERNS_2
          const phase    = ((emp.id % 4) + (emp.faseLibreRotacion ?? 0) + 4) % 4
          patterns[phase].forEach(d => off.add(d))
        }
      }

      return off
    }

    const offDaysMap = new Map<number, Set<number>>()
    fixedEmps.forEach(emp => offDaysMap.set(emp.id, getOffDays(emp)))

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

      // Para rotativos: no programar en días donde el rol ya está cubierto
      if (hasNeeds && applyNeedsFilter) {
        const strictRoleKey = ROLE_KEYS.find(rk => ROL_MAP[rk].includes(empRolKey(emp)))
        if (strictRoleKey) {
          workingDays = workingDays.filter(({ dayStr, dayIdx }) => {
            const needed = needsPerDay[dayIdx][strictRoleKey]
            if (!needed) return true // sin necesidad configurada → siempre trabaja
            const alreadyCovered =
              plan.filter(p => {
                const e2 = empleados.find(x => x.id === p.empleadoId)
                return e2 && empMatchesRole(e2, strictRoleKey) && p.fecha === dayStr
              }).length +
              existingShifts.filter(s => {
                const e2 = empleados.find(x => x.id === s.empleadoId)
                return e2 && empMatchesRole(e2, strictRoleKey) && s.fecha.toISOString().slice(0, 10) === dayStr
              }).length
            return alreadyCovered < needed
          })
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

      for (const roleKey of ROLE_KEYS) {
        // Añade rotativos de uno en uno hasta que no hay déficit (o no quedan disponibles)
        for (let attempt = 0; attempt < rotatingEmps.length; attempt++) {
          if (maxDeficitForRole(roleKey) <= 0) break

          const pool = rotatingEmps
            .filter(e =>
              empMatchesRole(e, roleKey) &&
              !empIdsWithShifts.has(e.id) &&
              !plan.some(p => p.empleadoId === e.id)
            )
            .sort((a, b) => (b.rol !== null ? 1 : 0) - (a.rol !== null ? 1 : 0))

          if (pool.length === 0) break

          const emp = pool[0]
          if (!offDaysMap.has(emp.id)) {
            offDaysMap.set(emp.id, getOffDays(emp))
          }
          addShiftsForEmp(emp, offDaysMap.get(emp.id)!, true) // rotativos: filtrar por cobertura
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

          // Quitar de los empleados con más turnos asignados (los que "sobran" más)
          const candidates = [...activeEntries]
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
