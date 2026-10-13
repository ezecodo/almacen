import { readFile } from 'fs/promises'
import path from 'path'
import { FastifyInstance } from 'fastify'
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

// ── Impresión directa ──────────────────────────────────────────────────────────
// En la nube un ticket viaja por MQTT hasta la Box. Aquí ya estamos en la Box: se le entrega al
// servicio de impresión, que escucha en esta misma máquina (ver printer-server, _servidor_local).
const IMPRESION_URL = process.env.IMPRESION_LOCAL_URL || 'http://127.0.0.1:9101/trabajo'

export async function imprimirEnLaBox(ticket: object) {
  const res = await fetch(IMPRESION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`el servicio de impresión respondió ${res.status}`)
}

// ── Web de sala ────────────────────────────────────────────────────────────────
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
}

// Sirve el build de la web (el mismo de la nube). Cualquier dirección que no sea un archivo
// devuelve la app, que es quien resuelve la ruta; la raíz va directa a la sala.
export function servirWeb(app: FastifyInstance) {
  const raiz = path.resolve(process.env.WEB_DIST || path.join(process.cwd(), '../web/dist'))
  app.setNotFoundHandler(async (req, reply) => {
    const ruta = decodeURIComponent(req.url.split('?')[0])
    if (req.method !== 'GET' || ruta.startsWith('/api/')) return reply.status(404).send({ error: 'No encontrado' })
    if (ruta === '/') return reply.redirect('/sala')
    const archivo = path.join(raiz, path.normalize(ruta))
    const esArchivo = archivo.startsWith(raiz + path.sep) && path.extname(archivo) !== ''
    try {
      const contenido = await readFile(esArchivo ? archivo : path.join(raiz, 'index.html'))
      const ext = esArchivo ? path.extname(archivo) : '.html'
      // Los archivos de /assets llevan su huella en el nombre: se pueden guardar para siempre
      reply.header('Cache-Control', ruta.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
      return reply.type(TIPOS[ext] ?? 'application/octet-stream').send(contenido)
    } catch {
      return reply.status(404).send({ error: 'No encontrado' })
    }
  })
}
