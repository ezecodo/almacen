import { FastifyInstance } from 'fastify'
import { Prisma, ComandaItem } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'
import { publicarTicket, DestinoImpresion } from '../mqtt'
import { MODO_LOCAL } from '../local'
import { ahoraEnMadrid, diaDeServicio } from '../dia-servicio'
import { cierreDeDivision, divisionSchema, totalCobrable } from '../pago'

// Lo que ve la sala de la reserva de una mesa: 📅 reserva / 🚶 walk-in en el mapa y en la cabecera
const reservaDeMesa = { select: { id: true, origen: true, nombre: true, hora: true, notas: true } } as const

// Fecha (YYYY-MM-DD) y hora (HH:MM) en Barcelona, para apuntar un walk-in en el libro del día

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

type ComandaConMesa = Prisma.ComandaGetPayload<{
  include: { items: true; mesa: { include: { floorPlan: true } } }
}>

// Publica por MQTT el ticket (texto plano, formato ESC/POS nativo del lado de la Pi)
// de los items recién comandados en esta ronda, a la Pi vinculada al restaurante.
// Los destinos (impresora, IP, copias) salen de las rutas de /admin/tickets para la sala
// de la mesa: la Pi no decide nada. Sin Pi vinculada no se publica; un tipo de item sin
// ruta en esa sala no se imprime en ningún lado.
async function imprimirTicketComanda(comanda: ComandaConMesa, items: ComandaItem[], nextRonda: number) {
  const restaurante = await prisma.restaurant.findUnique({
    where: { id: comanda.restaurantId },
    select: { piCodigo: true },
  })
  if (!restaurante?.piCodigo) return

  const floorPlanId = comanda.mesa?.floorPlanId
  const rutas = floorPlanId
    ? await prisma.impresionRuta.findMany({
        where: { floorPlanId, tipoTicket: { in: ['cocina', 'barra'] } },
        include: { impresora: true },
      })
    : []
  const destinosDe = (tipoTicket: string): DestinoImpresion[] =>
    rutas
      .filter((r) => r.tipoTicket === tipoTicket)
      .map((r) => ({ impresora: r.impresora.nombre, ip: r.impresora.ip, copias: r.copias }))

  // Categorías que salen con su nombre (ej. POSTRES): un nivel que es todo platos de una de ellas
  // sale en el ticket con ese nombre en vez de PRIMEROS, SEGUNDOS… Una subcategoría hereda la
  // opción de su categoría padre (y sale con el nombre del padre).
  const deLaCarta = await prisma.menuItem.findMany({
    where: { nombre: { in: items.map((i) => i.nombre) }, OR: [{ restaurantId: comanda.restaurantId }, { restaurantId: null }] },
    select: { nombre: true, categoria: true },
  })
  const categorias = await prisma.menuCategoria.findMany({
    where: { nombre: { in: deLaCarta.map((m) => m.categoria) }, OR: [{ restaurantId: comanda.restaurantId }, { restaurantId: null }] },
    select: { nombre: true, nombreEnTicket: true, parent: { select: { nombre: true, nombreEnTicket: true } } },
  })
  const seccionDeCat = new Map<string, string>()
  for (const c of categorias) {
    if (c.nombreEnTicket) seccionDeCat.set(c.nombre, c.nombre)
    else if (c.parent?.nombreEnTicket) seccionDeCat.set(c.nombre, c.parent.nombre)
  }
  const seccionDe = new Map(deLaCarta.map((m) => [m.nombre, seccionDeCat.get(m.categoria) ?? null]))

  // Alergias de la mesa: van delante de la nota de mesa, así salen en la línea COM: del ticket
  // (cocina y barra) sin cambiar el programa de la Box
  const alergenos = comanda.alergenoIds.length
    ? await prisma.alergeno.findMany({ where: { id: { in: comanda.alergenoIds } }, orderBy: { orden: 'asc' }, select: { nombre: true } })
    : []
  const notaMesa = [
    alergenos.length ? `ALÉRGICO: ${alergenos.map((a) => a.nombre.toUpperCase()).join(', ')}` : '',
    comanda.notaMesa,
  ].filter(Boolean).join(' · ')

  publicarTicket(restaurante.piCodigo, {
    ticket_id: `cmd-${comanda.id}-r${nextRonda}`,
    sala: comanda.mesa?.floorPlan?.nombre ?? '',
    destinos: { Comida: destinosDe('cocina'), Bebida: destinosDe('barra') },
    mesa: String(comanda.mesa?.numero ?? '?'),
    camarero: comanda.camareroNombre ?? '',
    pax: comanda.pax,
    no_comparten: comanda.noComparten,
    nota_mesa: notaMesa || undefined,
    items: items.map((i) => ({
      nombre: i.nombre,
      cantidad: i.cantidad,
      tipo: i.tipo === 'barra' ? 'Bebida' : 'Comida',
      notas: i.nota || null,
      nivel: i.nivel,
      seccion: seccionDe.get(i.nombre) ?? null,
    })),
  })
}

// Foto de la cuenta cobrada al deshacer el cobro (Comanda.cobroDeshecho)
const cobroDeshechoSchema = z.object({
  items: z.array(z.object({ nombre: z.string(), precio: z.number(), cantidad: z.number(), invitacion: z.boolean() })),
  total: z.number(),
  metodoPago: z.string().nullable(),
  pagoEfectivo: z.number().nullable(),
  propina: z.number(),
  cobradaAt: z.string().nullable(),
  por: z.string(),
  motivo: z.string().optional(),
})
type CobroDeshecho = z.infer<typeof cobroDeshechoSchema>

// Qué cambió entre la cuenta cobrada y la nueva, plato a plato (nombre + precio), contando solo lo
// que se cobra (una invitación pasa a 0 €: es como quitar el plato)
function lineasCambiadas(antes: CobroDeshecho['items'], despues: { nombre: string; precio: number; cantidad: number; invitacion: boolean }[]) {
  const cuenta = (lista: typeof despues) => {
    const m = new Map<string, { nombre: string; precio: number; n: number }>()
    for (const i of lista) {
      if (i.invitacion) continue
      const k = `${i.nombre}|${i.precio}`
      const e = m.get(k) ?? { nombre: i.nombre, precio: i.precio, n: 0 }
      e.n += i.cantidad
      m.set(k, e)
    }
    return m
  }
  const a = cuenta(antes), d = cuenta(despues)
  const lineas: { nombre: string; precio: number; antes: number; despues: number; importe: number }[] = []
  for (const k of new Set([...a.keys(), ...d.keys()])) {
    const x = a.get(k), y = d.get(k)
    const na = x?.n ?? 0, nd = y?.n ?? 0
    if (na === nd) continue
    const { nombre, precio } = (x ?? y)!
    lineas.push({ nombre, precio, antes: na, despues: nd, importe: Math.round((nd - na) * precio * 100) / 100 })
  }
  return lineas
}

export async function comandaRoutes(app: FastifyInstance) {

  // Comandas abiertas de un restaurante (para ver estado del salón)
  app.get('/comandas', async (req, reply) => {
    const { restaurantId, estado, desde } = req.query as { restaurantId?: string; estado?: string; desde?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    // Por defecto devuelve abierta + enviada (mesa ocupada)
    const estadoFilter = estado
      ? { estado }
      : { estado: { in: ['abierta', 'enviada', 'facturada'] } }
    // desde (ISO): solo las cerradas a partir de ese momento (las cobradas del turno en el panel del
    // encargado del TPV; sin él, estado=cerrada traería toda la historia)
    const fechaDesde = desde ? new Date(desde) : null
    const desdeFilter = fechaDesde && !isNaN(fechaDesde.getTime()) ? { closedAt: { gte: fechaDesde } } : {}

    return prisma.comanda.findMany({
      where: {
        restaurantId: Number(restaurantId),
        ...estadoFilter,
        ...desdeFilter,
      },
      include: {
        items: true,
        mesa: true,
        mermas: true,
        reserva: reservaDeMesa,
        ...(estado === 'cerrada' ? { rectificativas: { orderBy: { createdAt: 'asc' as const } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  // Abrir comanda (nueva mesa)
  app.post('/comandas', async (req, reply) => {
    // walkin: el encargado sentó gente sin reserva — queda apuntado en el libro de reservas del día
    // (sin nombre ni teléfono). Solo cuenta si lo pide un encargado; sin internet no se apunta.
    const { restaurantId, mesaId, pax, camareroNombre, walkin } = req.body as { restaurantId: number; mesaId: number; pax: number; camareroNombre?: string; walkin?: boolean }
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
    if (walkin && !MODO_LOCAL && (req.user?.encargado || req.user?.tipo === 'admin')) {
      // Hora real de llegada, pero en el libro del día de servicio (un walk-in a las 00:30 es de esta noche)
      const { hora } = ahoraEnMadrid()
      const fecha = diaDeServicio()
      await prisma.reserva.create({
        data: {
          restaurantId, fecha: new Date(fecha + 'T00:00:00.000Z'), hora, pax,
          estado: 'sentada', origen: 'walkin', mesaId, comandaId: comanda.id, sentadaAt: new Date(),
        },
      })
    }
    broadcast(restaurantId, 'update')
    return reply.status(201).send(comanda)
  })

  // Detalle de una comanda
  app.get('/comandas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.findUnique({
      where: { id },
      include: { items: true, mesa: true, mermas: true, reserva: reservaDeMesa },
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
  // Información de la mesa para cocina, que el camarero pone al ordenar los niveles y vale para
  // esta comandada y las siguientes: si no comparte (cocina emplata individual), una nota general y
  // las alergias de la mesa.
  // Sale como COM: al final de los tickets.
  app.patch('/comandas/:id/para-cocina', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const datos = z.object({
      noComparten: z.boolean().optional(),
      notaMesa: z.string().trim().max(200).optional(),
      alergenoIds: z.array(z.number().int().positive()).max(30).optional(),
    }).parse(req.body)
    const existe = await prisma.comanda.findUnique({ where: { id }, select: { id: true } })
    if (!existe) return reply.status(404).send({ error: 'Comanda no encontrada' })
    const comanda = await prisma.comanda.update({ where: { id }, data: datos })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

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
      include: { items: true, mesa: { include: { floorPlan: true } } },
    })
    broadcast(comanda.restaurantId, 'update')

    // Imprimir ticket (Pi del local, vía printer-server/MQTT) — solo los items recién
    // enviados en esta ronda, sin los autoGenerado (pan x pax, etc.) que no van a cocina/barra.
    // No se espera acá (fire-and-forget) para no demorarle la respuesta al camarero por
    // el renderizado del ticket — mismo criterio que el resto de la app con la impresión.
    const idsEnviados = new Set((niveles ?? []).map((n) => n.itemId))
    const itemsParaImprimir = comanda.items.filter((i) => idsEnviados.has(i.id) && !i.autoGenerado)
    if (itemsParaImprimir.length > 0) {
      imprimirTicketComanda(comanda, itemsParaImprimir, nextRonda).catch((err) =>
        console.error('[mqtt] no se pudo armar el ticket de la comanda', comanda.id, err)
      )
    }

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

  // Pagar por separado: el camarero guarda la división de la cuenta (pagos hechos y cuántos quedan).
  // No cobra la mesa: la cierra el encargado con PATCH /cerrar, que toma de aquí método y propina.
  app.put('/comandas/:id/division', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z.object({ division: divisionSchema.nullable() }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'División inválida' })

    const actual = await prisma.comanda.findUnique({ where: { id }, include: { items: true } })
    if (!actual) return reply.status(404).send({ error: 'Comanda no encontrada' })
    if (actual.estado !== 'facturada' && actual.estado !== 'liberada')
      return reply.status(409).send({ error: actual.estado === 'cerrada' ? 'La mesa ya está cobrada' : 'Primero hay que imprimir la cuenta' })

    const division = body.data.division
    if (division) {
      const pagado = division.pagos.reduce((s, p) => s + Math.round(p.importe * 100), 0)
      if (pagado > Math.round(totalCobrable(actual.items) * 100))
        return reply.status(400).send({ error: 'Los pagos suman más que la cuenta' })
    }

    const comanda = await prisma.comanda.update({
      where: { id },
      data: { division: division && division.pagos.length + (division.quedan ? 1 : 0) > 0 ? division : Prisma.DbNull },
      include: { items: true, mesa: true },
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Cerrar comanda (cobrada — requiere método de pago, salvo si se pagó por separado: sale de la división)
  app.patch('/comandas/:id/cerrar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = req.body as { metodoPago?: 'cash' | 'tarjeta'; propina?: number }

    const actual = await prisma.comanda.findUnique({ where: { id }, include: { items: true } })
    if (!actual) return reply.status(404).send({ error: 'Comanda no encontrada' })
    if (actual.estado === 'cerrada')
      return reply.status(409).send({ error: 'La comanda ya está cobrada' })
    if (actual.estado !== 'facturada' && actual.estado !== 'liberada')
      return reply.status(409).send({ error: `No se puede cobrar una comanda en estado "${actual.estado}" — primero hay que facturarla` })
    if (actual.cuentaDesactualizada)
      return reply.status(409).send({ error: 'La cuenta cambió después de imprimirse — reimprimí la cuenta antes de cobrar' })

    const division = divisionSchema.safeParse(actual.division)
    let pago: { metodoPago: 'cash' | 'tarjeta' | 'mixto'; pagoEfectivo: number | null; propina: number }
    if (division.success && division.data.pagos.length > 0) {
      const r = cierreDeDivision(division.data, totalCobrable(actual.items))
      if (!r.ok) return reply.status(409).send({ error: r.error })
      // La propina la pone el encargado al cotejar los tickets (antes podía venir apuntada en cada pago)
      pago = { metodoPago: r.metodoPago, pagoEfectivo: r.pagoEfectivo, propina: r.propina + Math.max(0, body.propina ?? 0) }
    } else {
      if (body.metodoPago !== 'cash' && body.metodoPago !== 'tarjeta')
        return reply.status(400).send({ error: 'metodoPago requerido (cash | tarjeta)' })
      pago = { metodoPago: body.metodoPago, pagoEfectivo: null, propina: body.propina ?? 0 }
    }

    // Se vuelve a cobrar una mesa cuyo cobro se deshizo: si el importe cambió, queda la rectificativa
    const deshecho = cobroDeshechoSchema.safeParse(actual.cobroDeshecho)
    const comanda = await prisma.$transaction(async tx => {
      const c = await tx.comanda.update({
        where: { id },
        data: { estado: 'cerrada', closedAt: new Date(), ...pago, cobroDeshecho: Prisma.DbNull },
        include: { items: true, mesa: true },
      })
      if (deshecho.success) {
        const original = deshecho.data
        const importeNuevo = totalCobrable(c.items)
        const diferencia = Math.round((importeNuevo - original.total) * 100) / 100
        if (Math.abs(diferencia) >= 0.01) {
          const turno = await tx.turno.findFirst({ where: { restaurantId: c.restaurantId, estado: 'abierto' }, select: { id: true } })
          await tx.rectificativa.create({
            data: {
              restaurantId: c.restaurantId, comandaId: c.id, turnoId: turno?.id ?? null, mesaNumero: c.mesa ? String(c.mesa.numero) : null,
              por: req.user.nombre, deshizoPor: original.por, motivo: original.motivo ?? null,
              importeOriginal: original.total, importeNuevo, diferencia,
              devolucion: original.metodoPago,
              lineas: lineasCambiadas(original.items, c.items) as Prisma.InputJsonValue,
              original: original as Prisma.InputJsonValue,
            },
          })
        }
      }
      return c
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // ── Corregir una mesa ya cobrada (encargado, solo mientras su turno sigue abierto) ──
  // Al cerrar el turno se guardan sus totales: tocar una mesa después los descuadraría.
  // Cada corrección queda apuntada en `rectificaciones` (quién, cuándo, qué había y qué quedó): es el
  // control para el dueño y, si llega Veri*factu, lo que se convertirá en factura rectificativa.
  const MOTIVOS_RECTIFICAR = ['error_cobro', 'cliente_reclamo', 'otro'] as const
  const rectificarSchema = z.object({ motivo: z.enum(MOTIVOS_RECTIFICAR).optional() })
  const cambiarPagoSchema = rectificarSchema.extend({
    metodoPago: z.enum(['cash', 'tarjeta']),
    propina: z.number().min(0).max(10_000),
  })

  type Corregible = { error: string; status: number } | { error?: undefined; comanda: NonNullable<Awaited<ReturnType<typeof prisma.comanda.findUnique>>> }
  async function cobradaCorregible(id: number, req: { user: { restaurantId?: number } }): Promise<Corregible> {
    const c = await prisma.comanda.findUnique({ where: { id } })
    if (!c) return { error: 'Comanda no encontrada', status: 404 }
    if (c.estado !== 'cerrada') return { error: 'Esa mesa no está cobrada', status: 409 }
    if (req.user.restaurantId !== undefined && req.user.restaurantId !== c.restaurantId)
      return { error: 'Esa mesa es de otro local', status: 403 }
    const turno = await prisma.turno.findFirst({ where: { restaurantId: c.restaurantId, estado: 'abierto' } })
    if (!turno || !c.closedAt || c.closedAt < turno.aperturaAt)
      return { error: 'Solo se corrigen las mesas cobradas en el turno abierto', status: 409 }
    return { comanda: c }
  }
  const pagoDe = (c: { metodoPago: string | null; pagoEfectivo: number | null; propina: number; closedAt: Date | null }) =>
    ({ metodoPago: c.metodoPago, pagoEfectivo: c.pagoEfectivo, propina: c.propina, cobradaAt: c.closedAt?.toISOString() ?? null })
  const conRectificacion = (prev: Prisma.JsonValue | null, r: Record<string, unknown>) =>
    [...(Array.isArray(prev) ? prev : []), r] as Prisma.InputJsonValue

  // Cambiar forma de pago o propina (se marcó tarjeta y era efectivo…). La mesa sigue cobrada.
  app.patch('/comandas/:id/rectificar-pago', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = cambiarPagoSchema.parse(req.body)
    const r = await cobradaCorregible(id, req)
    if (r.error !== undefined) return reply.status(r.status).send({ error: r.error })
    const c = r.comanda
    if (c.metodoPago === 'mixto' || divisionSchema.safeParse(c.division).data?.pagos.length)
      return reply.status(409).send({ error: 'Esta mesa se pagó por separado: deshaz el cobro para corregir sus pagos' })
    const despues = { metodoPago: body.metodoPago, pagoEfectivo: null, propina: body.propina }
    const comanda = await prisma.comanda.update({
      where: { id },
      data: {
        ...despues,
        rectificaciones: conRectificacion(c.rectificaciones, {
          tipo: 'pago', por: req.user.nombre, at: new Date().toISOString(), motivo: body.motivo, antes: pagoDe(c), despues,
        }),
      },
      include: { items: true, mesa: true, mermas: true },
    })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Deshacer el cobro: la mesa vuelve a "por cobrar" (liberada, con la cuenta y lo que tenía) para
  // corregirla y cobrarla otra vez. Si tenía pagos por separado, los conserva.
  app.patch('/comandas/:id/deshacer-cobro', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = rectificarSchema.parse(req.body ?? {})
    const r = await cobradaCorregible(id, req)
    if (r.error !== undefined) return reply.status(r.status).send({ error: r.error })
    const c = r.comanda
    const items = await prisma.comandaItem.findMany({ where: { comandaId: id } })
    // La cuenta como se cobró: al volver a cobrar se compara con la nueva (rectificativa si cambió)
    const foto: CobroDeshecho = {
      items: items.map(i => ({ nombre: i.nombre, precio: i.precio, cantidad: i.cantidad, invitacion: i.invitacion })),
      total: totalCobrable(items), metodoPago: c.metodoPago, pagoEfectivo: c.pagoEfectivo, propina: c.propina,
      cobradaAt: c.closedAt?.toISOString() ?? null, por: req.user.nombre, motivo: body.motivo,
    }
    const comanda = await prisma.comanda.update({
      where: { id },
      data: {
        estado: 'liberada', closedAt: null, metodoPago: null, pagoEfectivo: null, propina: 0,
        cobroDeshecho: foto as Prisma.InputJsonValue,
        rectificaciones: conRectificacion(c.rectificaciones, {
          tipo: 'deshacer', por: req.user.nombre, at: new Date().toISOString(), motivo: body.motivo, antes: pagoDe(c),
        }),
      },
      include: { items: true, mesa: true, mermas: true },
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
    // Si la mesa venía de una reserva o un walk-in, la reserva se muda con ella (el plano la muestra en la nueva)
    await prisma.reserva.updateMany({ where: { comandaId: id }, data: { mesaId } })
    broadcast(comanda.restaurantId, 'update')
    return comanda
  })

  // Salir de una mesa que se abrió sin pedir nada la deja libre otra vez (alguien puso los pax y se fue).
  // Solo si sigue abierta, sin nada pedido (lo automático tipo pan × pax no cuenta), sin mermas y sin
  // reserva ni walk-in: esa gente sí está sentada esperando, aunque todavía no pidió.
  app.delete('/comandas/:id/vacia', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const comanda = await prisma.comanda.findUnique({ where: { id }, include: { items: true, mermas: true, reserva: true } })
    if (!comanda) return reply.status(204).send()
    if (comanda.reserva) return reply.status(409).send({ error: 'Hay gente sentada (reserva o walk-in)' })
    const vacia = comanda.estado === 'abierta'
      && comanda.items.every(i => i.autoGenerado && i.ronda === 0)
      && comanda.mermas.length === 0
    if (!vacia) return reply.status(409).send({ error: 'La mesa tiene algo pedido' })
    const grupo = await prisma.grupoAgendado.findFirst({ where: { comandaId: id } })
    if (grupo) return reply.status(409).send({ error: 'Es la mesa de un grupo' })
    await prisma.comanda.delete({ where: { id } }) // los items se van en cascada
    broadcast(comanda.restaurantId, 'update')
    return reply.status(204).send()
  })

  // Quién está sentado en la mesa (encargado): una reserva de hoy (reservaId) o un walk-in (null).
  // Corrige un "Sentar" equivocado ("No era esta reserva") y marca una mesa que abrió un camarero.
  // La reserva que estaba vuelve a "por llegar" sin mesa; un walk-in que estaba se borra.
  app.put('/comandas/:id/reserva', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const { reservaId } = req.body as { reservaId: number | null }
    const comanda = await prisma.comanda.findUnique({ where: { id }, include: { reserva: true } })
    if (!comanda) return reply.status(404).send({ error: 'Mesa no encontrada' })
    if (!['abierta', 'enviada', 'facturada', 'liberada'].includes(comanda.estado)) {
      return reply.status(409).send({ error: 'Esta mesa ya se cobró' })
    }
    const actual = comanda.reserva
    if (reservaId != null && actual?.id === reservaId) return actual
    if (reservaId == null && actual?.origen === 'walkin') return actual

    const nueva = reservaId != null ? await prisma.reserva.findUnique({ where: { id: reservaId } }) : null
    if (reservaId != null) {
      if (!nueva || nueva.restaurantId !== comanda.restaurantId) return reply.status(404).send({ error: 'Reserva no encontrada' })
      if (nueva.estado !== 'confirmada' || nueva.enPool) return reply.status(409).send({ error: 'Esa reserva ya no está por llegar' })
    }

    const resultado = await prisma.$transaction(async tx => {
      if (actual) {
        if (actual.origen === 'walkin') await tx.reserva.delete({ where: { id: actual.id } })
        else await tx.reserva.update({ where: { id: actual.id }, data: { estado: 'confirmada', comandaId: null, sentadaAt: null, mesaId: null } })
      }
      if (nueva) {
        return tx.reserva.update({
          where: { id: nueva.id },
          data: { estado: 'sentada', comandaId: id, mesaId: comanda.mesaId, sentadaAt: new Date() },
        })
      }
      const { hora } = ahoraEnMadrid(comanda.createdAt)
      const fecha = diaDeServicio(comanda.createdAt)
      return tx.reserva.create({
        data: {
          restaurantId: comanda.restaurantId, fecha: new Date(fecha + 'T00:00:00.000Z'), hora, pax: comanda.pax,
          estado: 'sentada', origen: 'walkin', mesaId: comanda.mesaId, comandaId: id, sentadaAt: comanda.createdAt,
        },
      })
    })
    broadcast(comanda.restaurantId, 'update')
    return resultado
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
