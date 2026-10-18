import { baseApi, enModoLocal, guardarBox, pedir } from './lib/conexion'

// Si el backend responde con { error: "..." } lo usamos como mensaje; si no, el fallback genérico.
// El cierre de turno se frena si la Oído Box del local (modo local) lleva un rato sin sincronizar:
// puede tener mesas comandadas sin internet. Quien cierra puede cerrar igual.
export const esAvisoBox = (e: unknown) => e instanceof Error && e.message.startsWith('La Oído Box no sincroniza')

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.clone().json()
    if (data && typeof data.error === 'string') return data.error
  } catch {}
  return fallback
}

// Todas las llamadas mandan la sesión si la hay (admin dentro de /admin, empleado en la app de sala):
// las rutas que la exigen la reciben, y a las que no, no les molesta.
async function get<T>(path: string): Promise<T> {
  const res = await pedir(`${baseApi()}${path}`, { headers: authHeaders() })
  sesionRechazada(res, path)
  if (!res.ok) throw new Error(await errorMessage(res, `GET ${path} failed: ${res.status}`))
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await pedir(`${baseApi()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  sesionRechazada(res, path)
  if (!res.ok) throw new Error(await errorMessage(res, `POST ${path} failed: ${res.status}`))
  return res.json() as Promise<T>
}

// Badge de Oído Talent que un restaurante da a un empleado
export interface BadgeBody {
  restaurantId: number
  tipo: 'BASIC' | 'GOLD'
  nombre: string
  apellido: string
  email: string
  rol: string
  fechaInicio: string
  fechaFin: string | null
  skills: string[]
  nota: string
}

export interface RedAdmin {
  tuIp: string
  restaurantes: {
    id: number; nombre: string; piCodigo: string | null; restringirPorRed: boolean
    redes: { id: number; ip: string; origen: 'pi' | 'manual'; autorizadaPor: string | null; vistaAt: string; caducaAt: string | null; vigente: boolean }[]
  }[]
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
  totalGastos?:    number   // gastos pagados en efectivo durante el turno (pan, frutería…)
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

// Link de WhatsApp a partir de un teléfono en cualquier formato (espacios, guiones, +34...).
// Si no trae prefijo de país, asume España (todos los restaurantes están en Barcelona).
export function waLink(telefono: string): string {
  const digits = telefono.replace(/[^\d]/g, '')
  const conPrefijo = digits.startsWith('34') || telefono.trim().startsWith('+') ? digits : `34${digits}`
  return `https://wa.me/${conPrefijo}`
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
  const res = await pedir(`${baseApi()}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  sesionRechazada(res, path)
  if (!res.ok) throw new Error(await errorMessage(res, `PATCH ${path} failed: ${res.status}`))
  return res.json() as Promise<T>
}

async function del(path: string): Promise<void> {
  const res = await pedir(`${baseApi()}${path}`, { method: 'DELETE', headers: authHeaders() })
  sesionRechazada(res, path)
  if (!res.ok) throw new Error(await errorMessage(res, `DELETE ${path} failed: ${res.status}`))
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await pedir(`${baseApi()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  sesionRechazada(res, path)
  if (!res.ok) throw new Error(await errorMessage(res, `PUT ${path} failed: ${res.status}`))
  return res.json() as Promise<T>
}

export interface TurnoParaPropina {
  id: number
  encargadoNombre: string | null
  aperturaAt: string
  cierreAt: string | null
  totalPropinas: number | null
  totalVentas: number | null
  propina: {
    id: number; efectivo: number; tarjeta: number; total: number
    turnos: { empleadoId: number; horas: number; propina: number; empleado: { nombre: string; tipo: string } }[]
  } | null
}

export interface MenuCategoria {
  id: number
  restaurantId: number | null
  grupo: string
  nombre: string
  icono: string
  orden: number
  ordenAlfabetico: boolean
  asistente?: string | null // asistente de sala conectado ('vinos'); las subcategorías lo heredan. '' o null = ninguno
  nombreEnTicket?: boolean // en la comanda de cocina, un nivel solo con platos de aquí sale con este nombre (ej. POSTRES)
  parentId: number | null
  itemCount: number
}

// Catálogo editable de alérgenos (/admin/alergenos). Cada MenuItem guarda los suyos en `alergenoIds`.
export interface Alergeno {
  id: number
  nombre: string
  nombreEn: string
  icono: string
  orden: number
  _count?: { items: number }
}

export interface MenuItem {
  id: number
  restaurantId: number | null
  categoria: string
  nombre: string
  descripcion: string
  ficha: string
  precio: number
  activo: boolean
  autoPorPax: boolean
  ocultoEnCarta: boolean
  orden: number
  alergenoIds: number[]
  alergenosNota: string
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
// Si ni la ración base de todos cabe (grupo pequeño, plantilla con muchos platos), elige:
// primero un plato por curso y después va sumando, curso a curso y en el orden de la
// plantilla, mientras quepa; el resto queda en 0 (a la vista, para subirlo a mano).
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

  if (spent > budget) {
    for (const p of res) p.cantidad = 0
    spent = 0
    const cursos = [...new Set(res.map(p => p.nivel))].sort((a, b) => a - b)
    const delCurso = (nivel: number) => res.filter(p => p.nivel === nivel)
    // Pone el plato con `cant` raciones si cabe
    const poner = (p: typeof res[number], cant: number) => {
      const precio = precioCarta[p.nombre] ?? 0
      if (spent + precio * cant > budget) return false
      p.cantidad = cant; spent += precio * cant
      return true
    }
    // Vueltas por los cursos con la ración base: en cada vuelta, el siguiente plato de cada curso que quepa
    let alguno = true
    while (alguno) {
      alguno = false
      for (const nivel of cursos) {
        if (delCurso(nivel).find(p => p.cantidad === 0 && poner(p, lo))) alguno = true
      }
    }
    // Ningún curso vacío: al que no le cupo nada, su plato que quepa con la mayor ración posible
    for (const nivel of cursos) {
      if (delCurso(nivel).some(p => p.cantidad > 0)) continue
      for (let cant = lo - 1; cant >= 1; cant--) {
        if (delCurso(nivel).find(p => poner(p, cant))) break
      }
    }
    return res
  }

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
  noComparten?: boolean // la mesa no comparte: COM: NO COMPARTEN en los tickets de cocina
  notaMesa?: string     // nota del camarero para cocina sobre toda la mesa (COM: al final del ticket)
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
  mac:          string | null   // dirección física; con ella la IP se corrige sola si cambia
}

// Raspberry Pi de impresión vinculada a un restaurante. `vistoAt` null = la API nunca supo de esa Pi.
export interface PiVinculada {
  codigo:            string | null
  online:            boolean
  vistoAt:           string | null
  brokerConfigurado: boolean
  asignadaPorOido?: boolean
}

// Impresoras que la Pi encontró en la red del local. `impresoraId` null = todavía sin cargar en el restaurante.
export interface ImpresorasDetectadas {
  escaneadoAt: string | null
  detectadas:  { ip: string; mac: string | null; impresoraId: number | null; nombre: string | null }[]
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
  mesaId: number | null
  comandaId: number | null
  sentadaAt: string | null
  enPool: boolean
  poolMotivo: string | null
  poolDesde: string | null
  poolGestionandoPor: string | null
  poolGestionandoDesde: string | null
  restaurantIdOrigen: number | null
  restaurant?: { nombre: string }
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

// ── Facturas de proveedor ───────────────────────────────────────────────────
export interface Proveedor {
  id:      number
  nombre:  string
  activo:  boolean
  _count?: { facturas: number }
}

export interface Factura {
  id:           number
  restaurantId: number
  restaurant?:  { id: number; nombre: string }
  proveedor:    string
  proveedorId?: number | null   // null = escrito a mano, sin catalogar
  numero?:      string | null
  nota?:        string | null
  subidoPor:    string
  subidoPorId?: number | null
  paginas:      number
  estado:       'subiendo' | 'pendiente' | 'revisada'
  revisadaAt?:  string | null
  createdAt:    string
}

// Toda la API exige sesión firmada. Cada zona de la app tiene la suya:
//   /admin → la de administración (PIN de admin)      /pulso → la de Pulso (PIN de Pulso)
//   resto  → la del empleado que entró con su PIN en la app de sala
export const ADMIN_TOKEN_KEY = 'admin_token'
export const PULSO_TOKEN_KEY = 'pulso_token'
// Pantallas que piden el PIN del empleado sin guardar sesión (almacén, mis propinas)
let tokenEmpleadoEfimero: string | null = null

// La sesión de sala lleva dos pases: el de la nube y, si el local tiene Box, el que vale en ella
// (modo local). Quien entró con el PIN estando ya en modo local solo tiene el de la Box.
function tokenSala(): string | null {
  try {
    const sesion = JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '')
    return (enModoLocal() ? sesion.tokenLocal : sesion.token) ?? null
  } catch { return null }
}

export function tokenActual(): string | null {
  const admin = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  if (location.pathname.startsWith('/admin')) return admin
  if (location.pathname.startsWith('/pulso')) return sessionStorage.getItem(PULSO_TOKEN_KEY)
  // Fuera del panel (p. ej. al validar un retiro escaneado desde /admin) sirve también la de admin
  return tokenSala() ?? tokenEmpleadoEfimero ?? admin
}

function authHeaders(): Record<string, string> {
  const token = tokenActual()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Para los canales de eventos: EventSource no puede mandar cabeceras, la sesión va en la dirección.
// `ruta` es la de la API sin el /api (ej. "/events?restaurantId=1"): la base depende de si se está
// hablando con la nube o con la Box.
export function conSesion(ruta: string): string {
  const url = `${baseApi()}${ruta}`
  const token = tokenActual()
  return token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url
}

// El servidor rechazó una sesión que sí mandamos: caducó. Se borra y se vuelve a pedir el PIN.
function sesionRechazada(res: Response, path: string) {
  if (res.status !== 401 || path.endsWith('/auth') || !tokenActual()) return
  if (location.pathname.startsWith('/admin')) {
    sessionStorage.removeItem('admin_auth'); sessionStorage.removeItem(ADMIN_TOKEN_KEY); location.reload()
  } else if (location.pathname.startsWith('/pulso')) {
    sessionStorage.removeItem('pulso_auth'); sessionStorage.removeItem(PULSO_TOKEN_KEY); location.reload()
  } else if ((location.pathname.startsWith('/sala') || location.pathname.startsWith('/tpv')) && tokenSala()) {
    sessionStorage.removeItem('oidoops_camarero'); location.assign(location.pathname.startsWith('/tpv') ? '/tpv' : '/sala')
  }
}

async function authFetch(path: string, init: { method?: string; json?: unknown; body?: Blob; contentType?: string } = {}): Promise<Response> {
  const headers = authHeaders()
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  if (init.contentType) headers['Content-Type'] = init.contentType
  const res = await pedir(`${baseApi()}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  sesionRechazada(res, path)
  if (!res.ok) throw new Error(await errorMessage(res, `${init.method ?? 'GET'} ${path} failed: ${res.status}`))
  return res
}

// ── Escandallos (coste de materia prima por plato) — rutas /admin/escandallos*, sesión de admin ──
export type EstadoEscandallo = 'verde' | 'ambar' | 'rojo' | 'sin_receta' | 'incompleta'
export interface EscandalloPlato {
  id: number; nombre: string; categoria: string; grupo: string; restaurantId: number | null
  precio: number; precioSinIva: number
  coste: number | null; foodCost: number | null; margen: number | null
  ingredientes: number; sinPrecio: number; estado: EstadoEscandallo
}
export interface EscandalloMatriz { tasaIva: number; verde: number; ambar: number; platos: EscandalloPlato[] }
export interface Ingrediente {
  id: number; nombre: string; restaurantId: number | null
  unidad: string; precioCoste: number | null           // unidad y precio de compra
  unidadBase: string; contenido: number; mermaPct: number // cómo se mide en la receta
  costeUnitario: number | null                          // € por unidad base, merma incluida
}
export interface EscandalloDetalle {
  tasaIva: number; verde: number; ambar: number
  id: number; nombre: string; categoria: string; precio: number; precioSinIva: number
  raciones: number
  lineas: { productoId: number; cantidad: number; producto: Ingrediente }[]
}
export type IngredienteBody = { nombre: string; unidad: string; precioCoste: number | null; unidadBase?: string | null; contenido?: number | null; mermaPct?: number }

// 🍷 Maridajes: puntos de cada vino con cada plato (los calcula Claude en /admin/maridajes)
export type ColorVino = 'tinto' | 'blanco' | 'rosado' | 'espumoso'
export interface ParejaMaridaje { platoId: number; vinoId: number; puntos: number; motivo: string; motivoEn: string }
export type RasgoVino = 'cuerpo' | 'dulzor' | 'fruta' | 'madera' | 'frescor' | 'aromatico'
export type PerfilVino = Record<RasgoVino, number> // del 1 al 5
export interface MaridajesSala { vinos: { id: number; color: ColorVino | null; perfil: PerfilVino | null }[]; parejas: ParejaMaridaje[] }
export interface ParejaMaridajeAdmin extends ParejaMaridaje { id: number; oculto: boolean; editado: boolean; updatedAt: string }
export interface MaridajesAdmin {
  estado: { enCurso: boolean; hechos: number; total: number; errores: string[]; empezo: string | null; termino: string | null }
  hayClave: boolean
  vinos: { id: number; nombre: string; precio: number; color: ColorVino | null; sinFicha: boolean; restaurantId: number | null }[]
  platos: { id: number; nombre: string; categoria: string }[]
  parejas: ParejaMaridajeAdmin[]
  perfiles: (PerfilVino & { vinoId: number; editado: boolean })[]
}

// 🧾 Gastos del día (libreta del encargado): habituales cargados en /admin/gastos + apuntes desde 💼
export type PagoGasto = 'efectivo' | 'cuenta'
export interface GastoTipo { id: number; nombre: string; precio: number | null }
export interface GastoHabitual {
  id: number; restaurantId: number | null; nombre: string; icono: string; unidad: string; precio: number | null
  pago: PagoGasto; orden: number; tipos: GastoTipo[]; _count?: { gastos: number }
}
export interface GastoHabitualBody {
  restaurantId?: number | null // solo al crear: null = global
  nombre: string; icono: string; unidad: string; precio: number | null; pago: PagoGasto; orden: number
  tipos: { nombre: string; precio: number | null }[]
}
export interface Gasto {
  id: number; restaurantId: number; habitualId: number | null; nombre: string
  lineas: { tipo: string | null; cantidad: number }[]
  importe: number | null; pago: PagoGasto
  pagadoAt: string | null; pagadoPor: string | null; pagadoCon: 'efectivo' | 'otro' | null
  creadoPor: string; createdAt: string
  restaurant?: { nombre: string }
}

export interface ItemAgotado {
  menuItemId: number
  marcadoPor: string
  createdAt: string
  menuItem: { nombre: string }
}

export const api = {
  escandallos: {
    matriz: (restaurantId: number) => authFetch(`/admin/escandallos?restaurantId=${restaurantId}`).then(r => r.json() as Promise<EscandalloMatriz>),
    detalle: (menuItemId: number) => authFetch(`/admin/escandallos/${menuItemId}`).then(r => r.json() as Promise<EscandalloDetalle>),
    guardar: (menuItemId: number, body: { raciones: number; lineas: { productoId: number; cantidad: number }[] }) =>
      authFetch(`/admin/escandallos/${menuItemId}`, { method: 'PUT', json: body }).then(() => undefined),
    umbrales: (body: { verde: number; ambar: number }) => authFetch('/admin/escandallos/umbrales', { method: 'PUT', json: body }).then(() => undefined),
    ingredientes: (restaurantId: number) => authFetch(`/admin/escandallos/ingredientes?restaurantId=${restaurantId}`).then(r => r.json() as Promise<Ingrediente[]>),
    crearIngrediente: (body: IngredienteBody) => authFetch('/admin/escandallos/ingredientes', { method: 'POST', json: body }).then(r => r.json() as Promise<Ingrediente>),
    editarIngrediente: (id: number, body: Partial<IngredienteBody>) => authFetch(`/admin/escandallos/ingredientes/${id}`, { method: 'PATCH', json: body }).then(r => r.json() as Promise<Ingrediente>),
  },
  auth: {
    admin: (pin: string) => post<{ token: string }>('/admin/auth', { pin }),
    pulso: (pin: string) => post<{ token: string }>('/pulso/auth', { pin }),
  },
  facturas: {
    list: (params: { restaurantId?: number; estado?: 'pendiente' | 'revisada'; mes?: string; proveedorId?: number } = {}) => {
      const q = new URLSearchParams()
      if (params.restaurantId) q.set('restaurantId', String(params.restaurantId))
      if (params.estado) q.set('estado', params.estado)
      if (params.mes) q.set('mes', params.mes)
      if (params.proveedorId) q.set('proveedorId', String(params.proveedorId))
      return authFetch(`/facturas?${q}`).then(r => r.json() as Promise<Factura[]>)
    },
    proveedores: () => authFetch('/facturas/proveedores').then(r => r.json() as Promise<Proveedor[]>),
    crearProveedor: (nombre: string) =>
      authFetch('/facturas/proveedores', { method: 'POST', json: { nombre } }).then(r => r.json() as Promise<Proveedor>),
    renombrarProveedor: (id: number, nombre: string) =>
      authFetch(`/facturas/proveedores/${id}`, { method: 'PUT', json: { nombre } }).then(r => r.json() as Promise<Proveedor>),
    quitarProveedor: (id: number) => authFetch(`/facturas/proveedores/${id}`, { method: 'DELETE' }).then(() => undefined),
    crear: (body: { restaurantId: number; proveedorId?: number; proveedor?: string; numero?: string; nota?: string }) =>
      authFetch('/facturas', { method: 'POST', json: body }).then(r => r.json() as Promise<Factura>),
    subirPagina: (id: number, jpeg: Blob) =>
      authFetch(`/facturas/${id}/paginas`, { method: 'POST', body: jpeg, contentType: 'image/jpeg' }).then(r => r.json() as Promise<Factura>),
    enviar: (id: number) =>
      authFetch(`/facturas/${id}/enviar`, { method: 'PATCH', json: {} }).then(r => r.json() as Promise<Factura>),
    setEstado: (id: number, estado: 'pendiente' | 'revisada') =>
      authFetch(`/facturas/${id}`, { method: 'PATCH', json: { estado } }).then(r => r.json() as Promise<Factura>),
    delete: (id: number) => authFetch(`/facturas/${id}`, { method: 'DELETE' }).then(() => undefined),
    pagina: (id: number, n: number) => authFetch(`/facturas/${id}/paginas/${n}`).then(r => r.blob()),
    pdf: (id: number) => authFetch(`/facturas/${id}/pdf`).then(r => r.blob()),
  },
  // Red del local: operar la sala solo desde la red del restaurante (la aprende el latido de la Pi)
  red: {
    estado: () => get<{ restaurantId: number | null; restringido: boolean; enLocal: boolean }>('/red/estado'),
    admin: () => authFetch('/admin/red').then(r => r.json() as Promise<RedAdmin>),
    restringir: (restaurantId: number, restringirPorRed: boolean) => authFetch(`/admin/red/${restaurantId}`, { method: 'PATCH', json: { restringirPorRed } }).then(() => undefined),
    quitarRed: (id: number) => authFetch(`/admin/red/redes/${id}`, { method: 'DELETE' }).then(() => undefined),
  },
  restaurantes: {
    list: () => get<Restaurante[]>('/restaurantes'),
    crear: (nombre: string) => authFetch('/admin/restaurantes', { method: 'POST', json: { nombre } }).then(r => r.json() as Promise<Restaurante>),
    renombrar: (id: number, nombre: string) => authFetch(`/admin/restaurantes/${id}`, { method: 'PUT', json: { nombre } }).then(r => r.json() as Promise<Restaurante>),
  },
  empleados: {
    list:   (tipo?: 'cocina' | 'sala') => get<Empleado[]>(`/empleados${tipo ? `?tipo=${tipo}` : ''}`),
    darBadge: (id: number, body: BadgeBody) =>
      authFetch(`/empleados/${id}/badge`, { method: 'POST', json: body }).then(r => r.json() as Promise<{ codigo: string; url: string; avisado: boolean }>),
    // restaurantId: el local del dispositivo; la sesión queda atada a él (ver "red del local")
    // `local` solo viene de la nube y si el local tiene Box: dónde está y el pase que vale en ella
    auth:   (pin: string, restaurantId?: number) => post<Empleado & { token?: string; local?: { url: string; token: string } }>('/empleados/auth', { pin, restaurantId }).then(e => {
      tokenEmpleadoEfimero = e.token ?? null
      guardarBox(e.local?.url ?? null)
      return e
    }),
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
    // Reparto desde la app de sala: turnos cerrados del local de la sesión (encargado)
    encargado: {
      turnos: () => get<TurnoParaPropina[]>('/propinas/encargado/turnos'),
      empleados: () => get<{ id: number; nombre: string; tipo: string }[]>('/propinas/encargado/empleados'),
      repartir: (turnoId: number, body: { efectivo: number; tarjeta: number; turnos: { empleadoId: number; horas: number }[] }) =>
        put<unknown>(`/propinas/encargado/turnos/${turnoId}`, body),
    },
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
  alergenos: {
    list:   () => get<Alergeno[]>('/alergenos'),
    create: (body: { nombre: string; nombreEn?: string; icono?: string }) => post<Alergeno>('/alergenos', body),
    update: (id: number, body: Partial<{ nombre: string; nombreEn: string; icono: string; orden: number }>) => put<Alergeno>(`/alergenos/${id}`, body),
    delete: (id: number) => del(`/alergenos/${id}`),
  },
  menuCategorias: {
    list:   (restaurantId: number | null) => get<MenuCategoria[]>(`/menu/categorias${restaurantId !== null ? `?restaurantId=${restaurantId}` : ''}`),
    create: (body: { restaurantId: number | null; grupo?: string; nombre: string; icono?: string; orden?: number; parentId?: number | null; asistente?: '' | 'vinos' }) =>
      post<MenuCategoria>('/menu/categorias', body),
    update: (id: number, body: Partial<{ grupo: string; nombre: string; icono: string; orden: number; ordenAlfabetico: boolean; nombreEnTicket: boolean; asistente: '' | 'vinos' }>) =>
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
    create: (body: Omit<MenuItem, 'id' | 'activo' | 'autoPorPax' | 'ficha' | 'alergenoIds' | 'alergenosNota' | 'ocultoEnCarta' | 'combinable' | 'precioCombinado' | 'esMixer' | 'suplementoMixer'> & Partial<Pick<MenuItem, 'ficha' | 'alergenoIds' | 'alergenosNota' | 'ocultoEnCarta' | 'combinable' | 'precioCombinado' | 'esMixer' | 'suplementoMixer'>>) => post<MenuItem>('/menu', body),
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
      diff: number | null; fecha: string | null; ventanaInicio: string | null
      negativasNuevas: { rating: number; text: string; author: string; time: number }[]
      posibleOculta: boolean
      totalMes: number | null; tasa: number | null; paxMes: number; objetivoDinamico: number | null
    }[]>('/reviews'),
    historial: (restaurantId: number) => get<{ fecha: string; diff: number }[]>(`/reviews/historial?restaurantId=${restaurantId}`),
    turno: (restaurantId: number, desde: string) =>
      get<{ pax: number; diff: number | null; objetivo: number | null; tasa: number | null; total: number | null; rating: number | null }>(`/reviews/turno?restaurantId=${restaurantId}&desde=${encodeURIComponent(desde)}`),
    setObjetivo: (restaurantId: number, tasa: number) => patch<{ restaurantId: number; tasa: number | null }>('/reviews/objetivo', { restaurantId, tasa }),
    setActivo: (restaurantId: number, activo: boolean) => patch<{ restaurantId: number; activo: boolean }>('/reviews/activo', { restaurantId, activo }),
  },
  comandas: {
    // desde (ISO): con estado=cerrada, solo las cobradas a partir de ese momento (las del turno)
    list:      (restaurantId: number, estado?: string, desde?: string) =>
      get<Comanda[]>(`/comandas?restaurantId=${restaurantId}${estado ? `&estado=${estado}` : ''}${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`),
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
    paraCocina:(id: number, datos: { noComparten?: boolean; notaMesa?: string }) => patch<Comanda>(`/comandas/${id}/para-cocina`, datos),
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
  // Platos que se acabaron en el servicio (por local). Marcar y reponer: solo encargado.
  gastos: {
    habituales: (restaurantId: number) => get<GastoHabitual[]>(`/gastos/habituales?restaurantId=${restaurantId}`),
    delTurno: (restaurantId: number) => get<{ desde: string; hoy: Gasto[]; pendientes: Gasto[]; efectivo: number }>(`/gastos?restaurantId=${restaurantId}`),
    apuntar: (body: { restaurantId: number; habitualId?: number | null; nombre?: string; lineas: Gasto['lineas']; importe: number | null; pago: PagoGasto }) =>
      post<Gasto>('/gastos', body),
    borrar: (id: number) => del(`/gastos/${id}`),
    pagar: (id: number, body: { importe?: number | null; con: 'efectivo' | 'otro' }) => patch<Gasto>(`/gastos/${id}/pagar`, body),
    // admin
    habitualesAdmin: (restaurantId?: number) => get<GastoHabitual[]>(`/admin/gastos/habituales${restaurantId ? `?restaurantId=${restaurantId}` : ''}`),
    crearHabitual: (body: GastoHabitualBody) => post<GastoHabitual>('/admin/gastos/habituales', body),
    editarHabitual: (id: number, body: GastoHabitualBody) => put<GastoHabitual>(`/admin/gastos/habituales/${id}`, body),
    borrarHabitual: (id: number) => del(`/admin/gastos/habituales/${id}`),
    mes: (mes: string, restaurantId?: number) =>
      get<{ gastos: Gasto[]; pendientes: Gasto[] }>(`/admin/gastos?mes=${mes}${restaurantId ? `&restaurantId=${restaurantId}` : ''}`),
    pagarAdmin: (id: number, body: { importe?: number | null; con: 'efectivo' | 'otro' }) => patch<Gasto>(`/admin/gastos/${id}/pagar`, body),
    borrarAdmin: (id: number) => del(`/admin/gastos/${id}`),
  },
  agotados: {
    list:    (restaurantId: number) => get<ItemAgotado[]>(`/agotados?restaurantId=${restaurantId}`),
    marcar:  (restaurantId: number, menuItemId: number) => post<unknown>('/agotados', { restaurantId, menuItemId }),
    reponer: (restaurantId: number, menuItemId: number) => del(`/agotados/${menuItemId}?restaurantId=${restaurantId}`),
  },
  maridajes: {
    sala:       (restaurantId: number) => get<MaridajesSala>(`/maridajes?restaurantId=${restaurantId}`),
    admin:      () => get<MaridajesAdmin>('/admin/maridajes'),
    recalcular: (soloNuevos: boolean) => post<unknown>('/admin/maridajes/recalcular', { soloNuevos }),
    editar:     (id: number, body: Partial<{ puntos: number; oculto: boolean; motivo: string; motivoEn: string; editado: boolean }>) =>
      patch<ParejaMaridajeAdmin>(`/admin/maridajes/${id}`, body),
    editarPerfil: (vinoId: number, body: Partial<PerfilVino & { editado: boolean }>) =>
      patch<unknown>(`/admin/maridajes/perfil/${vinoId}`, body),
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
    // forzar: cerrar aunque la Oído Box tenga mesas sin sincronizar (ver esAvisoBox)
    cerrar:    (id: number, forzar = false) => patch<Turno>(`/turnos/${id}/cerrar`, forzar ? { forzar } : {}),
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
    asignarMesa: (id: number, mesaId: number | null) => patch<Reserva>(`/reservas/${id}/mesa`, { mesaId }),
    sentar: (id: number, mesaId: number | undefined, camareroNombre?: string) =>
      patch<{ reserva: Reserva; comanda: Comanda }>(`/reservas/${id}/sentar`, { mesaId, camareroNombre }),
    delete: (id: number) => del(`/reservas/${id}`),
    getPublicConfig: (slug: string) => get<{ restaurantNombre: string; slug: string; activo: boolean; maxPaxPorSlot: number; duracionMin: number; diasAntelacion: number; horarios: ReservaHorario[] }>(`/reservas/publica/config?slug=${slug}`),
    getSlots: (slug: string, fecha: string, pax: number) => get<SlotDisponible[]>(`/reservas/publica/slots?slug=${slug}&fecha=${fecha}&pax=${pax}`),
    createPublica: (body: { slug: string; fecha: string; hora: string; pax: number; nombre: string; telefono: string; email?: string; notas?: string }) => post<Reserva>('/reservas/publica', body),
    poolList: () => get<Reserva[]>('/reservas/pool'),
    poolEnviar: (id: number, motivo?: string) => patch<Reserva>(`/reservas/${id}/pool`, { motivo }),
    poolCancelar: (id: number) => patch<Reserva>(`/reservas/${id}/pool/cancelar`, {}),
    poolGestionar: (id: number, encargado: string) => patch<Reserva>(`/reservas/${id}/pool/gestionar`, { encargado }),
    poolLiberar: (id: number) => patch<Reserva>(`/reservas/${id}/pool/liberar`, {}),
    poolTomar: (id: number, restaurantId: number, encargado: string) => patch<Reserva>(`/reservas/${id}/pool/tomar`, { restaurantId, encargado }),
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
    // Raspberry Pi vinculada (codigo null = desvincular)
    getPi: (restaurantId: number) => get<PiVinculada>(`/tickets/pi?restaurantId=${restaurantId}`),
    setPi: (restaurantId: number, codigo: string | null) =>
      put<PiVinculada>('/tickets/pi', { restaurantId, codigo }),
    getDetectadas: (restaurantId: number) =>
      get<ImpresorasDetectadas>(`/tickets/pi/impresoras?restaurantId=${restaurantId}`),
    escanear: (restaurantId: number) => post<{ ok: true }>('/tickets/pi/escanear', { restaurantId }),
    probarImpresora: (restaurantId: number, ip: string) =>
      post<{ ok: true }>('/tickets/pi/probar', { restaurantId, ip }),
    // Impresoras
    listImpresoras:   (restaurantId: number) =>
      get<Impresora[]>(`/tickets/impresoras?restaurantId=${restaurantId}`),
    createImpresora:  (body: { restaurantId: number; nombre: string; ip: string; mac?: string | null }) =>
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
