import { FastifyInstance } from 'fastify'
import { prisma } from '../server'

export async function restauranteRoutes(app: FastifyInstance) {
  app.get('/restaurantes', async () => {
    return prisma.restaurant.findMany({ orderBy: { nombre: 'asc' } })
  })
}
