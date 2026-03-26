import { FastifyInstance } from 'fastify'
import { prisma } from '../server'

export async function reservasRoutes(app: FastifyInstance) {
  // ─── PUBLIC ROUTES (no auth) — must be registered BEFORE parameterized routes ───

  // GET /reservas/publica/config?slug=X
  app.get('/reservas/publica/config', async (req, reply) => {
    const { slug } = req.query as { slug?: string }
    if (!slug) return reply.status(400).send({ error: 'slug requerido' })

    const config = await prisma.reservaConfig.findUnique({
      where: { slug },
      include: {
        restaurant: { select: { nombre: true } },
        horarios: { where: { activo: true } },
      },
    })

    if (!config) return reply.status(404).send({ error: 'Restaurante no encontrado' })

    return {
      restaurantNombre: config.restaurant.nombre,
      slug: config.slug,
      activo: config.activo,
      maxPaxPorSlot: config.maxPaxPorSlot,
      duracionMin: config.duracionMin,
      diasAntelacion: config.diasAntelacion,
      horarios: config.horarios,
    }
  })

  // GET /reservas/publica/slots?slug=X&fecha=Y&pax=Z
  app.get('/reservas/publica/slots', async (req, reply) => {
    const { slug, fecha, pax } = req.query as { slug?: string; fecha?: string; pax?: string }
    if (!slug || !fecha || !pax) return reply.status(400).send({ error: 'Faltan parámetros: slug, fecha, pax' })

    const config = await prisma.reservaConfig.findUnique({
      where: { slug },
      include: { horarios: { where: { activo: true } } },
    })

    if (!config || !config.activo) return reply.status(404).send({ error: 'Restaurante no encontrado o inactivo' })

    const requestedPax = parseInt(pax, 10)
    if (isNaN(requestedPax) || requestedPax < 1) return reply.status(400).send({ error: 'pax inválido' })

    const fechaDate = new Date(fecha)
    // day of week: 1=Monday ... 7=Sunday
    const dow = fechaDate.getDay() === 0 ? 7 : fechaDate.getDay()

    // Filter horarios that cover this weekday
    const horariosDelDia = config.horarios.filter((h) => {
      const dias = h.diasSemana as number[]
      return dias.includes(dow)
    })

    if (horariosDelDia.length === 0) return []

    // Build start/end of day for DB query
    const startOfDay = new Date(fecha + 'T00:00:00.000Z')
    const startOfNextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

    // Fetch existing reservas for this config on this date
    const reservasDelDia = await prisma.reserva.findMany({
      where: {
        configId: config.id,
        fecha: { gte: startOfDay, lt: startOfNextDay },
        estado: { not: 'cancelada' },
      },
      select: { hora: true, pax: true },
    })

    // Group reserved pax by hora
    const reservadoPorSlot: Record<string, number> = {}
    for (const r of reservasDelDia) {
      reservadoPorSlot[r.hora] = (reservadoPorSlot[r.hora] ?? 0) + r.pax
    }

    // Generate slots from all horarios of the day
    const allSlots: { hora: string; disponible: boolean; disponibles: number }[] = []
    const seenSlots = new Set<string>()

    for (const horario of horariosDelDia) {
      const [startH, startM] = horario.horaInicio.split(':').map(Number)
      const [endH, endM] = horario.horaFin.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      const endMinutes = endH * 60 + endM

      for (let m = startMinutes; m < endMinutes; m += horario.intervaloMin) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        const hora = `${hh}:${mm}`

        if (seenSlots.has(hora)) continue
        seenSlots.add(hora)

        const reservado = reservadoPorSlot[hora] ?? 0
        const disponibles = horario.maxPax - reservado
        allSlots.push({
          hora,
          disponible: disponibles >= requestedPax,
          disponibles: Math.max(0, disponibles),
        })
      }
    }

    // Sort by hora
    allSlots.sort((a, b) => a.hora.localeCompare(b.hora))
    return allSlots
  })

  // POST /reservas/publica
  app.post('/reservas/publica', async (req, reply) => {
    const { slug, fecha, hora, pax, nombre, telefono, email, notas } = req.body as {
      slug: string
      fecha: string
      hora: string
      pax: number
      nombre: string
      telefono: string
      email?: string
      notas?: string
    }

    if (!slug || !fecha || !hora || !pax || !nombre || !telefono) {
      return reply.status(400).send({ error: 'Faltan campos requeridos' })
    }

    const config = await prisma.reservaConfig.findUnique({
      where: { slug },
      include: { horarios: { where: { activo: true } } },
    })

    if (!config || !config.activo) {
      return reply.status(404).send({ error: 'Restaurante no encontrado o no acepta reservas' })
    }

    // Re-check capacity
    const fechaDate = new Date(fecha)
    const dow = fechaDate.getDay() === 0 ? 7 : fechaDate.getDay()
    const horarioValido = config.horarios.find((h) => {
      const dias = h.diasSemana as number[]
      return dias.includes(dow)
    })
    if (!horarioValido) {
      return reply.status(400).send({ error: 'No hay servicio ese día' })
    }

    const startOfDay = new Date(fecha + 'T00:00:00.000Z')
    const startOfNextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

    const reservasEnSlot = await prisma.reserva.aggregate({
      where: {
        configId: config.id,
        fecha: { gte: startOfDay, lt: startOfNextDay },
        hora,
        estado: { not: 'cancelada' },
      },
      _sum: { pax: true },
    })

    const reservado = reservasEnSlot._sum.pax ?? 0

    // Find the horario that covers this slot
    const [slotH, slotM] = hora.split(':').map(Number)
    const slotMinutes = slotH * 60 + slotM
    const horarioParaSlot = config.horarios.find((h) => {
      const dias = h.diasSemana as number[]
      if (!dias.includes(dow)) return false
      const [startH, startM] = h.horaInicio.split(':').map(Number)
      const [endH, endM] = h.horaFin.split(':').map(Number)
      return slotMinutes >= startH * 60 + startM && slotMinutes < endH * 60 + endM
    })

    const maxPax = horarioParaSlot?.maxPax ?? config.maxPaxPorSlot
    if (reservado + pax > maxPax) {
      return reply.status(409).send({ error: 'No hay disponibilidad para ese horario' })
    }

    const reserva = await prisma.reserva.create({
      data: {
        restaurantId: config.restaurantId,
        configId: config.id,
        fecha: startOfDay,
        hora,
        pax,
        nombre,
        telefono,
        email: email || null,
        notas: notas || null,
        estado: 'confirmada',
        origen: 'web',
      },
    })

    return reply.status(201).send(reserva)
  })

  // ─── ADMIN ROUTES ───

  // GET /reservas/config/:restaurantId
  app.get('/reservas/config/:restaurantId', async (req, reply) => {
    const restaurantId = parseInt((req.params as { restaurantId: string }).restaurantId, 10)

    const config = await prisma.reservaConfig.findUnique({
      where: { restaurantId },
      include: { horarios: true },
    })

    if (!config) return reply.status(404).send({ error: 'Configuración no encontrada' })
    return config
  })

  // PUT /reservas/config/:restaurantId
  app.put('/reservas/config/:restaurantId', async (req, reply) => {
    const restaurantId = parseInt((req.params as { restaurantId: string }).restaurantId, 10)
    const { slug, activo, maxPaxPorSlot, duracionMin, diasAntelacion } = req.body as {
      slug: string
      activo?: boolean
      maxPaxPorSlot?: number
      duracionMin?: number
      diasAntelacion?: number
    }

    if (!slug) return reply.status(400).send({ error: 'slug requerido' })

    const config = await prisma.reservaConfig.upsert({
      where: { restaurantId },
      update: {
        slug,
        ...(activo !== undefined && { activo }),
        ...(maxPaxPorSlot !== undefined && { maxPaxPorSlot }),
        ...(duracionMin !== undefined && { duracionMin }),
        ...(diasAntelacion !== undefined && { diasAntelacion }),
      },
      create: {
        restaurantId,
        slug,
        activo: activo ?? true,
        maxPaxPorSlot: maxPaxPorSlot ?? 20,
        duracionMin: duracionMin ?? 90,
        diasAntelacion: diasAntelacion ?? 30,
      },
      include: { horarios: true },
    })

    return config
  })

  // POST /reservas/horarios
  app.post('/reservas/horarios', async (req, reply) => {
    const { configId, nombre, diasSemana, horaInicio, horaFin, intervaloMin, maxPax } = req.body as {
      configId: number
      nombre?: string
      diasSemana: number[]
      horaInicio: string
      horaFin: string
      intervaloMin?: number
      maxPax?: number
    }

    const horario = await prisma.reservaHorario.create({
      data: {
        configId,
        nombre: nombre ?? 'Noche',
        diasSemana,
        horaInicio,
        horaFin,
        intervaloMin: intervaloMin ?? 15,
        maxPax: maxPax ?? 20,
      },
    })

    return reply.status(201).send(horario)
  })

  // PATCH /reservas/horarios/:id
  app.patch('/reservas/horarios/:id', async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10)
    const body = req.body as {
      nombre?: string
      diasSemana?: number[]
      horaInicio?: string
      horaFin?: string
      intervaloMin?: number
      maxPax?: number
      activo?: boolean
    }

    const horario = await prisma.reservaHorario.update({
      where: { id },
      data: body,
    })

    return horario
  })

  // DELETE /reservas/horarios/:id
  app.delete('/reservas/horarios/:id', async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10)
    await prisma.reservaHorario.delete({ where: { id } })
    return reply.status(204).send()
  })

  // GET /reservas?restaurantId=X&fecha=Y
  app.get('/reservas', async (req, reply) => {
    const { restaurantId, fecha } = req.query as { restaurantId?: string; fecha?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const rId = parseInt(restaurantId, 10)
    const targetFecha = fecha ?? new Date().toISOString().split('T')[0]

    const startOfDay = new Date(targetFecha + 'T00:00:00.000Z')
    const startOfNextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

    const reservas = await prisma.reserva.findMany({
      where: {
        restaurantId: rId,
        fecha: { gte: startOfDay, lt: startOfNextDay },
      },
      include: {
        restaurant: { select: { nombre: true } },
      },
      orderBy: { hora: 'asc' },
    })

    return reservas
  })

  // POST /reservas — admin manual creation
  app.post('/reservas', async (req, reply) => {
    const { restaurantId, fecha, hora, pax, nombre, telefono, email, notas } = req.body as {
      restaurantId: number
      fecha: string
      hora: string
      pax: number
      nombre: string
      telefono: string
      email?: string
      notas?: string
    }

    const config = await prisma.reservaConfig.findUnique({ where: { restaurantId } })
    if (!config) return reply.status(404).send({ error: 'Configuración no encontrada para este restaurante' })

    const startOfDay = new Date(fecha + 'T00:00:00.000Z')

    const reserva = await prisma.reserva.create({
      data: {
        restaurantId,
        configId: config.id,
        fecha: startOfDay,
        hora,
        pax,
        nombre,
        telefono,
        email: email || null,
        notas: notas || null,
        estado: 'confirmada',
        origen: 'manual',
      },
    })

    return reply.status(201).send(reserva)
  })

  // PATCH /reservas/:id — update estado
  app.patch('/reservas/:id', async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10)
    const { estado } = req.body as { estado: string }

    const reserva = await prisma.reserva.update({
      where: { id },
      data: { estado },
    })

    return reserva
  })

  // DELETE /reservas/:id
  app.delete('/reservas/:id', async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10)
    await prisma.reserva.delete({ where: { id } })
    return reply.status(204).send()
  })
}
