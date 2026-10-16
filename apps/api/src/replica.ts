import { createHash } from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'

// Modo local (docs/modo-local.md): la Box de un local guarda una copia de lo que la sala necesita
// para seguir comandando sin internet. La instalación arma esa copia (armarReplica) y la Box la
// pide cada pocos segundos y la carga entera en su propia base (aplicarReplica).
//
// La copia es de UN restaurante y solo de sala: carta, alérgenos, maridajes, salón, personal de sala,
// impresoras y rutas, el turno abierto y las comandas sin cerrar. Nada de administración.

// Orden de carga (el de borrado es el inverso): cada tabla después de las que referencia.
const TABLAS = [
  'restaurant', 'empresaConfig', 'ticketConfig', 'alergeno', 'menuCategoria', 'menuItem', 'maridaje', 'perfilVino', 'itemAgotado',
  'floorPlan', 'mesa', 'impresora', 'impresionRuta', 'empleado', 'turno', 'comanda', 'comandaItem', 'merma',
] as const
type Tabla = (typeof TABLAS)[number]

export interface Replica {
  restaurantId: number
  tablas: Record<Tabla, Record<string, unknown>[]>
  // Qué alérgenos lleva cada plato (relación sin modelo propio en Prisma)
  alergenosDeItems: { menuItemId: number; alergenoId: number }[]
}

// Lo que la Box crea en modo local (comandas, items, mermas) se numera desde aquí, para que nunca
// choque con un número de la nube. Cada restaurante tiene su propio tramo de un millón: al volver
// internet esas comandas suben a la nube con el mismo número, y dos locales del mismo cliente no
// pueden pisarse. (La secuencia de la nube no se mueve al guardar un número explícito.)
const primerIdLocal = (restaurantId: number) => 1_000_000_000 + restaurantId * 1_000_000
const NUMERADAS_EN_LOCAL = ['Comanda', 'ComandaItem', 'Merma']

export async function armarReplica(prisma: PrismaClient, restaurantId: number): Promise<Replica> {
  const deEsteLocal = { OR: [{ restaurantId }, { restaurantId: null }] }
  const [restaurant, empresaConfig, ticketConfig, alergeno, menuCategoria, items, maridaje, perfilVino, itemAgotado, floorPlan, impresora, empleados, turno, comandas] = await Promise.all([
    prisma.restaurant.findMany({ where: { id: restaurantId } }),
    prisma.empresaConfig.findMany(),
    prisma.ticketConfig.findMany({ where: { restaurantId } }),
    prisma.alergeno.findMany(),
    prisma.menuCategoria.findMany({ where: deEsteLocal }),
    prisma.menuItem.findMany({ where: deEsteLocal, include: { alergenos: { select: { id: true } } } }),
    prisma.maridaje.findMany({ where: { plato: deEsteLocal, vino: deEsteLocal } }),
    prisma.perfilVino.findMany({ where: { vino: deEsteLocal } }),
    prisma.itemAgotado.findMany({ where: { restaurantId } }),
    prisma.floorPlan.findMany({ where: { restaurantId }, include: { mesas: true, rutas: true } }),
    prisma.impresora.findMany({ where: { restaurantId } }),
    prisma.empleado.findMany({ where: { activo: true, tipo: 'sala', ...deEsteLocal } }),
    prisma.turno.findMany({ where: { restaurantId, estado: 'abierto' } }),
    prisma.comanda.findMany({ where: { restaurantId, estado: { not: 'cerrada' } }, include: { items: true, mermas: true } }),
  ])

  return {
    restaurantId,
    tablas: {
      // En la Box no hay red que comprobar (solo se llega desde el WiFi del local) ni secreto que guardar
      restaurant: restaurant.map(r => ({ ...r, piSecreto: null, restringirPorRed: false })),
      empresaConfig,
      ticketConfig,
      alergeno,
      menuCategoria,
      menuItem: items.map(({ alergenos: _, ...item }) => item),
      maridaje,
      perfilVino,
      itemAgotado,
      floorPlan: floorPlan.map(({ mesas: _m, rutas: _r, ...plano }) => plano),
      mesa: floorPlan.flatMap(p => p.mesas),
      impresora,
      impresionRuta: floorPlan.flatMap(p => p.rutas),
      // El PIN viaja con otro nombre: el filtro global de server.ts borra toda clave "pin" de las respuestas
      empleado: empleados.map(({ pin, ...e }) => ({ ...e, clave: pin })),
      turno,
      comanda: comandas.map(({ items: _i, mermas: _m, ...c }) => c),
      comandaItem: comandas.flatMap(c => c.items),
      merma: comandas.flatMap(c => c.mermas),
    },
    alergenosDeItems: items.flatMap(i => i.alergenos.map(a => ({ menuItemId: i.id, alergenoId: a.id }))),
  }
}

// Huella del contenido: si no cambió desde la última vez, la Box no vuelve a cargar nada
export const huellaDe = (replica: Replica) => createHash('sha256').update(JSON.stringify(replica)).digest('hex')

// Reemplaza todo el contenido de la base de la Box por la copia, en una sola transacción:
// si algo falla, la Box se queda con la copia anterior entera.
export async function aplicarReplica(prisma: PrismaClient, replica: Replica) {
  await prisma.$transaction(async tx => {
    const tabla = (nombre: Tabla) => (tx as unknown as Record<Tabla, { deleteMany: () => Promise<unknown>; createMany: (a: { data: unknown[] }) => Promise<unknown> }>)[nombre]

    for (const nombre of [...TABLAS].reverse()) await tabla(nombre).deleteMany()
    for (const nombre of TABLAS) {
      let filas = replica.tablas[nombre] ?? []
      if (nombre === 'empleado') filas = filas.map(({ clave, ...e }) => ({ ...e, pin: clave ?? null }))
      if (filas.length) await tabla(nombre).createMany({ data: filas })
    }
    if (replica.alergenosDeItems.length) {
      const pares = replica.alergenosDeItems.map(p => Prisma.sql`(${p.alergenoId}, ${p.menuItemId})`)
      await tx.$executeRaw`INSERT INTO "_AlergenoToMenuItem" ("A", "B") VALUES ${Prisma.join(pares)}`
    }
    for (const t of NUMERADAS_EN_LOCAL) {
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), GREATEST(${primerIdLocal(replica.restaurantId)}, (SELECT COALESCE(MAX(id), 0) FROM "${t}")))`)
    }
  }, { timeout: 30_000 })
}

// ── Subida al volver internet ──────────────────────────────────────────────────
// Lo comandado en la Box sin internet sube a la nube. Regla: se sube solo lo que la Box cambió
// respecto de la última copia que recibió, campo por campo. Así lo que la nube tenía y la Box no
// llegó a ver (un plato impreso segundos antes del corte) no se pisa ni se borra. Cada fila sube con
// su número, de modo que repetir una subida cortada a medias no duplica nada.

type Fila = Record<string, unknown>
export interface Subida {
  comandas: { id: number; nueva: boolean; campos: Fila }[]
  items: { id: number; nuevo: boolean; campos: Fila }[]
  itemsBorrados: number[] // estaban en la copia y en la Box ya no (cambio de mesa, plato quitado)
}

const plano = (fila: object) => JSON.parse(JSON.stringify(fila)) as Fila
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Qué cambió en una fila respecto de la copia: null si nada; todo si la copia no la tenía
function cambios(antes: Fila | undefined, ahora: Fila): { nueva: boolean; campos: Fila } | null {
  const { id: _, ...resto } = ahora
  if (!antes) return { nueva: true, campos: resto }
  const campos: Fila = {}
  for (const [k, v] of Object.entries(resto)) if (!igual(v, antes[k])) campos[k] = v
  return Object.keys(campos).length ? { nueva: false, campos } : null
}

// En la Box: lo que hay que subir, comparando su base con la última copia aplicada
export async function loQueFaltaSubir(prisma: PrismaClient, copia: Replica): Promise<Subida> {
  const [comandas, items] = await Promise.all([prisma.comanda.findMany({ orderBy: { id: 'asc' } }), prisma.comandaItem.findMany({ orderBy: { id: 'asc' } })])
  const porId = (filas: Fila[]) => new Map(filas.map(f => [f.id as number, f]))
  const comandasCopia = porId(copia.tablas.comanda)
  const itemsCopia = porId(copia.tablas.comandaItem)

  const subida: Subida = { comandas: [], items: [], itemsBorrados: [] }
  for (const c of comandas) {
    const d = cambios(comandasCopia.get(c.id), plano(c))
    if (d) subida.comandas.push({ id: c.id, ...d })
  }
  for (const i of items) {
    const d = cambios(itemsCopia.get(i.id), plano(i))
    if (d) subida.items.push({ id: i.id, nuevo: d.nueva, campos: d.campos })
  }
  const vivos = new Set(items.map(i => i.id))
  subida.itemsBorrados = [...itemsCopia.keys()].filter(id => !vivos.has(id))
  return subida
}

export const cuantoFaltaSubir = (s: Subida) => s.comandas.length + s.items.length + s.itemsBorrados.length

// En la nube: aplica una subida de la Box de un restaurante. Solo toca comandas de ese restaurante
// que no estén cobradas, y solo los campos que la sala puede cambiar (la Box no cobra).
const CAMPOS_COMANDA = ['mesaId', 'pax', 'estado', 'camareroNombre', 'cuentaDesactualizada', 'noComparten', 'notaMesa', 'enviadaAt', 'createdAt']
const CAMPOS_ITEM = ['comandaId', 'nombre', 'precio', 'cantidad', 'nota', 'nivel', 'ronda', 'tipo', 'autoGenerado', 'invitacion', 'invitadoPor', 'invitacionMotivo']
const FECHAS = new Set(['enviadaAt', 'createdAt'])

function elegir(campos: Fila, permitidos: string[]): Fila {
  const datos: Fila = {}
  for (const k of permitidos) {
    if (!(k in campos)) continue
    const v = campos[k]
    datos[k] = FECHAS.has(k) && typeof v === 'string' ? new Date(v) : v
  }
  return datos
}

export async function aplicarSubida(prisma: PrismaClient, restaurantId: number, subida: Subida) {
  const resultado = { comandas: 0, items: 0, borrados: 0, ignorados: 0 }
  await prisma.$transaction(async tx => {
    // ¿Se puede tocar esta comanda? (de este restaurante y sin cobrar)
    const abiertas = new Map<number, boolean>()
    const sePuede = async (id: number) => {
      if (!abiertas.has(id)) {
        const c = await tx.comanda.findUnique({ where: { id }, select: { restaurantId: true, estado: true } })
        abiertas.set(id, !!c && c.restaurantId === restaurantId && c.estado !== 'cerrada')
      }
      return abiertas.get(id)!
    }

    for (const c of subida.comandas) {
      const datos = elegir(c.campos, CAMPOS_COMANDA)
      if (datos.estado === 'cerrada') delete datos.estado
      const existe = await tx.comanda.findUnique({ where: { id: c.id }, select: { id: true } })
      if (!existe) {
        // La nube no la tiene: si es nueva de la Box, se crea con su número
        if (!c.nueva) { resultado.ignorados++; continue }
        await tx.comanda.create({ data: { ...datos, id: c.id, restaurantId } as Prisma.ComandaUncheckedCreateInput })
        abiertas.set(c.id, true)
      } else if (await sePuede(c.id)) {
        if (Object.keys(datos).length) await tx.comanda.update({ where: { id: c.id }, data: datos })
      } else { resultado.ignorados++; continue }
      resultado.comandas++
    }

    for (const i of subida.items) {
      const datos = elegir(i.campos, CAMPOS_ITEM)
      const existe = await tx.comandaItem.findUnique({ where: { id: i.id }, select: { comandaId: true } })
      const destino = (datos.comandaId as number | undefined) ?? existe?.comandaId
      if (!destino || !(await sePuede(destino)) || (existe && !(await sePuede(existe.comandaId)))) { resultado.ignorados++; continue }
      if (existe) await tx.comandaItem.update({ where: { id: i.id }, data: datos })
      else if (i.nuevo) await tx.comandaItem.create({ data: { ...datos, id: i.id } as Prisma.ComandaItemUncheckedCreateInput })
      else { resultado.ignorados++; continue }
      resultado.items++
    }

    if (subida.itemsBorrados.length) {
      const { count } = await tx.comandaItem.deleteMany({
        where: { id: { in: subida.itemsBorrados }, comanda: { restaurantId, estado: { not: 'cerrada' } } },
      })
      resultado.borrados = count
    }
  }, { timeout: 30_000 })
  return resultado
}
