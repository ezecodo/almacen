// Compresión de fotos en el dispositivo antes de subirlas (facturas).
// Nginx corta las requests en 1 MB por defecto, así que cada página tiene que
// quedar por debajo: se reduce el lado mayor y se baja la calidad JPEG hasta entrar.

async function cargar(file: Blob): Promise<{ fuente: CanvasImageSource; w: number; h: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { fuente: bmp, w: bmp.width, h: bmp.height }
    } catch {}
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { fuente: img, w: img.naturalWidth, h: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function aJpeg(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad))
}

export async function comprimirFoto(file: Blob, maxLado = 1800, maxBytes = 850_000): Promise<Blob> {
  const { fuente, w, h } = await cargar(file)
  let lado = maxLado
  for (;;) {
    const escala = Math.min(1, lado / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * escala)
    canvas.height = Math.round(h * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la foto')
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height)
    for (const calidad of [0.8, 0.65, 0.5]) {
      const blob = await aJpeg(canvas, calidad)
      if (blob.size <= maxBytes) return blob
    }
    if (lado <= 900) throw new Error('La foto es demasiado pesada')
    lado = Math.round(lado * 0.75)
  }
}

// Logo de la cuenta impresa: blanco y negro puro (la térmica no tiene grises), sin el margen
// blanco de alrededor y como mucho 460 × 220 px (el papel tiene 576 de ancho). Devuelve el PNG
// en base64, sin el "data:image/png;base64,".
export async function logoParaTicket(file: Blob, maxAncho = 460, maxAlto = 220): Promise<string> {
  const { fuente, w: w0, h: h0 } = await cargar(file)
  const w = w0 || 1000, h = h0 || 500 // un SVG sin medidas
  const escala = Math.min(1, 1200 / Math.max(w, h))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(w * escala)
  lienzo.height = Math.round(h * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar el logo')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height)

  // Recorta lo que no tiene tinta
  const { data } = ctx.getImageData(0, 0, lienzo.width, lienzo.height)
  const tinta = (x: number, y: number) => {
    const k = (y * lienzo.width + x) * 4
    return data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114 < 160
  }
  let x0 = lienzo.width, y0 = lienzo.height, x1 = -1, y1 = -1
  for (let y = 0; y < lienzo.height; y++) for (let x = 0; x < lienzo.width; x++) {
    if (tinta(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  }
  if (x1 < 0) throw new Error('El logo está en blanco')

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1
  const e = Math.min(maxAncho / cw, maxAlto / ch, 1)
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(cw * e))
  out.height = Math.max(1, Math.round(ch * e))
  const o = out.getContext('2d')
  if (!o) throw new Error('No se pudo procesar el logo')
  o.drawImage(lienzo, x0, y0, cw, ch, 0, 0, out.width, out.height)
  const px = o.getImageData(0, 0, out.width, out.height)
  for (let k = 0; k < px.data.length; k += 4) {
    const v = px.data[k] * 0.299 + px.data[k + 1] * 0.587 + px.data[k + 2] * 0.114 < 160 ? 0 : 255
    px.data[k] = px.data[k + 1] = px.data[k + 2] = v
    px.data[k + 3] = 255
  }
  o.putImageData(px, 0, 0)
  return out.toDataURL('image/png').split(',')[1]
}
