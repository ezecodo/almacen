import { FastifyInstance } from 'fastify'
import { subscribe, unsubscribe } from '../sse'

export async function eventRoutes(app: FastifyInstance) {
  app.get('/events', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })

    const rId = Number(restaurantId)

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',   // deshabilita buffer en Nginx
    })
    reply.raw.flushHeaders()

    const send = (data: string) => { try { reply.raw.write(data) } catch {} }

    subscribe(rId, send)

    // Ping cada 25s para mantener la conexión viva
    const ping = setInterval(() => { try { reply.raw.write(': ping\n\n') } catch {} }, 25_000)

    req.raw.on('close', () => {
      clearInterval(ping)
      unsubscribe(rId, send)
    })

    // Confirmar conexión
    reply.raw.write('data: {"type":"connected"}\n\n')
  })
}
