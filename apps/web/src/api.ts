const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export interface Restaurante {
  id: number
  nombre: string
}

export interface Empleado {
  id: number
  nombre: string
  pin: string
  activo: boolean
}

export interface ProductoLookup {
  barcode: string
  nombre: string
  encontrado: boolean
}

export interface RetiroItem {
  barcode: string
  nombre: string
  cantidad: number
  unidad: 'kg' | 'ud' | 'l' | 'g'
}

export interface RetiroCreado {
  id: number
  createdAt: string
  empleadoId: number
  restaurantId: number
  items: RetiroItem[]
}

export interface RetiroFiltros {
  restaurantId?: number
  empleadoId?: number
  desde?: string
  hasta?: string
  page?: number
  limit?: number
}

export interface RetiroResumen {
  id: number
  createdAt: string
  empleado: { id: number; nombre: string }
  restaurant: { id: number; nombre: string }
  items: RetiroItem[]
}

export interface RetirosResponse {
  retiros: RetiroResumen[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface Producto {
  id: number
  barcode: string
  nombre: string
  unidad: 'kg' | 'ud' | 'l' | 'g'
  createdAt: string
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  restaurantes: {
    list: () => get<Restaurante[]>('/restaurantes'),
  },
  empleados: {
    list:   () => get<Empleado[]>('/empleados'),
    auth:   (pin: string) => post<Empleado>('/empleados/auth', { pin }),
    create: (body: { nombre: string; pin: string }) => post<Empleado>('/empleados', body),
    update: (id: number, body: { nombre?: string; pin?: string; activo?: boolean }) =>
      put<Empleado>(`/empleados/${id}`, body),
    delete: (id: number) => del(`/empleados/${id}`),
  },
  productos: {
    lookup: (barcode: string) => get<ProductoLookup>(`/producto/${barcode}`),
    list:   () => get<Producto[]>('/productos'),
    create: (body: { barcode: string; nombre: string; unidad: Producto['unidad'] }) =>
      post<Producto>('/productos', body),
    update: (barcode: string, body: { nombre?: string; unidad?: Producto['unidad'] }) =>
      put<Producto>(`/productos/${barcode}`, body),
    delete: (barcode: string) => del(`/productos/${barcode}`),
  },
  retiros: {
    create: (body: {
      empleadoId: number
      restaurantId: number
      items: RetiroItem[]
    }) => post<RetiroCreado>('/retiros', body),
    list: (filtros?: RetiroFiltros) => {
      const params = new URLSearchParams()
      if (filtros?.restaurantId) params.set('restaurantId', String(filtros.restaurantId))
      if (filtros?.empleadoId) params.set('empleadoId', String(filtros.empleadoId))
      if (filtros?.desde) params.set('desde', filtros.desde)
      if (filtros?.hasta) params.set('hasta', filtros.hasta)
      if (filtros?.page) params.set('page', String(filtros.page))
      if (filtros?.limit) params.set('limit', String(filtros.limit))
      const qs = params.toString()
      return get<RetirosResponse>(`/retiros${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => get<RetiroResumen>(`/retiros/${id}`),
  },
  reviews: {
    list: () => get<{ restaurantId: number; nombre: string; total: number | null; rating: number | null; diff: number | null; fecha: string | null }[]>('/reviews'),
    sync: () => post<{ synced: number }>('/reviews/sync', {}),
  },
  stats: {
    retirosPorDia: (dias = 30) => get<{ fecha: string; total: number }[]>(`/stats/retiros-por-dia?dias=${dias}`),
    retirosPorRestaurante: (mes?: string) => get<{ restaurantId: number; nombre: string; total: number }[]>(`/stats/retiros-por-restaurante${mes ? `?mes=${mes}` : ''}`),
    productosTop: (limit = 10, dias = 30) => get<{ nombre: string; totalCantidad: number; vecesRetirado: number }[]>(`/stats/productos-top?limit=${limit}&dias=${dias}`),
    actividadEmpleados: (mes?: string) => get<{ empleadoId: number; nombre: string; total: number }[]>(`/stats/actividad-empleados${mes ? `?mes=${mes}` : ''}`),
  },
}
