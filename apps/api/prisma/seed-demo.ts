// Datos de demostración para una instalación NUEVA: un grupo inventado de tres restaurantes, con
// carta, salón, personal y un turno en marcha, para enseñar el producto sin el panel vacío.
//
//   cd apps/api && npx tsx prisma/seed-demo.ts --confirmar                 primera vez
//   cd apps/api && npx tsx prisma/seed-demo.ts --confirmar --reiniciar     vaciar y volver a cargar
//
// Solo corre sobre una base sin restaurantes: nunca pisa ni mezcla datos de un cliente real.
// --reiniciar BORRA TODO antes de cargar, y solo se permite si lo que hay es una demo anterior
// (la razón social de la empresa termina en "(demo)"): sobre datos de verdad se niega.
// Todo es inventado (nombres, NIF, teléfonos). No toca la carta ni el personal de nadie.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Marca que deja la demo en la razón social: es lo que permite vaciarla después sin riesgo
const MARCA_DEMO = '(demo)'

// Azar repetible: la demo sale igual cada vez
let semilla = 20261012
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296)
const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1))
const elegir = <T>(lista: T[]): T => lista[Math.floor(azar() * lista.length)]
const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000)

const ALERGENOS: [string, string, string][] = [
  ['Gluten', 'Gluten', '🌾'], ['Crustáceos', 'Crustaceans', '🦐'], ['Huevos', 'Eggs', '🥚'], ['Pescado', 'Fish', '🐟'],
  ['Cacahuetes', 'Peanuts', '🥜'], ['Soja', 'Soy', '🫘'], ['Lácteos', 'Dairy', '🥛'], ['Frutos secos', 'Tree nuts', '🌰'],
  ['Apio', 'Celery', '🌿'], ['Mostaza', 'Mustard', '🌻'], ['Sésamo', 'Sesame', '⚪'], ['Sulfitos', 'Sulphites', '🍷'],
  ['Altramuces', 'Lupin', '🌼'], ['Moluscos', 'Molluscs', '🦑'],
]

// [grupo, categoría, icono, [nombre, precio, descripción, alérgenos]]
type Plato = [string, number, string, string[]]
const CARTA: [string, string, string, Plato[]][] = [
  ['Comida', 'PARA PICAR', '🫒', [
    ['Aceitunas aliñadas', 3.5, 'Gordal y arbequina', []],
    ['Pan con tomate', 3.9, 'Pan de coca, tomate de colgar', ['Gluten']],
    ['Anchoas del Cantábrico', 9.5, '4 unidades, aceite de oliva', ['Pescado']],
    ['Jamón ibérico', 18, 'Bellota, 80 g', []],
    ['Tabla de quesos', 14.5, 'Tres quesos catalanes y membrillo', ['Lácteos', 'Frutos secos']],
  ]],
  ['Comida', 'TAPAS CLÁSICAS', '🥘', [
    ['Patatas bravas', 6.5, 'Salsa brava de la casa y alioli', ['Huevos']],
    ['Croquetas de jamón', 7.5, '4 unidades', ['Gluten', 'Lácteos', 'Huevos']],
    ['Tortilla de patatas', 7, 'Con cebolla, jugosa', ['Huevos']],
    ['Pimientos de Padrón', 6.9, 'Con sal Maldon', []],
    ['Ensaladilla rusa', 7.9, 'Con ventresca', ['Huevos', 'Pescado']],
    ['Bomba de la Barceloneta', 5.5, 'Unidad, picante suave', ['Gluten', 'Huevos']],
  ]],
  ['Comida', 'DEL MAR', '🐙', [
    ['Pulpo a la brasa', 19.5, 'Parmentier y pimentón', ['Moluscos', 'Lácteos']],
    ['Calamares a la andaluza', 11.5, 'Con mayonesa de lima', ['Moluscos', 'Gluten', 'Huevos']],
    ['Gambas al ajillo', 14.9, 'Cazuela, guindilla', ['Crustáceos']],
    ['Mejillones al vapor', 9.9, 'Laurel y limón', ['Moluscos']],
    ['Tartar de atún', 16.5, 'Aguacate y sésamo', ['Pescado', 'Soja', 'Sésamo']],
  ]],
  ['Comida', 'CARNES', '🥩', [
    ['Entrecot a la brasa', 22, '300 g, patatas y pimientos', []],
    ['Secreto ibérico', 16.9, 'Con chimichurri', []],
    ['Mini hamburguesas', 12.5, '3 unidades, queso y cebolla', ['Gluten', 'Lácteos', 'Sésamo']],
    ['Pollo de corral al ajillo', 13.5, 'Deshuesado', ['Sulfitos']],
  ]],
  ['Comida', 'POSTRES', '🍮', [
    ['Crema catalana', 6, 'Quemada al momento', ['Lácteos', 'Huevos']],
    ['Tarta de queso', 6.9, 'Al horno, cremosa', ['Lácteos', 'Huevos', 'Gluten']],
    ['Coulant de chocolate', 7.5, 'Con helado de vainilla', ['Lácteos', 'Huevos', 'Gluten']],
  ]],
  ['Bebidas', 'CERVEZAS', '🍺', [
    ['Caña', 2.9, '', ['Gluten']],
    ['Copa de cerveza', 3.9, '', ['Gluten']],
    ['Cerveza artesana', 5.5, 'IPA local, 33 cl', ['Gluten']],
    ['Cerveza sin alcohol', 3.5, '', ['Gluten']],
  ]],
  ['Bebidas', 'VINOS', '🍷', [
    ['Copa tinto', 4.5, 'D.O. Montsant', ['Sulfitos']],
    ['Copa blanco', 4.5, 'D.O. Penedès', ['Sulfitos']],
    ['Copa de cava', 5, 'Brut nature', ['Sulfitos']],
    ['Botella tinto', 24, 'D.O.Q. Priorat', ['Sulfitos']],
    ['Vermut de la casa', 4, 'Con sifón y aceituna', ['Sulfitos']],
  ]],
  ['Bebidas', 'REFRESCOS', '🥤', [
    ['Agua mineral', 2.5, '50 cl', []],
    ['Agua con gas', 2.8, '', []],
    ['Coca-Cola', 3, '', []],
    ['Tónica', 3, '', []],
    ['Zumo de naranja', 4, 'Natural', []],
  ]],
  ['Bebidas', 'CÓCTELES', '🍹', [
    ['Spritz', 8.5, 'Aperol, cava, naranja', ['Sulfitos']],
    ['Mojito', 9, 'Ron, hierbabuena, lima', []],
    ['Gin tonic', 10, 'Ginebra premium', []],
    ['Sangría de cava', 7.5, 'Copa', ['Sulfitos']],
  ]],
  ['Bebidas', 'CAFÉS', '☕', [
    ['Café solo', 1.8, '', []],
    ['Cortado', 2, '', ['Lácteos']],
    ['Café con leche', 2.3, '', ['Lácteos']],
    ['Carajillo', 3.2, '', []],
  ]],
]

// Ficha de estudio de cada plato (en inglés, es lo que el camarero le cuenta al cliente): con esto
// la Wiki de sala muestra la carta para estudiar. 1ª línea = de qué está hecho; resto = cómo venderlo.
const FICHAS: Record<string, string> = {
  'Aceitunas aliñadas': 'Gordal and Arbequina olives, orange peel, thyme, olive oil\nMarinated in house for 48 hours. A good start while the table decides.',
  'Pan con tomate': 'Coca bread, hanging tomato, extra virgin olive oil, sea salt\nThe Catalan classic. Toasted to order; suggest it with any cured meat or cheese.',
  'Anchoas del Cantábrico': 'Hand-filleted Cantabrian anchovies, olive oil\nFour fillets, cured for 12 months. Salty and silky: pair with vermouth or cava.',
  'Jamón ibérico': 'Acorn-fed Iberian ham, 36 months cured\n80 grams, hand carved. Serve at room temperature; never suggest it with strong sauces.',
  'Tabla de quesos': 'Three Catalan cheeses (goat, sheep, cow), quince paste, walnuts\nFrom mild to strong, left to right. Contains nuts.',
  'Patatas bravas': 'Fried potatoes, house brava sauce (tomato, smoked paprika, chilli), garlic alioli\nOur best seller. Mildly spicy; the sauces can be served on the side.',
  'Croquetas de jamón': 'Bechamel, Iberian ham, breadcrumbs\nFour pieces, creamy inside. Made daily; they take 6 minutes.',
  'Tortilla de patatas': 'Free-range eggs, potato, caramelised onion\nServed slightly runny in the centre. Ask if the guest prefers it well done.',
  'Pimientos de Padrón': 'Padrón peppers, olive oil, Maldon salt\nBlistered, not fried. One in ten is hot: tell the table, it is part of the fun.',
  'Ensaladilla rusa': 'Potato, carrot, mayonnaise, tuna belly, piparra pepper\nServed cold. Contains fish and egg.',
  'Bomba de la Barceloneta': 'Potato ball filled with minced beef, alioli and spicy sauce\nBorn in this neighbourhood in the 1950s. One piece per person is the usual.',
  'Pulpo a la brasa': 'Charcoal-grilled octopus, potato parmentier, smoked paprika, olive oil\nOur signature dish. Tender inside, crisp outside. Pair with a white from Penedès.',
  'Calamares a la andaluza': 'Fresh squid, chickpea flour, lime mayonnaise\nLight batter, fried to order. Gluten in the flour mix.',
  'Gambas al ajillo': 'Red prawns, garlic, chilli, olive oil, parsley\nServed sizzling in the clay pot. Recommend bread to finish the oil.',
  'Mejillones al vapor': 'Mussels from the Ebro delta, bay leaf, lemon\nSteamed with nothing else. Half a kilo; ideal to share between two.',
  'Tartar de atún': 'Bluefin tuna, avocado, soy, sesame, lime\nCut by knife to order. Contains soy and sesame; cannot be made without soy.',
  'Entrecot a la brasa': 'Aged beef ribeye 300 g, fries, Padrón peppers\nAlways ask the cooking point. We recommend medium rare.',
  'Secreto ibérico': 'Iberian pork secreto, chimichurri\nA marbled cut from the shoulder, grilled pink. Pair with a red from Montsant.',
  'Mini hamburguesas': 'Three beef sliders, cheddar, caramelised onion, brioche bun\nGood option for children. Bun contains sesame.',
  'Pollo de corral al ajillo': 'Free-range chicken, garlic, white wine, thyme\nBoneless, slow cooked. Contains sulphites from the wine.',
  'Crema catalana': 'Egg yolk custard, lemon peel, cinnamon, burnt sugar\nThe sugar is torched at the table side when possible.',
  'Tarta de queso': 'Baked cheesecake, cream cheese, biscuit base\nCreamy centre, served warm. Contains gluten in the base.',
  'Coulant de chocolate': 'Dark chocolate fondant 70%, vanilla ice cream\nTakes 10 minutes: offer it when the mains are served.',
  'Copa tinto': 'Garnacha and Cariñena · D.O. Montsant\nFruity, medium body. Goes with meats and the cheese board.',
  'Copa blanco': 'Xarel·lo · D.O. Penedès\nFresh and dry. The match for anything from the sea.',
  'Copa de cava': 'Macabeo, Xarel·lo, Parellada · Brut nature\nNo added sugar. Suggest it as an aperitif with anchovies or ham.',
  'Botella tinto': 'Garnacha, Cariñena, Syrah · D.O.Q. Priorat · 12 months in oak\nPowerful and mineral. For the ribeye or the secreto.',
}

// Menús cerrados para grupos: [nombre, €/pax, 1 ración cada X pax, cursos]
const MENUS_GRUPO: [string, number, number, [string, string[], boolean][]][] = [
  ['Tapeo', 35, 3, [['Para empezar', ['Pan con tomate', 'Aceitunas aliñadas', 'Jamón ibérico'], false], ['Tapas', ['Patatas bravas', 'Croquetas de jamón', 'Tortilla de patatas', 'Pimientos de Padrón'], false], ['Postre', ['Crema catalana'], true]]],
  ['Mar y montaña', 48, 3, [['Para empezar', ['Pan con tomate', 'Anchoas del Cantábrico', 'Jamón ibérico'], false], ['Del mar', ['Pulpo a la brasa', 'Calamares a la andaluza', 'Gambas al ajillo'], false], ['Carnes', ['Secreto ibérico', 'Mini hamburguesas'], false], ['Postre', ['Tarta de queso'], true]]],
  ['Celebración', 62, 2, [['Para empezar', ['Pan con tomate', 'Jamón ibérico', 'Tabla de quesos', 'Anchoas del Cantábrico'], false], ['Del mar', ['Pulpo a la brasa', 'Tartar de atún', 'Gambas al ajillo'], false], ['Carnes', ['Entrecot a la brasa', 'Secreto ibérico'], false], ['Postre', ['Coulant de chocolate', 'Crema catalana'], true]]],
]

// Inventario común: [categoría, quién produce (o null), [producto, unidad, mínimo, coste, venta]]
const INVENTARIO: [string, string | null, [string, string, number, number, number | null][]][] = [
  ['Vinos y cavas', null, [['Tinto Montsant', 'botella', 12, 5.2, 22], ['Blanco Penedès', 'botella', 12, 4.8, 22], ['Cava brut nature', 'botella', 10, 5.9, 24], ['Tinto Priorat', 'botella', 6, 11.5, 24], ['Vermut rojo', 'botella', 4, 6.4, null]]],
  ['Cervezas y refrescos', null, [['Barril de cerveza 30 l', 'ud', 2, 68, null], ['Cerveza artesana 33 cl', 'caja', 2, 31, null], ['Cerveza sin alcohol', 'caja', 1, 17.5, null], ['Coca-Cola 20 cl', 'caja', 3, 14.2, null], ['Tónica', 'caja', 2, 16.8, null], ['Agua mineral 50 cl', 'caja', 4, 5.9, null]]],
  ['Destilados', null, [['Ginebra premium', 'botella', 3, 21, null], ['Ron añejo', 'botella', 2, 16.5, null], ['Aperol', 'botella', 3, 11.9, null], ['Vodka', 'botella', 2, 13.4, null]]],
  ['Despensa', null, [['Aceite de oliva virgen extra', 'l', 10, 7.8, null], ['Patata agria', 'kg', 25, 0.95, null], ['Pulpo cocido', 'kg', 6, 24, null], ['Jamón ibérico', 'kg', 2, 68, null], ['Café en grano', 'kg', 4, 16, null]]],
  ['Premixes de barra', 'sala', [['Premix mojito', 'l', 2, 4.1, null], ['Sirope simple', 'l', 2, 1.2, null], ['Zumo de lima', 'l', 1.5, 5.5, null], ['Sangría base', 'l', 4, 3.3, null]]],
]

const MERMAS: [string, string, string][] = [
  ['Croquetas de jamón', 'no_servido', 'Se pasaron de fritura'],
  ['Copa tinto', 'queja_cliente', 'Vino picado, se cambió la copa'],
  ['Patatas bravas', 'no_servido', 'Marchadas dos veces por error'],
  ['Pulpo a la brasa', 'queja_cliente', 'Llegó frío a la mesa'],
  ['Caña', 'otro', 'Se cayó la bandeja'],
  ['Tarta de queso', 'no_servido', 'Cliente se fue antes del postre'],
  ['Gambas al ajillo', 'queja_cliente', 'Demasiado picante para el cliente'],
]

const TAREAS: Record<string, { apertura: string[]; cierre: string[] }> = {
  Barra: {
    apertura: ['Encender cafetera y purgar grupos', 'Encender lavavasos y comprobar detergente', 'Reponer cámaras: cervezas, refrescos y vinos', 'Llenar la cubitera de hielo', 'Cortar cítricos y preparar guarniciones', 'Comprobar barril de cerveza y CO₂', 'Preparar premixes del día', 'Revisar cambio en la caja de barra'],
    cierre: ['Vaciar, limpiar y apagar cafetera', 'Limpiar grifos de cerveza y bandejas', 'Vaciar y limpiar lavavasos', 'Guardar y etiquetar premixes y cítricos', 'Anotar botellas terminadas', 'Limpiar barra, estantes y suelo', 'Sacar la basura y el vidrio', 'Cerrar caja de barra'],
  },
  Sala: {
    apertura: ['Abrir y ventilar el local', 'Montar mesas: cubiertos, copas y servilletas', 'Revisar que las cartas estén limpias y completas', 'Comprobar las reservas del turno y bloquear mesas', 'Encender música, luces y climatización', 'Revisar baños: papel, jabón y limpieza', 'Cargar las tablets y comprobar la impresora', 'Reunión de 5 minutos: sugerencias y platos agotados'],
    cierre: ['Recoger y limpiar todas las mesas', 'Reponer cubiertos, copas y servilletas', 'Barrer y fregar la sala', 'Limpiar baños', 'Apagar música, luces y climatización', 'Poner las tablets a cargar', 'Comprobar ventanas y cerrar con llave'],
  },
  Cocina: {
    apertura: ['Encender planchas, fuegos y freidoras', 'Comprobar y anotar temperaturas de cámaras', 'Revisar la mise en place de cada partida', 'Comprobar caducidades y etiquetas', 'Recibir y revisar el pedido del día', 'Encender la campana extractora', 'Avisar a sala de los platos agotados'],
    cierre: ['Filtrar o cambiar el aceite de las freidoras', 'Etiquetar y guardar elaboraciones', 'Limpiar planchas, fuegos y superficies', 'Vaciar y limpiar el tren de lavado', 'Fregar el suelo de cocina', 'Sacar la basura y el orgánico', 'Apagar gas y campana', 'Hacer el pedido para mañana'],
  },
  Terraza: {
    apertura: ['Sacar y montar mesas y sillas', 'Abrir toldos o sombrillas', 'Limpiar mesas y ceniceros', 'Encender estufas si hace falta'],
    cierre: ['Recoger mesas, sillas y sombrillas', 'Barrer la terraza', 'Apagar y guardar estufas', 'Candar el mobiliario'],
  },
}

const NOMBRES_RESERVA = ['Anna Puig', 'Marc Torres', 'Familia Llorens', 'Sophie Martin', 'Javier Ortega', 'Laia Font', 'Thomas Becker', 'Empresa Nexo', 'Clara Domènech', 'Giulia Rossi']

// Lunes de esta semana (UTC), para la planificación de personal
const lunes = (() => {
  const d = new Date()
  const hoy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  hoy.setUTCDate(hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7))
  return hoy
})()
const diaUtc = (desplazamiento: number) => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + desplazamiento))
}

// [número, tipo, x, y, capacidad, rotación, ancho, alto]
type MesaDef = [number, string, number, number, number, number, number, number]
const cuadricula = (desde: number, columnas: number, filas: number, x0: number, y0: number, capacidad: number): MesaDef[] =>
  Array.from({ length: columnas * filas }, (_, i) => [desde + i, 'square', x0 + (i % columnas) * 95, y0 + Math.floor(i / columnas) * 90, capacidad, 0, 60, 60] as MesaDef)

const LOCALES: { nombre: string; direccion: string; telefono: string; plantas: { nombre: string; mesas: MesaDef[] }[]; personal: [string, string, string][] }[] = [
  {
    nombre: 'Traga Agua · Born',
    direccion: 'Carrer de la Princesa 00, 08003 Barcelona',
    telefono: '930 000 101',
    plantas: [
      { nombre: 'Sala', mesas: [[0, 'barra', 60, 60, 0, 0, 80, 220], ...cuadricula(1, 3, 3, 200, 50, 4), [20, 'rectangular', 200, 330, 6, 0, 90, 60], [21, 'rectangular', 320, 330, 6, 0, 90, 60]] },
      { nombre: 'Terraza', mesas: cuadricula(30, 4, 2, 80, 80, 2) },
    ],
    personal: [['Marta Ribas', 'sala', 'encargado'], ['Pol Ferrer', 'sala', 'camarero'], ['Aina Soler', 'sala', 'camarero'], ['Iker Blanco', 'sala', 'camarero'], ['Dolors Mas', 'cocina', 'jefe_cocina'], ['Samir Haddad', 'cocina', 'cocinero'], ['Joan Pons', 'cocina', 'friegaplatos']],
  },
  {
    nombre: 'Traga Agua · Gràcia',
    direccion: 'Carrer de Verdi 00, 08012 Barcelona',
    telefono: '930 000 102',
    plantas: [
      { nombre: 'Sala', mesas: [[0, 'barra', 380, 40, 0, 0, 80, 260], ...cuadricula(1, 3, 4, 70, 40, 4)] },
    ],
    personal: [['Carla Vidal', 'sala', 'encargado'], ['Nil Sala', 'sala', 'camarero'], ['Lucía Romero', 'sala', 'camarero'], ['Bruno Costa', 'cocina', 'jefe_cocina'], ['Mei Lin', 'cocina', 'cocinero'], ['Óscar Gil', 'cocina', 'friegaplatos']],
  },
  {
    nombre: 'Traga Agua · Barceloneta',
    direccion: 'Passeig de Joan de Borbó 00, 08003 Barcelona',
    telefono: '930 000 103',
    plantas: [
      { nombre: 'Sala', mesas: [[0, 'barra', 60, 300, 0, 0, 260, 50], ...cuadricula(1, 4, 2, 70, 60, 4)] },
      { nombre: 'Terraza mar', mesas: [...cuadricula(40, 5, 2, 50, 70, 4), [60, 'rectangular', 50, 270, 8, 0, 120, 60]] },
    ],
    personal: [['Jordi Camps', 'sala', 'encargado'], ['Elena Prat', 'sala', 'camarero'], ['Hugo Marín', 'sala', 'camarero'], ['Noa Ferran', 'sala', 'camarero'], ['Paula Serra', 'sala', 'camarero'], ['Ramon Oliva', 'cocina', 'jefe_cocina'], ['Fátima Zahra', 'cocina', 'cocinero'], ['Adrià Roca', 'cocina', 'cocinero']],
  },
]

async function main() {
  if (!process.argv.includes('--confirmar')) {
    console.log('Carga datos de demostración inventados (3 restaurantes). Para ejecutarlo:  npx tsx prisma/seed-demo.ts --confirmar')
    return
  }
  if (process.env.INSTALACION_CODIGO === 'sensi') throw new Error('Esta es la instalación de Sensi: no se cargan datos de demostración aquí.')
  let yaHay = await prisma.restaurant.count()
  if (yaHay > 0 && process.argv.includes('--reiniciar')) {
    const empresa = await prisma.empresaConfig.findFirst()
    if (!empresa?.razonSocial.endsWith(MARCA_DEMO)) {
      throw new Error('Lo que hay en esta base no es una demo cargada por este script: no la vacío.')
    }
    const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
    console.log(`Demo anterior borrada (${tablas.length} tablas vaciadas).`)
    yaHay = 0
  }
  if (yaHay > 0) throw new Error(`Esta base ya tiene ${yaHay} restaurante(s). La demo solo se carga en una instalación vacía (o con --reiniciar si lo que hay es una demo).`)

  await prisma.empresaConfig.create({ data: { razonSocial: `Traga Agua Hostelería S.L. ${MARCA_DEMO}`, nif: 'B00000000', tasaIva: 10, mensajePie: 'Gracias por tu visita · Servicio no incluido' } })

  const alergenoId = new Map<string, number>()
  for (const [i, [nombre, nombreEn, icono]] of ALERGENOS.entries()) {
    alergenoId.set(nombre, (await prisma.alergeno.create({ data: { nombre, nombreEn, icono, orden: i } })).id)
  }

  // Carta común a los tres locales
  const platos: { nombre: string; precio: number; tipo: 'cocina' | 'barra' }[] = []
  for (const [i, [grupo, categoria, icono, items]] of CARTA.entries()) {
    await prisma.menuCategoria.create({ data: { grupo, nombre: categoria, icono, orden: i } })
    for (const [j, [nombre, precio, descripcion, alergenos]] of items.entries()) {
      await prisma.menuItem.create({
        data: { categoria, nombre, precio, descripcion, ficha: FICHAS[nombre] ?? '', orden: j, alergenos: { connect: alergenos.map(a => ({ id: alergenoId.get(a) as number })) } },
      })
      platos.push({ nombre, precio, tipo: grupo === 'Bebidas' ? 'barra' : 'cocina' })
    }
  }
  const comida = platos.filter(p => p.tipo === 'cocina')
  const bebida = platos.filter(p => p.tipo === 'barra')

  // Wiki común
  const bienvenida = await prisma.wikiCategoria.create({ data: { nombre: 'Bienvenida', icono: '👋', orden: 0 } })
  const protocolos = await prisma.wikiCategoria.create({ data: { nombre: 'Protocolos', icono: '📋', orden: 1 } })
  await prisma.wikiArticulo.createMany({
    data: [
      { categoriaId: bienvenida.id, titulo: 'Recibir a la mesa', orden: 0, notas: 'Siempre en el primer minuto. Ofrecer agua y explicar que las tapas son para compartir.', guiones: { en: 'Welcome to Traga Agua! Our dishes are made to share. Can I bring you some water while you look at the menu?' } },
      { categoriaId: bienvenida.id, titulo: 'Recomendar la carta', orden: 1, notas: 'Proponer 2 tapas por persona y un plato del mar para el centro.', guiones: { en: 'For two people I would suggest four tapas and one dish from the sea to share. The grilled octopus is our favourite.' } },
      { categoriaId: bienvenida.id, titulo: 'Despedir a la mesa', orden: 2, notas: 'Acompañar hasta la puerta si se puede. Mencionar la reseña solo si la experiencia fue buena.', guiones: { en: 'Thank you for coming! We hope you enjoyed it. If you did, a review would help us a lot. See you soon!' } },
      { categoriaId: protocolos.id, titulo: 'Queja de un cliente', orden: 1, notas: 'Escuchar sin interrumpir, disculparse, ofrecer solución y avisar al encargado. Registrar la merma.', guiones: { en: 'I am very sorry about that. Let me fix it right away: I can bring you a new one or offer you something else.' } },
      { categoriaId: protocolos.id, titulo: 'Cuenta dividida', orden: 2, notas: 'Preguntar antes de imprimir cómo quieren pagar. Con tarjeta, una operación por persona.', guiones: { en: 'Would you like to pay together or split the bill? I can divide it equally or by what each of you ordered.' } },
      { categoriaId: protocolos.id, titulo: 'Alergias', orden: 0, notas: 'Preguntar SIEMPRE al tomar nota. Ante la duda, consultar con cocina antes de confirmar.', guiones: { en: 'Does anyone at the table have an allergy or intolerance? I will check every dish with the kitchen.' } },
    ],
  })

  // Inventario común
  const productos: { id: number; minimo: number }[] = []
  const premixes: { id: number; nombre: string }[] = []
  for (const [i, [categoria, produce, items]] of INVENTARIO.entries()) {
    const c = await prisma.inventarioCategoria.create({ data: { nombre: categoria, orden: i, personalProduccion: produce } })
    for (const [j, [nombre, unidad, stockMinimo, precioCoste, precioVenta]] of items.entries()) {
      const prod = await prisma.inventarioProducto.create({ data: { categoriaId: c.id, nombre, unidad, stockMinimo, precioCoste, precioVenta, orden: j } })
      productos.push({ id: prod.id, minimo: stockMinimo })
      if (produce) premixes.push({ id: prod.id, nombre })
    }
  }

  // Tipos de turno del personal, comunes al grupo
  const tipoTurno = {
    completo: await prisma.turnoTipo.create({ data: { nombre: 'Jornada', horaInicio: '12:00', horaFin: '20:00', horas: 8, color: '#6366f1' } }),
    noche: await prisma.turnoTipo.create({ data: { nombre: 'Noche', horaInicio: '17:00', horaFin: '01:00', horas: 8, color: '#0ea5e9' } }),
    tarde: await prisma.turnoTipo.create({ data: { nombre: 'Tarde', horaInicio: '18:00', horaFin: '00:00', horas: 6, color: '#f59e0b' } }),
    refuerzo: await prisma.turnoTipo.create({ data: { nombre: 'Refuerzo', horaInicio: '20:00', horaFin: '00:00', horas: 4, color: '#10b981' } }),
  }

  let pin = 2100
  const resumen: string[] = []
  for (const local of LOCALES) {
    const r = await prisma.restaurant.create({ data: { nombre: local.nombre } })
    await prisma.ticketConfig.create({ data: { restaurantId: r.id, nombreComercial: local.nombre, direccion: local.direccion, telefono: local.telefono } })

    const mesas: { id: number; capacidad: number }[] = []
    for (const planta of local.plantas) {
      const fp = await prisma.floorPlan.create({ data: { restaurantId: r.id, nombre: planta.nombre } })
      for (const [numero, tipo, x, y, capacidad, rotacion, ancho, alto] of planta.mesas) {
        const m = await prisma.mesa.create({ data: { floorPlanId: fp.id, numero, tipo, x, y, capacidad, rotacion, ancho, alto } })
        if (capacidad > 0) mesas.push({ id: m.id, capacidad })
      }
    }

    const camareros: string[] = []
    const plantilla: { id: number; horas: number }[] = []
    let encargado = ''
    let pinEncargado = ''
    for (const [nombre, tipo, rol] of local.personal) {
      const suPin = String(pin++)
      const horas = rol === 'encargado' || rol === 'jefe_cocina' ? 40 : elegir([40, 40, 30, 20])
      const emp = await prisma.empleado.create({
        data: { nombre, tipo, rol, pin: suPin, restaurantId: r.id, horasSemanales: horas, email: `${nombre.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@demo.oido` },
      })
      plantilla.push({ id: emp.id, horas })
      if (tipo === 'sala') camareros.push(nombre.split(' ')[0])
      if (rol === 'encargado') { encargado = nombre; pinEncargado = suPin }
    }

    // Planificación de personal: esta semana y la siguiente. Dos días libres seguidos por persona,
    // escalonados; el turno depende de sus horas de contrato.
    await prisma.staffingConfig.create({ data: { restaurantId: r.id } })
    const cuenta = (rol: string) => local.personal.filter(p => p[2] === rol).length
    await prisma.staffingNecesidadDia.createMany({
      data: Array.from({ length: 7 }, (_, dia) => ({
        restaurantId: r.id, diaSemana: dia,
        encargados: 1, camareros: Math.max(1, cuenta('camarero') - (dia < 4 ? 1 : 0)),
        jefeCocina: 1, cocineros: Math.min(1, cuenta('cocinero')), friegaplatos: Math.min(1, cuenta('friegaplatos')),
      })),
    })
    for (const [i, emp] of plantilla.entries()) {
      const libre = (i * 2) % 7 // primer día libre; el segundo es el siguiente
      const tipo = emp.horas >= 40 ? (i % 2 ? tipoTurno.noche : tipoTurno.completo) : emp.horas >= 30 ? tipoTurno.tarde : tipoTurno.refuerzo
      for (let dia = 0; dia < 14; dia++) {
        if (dia % 7 === libre || dia % 7 === (libre + 1) % 7) continue
        const fecha = new Date(lunes); fecha.setUTCDate(fecha.getUTCDate() + dia)
        await prisma.turnoEmpleado.create({
          data: { restaurantId: r.id, empleadoId: emp.id, tipoId: tipo.id, fecha, horaInicio: tipo.horaInicio, horaFin: tipo.horaFin, estado: dia < 7 ? 'confirmado' : 'planificado' },
        })
      }
    }

    // Checklists de apertura y cierre por sector, con lo ya hecho hoy y el cierre de ayer
    const sectores = ['Barra', 'Sala', 'Cocina', ...(local.plantas.length > 1 ? ['Terraza'] : [])]
    for (const [i, sector] of sectores.entries()) {
      const sec = await prisma.checklistSector.create({ data: { restaurantId: r.id, nombre: sector, orden: i } })
      const t = TAREAS[sector]
      await prisma.checklistItem.createMany({
        data: [...t.apertura.map((texto, orden) => ({ sectorId: sec.id, momento: 'apertura', texto, orden })), ...t.cierre.map((texto, orden) => ({ sectorId: sec.id, momento: 'cierre', texto, orden }))],
      })
      // la apertura de hoy (alguno deja una tarea sin hacer) y el cierre de anoche
      const quien = sector === 'Cocina' ? local.personal.find(p => p[1] === 'cocina')![0] : elegir(camareros)
      await prisma.checklistEjecucion.create({
        data: { sectorId: sec.id, restaurantId: r.id, momento: 'apertura', completadoPor: quien, fecha: hace(235 - i * 6), itemsMarcados: t.apertura.map((texto, n) => ({ texto, marcado: !(i === 1 && n === 5) })) },
      })
      await prisma.checklistEjecucion.create({
        data: { sectorId: sec.id, restaurantId: r.id, momento: 'cierre', completadoPor: quien, fecha: hace(1440 - 60 + i * 5), itemsMarcados: t.cierre.map(texto => ({ texto, marcado: true })) },
      })
    }

    // Menús de grupo y dos grupos agendados
    const plantillas = []
    for (const [nombre, precio, paxPorRacion, cursos] of MENUS_GRUPO) {
      plantillas.push(await prisma.grupoMenuTemplate.create({
        data: { restaurantId: r.id, nombre, precio, paxPorRacion, niveles: cursos.map(([curso, platosCurso, esPostre], n) => ({ nivel: n + 1, nombre: curso, platos: platosCurso, esPostre })) },
      }))
    }
    await prisma.grupoAgendado.create({ data: { restaurantId: r.id, templateId: plantillas[1].id, fecha: diaUtc(0), pax: 14, restricciones: { normales: 11, vegetarianos: 2, sinCerdo: 0, sinGluten: 1 }, notas: 'Cena de empresa. Llegan a las 21:00.' } })
    await prisma.grupoAgendado.create({ data: { restaurantId: r.id, templateId: plantillas[2].id, fecha: diaUtc(3), pax: 22, restricciones: { normales: 18, vegetarianos: 3, sinCerdo: 1, sinGluten: 0 }, notas: 'Cumpleaños. Traen tarta: cobrar descorche.' } })

    // Inventario: dos conteos (hace una semana y ayer) para poder comparar consumo y costes
    for (const [dias, factor] of [[7, 1], [1, 0.55]] as const) {
      await prisma.inventarioConteo.create({
        data: {
          restaurantId: r.id, fecha: hace(dias * 1440), creadoPor: encargado, cerrado: true, notas: dias === 7 ? 'Conteo semanal' : 'Conteo antes del pedido',
          items: { create: productos.map(p => ({ productoId: p.id, cantidad: Math.max(0, Math.round((p.minimo * (1.4 + azar()) * factor) * 2) / 2) })) },
        },
      })
    }
    for (const premix of premixes) {
      await prisma.inventarioProduccion.create({ data: { restaurantId: r.id, productoId: premix.id, cantidad: entre(2, 5), unidad: 'l', creadoPor: elegir(camareros), fecha: hace(entre(200, 1500)), notas: '' } })
    }

    // Reservas: horarios de comida y cena, las de hoy y algunas de mañana
    const reservaConfig = await prisma.reservaConfig.create({
      data: { restaurantId: r.id, slug: local.nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), maxPaxPorSlot: 20, duracionMin: 90, diasAntelacion: 30 },
    })
    await prisma.reservaHorario.createMany({
      data: [
        { configId: reservaConfig.id, nombre: 'Comida', diasSemana: [1, 2, 3, 4, 5, 6, 7], horaInicio: '13:00', horaFin: '15:30', intervaloMin: 30, maxPax: 20 },
        { configId: reservaConfig.id, nombre: 'Cena', diasSemana: [1, 2, 3, 4, 5, 6, 7], horaInicio: '20:00', horaFin: '22:30', intervaloMin: 30, maxPax: 24 },
      ],
    })
    const horas = ['13:30', '14:00', '20:00', '20:30', '21:00', '21:30', '22:00']
    for (let n = 0; n < 9; n++) {
      const enPool = n === 4
      await prisma.reserva.create({
        data: {
          restaurantId: r.id, configId: reservaConfig.id, fecha: diaUtc(n < 6 ? 0 : 1), hora: horas[n % horas.length], pax: entre(2, 8),
          nombre: NOMBRES_RESERVA[(n + r.id) % NOMBRES_RESERVA.length], telefono: `600 000 ${String(100 + n * 7 + r.id)}`,
          notas: n === 1 ? 'Aniversario, mesa tranquila' : n === 3 ? 'Un celíaco' : null, origen: n % 3 === 0 ? 'admin' : 'web',
          estado: n === 5 ? 'cancelada' : 'confirmada',
          ...(enPool ? { enPool: true, poolMotivo: 'No nos queda mesa para 8 a esa hora', poolDesde: hace(40), restaurantIdOrigen: r.id } : {}),
        },
      })
    }

    // Una comanda con platos y bebidas al azar, proporcional a los comensales
    const crearComanda = async (mesaId: number, pax: number, abiertaHace: number, estado: string, cerradaHace?: number) => {
      const lineas = [
        ...Array.from({ length: pax + entre(0, 2) }, () => elegir(bebida)),
        ...Array.from({ length: Math.max(2, pax + entre(0, 2)) }, () => elegir(comida)),
      ]
      const agrupadas = new Map<string, { plato: typeof lineas[number]; cantidad: number }>()
      for (const plato of lineas) agrupadas.set(plato.nombre, { plato, cantidad: (agrupadas.get(plato.nombre)?.cantidad ?? 0) + 1 })
      const total = [...agrupadas.values()].reduce((s, l) => s + l.plato.precio * l.cantidad, 0)
      const cerrada = estado === 'cerrada'
      const metodoPago = cerrada ? (azar() < 0.72 ? 'tarjeta' : 'cash') : null
      await prisma.comanda.create({
        data: {
          restaurantId: r.id, mesaId, pax, estado, metodoPago,
          propina: cerrada && azar() < 0.4 ? entre(1, 6) : 0,
          camareroNombre: elegir(camareros),
          createdAt: hace(abiertaHace), enviadaAt: estado === 'abierta' ? null : hace(abiertaHace - 4),
          closedAt: cerrada && cerradaHace !== undefined ? hace(cerradaHace) : null,
          items: {
            create: [...agrupadas.values()].map(({ plato, cantidad }) => ({
              nombre: plato.nombre, precio: plato.precio, cantidad, tipo: plato.tipo,
              nivel: estado === 'abierta' ? null : plato.tipo === 'barra' ? 1 : entre(1, 2),
              ronda: estado === 'abierta' ? 0 : 1,
            })),
          },
        },
      })
      return { total, metodoPago }
    }

    // Dos turnos ya cerrados (ayer y anteayer), para que el histórico tenga algo
    for (const dias of [2, 1]) {
      let efectivo = 0, tarjeta = 0
      const n = entre(14, 24)
      for (let i = 0; i < n; i++) {
        const m = elegir(mesas)
        const inicio = dias * 1440 + entre(30, 300)
        const c = await crearComanda(m.id, entre(1, m.capacidad), inicio, 'cerrada', inicio - entre(45, 110))
        if (c.metodoPago === 'cash') efectivo += c.total; else tarjeta += c.total
      }
      await prisma.turno.create({
        data: {
          restaurantId: r.id, estado: 'cerrado', encargadoNombre: encargado,
          aperturaAt: hace(dias * 1440 + 330), cierreAt: hace(dias * 1440 - 60),
          totalEfectivo: efectivo, totalTarjeta: tarjeta, totalVentas: efectivo + tarjeta, totalMermas: entre(0, 18), totalPropinas: entre(15, 60), totalInvitaciones: 0, numComandas: n,
        },
      })
    }

    // El turno de hoy, abierto: mesas ya cobradas + sala en marcha
    await prisma.turno.create({ data: { restaurantId: r.id, estado: 'abierto', encargadoNombre: encargado, aperturaAt: hace(240) } })
    let ventasHoy = 0
    for (let i = 0; i < entre(7, 12); i++) {
      const m = elegir(mesas)
      const inicio = entre(70, 230)
      ventasHoy += (await crearComanda(m.id, entre(1, m.capacidad), inicio, 'cerrada', inicio - entre(40, 65))).total
    }
    const libres = [...mesas].sort(() => azar() - 0.5)
    const ocupadas = libres.slice(0, Math.min(6, Math.ceil(mesas.length / 2)))
    for (const [i, m] of ocupadas.entries()) {
      await crearComanda(m.id, entre(1, m.capacidad), entre(8, 55), i === 0 ? 'facturada' : i === 1 ? 'abierta' : 'enviada')
    }
    // Mermas: las de hoy y algunas de los días anteriores
    for (const [n, [itemNombre, motivo, descripcion]] of MERMAS.entries()) {
      const plato = platos.find(p => p.nombre === itemNombre)!
      await prisma.merma.create({
        data: {
          restaurantId: r.id, mesaNumero: entre(1, 9), planNombre: local.plantas[0].nombre, itemNombre, cantidad: n === 2 ? 2 : 1, precio: plato.precio,
          itemNivel: plato.tipo === 'barra' ? 1 : entre(1, 2), camareroNombre: elegir(camareros), motivo, descripcion,
          createdAt: hace(n < 3 ? entre(20, 220) : entre(1, 2) * 1440 + entre(0, 300)),
        },
      })
    }

    resumen.push(`  ${local.nombre}: ${mesas.length} mesas, ${local.personal.length} empleados, ${ventasHoy.toFixed(0)} € cobrados hoy, ${ocupadas.length} mesas ocupadas · encargado/a ${encargado}, PIN ${pinEncargado}`)
  }

  console.log('\nDemo cargada: grupo "Traga Agua" con 3 restaurantes.\n' + resumen.join('\n'))
  console.log(`\nCarta: ${platos.length} platos y bebidas en ${CARTA.length} categorías, con alérgenos y ficha de estudio.`)
  console.log('También: mermas, checklists por sector con lo hecho hoy, 3 menús de grupo y 2 grupos agendados, inventario con dos conteos,')
  console.log('planificación de personal de esta semana y la próxima, reservas de hoy y mañana (una en el pool), y la wiki.')
  console.log('Los PIN del personal van del 2100 en adelante, por orden. Todo es inventado.\n')
}

main()
  .catch(e => { console.error('✗', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
