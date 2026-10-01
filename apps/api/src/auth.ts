import { FastifyReply, FastifyRequest } from 'fastify'

// Sesión firmada (JWT). La emiten POST /empleados/auth (sala, por PIN de empleado)
// y POST /admin/auth (PIN de admin validado en el servidor).
export interface Sesion {
  tipo:        'sala' | 'admin'
  nombre:      string
  empleadoId?: number
  // rol 'encargado' o superpoder accesoEncargadoApp — mismo criterio que esEncargado en /sala
  encargado:   boolean
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

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!(await verificar(req, reply))) return
  if (req.user.tipo !== 'admin') {
    return reply.status(403).send({ error: 'Solo administración' })
  }
}
