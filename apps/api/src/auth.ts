import { FastifyReply, FastifyRequest } from 'fastify'

// Sesión firmada (JWT). La emiten POST /empleados/auth (sala, por PIN de empleado)
// POST /admin/auth (PIN de admin validado en el servidor) y POST /pulso/auth (panel del dueño).
// Toda la API exige una de estas sesiones salvo las rutas públicas listadas en server.ts.
export interface Sesion {
  tipo:        'sala' | 'admin' | 'pulso'
  nombre:      string
  empleadoId?: number
  // Restaurante del dispositivo donde entró (lo elige quien configura la tablet). Solo sesiones de sala.
  restaurantId?: number
  // rol 'encargado' o superpoder accesoEncargadoApp — mismo criterio que esEncargado en /sala
  encargado:   boolean
  // rol 'jefe_cocina': además de leer las recetas, canta los altos (platos agotados) desde /sala/cocina
  jefeCocina?: boolean
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Sesion
    user:    Sesion
  }
}

async function verificar(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    return true
  } catch {
    reply.status(401).send({ error: 'Sesión caducada — vuelve a entrar con tu PIN' })
    return false
  }
}

// Encargado de sala o admin
export async function requireEncargado(req: FastifyRequest, reply: FastifyReply) {
  if (!(await verificar(req, reply))) return
  if (req.user.tipo !== 'admin' && !req.user.encargado) {
    return reply.status(403).send({ error: 'Solo encargados' })
  }
}

// Marcar o reponer un plato agotado: encargado de sala, jefe de cocina o admin
export async function requireAltos(req: FastifyRequest, reply: FastifyReply) {
  if (!(await verificar(req, reply))) return
  if (req.user.tipo !== 'admin' && !req.user.encargado && !req.user.jefeCocina) {
    return reply.status(403).send({ error: 'Solo encargados' })
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!(await verificar(req, reply))) return
  if (req.user.tipo !== 'admin') {
    return reply.status(403).send({ error: 'Solo administración' })
  }
}
