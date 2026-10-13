import { readFile } from 'fs/promises'
import { PrismaClient } from '@prisma/client'
import { aplicarReplica, Replica } from './replica'

// Este mismo código corre también dentro de la Box de cada local, en "modo local" (MODO_LOCAL=1),
// para que la sala siga comandando cuando se cae internet. Ver docs/modo-local.md.
export const MODO_LOCAL = process.env.MODO_LOCAL === '1'

// El servicio de impresión de la Box (printer-server) deja aquí a qué instalación pertenece y
// con qué secreto se identifica: { codigo, latido_url, token }. Lo recibe por MQTT al vincularla.
const ARCHIVO_ENLACE = process.env.ENLACE_BOX || '/home/oido/printer-server/enlace.json'
const CADA_MS = 15_000

let huella: string | null = null
// Para el panel y los registros: cuándo se trajo la última copia
export const estadoReplica = { ultimaAt: null as Date | null, error: null as string | null }

async function traerCopia(prisma: PrismaClient) {
  const enlace = JSON.parse(await readFile(ARCHIVO_ENLACE, 'utf8')) as { codigo: string; latido_url: string; token: string }
  const url = enlace.latido_url.replace(/\/pi\/latido$/, '/pi/replica')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: enlace.codigo, token: enlace.token, huella }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`la instalación respondió ${res.status}`)
  const data = (await res.json()) as { huella: string; replica?: Replica }
  if (data.replica) {
    await aplicarReplica(prisma, data.replica)
    huella = data.huella
    console.log(`[local] copia de la sala actualizada (${data.replica.tablas.menuItem.length} platos, ${data.replica.tablas.comanda.length} comandas abiertas)`)
  }
  estadoReplica.ultimaAt = new Date()
  estadoReplica.error = null
}

export function iniciarReplicaLocal(prisma: PrismaClient) {
  const ciclo = async () => {
    try {
      await traerCopia(prisma)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      // Sin internet esto falla cada vez: se avisa una sola vez por racha
      if (estadoReplica.error !== motivo) console.warn('[local] no se pudo traer la copia de la sala:', motivo)
      estadoReplica.error = motivo
    }
    setTimeout(ciclo, CADA_MS)
  }
  void ciclo()
}
