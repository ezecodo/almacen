import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { randomBytes } from 'crypto'
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
import { grupoMenuRoutes } from './routes/grupo-menu'
import { turnoRoutes } from './routes/turnos'
import { inventarioRoutes } from './routes/inventario'
import { reservasRoutes } from './routes/reservas'
import { staffingRoutes } from './routes/staffing'
import { wikiRoutes } from './routes/wiki'
import { checklistRoutes } from './routes/checklists'
import { ticketRoutes } from './routes/tickets'
import { authRoutes } from './routes/auth'
import { facturaRoutes } from './routes/facturas'
import { iniciarMqtt } from './mqtt'

const app = Fastify({ logger: true })
export const prisma = new PrismaClient()

async function start() {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173'
  })

  // Sin JWT_SECRET en el .env se usa uno aleatorio: todo sigue funcionando, pero las
  // sesiones firmadas se invalidan en cada reinicio de la API.
  if (!process.env.JWT_SECRET) app.log.warn('JWT_SECRET no configurado — usando secreto efímero')
  await app.register(jwt, { secret: process.env.JWT_SECRET || randomBytes(32).toString('hex') })

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
  await app.register(grupoMenuRoutes, { prefix: '/api' })
  await app.register(turnoRoutes, { prefix: '/api' })
  await app.register(inventarioRoutes, { prefix: '/api' })
  await app.register(reservasRoutes, { prefix: '/api' })
  await app.register(staffingRoutes, { prefix: '/api' })
  await app.register(wikiRoutes, { prefix: '/api' })
  await app.register(checklistRoutes, { prefix: '/api' })
  await app.register(ticketRoutes, { prefix: '/api' })
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(facturaRoutes, { prefix: '/api' })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date() }))

  const port = Number(process.env.PORT) || 3001
  // Nginx le habla por localhost:3001 (ver /etc/nginx/sites-available/almacen) — en producción
  // debe ir a loopback (HOST=127.0.0.1 en .env) para no exponer la API directo a internet.
  // 0.0.0.0 por defecto para que en dev se pueda probar desde otros dispositivos de la LAN (tablets/celus).
  const host = process.env.HOST || '0.0.0.0'
  await app.listen({ port, host })

  // Empieza a escuchar el estado (online/offline) de las Pi de impresión
  iniciarMqtt()
}

start().catch(console.error)
