import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { broadcast } from '../sse'
import { requireAltos, Sesion } from '../auth'
import { publicarAviso } from '../mqtt'

// Platos que se acabaron durante el servicio, por local. El encargado los marca desde el panel 💼
// y el jefe de cocina desde su pantalla (/sala/cocina → 🚫 Altos):
// sale "ALTO · <plato>" en todas las impresoras del local y en la sala el plato se ve apagado.
// Al reponerlo sale "HAY · <plato>". Al cerrar el turno se reponen todos (routes/turnos.ts).

const marcarSchema = z.object({
  restaurantId: z.number().int().positive(),
  menuItemId: z.number().int().positive(),
})
const reponerParams = z.object({ menuItemId: z.coerce.number().int().positive() })
const restQuery = z.object({ restaurantId: z.coerce.number().int().positive() })

// Una sesión de sala solo toca los platos del local donde entró
const deOtroLocal = (u: Sesion, restaurantId: number) => u.tipo === 'sala' && !!u.restaurantId && u.restaurantId !== restaurantId

async function avisarImpresoras(restaurantId: number, titulo: 'ALTO' | 'HAY', plato: string, por: string) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { piCodigo: true, impresoras: true } })
  if (!r?.piCodigo || r.impresoras.length === 0) return
  // Una sola vez por impresora física, aunque esté cargada dos veces con nombres distintos
  const porIp = new Map(r.impresoras.map(i => [i.ip, i]))
  publicarAviso(r.piCodigo, {
    ticket_id: `aviso-${restaurantId}-${Date.now()}`,
    titulo,
    plato,
    por,
    destinos: [...porIp.values()].map(i => ({ impresora: i.nombre, ip: i.ip, copias: 1 })),
  })
}

export async function agotadoRoutes(app: FastifyInstance) {
  app.get('/agotados', async req => {
    const { restaurantId } = restQuery.parse(req.query)
    return prisma.itemAgotado.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      select: { menuItemId: true, marcadoPor: true, createdAt: true, menuItem: { select: { nombre: true } } },
    })
  })

  app.post('/agotados', { preHandler: requireAltos }, async (req, reply) => {
    const { restaurantId, menuItemId } = marcarSchema.parse(req.body)
    if (deOtroLocal(req.user, restaurantId)) return reply.status(403).send({ error: 'Este dispositivo es de otro local' })
    const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } })
    if (!item || (item.restaurantId !== null && item.restaurantId !== restaurantId)) {
      return reply.status(404).send({ error: 'Ese plato no está en la carta de este local' })
    }
    const ya = await prisma.itemAgotado.findUnique({ where: { restaurantId_menuItemId: { restaurantId, menuItemId } } })
    if (ya) return ya
    const por = req.user.nombre
    const agotado = await prisma.itemAgotado.create({ data: { restaurantId, menuItemId, marcadoPor: por } })
    broadcast(restaurantId, 'agotados')
    avisarImpresoras(restaurantId, 'ALTO', item.nombre, por).catch(err => console.error('[agotados] aviso ALTO', err))
    return reply.status(201).send(agotado)
  })

  app.delete('/agotados/:menuItemId', { preHandler: requireAltos }, async (req, reply) => {
    const { menuItemId } = reponerParams.parse(req.params)
    const { restaurantId } = restQuery.parse(req.query)
    if (deOtroLocal(req.user, restaurantId)) return reply.status(403).send({ error: 'Este dispositivo es de otro local' })
    const borrado = await prisma.itemAgotado.deleteMany({ where: { restaurantId, menuItemId } })
    if (borrado.count === 0) return reply.status(404).send({ error: 'Ese plato no estaba agotado' })
    broadcast(restaurantId, 'agotados')
    const item = await prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { nombre: true } })
    if (item) avisarImpresoras(restaurantId, 'HAY', item.nombre, req.user.nombre).catch(err => console.error('[agotados] aviso HAY', err))
    return { ok: true }
  })
}
