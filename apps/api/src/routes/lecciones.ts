import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// Asistente de la sala (apps/web/src/components/Asistente.tsx): qué lecciones terminó cada empleado.
// El teléfono apunta cada lección al terminarla; el encargado ve las de su local y el admin, todas.

const marcarSchema = z.object({ lecciones: z.array(z.string().min(1).max(40)).min(1).max(50) })

export async function leccionRoutes(app: FastifyInstance) {
  // Las del empleado de la sesión
  app.get('/lecciones/mias', async (req, reply) => {
    const empleadoId = req.user.empleadoId
    if (!empleadoId) return reply.status(400).send({ error: 'Entra con tu PIN' })
    return prisma.leccionCompletada.findMany({
      where: { empleadoId }, select: { leccion: true, completadaAt: true }, orderBy: { completadaAt: 'asc' },
    })
  })

  // Apuntar una o varias como hechas (al terminar una, y la primera vez las que ya tenía el teléfono)
  app.post('/lecciones/mias', async (req, reply) => {
    const empleadoId = req.user.empleadoId
    if (!empleadoId) return reply.status(400).send({ error: 'Entra con tu PIN' })
    const { lecciones } = marcarSchema.parse(req.body)
    await prisma.leccionCompletada.createMany({
      data: [...new Set(lecciones)].map(leccion => ({ empleadoId, leccion })), skipDuplicates: true,
    })
    return { ok: true }
  })

  // Encargado: el personal de sala de su local (fijos de ese restaurante y rotativos) con sus lecciones
  app.get('/lecciones/equipo', async (req, reply) => {
    const rid = req.user.restaurantId
    if (!rid) return reply.status(403).send({ error: 'Vuelve a entrar con tu PIN' })
    return prisma.empleado.findMany({
      where: { activo: true, tipo: 'sala', OR: [{ restaurantId: rid }, { restaurantId: null }] },
      select: { id: true, nombre: true, rol: true, restaurantId: true, lecciones: { select: { leccion: true, completadaAt: true } } },
      orderBy: { nombre: 'asc' },
    })
  })

  // Admin: todas (la lista de empleados las cruza por empleadoId)
  app.get('/admin/lecciones', async () => {
    return prisma.leccionCompletada.findMany({
      select: { empleadoId: true, leccion: true, completadaAt: true }, orderBy: { completadaAt: 'asc' },
    })
  })
}
