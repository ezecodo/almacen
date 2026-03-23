import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'
import { retiroRoutes } from './routes/retiros'
import { productoRoutes } from './routes/productos'
import { restauranteRoutes } from './routes/restaurantes'
import { empleadoRoutes } from './routes/empleados'
import { statsRoutes } from './routes/stats'
import { reviewRoutes } from './routes/reviews'
import { propinaRoutes } from './routes/propinas'
import { menuRoutes } from './routes/menu'
import { salonRoutes } from './routes/salon'
import { comandaRoutes } from './routes/comandas'
import { mermaRoutes } from './routes/mermas'
import { eventRoutes } from './routes/events'

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
  await app.register(statsRoutes, { prefix: '/api' })
  await app.register(reviewRoutes, { prefix: '/api' })
  await app.register(propinaRoutes, { prefix: '/api' })
  await app.register(menuRoutes, { prefix: '/api' })
  await app.register(salonRoutes, { prefix: '/api' })
  await app.register(comandaRoutes, { prefix: '/api' })
  await app.register(mermaRoutes, { prefix: '/api' })
  await app.register(eventRoutes, { prefix: '/api' })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date() }))

  const port = Number(process.env.PORT) || 3001
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch(console.error)
