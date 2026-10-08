import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { brokerConfigurado, estadoDePi, normalizarPiCodigo, impresorasDePi, enviarOrden, ImpresoraDetectada } from '../mqtt'

const empresaSchema = z.object({
  razonSocial: z.string().default(''),
  nif:         z.string().nullable().optional(),
  tasaIva:     z.number().min(0).max(100).default(10),
  mensajePie:  z.string().nullable().optional(),
})

const ticketConfigSchema = z.object({
  restaurantId:       z.number().int().positive(),
  nombreComercial:    z.string().min(1),
  direccion:          z.string().nullable().optional(),
  telefono:           z.string().nullable().optional(),
  mensajePieOverride: z.string().nullable().optional(),
})

const impresoraSchema = z.object({
  restaurantId: z.number().int().positive(),
  nombre:       z.string().min(1),
  ip:           z.string().min(1),
  mac:          z.string().nullable().optional(),
})

const rutaSchema = z.object({
  floorPlanId: z.number().int().positive(),
  tipoTicket:  z.enum(['cocina', 'barra', 'cobro']),
  impresoraId: z.number().int().positive(),
  copias:      z.number().int().min(1).max(5).default(1),
})

const piSchema = z.object({
  restaurantId: z.number().int().positive(),
  codigo:       z.string().nullable(),
})

// Sigue a cada impresora por su dirección física (MAC) con lo que la Pi encuentra en la red:
//  - impresora con MAC conocida que aparece con otra IP (el router se la cambió) → se corrige la IP
//  - impresora sin MAC cuya IP coincide con una detectada → se anota la MAC, para poder seguirla después
// Se llama cada vez que una Pi informa una búsqueda, y al vincular una Pi.
export async function sincronizarImpresoras(piCodigo: string, detectadas: ImpresoraDetectada[]) {
  try {
    const restaurante = await prisma.restaurant.findUnique({
      where: { piCodigo },
      select: { nombre: true, impresoras: true },
    })
    if (!restaurante) return

    for (const imp of restaurante.impresoras) {
      if (imp.mac) {
        const vista = detectadas.find((d) => d.mac === imp.mac)
        if (vista && vista.ip !== imp.ip) {
          await prisma.impresora.update({ where: { id: imp.id }, data: { ip: vista.ip } })
          console.log(`[impresoras] ${restaurante.nombre} · ${imp.nombre}: cambió de IP ${imp.ip} → ${vista.ip} (misma MAC ${imp.mac})`)
        }
      } else {
        const vista = detectadas.find((d) => d.ip === imp.ip.trim() && d.mac)
        if (vista) await prisma.impresora.update({ where: { id: imp.id }, data: { mac: vista.mac } })
      }
    }
  } catch (err) {
    console.error('[impresoras] no se pudo sincronizar con lo detectado por', piCodigo, err)
  }
}

// La Pi vinculada al restaurante, solo si está conectada ahora (si no, un pedido se perdería sin aviso)
async function piConectada(restaurantId: number): Promise<{ codigo: string } | { error: string; status: number }> {
  const restaurante = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { piCodigo: true } })
  if (!restaurante?.piCodigo) return { error: 'Este restaurante no tiene una Pi vinculada', status: 409 }
  if (!brokerConfigurado()) return { error: 'La API no tiene configurado el servicio de impresión (MQTT)', status: 503 }
  if (!estadoDePi(restaurante.piCodigo)?.online) return { error: 'La Pi no está conectada', status: 409 }
  return { codigo: restaurante.piCodigo }
}

export async function ticketRoutes(app: FastifyInstance) {

  // ── Empresa (singleton) ───────────────────────────────────────────────────────

  // GET /empresa-config — crea la fila con valores por defecto si aún no existe
  app.get('/empresa-config', async () => {
    const existente = await prisma.empresaConfig.findFirst()
    if (existente) return existente
    return prisma.empresaConfig.create({ data: {} })
  })

  // PUT /empresa-config
  app.put('/empresa-config', async (req, reply) => {
    const result = empresaSchema.partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })

    const existente = await prisma.empresaConfig.findFirst()
    if (existente) {
      return prisma.empresaConfig.update({ where: { id: existente.id }, data: result.data })
    }
    return prisma.empresaConfig.create({ data: result.data })
  })

  // ── Ticket config por restaurante ─────────────────────────────────────────────

  // GET /tickets/config?restaurantId=X
  app.get('/tickets/config', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.ticketConfig.findUnique({ where: { restaurantId: Number(restaurantId) } })
  })

  // PUT /tickets/config — upsert por restaurantId
  app.put('/tickets/config', async (req, reply) => {
    const result = ticketConfigSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { restaurantId, ...data } = result.data

    return prisma.ticketConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: data,
    })
  })

  // ── Raspberry Pi de impresión vinculada al restaurante ────────────────────────

  // GET /tickets/pi?restaurantId=X — código vinculado + si la Pi está conectada al broker ahora
  app.get('/tickets/pi', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    const restaurante = await prisma.restaurant.findUnique({
      where: { id: Number(restaurantId) },
      select: { piCodigo: true },
    })
    if (!restaurante) return reply.status(404).send({ error: 'Restaurante no encontrado' })

    const estado = restaurante.piCodigo ? estadoDePi(restaurante.piCodigo) : null
    return {
      codigo: restaurante.piCodigo,
      online: estado?.online ?? false,
      vistoAt: estado?.vistoAt ?? null,   // null = la API nunca supo de esa Pi
      brokerConfigurado: brokerConfigurado(),
    }
  })

  // PUT /tickets/pi { restaurantId, codigo } — vincular; codigo null = desvincular
  app.put('/tickets/pi', async (req, reply) => {
    const result = piSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Datos inválidos' })
    const { restaurantId } = result.data

    let codigo: string | null = null
    if (result.data.codigo !== null) {
      codigo = normalizarPiCodigo(result.data.codigo)
      if (!codigo) return reply.status(400).send({ error: 'Código inválido. Tiene la forma OIDO-7F3A2C (está en la etiqueta de la Pi).' })

      const otro = await prisma.restaurant.findFirst({
        where: { piCodigo: codigo, id: { not: restaurantId } },
        select: { nombre: true },
      })
      if (otro) return reply.status(409).send({ error: `Esa Pi ya está vinculada a ${otro.nombre}. Desvinculala ahí primero.` })
    }

    await prisma.restaurant.update({ where: { id: restaurantId }, data: { piCodigo: codigo } })
    if (codigo) await sincronizarImpresoras(codigo, impresorasDePi(codigo)?.impresoras ?? [])
    const estado = codigo ? estadoDePi(codigo) : null
    return { codigo, online: estado?.online ?? false, vistoAt: estado?.vistoAt ?? null, brokerConfigurado: brokerConfigurado() }
  })

  // GET /tickets/pi/impresoras?restaurantId=X — impresoras que la Pi encontró en la red del local,
  // cruzadas por IP con las ya cargadas en el restaurante (para saber cuáles faltan nombrar)
  app.get('/tickets/pi/impresoras', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    const restaurante = await prisma.restaurant.findUnique({
      where: { id: Number(restaurantId) },
      select: { piCodigo: true, impresoras: { select: { id: true, nombre: true, ip: true } } },
    })
    if (!restaurante) return reply.status(404).send({ error: 'Restaurante no encontrado' })

    const escaneo = restaurante.piCodigo ? impresorasDePi(restaurante.piCodigo) : null
    return {
      escaneadoAt: escaneo?.escaneadoAt ?? null,   // null = la Pi todavía no informó ninguna búsqueda
      detectadas: (escaneo?.impresoras ?? []).map((d) => {
        const cargada = restaurante.impresoras.find((i) => i.ip.trim() === d.ip)
        return { ip: d.ip, mac: d.mac, impresoraId: cargada?.id ?? null, nombre: cargada?.nombre ?? null }
      }),
    }
  })

  // POST /tickets/pi/escanear { restaurantId } — le pide a la Pi que vuelva a buscar impresoras
  app.post('/tickets/pi/escanear', async (req, reply) => {
    const result = z.object({ restaurantId: z.number().int().positive() }).safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'Datos inválidos' })
    const pi = await piConectada(result.data.restaurantId)
    if ('error' in pi) return reply.status(pi.status).send({ error: pi.error })
    enviarOrden(pi.codigo, { accion: 'escanear' })
    return { ok: true }
  })

  // POST /tickets/pi/probar { restaurantId, ip } — esa impresora imprime un papel con su IP.
  // Solo se aceptan IPs que la Pi detectó o que ya están cargadas en el restaurante.
  app.post('/tickets/pi/probar', async (req, reply) => {
    const result = z.object({ restaurantId: z.number().int().positive(), ip: z.string().ip({ version: 'v4' }) }).safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: 'IP inválida' })
    const { restaurantId, ip } = result.data
    const pi = await piConectada(restaurantId)
    if ('error' in pi) return reply.status(pi.status).send({ error: pi.error })

    const detectada = impresorasDePi(pi.codigo)?.impresoras.some((i) => i.ip === ip)
    const cargada = await prisma.impresora.findFirst({ where: { restaurantId, ip }, select: { id: true } })
    if (!detectada && !cargada) return reply.status(400).send({ error: 'Esa IP no es una impresora de este restaurante' })

    enviarOrden(pi.codigo, { accion: 'probar', ip })
    return { ok: true }
  })

  // ── Impresoras (por restaurante) ──────────────────────────────────────────────

  // GET /tickets/impresoras?restaurantId=X
  app.get('/tickets/impresoras', async (req, reply) => {
    const { restaurantId } = req.query as { restaurantId?: string }
    if (!restaurantId) return reply.status(400).send({ error: 'restaurantId requerido' })
    return prisma.impresora.findMany({
      where: { restaurantId: Number(restaurantId) },
      orderBy: { nombre: 'asc' },
    })
  })

  // POST /tickets/impresoras
  app.post('/tickets/impresoras', async (req, reply) => {
    const result = impresoraSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const { mac, ...resto } = result.data
    const impresora = await prisma.impresora.create({ data: { ...resto, mac: mac ? mac.toUpperCase() : null } })
    return reply.status(201).send(impresora)
  })

  // PUT /tickets/impresoras/:id
  app.put('/tickets/impresoras/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = impresoraSchema.omit({ restaurantId: true, mac: true }).partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    // IP escrita a mano = puede ser otra impresora: se olvida la MAC (si no, la próxima búsqueda
    // la devolvería a la IP anterior). Se vuelve a anotar sola cuando la Pi la encuentre ahí.
    const actual = await prisma.impresora.findUnique({ where: { id }, select: { ip: true } })
    const cambiaIp = result.data.ip !== undefined && result.data.ip.trim() !== actual?.ip.trim()
    return prisma.impresora.update({ where: { id }, data: { ...result.data, ...(cambiaIp && { mac: null }) } })
  })

  // DELETE /tickets/impresoras/:id — borra en cascada sus rutas de impresión
  app.delete('/tickets/impresoras/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.impresora.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Rutas de impresión (por sala) ──────────────────────────────────────────────

  // GET /tickets/rutas?floorPlanId=X
  app.get('/tickets/rutas', async (req, reply) => {
    const { floorPlanId } = req.query as { floorPlanId?: string }
    if (!floorPlanId) return reply.status(400).send({ error: 'floorPlanId requerido' })
    return prisma.impresionRuta.findMany({
      where: { floorPlanId: Number(floorPlanId) },
      include: { impresora: true },
      orderBy: { id: 'asc' },
    })
  })

  // POST /tickets/rutas
  app.post('/tickets/rutas', async (req, reply) => {
    const result = rutaSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    const ruta = await prisma.impresionRuta.create({ data: result.data, include: { impresora: true } })
    return reply.status(201).send(ruta)
  })

  // PUT /tickets/rutas/:id — cambiar copias o la impresora destino
  app.put('/tickets/rutas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const result = rutaSchema.omit({ floorPlanId: true, tipoTicket: true }).partial().safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() })
    return prisma.impresionRuta.update({ where: { id }, data: result.data, include: { impresora: true } })
  })

  // DELETE /tickets/rutas/:id
  app.delete('/tickets/rutas/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.impresionRuta.delete({ where: { id } })
    return reply.status(204).send()
  })
}
