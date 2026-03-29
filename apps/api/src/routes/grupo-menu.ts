import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

// Tipo de cada nivel del menú de grupo (nuevo formato multi-plato)
// nombre: nombre del curso ("Tapas", "Pescados", "Carnes", "Postre")
// platos: lista de platos del curso
// Legacy: soporta el campo "plato" (string) de plantillas antiguas
const nivelSchema = z.object({
  nivel:    z.number().int().positive(),
  nombre:   z.string().default(''),
  platos:   z.array(z.string()).default([]),
  esPostre: z.boolean().default(false),
  // Legacy campos (backward compat)
  plato:       z.string().optional(),
  vegetariano: z.string().nullable().optional(),
  sinCerdo:    z.string().nullable().optional(),
  sinGluten:   z.string().nullable().optional(),
})

const templateSchema = z.object({
  restaurantId: z.number().int().positive(),
  nombre:       z.string().min(1),
  precio:       z.number().min(0),
  niveles:      z.array(nivelSchema).min(1),
})

export async function grupoMenuRoutes(app: FastifyInstance) {

  // Listar plantillas de un restaurante
  app.get('/grupo-menu', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.grupoMenuTemplate.findMany({
      where: { restaurantId: Number(restaurantId), activo: true },
      orderBy: { precio: 'asc' },
    })
  })

  // Crear plantilla
  app.post('/grupo-menu', async (req, reply) => {
    const result = templateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const template = await prisma.grupoMenuTemplate.create({ data: result.data })
    return reply.status(201).send(template)
  })

  // Actualizar plantilla
  app.put('/grupo-menu/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = templateSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const template = await prisma.grupoMenuTemplate.update({ where: { id }, data: result.data })
    return template
  })

  // Eliminar (desactivar) plantilla
  app.delete('/grupo-menu/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.grupoMenuTemplate.update({ where: { id }, data: { activo: false } })
    return reply.status(204).send()
  })

  // Generar comanda de grupo a partir de una plantilla
  app.post('/grupo-menu/:id/generar', async (req, reply) => {
    const templateId = Number((req.params as { id: string }).id)
    const {
      mesaId,
      camareroNombre,
      pax,
      platosSeleccionados,
      // Legacy compat
      incluyePostre = true,
      restricciones,
    } = req.body as {
      mesaId: number
      camareroNombre?: string
      pax?: number
      platosSeleccionados?: Array<{ nombre: string; nivel: number; cantidad: number }>
      incluyePostre?: boolean
      restricciones?: { normales: number; vegetarianos: number; sinCerdo: number; sinGluten: number }
    }

    if (!mesaId) return reply.status(400).send({ error: 'mesaId requerido' })

    const totalPax = pax ?? (restricciones
      ? restricciones.normales + restricciones.vegetarianos + restricciones.sinCerdo + restricciones.sinGluten
      : 0)
    if (totalPax <= 0) return reply.status(400).send({ error: 'Debe haber al menos una persona' })

    const template = await prisma.grupoMenuTemplate.findUnique({ where: { id: templateId } })
    if (!template) return reply.status(404).send({ error: 'Plantilla no encontrada' })

    // Verificar mesa disponible
    const mesaOcupada = await prisma.comanda.findFirst({
      where: { mesaId, estado: { in: ['abierta', 'enviada', 'facturada'] } },
    })
    if (mesaOcupada) return reply.status(409).send({ error: 'La mesa ya tiene una comanda activa' })

    // Crear comanda
    const comanda = await prisma.comanda.create({
      data: {
        restaurantId: template.restaurantId,
        mesaId,
        pax: totalPax,
        estado: 'enviada',
        camareroNombre: camareroNombre ?? null,
      },
    })

    const niveles = template.niveles as z.infer<typeof nivelSchema>[]

    // Añadir item de facturación (tipo barra, precio × pax)
    await prisma.comandaItem.create({
      data: {
        comandaId: comanda.id,
        nombre:    `Menú ${template.nombre}`,
        precio:    template.precio,
        cantidad:  totalPax,
        tipo:      'barra',
        nivel:     1,
        ronda:     1,
        nota:      'Precio por persona',
      },
    })

    // Generar items de cocina
    if (platosSeleccionados) {
      // Nuevo formato: items explícitos con cantidades ajustadas por el usuario
      for (const p of platosSeleccionados) {
        if (p.cantidad <= 0) continue
        await prisma.comandaItem.create({
          data: {
            comandaId: comanda.id,
            nombre:    p.nombre,
            precio:    0,
            cantidad:  p.cantidad,
            tipo:      'cocina',
            nivel:     p.nivel,
            ronda:     1,
            nota:      '',
          },
        })
      }
    } else {
      // Formato legacy: auto-generar desde plantilla + restricciones
      const { normales = 0, vegetarianos = 0, sinCerdo = 0, sinGluten = 0 } = restricciones ?? {}
      for (const nv of niveles) {
        if (nv.esPostre && !incluyePostre) continue
        if (nv.platos && nv.platos.length > 0) {
          for (const nombre of nv.platos) {
            await prisma.comandaItem.create({
              data: { comandaId: comanda.id, nombre, precio: 0, cantidad: 1, tipo: 'cocina', nivel: nv.nivel, ronda: 1, nota: '' },
            })
          }
          continue
        }
        if (!nv.plato) continue
        const counts = new Map<string, number>()
        const add = (plato: string, qty: number) => { if (qty > 0 && plato) counts.set(plato, (counts.get(plato) ?? 0) + qty) }
        add(nv.plato,                   normales)
        add(nv.vegetariano ?? nv.plato, vegetarianos)
        add(nv.sinCerdo    ?? nv.plato, sinCerdo)
        add(nv.sinGluten   ?? nv.plato, sinGluten)
        for (const [nombre, cantidad] of counts.entries()) {
          await prisma.comandaItem.create({
            data: { comandaId: comanda.id, nombre, precio: 0, cantidad, tipo: 'cocina', nivel: nv.nivel, ronda: 1, nota: '' },
          })
        }
      }
    }

    const result = await prisma.comanda.findUnique({
      where: { id: comanda.id },
      include: { items: true, mesa: true },
    })

    broadcast(template.restaurantId, 'update')
    return reply.status(201).send(result)
  })

  // ── Agendados ────────────────────────────────────────────────────────────────

  const agendadoSchema = z.object({
    restaurantId:  z.number().int().positive(),
    templateId:    z.number().int().positive(),
    fecha:         z.string().min(1), // ISO date string YYYY-MM-DD
    pax:           z.number().int().positive(),
    restricciones: z.object({
      normales:     z.number().int().min(0),
      vegetarianos: z.number().int().min(0),
      sinCerdo:     z.number().int().min(0),
      sinGluten:    z.number().int().min(0),
    }),
    notas: z.string().optional(),
  })

  // GET /grupo-menu/agendados/pendientes-hoy — grupos de hoy pendientes en todos los restaurantes
  app.get('/grupo-menu/agendados/pendientes-hoy', async (_req, reply) => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy)
    manana.setDate(manana.getDate() + 1)

    return prisma.grupoAgendado.findMany({
      where: {
        fecha:  { gte: hoy, lt: manana },
        estado: 'pendiente',
      },
      include: { template: true, restaurant: true },
      orderBy: { fecha: 'asc' },
    })
  })

  // GET /grupo-menu/agendados?restaurantId=X[&fecha=YYYY-MM-DD]
  app.get('/grupo-menu/agendados', async (req, reply) => {
    const { restaurantId, fecha } = req.query as { restaurantId?: string; fecha?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const where: Record<string, unknown> = {
      restaurantId: Number(restaurantId),
      estado: { not: 'cancelado' },
    }

    if (fecha) {
      const day = new Date(fecha)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)
      where.fecha = { gte: day, lt: nextDay }
    }

    return prisma.grupoAgendado.findMany({
      where,
      include: { template: true },
      orderBy: { fecha: 'asc' },
    })
  })

  // POST /grupo-menu/agendados
  app.post('/grupo-menu/agendados', async (req, reply) => {
    const result = agendadoSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { fecha, ...rest } = result.data
    const agendado = await prisma.grupoAgendado.create({
      data: { ...rest, fecha: new Date(fecha) },
      include: { template: true },
    })
    return reply.status(201).send(agendado)
  })

  // PATCH /grupo-menu/agendados/:id
  app.patch('/grupo-menu/agendados/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = agendadoSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { fecha, ...rest } = result.data
    const agendado = await prisma.grupoAgendado.update({
      where: { id },
      data: { ...rest, ...(fecha ? { fecha: new Date(fecha) } : {}) },
      include: { template: true },
    })
    return agendado
  })

  // DELETE /grupo-menu/agendados/:id
  app.delete('/grupo-menu/agendados/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.grupoAgendado.delete({ where: { id } })
    return reply.status(204).send()
  })

  // POST /grupo-menu/agendados/:id/asignar — assign to a mesa, creates comanda
  app.post('/grupo-menu/agendados/:id/asignar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { mesaId, camareroNombre, incluyePostre = true } =
      req.body as { mesaId: number; camareroNombre?: string; incluyePostre?: boolean }
    if (!mesaId) return reply.status(400).send({ error: 'mesaId requerido' })

    const agendado = await prisma.grupoAgendado.findUnique({
      where: { id },
      include: { template: true },
    })
    if (!agendado) return reply.status(404).send({ error: 'Agendado no encontrado' })
    if (agendado.estado === 'asignado') return reply.status(409).send({ error: 'Ya fue asignado' })

    const mesaOcupada = await prisma.comanda.findFirst({
      where: { mesaId, estado: { in: ['abierta', 'enviada', 'facturada'] } },
    })
    if (mesaOcupada) return reply.status(409).send({ error: 'La mesa ya tiene una comanda activa' })

    const restricciones = agendado.restricciones as {
      normales: number; vegetarianos: number; sinCerdo: number; sinGluten: number
    }
    const { normales = 0, vegetarianos = 0, sinCerdo = 0, sinGluten = 0 } = restricciones
    const totalPax = normales + vegetarianos + sinCerdo + sinGluten

    const template = agendado.template
    const comanda = await prisma.comanda.create({
      data: {
        restaurantId:   agendado.restaurantId,
        mesaId,
        pax:            totalPax,
        estado:         'enviada',
        camareroNombre: camareroNombre ?? null,
      },
    })

    await prisma.comandaItem.create({
      data: {
        comandaId: comanda.id,
        nombre:    `Menú ${template.nombre}`,
        precio:    template.precio,
        cantidad:  totalPax,
        tipo:      'barra',
        nivel:     1,
        ronda:     1,
        nota:      'Precio por persona',
      },
    })

    const niveles = template.niveles as z.infer<typeof nivelSchema>[]
    for (const nv of niveles) {
      if (nv.esPostre && !incluyePostre) continue
      if (nv.platos && nv.platos.length > 0) {
        for (const nombre of nv.platos) {
          await prisma.comandaItem.create({
            data: { comandaId: comanda.id, nombre, precio: 0, cantidad: 1, tipo: 'cocina', nivel: nv.nivel, ronda: 1, nota: '' },
          })
        }
        continue
      }
      if (!nv.plato) continue
      const counts = new Map<string, number>()
      const add = (plato: string, qty: number) => {
        if (qty <= 0 || !plato) return
        counts.set(plato, (counts.get(plato) ?? 0) + qty)
      }
      add(nv.plato,                    normales)
      add(nv.vegetariano ?? nv.plato,  vegetarianos)
      add(nv.sinCerdo    ?? nv.plato,  sinCerdo)
      add(nv.sinGluten   ?? nv.plato,  sinGluten)
      for (const [nombre, cantidad] of counts.entries()) {
        await prisma.comandaItem.create({
          data: { comandaId: comanda.id, nombre, precio: 0, cantidad, tipo: 'cocina', nivel: nv.nivel, ronda: 1, nota: '' },
        })
      }
    }

    await prisma.grupoAgendado.update({
      where: { id },
      data: { estado: 'asignado', comandaId: comanda.id },
    })

    const result = await prisma.comanda.findUnique({
      where: { id: comanda.id },
      include: { items: true, mesa: true },
    })

    broadcast(agendado.restaurantId, 'update')
    return reply.status(201).send(result)
  })
}
