import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const menu = [
  // ── Classic Tapas ─────────────────────────────────────────────────────────
  { categoria: 'Classic Tapas', nombre: 'Palamós shrimp croquettes',               descripcion: 'Red alioli (2 unts)',                                                                                precio: 5.85,  orden: 1 },
  { categoria: 'Classic Tapas', nombre: 'Vegan boletus croquettes',                descripcion: 'Vegan parsley mayo (2 unts)',                                                                        precio: 5.85,  orden: 2 },
  { categoria: 'Classic Tapas', nombre: 'Selection of Catalan cheeses KM.0',       descripcion: 'With seasonal jam',                                                                                  precio: 11.95, orden: 3 },
  { categoria: 'Classic Tapas', nombre: 'Chorizos stew',                           descripcion: 'Toasted beer foam, crispy bread, "piparras"',                                                       precio: 8.95,  orden: 4 },
  { categoria: 'Classic Tapas', nombre: 'Cured 18 months Iberian shaved ham',      descripcion: '(80gr)',                                                                                             precio: 14.95, orden: 5 },
  { categoria: 'Classic Tapas', nombre: 'Iberian salchichón',                      descripcion: '(80gr)',                                                                                             precio: 8.95,  orden: 6 },
  { categoria: 'Classic Tapas', nombre: 'Coca bread with tomato',                  descripcion: '',                                                                                                   precio: 3.95,  orden: 7 },

  // ── Vegetarian Tapas ──────────────────────────────────────────────────────
  { categoria: 'Vegetarian Tapas', nombre: 'Organic potatoes bravas',              descripcion: 'Vegan sauce option available +0,25€',                                                               precio: 6.95,  orden: 1 },
  { categoria: 'Vegetarian Tapas', nombre: 'Organic "padrón" peppers',             descripcion: '',                                                                                                   precio: 6.95,  orden: 2 },
  { categoria: 'Vegetarian Tapas', nombre: 'Braised and glazed carrots',           descripcion: 'Carrot hummus, citrus orange and sumac emulsion, fried capers, fresh chopped chives',               precio: 7.95,  orden: 3 },
  { categoria: 'Vegetarian Tapas', nombre: 'Roasted celeriac steak',               descripcion: 'Lightly caramelised, fresh walnut, lemon, seasonal herb, chimichurri seasoning',                   precio: 7.95,  orden: 4 },
  { categoria: 'Vegetarian Tapas', nombre: 'Burrata stracciatella',                descripcion: 'Beetroot in two aromatic textures, pistachio and basil pesto, toasted walnuts',                    precio: 10.95, orden: 5 },

  // ── Fish Tapas ────────────────────────────────────────────────────────────
  { categoria: 'Fish Tapas', nombre: 'Bread toasts with Costa Brava anchovies',    descripcion: '3 fine bread toasts, roasted garlic and cheese cream, confit cherry tomato sauce, fresh chives',  precio: 8.95,  orden: 1 },
  { categoria: 'Fish Tapas', nombre: 'Confit octopus',                             descripcion: 'Finished on the grill, rustic potato and chard purée, red wine and Sherry vinegar reduction, crispy garlic chips', precio: 13.95, orden: 2 },
  { categoria: 'Fish Tapas', nombre: 'Grilled prawns',                             descripcion: 'Thai peanut sauce, seasonal pickled vegetables, toasted peanuts',                                  precio: 9.99,  orden: 3 },
  { categoria: 'Fish Tapas', nombre: 'Yellowfin tuna tartare',                     descripcion: 'Marinated in nam jim sauce, smoked rosemary, pearl couscous, mango, cucumber and radish',         precio: 14.95, orden: 4 },

  // ── Meat Tapas ────────────────────────────────────────────────────────────
  { categoria: 'Meat Tapas', nombre: 'Slow-cooked pork cheek confit',              descripcion: 'Creamy black garlic emulsion, warm lentil salad, crispy Iberian pork',                            precio: 12.95, orden: 1 },
  { categoria: 'Meat Tapas', nombre: 'Beef tenderloin',                            descripcion: 'Organic potato parmentier, Port wine sauce, tender sprouts, crispy fried garlic',                  precio: 15.95, orden: 2 },
  { categoria: 'Meat Tapas', nombre: 'Traditional farmhouse butifarra',            descripcion: 'White beans sautéed with garlic and parsley, anchovy oil, aromatic crunch with a hint of lemon',  precio: 8.95,  orden: 3 },
  { categoria: 'Meat Tapas', nombre: 'Roasted boneless chicken leg',               descripcion: '"Mole poblano" sauce, grilled corncob, yuca chips, seasonal sprouts',                             precio: 9.95,  orden: 4 },

  // ── Rice ──────────────────────────────────────────────────────────────────
  { categoria: 'Rice', nombre: 'Squid ink paella',                                 descripcion: 'Our version with squid and roasted garlic emulsion',                                               precio: 9.45,  orden: 1 },

  // ── Pasta ─────────────────────────────────────────────────────────────────
  { categoria: 'Pasta', nombre: 'Homemade Truffle Raviolis',                       descripcion: 'Creamy truffle sauce with Parmesan and sage',                                                       precio: 12.95, orden: 1 },
  { categoria: 'Pasta', nombre: 'Canelon of beef and foie',                        descripcion: '95gr, truffled béchamel',                                                                           precio: 8.95,  orden: 2 },
]

async function main() {
  const sensi = await prisma.restaurant.findFirst({ where: { nombre: { contains: 'Sensi Tapas' } } })
  if (!sensi) {
    console.error('No se encontró Sensi Tapas — ejecuta el seed principal primero')
    process.exit(1)
  }

  await prisma.menuItem.deleteMany({ where: { restaurantId: sensi.id } })

  for (const item of menu) {
    await prisma.menuItem.create({ data: { ...item, restaurantId: sensi.id } })
  }

  console.log(`✓ ${menu.length} items del menú cargados para ${sensi.nombre}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
