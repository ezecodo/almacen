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
