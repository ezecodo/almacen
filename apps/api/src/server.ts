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
import { alergenoRoutes } from './routes/alergenos'
import { escandalloRoutes } from './routes/escandallos'
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
import { ticketRoutes, sincronizarImpresoras } from './routes/tickets'
import { authRoutes } from './routes/auth'
import { algunRestringido, ipDe, redDe, redRoutes } from './routes/red'
import { CONSULTA_ENCARGADO, CONSULTA_SALA, RUTAS_PUBLICAS, RUTAS_PULSO, RUTAS_SALA, SOLO_ENCARGADO } from './permisos'
import { facturaRoutes } from './routes/facturas'
import { iniciarMqtt, onImpresorasDetectadas } from './mqtt'

const app = Fastify({ logger: true })
export const prisma = new PrismaClient()

// Copia de un resultado sin secretos, a cualquier profundidad: el secreto del latido de la Pi
// (`piSecreto`) no sale nunca, y el `pin` de un empleado solo hacia administración.
function sinSecretos(valor: unknown, esAdmin: boolean): unknown {
  if (Array.isArray(valor)) return valor.map(v => sinSecretos(v, esAdmin))
  if (valor === null || typeof valor !== 'object' || valor instanceof Date) return valor
  const limpio: Record<string, unknown> = {}
  for (const [clave, v] of Object.entries(valor)) {
    if (clave === 'piSecreto' || (clave === 'pin' && !esAdmin)) continue
    limpio[clave] = sinSecretos(v, esAdmin)
  }
  return limpio
}

async function start() {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173'
  })

  // Sin JWT_SECRET en el .env se usa uno aleatorio: todo sigue funcionando, pero las
  // sesiones firmadas se invalidan en cada reinicio de la API.
  if (!process.env.JWT_SECRET) app.log.warn('JWT_SECRET no configurado — usando secreto efímero')
  await app.register(jwt, { secret: process.env.JWT_SECRET || randomBytes(32).toString('hex') })

  // Toda la API exige sesión, y cada tipo de sesión llega solo a lo suyo (ver permisos.ts).
  // Lo que no figura en esas listas es de administración: una ruta nueva nace cerrada.
  app.addHook('onRequest', async (req, reply) => {
    const ruta = req.routeOptions?.url
    if (!ruta || !ruta.startsWith('/api/') || req.method === 'OPTIONS') return
    const clave = `${req.method} ${ruta}`
    if (RUTAS_PUBLICAS.has(clave)) return
    // EventSource no puede mandar cabeceras: los canales de eventos aceptan la sesión en la dirección
    if (ruta.startsWith('/api/events') && !req.headers.authorization) {
      const { token } = req.query as { token?: string }
      if (token) req.headers.authorization = `Bearer ${token}`
    }
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Sesión caducada — vuelve a entrar con tu PIN' })
    }
    const { tipo, encargado } = req.user
    if (tipo === 'admin') return
    const permitido =
      tipo === 'pulso' ? RUTAS_PULSO.has(clave)
      : RUTAS_SALA.has(clave) && (encargado || !SOLO_ENCARGADO.has(clave))
    if (!permitido) return reply.status(403).send({ error: 'No tienes permiso para esto' })
  })

  // "Dónde estás": con restringirPorRed, la sala de un restaurante solo se opera desde la red del
  // local. Lo de consulta (wiki, carta, propinas; reviews y reservas para el encargado) no se limita.
  // Va en preHandler, no en onRequest, porque mira también el restaurante que viene en el cuerpo.
  app.addHook('preHandler', async (req, reply) => {
    const sesion = req.user as typeof req.user | undefined
    if (sesion?.tipo !== 'sala') return
    const clave = `${req.method} ${req.routeOptions?.url}`
    if (!RUTAS_SALA.has(clave) || CONSULTA_SALA.has(clave)) return
    if (sesion.encargado && CONSULTA_ENCARGADO.has(clave)) return

    // Sesión de antes de este cambio (sin restaurante): si algún local ya restringe, que vuelva a entrar
    if (!sesion.restaurantId) {
      if (await algunRestringido()) return reply.status(401).send({ error: 'Vuelve a entrar con tu PIN' })
      return
    }
    const red = await redDe(sesion.restaurantId)
    if (!red?.restringido) return

    const pedido = Number((req.query as { restaurantId?: string })?.restaurantId ?? (req.body as { restaurantId?: number } | undefined)?.restaurantId)
    if (pedido && pedido !== sesion.restaurantId) {
      return reply.status(403).send({ error: 'Este dispositivo es de otro local', codigo: 'otro_local' })
    }
    if (!red.ips.has(ipDe(req))) {
      return reply.status(403).send({ error: 'Estás fuera del local: conéctate a su red para operar', codigo: 'fuera_del_local' })
    }
  })

  // Red de seguridad: el secreto de la Pi no sale nunca en una respuesta, y el PIN de un empleado
  // solo hacia el panel de administración. Muchas rutas devuelven el empleado entero dentro de otra cosa (turnos, propinas,
  // retiros…); en vez de confiar en acordarse en cada una, se quita acá de todas.
  app.addHook('preSerialization', async (req, _reply, payload) => {
    if (payload === null || typeof payload !== 'object') return payload
    let esAdmin = false
    if (req.headers.authorization) {
      try {
        await req.jwtVerify()
        esAdmin = req.user.tipo === 'admin'
      } catch { /* sin sesión válida: se filtra */ }
    }
    return sinSecretos(payload, esAdmin)
  })

  await app.register(retiroRoutes, { prefix: '/api' })
  await app.register(productoRoutes, { prefix: '/api' })
  await app.register(restauranteRoutes, { prefix: '/api' })
  await app.register(empleadoRoutes, { prefix: '/api' })
  await app.register(statsRoutes, { prefix: '/api' })
  await app.register(reviewRoutes, { prefix: '/api' })
  await app.register(propinaRoutes, { prefix: '/api' })
  await app.register(menuRoutes, { prefix: '/api' })
  await app.register(alergenoRoutes, { prefix: '/api' })
  await app.register(escandalloRoutes, { prefix: '/api' })
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
  await app.register(redRoutes, { prefix: '/api' })
  await app.register(facturaRoutes, { prefix: '/api' })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date() }))

  // "Acá hay una instalación de OidoOps". El frontend lo usa para saber si está en la instalación
  // de un cliente o en la vidriera (que es el mismo build servido sin API detrás), y la vidriera
  // para comprobar que un grupo existe antes de mandar a alguien a su dirección — por eso
  // responde a cualquier origen. No lleva ningún dato del cliente.
  app.get('/api/instalacion', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    return { ok: true }
  })

  const port = Number(process.env.PORT) || 3001
  // Nginx le habla por localhost:3001 (ver /etc/nginx/sites-available/almacen) — en producción
  // debe ir a loopback (HOST=127.0.0.1 en .env) para no exponer la API directo a internet.
  // 0.0.0.0 por defecto para que en dev se pueda probar desde otros dispositivos de la LAN (tablets/celus).
  const host = process.env.HOST || '0.0.0.0'
  await app.listen({ port, host })

  // Empieza a escuchar el estado (online/offline) de las Pi de impresión y lo que detectan en la red
  onImpresorasDetectadas(sincronizarImpresoras)
  iniciarMqtt()
}

start().catch(console.error)
