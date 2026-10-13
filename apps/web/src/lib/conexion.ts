// ¿A dónde llegan las llamadas de la sala? Normalmente a la nube. Si la nube deja de contestar y
// el local tiene una Oído Box, la app sigue contra la Box (modo local) sin cambiar de pantalla.
// Si tampoco hay Box, se avisa con una pantalla clara. Ver docs/modo-local.md.
//
// Un fallo suelto no cuenta: se da por caída tras FALLOS_PARA_CAER intentos seguidos sin respuesta.
// Las llamadas normales de la app (api.ts) avisan de cada respuesta o fallo; mientras la sala está
// abierta, además, se pregunta sola cada poco, porque un móvil con WiFi pero sin internet sigue
// diciendo que está "en línea" y una petición colgada puede tardar mucho en fallar.

const FALLOS_PARA_CAER = 3
const ACIERTOS_PARA_VOLVER = 2 // respuestas seguidas de la nube antes de dejar el modo local
const CADA_MS = 10_000         // con todo bien
const CADA_DUDA_MS = 3_000     // tras un fallo, y mientras dura la caída
const ESPERA_MS = 5_000        // cuánto se espera la respuesta antes de darla por perdida
const SALUDO_BOX_MS = 4 * 60_000 // cada cuánto se saluda a la Box con internet (ver saludarBox)

const CLAVE_BOX = 'oidoops_box'

export interface Conexion {
  caida: boolean       // ni la nube ni la Box contestan
  local: boolean       // se está trabajando contra la Box
  desde: number | null // cuándo falló el primer intento de esta caída
}

let estado: Conexion = { caida: false, local: false, desde: null }
let fallos = 0       // del destino actual (nube, o Box en modo local)
let aciertosNube = 0 // solo en modo local: la nube volvió a contestar
let primerFallo: number | null = null
let vigilantes = 0
let reloj: ReturnType<typeof setTimeout> | null = null
let preguntando = false
let ultimoSaludo = 0
const oyentes = new Set<() => void>()
const alCambiar = new Set<() => void>()

// Dirección de la Box del local (https://<código>.box.<dominio>:8443). La da la nube al entrar con
// el PIN y se guarda en el dispositivo para poder usarla cuando la nube ya no contesta.
export function guardarBox(url: string | null) {
  try {
    if (url) localStorage.setItem(CLAVE_BOX, url)
  } catch { /* sin almacenamiento: no hay modo local en este dispositivo */ }
}
function boxGuardada(): string | null {
  try { return localStorage.getItem(CLAVE_BOX) } catch { return null }
}

// Para probar y enseñar el modo local sin desenchufar nada: abrir la sala con ?corte=1 hace que este
// dispositivo se comporte como si la nube no contestara (con ?corte=0 se quita). Solo afecta a este
// dispositivo y dura hasta cerrar la pestaña; el aviso de modo local lo dice ("corte simulado").
const CLAVE_CORTE = 'oidoops_corte_simulado'
try {
  const pedido = new URLSearchParams(location.search).get('corte')
  if (pedido === '1') sessionStorage.setItem(CLAVE_CORTE, '1')
  if (pedido === '0') sessionStorage.removeItem(CLAVE_CORTE)
} catch { /* sin almacenamiento no hay simulación */ }
export function corteSimulado(): boolean {
  try { return sessionStorage.getItem(CLAVE_CORTE) === '1' } catch { return false }
}

// Base de todas las llamadas a la API: la nube (misma dirección que la app) o la Box
export const baseApi = () => (estado.local ? `${boxGuardada()}/api` : '/api')
export const enModoLocal = () => estado.local

function publicar(nuevo: Conexion) {
  const cambioDestino = nuevo.local !== estado.local || (estado.caida && !nuevo.caida)
  estado = nuevo
  oyentes.forEach(f => f())
  if (cambioDestino) alCambiar.forEach(f => f())
}

async function contesta(url: string, hacePropia: (cuerpo: { ok?: boolean; local?: boolean }) => boolean): Promise<boolean> {
  const corte = new AbortController()
  const limite = setTimeout(() => corte.abort(), ESPERA_MS)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: corte.signal })
    return res.ok && hacePropia(await res.json())
  } catch {
    return false
  } finally {
    clearTimeout(limite)
  }
}
// La nube: la instalación de siempre, en la misma dirección que la app
const contestaNube = async () => !corteSimulado() && contesta('/api/instalacion', c => c.ok === true && c.local !== true)
// La Box: tiene que decir que es una Box (en esa dirección podría contestar otra cosa)
const contestaBox = (url: string) => contesta(`${url}/api/instalacion`, c => c.ok === true && c.local === true)

// Con internet, saludar a la Box de vez en cuando hace tres cosas: el teléfono recuerda dónde está
// su nombre (sin internet no podría preguntarlo), Chrome pide ya el permiso de "dispositivos de tu
// red" y no en mitad de un corte, y se sabe si la Box está al alcance.
function saludarBox() {
  const url = boxGuardada()
  if (!url || Date.now() - ultimoSaludo < SALUDO_BOX_MS) return
  ultimoSaludo = Date.now()
  void contestaBox(url)
}

export function respuestaRecibida() {
  fallos = 0
  primerFallo = null
  if (estado.caida) publicar({ caida: false, local: estado.local, desde: null })
}

export function sinRespuesta() {
  fallos += 1
  primerFallo ??= Date.now()
  if (vigilantes > 0) programar(fallos >= FALLOS_PARA_CAER ? 0 : CADA_DUDA_MS)
  else if (!estado.caida && fallos >= FALLOS_PARA_CAER) publicar({ caida: true, local: false, desde: primerFallo })
}

// fetch que deja anotado si el servidor contestó. Un 502/503/504 es Nginx diciendo que la API
// no está: para quien tiene la app en la mano es lo mismo que no tener conexión.
export async function pedir(url: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    if (corteSimulado() && !estado.local) throw new TypeError('corte simulado')
    res = await fetch(url, init)
  } catch (e) {
    sinRespuesta()
    throw e
  }
  if (res.status >= 502 && res.status <= 504) sinRespuesta()
  else respuestaRecibida()
  return res
}

// Una vuelta de vigilancia: se pregunta a la nube y, si hace falta, a la Box, y se decide dónde estar
async function revisar() {
  if (preguntando) return
  preguntando = true
  try {
    const nube = await contestaNube()
    const box = boxGuardada()

    if (estado.local) {
      // Trabajando contra la Box: se vuelve a la nube cuando contesta de forma sostenida
      aciertosNube = nube ? aciertosNube + 1 : 0
      if (aciertosNube >= ACIERTOS_PARA_VOLVER) {
        fallos = 0; primerFallo = null; aciertosNube = 0
        publicar({ caida: false, local: false, desde: null })
      } else if (fallos >= FALLOS_PARA_CAER && !(box && (await contestaBox(box)))) {
        // La Box tampoco contesta ya
        publicar({ caida: true, local: false, desde: primerFallo })
      }
      return
    }

    if (nube) {
      respuestaRecibida()
      saludarBox()
      return
    }
    fallos += 1
    primerFallo ??= Date.now()
    if (fallos < FALLOS_PARA_CAER) return
    if (box && (await contestaBox(box))) {
      fallos = 0; aciertosNube = 0
      publicar({ caida: false, local: true, desde: primerFallo })
    } else if (!estado.caida) {
      publicar({ caida: true, local: false, desde: primerFallo })
    }
  } finally {
    preguntando = false
  }
}

function programar(ms: number) {
  if (reloj) clearTimeout(reloj)
  reloj = setTimeout(async () => {
    reloj = null
    if (vigilantes === 0) return
    // Con la app en segundo plano no se pregunta: al volver a primer plano se pregunta enseguida
    if (document.visibilityState === 'visible') await revisar()
    if (vigilantes > 0 && !reloj) programar(fallos > 0 || estado.caida || estado.local ? CADA_DUDA_MS : CADA_MS)
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

// Cambió a dónde se habla (nube ↔ Box) o volvió la conexión: lo que hay en pantalla puede estar viejo
export function alCambiarDeDestino(f: () => void): () => void {
  alCambiar.add(f)
  return () => { alCambiar.delete(f) }
}
