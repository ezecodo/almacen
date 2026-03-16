import { FastifyInstance } from 'fastify'
import { prisma } from '../server'

export async function statsRoutes(app: FastifyInstance) {

  // Retiros por día (últimos N días)
  app.get('/stats/retiros-por-dia', async (req) => {
    const { dias = '30' } = req.query as { dias?: string }
    const desde = new Date()
    desde.setDate(desde.getDate() - Number(dias))

    const retiros = await prisma.retiro.findMany({
      where: { createdAt: { gte: desde } },
      select: { createdAt: true },
    })

    const map: Record<string, number> = {}
    for (let i = Number(dias) - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      map[key] = 0
    }
    for (const r of retiros) {
      const key = r.createdAt.toISOString().slice(0, 10)
      if (key in map) map[key]++
    }

    return Object.entries(map).map(([fecha, total]) => ({ fecha, total }))
  })

  // Retiros por restaurante (mes actual o indicado)
  app.get('/stats/retiros-por-restaurante', async (req) => {
    const { mes } = req.query as { mes?: string }
    const ref = mes ? new Date(`${mes}-01`) : new Date()
    const desde = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const hasta = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)

    const restaurantes = await prisma.restaurant.findMany({
      include: {
        retiros: {
          where: { createdAt: { gte: desde, lt: hasta } },
          select: { id: true },
        },
      },
    })

    return restaurantes.map((r) => ({
      restaurantId: r.id,
      nombre: r.nombre,
      total: r.retiros.length,
    })).sort((a, b) => b.total - a.total)
  })

  // Productos más retirados
  app.get('/stats/productos-top', async (req) => {
    const { limit = '10', dias = '30' } = req.query as { limit?: string; dias?: string }
    const desde = new Date()
    desde.setDate(desde.getDate() - Number(dias))

    const items = await prisma.retiroItem.findMany({
      where: { retiro: { createdAt: { gte: desde } } },
      select: { nombre: true, cantidad: true },
    })

    const map: Record<string, { totalCantidad: number; vecesRetirado: number }> = {}
    for (const item of items) {
      if (!map[item.nombre]) map[item.nombre] = { totalCantidad: 0, vecesRetirado: 0 }
      map[item.nombre].totalCantidad += item.cantidad
      map[item.nombre].vecesRetirado++
    }

    return Object.entries(map)
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.vecesRetirado - a.vecesRetirado)
      .slice(0, Number(limit))
  })

  // Actividad por empleado (mes actual o indicado)
  app.get('/stats/actividad-empleados', async (req) => {
    const { mes } = req.query as { mes?: string }
    const ref = mes ? new Date(`${mes}-01`) : new Date()
    const desde = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const hasta = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)

    const empleados = await prisma.empleado.findMany({
      include: {
        retiros: {
          where: { createdAt: { gte: desde, lt: hasta } },
          select: { id: true },
        },
      },
    })

    return empleados
      .map((e) => ({ empleadoId: e.id, nombre: e.nombre, total: e.retiros.length }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total)
  })
}
