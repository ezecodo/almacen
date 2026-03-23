// Mapa de clientes SSE por restaurantId
const clients = new Map<number, Set<(data: string) => void>>()

export function subscribe(restaurantId: number, send: (data: string) => void) {
  if (!clients.has(restaurantId)) clients.set(restaurantId, new Set())
  clients.get(restaurantId)!.add(send)
}

export function unsubscribe(restaurantId: number, send: (data: string) => void) {
  clients.get(restaurantId)?.delete(send)
}

export function broadcast(restaurantId: number, type: string) {
  const subs = clients.get(restaurantId)
  if (!subs?.size) return
  const msg = `data: ${JSON.stringify({ type })}\n\n`
  subs.forEach(send => send(msg))
}
