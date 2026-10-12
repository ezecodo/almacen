import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { requireAdmin } from '../auth'

// Freno contra fuerza bruta del PIN (4 dígitos = 10.000 combinaciones): por IP, en memoria.
// El tope es holgado porque todas las tablets de un local salen por la misma IP.
const MAX_FALLOS = 20
const VENTANA_MS = 10 * 60 * 1000
const fallosPorIp = new Map<string, number[]>()

const diasLibresSchema = z.array(z.number().int().min(0).max(6)).optional()

const createSchema = z.object({
  nombre:          z.string().min(1),
  tipo:            z.enum(['cocina', 'sala']).default('cocina'),
  pin:             z.string().length(4).regex(/^\d{4}$/),
  telefono:        z.string().optional(),
  email:           z.string().email().optional(),
  horasSemanales:  z.number().int().refine(v => [20, 25, 30, 35, 40].includes(v), { message: 'Debe ser 20, 25, 30, 35 o 40' }).default(40),
  rol:             z.enum(['friegaplatos', 'cocinero', 'jefe_cocina', 'produccion', 'camarero', 'encargado']).optional(),
  puedeEncargado:  z.boolean().optional(),
  accesoEncargadoApp: z.boolean().optional(),
  puedeJefeCocina: z.boolean().optional(),
  excluirPlanning: z.boolean().optional(),
  restaurantId:    z.number().int().positive().optional().nullable(),
  diasLibresFijos: diasLibresSchema,
})

const updateSchema = z.object({
  nombre:          z.string().min(1).optional(),
  tipo:            z.enum(['cocina', 'sala']).optional(),
  pin:             z.string().length(4).regex(/^\d{4}$/).optional(),
  telefono:        z.string().optional().nullable(),
  email:           z.string().email().optional().nullable(),
  horasSemanales:  z.number().int().refine(v => [20, 25, 30, 35, 40].includes(v), { message: 'Debe ser 20, 25, 30, 35 o 40' }).optional(),
  rol:             z.enum(['friegaplatos', 'cocinero', 'jefe_cocina', 'produccion', 'camarero', 'encargado']).optional().nullable(),
  puedeEncargado:  z.boolean().optional(),
  accesoEncargadoApp: z.boolean().optional(),
  puedeJefeCocina: z.boolean().optional(),
  excluirPlanning: z.boolean().optional(),
  restaurantId:    z.number().int().positive().optional().nullable(),
  activo:          z.boolean().optional(),
  diasLibresFijos: diasLibresSchema,
})

export async function empleadoRoutes(app: FastifyInstance) {

  // Auth por PIN (solo cocina)
  app.post('/empleados/auth', async (req, reply) => {
    const { pin } = (req.body ?? {}) as { pin?: string }
    if (!pin) return reply.status(400).send({ error: 'PIN requerido' })

    // Nginx pone la IP del visitante en X-Real-IP
    const ip = String(req.headers['x-real-ip'] ?? req.ip)
    const ahora = Date.now()
    const recientes = (fallosPorIp.get(ip) ?? []).filter(t => ahora - t < VENTANA_MS)
    if (recientes.length >= MAX_FALLOS) {
      return reply.status(429).send({ error: 'Demasiados intentos — espera unos minutos' })
    }

    const empleado = await prisma.empleado.findUnique({ where: { pin: String(pin) } })
    if (!empleado || !empleado.activo) {
      fallosPorIp.set(ip, [...recientes, ahora])
      return reply.status(401).send({ error: 'PIN incorrecto' })
    }

    // Sesión firmada para las rutas protegidas (hoy: facturas). Mismo criterio de
    // encargado que la app de sala: rol 'encargado' o superpoder accesoEncargadoApp.
    const token = app.jwt.sign({
      tipo: 'sala',
      nombre: empleado.nombre,
      empleadoId: empleado.id,
      encargado: empleado.tipo === 'sala' && (empleado.rol === 'encargado' || empleado.accesoEncargadoApp),
    }, { expiresIn: '16h' })

    return { ...empleado, token }
  })

  // Listar empleados con filtro opcional por tipo
  // La ficha de personal (PIN, teléfono, email) solo la ve y la toca el panel de administración
  app.get('/empleados', { preHandler: requireAdmin }, async (req) => {
    const { tipo } = req.query as { tipo?: string }
    return prisma.empleado.findMany({
      where: tipo ? { tipo, activo: true } : undefined,
      include: { restaurant: { select: { id: true, nombre: true } } },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    })
  })

  // Crear empleado
  app.post('/empleados', { preHandler: requireAdmin }, async (req, reply) => {
    const result = createSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    if (result.data.pin) {
      const existe = await prisma.empleado.findUnique({ where: { pin: result.data.pin } })
      if (existe) return reply.status(409).send({ error: 'Este PIN ya está en uso' })
    }

    const empleado = await prisma.empleado.create({ data: result.data })
    return reply.status(201).send(empleado)
  })

  // Editar empleado
  app.put('/empleados/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = updateSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    if (result.data.pin) {
      const existe = await prisma.empleado.findFirst({
        where: { pin: result.data.pin, NOT: { id } },
      })
      if (existe) return reply.status(409).send({ error: 'Este PIN ya está en uso' })
    }

    const empleado = await prisma.empleado.update({ where: { id }, data: result.data })
    return empleado
  })

  // Desactivar empleado (soft delete)
  app.patch('/empleados/:id/desactivar', { preHandler: requireAdmin }, async (req, _reply) => {
    const id = Number((req.params as { id: string }).id)
    const empleado = await prisma.empleado.update({ where: { id }, data: { activo: false } })
    return empleado
  })

  // Eliminar empleado (hard delete — anonimiza retiros si los tiene)
  app.delete('/empleados/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const empleado = await prisma.empleado.findUnique({ where: { id } })
    if (!empleado) return reply.status(404).send({ error: 'Empleado no encontrado' })

    // Anonimizar retiros: guardar nombre, desligar FK
    await prisma.retiro.updateMany({
      where: { empleadoId: id },
      data:  { empleadoId: { set: null }, empleadoNombre: empleado.nombre },
    })

    // Borrar turnos de propinas y luego el empleado
    await prisma.propinaTurno.deleteMany({ where: { empleadoId: id } })
    await prisma.turnoEmpleado.deleteMany({ where: { empleadoId: id } })
    await prisma.empleado.delete({ where: { id } })
    return reply.status(204).send()
  })
}
