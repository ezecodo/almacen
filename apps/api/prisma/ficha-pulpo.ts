// Primera ficha técnica de verdad: la hoja de cocina del pulpo de Sensi Tapas (food cost y preparación,
// 2026-10-31), tal como viene: 10 raciones, cinco partes con sus pasos y el emplatado. Los ingredientes
// que no existen se crean en "Materia prima" sin precio (la hoja los trae a 0 €). Reemplaza la ficha
// que tuviera el plato PULPO del local.
//   npx tsx prisma/ficha-pulpo.ts --confirmar [--foto <archivo.jpg>]     (dentro de apps/api)
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

type Ing = [nombre: string, cantidad: number | string, unidad: 'kg' | 'l' | 'ud']
const PARTES: { nombre: string; lineas: Ing[]; pasos: string[] }[] = [
  {
    nombre: 'PULPO',
    lineas: [['Pulpo cocido', 120, 'kg'], ['AOVE', 40, 'l'], ['Pimentón ahumado', 5, 'kg'], ['Sal en escamas', 'c/s', 'kg']],
    pasos: ['Cortar los tentáculos en porciones individuales.', 'Marcar a la plancha hasta dorar ligeramente.', 'Aliñar con AOVE, pimentón y sal justo antes del servicio.'],
  },
  {
    nombre: 'CREMA DE MAÍZ AHUMADO',
    lineas: [['Maíz dulce', 700, 'kg'], ['Caldo de ave', 200, 'l'], ['Nata', 200, 'l'], ['Mantequilla', 30, 'kg'], ['Parmesano en polvo', 100, 'kg'], ['Aceite ahumado', 10, 'l'], ['Xantana', 2, 'kg'], ['Sal', 'c/s', 'kg']],
    pasos: ['Rehogar el maíz con la mantequilla.', 'Añadir el caldo y la nata y cocer 10 minutos.', 'Triturar hasta obtener una crema fina.', 'Verificar la consistencia y ajustar con xantana.'],
  },
  {
    nombre: 'VELOUTÉ DE ALGAS',
    lineas: [['Fumet de pescado', 700, 'l'], ['Mantequilla', 40, 'kg'], ['Harina', 40, 'kg'], ['Alga nori', 10, 'kg'], ['Nata líquida', 100, 'l'], ['Sal', 'c/s', 'kg']],
    pasos: ['Calentar el caldo de pescado e infusionar las algas, triturar.', 'Preparar un roux con mantequilla y harina.', 'Añadir el caldo con algas al roux.', 'Añadir la nata, hervir, triturar y colar.', 'Rectificar de sal.'],
  },
  {
    nombre: 'RABANITOS PICKLES – IN HOUSE',
    lineas: [['Rabanito', 120, 'kg'], ['Vinagre de vino blanco suave', 200, 'l'], ['Agua', 200, 'l'], ['Azúcar', 60, 'kg'], ['Sal', 8, 'kg'], ['Pimienta en grano', '6 granos', 'kg'], ['Canela en rama', 1, 'ud'], ['Piel de limón', 1, 'ud']],
    pasos: ['Hervir el líquido de encurtido.', 'Verter sobre los rabanitos laminados.', 'Reposar mínimo 24 horas en refrigeración.'],
  },
  {
    nombre: 'CANCHA TOSTADA',
    lineas: [['Maíz cancha', 180, 'kg'], ['Aceite de girasol', 20, 'l'], ['Sal', 'c/s', 'kg']],
    pasos: ['Tostar el maíz en sartén con el aceite hasta que esté crujiente.', 'Escurrir y sazonar.'],
  },
]
// Al pase: un paso por renglón
const EMPLATADO = [
  'Colocar una base de velouté de algas y crema de maíz.',
  'Añadir 3 trozos de pulpo.',
  'Añadir los encurtidos de rabanito y pepino.',
  'Añadir la cancha tostada.',
  'Salicornia (algas) 4 g, justo 4-5 trozos.',
  'Terminar con brotes y unas gotas de AOVE.',
].join('\n')
const BASE = { kg: { unidadBase: 'g', contenido: 1000 }, l: { unidadBase: 'ml', contenido: 1000 }, ud: { unidadBase: 'ud', contenido: 1 } }

async function main() {
  if (!process.argv.includes('--confirmar')) { console.log('Añade --confirmar para cargar la ficha'); return }
  const plato = await prisma.menuItem.findFirst({ where: { nombre: { equals: 'PULPO', mode: 'insensitive' }, activo: true } })
  if (!plato) throw new Error('No hay un plato PULPO en la carta')
  const categoria = (await prisma.inventarioCategoria.findFirst({ where: { nombre: 'Materia prima', restaurantId: null } }))
    ?? (await prisma.inventarioCategoria.create({ data: { nombre: 'Materia prima', orden: 99 } }))

  const ids = new Map<string, number>()
  const producto = async (nombre: string, unidad: Ing[2]) => {
    if (ids.has(nombre)) return ids.get(nombre)!
    const p = (await prisma.inventarioProducto.findFirst({ where: { restaurantId: null, activo: true, nombre: { equals: nombre, mode: 'insensitive' } } }))
      ?? (await prisma.inventarioProducto.create({ data: { nombre, unidad, ...BASE[unidad], categoriaId: categoria.id, precioCoste: nombre === 'Agua' ? 0 : null } }))
    ids.set(nombre, p.id)
    return p.id
  }

  const anterior = await prisma.receta.findUnique({ where: { menuItemId: plato.id } })
  await prisma.receta.deleteMany({ where: { menuItemId: plato.id } })
  const receta = await prisma.receta.create({ data: { menuItemId: plato.id, raciones: 10, emplatado: EMPLATADO, fotoAt: anterior?.fotoAt ?? null } })
  let orden = 0
  for (const [k, p] of PARTES.entries()) {
    const parte = await prisma.recetaParte.create({ data: { recetaId: receta.id, nombre: p.nombre, pasos: p.pasos, orden: k } })
    for (const [nombre, cantidad, unidad] of p.lineas) {
      await prisma.recetaLinea.create({
        data: {
          recetaId: receta.id, parteId: parte.id, productoId: await producto(nombre, unidad), orden: orden++,
          cantidad: typeof cantidad === 'number' ? cantidad : 0, texto: typeof cantidad === 'string' ? cantidad : null,
        },
      })
    }
  }
  const i = process.argv.indexOf('--foto')
  if (i > 0 && process.argv[i + 1]) {
    const dir = process.env.RECETAS_DIR || path.join(__dirname, '..', 'uploads', 'recetas')
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(process.argv[i + 1], path.join(dir, `plato-${plato.id}.jpg`))
    await prisma.receta.update({ where: { id: receta.id }, data: { fotoAt: new Date() } })
  }
  console.log(`Ficha cargada en "${plato.nombre}" (id ${plato.id}): ${PARTES.length} partes, ${orden} ingredientes`)
}

main().finally(() => prisma.$disconnect())
