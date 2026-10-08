import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
  valida:        { borde: 'border-emerald-500/30', texto: 'text-emerald-400', brillo: 'shadow-[0_0_15px_rgba(0,255,102,0.18)]',  badge: '[✓ AEAT SENT]' },
  rectificada:   { borde: 'border-amber-500/30',   texto: 'text-amber-400',   brillo: 'shadow-[0_0_15px_rgba(255,153,0,0.20)]',  badge: '[🟡 RECTIFIED]' },
  rectificativa: { borde: 'border-rose-500/40',    texto: 'text-rose-500',    brillo: 'shadow-[0_0_15px_rgba(255,0,85,0.25)]',   badge: '[⚡ RECTIFIER]' },
  cola:          { borde: 'border-cyan-400/40',    texto: 'text-cyan-400',    brillo: 'shadow-[0_0_15px_rgba(0,229,255,0.22)]',  badge: '[⏳ QUEUED]' },
  rota:          { borde: 'border-red-500',        texto: 'text-red-500',     brillo: 'shadow-[0_0_22px_rgba(255,0,0,0.55)]',    badge: '[✗ HASH MISMATCH]' },
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

  return (
    <div className="relative rounded-2xl overflow-hidden border border-emerald-500/20 bg-[#030712] font-mono text-emerald-400">
      <div className="pointer-events-none absolute inset-0" style={SCANLINES} />

      {/* Header */}
      <div className="relative px-4 pt-4 pb-3 border-b border-emerald-500/20">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm sm:text-base font-bold tracking-wider">
            <span className={`${integra ? 'text-emerald-400' : 'text-red-500'} animate-pulse`}>[●]</span> VERI*FACTU LIVE CHAIN AUDIT
          </h2>
          <span className="text-[10px] font-bold text-amber-300 border border-amber-400/50 rounded px-1.5 py-0.5">SIMULACIÓN · DATOS DE EJEMPLO</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setPausado(p => !p)} className="text-[11px] border border-emerald-500/40 hover:bg-emerald-500/10 rounded px-2 py-1">
              {pausado ? '▶ REANUDAR' : '⏸ PAUSA'}
            </button>
            {manipulado ? (
              <button onClick={restaurar} className="text-[11px] text-cyan-300 border border-cyan-400/50 hover:bg-cyan-400/10 rounded px-2 py-1">↺ RESTAURAR</button>
            ) : (
              <button onClick={manipular} disabled={bloques.length < 2} className="text-[11px] text-rose-400 border border-rose-500/50 hover:bg-rose-500/10 disabled:opacity-40 rounded px-2 py-1">
                ⚠ SIMULAR MANIPULACIÓN
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
          <span className={`border rounded px-2 py-0.5 ${integra ? 'border-emerald-500/40 text-emerald-300 animate-pulse' : 'border-red-500 text-red-400 bg-red-500/10'}`}>
            STATUS: {integra ? 'INTEGRITY_OK' : `INTEGRITY_BROKEN @ BLOCK #${String(bloques[rotoEn]?.indice ?? 0).padStart(4, '0')}`}
          </span>
          <span className="border border-emerald-500/25 text-emerald-300/80 rounded px-2 py-0.5">PRINT NODE: {nodoImpresion}</span>
          <span className="border border-cyan-400/30 text-cyan-300/90 rounded px-2 py-0.5">AEAT ENDPOINT: SANDBOX · SIMULADO</span>
          <span className="border border-emerald-500/25 text-emerald-300/80 rounded px-2 py-0.5">EMISOR: {nifEmisor}</span>
          <span className="border border-emerald-500/25 text-emerald-300/80 rounded px-2 py-0.5">BLOCKS: {bloques.length}</span>
        </div>
      </div>

      {/* Cadena */}
      <div ref={carril} className="relative overflow-x-auto px-4 py-6">
        <div className="flex items-stretch w-max">
          {bloques.map((b, i) => {
            const tono = tonoDe(b, i)
            const e = ESTILO[tono]
            const resaltado = pareja === b.numSerie || seleccion?.numSerie === b.numSerie
            return (
              <div key={b.numSerie} className="flex items-center">
                {i > 0 && (
                  <svg width="44" height="16" viewBox="0 0 44 16" className={`shrink-0 ${rotoEn >= 0 && i >= rotoEn ? 'text-red-500' : 'text-emerald-500/60'}`}>
                    <line x1="0" y1="8" x2="36" y2="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray={rotoEn === i ? '3 4' : undefined} />
                    <path d="M34 3 L42 8 L34 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  onClick={() => setSeleccion(b)}
                  onMouseEnter={() => setSobre(b.numSerie)}
                  onMouseLeave={() => setSobre(null)}
                  className={`w-56 shrink-0 text-left cursor-pointer rounded-lg border bg-[#0A0D14]/90 p-3 ${e.borde} ${e.brillo} ${resaltado ? 'ring-2 ring-white/70' : ''}`}
                >
                  <div className="flex items-center justify-between text-[10px] text-emerald-300/60">
                    <span>BLOCK #{String(b.indice).padStart(4, '0')}</span>
                    <span>{horaCorta(b.fechaHora)}</span>
                  </div>
                  <p className={`mt-1 text-sm font-bold ${e.texto} ${tono === 'rectificada' ? 'line-through decoration-amber-400/70' : ''}`}>
                    {b.numSerie} <span className="text-[10px] font-normal opacity-70">{b.tipo}</span>
                  </p>
                  <p className={`text-lg font-bold ${e.texto} ${tono === 'rectificada' ? 'line-through decoration-amber-400/70' : ''}`}>
                    {b.importeTotal < 0 ? '−' : ''}{dos(Math.abs(b.importeTotal))} €
                  </p>
                  <p className="mt-1 text-[10px] text-emerald-300/80">HASH: {truncar(b.huella)}</p>
                  <p className="text-[10px] text-emerald-300/50">PREV_HASH: {truncar(b.huellaAnterior)}</p>
                  {b.rectificaA && <p className="mt-1 text-[10px] text-rose-400">LINK: REF_ORIGIN_{b.rectificaA}</p>}
                  <p className={`mt-2 text-[10px] font-bold ${e.texto} ${tono === 'rota' ? 'animate-pulse' : ''}`}>{e.badge}</p>
                </motion.button>
              </div>
            )
          })}
          {bloques.length === 0 && <p className="text-xs text-emerald-300/60">Generando cadena…</p>}
        </div>
      </div>

      {/* Consola */}
      <div ref={consola} className="relative h-[120px] overflow-y-auto border-t border-emerald-500/20 bg-black/40 px-4 py-2 text-[11px] leading-5">
        {logs.map(l => (
          <p key={l.id} className={l.tono === 'error' ? 'text-red-400' : l.tono === 'ok' ? 'text-emerald-400' : 'text-emerald-300/60'}>
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
    </div>
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
        className="h-full w-full max-w-xl overflow-y-auto border-l border-emerald-500/40 bg-[#030712] p-4 text-[11px] text-emerald-300 shadow-[0_0_30px_rgba(0,255,102,0.15)]"
      >
        <div className="flex items-center mb-3">
          <p className="text-sm font-bold text-emerald-400">$ inspect {bloque.numSerie}</p>
          <button onClick={onClose} className="ml-auto border border-emerald-500/40 hover:bg-emerald-500/10 rounded px-2 py-0.5">[x] CERRAR</button>
        </div>

        <p className="text-emerald-300/60 mb-1">// HUELLA SHA-256 (64 caracteres)</p>
        <div className="flex items-start gap-2 mb-1">
          <code className="break-all text-emerald-400">{bloque.huella}</code>
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
          {qr && <img src={qr} alt="QR tributario de ejemplo" className="w-36 h-36 rounded bg-white p-1 shrink-0" />}
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
