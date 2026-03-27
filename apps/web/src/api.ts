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

export interface Turno {
  id:              number
  restaurantId:    number
  estado:          'abierto' | 'cerrado'
  encargadoNombre?: string
  aperturaAt:      string
  cierreAt?:       string
  totalEfectivo?:  number
  totalTarjeta?:   number
  totalVentas?:    number
  totalMermas?:    number
  totalPropinas?:  number
  numComandas?:    number
  propina?:        PropinaDia | null
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
  turnoId?: number | null
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
  autoPorPax: boolean
  orden: number
}

export interface Mesa {
  id:         number
  floorPlanId: number
  numero:     number
  tipo:       'round' | 'square' | 'rectangular' | 'barra' | 'silla_alta' | 'pared' | 'columna' | 'ventana' | 'entrada'
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
  id:           number
  comandaId:    number
  tipo:         'cocina' | 'barra'
  nombre:       string
  precio:       number
  cantidad:     number
  nota:         string
  nivel:        number | null
  ronda:        number  // 0=pendiente, 1=comanda original, 2+=marcha pasa
  autoGenerado: boolean
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
  propina:        number
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

export interface GrupoMenuNivel {
  nivel:       number
  plato:       string
  vegetariano: string | null
  sinCerdo:    string | null
  sinGluten:   string | null
  esPostre:    boolean
}

export interface GrupoMenuTemplate {
  id:           number
  restaurantId: number
  nombre:       string
  precio:       number
  niveles:      GrupoMenuNivel[]
  activo:       boolean
  createdAt:    string
}

export interface GrupoMenuRestricciones {
  normales:     number
  vegetarianos: number
  sinCerdo:     number
  sinGluten:    number
}

export interface InventarioCategoria {
  id: number
  nombre: string
  orden: number
  restaurantId: number | null
  productos: InventarioProducto[]
}

export interface InventarioProducto {
  id: number
  nombre: string
  unidad: string
  stockMinimo: number
  orden: number
  activo: boolean
  categoriaId: number
  restaurantId: number | null
}

export interface InventarioConteoResumen {
  id: number
  restaurantId: number
  fecha: string
  creadoPor: string | null
  notas: string | null
  cerrado: boolean
  createdAt: string
  _count: { items: number }
}

export interface InventarioConteo {
  id: number
  restaurantId: number
  fecha: string
  creadoPor: string | null
  cerrado: boolean
  createdAt: string
}

export interface InventarioConteoDetalleItem {
  productoId: number
  nombre: string
  unidad: string
  stockMinimo: number
  categoriaId: number
  categoriaNombre: string
  cantidad: number
  anterior: number | null
  diferencia: number | null
}

export interface InventarioConteoDetalle {
  conteo: InventarioConteo
  items: InventarioConteoDetalleItem[]
}

export interface ReservaConfig {
  id: number
  restaurantId: number
  slug: string
  activo: boolean
  maxPaxPorSlot: number
  duracionMin: number
  diasAntelacion: number
  horarios: ReservaHorario[]
  createdAt: string
}

export interface ReservaHorario {
  id: number
  configId: number
  nombre: string
  diasSemana: number[]
  horaInicio: string
  horaFin: string
  intervaloMin: number
  maxPax: number
  activo: boolean
}

export interface Reserva {
  id: number
  restaurantId: number
  configId: number
  fecha: string
  hora: string
  pax: number
  nombre: string
  telefono: string
  email: string | null
  notas: string | null
  estado: string
  origen: string
  createdAt: string
}

export interface SlotDisponible {
  hora: string
  disponible: boolean
  disponibles: number
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
      turnoId?: number
      turnos: { empleadoId: number; horas: number }[]
    }) => post<PropinaDia>('/propinas', body),
    update: (id: number, body: { efectivo: number; tarjeta: number; turnos: { empleadoId: number; horas: number }[] }) =>
      patch<PropinaDia>(`/propinas/${id}`, body),
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
    copiar: (id: number, restaurantIds: number[], incluirItems: boolean) =>
      post<{ resultados: { restaurantId: number; copiados: number; omitidos: number }[] }>(
        `/menu/categorias/${id}/copiar`, { restaurantIds, incluirItems }
      ),
  },
  menu: {
    list:   (restaurantId: number, categoria?: string) =>
      get<MenuItem[]>(`/menu?restaurantId=${restaurantId}${categoria ? `&categoria=${encodeURIComponent(categoria)}` : ''}`),
    create: (body: Omit<MenuItem, 'id' | 'activo' | 'autoPorPax'>) => post<MenuItem>('/menu', body),
    update: (id: number, body: Partial<Omit<MenuItem, 'id' | 'restaurantId' | 'activo'>>) => put<MenuItem>(`/menu/${id}`, body),
    toggle:           (id: number) => patch<MenuItem>(`/menu/${id}/toggle`, {}),
    toggleAutoPorPax: (id: number) => patch<MenuItem>(`/menu/${id}/toggleAutoPorPax`, {}),
    copiar: (id: number, restaurantId: number, categoria: string) =>
      post<MenuItem>(`/menu/items/${id}/copiar`, { restaurantId, categoria }),
    delete: (id: number) => del(`/menu/${id}`),
  },
  reviews: {
    list: () => get<{ restaurantId: number; nombre: string; total: number | null; rating: number | null; ratingAnterior: number | null; ratingDiff: number | null; diff: number | null; fecha: string | null; totalMes: number | null; tasa: number | null; paxMes: number; objetivoDinamico: number | null }[]>('/reviews'),
    sync: () => post<{ synced: number }>('/reviews/sync', {}),
    setObjetivo: (restaurantId: number, tasa: number) => patch<{ restaurantId: number; tasa: number | null }>('/reviews/objetivo', { restaurantId, tasa }),
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
    cambiarPax:(id: number, pax: number) => patch<Comanda>(`/comandas/${id}/pax`, { pax }),
    facturar:  (id: number) => patch<Comanda>(`/comandas/${id}/facturar`, {}),
    liberar:   (id: number) => patch<Comanda>(`/comandas/${id}/liberar`, {}),
    cerrar:    (id: number, metodoPago: 'cash' | 'tarjeta', propina = 0) =>
      patch<Comanda>(`/comandas/${id}/cerrar`, { metodoPago, propina }),
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
  grupoMenu: {
    list:   (restaurantId: number) => get<GrupoMenuTemplate[]>(`/grupo-menu?restaurantId=${restaurantId}`),
    create: (body: { restaurantId: number; nombre: string; precio: number; niveles: GrupoMenuNivel[] }) =>
      post<GrupoMenuTemplate>('/grupo-menu', body),
    update: (id: number, body: Partial<{ nombre: string; precio: number; niveles: GrupoMenuNivel[] }>) =>
      put<GrupoMenuTemplate>(`/grupo-menu/${id}`, body),
    delete: (id: number) => del(`/grupo-menu/${id}`),
    generar: (id: number, body: {
      mesaId: number
      camareroNombre?: string
      incluyePostre: boolean
      restricciones: GrupoMenuRestricciones
    }) => post<Comanda>(`/grupo-menu/${id}/generar`, body),
  },
  turnos: {
    getActivo:  (restaurantId: number) => get<Turno | null>(`/turnos/activo?restaurantId=${restaurantId}`),
    getActivos: () => get<(Turno & { restaurant: Restaurante })[]>('/turnos/activos'),
    getStats:   () => get<{ restaurantId: number; nombre: string; activo: boolean; aperturaAt: string | null; turnoId: number | null; totalEfectivo: number; totalTarjeta: number; totalVentas: number; numComandas: number }[]>('/turnos/activos/stats'),
    abrir:     (restaurantId: number, encargadoNombre?: string) =>
      post<Turno>('/turnos', { restaurantId, encargadoNombre }),
    cerrar:    (id: number) => patch<Turno>(`/turnos/${id}/cerrar`, {}),
    list:      (restaurantId: number) => get<Turno[]>(`/turnos?restaurantId=${restaurantId}`),
    getComanadas: (turnoId: number) => get<Comanda[]>(`/turnos/${turnoId}/comandas`),
    delete:    (id: number) => del(`/turnos/${id}`),
  },
  reservas: {
    getConfig: (restaurantId: number) => get<ReservaConfig>(`/reservas/config/${restaurantId}`),
    upsertConfig: (restaurantId: number, body: Partial<ReservaConfig>) => put<ReservaConfig>(`/reservas/config/${restaurantId}`, body),
    createHorario: (body: { configId: number; nombre?: string; diasSemana: number[]; horaInicio: string; horaFin: string; intervaloMin?: number; maxPax?: number }) => post<ReservaHorario>('/reservas/horarios', body),
    updateHorario: (id: number, body: Partial<ReservaHorario>) => patch<ReservaHorario>(`/reservas/horarios/${id}`, body),
    deleteHorario: (id: number) => del(`/reservas/horarios/${id}`),
    list: (restaurantId: number, fecha?: string) => get<Reserva[]>(`/reservas?restaurantId=${restaurantId}${fecha ? `&fecha=${fecha}` : ''}`),
    create: (body: { restaurantId: number; fecha: string; hora: string; pax: number; nombre: string; telefono: string; email?: string; notas?: string }) => post<Reserva>('/reservas', body),
    updateEstado: (id: number, estado: string) => patch<Reserva>(`/reservas/${id}`, { estado }),
    delete: (id: number) => del(`/reservas/${id}`),
    getPublicConfig: (slug: string) => get<{ restaurantNombre: string; slug: string; activo: boolean; maxPaxPorSlot: number; duracionMin: number; diasAntelacion: number; horarios: ReservaHorario[] }>(`/reservas/publica/config?slug=${slug}`),
    getSlots: (slug: string, fecha: string, pax: number) => get<SlotDisponible[]>(`/reservas/publica/slots?slug=${slug}&fecha=${fecha}&pax=${pax}`),
    createPublica: (body: { slug: string; fecha: string; hora: string; pax: number; nombre: string; telefono: string; email?: string; notas?: string }) => post<Reserva>('/reservas/publica', body),
  },
  stats: {
    retirosPorDia: (dias = 30) => get<{ fecha: string; total: number }[]>(`/stats/retiros-por-dia?dias=${dias}`),
    retirosPorRestaurante: (mes?: string) => get<{ restaurantId: number; nombre: string; total: number }[]>(`/stats/retiros-por-restaurante${mes ? `?mes=${mes}` : ''}`),
    productosTop: (limit = 10, dias = 30) => get<{ nombre: string; totalCantidad: number; vecesRetirado: number }[]>(`/stats/productos-top?limit=${limit}&dias=${dias}`),
    actividadEmpleados: (mes?: string) => get<{ empleadoId: number; nombre: string; total: number }[]>(`/stats/actividad-empleados${mes ? `?mes=${mes}` : ''}`),
  },
  inventario: {
    getCategorias: (restaurantId?: number) =>
      get<InventarioCategoria[]>(`/inventario/categorias${restaurantId ? `?restaurantId=${restaurantId}` : ''}`),
    createCategoria: (body: { nombre: string; restaurantId?: number }) =>
      post<InventarioCategoria>('/inventario/categorias', body),
    updateCategoria: (id: number, body: { nombre?: string; orden?: number }) =>
      patch<InventarioCategoria>(`/inventario/categorias/${id}`, body),
    deleteCategoria: (id: number) => del(`/inventario/categorias/${id}`),
    createProducto: (body: { nombre: string; categoriaId: number; unidad: string; stockMinimo: number; restaurantId?: number }) =>
      post<InventarioProducto>('/inventario/productos', body),
    updateProducto: (id: number, body: Partial<{ nombre: string; unidad: string; stockMinimo: number; activo: boolean; orden: number }>) =>
      patch<InventarioProducto>(`/inventario/productos/${id}`, body),
    deleteProducto: (id: number) => del(`/inventario/productos/${id}`),
    getConteos: (restaurantId: number) =>
      get<InventarioConteoResumen[]>(`/inventario/conteos?restaurantId=${restaurantId}`),
    createConteo: (body: { restaurantId: number; creadoPor?: string; items: { productoId: number; cantidad: number }[] }) =>
      post<InventarioConteo>('/inventario/conteos', body),
    getConteo: (id: number) => get<InventarioConteoDetalle>(`/inventario/conteos/${id}`),
    deleteConteo: (id: number) => del(`/inventario/conteos/${id}`),
  },
}
