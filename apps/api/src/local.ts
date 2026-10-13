import { createHmac } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import https from 'https'
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

interface Enlace { codigo: string; latido_url: string; token: string }

function leerEnlace(): Enlace | null {
  try { return JSON.parse(readFileSync(ARCHIVO_ENLACE, 'utf8')) as Enlace } catch { return null }
}

// ── Sesiones que valen en la Box ───────────────────────────────────────────────
// La app instalada tiene que poder seguir contra la Box sin volver a pedir el PIN. Para eso la
// nube, al entrar un empleado, le da además un pase firmado con una clave que solo conocen esa
// instalación y esa Box (sale del secreto de la Pi). La clave de sesiones de la nube nunca viaja
// a la Box: quien se lleve una Box no puede fabricar sesiones de administración.
export const claveSesionLocal = (piSecreto: string) => createHmac('sha256', piSecreto).update('oidoops-sesion-local').digest('hex')

const b64 = (dato: string | Buffer) => Buffer.from(dato).toString('base64url')
export function firmarPaseLocal(sesion: object, piSecreto: string, horas: number): string {
  const ahora = Math.floor(Date.now() / 1000)
  const cuerpo = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify({ ...sesion, iat: ahora, exp: ahora + horas * 3600 }))}`
  return `${cuerpo}.${b64(createHmac('sha256', claveSesionLocal(piSecreto)).update(cuerpo).digest())}`
}

// Dirección de la Box dentro del local, con certificado: <código>.box.<dominio de la suite>:8443.
// El dominio sale de FRONTEND_URL (https://sensi.oidoops.ejemplo → oidoops.ejemplo). El registro
// DNS de ese nombre apunta a la IP de la Box en la red del local.
export const PUERTO_HTTPS_BOX = 8443
export function urlDeBox(piCodigo: string): string | null {
  if (process.env.BOX_URL) return process.env.BOX_URL // para probar en local, sin nombres ni certificado
  try {
    const base = process.env.BOX_DOMINIO || `box.${new URL(process.env.FRONTEND_URL ?? '').hostname.split('.').slice(1).join('.')}`
    if (!base.includes('.') || base.endsWith('.')) return null
    return `https://${piCodigo.replace(/^OIDO-/, '').toLowerCase()}.${base}:${PUERTO_HTTPS_BOX}`
  } catch {
    return null
  }
}

// En la Box, lo que se fija al arrancar a partir del enlace: con qué clave se firman las sesiones
// y qué instalación puede llamarla desde el navegador. Si el enlace aparece o cambia después
// (la Box se asigna a otro local), el proceso se cierra y systemd lo arranca con lo nuevo.
const enlaceAlArrancar = MODO_LOCAL ? leerEnlace() : null
export const claveSesionDeLaBox = () => (enlaceAlArrancar ? claveSesionLocal(enlaceAlArrancar.token) : null)
export const origenDeLaInstalacion = () => {
  try { return enlaceAlArrancar ? new URL(enlaceAlArrancar.latido_url).origin : null } catch { return null }
}

let huella: string | null = null
// Para el panel y los registros: cuándo se trajo la última copia
export const estadoReplica = { ultimaAt: null as Date | null, error: null as string | null }

async function traerCopia(prisma: PrismaClient) {
  const enlace = JSON.parse(await readFile(ARCHIVO_ENLACE, 'utf8')) as Enlace
  if (enlace.token !== enlaceAlArrancar?.token || enlace.latido_url !== enlaceAlArrancar?.latido_url) {
    console.log('[local] cambió el enlace con la instalación: se reinicia para tomarlo')
    process.exit(0)
  }
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

// ── HTTPS ──────────────────────────────────────────────────────────────────────
// Una página con candado (la app instalada, que vive en la nube) solo puede llamar a sitios con
// candado. Si la Box tiene el certificado de su nombre, atiende también por HTTPS lo mismo que
// por HTTP. El certificado lo consigue la nube y se copia aquí (ver docs/modo-local.md).
export function servirHttps(app: FastifyInstance) {
  const carpeta = process.env.CERT_DIR || path.join(process.cwd(), '../../cert')
  const cert = path.join(carpeta, 'fullchain.pem')
  const key = path.join(carpeta, 'privkey.pem')
  if (!existsSync(cert) || !existsSync(key)) {
    console.log(`[local] sin certificado en ${carpeta}: la Box atiende solo por HTTP`)
    return
  }
  https
    .createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => app.routing(req, res))
    .listen(PUERTO_HTTPS_BOX, '0.0.0.0', () => console.log(`[local] HTTPS en el puerto ${PUERTO_HTTPS_BOX}`))
}
