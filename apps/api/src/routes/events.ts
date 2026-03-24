import { FastifyInstance } from 'fastify'
import { subscribe, unsubscribe } from '../sse'

export async function eventRoutes(app: FastifyInstance) {
  app.get('/events', (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) { reply.status(400).send({ error: 'restaurantId requerido' }); return }

    const rId = Number(restaurantId)

    // Tomar control total de la respuesta — impide que Fastify la cierre
    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const send = (data: string) => {
      try { reply.raw.write(data) } catch { unsubscribe(rId, send) }
    }

    subscribe(rId, send)

    // Ping cada 25s para mantener la conexión viva a través de proxies
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n') } catch { clearInterval(ping); unsubscribe(rId, send) }
    }, 25_000)

    req.raw.on('close', () => {
      clearInterval(ping)
      unsubscribe(rId, send)
    })

    // Confirmar conexión
    reply.raw.write('data: {"type":"connected"}\n\n')
  })
}
