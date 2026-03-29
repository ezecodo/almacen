import { FastifyInstance } from 'fastify'
import { subscribe, unsubscribe, subscribeGlobal, unsubscribeGlobal } from '../sse'

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

  // Endpoint global para admin — recibe eventos de todos los restaurantes
  app.get('/events/global', (req, reply) => {
    reply.hijack()

    reply.raw.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const send = (data: string) => {
      try { reply.raw.write(data) } catch { unsubscribeGlobal(send) }
    }

    subscribeGlobal(send)

    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n') } catch { clearInterval(ping); unsubscribeGlobal(send) }
    }, 25_000)

    req.raw.on('close', () => {
      clearInterval(ping)
      unsubscribeGlobal(send)
    })

    reply.raw.write('data: {"type":"connected"}\n\n')
  })
}
