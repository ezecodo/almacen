import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import fs from 'fs/promises'
import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../server'
import { base } from '../costes'
import { requireJefeCocina } from '../auth'
import { MAX_BYTES_FOTO, archivoFoto, archivoFotoPase, dondeFoto, esJpeg, guardarArchivoFotoPase, guardarFotoFicha, leerFotosPase, pasosDelPase, quitarFotoFicha } from './escandallos'

// Wiki de cocina (/cocina): las fichas técnicas que crea el chef ejecutivo en /admin/escandallos,
// para leer en la cocina con el PIN de cualquier empleado. Solo lectura y nunca un precio.
// Platos: los de comida de la carta del local que se elige (globales + suyos) con ficha; elaboraciones: todas.
// Lo único que se escribe son fotos: el plato terminado y los pasos del emplatado (jefe de cocina o admin).

const conFicha = {
  lineas: { include: { producto: { select: { id: true, nombre: true, unidad: true, unidadBase: true, contenido: true, elaboracion: { select: { id: true } } } } }, orderBy: { orden: 'asc' as const } },
  partes: { orderBy: { orden: 'asc' as const } },
}

// Una ficha "existe" para la cocina si tiene algo que leer
const tieneFicha = { OR: [{ lineas: { some: {} } }, { partes: { some: {} } }, { emplatado: { not: '' } }] }

const fotoParams = z.object({ tipo: z.enum(['plato', 'elab']), id: z.coerce.number().int().positive() })
const pasoParams = fotoParams.extend({ paso: z.coerce.number().int().min(0) })

export async function cocinaRoutes(app: FastifyInstance) {
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: MAX_BYTES_FOTO }, (_req, body, done) => done(null, body))

  app.get('/cocina/recetas', async req => {
    const rid = Number((req.query as { restaurantId?: string }).restaurantId) || null
    const [platos, cats, elaboraciones] = await Promise.all([
      prisma.menuItem.findMany({
        where: { activo: true, receta: tieneFicha, OR: [{ restaurantId: null }, ...(rid ? [{ restaurantId: rid }] : [])] },
        select: { id: true, nombre: true, categoria: true, orden: true, receta: { select: { fotoAt: true, raciones: true, _count: { select: { partes: true } } } } },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      }),
      prisma.menuCategoria.findMany({ where: { OR: [{ restaurantId: null }, ...(rid ? [{ restaurantId: rid }] : [])] } }),
      prisma.inventarioProducto.findMany({
        where: { activo: true, restaurantId: null, elaboracion: tieneFicha },
        select: { id: true, nombre: true, categoria: { select: { personalProduccion: true } }, elaboracion: { select: { fotoAt: true } } },
        orderBy: { nombre: 'asc' },
      }),
    ])
    const catPorNombre = new Map(cats.map(c => [c.nombre, c]))
    const catPorId = new Map(cats.map(c => [c.id, c]))
    const ordenCat = (nombre: string) => {
      const c = catPorNombre.get(nombre)
      if (!c) return Number.MAX_SAFE_INTEGER
      const padre = c.parentId ? catPorId.get(c.parentId) : undefined
      return padre ? padre.orden * 1000 + 1 + c.orden : c.orden * 1000
    }
    // Solo comida: lo de barra (vinos, bebidas; misma regla que la sala) no se cocina
    const esBarra = (cat: string) => /vino|bebida/i.test(catPorNombre.get(cat)?.grupo ?? '')
    return {
      platos: platos.filter(p => !esBarra(p.categoria)).map(p => ({
        id: p.id, nombre: p.nombre, categoria: p.categoria, categoriaOrden: ordenCat(p.categoria),
        grupo: catPorNombre.get(p.categoria)?.grupo ?? '', fotoAt: p.receta?.fotoAt ?? null, partes: p.receta?._count.partes ?? 0,
      })),
      elaboraciones: elaboraciones.map(e => ({ id: e.id, nombre: e.nombre, produccion: e.categoria.personalProduccion, fotoAt: e.elaboracion?.fotoAt ?? null })),
    }
  })

  app.get('/cocina/recetas/:tipo/:id', async (req, reply) => {
    const { tipo, id } = z.object({ tipo: z.enum(['plato', 'elab']), id: z.coerce.number().int().positive() }).parse(req.params)
    const receta = await prisma.receta.findUnique({
      where: tipo === 'plato' ? { menuItemId: id } : { productoId: id },
      include: {
        ...conFicha,
        menuItem: { select: { nombre: true, categoria: true, alergenosNota: true, alergenos: { select: { nombre: true, icono: true }, orderBy: { orden: 'asc' } } } },
        producto: { select: { nombre: true, unidad: true, unidadBase: true, contenido: true, recetaLineas: { select: { receta: { select: { menuItem: { select: { id: true, nombre: true } } } } } } } },
      },
    })
    if (!receta) return reply.status(404).send({ error: 'Esta receta no tiene ficha' })

    const linea = (l: (typeof receta.lineas)[number]) => ({
      nombre: l.producto.nombre,
      cantidad: l.cantidad,
      texto: l.texto,
      unidad: base(l.producto).unidadBase, // g / ml / ud
      elaboracionId: l.producto.elaboracion ? l.producto.id : null,
    })
    const sueltas = receta.lineas.filter(l => l.parteId === null)
    const partes = [
      ...(sueltas.length ? [{ nombre: '', pasos: [] as string[], lineas: sueltas.map(linea) }] : []),
      ...receta.partes.map(p => ({
        nombre: p.nombre,
        pasos: Array.isArray(p.pasos) ? (p.pasos as string[]) : [],
        lineas: receta.lineas.filter(l => l.parteId === p.id).map(linea),
      })),
    ]
    const comun = { tipo, id, partes, emplatado: receta.emplatado, notas: receta.notas, fotoAt: receta.fotoAt, fotosPase: leerFotosPase(receta.fotosPase) }
    if (tipo === 'plato') {
      const m = receta.menuItem!
      return { ...comun, nombre: m.nombre, categoria: m.categoria, raciones: receta.raciones, alergenos: m.alergenos, alergenosNota: m.alergenosNota }
    }
    const p = receta.producto!
    const usadaEn = [...new Map(p.recetaLineas.flatMap(l => (l.receta.menuItem ? [[l.receta.menuItem.id, l.receta.menuItem.nombre] as const] : []))).values()]
    return { ...comun, nombre: p.nombre, rendimiento: receta.rendimiento, unidadTanda: p.unidad, unidadBase: base(p).unidadBase, usadaEn }
  })

  app.get('/cocina/foto/:tipo/:id', async (req, reply) => {
    const { tipo, id } = z.object({ tipo: z.enum(['plato', 'elab']), id: z.coerce.number().int().positive() }).parse(req.params)
    try {
      const jpg = await fs.readFile(archivoFoto(tipo, id))
      return reply.header('Cache-Control', 'private, max-age=86400').type('image/jpeg').send(jpg)
    } catch {
      return reply.status(404).send({ error: 'Sin foto' })
    }
  })

  app.post('/cocina/foto/:tipo/:id', { preHandler: requireJefeCocina }, async (req, reply) => {
    const { tipo, id } = fotoParams.parse(req.params)
    if (!esJpeg(req.body)) return reply.status(400).send({ error: 'La foto debe ser una imagen JPEG' })
    const fotoAt = await guardarFotoFicha(tipo, id, req.body)
    if (!fotoAt) return reply.status(404).send({ error: 'No encontrado' })
    return { fotoAt }
  })

  app.delete('/cocina/foto/:tipo/:id', { preHandler: requireJefeCocina }, async (req, reply) => {
    const { tipo, id } = fotoParams.parse(req.params)
    await quitarFotoFicha(tipo, id)
    return reply.status(204).send()
  })

  // Fotos del paso a paso: el nombre del archivo cambia con cada foto, así que se pueden cachear sin miedo
  app.get('/cocina/foto-pase/:tipo/:id/:foto', async (req, reply) => {
    const { tipo, id, foto } = fotoParams.extend({ foto: z.string().regex(/^[0-9a-f]{12}$/) }).parse(req.params)
    try {
      const jpg = await fs.readFile(archivoFotoPase(tipo, id, foto))
      return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/jpeg').send(jpg)
    } catch {
      return reply.status(404).send({ error: 'Sin foto' })
    }
  })

  app.post('/cocina/foto-pase/:tipo/:id/:paso', { preHandler: requireJefeCocina }, async (req, reply) => {
    const { tipo, id, paso } = pasoParams.parse(req.params)
    if (!esJpeg(req.body)) return reply.status(400).send({ error: 'La foto debe ser una imagen JPEG' })
    const receta = await prisma.receta.findUnique({ where: dondeFoto(tipo, id) })
    if (!receta || paso >= pasosDelPase(receta.emplatado).length) return reply.status(404).send({ error: 'Ese paso no existe' })
    const foto = randomBytes(6).toString('hex')
    await guardarArchivoFotoPase(tipo, id, foto, req.body)
    const fotos = leerFotosPase(receta.fotosPase)
    const vieja = fotos.find(f => f.paso === paso)
    const fotosPase = [...fotos.filter(f => f !== vieja), { paso, foto, at: new Date().toISOString() }]
    await prisma.receta.update({ where: { id: receta.id }, data: { fotosPase: fotosPase as unknown as Prisma.InputJsonValue } })
    if (vieja) await fs.rm(archivoFotoPase(tipo, id, vieja.foto), { force: true })
    return { foto }
  })

  app.delete('/cocina/foto-pase/:tipo/:id/:paso', { preHandler: requireJefeCocina }, async (req, reply) => {
    const { tipo, id, paso } = pasoParams.parse(req.params)
    const receta = await prisma.receta.findUnique({ where: dondeFoto(tipo, id) })
    const fotos = leerFotosPase(receta?.fotosPase)
    const vieja = fotos.find(f => f.paso === paso)
    if (!receta || !vieja) return reply.status(404).send({ error: 'Ese paso no tiene foto' })
    await prisma.receta.update({ where: { id: receta.id }, data: { fotosPase: fotos.filter(f => f !== vieja) as unknown as Prisma.InputJsonValue } })
    await fs.rm(archivoFotoPase(tipo, id, vieja.foto), { force: true })
    return reply.status(204).send()
  })
}
