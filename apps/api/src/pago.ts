import { z } from 'zod'

// Pagar por separado: el camarero divide la cuenta en la mesa (por igual o cada uno lo suyo) y va
// apuntando cada pago; el encargado cierra la mesa con todo ya sumado. Vive en Comanda.division.

export const pagoParcialSchema = z.object({
  id:       z.string().min(1).max(40),
  importe:  z.number().positive(),           // parte de la cuenta que paga esta persona
  propina:  z.number().min(0).default(0),    // con tarjeta: lo que el ticket pasa de su parte
  metodo:   z.enum(['tarjeta', 'cash']),
  consumo:  z.array(z.object({ itemId: z.number().int(), cant: z.number().positive() })).optional(), // "cada uno lo suyo"
  at:       z.string(),
  por:      z.string().max(80).optional(),
})

export const divisionSchema = z.object({
  quedan: z.number().int().min(1).max(99).optional(), // "por igual": cuántos quedan por pagar
  pagos:  z.array(pagoParcialSchema).max(60),
})

export type Division = z.infer<typeof divisionSchema>

type ItemCobrable = { precio: number; cantidad: number; invitacion: boolean }
export const totalCobrable = (items: ItemCobrable[]) =>
  items.reduce((s, i) => s + (i.invitacion ? 0 : i.precio * i.cantidad), 0)

const cent = (n: number) => Math.round(n * 100)

// Cómo se cierra una mesa dividida: método (o mixto), parte en efectivo y propina sumada.
// Devuelve el error si los pagos no cubren exactamente la cuenta.
export function cierreDeDivision(division: Division, total: number):
  { ok: true; metodoPago: 'cash' | 'tarjeta' | 'mixto'; pagoEfectivo: number | null; propina: number } | { ok: false; error: string } {
  const pagado = division.pagos.reduce((s, p) => s + cent(p.importe), 0)
  const falta = cent(total) - pagado
  if (falta > 0) return { ok: false, error: `Falta pagar ${(falta / 100).toFixed(2)} € de la cuenta dividida` }
  if (falta < 0) return { ok: false, error: `Los pagos suman ${(-falta / 100).toFixed(2)} € más que la cuenta: revisa la división` }
  const efectivo = division.pagos.filter(p => p.metodo === 'cash').reduce((s, p) => s + cent(p.importe), 0) / 100
  const propina = division.pagos.filter(p => p.metodo === 'tarjeta').reduce((s, p) => s + cent(p.propina), 0) / 100
  const metodoPago = efectivo === 0 ? 'tarjeta' : cent(efectivo) === cent(total) ? 'cash' : 'mixto'
  return { ok: true, metodoPago, pagoEfectivo: metodoPago === 'mixto' ? efectivo : null, propina }
}

// Cuánto de una comanda cobrada entró en efectivo y cuánto con tarjeta (las mixtas reparten)
export function repartoPago(c: { metodoPago: string | null; pagoEfectivo: number | null }, total: number) {
  if (c.metodoPago === 'cash') return { efectivo: total, tarjeta: 0 }
  if (c.metodoPago === 'tarjeta') return { efectivo: 0, tarjeta: total }
  if (c.metodoPago === 'mixto') {
    const efectivo = Math.min(total, c.pagoEfectivo ?? 0)
    return { efectivo, tarjeta: total - efectivo }
  }
  return { efectivo: 0, tarjeta: 0 }
}
