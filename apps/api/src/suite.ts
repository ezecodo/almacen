// Esta instalación dentro de la suite: quién es y cómo le pregunta cosas al back-office (HQ).
// Lo escribe el alta en el .env: INSTALACION_CODIGO (el identificador del cliente), HQ_URL y
// SUITE_TOKEN. Sin HQ_URL (desarrollo en local) no se comprueba nada.

const HQ_URL = process.env.HQ_URL
const SUITE_TOKEN = process.env.SUITE_TOKEN
const INSTALACION_CODIGO = process.env.INSTALACION_CODIGO

type Permiso = { ok: true } | { ok: false; status: number; error: string }

// ¿Puede esta instalación vincular esa Pi? Solo si en el back-office está asignada a un local de
// este cliente. Así nadie vincula la Pi de otro grupo con solo conocer su código.
export async function piPermitida(piCodigo: string): Promise<Permiso> {
  if (!HQ_URL) return { ok: true }
  if (!SUITE_TOKEN || !INSTALACION_CODIGO) {
    return { ok: false, status: 503, error: 'Esta instalación no está enlazada con Oído: no se puede comprobar la Pi.' }
  }
  let cliente: string | null
  try {
    const res = await fetch(`${HQ_URL}/api/interno/pis/${encodeURIComponent(piCodigo)}`, {
      headers: { 'X-Suite-Token': SUITE_TOKEN },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HQ respondió ${res.status}`)
    cliente = ((await res.json()) as { cliente: string | null }).cliente
  } catch (err) {
    console.error('[suite] no se pudo comprobar la Pi', piCodigo, err)
    return { ok: false, status: 503, error: 'No se pudo comprobar esa Pi en este momento. Prueba de nuevo en un minuto.' }
  }
  // Mismo mensaje si no existe o si es de otro grupo: no se revela de quién es
  if (cliente !== INSTALACION_CODIGO) {
    return { ok: false, status: 403, error: 'Esa Pi no está asignada a tu grupo. Pídele a Oído que la asigne a tu local y vuelve a intentarlo.' }
  }
  return { ok: true }
}

// ── Badges de Oído Talent ──────────────────────────────────────────────────────────────────────
// Un cliente de la suite da badges a su gente desde el módulo Empleados, sin registrarse en Talent:
// se piden al back-office, que los firma y le avisa al trabajador por correo.
export interface BadgePedido {
  local: { nombre: string; restaurantId: number }
  badge: {
    tipo: 'BASIC' | 'GOLD'
    trabajador: { nombre: string; apellido: string; email: string }
    rol: string
    fechaInicio: string
    fechaFin: string | null
    endorsement: { skills: string[]; nota: string }
  }
}
type BadgeResultado =
  | { ok: true; codigo: string; url: string; avisado: boolean }
  | { ok: false; status: number; error: string }

export async function pedirBadge(pedido: BadgePedido): Promise<BadgeResultado> {
  if (!HQ_URL || !SUITE_TOKEN || !INSTALACION_CODIGO) {
    return { ok: false, status: 503, error: 'Esta instalación no está enlazada con Oído: no se pueden dar badges.' }
  }
  try {
    const res = await fetch(`${HQ_URL}/api/interno/badges`, {
      method: 'POST',
      headers: { 'X-Suite-Token': SUITE_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente: INSTALACION_CODIGO, ...pedido }),
      signal: AbortSignal.timeout(15000),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string; campos?: Record<string, string[]>; codigo?: string; url?: string; avisado?: boolean }
    if (!res.ok || !data.codigo || !data.url) {
      const campo = data.campos ? Object.values(data.campos).flat()[0] : undefined
      return { ok: false, status: res.status >= 400 && res.status < 500 ? res.status : 502, error: campo ?? data.error ?? 'Oído Talent no pudo emitir el badge' }
    }
    return { ok: true, codigo: data.codigo, url: data.url, avisado: Boolean(data.avisado) }
  } catch (err) {
    console.error('[suite] no se pudo pedir el badge', err)
    return { ok: false, status: 503, error: 'No se pudo conectar con Oído Talent. Prueba de nuevo en un minuto.' }
  }
}
