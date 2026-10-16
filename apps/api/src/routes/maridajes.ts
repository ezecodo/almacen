import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'

// Maridajes: qué vino recomendar con lo que pidió la mesa (botón 🍷 de la sala), y perfil de cada
// vino (cuerpo, dulzor…) para cuando el cliente pide el vino antes que la comida.
// Claude puntúa cada vino con cada plato a partir de sus fichas, una vez, al pulsar "Recalcular con IA"
// en /admin/maridajes. La sala solo cruza lo guardado: es instantáneo y funciona sin internet.
// Una pareja corregida a mano (editado) no la pisa el siguiente recálculo.

type Color = 'tinto' | 'blanco' | 'rosado' | 'espumoso'
const esGrupoBarra = (g: string) => /vino|bebida/i.test(g) // mismo criterio que la sala

function colorDe(...nombres: (string | undefined)[]): Color | null {
  const t = nombres.filter(Boolean).join(' ')
  if (/cava|champ|espum/i.test(t)) return 'espumoso'
  if (/rosad|ros[eé]/i.test(t)) return 'rosado'
  if (/tint/i.test(t)) return 'tinto'
  if (/blanc/i.test(t)) return 'blanco'
  return null
}

// Vinos = bebidas con ficha en una categoría de color (TINTO BOTELLA, CAVA & CHAMPAGNE…).
// Platos = lo que no es de barra, visible en la carta y que no se cobra solo (pan ×pax).
async function cartaParaMaridar() {
  const [items, cats] = await Promise.all([
    prisma.menuItem.findMany({ where: { activo: true }, orderBy: [{ categoria: 'asc' }, { orden: 'asc' }] }),
    prisma.menuCategoria.findMany(),
  ])
  const porNombre = new Map<string, (typeof cats)[number]>()
  for (const c of cats) if (!porNombre.has(c.nombre) || c.restaurantId === null) porNombre.set(c.nombre, c)
  const porId = new Map(cats.map(c => [c.id, c]))

  const vinos: { id: number; nombre: string; precio: number; color: Color; ficha: string; restaurantId: number | null }[] = []
  const platos: typeof items = []
  for (const i of items) {
    const cat = porNombre.get(i.categoria)
    const padre = cat?.parentId ? porId.get(cat.parentId) : undefined
    const barra = esGrupoBarra(cat?.grupo ?? '')
    if (barra) {
      const color = colorDe(cat?.nombre, padre?.nombre)
      // Los vinos de la casa / por copa no se recomiendan, aunque alguien les escriba una ficha
      const porCopa = /casa|copa/i.test(`${cat?.nombre ?? ''} ${padre?.nombre ?? ''}`)
      if (color && !porCopa && i.ficha.trim()) vinos.push({ id: i.id, nombre: i.nombre, precio: i.precio, color, ficha: i.ficha, restaurantId: i.restaurantId })
    } else if (!i.autoPorPax && !i.ocultoEnCarta) {
      platos.push(i)
    }
  }
  return { vinos, platos }
}

// ── Recálculo con Claude ──────────────────────────────────────────────────────────────────────
// Una consulta por plato (unas pocas a la vez): si una falla solo se pierde ese plato, y la lista de
// vinos va en la parte que Anthropic guarda en caché, así las siguientes cuestan mucho menos.

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'
const A_LA_VEZ = 4

interface Estado { enCurso: boolean; hechos: number; total: number; errores: string[]; empezo: string | null; termino: string | null }
const estado: Estado = { enCurso: false, hechos: 0, total: 0, errores: [], empezo: null, termino: null }

const NOMBRE_COLOR: Record<Color, string> = { tinto: 'TINTO', blanco: 'BLANCO', rosado: 'ROSADO', espumoso: 'ESPUMOSO' }

const herramienta = {
  name: 'guardar_maridaje',
  description: 'Guarda la puntuación de cada vino de la carta con el plato.',
  input_schema: {
    type: 'object',
    properties: {
      puntos: {
        type: 'array',
        description: 'Un elemento por CADA vino de la lista, sin dejar ninguno.',
        items: {
          type: 'object',
          properties: { vino: { type: 'integer', description: 'id del vino' }, p: { type: 'integer', minimum: 0, maximum: 10 } },
          required: ['vino', 'p'],
        },
      },
      motivos: {
        type: 'array',
        description: 'Para cada vino con 7 puntos o más.',
        items: {
          type: 'object',
          properties: {
            vino: { type: 'integer' },
            es: { type: 'string', description: 'Para el camarero, en español, máx. 18 palabras.' },
            en: { type: 'string', description: 'La misma idea para decírsela al cliente, en inglés, máx. 18 palabras.' },
          },
          required: ['vino', 'es', 'en'],
        },
      },
    },
    required: ['puntos', 'motivos'],
  },
}

function instrucciones(vinos: Awaited<ReturnType<typeof cartaParaMaridar>>['vinos']) {
  const lista = vinos
    .map(v => `[${v.id}] ${NOMBRE_COLOR[v.color]} · ${v.nombre} · ${v.precio.toFixed(2)} €\n${v.ficha.trim()}`)
    .join('\n\n')
  return `Eres el sumiller de un restaurante de tapas de Barcelona. Te paso un plato de la carta y tienes que decir qué tal va cada vino de la carta con él.

Reglas:
- Puntúa CADA vino de 0 (no pega o lo estropea) a 10 (maridaje excelente). Usa toda la escala: no pongas a todos entre 6 y 8.
- Básate en lo que dicen las fichas de los vinos y la descripción del plato. No inventes características que no estén ahí (si una ficha dice poco, razona con la uva y la crianza).
- No tengas en cuenta el precio.
- Responde SIEMPRE llamando a la herramienta guardar_maridaje, sin texto aparte.
- Para cada vino con 7 puntos o más, escribe el motivo: concreto, qué del vino encuentra qué del plato ("la acidez corta la fritura", "los taninos suaves no tapan el pulpo"). En español para el camarero y en inglés, con la misma idea, para decírsela al cliente. Sin adornos de márketing.

Carta de vinos (id entre corchetes):

${lista}`
}

// Una pregunta a Claude que se contesta llamando a una herramienta (así la respuesta es JSON con forma fija)
async function preguntar<T>(sistema: string, pregunta: string, tool: { name: string }): Promise<T | undefined> {
  const clave = process.env.ANTHROPIC_API_KEY
  if (!clave) throw new Error('Falta ANTHROPIC_API_KEY en el .env de la API')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 8000,
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      // Este modelo no admite forzar la herramienta: se le pide en las instrucciones
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: pregunta }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const datos = await res.json() as { content: { type: string; name?: string; input?: unknown }[] }
  return datos.content.find(c => c.type === 'tool_use' && c.name === tool.name)?.input as T | undefined
}

async function maridarPlato(plato: { id: number; nombre: string; categoria: string; descripcion: string; ficha: string }, sistema: string, idsVinos: Set<number>) {
  const detalle = [plato.ficha.trim(), plato.descripcion.trim()].filter(Boolean).join('\n') || '(sin descripción)'
  const uso = await preguntar<{ puntos?: { vino: number; p: number }[]; motivos?: { vino: number; es: string; en: string }[] }>(
    sistema, `Plato: ${plato.nombre} (categoría ${plato.categoria})\n${detalle}`, herramienta)
  if (!uso?.puntos?.length) throw new Error('respuesta sin puntuaciones')

  const motivos = new Map((uso.motivos ?? []).map(m => [m.vino, m]))
  const filas = new Map<number, { puntos: number; motivo: string; motivoEn: string }>()
  for (const { vino, p } of uso.puntos) {
    if (!idsVinos.has(vino)) continue
    const m = motivos.get(vino)
    filas.set(vino, { puntos: Math.max(0, Math.min(10, Math.round(p))), motivo: m?.es?.trim() ?? '', motivoEn: m?.en?.trim() ?? '' })
  }

  // Lo editado a mano se respeta: solo se reemplaza lo demás
  await prisma.$transaction(async tx => {
    const editados = new Set((await tx.maridaje.findMany({ where: { platoId: plato.id, editado: true }, select: { vinoId: true } })).map(m => m.vinoId))
    await tx.maridaje.deleteMany({ where: { platoId: plato.id, editado: false } })
    await tx.maridaje.createMany({
      data: [...filas].filter(([vinoId]) => !editados.has(vinoId)).map(([vinoId, f]) => ({ platoId: plato.id, vinoId, ...f })),
    })
  })
}

// ── Perfil de cada vino (para pedir por gusto) ────────────────────────────────────────────────
const RASGOS = ['cuerpo', 'dulzor', 'fruta', 'madera', 'frescor', 'aromatico'] as const
type Rasgo = (typeof RASGOS)[number]

const herramientaPerfiles = {
  name: 'guardar_perfiles',
  description: 'Guarda el perfil de cada vino de la carta.',
  input_schema: {
    type: 'object',
    properties: {
      perfiles: {
        type: 'array',
        description: 'Un elemento por CADA vino de la lista.',
        items: {
          type: 'object',
          properties: {
            vino: { type: 'integer', description: 'id del vino' },
            cuerpo: { type: 'integer', minimum: 1, maximum: 5, description: '1 ligero … 5 con mucho cuerpo' },
            dulzor: { type: 'integer', minimum: 1, maximum: 5, description: '1 seco … 5 dulce' },
            fruta: { type: 'integer', minimum: 1, maximum: 5, description: '1 poca fruta … 5 muy afrutado' },
            madera: { type: 'integer', minimum: 1, maximum: 5, description: '1 sin barrica … 5 mucha crianza en madera' },
            frescor: { type: 'integer', minimum: 1, maximum: 5, description: '1 suave, poca acidez … 5 muy fresco y ácido' },
            aromatico: { type: 'integer', minimum: 1, maximum: 5, description: '1 neutro … 5 muy aromático' },
          },
          required: ['vino', ...RASGOS],
        },
      },
    },
    required: ['perfiles'],
  },
}

async function perfilarVinos(vinos: Awaited<ReturnType<typeof cartaParaMaridar>>['vinos']) {
  if (vinos.length === 0) return
  const lista = vinos.map(v => `[${v.id}] ${NOMBRE_COLOR[v.color]} · ${v.nombre}\n${v.ficha.trim()}`).join('\n\n')
  const sistema = `Eres el sumiller de un restaurante de tapas de Barcelona. Describe cada vino de la carta del 1 al 5 en seis rasgos, para que un camarero pueda recomendar cuando el cliente pide por gusto ("algo con cuerpo", "seco", "afrutado"…).
- Básate en la ficha; si dice poco, razona con la uva, la zona y la crianza. Compáralos entre ellos: usa toda la escala dentro de cada color.
- Un brut nature es 1 de dulzor. Sin crianza en barrica = madera 1.
- Responde SIEMPRE llamando a la herramienta guardar_perfiles, sin texto aparte.`
  const uso = await preguntar<{ perfiles?: ({ vino: number } & Record<Rasgo, number>)[] }>(sistema, `Vinos:\n\n${lista}`, herramientaPerfiles)
  if (!uso?.perfiles?.length) throw new Error('respuesta sin perfiles')

  const ids = new Set(vinos.map(v => v.id))
  const editados = new Set((await prisma.perfilVino.findMany({ where: { editado: true }, select: { vinoId: true } })).map(p => p.vinoId))
  const a15 = (n: number) => Math.max(1, Math.min(5, Math.round(Number(n) || 3)))
  for (const p of uso.perfiles) {
    if (!ids.has(p.vino) || editados.has(p.vino)) continue
    const datos = Object.fromEntries(RASGOS.map(r => [r, a15(p[r])])) as Record<Rasgo, number>
    await prisma.perfilVino.upsert({ where: { vinoId: p.vino }, create: { vinoId: p.vino, ...datos }, update: datos })
  }
}

async function recalcular(soloNuevos: boolean) {
  const { vinos, platos } = await cartaParaMaridar()
  let pendientes = platos
  let vinosSinPerfil = vinos
  if (soloNuevos) {
    const conParejas = new Set((await prisma.maridaje.findMany({ distinct: ['platoId'], select: { platoId: true } })).map(m => m.platoId))
    pendientes = platos.filter(p => !conParejas.has(p.id))
    const conPerfil = new Set((await prisma.perfilVino.findMany({ select: { vinoId: true } })).map(p => p.vinoId))
    vinosSinPerfil = vinos.filter(v => !conPerfil.has(v.id))
  }
  const conPerfiles = vinosSinPerfil.length > 0
  Object.assign(estado, { enCurso: true, hechos: 0, total: pendientes.length + (conPerfiles ? 1 : 0), errores: [], empezo: new Date().toISOString(), termino: null })
  const sistema = instrucciones(vinos)
  const idsVinos = new Set(vinos.map(v => v.id))

  const cola = [...pendientes]
  const trabajador = async () => {
    for (let plato = cola.shift(); plato; plato = cola.shift()) {
      try { await maridarPlato(plato, sistema, idsVinos) }
      catch (err) { estado.errores.push(`${plato.nombre}: ${(err as Error).message}`) }
      estado.hechos++
    }
  }
  // El perfil de los vinos es una consulta más, en paralelo con los platos
  const perfiles = async () => {
    if (!conPerfiles) return
    try { await perfilarVinos(vinosSinPerfil) }
    catch (err) { estado.errores.push(`Perfil de los vinos: ${(err as Error).message}`) }
    estado.hechos++
  }
  try { await Promise.all([perfiles(), ...Array.from({ length: A_LA_VEZ - 1 }, trabajador)]) }
  finally { estado.enCurso = false; estado.termino = new Date().toISOString() }
}

// ── Rutas ─────────────────────────────────────────────────────────────────────────────────────

const restQuery = z.object({ restaurantId: z.coerce.number().int().positive() })
const editarSchema = z.object({
  puntos: z.number().int().min(0).max(10).optional(),
  oculto: z.boolean().optional(),
  motivo: z.string().max(300).optional(),
  motivoEn: z.string().max(300).optional(),
  editado: z.boolean().optional(), // false = "que lo vuelva a decidir la IA"
})

export async function maridajeRoutes(app: FastifyInstance) {
  // Sala: los vinos (con su color) y las parejas de la carta de este local, sin las ocultas
  app.get('/maridajes', async req => {
    const { restaurantId } = restQuery.parse(req.query)
    const deEsteLocal = { activo: true, OR: [{ restaurantId }, { restaurantId: null }] }
    const [{ vinos }, parejas, perfiles] = await Promise.all([
      cartaParaMaridar(),
      prisma.maridaje.findMany({
        where: { oculto: false, plato: deEsteLocal, vino: deEsteLocal },
        select: { platoId: true, vinoId: true, puntos: true, motivo: true, motivoEn: true },
      }),
      prisma.perfilVino.findMany(),
    ])
    const perfilDe = new Map(perfiles.map(p => [p.vinoId, Object.fromEntries(RASGOS.map(r => [r, p[r]]))]))
    return {
      vinos: vinos
        .filter(v => v.restaurantId === null || v.restaurantId === restaurantId)
        .map(v => ({ id: v.id, color: v.color, perfil: perfilDe.get(v.id) ?? null })),
      parejas,
    }
  })

  // Admin: todo, para revisar y corregir
  app.get('/admin/maridajes', async () => {
    const [{ vinos, platos }, parejas, perfiles] = await Promise.all([
      cartaParaMaridar(),
      prisma.maridaje.findMany({ orderBy: { puntos: 'desc' } }),
      prisma.perfilVino.findMany(),
    ])
    return {
      estado,
      hayClave: !!process.env.ANTHROPIC_API_KEY,
      vinos: vinos.map(({ ficha: _, ...v }) => v),
      platos: platos.map(p => ({ id: p.id, nombre: p.nombre, categoria: p.categoria })),
      parejas,
      perfiles,
    }
  })

  app.post('/admin/maridajes/recalcular', async (req, reply) => {
    const { soloNuevos } = z.object({ soloNuevos: z.boolean().default(false) }).parse(req.body ?? {})
    if (!process.env.ANTHROPIC_API_KEY) return reply.status(503).send({ error: 'Falta ANTHROPIC_API_KEY en el .env de la API' })
    if (estado.enCurso) return reply.status(409).send({ error: 'Ya hay un recálculo en marcha' })
    // Puede tardar un par de minutos: se contesta ya y la pantalla pregunta cómo va
    recalcular(soloNuevos).catch(err => { estado.errores.push((err as Error).message); estado.enCurso = false })
    return reply.status(202).send({ ok: true })
  })

  // Corregir a mano un rasgo del perfil de un vino (editado = true salvo que se pida volver a la IA)
  app.patch('/admin/maridajes/perfil/:vinoId', async (req, reply) => {
    const { vinoId } = z.object({ vinoId: z.coerce.number().int().positive() }).parse(req.params)
    const rasgo = z.number().int().min(1).max(5).optional()
    const datos = z.object({
      cuerpo: rasgo, dulzor: rasgo, fruta: rasgo, madera: rasgo, frescor: rasgo, aromatico: rasgo, editado: z.boolean().optional(),
    }).parse(req.body)
    const existe = await prisma.perfilVino.findUnique({ where: { vinoId } })
    if (!existe) return reply.status(404).send({ error: 'Ese vino todavía no tiene perfil' })
    return prisma.perfilVino.update({ where: { vinoId }, data: { ...datos, editado: datos.editado ?? true } })
  })

  app.patch('/admin/maridajes/:id', async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params)
    const datos = editarSchema.parse(req.body)
    const existe = await prisma.maridaje.findUnique({ where: { id } })
    if (!existe) return reply.status(404).send({ error: 'Esa pareja no existe' })
    return prisma.maridaje.update({ where: { id }, data: { ...datos, editado: datos.editado ?? true } })
  })
}
