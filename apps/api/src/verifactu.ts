import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './server'
import type { LineaTicket } from './ticket-dibujo'

// Registro de facturación Veri*factu (RD 1007/2023, Orden HAC/1177/2024). Una factura simplificada
// (F2) nace al cobrar la mesa; si después se deshace el cobro y se vuelve a cobrar por otro importe,
// nace una rectificativa por diferencias (R5). Cada registro lleva la huella SHA-256 del anterior del
// mismo emisor, con el formato oficial de la AEAT (docs/verifactu.md, 4.1; mismo cálculo que el
// monitor /admin/verifactu, comprobado con el ejemplo oficial). Todavía no se envía nada a la AEAT:
// en modo 'pruebas' el QR apunta a su entorno de pruebas y el ticket lo dice.

const URL_COTEJO = {
  pruebas:    'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
} as const
export type ModoVerifactu = keyof typeof URL_COTEJO
export const modoDe = (m: string | null | undefined): ModoVerifactu => (m === 'produccion' ? 'produccion' : 'pruebas')

// Fecha de expedición (DD-MM-AAAA) y fecha, hora y huso del registro (AAAA-MM-DDTHH:MM:SS+HH:MM), en Madrid
export function momentoAEAT(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]))
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  const min = Math.round((comoUTC - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
  const huso = `${min >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(min) / 60)).padStart(2, '0')}:${String(Math.abs(min) % 60).padStart(2, '0')}`
  return {
    fechaExpedicion: `${p.day}-${p.month}-${p.year}`,
    fechaHora: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${huso}`,
  }
}

export function cadenaHuella(r: { nif: string; numSerie: string; fechaExpedicion: string; tipo: string; cuota: number; importe: number; huellaAnterior: string; fechaHora: string }) {
  return `IDEmisorFactura=${r.nif}&NumSerieFactura=${r.numSerie}&FechaExpedicionFactura=${r.fechaExpedicion}` +
    `&TipoFactura=${r.tipo}&CuotaTotal=${r.cuota.toFixed(2)}&ImporteTotal=${r.importe.toFixed(2)}` +
    `&Huella=${r.huellaAnterior}&FechaHoraHusoGenRegistro=${r.fechaHora}`
}

export const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex').toUpperCase()

export function urlQR(r: { modo: string; nif: string; numSerie: string; fechaExpedicion: string; importe: number }) {
  const q = new URLSearchParams({ nif: r.nif, numserie: r.numSerie, fecha: r.fechaExpedicion, importe: r.importe.toFixed(2) })
  return `${URL_COTEJO[modoDe(r.modo)]}?${q}`
}

const red = (n: number) => Math.round(n * 100) / 100

// Emite un registro: número siguiente de la serie y huella encadenada a la última del emisor. Un
// candado de la base por NIF pone en fila los cobros simultáneos, así la cadena nunca se bifurca.
export async function emitirRegistro(d: {
  nif: string
  serie: string
  tipo: 'F2' | 'R5'
  rectificaA?: string
  restaurantId: number
  comandaId: number | null
  mesa: string | null
  camarero: string | null
  pago: string | null
  tasaIva: number
  importe: number
  lineas: LineaTicket[]
  modo: ModoVerifactu
}) {
  const importe = red(d.importe)
  const base = red(importe / (1 + d.tasaIva / 100))
  const cuota = red(importe - base)
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`verifactu:${d.nif}`}))::text`
    const previo = await tx.registroFactura.findFirst({ where: { nif: d.nif }, orderBy: { id: 'desc' }, select: { huella: true } })
    const ultimo = await tx.registroFactura.findFirst({ where: { nif: d.nif, serie: d.serie }, orderBy: { numero: 'desc' }, select: { numero: true } })
    const numero = (ultimo?.numero ?? 0) + 1
    const numSerie = `${d.serie}-${String(numero).padStart(6, '0')}`
    const { fechaExpedicion, fechaHora } = momentoAEAT()
    const huellaAnterior = previo?.huella ?? ''
    const huella = sha256(cadenaHuella({ nif: d.nif, numSerie, fechaExpedicion, tipo: d.tipo, cuota, importe, huellaAnterior, fechaHora }))
    return tx.registroFactura.create({
      data: {
        nif: d.nif, serie: d.serie, numero, numSerie, tipo: d.tipo, rectificaA: d.rectificaA ?? null,
        restaurantId: d.restaurantId, comandaId: d.comandaId, mesa: d.mesa, camarero: d.camarero, pago: d.pago,
        tasaIva: d.tasaIva, base, cuota, importe, lineas: d.lineas as unknown as Prisma.InputJsonValue,
        fechaHora, fechaExpedicion, huellaAnterior, huella, modo: d.modo,
      },
    })
  })
}
