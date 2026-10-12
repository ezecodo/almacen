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
        data: { categoria, nombre, precio, descripcion, orden: j, alergenos: { connect: alergenos.map(a => ({ id: alergenoId.get(a) as number })) } },
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
      { categoriaId: protocolos.id, titulo: 'Alergias', orden: 0, notas: 'Preguntar SIEMPRE al tomar nota. Ante la duda, consultar con cocina antes de confirmar.', guiones: { en: 'Does anyone at the table have an allergy or intolerance? I will check every dish with the kitchen.' } },
    ],
  })

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
    let encargado = ''
    let pinEncargado = ''
    for (const [nombre, tipo, rol] of local.personal) {
      const suPin = String(pin++)
      await prisma.empleado.create({
        data: { nombre, tipo, rol, pin: suPin, restaurantId: r.id, horasSemanales: elegir([40, 40, 30, 20]), email: `${nombre.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@demo.oido` },
      })
      if (tipo === 'sala') camareros.push(nombre.split(' ')[0])
      if (rol === 'encargado') { encargado = nombre; pinEncargado = suPin }
    }

    for (const [i, sector] of ['Barra', 'Sala'].entries()) {
      const s = await prisma.checklistSector.create({ data: { restaurantId: r.id, nombre: sector, orden: i } })
      const tareas: [string, string][] = sector === 'Barra'
        ? [['apertura', 'Encender cafetera y lavavasos'], ['apertura', 'Reponer cámaras y hielo'], ['apertura', 'Cortar cítricos'], ['cierre', 'Vaciar y limpiar cafetera'], ['cierre', 'Inventario rápido de barriles'], ['cierre', 'Cerrar caja de barra']]
        : [['apertura', 'Montar mesas y revisar cartas'], ['apertura', 'Comprobar reservas del turno'], ['apertura', 'Encender música y luces'], ['cierre', 'Recoger terraza'], ['cierre', 'Barrer y fregar sala'], ['cierre', 'Apagar luces y climatización']]
      await prisma.checklistItem.createMany({ data: tareas.map(([momento, texto], orden) => ({ sectorId: s.id, momento, texto, orden })) })
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
    resumen.push(`  ${local.nombre}: ${mesas.length} mesas, ${local.personal.length} empleados, ${ventasHoy.toFixed(0)} € cobrados hoy, ${ocupadas.length} mesas ocupadas · encargado/a ${encargado}, PIN ${pinEncargado}`)
  }

  console.log('\nDemo cargada: grupo "Traga Agua" con 3 restaurantes.\n' + resumen.join('\n'))
  console.log(`\nCarta: ${platos.length} platos y bebidas en ${CARTA.length} categorías, con alérgenos. Wiki y checklists de apertura y cierre incluidos.`)
  console.log('Los PIN del personal van del 2100 en adelante, por orden. Todo es inventado.\n')
}

main()
  .catch(e => { console.error('✗', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
