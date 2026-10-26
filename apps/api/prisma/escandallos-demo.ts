// Escandallos de demostración para los platos globales y los de Sensi Tapas, para ver la pantalla
// funcionando antes de tener los gramajes del chef. Raciones típicas de tapas y precios de mayorista
// ESTIMADOS: cada ingrediente queda en la categoría "Materia prima (demo)" con precioOrigen 'estimado'.
// Las salsas y bases son elaboraciones (receta por tanda) en "Elaboraciones (demo)" y los premixes
// de cócteles en "Premixes (demo)": su coste sale de sus ingredientes.
//
//   npx tsx prisma/escandallos-demo.ts              → vista previa (no escribe nada)
//   npx tsx prisma/escandallos-demo.ts --confirmar  → crea ingredientes y recetas; rehace las recetas que solo
//                                                     llevan cosas de la demo, nunca las que tienen algo propio
//   npx tsx prisma/escandallos-demo.ts --borrar     → quita todo lo que creó este script
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const CATEGORIA = 'Materia prima (demo)'
const CAT_ELAB = { cocina: 'Elaboraciones (demo)', sala: 'Premixes (demo)' } as const
const CATEGORIAS_DEMO = [CATEGORIA, CAT_ELAB.cocina, CAT_ELAB.sala]
const RESTAURANTE = 'Sensi Tapas'

type Ing = { nombre: string; unidad: 'kg' | 'l' | 'ud' | 'botella'; precio: number; contenido?: number; merma?: number }
const g = (nombre: string, precio: number, merma = 0): Ing => ({ nombre, unidad: 'kg', precio, merma })
const ml = (nombre: string, precio: number, merma = 0): Ing => ({ nombre, unidad: 'l', precio, merma })
const ud = (nombre: string, precio: number): Ing => ({ nombre, unidad: 'ud', precio })
const bot = (nombre: string, precio: number, contenido = 700, merma = 0): Ing => ({ nombre, unidad: 'botella', precio, contenido, merma })

// Precios de compra estimados (€/kg, €/l, €/ud o €/botella)
const ING = {
  panCoca: g('Pan de coca', 4.5), panServicio: g('Pan de hogaza', 3.2),
  tomateColgar: g('Tomate de colgar', 3, 30), tomate: g('Tomate', 2.2, 10),
  aove: ml('Aceite de oliva virgen extra', 9), aceiteFritura: ml('Aceite de girasol (fritura)', 2.2),
  sal: g('Sal', 0.6), salEscamas: g('Sal en escamas', 18),
  jamon: g('Jamón ibérico de cebo loncheado', 48), salchichon: g('Salchichón ibérico', 22),
  manchego: g('Queso manchego curado', 18), quesoAzul: g('Queso azul', 22), quesoCabra: g('Queso de cabra', 16),
  membrillo: g('Membrillo', 6), nueces: g('Nueces peladas', 12),
  chorizo: g('Chorizo fresco (choricillos)', 9), sidra: ml('Sidra', 3),
  croqVegana: ud('Croqueta vegana', 0.42), croqGamba: ud('Croqueta de gamba', 0.45),
  carrillera: g('Carrillera de cerdo ibérico', 10, 35), patata: g('Patata', 0.9, 20),
  mantequilla: g('Mantequilla', 9), leche: ml('Leche', 1), vinoCocina: ml('Vino tinto de cocina', 2),
  verduraFondo: g('Verdura para fondo', 1.6, 15), solomillo: g('Solomillo de ternera', 26, 10),
  pollo: g('Contramuslo de pollo deshuesado', 6.5, 5), butifarra: g('Butifarra fresca', 8),
  mongetes: g('Mongetes cocidas', 6), apionabo: g('Apionabo', 2.5, 20), remolacha: g('Remolacha', 2, 15),
  burrata: ud('Burrata 125 g', 2.6), rucula: g('Rúcula', 9, 10),
  pulpo: g('Pata de pulpo cocida', 32), pimenton: g('Pimentón de la Vera', 15),
  anchoa: g('Anchoa del Cantábrico', 85), gamba: g('Gamba pelada', 14), ajo: g('Ajo', 4, 15), guindilla: g('Guindilla', 20),
  atun: g('Atún rojo (lomo)', 32, 15), aguacate: g('Aguacate', 4, 30), soja: ml('Salsa de soja', 6),
  sesamo: g('Sésamo', 8), cebolleta: g('Cebolleta', 2.5, 15), hierbas: g('Hierbas frescas', 25),
  limon: g('Limón', 1.8, 40), lima: g('Lima', 3.5, 40),
  padron: g('Pimiento de Padrón', 7, 5),
  placaCanelon: ud('Placa de canelón', 0.12),
  quesoRallado: g('Queso rallado', 12), arroz: g('Arroz bomba', 2.2), capIPota: g('Cap i pota', 8),
  ravioli: g('Ravioli fresco', 14),
  salsaTrufa: g('Salsa de trufa', 18), parmesano: g('Parmesano', 22),
  // para las elaboraciones
  tomateTriturado: g('Tomate triturado', 1.4), aceiteSuave: ml('Aceite de oliva suave', 5), cebolla: g('Cebolla', 1.2, 10),
  albahaca: g('Albahaca fresca', 20, 20), pinones: g('Piñones', 45), huesos: g('Huesos y espinas para fondo', 2),
  carneRustido: g('Carne de cerdo y ternera (rustido)', 8), vinoRancio: ml('Vino rancio', 6), zumoLima: ml('Zumo de lima', 6),
  // postres
  quesoCrema: g('Queso crema', 8), nata: ml('Nata para montar', 4), huevo: ud('Huevo', 0.25),
  galleta: g('Galleta', 4), chocolate: g('Chocolate negro 70 %', 12), harina: g('Harina', 0.8),
  heladoVainilla: g('Helado de vainilla', 6), lecheCoco: ml('Leche de coco', 3.5),
  // bebida
  cervezaBarril: ml('Cerveza de barril', 2.6, 5), sinAlcohol: ud('Cerveza sin alcohol 33 cl', 0.65),
  ipa: ud('IPA Complot 33 cl', 1.7), refresco: ud('Refresco 20 cl', 0.5),
  cocaCola: ud('Coca-Cola 33 cl', 0.6), cocaZero: ud('Coca-Cola Zero 33 cl', 0.6),
  fantaNaranja: ud('Fanta naranja 33 cl', 0.55), fantaLimon: ud('Fanta limón 33 cl', 0.55),
  agua: ud('Agua 50 cl', 0.3), aguaGas: ud('Agua con gas 50 cl', 0.45), tonica: ud('Tónica premium 20 cl', 0.9),
  soda: ud('Soda 20 cl', 0.4), gingerBeer: ud('Ginger beer 20 cl', 0.95), hielo: g('Hielo', 0.35),
  pureMango: ml('Puré de mango', 8), frutosRojos: g('Frutos rojos congelados', 7), hierbabuena: g('Hierbabuena', 12, 20),
  azucar: g('Azúcar moreno', 1.6), sirope: ml('Sirope de azúcar', 3), zumoNaranja: ml('Zumo de naranja', 2.5),
  zumoTropical: ml('Zumo tropical', 2.8), espresso: ud('Café espresso (dosis)', 0.18),
  licorCafe: bot('Licor de café', 11), frutaSangria: g('Fruta para sangría', 2.5, 20),
  vinoSangria: ml('Vino tinto para sangría', 2.2), brandySangria: bot('Brandy (para sangría)', 8, 1000),
  gaseosa: ml('Gaseosa', 0.6), cava: bot('Cava Oliver Brut', 5.5, 750, 3),
  // destilados y aperitivos (botella de 70 cl salvo que se diga)
  ginMare: bot('Gin Mare', 30), hendricks: bot("Hendrick's", 28), gvine: bot("G'Vine", 32), tanqueray: bot('Tanqueray', 15),
  glenfiddich: bot('Glenfiddich 12', 32), cutty: bot('Cutty Sark', 12), ballantines: bot("Ballantine's", 13),
  fourRoses: bot('Four Roses', 18), glenmorangie: bot('Glenmorangie 10', 33),
  brugal: bot('Brugal Añejo Superior', 13), matusalem: bot('Matusalem 15', 28), caldas: bot('Viejo de Caldas 3', 10),
  bacardi: bot('Bacardi', 12), moskovskaya: bot('Moskovskaya', 10), absolut: bot('Absolut', 13),
  zubrowka: bot('Zubrówka', 14), belvedere: bot('Belvedere', 30), cuervo: bot('José Cuervo', 15), herradura: bot('Herradura', 35),
  torres5: bot('Torres 5', 11), torres10: bot('Torres 10', 15), limoncello: bot('Limoncello', 10),
  hierbasLicor: bot('Licor de hierbas', 10), orujo: bot('Orujo blanco', 12), courvoisier: bot('Courvoisier VSOP', 32),
  calvados: bot('Calvados Père Magloire', 25), cointreau: bot('Cointreau', 17), baileys: bot("Bailey's", 13),
  amaretto: bot('Amaretto', 12), licor43: bot('Licor 43', 15), grappa: bot('Grappa Libarna', 18), armagnac: bot('Armagnac Saint Vivant', 28),
  ricard: bot('Ricard', 16, 1000), cinzanoBianco: bot('Cinzano Bianco', 8, 1000), cinzanoRosso: bot('Cinzano Rosso', 8, 1000),
  campari: bot('Campari', 15, 1000), aperol: bot('Aperol', 13, 1000), oporto: bot('Oporto', 9, 750),
  // vino de la casa (copa de 150 ml)
  casa10000b: bot('10.000 Blanco', 3.8, 750, 3), gormaz: bot('Viña Gormaz', 4.2, 750, 3), villanueva: bot('Villanueva', 5.5, 750, 3),
  setmanes: bot('3 Setmanes', 3.8, 750, 3), castellDor: bot("Castell d'Or", 4, 750, 3), valdelaciervaCopa: bot('Valdelacierva', 5.5, 750, 3),
  casa10000r: bot('10.000 Rosado', 3.8, 750, 3),
} satisfies Record<string, Ing>
type KI = keyof typeof ING

// Elaboraciones: receta de una tanda y cuánto sale (rinde, en g / ml / ud). Pueden llevar otras.
type Elab = { nombre: string; unidad: 'kg' | 'l'; rinde: number; produccion: 'cocina' | 'sala'; lineas: [KI | KE, number][] }
type KE = 'salsaBrava' | 'alioli' | 'bechamel' | 'sofrito' | 'pesto' | 'caldo' | 'carneAsado' | 'premixMango' | 'premixFrutosRojos'
const ELAB: Record<KE, Elab> = {
  caldo: { nombre: 'Caldo / fumet', unidad: 'l', rinde: 5000, produccion: 'cocina', lineas: [['huesos', 2000], ['verduraFondo', 800], ['sal', 20]] },
  salsaBrava: { nombre: 'Salsa brava', unidad: 'kg', rinde: 2000, produccion: 'cocina', lineas: [['tomateTriturado', 1500], ['aceiteSuave', 200], ['pimenton', 30], ['guindilla', 10], ['cebolla', 300], ['harina', 40], ['caldo', 500], ['sal', 15]] },
  alioli: { nombre: 'Alioli', unidad: 'kg', rinde: 1000, produccion: 'cocina', lineas: [['aceiteFritura', 800], ['ajo', 40], ['huevo', 2], ['limon', 30], ['sal', 8]] },
  bechamel: { nombre: 'Bechamel', unidad: 'kg', rinde: 2000, produccion: 'cocina', lineas: [['leche', 1800], ['mantequilla', 120], ['harina', 120], ['sal', 10]] },
  sofrito: { nombre: 'Sofrito', unidad: 'kg', rinde: 1000, produccion: 'cocina', lineas: [['cebolla', 1500], ['tomate', 1000], ['aove', 200], ['ajo', 30], ['sal', 10]] },
  pesto: { nombre: 'Pesto', unidad: 'kg', rinde: 1000, produccion: 'cocina', lineas: [['albahaca', 300], ['parmesano', 150], ['pinones', 100], ['aove', 450], ['ajo', 15]] },
  carneAsado: { nombre: 'Carne de rustido', unidad: 'kg', rinde: 1000, produccion: 'cocina', lineas: [['carneRustido', 1500], ['verduraFondo', 400], ['vinoRancio', 150], ['aove', 50]] },
  premixMango: { nombre: 'Premix mojito de mango', unidad: 'l', rinde: 1000, produccion: 'sala', lineas: [['pureMango', 500], ['zumoLima', 250], ['sirope', 200], ['hierbabuena', 30]] },
  premixFrutosRojos: { nombre: 'Premix margarita frutos rojos', unidad: 'l', rinde: 1000, produccion: 'sala', lineas: [['frutosRojos', 400], ['zumoLima', 300], ['sirope', 200]] },
}
type K = KI | KE
type Linea = [K, number] // cantidad en g / ml / ud
const esElab = (k: K): k is KE => k in ELAB

const combinado = (botella: K, mezcla: K): Linea[] => [[botella, 50], [mezcla, 1], ['hielo', 150], ['limon', 10]]
const solo = (botella: K, dosis = 50): Linea[] => [[botella, dosis], ['hielo', 100]]
const copa = (botella: K): Linea[] => [[botella, 150]]

// Recetas por nombre del plato (sin acentos, en mayúsculas)
const RECETAS: Record<string, Linea[]> = {
  // comida
  'PAN TOMATE': [['panCoca', 120], ['tomateColgar', 60], ['aove', 10], ['sal', 1]],
  'SERVICIO PAN': [['panServicio', 50], ['aove', 5]],
  'PLATO JAMON': [['jamon', 80]],
  'SALCHICHON': [['salchichon', 90]],
  'SELECCION QUESOS': [['manchego', 50], ['quesoAzul', 40], ['quesoCabra', 40], ['membrillo', 30], ['nueces', 15]],
  'CHORICILLOS': [['chorizo', 220], ['sidra', 60], ['aove', 10]],
  'CROQ. VEGANAS': [['croqVegana', 4], ['aceiteFritura', 30]],
  'CROQ. GAMBAS': [['croqGamba', 4], ['aceiteFritura', 30]],
  'CARRILLERA': [['carrillera', 220], ['patata', 180], ['mantequilla', 15], ['leche', 30], ['vinoCocina', 60], ['verduraFondo', 80]],
  'SOLOMILLO': [['solomillo', 150], ['patata', 150], ['aove', 15], ['salEscamas', 2]],
  'POLLO': [['pollo', 220], ['patata', 150], ['aove', 15], ['hierbas', 3], ['limon', 20]],
  'BUTIFARRA': [['butifarra', 200], ['mongetes', 150], ['aove', 10], ['ajo', 3]],
  'APIO': [['apionabo', 300], ['mantequilla', 20], ['aove', 15], ['nueces', 15], ['hierbas', 3]],
  'REMOLACHA': [['remolacha', 250], ['quesoCabra', 40], ['nueces', 15], ['rucula', 20], ['aove', 10]],
  'BURRATA': [['burrata', 1], ['tomate', 150], ['pesto', 20], ['aove', 10], ['rucula', 15]],
  'PULPO': [['pulpo', 140], ['patata', 150], ['pimenton', 2], ['aove', 15], ['salEscamas', 2]],
  'TOST. ANCHOAS': [['anchoa', 24], ['panCoca', 80], ['tomateColgar', 40], ['aove', 10]],
  'GAMBAS': [['gamba', 160], ['ajo', 10], ['guindilla', 1], ['aove', 50], ['panCoca', 40]],
  'TARTAR DE ATUN': [['atun', 100], ['aguacate', 70], ['soja', 10], ['sesamo', 3], ['cebolleta', 15]],
  'PATATAS BRAVAS': [['patata', 300], ['aceiteFritura', 40], ['salsaBrava', 40], ['alioli', 30]],
  'PIMIENTOS PADRON': [['padron', 200], ['aove', 15], ['salEscamas', 3]],
  'CANELON': [['placaCanelon', 3], ['carneAsado', 130], ['bechamel', 120], ['quesoRallado', 20]],
  'ARROZ CAP I POTA': [['arroz', 90], ['capIPota', 150], ['sofrito', 40], ['caldo', 300], ['aove', 10]],
  'RAVIOLES': [['ravioli', 200], ['salsaTrufa', 50], ['parmesano', 15]],
  // postres
  'CHEESECAKE': [['quesoCrema', 90], ['nata', 30], ['azucar', 20], ['huevo', 0.5], ['galleta', 25], ['mantequilla', 10]],
  'SELEC. QUESOS': [['manchego', 30], ['quesoAzul', 25], ['quesoCabra', 25], ['membrillo', 25], ['nueces', 10]],
  'DELICIA VEGETAL': [['chocolate', 40], ['lecheCoco', 80], ['azucar', 15], ['frutosRojos', 30]],
  'BROWNIE': [['chocolate', 35], ['mantequilla', 25], ['azucar', 25], ['huevo', 0.5], ['harina', 15], ['nueces', 10], ['heladoVainilla', 60]],
  // cerveza y refrescos
  'COCA COLA': [['cocaCola', 1], ['hielo', 100], ['limon', 10]], 'COCA ZERO': [['cocaZero', 1], ['hielo', 100], ['limon', 10]],
  'FANTA NARA': [['fantaNaranja', 1], ['hielo', 100]], 'FANTA LIMO': [['fantaLimon', 1], ['hielo', 100]],
  'TONICA': [['tonica', 1], ['hielo', 100], ['limon', 10]], 'AGUA': [['agua', 1]], 'AGUA CON GAS': [['aguaGas', 1]],
  'CANA': [['cervezaBarril', 200]],
  'PINTA': [['cervezaBarril', 500]],
  'SIN ALCOHOL': [['sinAlcohol', 1]],
  'IPA COMPLOT': [['ipa', 1]],
  'SUPLEMENTO REFRESCO': [['refresco', 1]],
  // vino de la casa y cava por copa
  '10.000 BLANCO': copa('casa10000b'), 'VINA GORMAZ': copa('gormaz'), 'VILLANUEVA': copa('villanueva'),
  '3 SETMANES': copa('setmanes'), "CASTELL D'OR": copa('castellDor'), 'VALDELACIERVA': copa('valdelaciervaCopa'),
  '10.000 ROSADO': copa('casa10000r'), 'OLIVER BRUT (COPA)': copa('cava'),
  // sangrías y cócteles
  'SANGRIA': [['vinoSangria', 150], ['brandySangria', 20], ['gaseosa', 100], ['frutaSangria', 60], ['azucar', 10], ['hielo', 80]],
  'SANGRIA CAVA': [['cava', 150], ['cointreau', 20], ['frutaSangria', 60], ['sirope', 15], ['hielo', 80]],
  'CAVA SANGRIA': [['cava', 150], ['cointreau', 20], ['frutaSangria', 60], ['sirope', 15], ['hielo', 80]],
  'APEROL SPRITZ': [['aperol', 60], ['cava', 90], ['soda', 1], ['hielo', 100]],
  'NEGRONI': [['tanqueray', 30], ['campari', 30], ['cinzanoRosso', 30], ['hielo', 100]],
  'ESPRESSO MARTINI': [['absolut', 40], ['licorCafe', 20], ['espresso', 1], ['sirope', 10], ['hielo', 100]],
  'MANGO MOJITO': [['bacardi', 50], ['premixMango', 90], ['hierbabuena', 3], ['soda', 1], ['hielo', 150]],
  'SIN MANGO MOJITO': [['premixMango', 120], ['hierbabuena', 3], ['soda', 1], ['hielo', 150]],
  'GIN ORANGE MULE': [['tanqueray', 50], ['zumoNaranja', 30], ['gingerBeer', 1], ['lima', 15], ['hielo', 150]],
  'ROCKSBERRY MARGARITA': [['cuervo', 50], ['cointreau', 20], ['premixFrutosRojos', 80], ['hielo', 100]],
  'LIMO TROPICAL': [['limon', 60], ['zumoTropical', 100], ['sirope', 20], ['soda', 1], ['hielo', 100]],
  'LIMO JENGIBRE': [['limon', 60], ['gingerBeer', 1], ['sirope', 15], ['hielo', 100]],
  // combinados (el precio de carta es el del combinado)
  'GINEBRA GIN MARE': combinado('ginMare', 'tonica'), "HENDRICK'S": combinado('hendricks', 'tonica'),
  "G'VINE": combinado('gvine', 'tonica'), 'TANQUERAY': combinado('tanqueray', 'tonica'),
  'MOSKOSKAYA': combinado('moskovskaya', 'refresco'), 'ABSOLUT': combinado('absolut', 'refresco'),
  'ZUBROWKA': combinado('zubrowka', 'refresco'), 'BELVEDERE': combinado('belvedere', 'refresco'),
  'BRUGAL ANEJO SUPERIOR': combinado('brugal', 'refresco'), 'MATUSALEM 15': combinado('matusalem', 'refresco'),
  'VIEJO DE CALDAS 3': combinado('caldas', 'refresco'), 'BACARDI': combinado('bacardi', 'refresco'),
  // whisky solo, tequila en chupito, licores y aperitivos
  'GLENFIDDICH 12': solo('glenfiddich'), 'CUTTY SARK': solo('cutty'), 'BALLANTINES': solo('ballantines'),
  'FOUR ROSES': solo('fourRoses'), 'GLENMORANGIE 10': solo('glenmorangie'),
  'JOSE CUERVO': [['cuervo', 40]], 'HERRADURA': [['herradura', 40]],
  'TORRES 5': solo('torres5', 40), 'TORRES 10': solo('torres10', 40), 'LIMONCELLO': solo('limoncello', 40),
  'LICOR HIERBAS': solo('hierbasLicor', 40), 'ORUJO BLANCO': solo('orujo', 40), 'COURVOISIER VSOP': solo('courvoisier', 40),
  'CALVADOS PERE MAGLIORE': solo('calvados', 40), 'COINTREAU': solo('cointreau', 40), "BAILEY'S": solo('baileys', 40),
  'AMARETTO': solo('amaretto', 40), 'LICOR 43': solo('licor43', 40), 'GRAPPA LIBARNA': solo('grappa', 40),
  'ARMAGNAC SAINT VIVANT': solo('armagnac', 40),
  'RICARD 2CL': [['ricard', 20]], 'CINZANO BIANCO': solo('cinzanoBianco', 100), 'CINZANO ROSSO': solo('cinzanoRosso', 100),
  'CAMPARI': [['campari', 50], ['soda', 1], ['hielo', 100]], 'OPORTO': [['oporto', 75]],
}

// Vinos por botella: se venden enteros. El coste sale del PVP con el margen típico de sala
// (el vino barato se multiplica más que el caro).
const ES_BOTELLA = /botella|cava & champ|vinos & otros/i
const factorBotella = (pvp: number) => pvp < 25 ? 0.25 : pvp < 35 ? 0.27 : pvp < 50 ? 0.29 : pvp < 80 ? 0.31 : 0.33

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

async function borrar() {
  const cats = await prisma.inventarioCategoria.findMany({ where: { nombre: { in: CATEGORIAS_DEMO }, restaurantId: null } })
  if (!cats.length) return console.log('No hay nada de la demo.')
  const ids = (await prisma.inventarioProducto.findMany({ where: { categoriaId: { in: cats.map(c => c.id) } }, select: { id: true } })).map(p => p.id)
  const recetas = await prisma.receta.findMany({ include: { lineas: true } })
  const demo = recetas.filter(r => r.lineas.length > 0 && r.lineas.every(l => ids.includes(l.productoId)))
  await prisma.receta.deleteMany({ where: { id: { in: demo.map(r => r.id) } } })
  const usados = await prisma.recetaLinea.findMany({ where: { productoId: { in: ids } }, select: { productoId: true } })
  const libres = ids.filter(id => !usados.some(u => u.productoId === id))
  await prisma.inventarioProducto.deleteMany({ where: { id: { in: libres } } })
  if (libres.length < ids.length) {
    console.log(`⚠ ${ids.length - libres.length} ingredientes de la demo siguen en recetas tocadas a mano: se dejan.`)
  } else {
    await prisma.inventarioCategoria.deleteMany({ where: { id: { in: cats.map(c => c.id) } } })
  }
  console.log(`Borradas ${demo.length} recetas y ${libres.length} ingredientes de la demo.`)
}

async function main() {
  if (process.argv.includes('--borrar')) return borrar()
  const confirmar = process.argv.includes('--confirmar')

  const sensi = await prisma.restaurant.findFirst({ where: { nombre: { equals: RESTAURANTE, mode: 'insensitive' } } })
  if (!sensi) throw new Error(`No hay ningún restaurante llamado "${RESTAURANTE}"`)
  const tasaIva = (await prisma.empresaConfig.findFirst())?.tasaIva ?? 10

  const cats = await prisma.inventarioCategoria.findMany({ where: { nombre: { in: CATEGORIAS_DEMO }, restaurantId: null } })
  const catsDemo = new Set(cats.map(c => c.id))
  const items = await prisma.menuItem.findMany({
    where: { activo: true, precio: { gt: 0 }, OR: [{ restaurantId: null }, { restaurantId: sensi.id }] },
    include: { receta: { include: { lineas: { include: { producto: { select: { categoriaId: true } } } } } } },
    orderBy: [{ categoria: 'asc' }, { orden: 'asc' }],
  })
  // Una receta que solo lleva cosas de la demo se puede rehacer; si tiene algo propio, no se toca
  const soloDemo = (r: (typeof items)[number]['receta']) => !!r && r.lineas.every(l => catsDemo.has(l.producto.categoriaId))

  // Qué receta lleva cada plato (un ingrediente es una clave de ING / ELAB, o una botella suelta)
  type Uso = { k: K } | { botella: Ing }
  type Plan = { item: (typeof items)[number]; lineas: (Uso & { cantidad: number })[] }
  const planes: Plan[] = []
  const sinReceta: string[] = []
  for (const item of items) {
    const r = RECETAS[norm(item.nombre)]
    if (r) planes.push({ item, lineas: r.map(([k, cantidad]) => ({ k, cantidad })) })
    else if (ES_BOTELLA.test(item.categoria)) {
      const precio = Math.round(item.precio * factorBotella(item.precio) * 100) / 100
      planes.push({ item, lineas: [{ botella: bot(`${item.nombre} (botella)`, precio, 750), cantidad: 750 }] })
    } else sinReceta.push(`${item.nombre} (${item.categoria})`)
  }

  // € por g / ml / ud
  const costeIng = (i: Ing) => i.precio / (i.unidad === 'ud' ? 1 : i.contenido ?? 1000) / (1 - (i.merma ?? 0) / 100)
  const costeK = (k: K): number => esElab(k) ? ELAB[k].lineas.reduce((s, [x, c]) => s + costeK(x) * c, 0) / ELAB[k].rinde : costeIng(ING[k])
  const costeUso = (u: Uso) => 'k' in u ? costeK(u.k) : costeIng(u.botella)

  console.log('Elaboraciones:')
  for (const e of Object.keys(ELAB) as KE[]) console.log(`  ⚗️ ${ELAB[e].nombre}: ${(costeK(e) * 1000).toFixed(2)} € / ${ELAB[e].unidad} (la hace ${ELAB[e].produccion})`)
  console.log('')
  let nuevas = 0, rehechas = 0, propias = 0
  for (const { item, lineas } of planes) {
    const coste = lineas.reduce((s, l) => s + costeUso(l) * l.cantidad, 0)
    const fc = (coste / (item.precio / (1 + tasaIva / 100))) * 100
    const marca = !item.receta ? '' : soloDemo(item.receta) ? '  (se rehace)' : '  (tiene receta propia: no se toca)'
    if (!item.receta) nuevas++; else if (soloDemo(item.receta)) rehechas++; else propias++
    console.log(`${fc.toFixed(1).padStart(5)} %  ${coste.toFixed(2).padStart(6)} € / ${item.precio.toFixed(2).padStart(6)} €  ${item.nombre}${marca}`)
  }
  if (sinReceta.length) console.log(`\nSin receta en la demo (${sinReceta.length}): ${sinReceta.join(' · ')}`)
  console.log(`\n${nuevas} recetas nuevas y ${rehechas} rehechas para ${items.length} platos (${RESTAURANTE} + globales); ${propias} con receta propia.`)
  if (!confirmar) return console.log('Vista previa. Para crearlas: --confirmar')

  const categoria = async (nombre: string, personalProduccion: 'cocina' | 'sala' | null) =>
    (await prisma.inventarioCategoria.findFirst({ where: { nombre, restaurantId: null } }))
      ?? prisma.inventarioCategoria.create({ data: { nombre, orden: 100, personalProduccion } })
  const cat = await categoria(CATEGORIA, null)
  const catElab = { cocina: await categoria(CAT_ELAB.cocina, 'cocina'), sala: await categoria(CAT_ELAB.sala, 'sala') }
  const idsDemo = [cat.id, catElab.cocina.id, catElab.sala.id]

  const productos = new Map<string, number>()
  const guardarProducto = async (nombre: string, categoriaId: number, datos: { unidad: string; precioCoste: number; precioOrigen: string; mermaPct: number; unidadBase: string; contenido: number }) => {
    const hecho = productos.get(nombre)
    if (hecho) return hecho
    const existe = await prisma.inventarioProducto.findFirst({ where: { nombre, categoriaId } })
    const p = existe
      ? await prisma.inventarioProducto.update({ where: { id: existe.id }, data: datos })
      : await prisma.inventarioProducto.create({ data: { nombre, categoriaId, ...datos } })
    productos.set(nombre, p.id)
    return p.id
  }
  const deIng = (i: Ing) => guardarProducto(i.nombre, cat.id, {
    unidad: i.unidad, precioCoste: i.precio, precioOrigen: 'estimado', mermaPct: i.merma ?? 0,
    unidadBase: i.unidad === 'kg' ? 'g' : i.unidad === 'ud' ? 'ud' : 'ml',
    contenido: i.unidad === 'ud' ? 1 : i.contenido ?? 1000,
  })
  const deK = async (k: K): Promise<number> => {
    if (!esElab(k)) return deIng(ING[k])
    const e = ELAB[k]
    if (productos.has(e.nombre)) return productos.get(e.nombre)!
    const lineas = []
    for (const [orden, [x, cantidad]] of e.lineas.entries()) lineas.push({ productoId: await deK(x), cantidad, orden })
    const id = await guardarProducto(e.nombre, catElab[e.produccion].id, {
      unidad: e.unidad, precioCoste: Math.round(costeK(k) * 1000 * 10000) / 10000, precioOrigen: 'receta', mermaPct: 0,
      unidadBase: e.unidad === 'kg' ? 'g' : 'ml', contenido: 1000,
    })
    const receta = await prisma.receta.upsert({ where: { productoId: id }, create: { productoId: id, rendimiento: e.rinde }, update: { rendimiento: e.rinde } })
    await prisma.recetaLinea.deleteMany({ where: { recetaId: receta.id } })
    await prisma.recetaLinea.createMany({ data: lineas.map(l => ({ ...l, recetaId: receta.id })) })
    return id
  }

  let hechas = 0
  for (const { item, lineas } of planes) {
    if (item.receta && !soloDemo(item.receta)) continue
    const conId = []
    for (const [orden, l] of lineas.entries()) conId.push({ productoId: 'k' in l ? await deK(l.k) : await deIng(l.botella), cantidad: l.cantidad, orden })
    if (item.receta) await prisma.receta.delete({ where: { id: item.receta.id } })
    await prisma.receta.create({ data: { menuItemId: item.id, raciones: 1, lineas: { create: conId } } })
    hechas++
  }

  // Lo que quedó de una versión anterior de la demo y ya no usa ninguna receta (ej. la brava comprada)
  const huerfanos = await prisma.inventarioProducto.findMany({
    where: { categoriaId: { in: idsDemo }, recetaLineas: { none: {} }, elaboracion: null, id: { notIn: [...productos.values()] } },
    select: { id: true },
  })
  await prisma.inventarioProducto.deleteMany({ where: { id: { in: huerfanos.map(h => h.id) } } })
  console.log(`✓ ${hechas} recetas de platos, ${Object.keys(ELAB).length} elaboraciones y ${productos.size} productos de la demo${huerfanos.length ? ` (${huerfanos.length} sobrantes quitados)` : ''}.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
