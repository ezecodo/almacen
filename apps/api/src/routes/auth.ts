import { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'crypto'

// Freno simple contra fuerza bruta del PIN de admin: tras MAX_FALLOS seguidos,
// nadie puede intentar hasta que pase la ventana.
const MAX_FALLOS = 10
const VENTANA_MS = 10 * 60 * 1000
let fallos: number[] = []

export async function authRoutes(app: FastifyInstance) {

  // PIN de admin validado en el servidor (env ADMIN_PIN) → token para rutas protegidas
  app.post('/admin/auth', async (req, reply) => {
    const esperado = process.env.ADMIN_PIN
    if (!esperado) return reply.status(503).send({ error: 'ADMIN_PIN no configurado en el servidor' })

    const ahora = Date.now()
    fallos = fallos.filter(t => ahora - t < VENTANA_MS)
    if (fallos.length >= MAX_FALLOS) {
      return reply.status(429).send({ error: 'Demasiados intentos — espera unos minutos' })
    }

    const { pin } = (req.body ?? {}) as { pin?: string }
    const a = Buffer.from(String(pin ?? ''))
    const b = Buffer.from(esperado)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      fallos.push(ahora)
      return reply.status(401).send({ error: 'PIN incorrecto' })
    }

    const token = app.jwt.sign({ tipo: 'admin', nombre: 'Admin', encargado: true }, { expiresIn: '12h' })
    return { token }
  })
}
