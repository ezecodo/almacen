import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const RESTAURANT_ID = 1
const GRUPO = 'Vinos'

const categorias: {
  nombre: string
  icono: string
  items: { nombre: string; descripcion: string; precio: number }[]
}[] = [
  {
    nombre: 'Vino Tinto por Copa',
    icono: '🍷',
    items: [
      { nombre: '3 Setmanes Negre',      descripcion: 'D.O. Costers del Segre · Tempranillo, Garnacha Negra y Merlot',  precio: 4.75 },
      { nombre: "Castell d'Or",          descripcion: 'D.O. Terra Alta · 100% Garnacha',                                 precio: 4.99 },
      { nombre: 'Valdelacierva Crianza', descripcion: 'D.O. Rioja · Barrica 18 meses · 100% Tempranillo · 91 pts Peñín', precio: 5.99 },
    ],
  },
  {
    nombre: 'Vino Blanco por Copa',
    icono: '🥂',
    items: [
      { nombre: '10.000 Hores Orgánico', descripcion: 'D.O. Penedès · Xarel·lo',                          precio: 4.75 },
      { nombre: 'Viña Gormaz',           descripcion: 'D.O. Rueda · 100% Verdejo',                         precio: 4.95 },
      { nombre: 'Villanueva',            descripcion: 'D.O. Rías Baixas · 100% Albariño · 90 pts Peñín',   precio: 5.95 },
    ],
  },
  {
    nombre: 'Cava & Sangría',
    icono: '🍾',
    items: [
      { nombre: 'Oliver Brut Orgánico', descripcion: '', precio: 4.75 },
      { nombre: 'Sangría',              descripcion: '', precio: 6.99 },
      { nombre: 'Sangría Cava',         descripcion: '', precio: 8.95 },
    ],
  },
  {
    nombre: 'Rosado por Copa',
    icono: '🌸',
    items: [
      { nombre: '10.000 Hores Orgánico Rosado', descripcion: 'D.O. Penedès · Tempranillo, Merlot', precio: 4.75 },
    ],
  },
]

async function main() {
  console.log(`Cargando vinos en restaurantId=${RESTAURANT_ID}...\n`)

  for (const [i, cat] of categorias.entries()) {
    const existing = await prisma.menuCategoria.findFirst({
      where: { restaurantId: RESTAURANT_ID, nombre: cat.nombre },
    })

    if (existing) {
      await prisma.menuCategoria.update({
        where: { id: existing.id },
        data: { grupo: GRUPO, icono: cat.icono, orden: i },
      })
      console.log(`  ↻ Categoría actualizada: ${cat.icono} ${cat.nombre}`)
    } else {
      await prisma.menuCategoria.create({
        data: { restaurantId: RESTAURANT_ID, grupo: GRUPO, nombre: cat.nombre, icono: cat.icono, orden: i },
      })
      console.log(`  ✓ Categoría creada:      ${cat.icono} ${cat.nombre}`)
    }

    const deleted = await prisma.menuItem.deleteMany({
      where: { restaurantId: RESTAURANT_ID, categoria: cat.nombre },
    })
    if (deleted.count > 0) console.log(`    Eliminados ${deleted.count} items previos`)

    await prisma.menuItem.createMany({
      data: cat.items.map((item, j) => ({
        restaurantId: RESTAURANT_ID,
        categoria: cat.nombre,
        nombre: item.nombre,
        descripcion: item.descripcion,
        precio: item.precio,
        orden: j,
      })),
    })
    console.log(`    Insertados ${cat.items.length} items`)
  }

  console.log('\n¡Listo!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
