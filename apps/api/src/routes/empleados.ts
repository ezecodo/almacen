import { FastifyInstance } from 'fastify'
import { firmarPaseLocal, MODO_LOCAL, urlDeBox } from '../local'
import { Sesion } from '../auth'
import { z } from 'zod'
import { prisma } from '../server'
import { requireAdmin } from '../auth'
import { pedirBadge } from '../suite'

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

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const badgeSchema = z.object({
  restaurantId: z.number().int().positive(),
  tipo:         z.enum(['BASIC', 'GOLD']),
  nombre:       z.string().trim().min(1).max(60),
  apellido:     z.string().trim().min(1).max(80),
  email:        z.string().trim().toLowerCase().email(),
  rol:          z.string().trim().min(2).max(80),
  fechaInicio:  fechaIso,
  fechaFin:     fechaIso.nullable(),
  skills:       z.array(z.string().trim().min(1)).max(12),
  nota:         z.string().max(1000),
})

// Al dar de baja a alguien, sus turnos planificados de hoy en adelante se van: si no, seguían
// contando como cubiertos en el planning aunque ya no aparecía en la cuadrícula
async function quitarTurnosFuturos(empleadoId: number) {
  const hoy = new Date(`${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })}T00:00:00.000Z`)
  await prisma.turnoEmpleado.deleteMany({ where: { empleadoId, fecha: { gte: hoy } } })
}

export async function empleadoRoutes(app: FastifyInstance) {

  // POST /empleados/:id/badge — dar un badge de Oído Talent a un empleado, a nombre del restaurante.
  // Lo firma y lo comunica el back-office (ver suite.ts). Solo administración.
  app.post('/empleados/:id/badge', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = badgeSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Revisa los datos: nombre, apellido, email, puesto y fecha de inicio son obligatorios' })
    const d = result.data
    const [empleado, restaurante] = await Promise.all([
      prisma.empleado.findUnique({ where: { id }, select: { id: true } }),
      prisma.restaurant.findUnique({ where: { id: d.restaurantId }, select: { id: true, nombre: true } }),
    ])
    if (!empleado) return reply.status(404).send({ error: 'Empleado no encontrado' })
    if (!restaurante) return reply.status(404).send({ error: 'Restaurante no encontrado' })

    const r = await pedirBadge({
      local: { nombre: restaurante.nombre, restaurantId: restaurante.id },
      badge: {
        tipo: d.tipo,
        trabajador: { nombre: d.nombre, apellido: d.apellido, email: d.email },
        rol: d.rol,
        fechaInicio: d.fechaInicio,
        fechaFin: d.fechaFin,
        endorsement: { skills: d.skills, nota: d.nota },
      },
    })
    if (!r.ok) return reply.status(r.status).send({ error: r.error })
    return reply.status(201).send({ codigo: r.codigo, url: r.url, avisado: r.avisado })
  })


  // Auth por PIN (sala, almacén y mis propinas)
  app.post('/empleados/auth', async (req, reply) => {
    const { pin, restaurantId } = (req.body ?? {}) as { pin?: string; restaurantId?: number }
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
    const sesion: Sesion = {
      tipo: 'sala',
      nombre: empleado.nombre,
      empleadoId: empleado.id,
      ...(Number.isInteger(restaurantId) ? { restaurantId } : {}),
      encargado: empleado.tipo === 'sala' && (empleado.rol === 'encargado' || empleado.accesoEncargadoApp),
    }
    const token = app.jwt.sign(sesion, { expiresIn: '16h' })

    // Si el local tiene Box, la app recibe también dónde encontrarla y un pase que vale en ella:
    // así, si se cae internet, sigue comandando contra la Box sin volver a pedir el PIN.
    let local: { url: string; token: string } | undefined
    if (!MODO_LOCAL && Number.isInteger(restaurantId)) {
      const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { piCodigo: true, piSecreto: true } })
      const url = r?.piCodigo ? urlDeBox(r.piCodigo) : null
      if (r?.piSecreto && url) local = { url, token: firmarPaseLocal(sesion, r.piSecreto, 16) }
    }

    return { ...empleado, token, ...(local ? { local } : {}) }
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
    if (result.data.activo === false) await quitarTurnosFuturos(id)
    return empleado
  })

  // Desactivar empleado (soft delete)
  app.patch('/empleados/:id/desactivar', { preHandler: requireAdmin }, async (req, _reply) => {
    const id = Number((req.params as { id: string }).id)
    const empleado = await prisma.empleado.update({ where: { id }, data: { activo: false } })
    await quitarTurnosFuturos(id)
    return empleado
  })

  // Eliminar empleado (hard delete — anonimiza retiros si los tiene)
  app.delete('/empleados/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)

    const empleado = await prisma.empleado.findUnique({ where: { id } })
    if (!empleado) return reply.status(404).send({ error: 'Empleado no encontrado' })

    // Con propinas repartidas no se borra: se perderían sus filas y los repartos viejos dejarían de cuadrar
    const conPropinas = await prisma.propinaTurno.count({ where: { empleadoId: id } })
    if (conPropinas > 0) return reply.status(409).send({ error: `${empleado.nombre} tiene propinas repartidas en ${conPropinas} turno${conPropinas === 1 ? '' : 's'}: desactívalo en vez de eliminarlo` })

    // Anonimizar retiros: guardar nombre, desligar FK
    await prisma.retiro.updateMany({
      where: { empleadoId: id },
      data:  { empleadoId: { set: null }, empleadoNombre: empleado.nombre },
    })

    // Borrar sus turnos del planning y luego el empleado
    await prisma.turnoEmpleado.deleteMany({ where: { empleadoId: id } })
    await prisma.empleado.delete({ where: { id } })
    return reply.status(204).send()
  })
}
