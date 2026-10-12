import { randomBytes } from 'crypto'
import { prisma } from './server'
import { estadoDePi, impresorasDePi, volverAPreguntar } from './mqtt'
import { anunciarLatido } from './routes/red'
import { sincronizarImpresoras } from './routes/tickets'

// Sincronización con el back-office de Oído (HQ), cada minuto y al crear o renombrar un restaurante:
//   → le informa los restaurantes de esta instalación, para que aparezcan solos en HQ
//   ← recibe qué Pi tiene asignada cada uno, y la deja vinculada (o la desvincula)
// HQ es quien manda sobre las Pi: se asignan allí, no en el panel de cada cliente.
// Sin HQ_URL (desarrollo en local) no hace nada, y si HQ no responde no se toca nada.

const HQ_URL = process.env.HQ_URL
const SUITE_TOKEN = process.env.SUITE_TOKEN
const INSTALACION_CODIGO = process.env.INSTALACION_CODIGO
export const enlazadaConHQ = Boolean(HQ_URL && SUITE_TOKEN && INSTALACION_CODIGO)

let enCurso = false

export async function sincronizarConHQ() {
  if (!enlazadaConHQ || enCurso) return
  enCurso = true
  try {
    const restaurantes = await prisma.restaurant.findMany({ select: { id: true, nombre: true, piCodigo: true } })
    const res = await fetch(`${HQ_URL}/api/interno/locales`, {
      method: 'POST',
      headers: { 'X-Suite-Token': SUITE_TOKEN as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente: INSTALACION_CODIGO, restaurantes: restaurantes.map(r => ({ id: r.id, nombre: r.nombre })) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HQ respondió ${res.status}`)
    const { locales } = (await res.json()) as { locales: { restaurantId: number; piCodigo: string | null }[] }
    const deseada = new Map(locales.map(l => [l.restaurantId, l.piCodigo]))

    // Solo los que cambian. Primero se sueltan las Pi (el código es único: una Pi que pasa de un
    // restaurante a otro tiene que quedar libre antes de asignarse).
    const cambios = restaurantes.filter(r => deseada.has(r.id) && deseada.get(r.id) !== r.piCodigo)
    for (const r of cambios) {
      if (!r.piCodigo) continue
      await prisma.restaurant.update({ where: { id: r.id }, data: { piCodigo: null, piSecreto: null } })
      // No se le borra la config a la Pi: si pasó a otro cliente, su instalación le publica la suya,
      // y borrarla desde acá podría llegar después y pisársela.
      console.log(`[hq] Pi ${r.piCodigo} desvinculada de ${r.nombre}`)
    }
    for (const r of cambios) {
      const codigo = deseada.get(r.id)
      if (!codigo) continue
      await prisma.restaurant.update({ where: { id: r.id }, data: { piCodigo: codigo, piSecreto: randomBytes(24).toString('hex') } })
      await anunciarLatido(r.id)
      await sincronizarImpresoras(codigo, impresorasDePi(codigo)?.impresoras ?? [])
      console.log(`[hq] Pi ${codigo} vinculada a ${r.nombre}`)
    }

    // Una Pi recién asignada de la que todavía no se sabe nada: el permiso en el canal llega por otro
    // camino (hasta un minuto después), así que se insiste hasta tener su estado — se vuelve a
    // preguntar por ella y se le repite a dónde mandar el latido, que la primera vez pudo no pasar.
    const sinNoticias = await prisma.restaurant.findMany({ where: { piCodigo: { not: null } }, select: { id: true, piCodigo: true } })
    const pendientes = sinNoticias.filter(r => !estadoDePi(r.piCodigo as string))
    for (const r of pendientes) {
      volverAPreguntar(r.piCodigo as string)
      await anunciarLatido(r.id)
    }
  } catch (err) {
    console.error('[hq] no se pudo sincronizar con el back-office:', (err as Error).message)
  } finally {
    enCurso = false
  }
}

export function iniciarSyncHQ() {
  if (!enlazadaConHQ) return
  setTimeout(sincronizarConHQ, 5_000)
  setInterval(sincronizarConHQ, 60_000)
}
