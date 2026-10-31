import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import fs from 'fs/promises'
import { prisma } from '../server'
import { base } from '../costes'
import { archivoFoto } from './escandallos'

// Wiki de cocina (/cocina): las fichas técnicas que crea el chef ejecutivo en /admin/escandallos,
// para leer en la cocina con el PIN de cualquier empleado. Solo lectura y nunca un precio.
// Platos: los de comida de la carta del local que se elige (globales + suyos) con ficha; elaboraciones: todas.

const conFicha = {
  lineas: { include: { producto: { select: { id: true, nombre: true, unidad: true, unidadBase: true, contenido: true, elaboracion: { select: { id: true } } } } }, orderBy: { orden: 'asc' as const } },
  partes: { orderBy: { orden: 'asc' as const } },
}

// Una ficha "existe" para la cocina si tiene algo que leer
const tieneFicha = { OR: [{ lineas: { some: {} } }, { partes: { some: {} } }, { emplatado: { not: '' } }] }

export async function cocinaRoutes(app: FastifyInstance) {
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
    const comun = { tipo, id, partes, emplatado: receta.emplatado, notas: receta.notas, fotoAt: receta.fotoAt }
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
}
