import puppeteer, { Browser } from 'puppeteer'

// Renderiza el ticket (React real, mismo componente que la vista previa del admin)
// a PNG usando un Chromium headless — corre en el VPS (recursos de sobra), NO en la
// Raspberry Pi del local (2GB, no da para esto). La Pi solo recibe el PNG ya armado.

const WEB_BASE_URL = process.env.WEB_BASE_URL || 'http://localhost:5173'

let browserPromise: Promise<Browser> | null = null

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      // el proceso de la API corre como root en el VPS — Chromium exige esto para arrancar así
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return browserPromise
}

/**
 * Renderiza el ticket de cocina/barra de una comanda a PNG.
 * `itemIds`, si se pasa, limita el ticket a esos items puntuales (para no
 * reimprimir toda la comanda en cada ronda nueva) — ver PrintComandaPage.tsx.
 * Devuelve null si el render falla (el llamador debe tener un fallback).
 */
export async function renderTicketComandaPng(
  comandaId: number,
  tipo: 'cocina' | 'barra',
  itemIds: number[],
): Promise<Buffer | null> {
  try {
    const browser = await getBrowser()
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 400, height: 800, deviceScaleFactor: 3 })
      const url = `${WEB_BASE_URL}/print/comanda/${comandaId}/${tipo}?items=${itemIds.join(',')}`
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 10_000 })
      const el = await page.$('#print-root')
      if (!el) return null
      const png = await el.screenshot({ type: 'png' })
      return Buffer.from(png)
    } finally {
      await page.close()
    }
  } catch (err) {
    console.error('[ticketRender] fallo renderizando ticket', comandaId, tipo, err)
    return null
  }
}
