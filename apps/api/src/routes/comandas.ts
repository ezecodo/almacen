import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

const itemSchema = z.object({
  nombre:   z.string().min(1),
  precio:   z.number().min(0),
  cantidad: z.number().int().positive().default(1),
  nota:     z.string().default(''),
  tipo:     z.enum(['cocina', 'barra']).default('cocina'),
})

export async function comandaRoutes(app: FastifyInstance) {

  // Comandas abiertas de un restaurante (para ver estado del salón)
  app.get('/comandas', async (req, reply) => {
    const { restaurantId, estado } = req.query as { restaurantId?: string; estado?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    // Por defecto devuelve abierta + enviada (mesa ocupada)
    const estadoFilter = estado
      ? { estado }
      : { estado: { in: ['abierta', 'enviada', 'facturada'] } }

    return prisma.comanda.findMany({
      where: {
        restaurantId: Number(restaurantId),
        ...estadoFilter,
      },
      include: {
        items: true,
        mesa: true,
        mermas: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  // Abrir comanda (nueva mesa)
  app.post('/comandas', async (req, reply) => {
    const { restaurantId, mesaId, pax, camareroNombre } = req.body as { restaurantId: number; mesaId: number; pax: number; camareroNombre?: string }
    if (!restaurantId || !mesaId || !pax) return reply.status(400).send({ error: 'restaurantId, mesaId y pax requeridos' })

    // Verificar que la mesa no tenga ya una comanda abierta
    const abierta = await prisma.comanda.findFirst({ where: { mesaId, estado: 'abierta' } })
    if (abierta) return reply.status(409).send({ error: 'La mesa ya tiene una comanda abierta' })

    const comanda = await prisma.comanda.create({
      data: { restaurantId, mesaId, pax, estado: 'abierta', camareroNombre: camareroNombre ?? null },
      include: { items: true, mesa: true },
    })
    return reply.status(201).send(comanda)
  })

  // Detalle de una comanda
  app.get('/comandas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: { items: true, mesa: true },
    })
    if (!comanda) return reply.status(404).send({ error: 'No encontrada' })
    return comanda
  })

  // Añadir item a comanda (si estaba enviada, vuelve a abierta para re-enviar)
  app.post('/comandas/:id/items', async (req, reply) => {
    const comandaId = Number((req.params as { id: string }).id)
    const result = itemSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    // Si ya existe un item igual sin enviar (nivel null), incrementar cantidad en vez de crear uno nuevo
    const existing = await prisma.comandaItem.findFirst({
      where: { comandaId, nombre: result.data.nombre, tipo: result.data.tipo, nivel: null },
    })

    if (existing) {
      const [item] = await prisma.$transaction([
        prisma.comandaItem.update({
          where: { id: existing.id },
          data: { cantidad: existing.cantidad + result.data.cantidad },
        }),
        prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
      ])
      return reply.status(200).send(item)
    }

    const [item] = await prisma.$transaction([
      prisma.comandaItem.create({ data: { ...result.data, comandaId } }),
      prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
    ])
    return reply.status(201).send(item)
  })

  // Actualizar cantidad/nota de un item
  app.patch('/comandas/:id/items/:itemId', async (req, reply) => {
    const comandaId = Number((req.params as { id: string; itemId: string }).id)
    const itemId    = Number((req.params as { id: string; itemId: string }).itemId)
    const { cantidad, nota } = req.body as { cantidad?: number; nota?: string }

    // Si es un item de barra ya enviado (nivel != null) y se incrementa la cantidad,
    // resetear nivel a null y la comanda a 'abierta' para activar "Enviar a barra"
    const existing = await prisma.comandaItem.findUnique({ where: { id: itemId } })

    // Si se incrementa la cantidad de un item ya confirmado (nivel != null):
    // en vez de modificar el item confirmado, crear/incrementar un item DELTA pendiente.
    // Así el OrdenarModal muestra solo el delta (p.ej. 1 extra) y el item original queda intacto.
    const isIncrementConfirmed = existing?.nivel != null
      && cantidad !== undefined && cantidad > (existing.cantidad ?? 0)

    if (isIncrementConfirmed) {
      const delta = cantidad! - existing!.cantidad
      const pending = await prisma.comandaItem.findFirst({
        where: { comandaId, nombre: existing!.nombre, tipo: existing!.tipo, nivel: null },
      })
      if (pending) {
        const [item] = await prisma.$transaction([
          prisma.comandaItem.update({
            where: { id: pending.id },
            data: { cantidad: pending.cantidad + delta },
          }),
          prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
        ])
        return item
      } else {
        const [item] = await prisma.$transaction([
          prisma.comandaItem.create({
            data: { comandaId, nombre: existing!.nombre, precio: existing!.precio, tipo: existing!.tipo, cantidad: delta, nota: '' },
          }),
          prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
        ])
        return item
      }
    }

    const item = await prisma.comandaItem.update({
      where: { id: itemId },
      data: { ...(cantidad !== undefined && { cantidad }), ...(nota !== undefined && { nota }) },
    })
    return item
  })

  // Eliminar item de comanda
  app.delete('/comandas/:id/items/:itemId', async (req, reply) => {
    const itemId = Number((req.params as { id: string; itemId: string }).itemId)
    await prisma.comandaItem.delete({ where: { id: itemId } })
    return reply.status(204).send()
  })

  // Enviar comanda a cocina (con niveles de salida)
  app.patch('/comandas/:id/enviar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { niveles } = req.body as { niveles: { itemId: number; nivel: number; nota?: string }[] }

    await Promise.all(
      (niveles ?? []).map(({ itemId, nivel, nota }) =>
        prisma.comandaItem.update({
          where: { id: itemId },
          data: { nivel, ...(nota !== undefined && { nota }) },
        })
      )
    )

    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'enviada' },
      include: { items: true, mesa: true },
    })
    return comanda
  })

  // Facturar comanda (camarero imprimió la cuenta)
  app.patch('/comandas/:id/facturar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'facturada' },
      include: { items: true, mesa: true },
    })
    return comanda
  })

  // Liberar mesa (camarero confirma que entregó cuenta — mesa queda libre pero pendiente de cobro)
  app.patch('/comandas/:id/liberar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'liberada' },
      include: { items: true, mesa: true },
    })
    return comanda
  })

  // Cerrar comanda (cobrada — requiere método de pago)
  app.patch('/comandas/:id/cerrar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { metodoPago } = req.body as { metodoPago?: 'cash' | 'tarjeta' }

    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'cerrada', closedAt: new Date(), metodoPago: metodoPago ?? null },
      include: { items: true, mesa: true },
    })
    return comanda
  })
}
