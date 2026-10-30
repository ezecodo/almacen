import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from '@napi-rs/canvas'
import QRCode from 'qrcode'

// Dibuja la cuenta y la factura simplificada como una imagen del ancho del papel (80 mm a 203 ppp
// = 576 px), en blanco y negro puro. La Box solo la imprime y la vista previa del admin enseña esta
// misma imagen: lo que se ve es lo que sale. Tipografía DejaVu (libre, la misma de los tickets de
// cocina que dibuja la Box).

export const ANCHO_PX = 576

let fuentesListas = false
function fuentes() {
  if (fuentesListas) return
  GlobalFonts.registerFromPath(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'), 'TicketSans')
  GlobalFonts.registerFromPath(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'), 'TicketSans')
  fuentesListas = true
}

export interface LineaTicket { cantidad: number; nombre: string; precio: number; importe: number; invitacion: boolean }

export interface TicketDibujo {
  tipo: 'cuenta' | 'factura'
  logo: string | null             // PNG en base64; sin logo sale el nombre en grande
  nombre: string
  cabecera: string[]              // dirección, teléfono, razón social, NIF (ya filtrado por el diseño)
  mesa: string
  pax: number | null              // null = no se muestra
  camarero: string | null
  fecha: Date
  rotulo: string                  // cuenta: "CUENTA · NO ES FACTURA"; factura: "FACTURA SIMPLIFICADA"
  numero: string | null           // factura: serie-número
  rectificaA: string | null       // rectificativa: número de la factura que corrige
  lineas: LineaTicket[]
  precioUnitario: boolean
  iva: { tasa: number; base: number; cuota: number; desglose: boolean }
  total: number
  pagado: number                  // cuenta: lo ya pagado por separado
  pago: string | null             // factura: "TARJETA", "EFECTIVO"…
  pie: string
  lineasPropina: boolean
  qr: { url: string; pruebas: boolean } | null
}

const eur = (n: number) => n.toFixed(2).replace('.', ',')

const fecha = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })
const hora = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

const font = (tamano: number, bold = false) => `${bold ? 'bold ' : ''}${tamano}px TicketSans`

// Cada pieza sabe su alto y se dibuja a partir de una y. Primero se mide todo, después se pinta
// en un lienzo del alto justo.
type Pieza = { alto: number; dibujar: (c: SKRSContext2D, y: number) => void }

function partir(c: SKRSContext2D, texto: string, ancho: number): string[] {
  const renglones: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (actual && c.measureText(prueba).width > ancho) { renglones.push(actual); actual = palabra }
    else actual = prueba
  }
  return actual ? [...renglones, actual] : renglones
}

function centrado(m: SKRSContext2D, lineas: string[], tamano: number, bold = false, aire = 6): Pieza {
  m.font = font(tamano, bold)
  const renglones = lineas.flatMap(l => partir(m, l, ANCHO_PX - 20))
  const alto_r = tamano + aire
  return {
    alto: renglones.length * alto_r + 6,
    dibujar: (c, y) => {
      c.font = font(tamano, bold)
      c.textAlign = 'center'
      renglones.forEach((r, n) => c.fillText(r, ANCHO_PX / 2, y + 3 + n * alto_r + tamano * 0.85))
      c.textAlign = 'left'
    },
  }
}

const espacio = (alto: number): Pieza => ({ alto, dibujar: () => {} })

const dobleLinea = (): Pieza => ({
  alto: 14,
  dibujar: (c, y) => { c.fillRect(0, y + 2, ANCHO_PX, 2); c.fillRect(0, y + 8, ANCHO_PX, 2) },
})

function par(izq: string, der: string, tamano: number, bold = false, tamanoDer = tamano): Pieza {
  const alto = Math.max(tamano, tamanoDer) + 14
  return {
    alto,
    dibujar: (c, y) => {
      const base = y + alto - 8
      c.font = font(tamano, bold)
      c.fillText(izq, 6, base)
      c.font = font(tamanoDer, bold)
      c.textAlign = 'right'
      c.fillText(der, ANCHO_PX - 6, base)
      c.textAlign = 'left'
    },
  }
}

function mesaYFecha(t: TicketDibujo): Pieza {
  const derecha = [`${fecha(t.fecha)}  ${hora(t.fecha)}`, t.camarero, t.pax ? `${t.pax} pax` : null].filter((x): x is string => !!x)
  const alto_r = 32
  const alto = Math.max(56, derecha.length * alto_r) + 12
  return {
    alto,
    dibujar: (c, y) => {
      c.font = font(48, true)
      c.fillText(`MESA ${t.mesa}`, 6, y + alto / 2 + 17)
      c.font = font(25)
      c.textAlign = 'right'
      const y0 = y + (alto - derecha.length * alto_r) / 2
      derecha.forEach((txt, n) => c.fillText(txt, ANCHO_PX - 6, y0 + n * alto_r + 24))
      c.textAlign = 'left'
    },
  }
}

// Columnas: cantidad | plato (en renglones) | precio | importe. Sin precio unitario, el plato gana ese sitio.
function lineaPlato(m: SKRSContext2D, l: LineaTicket, precioUnitario: boolean): Pieza {
  const tamano = 25
  const xNombre = 52
  const finImporte = ANCHO_PX - 4
  const finPrecio = 472
  const finNombre = precioUnitario ? 380 : 470
  m.font = font(tamano)
  const renglones = partir(m, l.nombre, finNombre - xNombre)
  const alto_r = tamano + 7
  const alto = renglones.length * alto_r + (l.invitacion ? 24 : 0) + 4
  return {
    alto,
    dibujar: (c, y) => {
      const base = y + 2 + tamano * 0.85
      c.font = font(tamano)
      c.textAlign = 'right'
      c.fillText(String(l.cantidad), xNombre - 14, base)
      if (precioUnitario) c.fillText(eur(l.precio), finPrecio, base)
      c.fillText(eur(l.importe), finImporte, base)
      c.textAlign = 'left'
      renglones.forEach((r, n) => c.fillText(r, xNombre, base + n * alto_r))
      if (l.invitacion) {
        c.font = font(19, true)
        c.fillText('INVITACIÓN', xNombre, base + renglones.length * alto_r - 4)
      }
    },
  }
}

function lineaPropina(texto: string): Pieza {
  return {
    alto: 56,
    dibujar: (c, y) => {
      const xRaya = ANCHO_PX - 210
      c.font = font(26, true)
      c.textAlign = 'right'
      c.fillText(texto, xRaya - 14, y + 46)
      c.textAlign = 'left'
      c.fillRect(xRaya, y + 48, ANCHO_PX - 8 - xRaya, 2)
    },
  }
}

function logo(img: Image): Pieza {
  const escala = Math.min(1, ANCHO_PX / img.width)
  const w = Math.round(img.width * escala), h = Math.round(img.height * escala)
  return { alto: h, dibujar: (c, y) => c.drawImage(img, (ANCHO_PX - w) / 2, y, w, h) }
}

// QR tributario: entre 30 y 40 mm (35 mm ≈ 280 px), nivel de corrección M, con su leyenda encima
function qr(url: string): Pieza {
  const datos = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = datos.modules.size
  const modulo = Math.floor(280 / n)
  const lado = modulo * n
  const margen = modulo * 4 // zona en blanco que el lector necesita alrededor
  return {
    alto: lado + margen * 2,
    dibujar: (c, y) => {
      const x0 = Math.round((ANCHO_PX - lado) / 2)
      for (let f = 0; f < n; f++) for (let k = 0; k < n; k++) {
        if (datos.modules.get(f, k)) c.fillRect(x0 + k * modulo, y + margen + f * modulo, modulo, modulo)
      }
    },
  }
}

export async function dibujarTicket(t: TicketDibujo): Promise<Buffer> {
  fuentes()
  const m = createCanvas(10, 10).getContext('2d')
  const piezas: Pieza[] = [espacio(16)]

  let imagenLogo: Image | null = null
  if (t.logo) {
    try { imagenLogo = await loadImage(Buffer.from(t.logo, 'base64')) } catch { imagenLogo = null }
  }
  piezas.push(imagenLogo ? logo(imagenLogo) : centrado(m, [t.nombre], 44, true))
  if (t.cabecera.length) piezas.push(espacio(14), centrado(m, t.cabecera, 24))
  piezas.push(espacio(18), mesaYFecha(t))
  if (t.rotulo) piezas.push(centrado(m, [t.rotulo], 24, true))
  if (t.numero) piezas.push(centrado(m, [`Nº ${t.numero}`], 28, true))
  if (t.rectificaA) piezas.push(centrado(m, [`Rectifica la factura Nº ${t.rectificaA}`], 22))

  piezas.push(dobleLinea())
  for (const l of t.lineas) piezas.push(lineaPlato(m, l, t.precioUnitario))
  piezas.push(dobleLinea())

  const tasa = `${Number.isInteger(t.iva.tasa) ? t.iva.tasa : t.iva.tasa.toFixed(1).replace('.', ',')}%`
  if (t.iva.desglose) piezas.push(par('BASE IMPONIBLE', eur(t.iva.base), 26))
  piezas.push(par(`IVA/VAT ${tasa}`, eur(t.iva.cuota), 26))
  piezas.push(par('TOTAL', eur(t.total), 34, true, 44))
  piezas.push(dobleLinea())

  if (t.tipo === 'cuenta') {
    if (t.pagado > 0) piezas.push(par('PAGADO', eur(t.pagado), 26))
    piezas.push(par('PENDIENTE DE COBRO', eur(Math.max(0, t.total - t.pagado)), 26, true))
  } else if (t.pago) {
    piezas.push(par(t.total < 0 ? 'DEVUELTO EN' : 'PAGADO CON', t.pago, 26, true))
  }

  if (t.pie) piezas.push(espacio(20), centrado(m, [t.pie], 28, true))
  if (t.lineasPropina) piezas.push(lineaPropina('SERVICE/TIPS:'), lineaPropina('TOTAL:'))

  if (t.qr) {
    piezas.push(espacio(16), centrado(m, ['QR tributario:'], 24, true), qr(t.qr.url))
    if (t.qr.pruebas) piezas.push(centrado(m, ['MODO PRUEBAS · no se envía a la AEAT'], 20, true))
  }
  piezas.push(espacio(24))

  const alto = piezas.reduce((s, p) => s + p.alto, 0)
  const lienzo = createCanvas(ANCHO_PX, alto)
  const c = lienzo.getContext('2d')
  c.fillStyle = '#fff'
  c.fillRect(0, 0, ANCHO_PX, alto)
  c.fillStyle = '#000'
  let y = 0
  for (const p of piezas) { p.dibujar(c, y); y += p.alto }

  // Blanco y negro puro: la térmica no tiene grises (y así la Box no le aplica tramado)
  const px = c.getImageData(0, 0, ANCHO_PX, alto)
  for (let k = 0; k < px.data.length; k += 4) {
    const v = px.data[k] * 0.299 + px.data[k + 1] * 0.587 + px.data[k + 2] * 0.114 < 150 ? 0 : 255
    px.data[k] = px.data[k + 1] = px.data[k + 2] = v
    px.data[k + 3] = 255
  }
  c.putImageData(px, 0, 0)
  return lienzo.encode('png')
}
