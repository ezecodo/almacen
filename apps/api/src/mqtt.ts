import mqtt, { MqttClient } from 'mqtt'

// Canal con el printer-server de cada restaurante (Raspberry Pi en el local).
// Cada Pi se identifica con un código propio (OIDO-XXXXXX, sale de su número de serie)
// y todo cuelga de ese código, no del restaurante:
//   pi/<codigo>/trabajo/<id>   API → Pi   ticket a imprimir
//   pi/<codigo>/estado         Pi → API   "online" / "offline" (retenido; el broker pone "offline" si la Pi se cae)
//   pi/<codigo>/impresoras     Pi → API   impresoras que la Pi encontró en la red del local (retenido)
//   pi/<codigo>/orden          API → Pi   pedidos puntuales: volver a buscar impresoras, imprimir una prueba
// Si no hay MQTT_HOST configurado (dev local sin broker a mano), no-op silencioso.

let client: MqttClient | null = null
let intentado = false

// Último estado conocido de cada Pi. Vive en memoria: al reconectar, el broker
// reenvía los mensajes retenidos de `estado` y el mapa se vuelve a llenar solo.
const estadoPi = new Map<string, { online: boolean; vistoAt: Date }>()

// Impresoras que cada Pi encontró en su red (aparatos que responden en el puerto 9100).
export type ImpresoraDetectada = { ip: string; mac: string | null }
const impresorasPi = new Map<string, { escaneadoAt: Date; impresoras: ImpresoraDetectada[] }>()

// Aviso a quien quiera reaccionar cuando una Pi informa su búsqueda (ver sincronizarImpresoras en tickets.ts)
let alDetectarImpresoras: ((codigo: string, impresoras: ImpresoraDetectada[]) => void) | null = null
export function onImpresorasDetectadas(cb: (codigo: string, impresoras: ImpresoraDetectada[]) => void) {
  alDetectarImpresoras = cb
}

function getClient(): MqttClient | null {
  if (client) return client
  if (intentado) return null
  if (!process.env.MQTT_HOST) return null

  intentado = true
  try {
    client = mqtt.connect({
      host: process.env.MQTT_HOST,
      port: Number(process.env.MQTT_PORT) || 8883,
      protocol: process.env.MQTT_USE_TLS === 'false' ? 'mqtt' : 'mqtts',
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      clientId: `almacen-api-${Math.random().toString(16).slice(2)}`,
      reconnectPeriod: 5000,
      connectTimeout: 5000,
    })
    client.on('connect', () => {
      console.log('[mqtt] conectado al broker', process.env.MQTT_HOST)
      client?.subscribe(['pi/+/estado', 'pi/+/impresoras'], { qos: 1 })
    })
    client.on('message', (topic, payload) => {
      const [, codigo, canal] = topic.split('/')
      if (!codigo) return
      if (canal === 'estado') {
        estadoPi.set(codigo, { online: payload.toString() === 'online', vistoAt: new Date() })
      } else if (canal === 'impresoras') {
        try {
          const data = JSON.parse(payload.toString()) as { escaneado_en?: string; impresoras?: { ip?: unknown; mac?: unknown }[] }
          const impresoras = (data.impresoras ?? [])
            .filter((i): i is { ip: string; mac?: unknown } => typeof i.ip === 'string')
            .map((i) => ({ ip: i.ip, mac: typeof i.mac === 'string' ? i.mac.toUpperCase() : null }))
          const fecha = data.escaneado_en ? new Date(data.escaneado_en) : new Date()
          impresorasPi.set(codigo, { escaneadoAt: isNaN(fecha.getTime()) ? new Date() : fecha, impresoras })
          alDetectarImpresoras?.(codigo, impresoras)
        } catch {
          // mensaje vacío (retenido borrado) o mal formado: se ignora
        }
      }
    })
    client.on('error', (err) => console.error('[mqtt] error:', err.message))
  } catch (err) {
    console.error('[mqtt] no se pudo inicializar el cliente:', err)
    client = null
  }

  return client
}

// Se llama al arrancar la API para empezar a escuchar el estado de las Pi sin esperar al primer ticket.
export function iniciarMqtt() {
  getClient()
}

export function brokerConfigurado(): boolean {
  return Boolean(process.env.MQTT_HOST)
}

export function estadoDePi(codigo: string): { online: boolean; vistoAt: Date } | null {
  return estadoPi.get(codigo) ?? null
}

export function impresorasDePi(codigo: string): { escaneadoAt: Date; impresoras: ImpresoraDetectada[] } | null {
  return impresorasPi.get(codigo) ?? null
}

// Pedido puntual a una Pi. Va sin garantía de entrega (qos 0) a propósito: si la Pi está
// desconectada no tiene sentido que le llegue más tarde una búsqueda o una prueba vieja.
// Devuelve false si no hay broker configurado.
export function enviarOrden(piCodigo: string, orden: { accion: 'escanear' } | { accion: 'probar'; ip: string }): boolean {
  const c = getClient()
  if (!c) return false
  c.publish(`pi/${piCodigo}/orden`, JSON.stringify(orden), { qos: 0 })
  return true
}

// Acepta el código como lo escribe una persona leyendo la etiqueta de la Pi
// ("oido-7f3a2c", "7F3A2C") y lo devuelve en su forma canónica, o null si no es válido.
export function normalizarPiCodigo(raw: string): string | null {
  const limpio = raw.trim().toUpperCase().replace(/^OIDO-?/, '')
  return /^[0-9A-F]{6}$/.test(limpio) ? `OIDO-${limpio}` : null
}

type TicketItem = { nombre: string; cantidad: number; tipo: 'Bebida' | 'Comida'; notas: string | null; nivel: number | null }

// Destino ya resuelto desde las rutas de /admin/tickets: la Pi imprime ahí, no decide nada.
export type DestinoImpresion = { impresora: string; ip: string; copias: number }

// Nunca debe tirar abajo el flujo de comandas: cualquier fallo de MQTT queda
// contenido acá adentro (broker caído, credenciales mal, lo que sea).
export function publicarTicket(piCodigo: string, ticket: {
  ticket_id: string
  sala: string
  mesa: string
  camarero: string
  pax?: number
  items: TicketItem[]
  // Por tipo de item. Un tipo sin destinos no se imprime en ningún lado.
  destinos: Record<TicketItem['tipo'], DestinoImpresion[]>
}) {
  try {
    const c = getClient()
    if (!c) return

    const payload = JSON.stringify({ ...ticket, timestamp: new Date().toISOString() })
    c.publish(`pi/${piCodigo}/trabajo/${ticket.ticket_id}`, payload, { qos: 1 }, (err) => {
      if (err) console.error('[mqtt] fallo al publicar ticket', ticket.ticket_id, err.message)
    })
  } catch (err) {
    console.error('[mqtt] error inesperado publicando ticket', ticket.ticket_id, err)
  }
}
