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
  tipo: 'cocina' | 'sala'
  pin?: string | null
  telefono?: string | null
  activo: boolean
}

export interface PropinaTurno {
  empleadoId: number
  horas: number
  propina: number
  empleado: { id: number; nombre: string; tipo: string }
}

export interface PropinaDia {
  id: number
  restaurantId: number
  restaurant: { id: number; nombre: string }
  fecha: string
  efectivo: number
  tarjeta: number
  total: number
  turnos: PropinaTurno[]
  createdAt: string
}

export interface PropinasResponse {
  propinas: PropinaDia[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface MiTurno {
  id: number
  fecha: string
  restaurante: string
  horas: number
  propina: number
  efectivo: number
  tarjeta: number
  totalDia: number
}

export interface ResumenEmpleado {
  empleadoId: number
  nombre: string
  tipo: string
  totalPropina: number
  totalHoras: number
  turnos: number
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
  confirmadoAt?: string | null
  confirmadoPor?: string | null
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

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
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

export interface MenuCategoria {
  id: number
  restaurantId: number
  grupo: string
  nombre: string
  icono: string
  orden: number
  itemCount: number
}

export interface MenuItem {
  id: number
  restaurantId: number
  categoria: string
  nombre: string
  descripcion: string
  precio: number
  activo: boolean
  orden: number
}

export interface Mesa {
  id:         number
  floorPlanId: number
  numero:     number
  tipo:       'round' | 'square' | 'rectangular' | 'barra' | 'silla_alta'
  x:          number
  y:          number
  capacidad:  number
  rotacion:   number
  ancho?:     number
  alto?:      number
}

export interface FloorPlan {
  id:           number
  restaurantId: number
  nombre:       string
  mesas:        Mesa[]
}

export interface ComandaItem {
  id:        number
  comandaId: number
  tipo:      'cocina' | 'barra'
  nombre:    string
  precio:    number
  cantidad:  number
  nota:      string
  nivel:     number | null
  ronda:     number  // 0=pendiente, 1=comanda original, 2+=marcha pasa
}

export interface ComandaMerma {
  id:            number
  itemNombre:    string
  cantidad:      number
  motivo:        MermaMotivo
  descripcion:   string | null
  camareroNombre: string | null
}

export interface Comanda {
  id:             number
  restaurantId:   number
  mesaId:         number
  mesa:           Mesa
  pax:            number
  estado:         'abierta' | 'enviada' | 'facturada' | 'liberada' | 'cerrada'
  metodoPago:     'cash' | 'tarjeta' | null
  camareroNombre: string | null
  items:          ComandaItem[]
  mermas:         ComandaMerma[]
  createdAt:      string
  closedAt:       string | null
}

export type MermaMotivo = 'no_servido' | 'queja_cliente' | 'otro'

export interface Merma {
  id:             number
  restaurantId:   number
  mesaNumero:     number | null
  planNombre:     string | null
  comandaId:      number | null
  itemNombre:     string
  cantidad:       number
  camareroNombre: string | null
  motivo:         MermaMotivo
  descripcion:    string | null
  createdAt:      string
}

export interface MermasResponse {
  mermas: Merma[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export const api = {
  restaurantes: {
    list: () => get<Restaurante[]>('/restaurantes'),
  },
  empleados: {
    list:   (tipo?: 'cocina' | 'sala') => get<Empleado[]>(`/empleados${tipo ? `?tipo=${tipo}` : ''}`),
    auth:   (pin: string) => post<Empleado>('/empleados/auth', { pin }),
    create: (body: { nombre: string; tipo: 'cocina' | 'sala'; pin?: string }) => post<Empleado>('/empleados', body),
    update: (id: number, body: { nombre?: string; tipo?: string; pin?: string; telefono?: string | null; activo?: boolean }) =>
      put<Empleado>(`/empleados/${id}`, body),
    desactivar: (id: number) => patch<Empleado>(`/empleados/${id}/desactivar`, {}),
    delete: (id: number) => del(`/empleados/${id}`),
  },
  propinas: {
    list: (filtros?: { restaurantId?: number; desde?: string; hasta?: string; page?: number }) => {
      const params = new URLSearchParams()
      if (filtros?.restaurantId) params.set('restaurantId', String(filtros.restaurantId))
      if (filtros?.desde) params.set('desde', filtros.desde)
      if (filtros?.hasta) params.set('hasta', filtros.hasta)
      if (filtros?.page) params.set('page', String(filtros.page))
      const qs = params.toString()
      return get<PropinasResponse>(`/propinas${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => get<PropinaDia>(`/propinas/${id}`),
    create: (body: {
      restaurantId: number
      fecha: string
      efectivo: number
      tarjeta: number
      turnos: { empleadoId: number; horas: number }[]
    }) => post<PropinaDia>('/propinas', body),
    delete: (id: number) => del(`/propinas/${id}`),
    misTurnos: (empleadoId: number, desde?: string, hasta?: string) => {
      const params = new URLSearchParams({ empleadoId: String(empleadoId) })
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      return get<MiTurno[]>(`/propinas/mis-turnos?${params.toString()}`)
    },
    resumenEmpleados: (mes?: string, restaurantId?: number) => {
      const params = new URLSearchParams()
      if (mes) params.set('mes', mes)
      if (restaurantId) params.set('restaurantId', String(restaurantId))
      const qs = params.toString()
      return get<ResumenEmpleado[]>(`/propinas/resumen/empleados${qs ? `?${qs}` : ''}`)
    },
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
    confirmar: (id: number, confirmadoPor: string) =>
      patch<RetiroResumen>(`/retiros/${id}/confirmar`, { confirmadoPor }),
    delete: (id: number) => del(`/retiros/${id}`),
  },
  menuCategorias: {
    list:   (restaurantId: number) => get<MenuCategoria[]>(`/menu/categorias?restaurantId=${restaurantId}`),
    create: (body: { restaurantId: number; grupo?: string; nombre: string; icono?: string; orden?: number }) =>
      post<MenuCategoria>('/menu/categorias', body),
    update: (id: number, body: Partial<{ grupo: string; nombre: string; icono: string; orden: number }>) =>
      put<MenuCategoria>(`/menu/categorias/${id}`, body),
    delete: (id: number) => del(`/menu/categorias/${id}`),
  },
  menu: {
    list:   (restaurantId: number, categoria?: string) =>
      get<MenuItem[]>(`/menu?restaurantId=${restaurantId}${categoria ? `&categoria=${encodeURIComponent(categoria)}` : ''}`),
    create: (body: Omit<MenuItem, 'id' | 'activo'>) => post<MenuItem>('/menu', body),
    update: (id: number, body: Partial<Omit<MenuItem, 'id' | 'restaurantId' | 'activo'>>) => put<MenuItem>(`/menu/${id}`, body),
    toggle: (id: number) => patch<MenuItem>(`/menu/${id}/toggle`, {}),
    delete: (id: number) => del(`/menu/${id}`),
  },
  reviews: {
    list: () => get<{ restaurantId: number; nombre: string; total: number | null; rating: number | null; diff: number | null; fecha: string | null }[]>('/reviews'),
    sync: () => post<{ synced: number }>('/reviews/sync', {}),
  },
  comandas: {
    list:      (restaurantId: number, estado?: string) =>
      get<Comanda[]>(`/comandas?restaurantId=${restaurantId}${estado ? `&estado=${estado}` : ''}`),
    abrir:     (restaurantId: number, mesaId: number, pax: number, camareroNombre?: string) =>
      post<Comanda>('/comandas', { restaurantId, mesaId, pax, camareroNombre }),
    get:       (id: number) => get<Comanda>(`/comandas/${id}`),
    addItem:   (id: number, item: { nombre: string; precio: number; cantidad: number; nota?: string; tipo?: 'cocina' | 'barra' }) =>
      post<ComandaItem>(`/comandas/${id}/items`, item),
    updateItem:(id: number, itemId: number, data: { cantidad?: number; nota?: string }) =>
      patch<ComandaItem>(`/comandas/${id}/items/${itemId}`, data),
    deleteItem:(id: number, itemId: number) => del(`/comandas/${id}/items/${itemId}`),
    enviar:    (id: number, niveles: { itemId: number; nivel: number; nota?: string }[]) =>
      patch<Comanda>(`/comandas/${id}/enviar`, { niveles }),
    facturar:  (id: number) => patch<Comanda>(`/comandas/${id}/facturar`, {}),
    liberar:   (id: number) => patch<Comanda>(`/comandas/${id}/liberar`, {}),
    cerrar:    (id: number, metodoPago: 'cash' | 'tarjeta') =>
      patch<Comanda>(`/comandas/${id}/cerrar`, { metodoPago }),
    moverMesa: (id: number, mesaId: number) =>
      patch<Comanda>(`/comandas/${id}/mover-mesa`, { mesaId }),
    merge:     (sourceId: number, targetId: number, itemIds?: number[]) =>
      post<Comanda>('/comandas/merge', { sourceId, targetId, itemIds }),
  },
  salon: {
    list:   (restaurantId: number) => get<FloorPlan[]>(`/salon?restaurantId=${restaurantId}`),
    create: (restaurantId: number, nombre: string) => post<FloorPlan>('/salon', { restaurantId, nombre }),
    rename: (id: number, nombre: string) => put<FloorPlan>(`/salon/${id}`, { nombre }),
    delete: (id: number) => del(`/salon/${id}`),
    addMesa: (planId: number, mesa: Omit<Mesa, 'id' | 'floorPlanId'>) =>
      post<Mesa>(`/salon/${planId}/mesas`, mesa),
    updateMesa: (planId: number, mesaId: number, data: Partial<Omit<Mesa, 'id' | 'floorPlanId'>>) =>
      put<Mesa>(`/salon/${planId}/mesas/${mesaId}`, data),
    deleteMesa: (planId: number, mesaId: number) => del(`/salon/${planId}/mesas/${mesaId}`),
    savePositions: (planId: number, positions: { id: number; x: number; y: number }[]) =>
      patch<{ ok: boolean }>(`/salon/${planId}/mesas`, positions),
  },
  mermas: {
    restituir: (id: number) => del(`/mermas/${id}`),
    create: (body: {
      restaurantId: number
      mesaNumero?: number
      planNombre?: string
      comandaId?: number
      itemNombre: string
      cantidad: number
      precio?: number
      itemNivel?: number | null
      itemRonda?: number
      camareroNombre?: string
      motivo: MermaMotivo
      descripcion?: string
    }) => post<Merma>('/mermas', body),
    list: (restaurantId: number, desde?: string, hasta?: string, page = 1) => {
      const params = new URLSearchParams({ restaurantId: String(restaurantId), page: String(page) })
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      return get<MermasResponse>(`/mermas?${params}`)
    },
  },
  stats: {
    retirosPorDia: (dias = 30) => get<{ fecha: string; total: number }[]>(`/stats/retiros-por-dia?dias=${dias}`),
    retirosPorRestaurante: (mes?: string) => get<{ restaurantId: number; nombre: string; total: number }[]>(`/stats/retiros-por-restaurante${mes ? `?mes=${mes}` : ''}`),
    productosTop: (limit = 10, dias = 30) => get<{ nombre: string; totalCantidad: number; vecesRetirado: number }[]>(`/stats/productos-top?limit=${limit}&dias=${dias}`),
    actividadEmpleados: (mes?: string) => get<{ empleadoId: number; nombre: string; total: number }[]>(`/stats/actividad-empleados${mes ? `?mes=${mes}` : ''}`),
  },
}
