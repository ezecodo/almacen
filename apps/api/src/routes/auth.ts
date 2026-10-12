import { FastifyInstance, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'

// Freno simple contra fuerza bruta de un PIN: tras MAX_FALLOS seguidos,
// nadie puede intentar hasta que pase la ventana. Un contador por puerta.
const MAX_FALLOS = 10
const VENTANA_MS = 10 * 60 * 1000
const fallos: Record<string, number[]> = {}

// Compara el PIN recibido con el de la variable de entorno. Devuelve true si coincide;
// si no, ya dejó escrita la respuesta de error en `reply`.
function pinValido(variable: 'ADMIN_PIN' | 'PULSO_PIN', body: unknown, reply: FastifyReply): boolean {
  const esperado = process.env[variable]
  if (!esperado) {
    reply.status(503).send({ error: `${variable} no configurado en el servidor` })
    return false
  }

  const ahora = Date.now()
  const recientes = (fallos[variable] ?? []).filter(t => ahora - t < VENTANA_MS)
  fallos[variable] = recientes
  if (recientes.length >= MAX_FALLOS) {
    reply.status(429).send({ error: 'Demasiados intentos — espera unos minutos' })
    return false
  }

  const { pin } = (body ?? {}) as { pin?: string }
  const a = Buffer.from(String(pin ?? ''))
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    recientes.push(ahora)
    reply.status(401).send({ error: 'PIN incorrecto' })
    return false
  }
  return true
}

// Los PIN de /admin y /pulso viven en el .env de la API (ADMIN_PIN, PULSO_PIN), no en el
// build del frontend: así el mismo build sirve para cualquier instalación.
export async function authRoutes(app: FastifyInstance) {

  // PIN de admin → token para las rutas protegidas
  app.post('/admin/auth', async (req, reply) => {
    if (!pinValido('ADMIN_PIN', req.body, reply)) return reply
    const token = app.jwt.sign({ tipo: 'admin', nombre: 'Admin', encargado: true }, { expiresIn: '12h' })
    return { token }
  })

  // PIN del panel del dueño (independiente del de admin)
  app.post('/pulso/auth', async (req, reply) => {
    if (!pinValido('PULSO_PIN', req.body, reply)) return reply
    const token = app.jwt.sign({ tipo: 'pulso', nombre: 'Pulso', encargado: false }, { expiresIn: '12h' })
    return { token }
  })
}
