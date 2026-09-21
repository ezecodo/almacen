import mqtt, { MqttClient } from 'mqtt'

// Publica tickets al printer-server de cada restaurante (Raspberry Pi en el local).
// Si no hay MQTT_HOST configurado (dev local sin broker a mano), no-op silencioso.

let client: MqttClient | null = null
let intentado = false

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
    client.on('connect', () => console.log('[mqtt] conectado al broker', process.env.MQTT_HOST))
    client.on('error', (err) => console.error('[mqtt] error:', err.message))
  } catch (err) {
    console.error('[mqtt] no se pudo inicializar el cliente:', err)
    client = null
  }

  return client
}

type TicketItem = { nombre: string; cantidad: number; tipo: 'Bebida' | 'Comida'; notas: string | null; nivel: number | null }

// Nunca debe tirar abajo el flujo de comandas: cualquier fallo de MQTT queda
// contenido acá adentro (broker caído, credenciales mal, lo que sea).
export function publicarTicket(restauranteId: string, ticket: {
  ticket_id: string
  zona: 'PB' | 'PA'
  mesa: string
  camarero: string
  pax?: number
  items: TicketItem[]
}) {
  try {
    const c = getClient()
    if (!c) return

    const payload = JSON.stringify({ ...ticket, timestamp: new Date().toISOString() })
    c.publish(`restaurante/${restauranteId}/ticket/${ticket.ticket_id}`, payload, { qos: 1 }, (err) => {
      if (err) console.error('[mqtt] fallo al publicar ticket', ticket.ticket_id, err.message)
    })
  } catch (err) {
    console.error('[mqtt] error inesperado publicando ticket', ticket.ticket_id, err)
  }
}
