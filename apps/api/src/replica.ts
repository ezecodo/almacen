import { createHash } from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'

// Modo local (docs/modo-local.md): la Box de un local guarda una copia de lo que la sala necesita
// para seguir comandando sin internet. La instalación arma esa copia (armarReplica) y la Box la
// pide cada pocos segundos y la carga entera en su propia base (aplicarReplica).
//
// La copia es de UN restaurante y solo de sala: carta, alérgenos, salón, personal de sala,
// impresoras y rutas, el turno abierto y las comandas sin cerrar. Nada de administración.

// Orden de carga (el de borrado es el inverso): cada tabla después de las que referencia.
const TABLAS = [
  'restaurant', 'empresaConfig', 'ticketConfig', 'alergeno', 'menuCategoria', 'menuItem',
  'floorPlan', 'mesa', 'impresora', 'impresionRuta', 'empleado', 'turno', 'comanda', 'comandaItem', 'merma',
] as const
type Tabla = (typeof TABLAS)[number]

export interface Replica {
  restaurantId: number
  tablas: Record<Tabla, Record<string, unknown>[]>
  // Qué alérgenos lleva cada plato (relación sin modelo propio en Prisma)
  alergenosDeItems: { menuItemId: number; alergenoId: number }[]
}

// Lo que la Box crea en modo local (comandas, items, mermas) se numera desde aquí, para que
// nunca choque con un número que venga de la nube en una copia posterior.
const PRIMER_ID_LOCAL = 1_000_000_000
const NUMERADAS_EN_LOCAL = ['Comanda', 'ComandaItem', 'Merma']

export async function armarReplica(prisma: PrismaClient, restaurantId: number): Promise<Replica> {
  const deEsteLocal = { OR: [{ restaurantId }, { restaurantId: null }] }
  const [restaurant, empresaConfig, ticketConfig, alergeno, menuCategoria, items, floorPlan, impresora, empleados, turno, comandas] = await Promise.all([
    prisma.restaurant.findMany({ where: { id: restaurantId } }),
    prisma.empresaConfig.findMany(),
    prisma.ticketConfig.findMany({ where: { restaurantId } }),
    prisma.alergeno.findMany(),
    prisma.menuCategoria.findMany({ where: deEsteLocal }),
    prisma.menuItem.findMany({ where: deEsteLocal, include: { alergenos: { select: { id: true } } } }),
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
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), GREATEST(${PRIMER_ID_LOCAL}, (SELECT COALESCE(MAX(id), 0) FROM "${t}")))`)
    }
  }, { timeout: 30_000 })
}
