// Mapa de clientes SSE por restaurantId
const clients = new Map<number, Set<(data: string) => void>>()

// Canal global — recibe todos los eventos de todos los restaurantes (usado por admin)
const globalClients = new Set<(data: string) => void>()

export function subscribe(restaurantId: number, send: (data: string) => void) {
  if (!clients.has(restaurantId)) clients.set(restaurantId, new Set())
  clients.get(restaurantId)!.add(send)
}

export function unsubscribe(restaurantId: number, send: (data: string) => void) {
  clients.get(restaurantId)?.delete(send)
}

export function subscribeGlobal(send: (data: string) => void) {
  globalClients.add(send)
}

export function unsubscribeGlobal(send: (data: string) => void) {
  globalClients.delete(send)
}

export function broadcast(restaurantId: number, type: string) {
  const msg = `data: ${JSON.stringify({ type, restaurantId })}\n\n`
  clients.get(restaurantId)?.forEach(send => { try { send(msg) } catch {} })
  globalClients.forEach(send => { try { send(msg) } catch {} })
}
