import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'

const itemSchema = z.object({
  nombre:   z.string().min(1),
  precio:   z.number().min(0),
  cantidad: z.number().int().positive().default(1),
  nota:     z.string().default(''),
  tipo:     z.enum(['cocina', 'barra']).default('cocina'),
  // directo (encargado): el item entra ya "servido" — se cobra pero NO pasa por el flujo
  // de envío a cocina/barra (no imprime, no marcha pasa, no cambia el estado de la comanda)
  directo:  z.boolean().default(false),
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

    const autoItems = await prisma.menuItem.findMany({
      where: { restaurantId, autoPorPax: true, activo: true },
    })

    const comanda = await prisma.comanda.create({
      data: {
        restaurantId, mesaId, pax, estado: 'abierta', camareroNombre: camareroNombre ?? null,
        items: autoItems.length > 0 ? {
          create: autoItems.map(item => ({
            nombre:        item.nombre,
            precio:        item.precio,
            cantidad:      pax,
            tipo:          'barra' as const,
            nota:          '',
            nivel:         null,
            ronda:         0,
            autoGenerado:  true,
          })),
        } : undefined,
      },
      include: { items: true, mesa: true },
    })
    broadcast(restaurantId, 'update')
    return reply.status(201).send(comanda)
  })

  // Detalle de una comanda
  app.get('/comandas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: { items: true, mesa: true, mermas: true },
    })
    if (!comanda) return reply.status(404).send({ error: 'No encontrada' })
    return comanda
  })

  // Si la comanda ya tiene la cuenta impresa (facturada/liberada) y sus items cambian
  // (merma, invitación, restitución, item directo…), la cuenta en papel queda vieja → reimprimir antes de cobrar
  const marcarCuentaDesactualizada = async (comandaId: number) => {
    const c = await prisma.comanda.findUnique({ where: { id: comandaId }, select: { estado: true } })
    if (c && (c.estado === 'facturada' || c.estado === 'liberada')) {
      await prisma.comanda.update({ where: { id: comandaId }, data: { cuentaDesactualizada: true } })
    }
  }

  // Añadir item a comanda (si estaba enviada, vuelve a abierta para re-enviar)
  app.post('/comandas/:id/items', async (req, reply) => {
    const comandaId = Number((req.params as { id: string }).id)
    const result = itemSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { directo, ...itemData } = result.data

    const { restaurantId: rId } = (await prisma.comanda.findUnique({ where: { id: comandaId }, select: { restaurantId: true } }))!

    // Item directo (encargado): entra ya servido — autoGenerado lo excluye de cocina/barra
    // y nivel/ronda preasignados evitan que el flujo de envío lo recoja. No toca el estado.
    if (directo) {
      // Taps repetidos del mismo item acumulan cantidad en la misma fila
      const existingDirecto = await prisma.comandaItem.findFirst({
        where: { comandaId, nombre: itemData.nombre, autoGenerado: true, nivel: 1, invitacion: false },
      })
      const item = existingDirecto
        ? await prisma.comandaItem.update({
            where: { id: existingDirecto.id },
            data: { cantidad: existingDirecto.cantidad + itemData.cantidad },
          })
        : await prisma.comandaItem.create({
            data: { ...itemData, comandaId, autoGenerado: true, nivel: 1, ronda: 1 },
          })
      await marcarCuentaDesactualizada(comandaId)
      broadcast(rId, 'update')
      return reply.status(201).send(item)
    }

    // Si ya existe un item igual sin enviar (nivel null) y con la misma nota, incrementar cantidad en vez de crear uno nuevo
    // (un item con comentario distinto va en fila aparte para que cocina lo vea claro)
    const existing = await prisma.comandaItem.findFirst({
      where: { comandaId, nombre: result.data.nombre, tipo: result.data.tipo, nivel: null, nota: result.data.nota },
    })

    if (existing) {
      const [item] = await prisma.$transaction([
        prisma.comandaItem.update({
          where: { id: existing.id },
          data: { cantidad: existing.cantidad + result.data.cantidad },
        }),
        prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
      ])
      broadcast(rId, 'update')
      return reply.status(200).send(item)
    }

    const [item] = await prisma.$transaction([
      prisma.comandaItem.create({ data: { ...itemData, comandaId } }),
      prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
    ])
    broadcast(rId, 'update')
    return reply.status(201).send(item)
  })

  // Actualizar cantidad/nota de un item
  app.patch('/comandas/:id/items/:itemId', async (req, reply) => {
    const comandaId = Number((req.params as { id: string; itemId: string }).id)
    const itemId    = Number((req.params as { id: string; itemId: string }).itemId)
    const { cantidad, nota, invitacion, invitadoPor, invitacionMotivo } = req.body as {
      cantidad?: number; nota?: string; invitacion?: boolean; invitadoPor?: string; invitacionMotivo?: string
    }

    // Si es un item de barra ya enviado (nivel != null) y se incrementa la cantidad,
    // resetear nivel a null y la comanda a 'abierta' para activar "Enviar a barra"
    const existing = await prisma.comandaItem.findUnique({ where: { id: itemId } })

    // Para items de COCINA ya confirmados: crear item delta pendiente (el OrdenarModal
    // muestra solo el extra). Para BARRA: actualizar directamente (no pasa por OrdenarModal).
    const isIncrementConfirmedCocina = existing?.tipo !== 'barra' && existing?.nivel != null
      && cantidad !== undefined && cantidad > (existing.cantidad ?? 0)

    const isIncrementConfirmedBarra = existing?.tipo === 'barra' && existing?.nivel != null
      && cantidad !== undefined && cantidad > (existing.cantidad ?? 0)

    if (isIncrementConfirmedBarra) {
      const delta = cantidad! - (existing?.cantidad ?? 0)
      const pending = await prisma.comandaItem.findFirst({
        where: { comandaId, nombre: existing!.nombre, tipo: 'barra', nivel: null },
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
            data: { comandaId, nombre: existing!.nombre, precio: existing!.precio, tipo: 'barra', cantidad: delta, nota: '' },
          }),
          prisma.comanda.update({ where: { id: comandaId }, data: { estado: 'abierta' } }),
        ])
        return item
      }
    }

    if (isIncrementConfirmedCocina) {
      const delta = cantidad! - (existing?.cantidad ?? 0)
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
      data: {
        ...(cantidad !== undefined && { cantidad }),
        ...(nota !== undefined && { nota }),
        // 🎁 Invitación de la casa: al desmarcar, se limpia quién la marcó y el motivo
        ...(invitacion !== undefined && {
          invitacion,
          invitadoPor: invitacion ? (invitadoPor ?? null) : null,
          invitacionMotivo: invitacion ? (invitacionMotivo?.trim() || null) : null,
        }),
      },
    })
    if (cantidad !== undefined || invitacion !== undefined) await marcarCuentaDesactualizada(comandaId)
    const { restaurantId: rId } = (await prisma.comanda.findUnique({ where: { id: comandaId }, select: { restaurantId: true } }))!
    broadcast(rId, 'update')
    return item
  })

  // Eliminar item de comanda
  app.delete('/comandas/:id/items/:itemId', async (req, reply) => {
    const comandaId = Number((req.params as { id: string; itemId: string }).id)
    const itemId    = Number((req.params as { id: string; itemId: string }).itemId)
    await prisma.comandaItem.delete({ where: { id: itemId } })
    await marcarCuentaDesactualizada(comandaId)
    const c = await prisma.comanda.findUnique({ where: { id: comandaId }, select: { restaurantId: true } })
    if (c) broadcast(c.restaurantId, 'update')
    return reply.status(204).send()
  })

  // Enviar comanda a cocina (con niveles de salida)
  app.patch('/comandas/:id/enviar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { niveles } = req.body as { niveles: { itemId: number; nivel: number; nota?: string }[] }

    // Calcular la ronda: siguiente al máximo ya enviado (ronda > 0)
    const { _max } = await prisma.comandaItem.aggregate({
      where: { comandaId: id, ronda: { gt: 0 } },
      _max: { ronda: true },
    })
    const nextRonda = (_max.ronda ?? 0) + 1

    await Promise.all(
      (niveles ?? []).map(({ itemId, nivel, nota }) =>
        prisma.comandaItem.update({
          where: { id: itemId },
          data: { nivel, ronda: nextRonda, ...(nota !== undefined && { nota }) },
        })
      )
    )

    // Primera comandada → registrar la hora ("hora de comandada"); re-envíos no la pisan
    const previa = await prisma.comanda.findUnique({ where: { id }, select: { enviadaAt: true } })
    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'enviada', ...(previa?.enviadaAt ? {} : { enviadaAt: new Date() }) },
      include: { items: true, mesa: true },
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Cambiar PAX (actualiza cantidad de auto-items y los marca como pendientes)
  app.patch('/comandas/:id/pax', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { pax } = req.body as { pax: number }
    if (!pax || pax < 1) return reply.status(400).send({ error: 'pax inválido' })

    const current = await prisma.comanda.findUnique({ where: { id } })
    if (!current) return reply.status(404).send({ error: 'No encontrado' })

    // Resetear auto-items a pendiente (nivel=null) para que el camarero confirme con "Oído"
    await prisma.comandaItem.updateMany({
      where: { comandaId: id, autoGenerado: true },
      data:  { cantidad: pax, nivel: null, ronda: 0 },
    })

    // Si estaba enviada, volver a abierta para mostrar el botón "Oído"
    const nuevoEstado = current.estado === 'enviada' ? 'abierta' : current.estado
    const comanda = await prisma.comanda.update({
      where: { id },
      data:  { pax, estado: nuevoEstado },
      include: { items: true, mesa: true },
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Facturar comanda (camarero imprimió la cuenta)
  app.patch('/comandas/:id/facturar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'facturada', cuentaDesactualizada: false }, // (re)imprimir deja la cuenta al día
      include: { items: true, mesa: true },
    })
    broadcast(comanda.restaurantId, 'update')
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
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Cerrar comanda (cobrada — requiere método de pago)
  app.patch('/comandas/:id/cerrar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { metodoPago, propina = 0 } = req.body as { metodoPago?: 'cash' | 'tarjeta'; propina?: number }

    if (metodoPago !== 'cash' && metodoPago !== 'tarjeta')
      return reply.status(400).send({ error: 'metodoPago requerido (cash | tarjeta)' })

    const actual = await prisma.comanda.findUnique({ where: { id } })
    if (!actual) return reply.status(404).send({ error: 'Comanda no encontrada' })
    if (actual.estado === 'cerrada')
      return reply.status(409).send({ error: 'La comanda ya está cobrada' })
    if (actual.estado !== 'facturada' && actual.estado !== 'liberada')
      return reply.status(409).send({ error: `No se puede cobrar una comanda en estado "${actual.estado}" — primero hay que facturarla` })
    if (actual.cuentaDesactualizada)
      return reply.status(409).send({ error: 'La cuenta cambió después de imprimirse — reimprimí la cuenta antes de cobrar' })

    const comanda = await prisma.comanda.update({
      where: { id },
      data: { estado: 'cerrada', closedAt: new Date(), metodoPago, propina },
      include: { items: true, mesa: true },
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Mover comanda a otra mesa libre
  app.patch('/comandas/:id/mover-mesa', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { mesaId } = req.body as { mesaId: number }
    if (!mesaId) return reply.status(400).send({ error: 'mesaId requerido' })

    const ocupada = await prisma.comanda.findFirst({
      where: { mesaId, estado: { in: ['abierta', 'enviada', 'facturada'] } },
    })
    if (ocupada) return reply.status(409).send({ error: 'La mesa destino ya tiene una comanda activa' })

    const comanda = await prisma.comanda.update({
      where: { id },
      data: { mesaId },
      include: { items: true, mesa: true, mermas: true },
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Mover items de una comanda a otra (merge parcial o total)
  // itemIds: si se omite, mueve todos los items
  app.post('/comandas/merge', async (req, reply) => {
    const { sourceId, targetId, itemIds } = req.body as { sourceId: number; targetId: number; itemIds?: number[] }
    if (!sourceId || !targetId) return reply.status(400).send({ error: 'sourceId y targetId requeridos' })

    const source = await prisma.comanda.findUnique({ where: { id: sourceId }, include: { items: true } })
    if (!source) return reply.status(404).send({ error: 'Comanda origen no encontrada' })

    const targetComanda = await prisma.comanda.findUnique({ where: { id: targetId } })
    if (!targetComanda) return reply.status(404).send({ error: 'Comanda destino no encontrada' })

    const itemsToMove = itemIds
      ? source.items.filter(i => itemIds.includes(i.id))
      : source.items

    if (itemsToMove.length === 0) return reply.status(400).send({ error: 'No hay items para mover' })

    // Si la comanda destino ya está facturada (cobrada por camarero, pendiente de cierre por encargado),
    // crear una nueva comanda limpia en esa mesa — igual que al abrir una mesa con factura pendiente.
    // La comanda facturada queda intacta en la cola del dashboard.
    let effectiveTargetId = targetId
    if (targetComanda.estado === 'facturada') {
      const nuevaComanda = await prisma.comanda.create({
        data: {
          restaurantId: targetComanda.restaurantId,
          mesaId:       targetComanda.mesaId,
          pax:          source.pax,
          estado:       'abierta',
          camareroNombre: source.camareroNombre,
        },
      })
      effectiveTargetId = nuevaComanda.id
    }

    // Para cada item a mover: preservar nivel/ronda (items ya enviados mantienen su estado)
    // Solo fusionar con items pendientes (nivel null) si el item a mover también es pendiente
    for (const item of itemsToMove) {
      if (item.nivel === null) {
        const existing = await prisma.comandaItem.findFirst({
          where: { comandaId: effectiveTargetId, nombre: item.nombre, tipo: item.tipo, nivel: null },
        })
        if (existing) {
          await prisma.comandaItem.update({
            where: { id: existing.id },
            data: { cantidad: existing.cantidad + item.cantidad },
          })
          await prisma.comandaItem.delete({ where: { id: item.id } })
          continue
        }
      }
      // Item enviado (nivel != null) o sin match pendiente: crear fila nueva preservando nivel/ronda
      await prisma.comandaItem.create({
        data: {
          comandaId: effectiveTargetId,
          nombre:    item.nombre,
          precio:    item.precio,
          tipo:      item.tipo,
          cantidad:  item.cantidad,
          nota:      item.nota,
          nivel:     item.nivel,
          ronda:     item.ronda,
        },
      })
      await prisma.comandaItem.delete({ where: { id: item.id } })
    }

    // Determinar estado correcto del destino: 'enviada' si todos los items tienen nivel asignado
    const allItems = await prisma.comandaItem.findMany({ where: { comandaId: effectiveTargetId } })
    const todoEnviado = allItems.length > 0 && allItems.every(i => i.nivel !== null)
    if (effectiveTargetId === targetId) {
      // comanda existente: si todos enviados → 'enviada', si no → 'abierta'
      await prisma.comanda.update({ where: { id: effectiveTargetId }, data: { estado: todoEnviado ? 'enviada' : 'abierta' } })
    } else if (todoEnviado) {
      // nueva comanda creada para target facturado: si todos los items son enviados, marcar 'enviada'
      await prisma.comanda.update({ where: { id: effectiveTargetId }, data: { estado: 'enviada' } })
    }

    // Si la comanda origen quedó vacía, liberarla
    const remaining = await prisma.comandaItem.count({ where: { comandaId: sourceId } })
    if (remaining === 0) {
      await prisma.comanda.update({ where: { id: sourceId }, data: { estado: 'liberada' } })
    }

    const target = await prisma.comanda.findUnique({
      where: { id: effectiveTargetId },
      include: { items: true, mesa: true, mermas: true },
    })
    broadcast(source.restaurantId, 'update')
    return target
  })
}
