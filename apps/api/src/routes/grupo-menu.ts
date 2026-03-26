import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

// Tipo de cada nivel del menú de grupo
// vegetariano / sinCerdo / sinGluten son los platos alternativos para esa restricción.
// Si son null, se usa el plato base para ese grupo.
const nivelSchema = z.object({
  nivel:        z.number().int().positive(),
  plato:        z.string().min(1),
  vegetariano:  z.string().nullable().default(null),
  sinCerdo:     z.string().nullable().default(null),
  sinGluten:    z.string().nullable().default(null),
  esPostre:     z.boolean().default(false),
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
      incluyePostre = true,
      restricciones,
    } = req.body as {
      mesaId: number
      camareroNombre?: string
      incluyePostre?: boolean
      restricciones: {
        normales:      number
        vegetarianos:  number
        sinCerdo:      number
        sinGluten:     number
      }
    }

    if (!mesaId) return reply.status(400).send({ error: 'mesaId requerido' })
    if (!restricciones) return reply.status(400).send({ error: 'restricciones requerido' })

    const { normales = 0, vegetarianos = 0, sinCerdo = 0, sinGluten = 0 } = restricciones
    const totalPax = normales + vegetarianos + sinCerdo + sinGluten
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

    // Generar items de cocina por nivel
    for (const nv of niveles) {
      if (nv.esPostre && !incluyePostre) continue

      // Acumular cantidades por nombre de plato
      const counts = new Map<string, number>()
      const add = (plato: string, qty: number) => {
        if (qty <= 0) return
        counts.set(plato, (counts.get(plato) ?? 0) + qty)
      }

      add(nv.plato,                           normales)
      add(nv.vegetariano  ?? nv.plato,        vegetarianos)
      add(nv.sinCerdo     ?? nv.plato,        sinCerdo)
      add(nv.sinGluten    ?? nv.plato,        sinGluten)

      for (const [nombre, cantidad] of counts.entries()) {
        await prisma.comandaItem.create({
          data: {
            comandaId: comanda.id,
            nombre,
            precio:   0,
            cantidad,
            tipo:     'cocina',
            nivel:    nv.nivel,
            ronda:    1,
            nota:     '',
          },
        })
      }
    }

    const result = await prisma.comanda.findUnique({
      where: { id: comanda.id },
      include: { items: true, mesa: true },
    })

    broadcast(template.restaurantId, 'update')
    return reply.status(201).send(result)
  })
}
