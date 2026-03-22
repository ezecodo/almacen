import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const RESTAURANT_ID = 1
const GRUPO = 'Bebidas'

// ── Definición de categorías e items ─────────────────────────────────────────

const categorias: {
  nombre: string
  icono: string
  items: { nombre: string; descripcion: string; precio: number }[]
}[] = [
  {
    nombre: 'Cervezas',
    icono: '🍺',
    items: [
      { nombre: 'Caña Estrella Damm 30cl',          descripcion: '',             precio: 3.70 },
      { nombre: 'Pinta Estrella Damm 50cl',          descripcion: '',             precio: 5.55 },
      { nombre: 'Free Damm Toasted 0.0%',            descripcion: 'Sin alcohol',  precio: 4.00 },
      { nombre: 'Complot IPA',                       descripcion: '',             precio: 5.65 },
    ],
  },
  {
    nombre: 'Vinos & Otros',
    icono: '🍷',
    items: [
      { nombre: 'La Mundial Barcelona 75cl', descripcion: 'Blanco o rosado · Spritz afrutado 0% alcohol', precio: 19.95 },
    ],
  },
  {
    nombre: 'Limonadas Caseras',
    icono: '🍋',
    items: [
      { nombre: 'Limonada de jengibre', descripcion: '', precio: 4.95 },
      { nombre: 'Limonada tropical',    descripcion: '', precio: 4.95 },
    ],
  },
  {
    nombre: 'Destilados',
    icono: '🥃',
    items: [
      { nombre: 'Suplemento refresco',          descripcion: '',                                                   precio: 2.00 },
      // Vodka
      { nombre: 'Vodka Moskoskaya',              descripcion: '',                                                   precio: 6.50 },
      { nombre: 'Vodka Absolut',                 descripcion: '',                                                   precio: 7.50 },
      { nombre: 'Vodka Zubrówka',                descripcion: '',                                                   precio: 8.50 },
      { nombre: 'Vodka Belvedere',               descripcion: '',                                                   precio: 10.50 },
      // Ginebra
      { nombre: 'Ginebra Tanqueray',             descripcion: 'Extra dry. Sabor suave y herbáceo',                 precio: 7.50 },
      { nombre: "Ginebra Hendrick's",            descripcion: 'Notas de aromas a naranja y hierbas',               precio: 10.50 },
      { nombre: 'Ginebra Gin Mare',              descripcion: 'Aromas cardamomo y notas cítricas',                 precio: 10.50 },
      { nombre: "Ginebra G'vine Nouaison",       descripcion: 'Recuerdos vínicos a bosque, enebro y casia',        precio: 11.50 },
      // Whisky & Bourbon
      { nombre: 'Whisky Cutty Sark',             descripcion: '',                                                   precio: 6.50 },
      { nombre: 'Whisky Ballantines',            descripcion: '',                                                   precio: 7.50 },
      { nombre: 'Bourbon Four Roses',            descripcion: '',                                                   precio: 8.50 },
      { nombre: 'Whisky Glenfiddich 12 años',    descripcion: '',                                                   precio: 10.50 },
      { nombre: 'Whisky Glenmorangie 10 años',   descripcion: 'Reserve',                                            precio: 11.50 },
      // Ron
      { nombre: 'Ron Viejo de Caldas 3 años',    descripcion: '',                                                   precio: 6.00 },
      { nombre: 'Ron Bacardi',                   descripcion: '',                                                   precio: 7.50 },
      { nombre: 'Ron Brugal Añejo Superior',     descripcion: '',                                                   precio: 8.50 },
      { nombre: 'Ron Matusalem 15 años',         descripcion: '',                                                   precio: 11.50 },
      // Tequila
      { nombre: 'Tequila Jose Cuervo Especial',  descripcion: '',                                                   precio: 8.50 },
      { nombre: 'Tequila Herradura',             descripcion: '',                                                   precio: 12.50 },
    ],
  },
  {
    nombre: 'Aperitivos',
    icono: '🫗',
    items: [
      { nombre: 'Ricard 2cl',                descripcion: '', precio: 3.90 },
      { nombre: 'Cinzano Vermouth Rosso',    descripcion: '', precio: 5.45 },
      { nombre: 'Cinzano Vermouth Blanco',   descripcion: '', precio: 5.45 },
      { nombre: 'Campari',                   descripcion: '', precio: 6.30 },
      { nombre: 'Aperol Spritz',             descripcion: '', precio: 8.45 },
      { nombre: 'Oporto Taylor Selected',    descripcion: '', precio: 6.30 },
    ],
  },
  {
    nombre: 'Digestivos & Licores',
    icono: '🍶',
    items: [
      { nombre: 'Torres 5 años',          descripcion: '', precio: 6.00 },
      { nombre: 'Torres 10 años',         descripcion: '', precio: 7.00 },
      { nombre: 'Grappa Libarna',         descripcion: '', precio: 6.50 },
      { nombre: 'Limoncello',             descripcion: '', precio: 5.50 },
      { nombre: 'Licor de Hierbas Nora',  descripcion: '', precio: 5.50 },
      { nombre: 'Orujo Blanco Nora',      descripcion: '', precio: 6.50 },
      { nombre: 'Courvoisier VSOP',       descripcion: '', precio: 9.50 },
      { nombre: 'Calvados Pere Magloire', descripcion: '', precio: 9.50 },
      { nombre: 'Armagnac Saint Vivant',  descripcion: '', precio: 9.50 },
      { nombre: 'Cointreau',              descripcion: '', precio: 6.50 },
      { nombre: "Bailey's",               descripcion: '', precio: 6.50 },
      { nombre: 'Amaretto Galatti',       descripcion: '', precio: 6.50 },
      { nombre: 'Licor 43',               descripcion: '', precio: 6.50 },
    ],
  },
  {
    nombre: 'Cócteles',
    icono: '🍹',
    items: [
      { nombre: 'Mojito de Mango',              descripcion: 'Ron blanco, mango, lima, menta',                                       precio: 9.95 },
      { nombre: 'Mojito de Mango sin alcohol',  descripcion: 'Sin alcohol',                                                           precio: 6.95 },
      { nombre: 'Rocksberry Margarita',         descripcion: 'Tequila gold, licor 43, licor naranja, frambuesas, lima',               precio: 9.95 },
      { nombre: 'Espresso Martini',             descripcion: 'Vodka, espresso, licor de café',                                        precio: 9.50 },
      { nombre: 'Cava Sangría',                 descripcion: 'Brandy, tripleseco, cava, Martini Bianco, manzana, melocotón y piña',   precio: 8.95 },
      { nombre: 'Gin Orange Mule',              descripcion: 'Ginebra, licor de naranja, jengibre, lima',                             precio: 9.75 },
      { nombre: 'Negroni de Romero Ahumado',    descripcion: 'Gin, campari, vermut dulce, piel de naranja',                           precio: 9.45 },
      { nombre: 'Aperol Spritz',                descripcion: 'Cava, Aperol, soda y naranja',                                          precio: 8.45 },
    ],
  },
]

async function main() {
  console.log(`Cargando bebidas en restaurantId=${RESTAURANT_ID}...\n`)

  for (const [i, cat] of categorias.entries()) {
    // Crear o actualizar la MenuCategoria
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

    // Eliminar items previos de esta categoría y restaurante
    const deleted = await prisma.menuItem.deleteMany({
      where: { restaurantId: RESTAURANT_ID, categoria: cat.nombre },
    })
    if (deleted.count > 0) console.log(`    Eliminados ${deleted.count} items previos`)

    // Crear los items
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
