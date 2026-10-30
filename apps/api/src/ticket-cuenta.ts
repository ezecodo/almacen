import { z } from 'zod'
import type { ComandaItem, EmpresaConfig, TicketConfig } from '@prisma/client'
import { prisma } from './server'
import type { LineaTicket, TicketDibujo } from './ticket-dibujo'
import { totalCobrable } from './pago'
import { urlQR } from './verifactu'

// Diseño de la cuenta y de la factura simplificada de cada local (TicketConfig.diseno), editable en
// /admin/tickets con la vista previa al lado. Lo que no viene en el JSON toma el valor por defecto,
// así un local sin tocar sale como el ticket que daba el sistema anterior de Sensi.

const bloqueSchema = z.object({
  nombre: z.string().max(40).default(''),
  // pax = lo que se cobra por comensal (pan × pax); barra / cocina = por dónde sale el plato;
  // categorias = las categorías de la carta elegidas (ganan a barra/cocina: así un bloque "Cafés"
  // se lleva los cafés aunque sean de barra)
  tipo: z.enum(['pax', 'barra', 'cocina', 'categorias']),
  categorias: z.array(z.string()).max(60).default([]),
})
export type BloqueOrden = z.infer<typeof bloqueSchema>

export const disenoSchema = z.object({
  cabecera: z.object({
    logo:        z.boolean().default(true),
    direccion:   z.boolean().default(true),
    telefono:    z.boolean().default(true),
    razonSocial: z.boolean().default(true),
    nif:         z.boolean().default(true),
  }).default({}),
  mesa: z.object({
    pax:      z.boolean().default(false),
    camarero: z.boolean().default(true),
  }).default({}),
  precioUnitario: z.boolean().default(true),
  desgloseIva:    z.boolean().default(false), // base imponible además de la cuota
  orden: z.array(bloqueSchema).max(12).default([
    { nombre: 'Pan', tipo: 'pax', categorias: [] },
    { nombre: 'Bebidas', tipo: 'barra', categorias: [] },
    { nombre: 'Comida', tipo: 'cocina', categorias: [] },
  ]),
  cuenta: z.object({
    rotulo:        z.string().max(60).default('CUENTA · NO ES FACTURA'),
    lineasPropina: z.boolean().default(true),
  }).default({}),
  factura: z.object({
    imprimirAlCobrar: z.boolean().default(true),
    lineasPropina:    z.boolean().default(false),
  }).default({}),
  // Serie de las facturas de este local (el número sigue solo, correlativo y sin saltos)
  serie: z.string().regex(/^[A-Z0-9]{1,10}$/).optional(),
})
export type Diseno = z.infer<typeof disenoSchema>

export const disenoDe = (json: unknown): Diseno => {
  const r = disenoSchema.safeParse(json ?? {})
  return r.success ? r.data : disenoSchema.parse({})
}

export const serieDe = (restaurantId: number, d: Diseno) => d.serie ?? `L${restaurantId}`

type ItemOrdenable = Pick<ComandaItem, 'id' | 'nombre' | 'precio' | 'cantidad' | 'invitacion' | 'autoGenerado' | 'ronda' | 'tipo' | 'menuItemId'>

// Ordena los platos por los bloques del diseño (dentro de cada bloque, como se pidieron) y junta las
// líneas iguales. Lo que va a 0 € sin ser invitación (platos de un menú de grupo, que se cobran en la
// línea del menú) no sale. Un plato que no cae en ningún bloque va al final.
export async function lineasOrdenadas(restaurantId: number, items: ItemOrdenable[], orden: BloqueOrden[]): Promise<LineaTicket[]> {
  const porCategorias = orden.some(b => b.tipo === 'categorias' && b.categorias.length)
  const categoriasDe = new Map<number, string[]>() // menuItemId → [categoría, categoría padre]
  if (porCategorias) {
    const ids = [...new Set(items.map(i => i.menuItemId).filter((x): x is number => x != null))]
    const platos = await prisma.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, categoria: true } })
    const cats = await prisma.menuCategoria.findMany({
      where: { nombre: { in: platos.map(p => p.categoria) }, OR: [{ restaurantId }, { restaurantId: null }] },
      select: { nombre: true, parent: { select: { nombre: true } } },
    })
    const padre = new Map(cats.map(c => [c.nombre, c.parent?.nombre]))
    for (const p of platos) categoriasDe.set(p.id, [p.categoria, padre.get(p.categoria)].filter((x): x is string => !!x))
  }

  const bloqueDe = (i: ItemOrdenable) => {
    const cats = i.menuItemId != null ? categoriasDe.get(i.menuItemId) ?? [] : []
    const porCat = orden.findIndex(b => b.tipo === 'categorias' && b.categorias.some(c => cats.includes(c)))
    if (porCat >= 0) return porCat
    const esPax = i.autoGenerado && i.ronda === 0
    const k = orden.findIndex(b => (esPax && b.tipo === 'pax') || (!esPax && b.tipo === i.tipo))
    if (k >= 0) return k
    if (esPax) { const t = orden.findIndex(b => b.tipo === i.tipo); if (t >= 0) return t }
    return orden.length
  }

  const lineas = new Map<string, LineaTicket>()
  for (const i of [...items].sort((a, b) => bloqueDe(a) - bloqueDe(b) || a.id - b.id)) {
    if (i.precio === 0 && !i.invitacion) continue
    const clave = `${i.nombre}|${i.precio}|${i.invitacion}`
    const l = lineas.get(clave) ?? { cantidad: 0, nombre: i.nombre, precio: i.precio, importe: 0, invitacion: i.invitacion }
    l.cantidad += i.cantidad
    l.importe = l.invitacion ? 0 : Math.round(l.precio * l.cantidad * 100) / 100
    lineas.set(clave, l)
  }
  return [...lineas.values()]
}

export const redondear = (n: number) => Math.round(n * 100) / 100

export function ivaDe(total: number, tasa: number) {
  const base = redondear(total / (1 + tasa / 100))
  return { tasa, base, cuota: redondear(total - base) }
}

// Lo común a la cuenta y a la factura: cabecera, mesa y pie según el diseño del local
export function baseTicket(o: {
  restaurante: string
  config: TicketConfig | null
  empresa: EmpresaConfig | null
  diseno: Diseno
  logo?: string | null // la vista previa manda el logo sin guardar
  mesa: string
  pax: number
  camarero: string | null
  fecha: Date
}): Pick<TicketDibujo, 'logo' | 'nombre' | 'cabecera' | 'mesa' | 'pax' | 'camarero' | 'fecha' | 'precioUnitario' | 'pie'> {
  const { config, empresa, diseno: d } = o
  const logo = o.logo !== undefined ? o.logo : config?.logo ?? null
  return {
    logo: d.cabecera.logo ? logo : null,
    nombre: config?.nombreComercial || o.restaurante,
    cabecera: [
      d.cabecera.direccion && config?.direccion,
      d.cabecera.telefono && config?.telefono && `Tel. ${config.telefono}`,
      d.cabecera.razonSocial && empresa?.razonSocial,
      d.cabecera.nif && empresa?.nif && `NIF ${empresa.nif}`,
    ].filter((l): l is string => !!l),
    mesa: o.mesa,
    pax: d.mesa.pax ? o.pax : null,
    camarero: d.mesa.camarero && o.camarero ? o.camarero.split(' ')[0] : null,
    fecha: o.fecha,
    precioUnitario: d.precioUnitario,
    pie: config?.mensajePieOverride ?? empresa?.mensajePie ?? '',
  }
}

// La cuenta (precuenta) de una comanda, lista para dibujar
export async function ticketCuenta(o: {
  restaurantId: number
  restaurante: string
  config: TicketConfig | null
  empresa: EmpresaConfig | null
  diseno: Diseno
  logo?: string | null
  mesa: string
  pax: number
  camarero: string | null
  fecha: Date
  items: ItemOrdenable[]
  pagado: number
}): Promise<TicketDibujo> {
  const total = redondear(totalCobrable(o.items))
  const tasa = o.empresa?.tasaIva ?? 10
  return {
    ...baseTicket(o),
    tipo: 'cuenta',
    rotulo: o.diseno.cuenta.rotulo,
    numero: null,
    rectificaA: null,
    lineas: await lineasOrdenadas(o.restaurantId, o.items, o.diseno.orden),
    iva: { ...ivaDe(total, tasa), desglose: o.diseno.desgloseIva },
    total,
    pagado: redondear(o.pagado),
    pago: null,
    lineasPropina: o.diseno.cuenta.lineasPropina,
    qr: null,
  }
}

const TEXTO_PAGO: Record<string, string> = { cash: 'EFECTIVO', tarjeta: 'TARJETA', mixto: 'EFECTIVO Y TARJETA' }

// La factura simplificada (o la rectificativa) tal como quedó registrada: se dibuja siempre desde el
// registro, no desde la comanda, así una reimpresión sale idéntica aunque la mesa cambie después
export function ticketFactura(o: {
  registro: {
    tipo: string; numSerie: string; rectificaA: string | null; mesa: string | null; camarero: string | null
    pago: string | null; tasaIva: number; base: number; cuota: number; importe: number; lineas: unknown
    nif: string; fechaExpedicion: string; modo: string; createdAt: Date
  }
  restaurante: string
  config: TicketConfig | null
  empresa: EmpresaConfig | null
  diseno: Diseno
  logo?: string | null
  pax: number
}): TicketDibujo {
  const r = o.registro
  return {
    ...baseTicket({ ...o, mesa: r.mesa ?? '-', camarero: r.camarero, fecha: r.createdAt }),
    tipo: 'factura',
    rotulo: r.tipo === 'R5' ? 'FACTURA RECTIFICATIVA' : 'FACTURA SIMPLIFICADA',
    numero: r.numSerie,
    rectificaA: r.rectificaA,
    lineas: (Array.isArray(r.lineas) ? r.lineas : []) as LineaTicket[],
    iva: { tasa: r.tasaIva, base: r.base, cuota: r.cuota, desglose: o.diseno.desgloseIva },
    total: r.importe,
    pagado: 0,
    pago: r.pago ? TEXTO_PAGO[r.pago] ?? r.pago.toUpperCase() : null,
    lineasPropina: r.tipo === 'F2' && o.diseno.factura.lineasPropina,
    qr: { url: urlQR({ modo: r.modo, nif: r.nif, numSerie: r.numSerie, fechaExpedicion: r.fechaExpedicion, importe: r.importe }), pruebas: r.modo !== 'produccion' },
  }
}
