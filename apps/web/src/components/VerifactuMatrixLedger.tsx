import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import QRCode from 'qrcode'

// Monitor de la cadena de registros de facturación que exige Veri*factu, estilo terminal.
//
// ES UNA SIMULACIÓN: las facturas son de ejemplo y nada se envía a la AEAT. Lo que sí es
// real es el cálculo: cada huella es un SHA-256 hecho en el navegador con el formato oficial
// de la AEAT ("Especificaciones técnicas para generación de la huella o hash de los registros
// de facturación", v0.1.2), la integridad de la cadena se verifica de verdad recalculando cada
// bloque, y el QR sigue la especificación del servicio de cotejo (apuntando al entorno de pruebas).

export type TipoFactura = 'F2' | 'R5' // F2 = simplificada (ticket) · R5 = rectificativa de simplificada
export type EstadoAeat = 'enviada' | 'en_cola'

export interface TransaccionVerifactu {
  numSerie: string
  tipo: TipoFactura
  fechaHora: string // ISO con milisegundos y huso: 2026-10-08T21:04:12.890+02:00
  cuotaTotal: number
  importeTotal: number
  estado: EstadoAeat
  rectificaA?: string // numSerie de la factura que corrige (solo R5)
}

export interface Bloque extends TransaccionVerifactu {
  indice: number
  huellaAnterior: string
  huella: string
}

interface LineaLog { id: number; hora: string; texto: string; tono: 'ok' | 'info' | 'error' }

const MAX_BLOQUES = 40
const URL_COTEJO_PRUEBAS = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR'

// ── Huella (formato oficial AEAT) ─────────────────────────────────────────────

const dos = (n: number) => n.toFixed(2)
const fechaExpedicion = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` // DD-MM-AAAA
const fechaHoraHuso = (iso: string) => iso.slice(0, 19) + iso.slice(23) // sin milisegundos
const horaCorta = (iso: string) => iso.slice(11, 23)
const truncar = (h: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '∅ (primer registro)')

function isoConHuso(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  const min = -d.getTimezoneOffset()
  const abs = Math.abs(min)
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `.${p(d.getMilliseconds(), 3)}${min >= 0 ? '+' : '-'}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  )
}

// Cadena sobre la que se calcula la huella de un registro de alta: campos y orden fijados por la AEAT
export function cadenaHuella(b: Pick<Bloque, 'numSerie' | 'tipo' | 'fechaHora' | 'cuotaTotal' | 'importeTotal' | 'huellaAnterior'>, nif: string) {
  return (
    `IDEmisorFactura=${nif}&NumSerieFactura=${b.numSerie}&FechaExpedicionFactura=${fechaExpedicion(b.fechaHora)}` +
    `&TipoFactura=${b.tipo}&CuotaTotal=${dos(b.cuotaTotal)}&ImporteTotal=${dos(b.importeTotal)}` +
    `&Huella=${b.huellaAnterior}&FechaHoraHusoGenRegistro=${fechaHoraHuso(b.fechaHora)}`
  )
}

export async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export async function crearBloque(tx: TransaccionVerifactu, previo: Bloque | undefined, nif: string): Promise<Bloque> {
  const base = { ...tx, indice: (previo?.indice ?? 0) + 1, huellaAnterior: previo?.huella ?? '' }
  return { ...base, huella: await sha256(cadenaHuella(base, nif)) }
}

// Recalcula cada bloque y comprueba el enlace con el anterior. Devuelve el índice (posición
// en la lista) del primer bloque que no cuadra, o -1 si la cadena está íntegra.
export async function primerBloqueRoto(bloques: Bloque[], nif: string): Promise<number> {
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i]
    if (i > 0 && b.huellaAnterior !== bloques[i - 1].huella) return i
    if ((await sha256(cadenaHuella(b, nif))) !== b.huella) return i
  }
  return -1
}

const urlQr = (b: Bloque, nif: string) =>
  `${URL_COTEJO_PRUEBAS}?nif=${encodeURIComponent(nif)}&numserie=${encodeURIComponent(b.numSerie)}` +
  `&fecha=${fechaExpedicion(b.fechaHora)}&importe=${dos(b.importeTotal)}`

// ── Datos de ejemplo ──────────────────────────────────────────────────────────

const IVA = 0.1
const conIva = (total: number) => ({ importeTotal: total, cuotaTotal: Math.round((total - total / (1 + IVA)) * 100) / 100 })

export function crearMockTransactions(): TransaccionVerifactu[] {
  const hace = (min: number) => isoConHuso(new Date(Date.now() - min * 60_000))
  return [
    { numSerie: 'FAC-2026-099', tipo: 'F2', fechaHora: hace(41), ...conIva(64.5), estado: 'enviada' },
    { numSerie: 'FAC-2026-100', tipo: 'F2', fechaHora: hace(33), ...conIva(128.9), estado: 'enviada' },
    { numSerie: 'FAC-2026-101', tipo: 'F2', fechaHora: hace(27), ...conIva(37.2), estado: 'enviada' },
    { numSerie: 'FAC-2026-102', tipo: 'F2', fechaHora: hace(18), ...conIva(92.0), estado: 'enviada' },
    { numSerie: 'FAC-R-2026-014', tipo: 'R5', fechaHora: hace(12), ...conIva(-37.2), estado: 'enviada', rectificaA: 'FAC-2026-101' },
    { numSerie: 'FAC-2026-103', tipo: 'F2', fechaHora: hace(6), ...conIva(211.4), estado: 'enviada' },
    { numSerie: 'FAC-2026-104', tipo: 'F2', fechaHora: hace(1), ...conIva(58.3), estado: 'en_cola' },
  ]
}

// ── Estilos por tipo de bloque (clases completas: Tailwind no ve las que se arman por partes) ──

type Tono = 'valida' | 'rectificada' | 'rectificativa' | 'cola' | 'rota'
const ESTILO: Record<Tono, { borde: string; texto: string; brillo: string; badge: string }> = {
  valida:        { borde: 'border-emerald-500/30', texto: 'text-emerald-400', brillo: 'shadow-[0_0_28px_rgba(0,255,102,0.28)]',  badge: '[✓ AEAT SENT]' },
  rectificada:   { borde: 'border-amber-500/30',   texto: 'text-amber-400',   brillo: 'shadow-[0_0_28px_rgba(255,153,0,0.30)]',  badge: '[🟡 RECTIFIED]' },
  rectificativa: { borde: 'border-rose-500/40',    texto: 'text-rose-500',    brillo: 'shadow-[0_0_28px_rgba(255,0,85,0.38)]',   badge: '[⚡ RECTIFIER]' },
  cola:          { borde: 'border-cyan-400/40',    texto: 'text-cyan-400',    brillo: 'shadow-[0_0_28px_rgba(0,229,255,0.34)]',  badge: '[⏳ QUEUED]' },
  rota:          { borde: 'border-red-500',        texto: 'text-red-500',     brillo: 'shadow-[0_0_38px_rgba(255,0,0,0.65)]',    badge: '[✗ HASH MISMATCH]' },
}

const BARRA_SCROLL = { scrollbarWidth: 'thin', scrollbarColor: 'rgba(16,185,129,0.45) transparent' } as const
const HEX = '0123456789ABCDEF'

// Lluvia de dígitos hexadecimales de fondo, estilo Matrix. Verde normalmente, roja si la cadena está rota.
function LluviaMatrix({ alerta }: { alerta: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const alertaRef = useRef(alerta)
  alertaRef.current = alerta

  useEffect(() => {
    const lienzo = ref.current
    const ctx = lienzo?.getContext('2d')
    if (!lienzo || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const TAM = 18
    let columnas: number[] = []
    const ajustar = () => {
      lienzo.width = lienzo.offsetWidth
      lienzo.height = lienzo.offsetHeight
      columnas = Array.from({ length: Math.ceil(lienzo.width / TAM) }, () => Math.random() * (lienzo.height / TAM))
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(lienzo)
    const id = window.setInterval(() => {
      ctx.fillStyle = 'rgba(3,7,18,0.14)'
      ctx.fillRect(0, 0, lienzo.width, lienzo.height)
      ctx.font = `${TAM}px monospace`
      ctx.fillStyle = alertaRef.current ? 'rgba(255,45,70,0.75)' : 'rgba(0,255,102,0.6)'
      columnas.forEach((y, i) => {
        ctx.fillText(HEX[Math.floor(Math.random() * 16)], i * TAM, y * TAM)
        columnas[i] = y * TAM > lienzo.height && Math.random() > 0.975 ? 0 : y + 1
      })
    }, 70)
    return () => { window.clearInterval(id); observador.disconnect() }
  }, [])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />
}

// Muestra un texto "descifrándose": arranca con dígitos al azar y se va fijando de izquierda a derecha
function useTextoCifrado(objetivo: string) {
  const [texto, setTexto] = useState(objetivo)
  useEffect(() => {
    if (!objetivo) { setTexto(''); return }
    let paso = 0
    const PASOS = 16
    const id = window.setInterval(() => {
      paso++
      const fijos = Math.floor((paso / PASOS) * objetivo.length)
      setTexto(objetivo.slice(0, fijos) + Array.from({ length: objetivo.length - fijos }, () => HEX[Math.floor(Math.random() * 16)]).join(''))
      if (paso >= PASOS) window.clearInterval(id)
    }, 45)
    return () => window.clearInterval(id)
  }, [objetivo])
  return texto
}

const SCANLINES = {
  backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)',
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  mockTransactions?: TransaccionVerifactu[]
  nifEmisor?: string
  nodoImpresion?: string // código de la Pi que imprime el ticket con el QR
  simular?: boolean      // añade ventas de ejemplo cada pocos segundos
}

export default function VerifactuMatrixLedger({
  mockTransactions,
  nifEmisor = 'B12345678',
  nodoImpresion = 'OIDO-13FAEE',
  simular = true,
}: Props) {
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [rotoEn, setRotoEn] = useState(-1)
  const [logs, setLogs] = useState<LineaLog[]>([])
  const [seleccion, setSeleccion] = useState<Bloque | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [pausado, setPausado] = useState(false)
  const [manipulado, setManipulado] = useState<{ numSerie: string; original: number } | null>(null)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const sacudida = useAnimationControls()

  const bloquesRef = useRef<Bloque[]>([])
  const contador = useRef({ fac: 104, rect: 14, log: 0 })
  const temporizadores = useRef<number[]>([])
  const carril = useRef<HTMLDivElement>(null)
  const consola = useRef<HTMLDivElement>(null)

  const log = useCallback((texto: string, tono: LineaLog['tono'] = 'info') => {
    const hora = new Date().toTimeString().slice(0, 8)
    setLogs(prev => [...prev, { id: ++contador.current.log, hora, texto, tono }].slice(-60))
  }, [])

  const guardar = useCallback((lista: Bloque[]) => {
    bloquesRef.current = lista.slice(-MAX_BLOQUES)
    setBloques(bloquesRef.current)
  }, [])

  const anexar = useCallback(async (tx: TransaccionVerifactu) => {
    const previo = bloquesRef.current[bloquesRef.current.length - 1]
    const bloque = await crearBloque(tx, previo, nifEmisor)
    guardar([...bloquesRef.current, bloque])
    log(`SHA-256 generated for ${bloque.numSerie} -> Hash: ${bloque.huella.slice(0, 8)}… OK`, 'ok')
    if (bloque.rectificaA) log(`${bloque.numSerie} rectifies ${bloque.rectificaA} (R5, importe ${dos(bloque.importeTotal)})`)

    // "Envío" simulado: a los 2,5 s el registro pasa de la cola local a enviado
    if (bloque.estado === 'en_cola') {
      const t = window.setTimeout(() => {
        guardar(bloquesRef.current.map(b => (b.numSerie === bloque.numSerie ? { ...b, estado: 'enviada' as const } : b)))
        log(`Payload ${bloque.numSerie} dispatched to AEAT Sandbox (simulado). Response: Correcto.`, 'ok')
      }, 2500)
      temporizadores.current.push(t)
    }
  }, [guardar, log, nifEmisor])

  // Cadena inicial a partir de los datos de ejemplo
  useEffect(() => {
    let vigente = true
    ;(async () => {
      const lista: Bloque[] = []
      for (const tx of mockTransactions ?? crearMockTransactions()) lista.push(await crearBloque(tx, lista[lista.length - 1], nifEmisor))
      if (!vigente) return
      guardar(lista)
      log(`Chain loaded: ${lista.length} registros encadenados. Algoritmo SHA-256, formato AEAT v0.1.2.`)
    })()
    const pendientes = temporizadores.current
    return () => { vigente = false; pendientes.forEach(t => window.clearTimeout(t)) }
  }, [mockTransactions, nifEmisor, guardar, log])

  // Ventas de ejemplo cada pocos segundos; de vez en cuando, una rectificativa de un ticket reciente
  useEffect(() => {
    if (!simular || pausado) return
    const id = window.setInterval(() => {
      const lista = bloquesRef.current
      if (lista.length === 0) return
      const yaRectificadas = new Set(lista.map(b => b.rectificaA).filter(Boolean))
      const candidatas = lista.slice(-6).filter(b => b.tipo === 'F2' && b.estado === 'enviada' && !yaRectificadas.has(b.numSerie))
      const fechaHora = isoConHuso(new Date())
      if (candidatas.length > 0 && Math.random() < 0.22) {
        const origen = candidatas[Math.floor(Math.random() * candidatas.length)]
        const n = String(++contador.current.rect).padStart(3, '0')
        void anexar({ numSerie: `FAC-R-2026-${n}`, tipo: 'R5', fechaHora, ...conIva(-origen.importeTotal), estado: 'en_cola', rectificaA: origen.numSerie })
      } else {
        const total = Math.round((18 + Math.random() * 190) * 10) / 10
        void anexar({ numSerie: `FAC-2026-${++contador.current.fac}`, tipo: 'F2', fechaHora, ...conIva(total), estado: 'en_cola' })
      }
    }, 7000)
    return () => window.clearInterval(id)
  }, [simular, pausado, anexar])

  // Verificación real de la cadena cada vez que cambia
  useEffect(() => {
    let vigente = true
    primerBloqueRoto(bloques, nifEmisor).then(i => { if (vigente) setRotoEn(i) })
    return () => { vigente = false }
  }, [bloques, nifEmisor])

  useEffect(() => { carril.current?.scrollTo({ left: carril.current.scrollWidth, behavior: 'smooth' }) }, [bloques.length])
  useEffect(() => { consola.current?.scrollTo({ top: consola.current.scrollHeight }) }, [logs])

  // Demostración: alguien cambia a mano el importe de un ticket ya registrado, sin tocar su huella
  const manipular = () => {
    const lista = bloquesRef.current
    const objetivo = lista[Math.max(0, lista.length - 4)]
    if (!objetivo) return
    setManipulado({ numSerie: objetivo.numSerie, original: objetivo.importeTotal })
    guardar(lista.map(b => (b.numSerie === objetivo.numSerie ? { ...b, importeTotal: 1 } : b)))
    log(`!! ${objetivo.numSerie}: importe alterado ${dos(objetivo.importeTotal)} -> 1.00 fuera del sistema`, 'error')
    log(`!! Recalculated hash does not match stored hash. CHAIN INTEGRITY BROKEN.`, 'error')
    void sacudida.start({ x: [0, -14, 14, -9, 9, -4, 4, 0], transition: { duration: 0.5 } })
  }
  const restaurar = () => {
    if (!manipulado) return
    guardar(bloquesRef.current.map(b => (b.numSerie === manipulado.numSerie ? { ...b, importeTotal: manipulado.original } : b)))
    log(`${manipulado.numSerie}: importe original restaurado. Chain integrity OK.`, 'ok')
    setManipulado(null)
  }

  const rectificadas = useMemo(() => new Set(bloques.map(b => b.rectificaA).filter(Boolean)), [bloques])
  const tonoDe = (b: Bloque, i: number): Tono =>
    rotoEn >= 0 && i >= rotoEn ? 'rota'
      : b.estado === 'en_cola' ? 'cola'
      : b.tipo === 'R5' ? 'rectificativa'
      : rectificadas.has(b.numSerie) ? 'rectificada'
      : 'valida'

  // Pareja del bloque bajo el cursor o seleccionado: la rectificativa y la factura que corrige
  const foco = sobre ?? seleccion?.numSerie ?? null
  const pareja = useMemo(() => {
    if (!foco) return null
    const b = bloques.find(x => x.numSerie === foco)
    return b?.rectificaA ?? bloques.find(x => x.rectificaA === foco)?.numSerie ?? null
  }, [foco, bloques])

  const integra = rotoEn < 0
  const ultimo = bloques[bloques.length - 1]
  const ultimaHuella = useTextoCifrado(ultimo?.huella ?? '')
  const kpis = useMemo(() => ({
    total: bloques.reduce((suma, b) => suma + b.importeTotal, 0),
    rectificativas: bloques.filter(b => b.tipo === 'R5').length,
    enCola: bloques.filter(b => b.estado === 'en_cola').length,
  }), [bloques])

  useEffect(() => {
    if (!pantallaCompleta) return
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setPantallaCompleta(false) }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [pantallaCompleta])

  const boton = 'text-xs sm:text-sm font-bold border rounded-md px-3 py-2 transition-colors'

  return (
    <motion.div
      animate={sacudida}
      className={`${pantallaCompleta ? 'fixed inset-0 z-50' : 'relative h-full min-h-[680px] rounded-2xl border border-emerald-500/20'} flex flex-col overflow-hidden bg-[#030712] font-mono text-emerald-400`}
    >
      <LluviaMatrix alerta={!integra} />
      <div className="pointer-events-none absolute inset-0" style={SCANLINES} />

      {/* Header */}
      <div className="relative px-5 sm:px-8 pt-5 pb-4 border-b border-emerald-500/20 bg-[#030712]/70">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-xl sm:text-3xl font-bold tracking-[0.15em] drop-shadow-[0_0_12px_rgba(0,255,102,0.55)]">
            <span className={`${integra ? 'text-emerald-400' : 'text-red-500'} animate-pulse`}>[●]</span> VERI*FACTU LIVE CHAIN AUDIT
          </h2>
          <span className="text-[11px] font-bold text-amber-300 border border-amber-400/50 rounded px-2 py-1">SIMULACIÓN · DATOS DE EJEMPLO</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => setPausado(p => !p)} className={`${boton} border-emerald-500/40 hover:bg-emerald-500/10`}>
              {pausado ? '▶ REANUDAR' : '⏸ PAUSA'}
            </button>
            {manipulado ? (
              <button onClick={restaurar} className={`${boton} text-cyan-300 border-cyan-400/60 hover:bg-cyan-400/10`}>↺ RESTAURAR</button>
            ) : (
              <button onClick={manipular} disabled={bloques.length < 2} className={`${boton} text-rose-400 border-rose-500/60 hover:bg-rose-500/10 disabled:opacity-40`}>
                ⚠ SIMULAR MANIPULACIÓN
              </button>
            )}
            <button onClick={() => setPantallaCompleta(v => !v)} className={`${boton} border-emerald-500/40 hover:bg-emerald-500/10`}>
              {pantallaCompleta ? '✕ SALIR (ESC)' : '⛶ PANTALLA COMPLETA'}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs sm:text-sm text-emerald-300/60">
          Cada ticket queda encadenado al anterior por su huella. Si alguien altera o borra uno, la cadena deja de cuadrar.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs sm:text-sm">
          <span className={`border rounded px-3 py-1 font-bold ${integra ? 'border-emerald-500/50 text-emerald-300 animate-pulse' : 'border-red-500 text-red-400 bg-red-500/10'}`}>
            STATUS: {integra ? 'INTEGRITY_OK' : `INTEGRITY_BROKEN @ BLOCK #${String(bloques[rotoEn]?.indice ?? 0).padStart(4, '0')}`}
          </span>
          <span className="border border-emerald-500/25 text-emerald-300/80 rounded px-3 py-1">PRINT NODE: {nodoImpresion}</span>
          <span className="border border-cyan-400/30 text-cyan-300/90 rounded px-3 py-1">AEAT ENDPOINT: SANDBOX · SIMULADO</span>
          <span className="border border-emerald-500/25 text-emerald-300/80 rounded px-3 py-1">EMISOR: {nifEmisor}</span>
        </div>
      </div>

      {/* Alerta de cadena rota */}
      <AnimatePresence>
        {!integra && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="relative overflow-hidden bg-red-600/90 text-white"
          >
            <p className="px-5 sm:px-8 py-3 text-base sm:text-2xl font-bold tracking-wider animate-pulse">
              ⚠ CHAIN INTEGRITY BROKEN — registro alterado en BLOCK #{String(bloques[rotoEn]?.indice ?? 0).padStart(4, '0')} ({bloques[rotoEn]?.numSerie})
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cifras y última huella */}
      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 px-5 sm:px-8 pt-5">
        {[
          { etiqueta: 'REGISTROS ENCADENADOS', valor: String(bloques.length).padStart(3, '0'), color: 'text-emerald-400' },
          { etiqueta: 'FACTURADO EN PANTALLA', valor: `${dos(kpis.total)} €`, color: 'text-emerald-400' },
          { etiqueta: 'RECTIFICATIVAS', valor: String(kpis.rectificativas).padStart(2, '0'), color: 'text-rose-500' },
          { etiqueta: 'EN COLA DE ENVÍO', valor: String(kpis.enCola).padStart(2, '0'), color: 'text-cyan-400' },
        ].map(k => (
          <div key={k.etiqueta} className="rounded-lg border border-emerald-500/20 bg-[#0A0D14]/80 px-4 py-3">
            <p className="text-[10px] sm:text-xs text-emerald-300/60 tracking-widest">{k.etiqueta}</p>
            <p className={`text-2xl sm:text-4xl font-bold tabular-nums ${k.color}`}>{k.valor}</p>
          </div>
        ))}
      </div>
      <div className="relative px-5 sm:px-8 pt-4">
        <p className="text-[10px] sm:text-xs text-emerald-300/60 tracking-widest">ÚLTIMA HUELLA · SHA-256 · {ultimo?.numSerie ?? '—'}</p>
        <p className={`text-sm sm:text-xl lg:text-2xl font-bold tracking-wider break-all ${integra ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(0,255,102,0.5)]' : 'text-red-500'}`}>
          {ultimaHuella || '…'}
        </p>
      </div>

      {/* Cadena */}
      <div ref={carril} style={BARRA_SCROLL} className="relative flex-1 flex items-center overflow-x-auto overflow-y-hidden px-5 sm:px-8 py-8 min-h-[300px]">
        <div className="flex items-center w-max">
          {bloques.map((b, i) => {
            const tono = tonoDe(b, i)
            const e = ESTILO[tono]
            const resaltado = pareja === b.numSerie || seleccion?.numSerie === b.numSerie
            const tachado = tono === 'rectificada' ? 'line-through decoration-amber-400/70' : ''
            return (
              <div key={b.numSerie} className="flex items-center">
                {i > 0 && (
                  <svg width="72" height="24" viewBox="0 0 72 24" className={`shrink-0 ${rotoEn >= 0 && i >= rotoEn ? 'text-red-500' : 'text-emerald-400/70'}`}>
                    <motion.line
                      x1="0" y1="12" x2="60" y2="12" stroke="currentColor" strokeWidth="2.5" strokeDasharray="7 7"
                      animate={{ strokeDashoffset: [0, -14] }} transition={{ repeat: Infinity, ease: 'linear', duration: 0.5 }}
                    />
                    <path d="M56 4 L70 12 L56 20" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                )}
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: 120, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                  onClick={() => setSeleccion(b)}
                  onMouseEnter={() => setSobre(b.numSerie)}
                  onMouseLeave={() => setSobre(null)}
                  className={`w-80 shrink-0 text-left cursor-pointer rounded-xl border-2 bg-[#0A0D14]/95 p-5 ${e.borde} ${e.brillo} ${resaltado ? 'ring-4 ring-white/70' : ''}`}
                >
                  <div className="flex items-center justify-between text-xs text-emerald-300/60">
                    <span className="font-bold tracking-widest">BLOCK #{String(b.indice).padStart(4, '0')}</span>
                    <span>{horaCorta(b.fechaHora)}</span>
                  </div>
                  <p className={`mt-2 text-xl font-bold ${e.texto} ${tachado}`}>
                    {b.numSerie} <span className="text-xs font-normal opacity-70">{b.tipo}</span>
                  </p>
                  <p className={`text-4xl font-bold tabular-nums ${e.texto} ${tachado}`}>
                    {b.importeTotal < 0 ? '−' : ''}{dos(Math.abs(b.importeTotal))} €
                  </p>
                  <p className="mt-3 text-sm text-emerald-300/90">HASH: {truncar(b.huella)}</p>
                  <p className="text-sm text-emerald-300/50">PREV_HASH: {truncar(b.huellaAnterior)}</p>
                  {b.rectificaA && <p className="mt-2 text-sm font-bold text-rose-400">LINK: REF_ORIGIN_{b.rectificaA}</p>}
                  <p className={`mt-3 text-sm font-bold ${e.texto} ${tono === 'rota' ? 'animate-pulse' : ''}`}>{e.badge}</p>
                </motion.button>
              </div>
            )
          })}
          {bloques.length === 0 && <p className="text-sm text-emerald-300/60">Generando cadena…</p>}
        </div>
      </div>

      {/* Consola */}
      <div ref={consola} style={BARRA_SCROLL} className="relative h-44 shrink-0 overflow-y-auto border-t border-emerald-500/20 bg-black/60 px-5 sm:px-8 py-3 text-xs sm:text-sm leading-6">
        {logs.map(l => (
          <p key={l.id} className={l.tono === 'error' ? 'text-red-400 font-bold' : l.tono === 'ok' ? 'text-emerald-400' : 'text-emerald-300/60'}>
            &gt; [{l.hora}] {l.texto}
          </p>
        ))}
      </div>

      <AnimatePresence>
        {seleccion && (
          <Inspector
            bloque={bloques.find(b => b.numSerie === seleccion.numSerie) ?? seleccion}
            nif={nifEmisor}
            roto={rotoEn >= 0 && bloques.findIndex(b => b.numSerie === seleccion.numSerie) >= rotoEn}
            onClose={() => setSeleccion(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Inspector de un registro: datos en crudo, huella completa y QR ────────────

function Inspector({ bloque, nif, roto, onClose }: { bloque: Bloque; nif: string; roto: boolean; onClose: () => void }) {
  const [qr, setQr] = useState('')
  const [recalculada, setRecalculada] = useState('')
  const [copiado, setCopiado] = useState(false)
  const url = urlQr(bloque, nif)
  const cadena = cadenaHuella(bloque, nif)

  useEffect(() => {
    let vigente = true
    // Nivel M de corrección de errores, como pide la especificación del QR tributario
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 200 }).then(d => { if (vigente) setQr(d) }).catch(() => {})
    sha256(cadena).then(h => { if (vigente) setRecalculada(h) })
    return () => { vigente = false }
  }, [url, cadena])

  const copiar = () => {
    navigator.clipboard?.writeText(bloque.huella).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1500) }).catch(() => {})
  }

  const registro = {
    IDFactura: { IDEmisorFactura: nif, NumSerieFactura: bloque.numSerie, FechaExpedicionFactura: fechaExpedicion(bloque.fechaHora) },
    TipoFactura: bloque.tipo,
    ...(bloque.rectificaA && { TipoRectificativa: 'I', FacturasRectificadas: [{ NumSerieFactura: bloque.rectificaA }] }),
    CuotaTotal: dos(bloque.cuotaTotal),
    ImporteTotal: dos(bloque.importeTotal),
    Encadenamiento: bloque.huellaAnterior ? { RegistroAnterior: { Huella: bloque.huellaAnterior } } : { PrimerRegistro: 'S' },
    FechaHoraHusoGenRegistro: fechaHoraHuso(bloque.fechaHora),
    TipoHuella: '01',
    Huella: bloque.huella,
  }

  return (
    <motion.div className="absolute inset-0 z-10 flex justify-end bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        initial={{ x: 80 }} animate={{ x: 0 }} exit={{ x: 80 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        style={BARRA_SCROLL}
        className="h-full w-full max-w-2xl overflow-y-auto border-l-2 border-emerald-500/40 bg-[#030712] p-6 text-sm text-emerald-300 shadow-[0_0_40px_rgba(0,255,102,0.2)]"
      >
        <div className="flex items-center mb-3">
          <p className="text-xl font-bold text-emerald-400">$ inspect {bloque.numSerie}</p>
          <button onClick={onClose} className="ml-auto border border-emerald-500/40 hover:bg-emerald-500/10 rounded px-2 py-0.5">[x] CERRAR</button>
        </div>

        <p className="text-emerald-300/60 mb-1">// HUELLA SHA-256 (64 caracteres)</p>
        <div className="flex items-start gap-2 mb-1">
          <code className="break-all text-base font-bold text-emerald-400">{bloque.huella}</code>
          <button onClick={copiar} className="shrink-0 border border-emerald-500/40 hover:bg-emerald-500/10 rounded px-2 py-0.5">{copiado ? '✓ COPIADO' : 'COPIAR HASH'}</button>
        </div>
        <p className={`mb-3 ${recalculada && recalculada !== bloque.huella ? 'text-red-400 font-bold' : 'text-emerald-300/60'}`}>
          {recalculada && recalculada !== bloque.huella
            ? `✗ Recalculada ahora: ${recalculada} — NO coincide: el registro fue alterado.`
            : roto
              ? '⚠ Esta huella es correcta, pero un registro anterior de la cadena fue alterado.'
              : '✓ Recalculada ahora en el navegador: coincide.'}
        </p>

        <p className="text-emerald-300/60 mb-1">// CADENA SOBRE LA QUE SE CALCULA (formato AEAT)</p>
        <pre className="whitespace-pre-wrap break-all rounded border border-emerald-500/20 bg-black/50 p-2 mb-3">{cadena}</pre>

        <p className="text-emerald-300/60 mb-1">// REGISTRO DE ALTA (campos principales)</p>
        <pre className="overflow-x-auto rounded border border-emerald-500/20 bg-black/50 p-2 mb-3">{JSON.stringify(registro, null, 2)}</pre>

        <p className="text-emerald-300/60 mb-1">// QR TRIBUTARIO</p>
        <div className="flex gap-3 mb-3">
          {qr && <img src={qr} alt="QR tributario de ejemplo" className="w-48 h-48 rounded bg-white p-1 shrink-0" />}
          <div className="min-w-0">
            <p className="break-all text-cyan-300">{url}</p>
            <p className="mt-2 text-amber-300/90">
              QR real en formato, de demostración en contenido: apunta al entorno de PRUEBAS de la AEAT, donde esta factura no existe.
            </p>
          </div>
        </div>

        <p className="text-emerald-300/60 mb-1">// EMISOR Y RESPUESTA AEAT (simulado)</p>
        <pre className="whitespace-pre-wrap rounded border border-emerald-500/20 bg-black/50 p-2">
{`certificado:  ninguno — en real, certificado electrónico cualificado del emisor
endpoint:     sandbox simulado (no se envía nada)
estado:       ${bloque.estado === 'enviada' ? 'Correcto (simulado)' : 'En cola local, pendiente de envío'}`}
        </pre>
      </motion.div>
    </motion.div>
  )
}
