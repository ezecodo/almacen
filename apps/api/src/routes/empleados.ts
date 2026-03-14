import { FastifyInstance } from 'fastify'
import { prisma } from '../server'

export async function empleadoRoutes(app: FastifyInstance) {
  app.get('/empleados', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }

    if (!restaurantId) {
      return reply.status(400).send({ error: 'restaurantId es requerido' })
    }

    return prisma.empleado.findMany({
      where: {
        restaurantId: Number(restaurantId),
        activo: true
      },
      orderBy: { nombre: 'asc' }
    })
  })
}
