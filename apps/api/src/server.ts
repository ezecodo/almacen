import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'
import { retiroRoutes } from './routes/retiros'
import { productoRoutes } from './routes/productos'
import { restauranteRoutes } from './routes/restaurantes'
import { empleadoRoutes } from './routes/empleados'

const app = Fastify({ logger: true })
export const prisma = new PrismaClient()

async function start() {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173'
  })

  await app.register(retiroRoutes, { prefix: '/api' })
  await app.register(productoRoutes, { prefix: '/api' })
  await app.register(restauranteRoutes, { prefix: '/api' })
  await app.register(empleadoRoutes, { prefix: '/api' })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date() }))

  const port = Number(process.env.PORT) || 3001
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch(console.error)
