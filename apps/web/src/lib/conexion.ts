// ¿La app llega al servidor? Lo usa la sala para avisar con una pantalla clara en vez de dejar
// que cada botón falle por su cuenta (etapa 0 del modo local, ver docs/modo-local.md).
//
// Un fallo suelto no cuenta: se da por caída tras FALLOS_PARA_CAER intentos seguidos sin respuesta.
// Las llamadas normales de la app (api.ts) avisan de cada respuesta o fallo; mientras la sala está
// abierta, además, se pregunta sola cada poco, porque un móvil con WiFi pero sin internet sigue
// diciendo que está "en línea" y una petición colgada puede tardar mucho en fallar.

const FALLOS_PARA_CAER = 3
const CADA_MS = 10_000        // con todo bien
const CADA_DUDA_MS = 3_000    // tras un fallo, y mientras dura la caída
const ESPERA_MS = 5_000       // cuánto se espera la respuesta antes de darla por perdida

export interface Conexion {
  caida: boolean
  desde: number | null // cuándo falló el primer intento de esta caída
}

let estado: Conexion = { caida: false, desde: null }
let fallos = 0
let primerFallo: number | null = null
let vigilantes = 0
let reloj: ReturnType<typeof setTimeout> | null = null
let preguntando = false
const oyentes = new Set<() => void>()
const alVolver = new Set<() => void>()

function publicar(nuevo: Conexion) {
  estado = nuevo
  oyentes.forEach(f => f())
}

export function respuestaRecibida() {
  fallos = 0
  primerFallo = null
  if (!estado.caida) return
  publicar({ caida: false, desde: null })
  alVolver.forEach(f => f())
}

export function sinRespuesta() {
  fallos += 1
  primerFallo ??= Date.now()
  if (!estado.caida && fallos >= FALLOS_PARA_CAER) publicar({ caida: true, desde: primerFallo })
  if (vigilantes > 0) programar(CADA_DUDA_MS)
}

// fetch que deja anotado si el servidor contestó. Un 502/503/504 es Nginx diciendo que la API
// no está: para quien tiene la app en la mano es lo mismo que no tener conexión.
export async function pedir(url: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    sinRespuesta()
    throw e
  }
  if (res.status >= 502 && res.status <= 504) sinRespuesta()
  else respuestaRecibida()
  return res
}

async function preguntar() {
  if (preguntando) return
  preguntando = true
  const corte = new AbortController()
  const limite = setTimeout(() => corte.abort(), ESPERA_MS)
  try {
    const res = await fetch('/api/instalacion', { cache: 'no-store', signal: corte.signal })
    if (res.ok) respuestaRecibida()
    else sinRespuesta()
  } catch {
    sinRespuesta()
  } finally {
    clearTimeout(limite)
    preguntando = false
  }
}

function programar(ms: number) {
  if (reloj) clearTimeout(reloj)
  reloj = setTimeout(async () => {
    reloj = null
    if (vigilantes === 0) return
    // Con la app en segundo plano no se pregunta: al volver a primer plano se pregunta enseguida
    if (document.visibilityState === 'visible') await preguntar()
    if (vigilantes > 0 && !reloj) programar(fallos > 0 ? CADA_DUDA_MS : CADA_MS)
  }, ms)
}

export function reintentarAhora() {
  programar(0)
}

// Enciende la vigilancia mientras haya una pantalla que la necesite. Devuelve cómo apagarla.
export function vigilarConexion(): () => void {
  vigilantes += 1
  if (vigilantes === 1) {
    programar(0)
    window.addEventListener('offline', reintentarAhora)
    window.addEventListener('online', reintentarAhora)
    document.addEventListener('visibilitychange', reintentarAhora)
  }
  return () => {
    vigilantes -= 1
    if (vigilantes > 0) return
    if (reloj) clearTimeout(reloj)
    reloj = null
    window.removeEventListener('offline', reintentarAhora)
    window.removeEventListener('online', reintentarAhora)
    document.removeEventListener('visibilitychange', reintentarAhora)
  }
}

export function suscribirConexion(f: () => void): () => void {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

export const conexionActual = () => estado

export function alVolverLaConexion(f: () => void): () => void {
  alVolver.add(f)
  return () => { alVolver.delete(f) }
}
