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
  totalInvitaciones?: number
  numComandas?:    number
  propina?:        PropinaDia | null
}

export interface Empleado {
  id: number
  nombre: string
  tipo: 'cocina' | 'sala'
  pin?: string | null
  telefono?: string | null
  email?: string | null
  horasSemanales: number
  rol?: string | null
  puedeEncargado?: boolean
  accesoEncargadoApp?: boolean
  puedeJefeCocina?: boolean
  excluirPlanning?: boolean
  restaurantId?: number | null
  restaurant?: { id: number; nombre: string } | null
  activo: boolean
  diasLibresFijos: number[]      // 0=Lun … 6=Dom
  faseLibreRotacion: number      // 0-3: fase actual de rotación de días libres
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
  empleadoNombre: string | null
  empleado: { id: number; nombre: string } | null
  restaurant: { id: number; nombre: string }
  items: RetiroItem[]
  confirmadoAt?: string | null
  confirmadoPor?: string | null
}

export function retiroNombreEmpleado(r: Pick<RetiroResumen, 'empleado' | 'empleadoNombre'>): string {
  return r.empleado?.nombre ?? r.empleadoNombre ?? '(eliminado)'
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
  restaurantId: number | null
  grupo: string
  nombre: string
  icono: string
  orden: number
  ordenAlfabetico: boolean
  parentId: number | null
  itemCount: number
}

export interface MenuItem {
  id: number
  restaurantId: number | null
  categoria: string
  nombre: string
  descripcion: string
  precio: number
  activo: boolean
  autoPorPax: boolean
  ocultoEnCarta: boolean
  orden: number
  alergenos: number
  combinable: boolean
  precioCombinado: number | null
  esMixer: boolean
  suplementoMixer: number
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
  invitacion:   boolean         // 🎁 invitación de la casa: en cuenta a 0 €, no suma a ventas
  invitadoPor:  string | null   // quién la marcó
  invitacionMotivo: string | null // por qué se invitó (opcional)
}

// Valor cobrable de un item — las invitaciones de la casa van a 0 €
export const valorItem = (i: Pick<ComandaItem, 'precio' | 'cantidad' | 'invitacion'>) =>
  i.invitacion ? 0 : i.precio * i.cantidad

export const totalComanda = (items: Pick<ComandaItem, 'precio' | 'cantidad' | 'invitacion'>[]) =>
  items.reduce((s, i) => s + valorItem(i), 0)

// Cantidades sugeridas para un menú de grupo (tapeo compartido, todo al centro).
// Arranca con la ración base floor(pax/ratio) por plato y sube +1 a los platos más
// baratos mientras el valor en carta no supere el presupuesto (precio del menú × pax).
// Ej: 8 pax, menú 27 € (216 €), ratio 3 → base 2 de cada; los que quepan suben a 3.
export function sugerirCantidadesMenu(
  platos: Array<{ nombre: string; nivel: number }>,
  pax: number,
  paxPorRacion: number,
  precioCarta: Record<string, number>,
  precioMenu: number,
): Array<{ nombre: string; nivel: number; cantidad: number }> {
  const ratio = paxPorRacion > 0 ? paxPorRacion : 3
  const lo = Math.max(1, Math.floor(pax / ratio))
  const hi = Math.max(1, Math.ceil(pax / ratio))
  const budget = precioMenu * pax

  const res = platos.map(p => ({ ...p, cantidad: lo }))
  let spent = res.reduce((s, p) => s + (precioCarta[p.nombre] ?? 0) * p.cantidad, 0)

  if (hi > lo) {
    // Subir a `hi` los platos más baratos primero, mientras el presupuesto lo permita
    const porPrecio = [...res].sort((a, b) => (precioCarta[a.nombre] ?? 0) - (precioCarta[b.nombre] ?? 0))
    for (const p of porPrecio) {
      const precio = precioCarta[p.nombre] ?? 0
      if (spent + precio <= budget) {
        p.cantidad = hi
        spent += precio
      }
    }
  }
  return res
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
  cuentaDesactualizada: boolean // items cambiados tras imprimir la cuenta → reimprimir antes de cobrar
  enviadaAt:      string | null // primera vez que se comandó a cocina
  items:          ComandaItem[]
  mermas:         ComandaMerma[]
  createdAt:      string
  closedAt:       string | null
}

// ── Tickets (impresión térmica 80mm) ──────────────────────────────────────────

export interface EmpresaConfig {
  id:          number
  razonSocial: string
  nif:         string | null
  tasaIva:     number
  mensajePie:  string | null
}

export interface TicketConfig {
  id:                 number
  restaurantId:       number
  nombreComercial:    string
  direccion:          string | null
  telefono:           string | null
  mensajePieOverride: string | null
}

export interface Impresora {
  id:           number
  restaurantId: number
  nombre:       string
  ip:           string
}

export type TipoTicket = 'cocina' | 'barra' | 'cobro'

export interface ImpresionRuta {
  id:          number
  floorPlanId: number
  tipoTicket:  TipoTicket
  impresoraId: number
  impresora:   Impresora
  copias:      number
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
  precio:         number
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
  nivel:    number
  nombre:   string    // nombre del curso, ej: "Tapas", "Pescados", "Carnes"
  platos:   string[]  // lista de platos del curso
  esPostre: boolean
  // Legacy fields (backward compat con plantillas antiguas)
  plato?:       string
  vegetariano?: string | null
  sinCerdo?:    string | null
  sinGluten?:   string | null
}

export interface GrupoMenuTemplate {
  id:           number
  restaurantId: number
  nombre:       string
  precio:       number
  paxPorRacion: number   // tapeo compartido: 1 ración de cada plato cada X pax
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

export interface GrupoAgendado {
  id:            number
  restaurantId:  number
  templateId:    number
  template:      GrupoMenuTemplate
  fecha:         string
  pax:           number
  restricciones: GrupoMenuRestricciones
  notas?:        string | null
  estado:        'pendiente' | 'asignado' | 'cancelado'
  comandaId?:    number | null
  createdAt:     string
}

export interface InventarioCategoria {
  id: number
  nombre: string
  orden: number
  personalProduccion: 'sala' | 'cocina' | null
  restaurantId: number | null
  productos: InventarioProducto[]
}

export interface InventarioProducto {
  id: number
  nombre: string
  unidad: string
  stockMinimo: number
  precioCoste: number | null
  precioVenta: number | null
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
  precioCoste: number | null
  precioVenta: number | null
  categoriaId: number
  categoriaNombre: string
  cantidad: number
  anterior: number | null
  diferencia: number | null
}

export interface InventarioCostesRow {
  productoId: number
  nombre: string
  unidad: string
  categoriaNombre: string
  precioCoste: number | null
  precioVenta: number | null
  cantBase: number
  cantFinal: number
  consumido: number
  coste: number | null
}

export interface InventarioProduccion {
  id: number
  restaurantId: number
  productoId: number
  cantidad: number
  unidad: string
  creadoPor: string | null
  notas: string | null
  fecha: string
  createdAt: string
  producto: { nombre: string; unidad: string }
}

export interface InventarioCostes {
  rows: InventarioCostesRow[]
  totalCoste: number
  sinPrecio: number
  baseFecha: string
  finalFecha: string
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

export interface TurnoTipo {
  id: number
  restaurantId: number | null
  nombre: string
  horaInicio: string
  horaFin: string
  horas: number
  color: string
  tipoEmpleado: 'cocina' | 'sala' | null
  rolEmpleado: string | null
  excluirAutoPlanning: boolean
  activo: boolean
}

export interface TurnoEmpleadoType {
  id: number
  restaurantId: number
  empleadoId: number
  tipoId?: number | null
  tipo?: TurnoTipo | null
  empleado: { id: number; nombre: string; tipo: string; horasSemanales: number; rol?: string | null }
  fecha: string
  horaInicio: string
  horaFin: string
  estado: string
  esExtra: boolean
  createdAt: string
}

export interface ExtraCandidato {
  id: number
  nombre: string
  rol: string | null
  tipo: string
  horasSemanales: number
  horasAsignadas: number
  restaurantId: number | null
  restaurantNombre: string | null
  esSuplente: boolean
}

export interface NecesidadSlots {
  jefeCocina: number
  cocineros: number
  friegaplatos: number
  produccion: number
  camareros: number
  encargados: number
}

export interface NecesidadDia extends NecesidadSlots {
  id: number | null
  restaurantId: number
  diaSemana: number  // 0=Lun … 6=Dom
}

export interface NecesidadFecha extends NecesidadSlots {
  id: number
  restaurantId: number
  fecha: string
  notas: string | null
}

export interface AutoPlanItem {
  empleadoId:    number
  empleadoNombre: string
  fecha:         string
  horaInicio:    string
  horaFin:       string
  tipoId:        number | null
  tipoNombre:    string | null
}

export interface HuecoEmpleado {
  fecha: string
  restaurantId: number
  restaurantNombre: string
  needed: number
  covered: number
  deficit: number
}

export interface CoberturaEmpleado {
  id: number
  nombre: string
  tipo: 'cocina' | 'sala'
  rol: string | null
  horasSemanales: number
  horasAsignadas: number
  excluirPlanning: boolean
  restaurants: { id: number; nombre: string }[]
}

export interface EmpleadoDisponible {
  id: number
  nombre: string
  rol: string | null
  tipo: string
  horasSemanales: number
  horasRestantes: number
  restaurantId: number | null
  restaurantNombre: string | null
  esSuplente: boolean
}


// ── Wiki ────────────────────────────────────────────────────────────────────
export interface WikiGuiones {
  en?: string
  fr?: string
  de?: string
}

export interface WikiArticulo {
  id: number
  categoriaId: number
  restaurantId: number | null
  titulo: string
  guiones: WikiGuiones
  notas: string
  orden: number
  activo: boolean
}

export interface WikiCategoria {
  id: number
  nombre: string
  icono: string
  orden: number
  _count?: { articulos: number }
  articulos?: WikiArticulo[]
}

// ── Checklists ──────────────────────────────────────────────────────────────
export interface ChecklistItem {
  id: number
  sectorId: number
  momento: 'apertura' | 'cierre'
  texto: string
  orden: number
}

export interface ChecklistMarcado {
  texto: string
  marcado: boolean
}

export interface ChecklistEjecucion {
  id: number
  sectorId: number
  restaurantId: number
  momento: 'apertura' | 'cierre'
  completadoPor: string
  itemsMarcados: ChecklistMarcado[]
  fecha: string
  sector?: ChecklistSector
}

export interface ChecklistSector {
  id: number
  restaurantId: number
  nombre: string
  orden: number
  items?: ChecklistItem[]
  ejecuciones?: ChecklistEjecucion[] // ejecuciones de hoy (vista sala)
}

export const api = {
  restaurantes: {
    list: () => get<Restaurante[]>('/restaurantes'),
  },
  empleados: {
    list:   (tipo?: 'cocina' | 'sala') => get<Empleado[]>(`/empleados${tipo ? `?tipo=${tipo}` : ''}`),
    auth:   (pin: string) => post<Empleado>('/empleados/auth', { pin }),
    create: (body: { nombre: string; tipo: 'cocina' | 'sala'; pin?: string; telefono?: string; email?: string; horasSemanales?: number; rol?: string; puedeEncargado?: boolean; accesoEncargadoApp?: boolean; puedeJefeCocina?: boolean; excluirPlanning?: boolean; diasLibresFijos?: number[]; restaurantId?: number | null }) => post<Empleado>('/empleados', body),
    update: (id: number, body: { nombre?: string; tipo?: string; pin?: string; telefono?: string | null; email?: string | null; horasSemanales?: number; rol?: string | null; puedeEncargado?: boolean; accesoEncargadoApp?: boolean; puedeJefeCocina?: boolean; excluirPlanning?: boolean; diasLibresFijos?: number[]; restaurantId?: number | null; activo?: boolean }) =>
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
    list:   (restaurantId: number | null) => get<MenuCategoria[]>(`/menu/categorias${restaurantId !== null ? `?restaurantId=${restaurantId}` : ''}`),
    create: (body: { restaurantId: number | null; grupo?: string; nombre: string; icono?: string; orden?: number; parentId?: number | null }) =>
      post<MenuCategoria>('/menu/categorias', body),
    update: (id: number, body: Partial<{ grupo: string; nombre: string; icono: string; orden: number; ordenAlfabetico: boolean }>) =>
      put<MenuCategoria>(`/menu/categorias/${id}`, body),
    delete: (id: number) => del(`/menu/categorias/${id}`),
    anidar: (id: number, parentId: number | null) =>
      post<MenuCategoria>(`/menu/categorias/${id}/anidar`, { parentId }),
    copiar: (id: number, restaurantIds: number[], incluirItems: boolean) =>
      post<{ resultados: { restaurantId: number; copiados: number; omitidos: number }[] }>(
        `/menu/categorias/${id}/copiar`, { restaurantIds, incluirItems }
      ),
    migrarAGlobal: (restaurantId: number) =>
      post<{ categoriasMigradas: number; categoriasOmitidas: number; itemsMigrados: number; itemsOmitidos: number }>(
        '/menu/migrar-a-global', { restaurantId }
      ),
  },
  menu: {
    list:   (restaurantId: number | null, categoria?: string) =>
      get<MenuItem[]>(`/menu${restaurantId !== null ? `?restaurantId=${restaurantId}` : ''}${categoria ? `${restaurantId !== null ? '&' : '?'}categoria=${encodeURIComponent(categoria)}` : ''}`),
    create: (body: Omit<MenuItem, 'id' | 'activo' | 'autoPorPax' | 'ocultoEnCarta' | 'combinable' | 'precioCombinado' | 'esMixer' | 'suplementoMixer'> & Partial<Pick<MenuItem, 'ocultoEnCarta' | 'combinable' | 'precioCombinado' | 'esMixer' | 'suplementoMixer'>>) => post<MenuItem>('/menu', body),
    update: (id: number, body: Partial<Omit<MenuItem, 'id' | 'restaurantId' | 'activo'>>) => put<MenuItem>(`/menu/${id}`, body),
    toggle:           (id: number) => patch<MenuItem>(`/menu/${id}/toggle`, {}),
    toggleAutoPorPax: (id: number) => patch<MenuItem>(`/menu/${id}/toggleAutoPorPax`, {}),
    copiar: (id: number, restaurantId: number, categoria: string) =>
      post<MenuItem>(`/menu/items/${id}/copiar`, { restaurantId, categoria }),
    moverARestaurante: (id: number, restaurantId: number) =>
      patch<MenuItem>(`/menu/${id}/mover-restaurante`, { restaurantId }),
    delete: (id: number) => del(`/menu/${id}`),
  },
  reviews: {
    list: () => get<{
      restaurantId: number; nombre: string; activo: boolean
      total: number | null; rating: number | null; ratingAnterior: number | null; ratingDiff: number | null
      diff: number | null; fecha: string | null
      negativasNuevas: { rating: number; text: string; author: string; time: number }[]
      posibleOculta: boolean
      totalMes: number | null; tasa: number | null; paxMes: number; objetivoDinamico: number | null
    }[]>('/reviews'),
    setObjetivo: (restaurantId: number, tasa: number) => patch<{ restaurantId: number; tasa: number | null }>('/reviews/objetivo', { restaurantId, tasa }),
    setActivo: (restaurantId: number, activo: boolean) => patch<{ restaurantId: number; activo: boolean }>('/reviews/activo', { restaurantId, activo }),
  },
  comandas: {
    list:      (restaurantId: number, estado?: string) =>
      get<Comanda[]>(`/comandas?restaurantId=${restaurantId}${estado ? `&estado=${estado}` : ''}`),
    abrir:     (restaurantId: number, mesaId: number, pax: number, camareroNombre?: string) =>
      post<Comanda>('/comandas', { restaurantId, mesaId, pax, camareroNombre }),
    get:       (id: number) => get<Comanda>(`/comandas/${id}`),
    addItem:   (id: number, item: { nombre: string; precio: number; cantidad: number; nota?: string; tipo?: 'cocina' | 'barra'; directo?: boolean }) =>
      post<ComandaItem>(`/comandas/${id}/items`, item),
    updateItem:(id: number, itemId: number, data: { cantidad?: number; nota?: string; invitacion?: boolean; invitadoPor?: string; invitacionMotivo?: string }) =>
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
    create: (body: { restaurantId: number; nombre: string; precio: number; paxPorRacion?: number; niveles: GrupoMenuNivel[] }) =>
      post<GrupoMenuTemplate>('/grupo-menu', body),
    update: (id: number, body: Partial<{ restaurantId: number; nombre: string; precio: number; paxPorRacion: number; niveles: GrupoMenuNivel[] }>) =>
      put<GrupoMenuTemplate>(`/grupo-menu/${id}`, body),
    delete: (id: number) => del(`/grupo-menu/${id}`),
    generar: (id: number, body: {
      mesaId: number
      pax: number
      platosSeleccionados: Array<{ nombre: string; nivel: number; cantidad: number }>
      camareroNombre?: string
    }) => post<Comanda>(`/grupo-menu/${id}/generar`, body),
    agendados: {
      list:   (restaurantId: number, fecha?: string) =>
        get<GrupoAgendado[]>(`/grupo-menu/agendados?restaurantId=${restaurantId}${fecha ? `&fecha=${fecha}` : ''}`),
      pendientesHoy: () =>
        get<(GrupoAgendado & { restaurant: { id: number; nombre: string } })[]>('/grupo-menu/agendados/pendientes-hoy'),
      create: (body: { restaurantId: number; templateId: number; fecha: string; pax: number; restricciones: GrupoMenuRestricciones; notas?: string }) =>
        post<GrupoAgendado>('/grupo-menu/agendados', body),
      update: (id: number, body: Partial<{ fecha: string; pax: number; restricciones: GrupoMenuRestricciones; notas: string; estado: string }>) =>
        patch<GrupoAgendado>(`/grupo-menu/agendados/${id}`, body),
      delete: (id: number) => del(`/grupo-menu/agendados/${id}`),
      asignar: (id: number, body: { mesaId: number; camareroNombre?: string; incluyePostre?: boolean }) =>
        post<Comanda>(`/grupo-menu/agendados/${id}/asignar`, body),
    },
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
  staffing: {
    getTipos: (restaurantId: number) => get<TurnoTipo[]>(`/staffing/tipos?restaurantId=${restaurantId}`),
    createTipo: (body: { restaurantId: number | null; nombre: string; horaInicio: string; horaFin: string; horas: number; color: string; tipoEmpleado: 'cocina' | 'sala' | null; rolEmpleado?: string | null; excluirAutoPlanning?: boolean }) => post<TurnoTipo>('/staffing/tipos', body),
    updateTipo: (id: number, body: Partial<{ restaurantId: number | null; nombre: string; horaInicio: string; horaFin: string; horas: number; color: string; tipoEmpleado: 'cocina' | 'sala' | null; rolEmpleado: string | null; excluirAutoPlanning: boolean }>) => put<TurnoTipo>(`/staffing/tipos/${id}`, body),
    deleteTipo: (id: number) => del(`/staffing/tipos/${id}`),
    getTurnos: (restaurantId: number, fecha: string) => get<TurnoEmpleadoType[]>(`/staffing/turnos?restaurantId=${restaurantId}&fecha=${fecha}`),
    getSemana: (restaurantId: number, desde: string) => get<TurnoEmpleadoType[]>(`/staffing/turnos/semana?restaurantId=${restaurantId}&desde=${desde}`),
    getSemanaGlobal: (restaurantId: number, desde: string) => get<Array<{ empleadoId: number; horaInicio: string; horaFin: string; restaurantId: number }>>(`/staffing/turnos/semana-global?restaurantId=${restaurantId}&desde=${desde}`),
    createTurno: (body: { restaurantId: number; empleadoId: number; tipoId?: number | null; fecha: string; horaInicio: string; horaFin: string; esExtra?: boolean }) => post<TurnoEmpleadoType>('/staffing/turnos', body),
    updateTurno: (id: number, body: { estado?: string; tipoId?: number | null; horaInicio?: string; horaFin?: string; fecha?: string; empleadoId?: number; restaurantId?: number; esExtra?: boolean }) => patch<TurnoEmpleadoType>(`/staffing/turnos/${id}`, body),
    getTransferirDestinos: (empId: number, fecha: string, origenId: number) =>
      get<Array<{ restaurantId: number; nombre: string; needed: number; covered: number; deficit: number }>>(
        `/staffing/transferir-destinos?empId=${empId}&fecha=${fecha}&origenId=${origenId}`
      ),
    getExcesoPersonal: (rol: string, fecha: string, restaurantId: number) =>
      get<Array<{
        restaurantId: number; nombre: string; needed: number; covered: number; exceso: number
        empleados: Array<{ turnoId: number; empleadoId: number; nombre: string; rol: string | null; horaInicio: string; horaFin: string }>
      }>>(`/staffing/exceso-personal?rol=${rol}&fecha=${fecha}&restaurantId=${restaurantId}`),
    deleteTurno: (id: number) => del(`/staffing/turnos/${id}`),
    deleteSemana: (restaurantId: number, desde: string) =>
      del(`/staffing/turnos/semana?restaurantId=${restaurantId}&desde=${desde}`),
    deleteSemanaGlobal: (restaurantIds: number[], desde: string) =>
      del(`/staffing/turnos/semana-todos?desde=${desde}&restaurantIds=${restaurantIds.join(',')}`),
    updateEmpleado: (id: number, body: { horasSemanales?: number; faseLibreRotacion?: number }) => patch<{ id: number; horasSemanales: number; faseLibreRotacion: number }>(`/staffing/empleados/${id}`, body),
    getDisponibles: (restaurantId: number, fecha: string, rol: string) => get<EmpleadoDisponible[]>(`/staffing/disponibles?restaurantId=${restaurantId}&fecha=${fecha}&rol=${rol}`),
    getExtrasCandidatos: (restaurantId: number, fecha: string, rol: string) => get<ExtraCandidato[]>(`/staffing/extras-candidatos?restaurantId=${restaurantId}&fecha=${fecha}&rol=${rol}`),
    getEmpleadoSemana: (empId: number, desde: string) => get<Array<{ id: number; fecha: string; horaInicio: string; horaFin: string; estado: string; tipo: TurnoTipo | null; restaurant: { id: number; nombre: string } }>>(`/staffing/empleado/${empId}/semana?desde=${desde}`),
    getNecesidades: (restaurantId: number) => get<NecesidadDia[]>(`/staffing/necesidades?restaurantId=${restaurantId}`),
    setNecesidades: (restaurantId: number, dias: (NecesidadSlots & { diaSemana: number })[]) =>
      put<{ ok: boolean }>('/staffing/necesidades', { restaurantId, dias }),
    getNecesidadesFecha: (restaurantId: number, desde: string, hasta: string) =>
      get<NecesidadFecha[]>(`/staffing/necesidades/fecha?restaurantId=${restaurantId}&desde=${desde}&hasta=${hasta}`),
    setNecesidadFecha: (body: { restaurantId: number; fecha: string; notas?: string | null } & NecesidadSlots) =>
      put<NecesidadFecha>('/staffing/necesidades/fecha', body),
    deleteNecesidadFecha: (id: number) => del(`/staffing/necesidades/fecha/${id}`),
    autoPlanning: (body: { restaurantId: number; weekStart: string; preview?: boolean }) =>
      post<{ plan: AutoPlanItem[]; empleadosConTurnos?: number[]; hasNeeds?: boolean; created?: number; coverage?: Array<{ fecha: string; needed: NecesidadSlots; covered: NecesidadSlots; ok: boolean; partial: boolean }> }>('/staffing/auto-planning', body),
    getCobertura: (lunes: string) => get<CoberturaEmpleado[]>(`/staffing/cobertura?lunes=${lunes}`),
    getHuecosEmpleado: (empId: number, lunes: string) => get<HuecoEmpleado[]>(`/staffing/huecos-empleado?empId=${empId}&lunes=${lunes}`),
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
    updateCategoria: (id: number, body: { nombre?: string; orden?: number; personalProduccion?: 'sala' | 'cocina' | null }) =>
      patch<InventarioCategoria>(`/inventario/categorias/${id}`, body),
    deleteCategoria: (id: number) => del(`/inventario/categorias/${id}`),
    createProducto: (body: { nombre: string; categoriaId: number; unidad: string; stockMinimo: number; restaurantId?: number }) =>
      post<InventarioProducto>('/inventario/productos', body),
    updateProducto: (id: number, body: Partial<{ nombre: string; unidad: string; stockMinimo: number; precioCoste: number | null; precioVenta: number | null; activo: boolean; orden: number }>) =>
      patch<InventarioProducto>(`/inventario/productos/${id}`, body),
    deleteProducto: (id: number) => del(`/inventario/productos/${id}`),
    getConteos: (restaurantId: number) =>
      get<InventarioConteoResumen[]>(`/inventario/conteos?restaurantId=${restaurantId}`),
    createConteo: (body: { restaurantId: number; creadoPor?: string; items: { productoId: number; cantidad: number }[] }) =>
      post<InventarioConteo>('/inventario/conteos', body),
    getConteo: (id: number) => get<InventarioConteoDetalle>(`/inventario/conteos/${id}`),
    deleteConteo: (id: number) => del(`/inventario/conteos/${id}`),
    getCostes: (baseId: number, finalId: number) =>
      get<InventarioCostes>(`/inventario/costes?baseId=${baseId}&finalId=${finalId}`),
    getProducciones: (restaurantId: number) =>
      get<InventarioProduccion[]>(`/inventario/producciones?restaurantId=${restaurantId}`),
    createProduccion: (body: { restaurantId: number; productoId: number; cantidad: number; unidad: string; creadoPor?: string; notas?: string; fecha?: string }) =>
      post<InventarioProduccion>('/inventario/producciones', body),
    deleteProduccion: (id: number) => del(`/inventario/producciones/${id}`),
  },
  wiki: {
    // Vista combinada para sala: categorías con artículos activos filtrados por scope
    contenido: (restaurantId: number) =>
      get<WikiCategoria[]>(`/wiki?restaurantId=${restaurantId}`),
    // Categorías (admin)
    listCategorias: () => get<WikiCategoria[]>('/wiki/categorias'),
    createCategoria: (body: { nombre: string; icono?: string; orden?: number }) =>
      post<WikiCategoria>('/wiki/categorias', body),
    updateCategoria: (id: number, body: Partial<{ nombre: string; icono: string; orden: number }>) =>
      put<WikiCategoria>(`/wiki/categorias/${id}`, body),
    deleteCategoria: (id: number) => del(`/wiki/categorias/${id}`),
    // Artículos (admin) — con restaurantId: globales + específicos; sin él: solo globales
    listArticulos: (restaurantId: number | null) =>
      get<WikiArticulo[]>(`/wiki/articulos${restaurantId !== null ? `?restaurantId=${restaurantId}` : ''}`),
    createArticulo: (body: { categoriaId: number; restaurantId: number | null; titulo: string; guiones?: WikiGuiones; notas?: string; orden?: number }) =>
      post<WikiArticulo>('/wiki/articulos', body),
    updateArticulo: (id: number, body: Partial<{ categoriaId: number; restaurantId: number | null; titulo: string; guiones: WikiGuiones; notas: string; orden: number }>) =>
      put<WikiArticulo>(`/wiki/articulos/${id}`, body),
    toggleArticulo: (id: number) => patch<WikiArticulo>(`/wiki/articulos/${id}/toggle`, {}),
    deleteArticulo: (id: number) => del(`/wiki/articulos/${id}`),
  },
  checklists: {
    // Vista sala: sectores con ítems + ejecuciones de hoy
    contenido: (restaurantId: number) =>
      get<ChecklistSector[]>(`/checklists?restaurantId=${restaurantId}`),
    // Sectores (admin)
    listSectores: (restaurantId: number) =>
      get<ChecklistSector[]>(`/checklists/sectores?restaurantId=${restaurantId}`),
    createSector: (body: { restaurantId: number; nombre: string; orden?: number }) =>
      post<ChecklistSector>('/checklists/sectores', body),
    updateSector: (id: number, body: Partial<{ nombre: string; orden: number }>) =>
      put<ChecklistSector>(`/checklists/sectores/${id}`, body),
    deleteSector: (id: number) => del(`/checklists/sectores/${id}`),
    // Ítems (admin)
    createItem: (body: { sectorId: number; momento: 'apertura' | 'cierre'; texto: string; orden?: number }) =>
      post<ChecklistItem>('/checklists/items', body),
    updateItem: (id: number, body: Partial<{ momento: 'apertura' | 'cierre'; texto: string; orden: number }>) =>
      put<ChecklistItem>(`/checklists/items/${id}`, body),
    deleteItem: (id: number) => del(`/checklists/items/${id}`),
    // Ejecuciones
    registrar: (body: { sectorId: number; momento: 'apertura' | 'cierre'; completadoPor: string; itemsMarcados: ChecklistMarcado[] }) =>
      post<ChecklistEjecucion>('/checklists/ejecuciones', body),
    listEjecuciones: (restaurantId: number, fecha?: string) =>
      get<ChecklistEjecucion[]>(`/checklists/ejecuciones?restaurantId=${restaurantId}${fecha ? `&fecha=${fecha}` : ''}`),
    deleteEjecucion: (id: number) => del(`/checklists/ejecuciones/${id}`),
  },
  tickets: {
    getEmpresa:    () => get<EmpresaConfig>('/empresa-config'),
    updateEmpresa: (body: Partial<{ razonSocial: string; nif: string | null; tasaIva: number; mensajePie: string | null }>) =>
      put<EmpresaConfig>('/empresa-config', body),
    getConfig:     (restaurantId: number) =>
      get<TicketConfig | null>(`/tickets/config?restaurantId=${restaurantId}`),
    updateConfig:  (body: { restaurantId: number; nombreComercial: string; direccion?: string | null; telefono?: string | null; mensajePieOverride?: string | null }) =>
      put<TicketConfig>('/tickets/config', body),
    // Impresoras
    listImpresoras:   (restaurantId: number) =>
      get<Impresora[]>(`/tickets/impresoras?restaurantId=${restaurantId}`),
    createImpresora:  (body: { restaurantId: number; nombre: string; ip: string }) =>
      post<Impresora>('/tickets/impresoras', body),
    updateImpresora:  (id: number, body: Partial<{ nombre: string; ip: string }>) =>
      put<Impresora>(`/tickets/impresoras/${id}`, body),
    deleteImpresora:  (id: number) => del(`/tickets/impresoras/${id}`),
    // Rutas de impresión (por sala)
    listRutas:  (floorPlanId: number) =>
      get<ImpresionRuta[]>(`/tickets/rutas?floorPlanId=${floorPlanId}`),
    createRuta: (body: { floorPlanId: number; tipoTicket: TipoTicket; impresoraId: number; copias?: number }) =>
      post<ImpresionRuta>('/tickets/rutas', body),
    updateRuta: (id: number, body: Partial<{ impresoraId: number; copias: number }>) =>
      put<ImpresionRuta>(`/tickets/rutas/${id}`, body),
    deleteRuta: (id: number) => del(`/tickets/rutas/${id}`),
  },
}
