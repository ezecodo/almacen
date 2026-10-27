import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { diaDeServicio } from '../dia-servicio'
import { broadcast } from '../sse'
import { boxSinSincronizar } from './red'
import { efectivoGastado } from './gastos'
import { repartoPago, totalCobrable } from '../pago'
import { juntarMesasLibres } from './salon'
import { margenDe, resumenMargen, tasaIva } from '../margen'

export async function turnoRoutes(app: FastifyInstance) {

  // Turno activo de un restaurante
  app.get('/turnos/activo', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const turno = await prisma.turno.findFirst({
      where: { restaurantId: Number(restaurantId), estado: 'abierto' },
      orderBy: { aperturaAt: 'desc' },
    })
    return turno ?? null
  })

  // Todos los turnos activos (para dashboard global)
  app.get('/turnos/activos', async (_req, _reply) => {
    return prisma.turno.findMany({
      where: { estado: 'abierto' },
      include: { restaurant: true },
      orderBy: { aperturaAt: 'asc' },
    })
  })

  // Facturación en vivo por restaurante (para dashboard)
  app.get('/turnos/activos/stats', async () => {
    const restaurantes = await prisma.restaurant.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        turnos: {
          where: { estado: 'abierto' },
          take: 1,
          orderBy: { aperturaAt: 'desc' },
        },
      },
    })

    const iva = await tasaIva()
    const stats = await Promise.all(restaurantes.map(async (r) => {
      const turno = r.turnos[0] ?? null
      if (!turno) {
        return {
          restaurantId: r.id,
          nombre: r.nombre,
          activo: false,
          aperturaAt: null,
          turnoId: null,
          totalEfectivo: 0,
          totalTarjeta: 0,
          totalVentas: 0,
          numComandas: 0,
          margen: null,
        }
      }

      const comandas = await prisma.comanda.findMany({
        where: {
          restaurantId: r.id,
          estado: 'cerrada',
          closedAt: { gte: turno.aperturaAt },
        },
        include: { items: true },
      })

      const repartos = comandas.map(c => repartoPago(c, totalCobrable(c.items)))
      const totalEfectivo = repartos.reduce((s, r) => s + r.efectivo, 0)
      const totalTarjeta  = repartos.reduce((s, r) => s + r.tarjeta, 0)
      // Margen teórico por los escandallos (esta ruta solo la ven admin y Pulso)
      const mermas = await prisma.merma.findMany({ where: { restaurantId: r.id, createdAt: { gte: turno.aperturaAt } }, select: { menuItemId: true, cantidad: true, motivo: true } })
      const margen = resumenMargen(totalEfectivo + totalTarjeta, await margenDe(comandas, mermas), iva)

      return {
        restaurantId: r.id,
        nombre: r.nombre,
        activo: true,
        aperturaAt: turno.aperturaAt,
        turnoId: turno.id,
        totalEfectivo,
        totalTarjeta,
        totalVentas: totalEfectivo + totalTarjeta,
        numComandas: comandas.length,
        margen,
      }
    }))

    return stats
  })

  // Abrir turno
  app.post('/turnos', async (req, reply) => {
    const schema = z.object({
      restaurantId:    z.number().int().positive(),
      encargadoNombre: z.string().optional(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    // Solo puede haber un turno abierto por restaurante
    const existente = await prisma.turno.findFirst({
      where: { restaurantId: result.data.restaurantId, estado: 'abierto' },
    })
    if (existente) return reply.status(409).send({ error: 'Ya hay un turno abierto para este restaurante' })

    const turno = await prisma.turno.create({
      data: { restaurantId: result.data.restaurantId, encargadoNombre: result.data.encargadoNombre },
    })
    broadcast(turno.restaurantId, 'update')
    return reply.status(201).send(turno)
  })

  // Cerrar turno (calcula totales del día)
  app.patch('/turnos/:id/cerrar', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const turno = await prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.status(404).send({ error: 'Turno no encontrado' })
    if (turno.estado === 'cerrado') return reply.status(409).send({ error: 'El turno ya está cerrado' })

    // Modo local: si la Box del local no sincroniza desde hace un rato, puede tener comandas que
    // solo están en ella. Se avisa; quien cierra puede cerrar igual (la Box apagada no debe bloquear).
    const hace = boxSinSincronizar(turno.restaurantId)
    if (hace !== null && !(req.body as { forzar?: boolean } | undefined)?.forzar) {
      const min = Math.max(1, Math.round(hace / 60_000))
      return reply.status(409).send({
        error: `La Oído Box no sincroniza desde hace ${min} min: si se comandó sin internet, puede tener mesas sin subir. Espera a que vuelva la conexión o cierra igual.`,
        codigo: 'box_sin_sincronizar',
      })
    }

    // Comandas cerradas durante el turno
    const comandas = await prisma.comanda.findMany({
      where: {
        restaurantId: turno.restaurantId,
        estado: 'cerrada',
        closedAt: { gte: turno.aperturaAt },
      },
      include: { items: true },
    })

    // Mermas registradas durante el turno
    const mermas = await prisma.merma.findMany({
      where: {
        restaurantId: turno.restaurantId,
        createdAt: { gte: turno.aperturaAt },
      },
    })

    // Calcular totales (las invitaciones de la casa van a 0 € y se registran aparte)
    const cobrable = (i: { precio: number; cantidad: number; invitacion: boolean }) =>
      i.invitacion ? 0 : i.precio * i.cantidad

    // Las mesas pagadas por separado con efectivo y tarjeta (mixto) reparten entre las dos
    const repartos = comandas.map(c => repartoPago(c, c.items.reduce((ss, i) => ss + cobrable(i), 0)))
    const totalEfectivo = repartos.reduce((s, r) => s + r.efectivo, 0)
    const totalTarjeta  = repartos.reduce((s, r) => s + r.tarjeta, 0)

    const totalMermas   = mermas.reduce((s, m) => s + m.precio * m.cantidad, 0)
    const totalPropinas = comandas.reduce((s, c) => s + (c.propina ?? 0), 0)
    const totalInvitaciones = comandas.reduce(
      (s, c) => s + c.items.reduce((ss, i) => ss + (i.invitacion ? i.precio * i.cantidad : 0), 0), 0)

    const now = new Date()
    // Gastos pagados en efectivo durante el turno (pan, frutería…): salieron de la caja
    const totalGastos = await efectivoGastado(turno.restaurantId, turno.aperturaAt, now)
    // Rectificativas del turno (mesas cobradas otra vez por otro importe): negativo = se devolvió dinero
    const rectificado = await prisma.rectificativa.aggregate({ where: { turnoId: id }, _sum: { diferencia: true } })
    const totalRectificado = rectificado._sum.diferencia ?? 0
    // Margen teórico por los escandallos: se guarda con el turno (lo ven admin y Pulso, no la sala)
    const { costeVendido, costeMermas, ventasConEscandallo } = await margenDe(comandas, mermas)
    const updated = await prisma.turno.update({
      where: { id },
      data: {
        estado:       'cerrado',
        cierreAt:     now,
        totalEfectivo,
        totalTarjeta,
        totalVentas:  totalEfectivo + totalTarjeta,
        totalMermas,
        totalPropinas,
        totalInvitaciones,
        totalGastos,
        totalRectificado,
        costeVendido,
        costeMermas,
        ventasConEscandallo,
        numComandas:  comandas.length,
      },
    })
    // El turno siguiente arranca con toda la carta: lo agotado vuelve a estar disponible
    await prisma.itemAgotado.deleteMany({ where: { restaurantId: updated.restaurantId } })
    // Las reservas de esta noche que siguen "por llegar" no vinieron: el día siguiente arranca limpio.
    // Se deshace desde la lista con "↩ Volver a por llegar".
    const noVinieron = await prisma.reserva.updateMany({
      where: { restaurantId: updated.restaurantId, estado: 'confirmada', fecha: new Date(diaDeServicio() + 'T00:00:00.000Z') },
      data: { estado: 'no_show', enPool: false, poolGestionandoPor: null, poolGestionandoDesde: null },
    })

    // Las mesas que se separaron y quedaron libres vuelven a juntarse: cada noche arranca con el mapa de siempre
    await juntarMesasLibres(updated.restaurantId)

    broadcast(updated.restaurantId, 'update')
    broadcast(updated.restaurantId, 'agotados')
    // Los costes no le llegan al encargado que cierra: los quita el filtro de server.ts
    return { ...updated, reservasNoVinieron: noVinieron.count }
  })

  // Historial de turnos de un restaurante
  app.get('/turnos', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const iva = await tasaIva()
    const turnos = await prisma.turno.findMany({
      where: { restaurantId: Number(restaurantId) },
      include: {
        propina: {
          include: { turnos: { include: { empleado: true } } },
        },
      },
      orderBy: { aperturaAt: 'desc' },
      take: 30,
    })
    // Margen de los turnos cerrados desde que existe (los anteriores no tienen coste guardado)
    return turnos.map(t => ({
      ...t,
      margen: t.costeVendido === null || t.costeMermas === null || t.ventasConEscandallo === null ? null
        : resumenMargen(t.totalVentas ?? 0, { costeVendido: t.costeVendido, costeMermas: t.costeMermas, ventasConEscandallo: t.ventasConEscandallo }, iva),
    }))
  })

  // Comandas cobradas durante un turno
  app.get('/turnos/:id/comandas', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const turno = await prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.status(404).send({ error: 'Turno no encontrado' })

    const hasta = turno.cierreAt ?? new Date()

    return prisma.comanda.findMany({
      where: {
        restaurantId: turno.restaurantId,
        estado: 'cerrada',
        closedAt: { gte: turno.aperturaAt, lte: hasta },
      },
      include: { items: true, mermas: true, mesa: true, rectificativas: { orderBy: { createdAt: 'asc' } } },
      orderBy: { closedAt: 'asc' },
    })
  })

  // Eliminar turno cerrado
  app.delete('/turnos/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const turno = await prisma.turno.findUnique({ where: { id } })
    if (!turno) return reply.status(404).send({ error: 'Turno no encontrado' })
    if (turno.estado === 'abierto') return reply.status(409).send({ error: 'No se puede eliminar un turno abierto' })

    await prisma.turno.delete({ where: { id } })
    return reply.status(204).send()
  })
}
