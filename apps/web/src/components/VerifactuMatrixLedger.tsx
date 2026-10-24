import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { api } from '../api'

// Monitor de la cadena de registros de facturación que exige Veri*factu.
//
// Se dibuja como un árbol: arriba el grupo (el emisor), de él cuelgan los restaurantes y de
// cada restaurante sus tickets. La cadena es UNA sola por emisor (así lo pide la AEAT), de modo
// que el enlace de cada ticket con el anterior salta de un restaurante a otro: esos hilos son
// la "red" que se va tejiendo. Todo entra en pantalla, sin scroll: se ven los últimos de cada local.
//
// ES UNA SIMULACIÓN: las facturas son de ejemplo y nada se envía a la AEAT. Lo que sí es
// real es el cálculo: cada huella es un SHA-256 hecho en el navegador con el formato oficial
// de la AEAT ("Especificaciones técnicas para generación de la huella o hash de los registros
// de facturación", v0.1.2), la integridad de la cadena se verifica de verdad recalculando cada
// bloque, y el QR sigue la especificación del servicio de cotejo (apuntando al entorno de pruebas).

export type TipoFactura = 'F2' | 'R5' // F2 = simplificada (ticket) · R5 = rectificativa de simplificada
export type EstadoAeat = 'enviada' | 'en_cola'

export interface TransaccionVerifactu {
  local: number // posición del restaurante en el árbol
  numSerie: string
  tipo: TipoFactura
  fechaHora: string // ISO con milisegundos y huso: 2026-10-08T21:04:12.890+02:00
  cuotaTotal: number
  importeTotal: number
  estado: EstadoAeat
  rectificaA?: string // numSerie de la factura que corrige (solo R5)
  motivo?: MotivoRectificacion // por qué se rectifica (solo R5)
}

// Misma forma que la Rectificativa real de la app (apps/api, modelo Rectificativa): el encargado deshace
// el cobro, cambia la cuenta (quita un plato, merma o invitación) y vuelve a cobrar por otro importe.
export interface MotivoRectificacion {
  causa: 'error_cobro' | 'cliente_reclamo' | 'otro' // motivo de un toque al deshacer el cobro
  cambio: 'quitado' | 'merma' | 'invitacion'         // qué se hizo en la cuenta
  plato: string
  precio: number
  antes: number    // unidades cobradas
  despues: number  // unidades en el nuevo cobro
  devolucion: 'cash' | 'tarjeta'
  deshizoPor: string
  cobroPor: string
}

export interface Bloque extends TransaccionVerifactu {
  indice: number
  huellaAnterior: string
  huella: string
}

interface LineaLog { id: number; hora: string; texto: string; tono: 'ok' | 'info' | 'error' | 'merma' }

const MAX_BLOQUES = 60
const URL_COTEJO_PRUEBAS = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR'

// ── Huella (formato oficial AEAT) ─────────────────────────────────────────────

const dos = (n: number) => n.toFixed(2)
const fechaExpedicion = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` // DD-MM-AAAA
const fechaHoraHuso = (iso: string) => iso.slice(0, 19) + iso.slice(23) // sin milisegundos
const horaCorta = (iso: string) => iso.slice(11, 23)
const truncar = (h: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '∅')

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
const importeAlAzar = () => Math.round((18 + Math.random() * 190) * 10) / 10

// Platos, causas y personal de ejemplo para las mermas e invitaciones simuladas
const PLATOS: [string, number][] = [
  ['PULPO', 14.95], ['SOLOMILLO', 16.45], ['BURRATA', 10.95], ['PATATAS BRAVAS', 6.95],
  ['GAMBAS', 9.99], ['CROQ. GAMBAS', 5.85], ['TARTAR DE ATÙN', 13.95], ['CARRILLERA', 12.95],
]
const CAUSAS_MERMA = ['queja del cliente', 'no servido', 'error de comanda'] // mermas antes de la cuenta (no fiscales)
const PERSONAL = ['Marta', 'Jordi', 'Lucía', 'Pau', 'Nerea']
const alAzar = <T,>(lista: T[]): T => lista[Math.floor(Math.random() * lista.length)]
const CAUSA_LABEL: Record<MotivoRectificacion['causa'], string> = { error_cobro: 'Error de cobro', cliente_reclamo: 'Cliente reclamó', otro: 'Otro' }
const CAUSA_BADGE: Record<MotivoRectificacion['causa'], string> = { error_cobro: 'ERROR COBRO', cliente_reclamo: 'RECLAMÓ', otro: 'OTRO' }
const CAMBIO_LABEL: Record<MotivoRectificacion['cambio'], string> = { quitado: 'Se quitó de la cuenta', merma: 'Merma', invitacion: 'Invitación de la casa' }
const quienes = (m: MotivoRectificacion) => (m.deshizoPor === m.cobroPor ? m.cobroPor : `${m.deshizoPor} → ${m.cobroPor}`)
const lineaMotivo = (m: MotivoRectificacion) => `${m.antes} → ${m.despues} × ${m.plato}`
const textoMotivo = (m: MotivoRectificacion) =>
  `${lineaMotivo(m)} (${CAMBIO_LABEL[m.cambio].toLowerCase()}) · ${CAUSA_LABEL[m.causa].toLowerCase()} · devuelto por ${m.devolucion === 'cash' ? 'efectivo' : 'tarjeta'} — ${quienes(m)}`

interface Local { nombre: string; serie: string }
const LOCALES_EJEMPLO = ['Restaurante 1', 'Restaurante 2', 'Restaurante 3', 'Restaurante 4', 'Restaurante 5']

// Serie de facturación de cada local a partir de sus iniciales ("Sensi Tapas" → ST)
function armarLocales(nombres: string[]): Local[] {
  const usadas = new Set<string>()
  return nombres.map((nombre, i) => {
    let serie = nombre.split(/\s+/).map(p => p[0] ?? '').join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || `L${i + 1}`
    if (usadas.has(serie)) serie = `${serie}${i + 1}`
    usadas.add(serie)
    return { nombre, serie }
  })
}

// ── Identidad visual: azul → verde del logo, nada de verde terminal ───────────

const AZUL = '#4B9EDF'
const VERDE = '#4CC8A0'
const ROJO = '#ef4444'
const FONDO = '#0f1a2e'

type Tono = 'valida' | 'rectificada' | 'rectificativa' | 'cola' | 'rota'
// Clases completas: Tailwind no ve las que se arman por partes
const ESTILO: Record<Tono, { borde: string; texto: string; brillo: string; badge: string }> = {
  valida:        { borde: 'border-[#4CC8A0]/40', texto: 'text-[#4CC8A0]', brillo: 'shadow-[0_0_18px_rgba(76,200,160,0.22)]',  badge: '✓ AEAT' },
  cola:          { borde: 'border-[#4B9EDF]/60', texto: 'text-[#4B9EDF]', brillo: 'shadow-[0_0_18px_rgba(75,158,223,0.35)]',  badge: '⏳ EN COLA' },
  rectificada:   { borde: 'border-amber-400/40', texto: 'text-amber-300', brillo: 'shadow-[0_0_18px_rgba(251,191,36,0.22)]',  badge: '↩ RECTIFICADA' },
  rectificativa: { borde: 'border-rose-400/50',  texto: 'text-rose-400',  brillo: 'shadow-[0_0_18px_rgba(251,113,133,0.28)]', badge: '⚡ RECTIFICATIVA' },
  rota:          { borde: 'border-red-500',      texto: 'text-red-500',   brillo: 'shadow-[0_0_26px_rgba(239,68,68,0.6)]',    badge: '✗ HUELLA ROTA' },
}

const BARRA_SCROLL = { scrollbarWidth: 'thin', scrollbarColor: 'rgba(76,200,160,0.45) transparent' } as const
const HEX = '0123456789ABCDEF'
const MARCA = 'OIDOOPS'

// Lluvia de caracteres de fondo. Dígitos hexadecimales (como las huellas) en el degradado
// azul→verde del logo, y con frecuencia una columna deja caer la palabra OIDOOPS. Para que se
// lea de verdad, sus letras no se desvanecen con el resto: quedan encendidas un par de segundos,
// más grandes y con brillo, en los colores del logo ("OIDO" en blanco, "OPS" en verde).
// Cada tanto cae también la viñeta del logo (el globo con el check): sola, o encabezando la palabra.
// Roja si la cadena está rota.
function LluviaMarca({ alerta }: { alerta: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const alertaRef = useRef(alerta)
  alertaRef.current = alerta

  useEffect(() => {
    const lienzo = ref.current
    const ctx = lienzo?.getContext('2d')
    if (!lienzo || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const TAM = 18
    const VIDA = 34 // ticks que una letra de la marca sigue encendida (~2,4 s)
    let columnas: { y: number; letra: number }[] = [] // letra = posición dentro de MARCA, -1 = dígitos al azar
    let fijas: { x: number; y: number; letra: number; vida: number }[] = []
    let vinetas: { x: number; y: number; vida: number }[] = []
    // La viñeta del logo, con las mismas coordenadas que el SVG (caja de 68×72)
    const GLOBO = new Path2D('M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z')
    const CHECK = new Path2D('M15 34 L29 48 L55 18')
    const ESCALA = (TAM * 1.7) / 72
    const ajustar = () => {
      lienzo.width = lienzo.offsetWidth
      lienzo.height = lienzo.offsetHeight
      columnas = Array.from({ length: Math.ceil(lienzo.width / TAM) }, () => ({ y: Math.random() * (lienzo.height / TAM), letra: -1 }))
      fijas = []
      vinetas = []
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(lienzo)
    const id = window.setInterval(() => {
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgba(15,26,46,0.14)'
      ctx.fillRect(0, 0, lienzo.width, lienzo.height)
      const total = Math.max(1, columnas.length - 1)
      const filas = lienzo.height / TAM

      ctx.font = `${TAM}px monospace`
      columnas.forEach((col, i) => {
        // La palabra solo arranca si le queda sitio para caer entera, y no pegada a otra columna con marca
        if (col.letra < 0 && col.y > 1 && col.y < filas - MARCA.length - 1 && Math.random() < 0.01
          && (columnas[i - 1]?.letra ?? -1) < 0 && (columnas[i + 1]?.letra ?? -1) < 0) {
          col.letra = 0
          // Una de cada tres palabras cae encabezada por la viñeta, como en el logo
          if (col.y > 3 && Math.random() < 0.34) vinetas.push({ x: i * TAM, y: (col.y - 1.25) * TAM, vida: VIDA + MARCA.length })
        } else if (col.letra < 0 && col.y > 2 && col.y < filas - 2 && Math.random() < 0.0012) {
          vinetas.push({ x: i * TAM, y: col.y * TAM, vida: VIDA }) // viñeta suelta
        }
        if (col.letra >= 0) {
          fijas.push({ x: i * TAM, y: col.y * TAM, letra: col.letra, vida: VIDA })
          col.letra = col.letra + 1 >= MARCA.length ? -1 : col.letra + 1
        } else {
          const t = i / total // 0 = azul (izquierda) → 1 = verde (derecha), como el logo
          ctx.fillStyle = alertaRef.current
            ? 'rgba(239,68,68,0.75)'
            : `rgba(${Math.round(75 + t)},${Math.round(158 + 42 * t)},${Math.round(223 - 63 * t)},0.9)`
          ctx.fillText(HEX[Math.floor(Math.random() * 16)], i * TAM, col.y * TAM)
        }
        col.y = col.y * TAM > lienzo.height && Math.random() > 0.975 ? 0 : col.y + 1
      })

      // Letras de la marca: se repintan en cada tick mientras les quede vida
      ctx.font = `bold ${TAM + 4}px monospace`
      fijas = fijas.filter(f => f.vida-- > 0)
      for (const f of fijas) {
        const a = Math.min(1, (f.vida / VIDA) * 1.6)
        const esOps = f.letra >= 4
        ctx.shadowBlur = 14
        if (alertaRef.current) {
          ctx.shadowColor = 'rgba(239,68,68,0.9)'
          ctx.fillStyle = `rgba(255,215,220,${a})`
        } else {
          ctx.shadowColor = esOps ? 'rgba(76,200,160,0.95)' : 'rgba(75,158,223,0.95)'
          ctx.fillStyle = esOps ? `rgba(110,240,195,${a})` : `rgba(255,255,255,${a})`
        }
        ctx.fillText(MARCA[f.letra], f.x - 2, f.y)
      }

      // Viñetas: globo en degradado azul→verde con el check blanco, también con vida propia
      vinetas = vinetas.filter(v => v.vida-- > 0)
      for (const v of vinetas) {
        ctx.save()
        ctx.globalAlpha = Math.min(1, (v.vida / VIDA) * 1.6)
        ctx.translate(v.x + TAM * 0.3 - (68 * ESCALA) / 2, v.y - 72 * ESCALA + 4)
        ctx.scale(ESCALA, ESCALA)
        const degradado = ctx.createLinearGradient(0, 0, 68, 72)
        degradado.addColorStop(0, alertaRef.current ? '#f87171' : AZUL)
        degradado.addColorStop(1, alertaRef.current ? '#b91c1c' : VERDE)
        ctx.shadowBlur = 16
        ctx.shadowColor = alertaRef.current ? 'rgba(239,68,68,0.9)' : 'rgba(76,200,160,0.9)'
        ctx.fillStyle = degradado
        ctx.fill(GLOBO)
        ctx.shadowBlur = 0
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke(CHECK)
        ctx.restore()
      }
    }, 70)
    return () => { window.clearInterval(id); observador.disconnect() }
  }, [])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
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

// `clave`: al cambiar, vuelve a buscar el elemento (el árbol no existe en la vista del teléfono)
function useTamano<T extends HTMLElement>(clave?: unknown) {
  const ref = useRef<T>(null)
  const [tam, setTam] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [clave])
  return [ref, tam] as const
}

// Teléfono: el árbol de columnas no entra (necesita ~760 px); se dibuja la cadena en vertical
function useEsMovil() {
  const consulta = '(max-width: 639px)'
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const cambio = () => setMovil(mq.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])
  return movil
}

// Un color por restaurante (en el teléfono, para saber de qué local es cada ticket)
const COLORES_LOCAL = ['#4B9EDF', '#4CC8A0', '#a78bfa', '#f59e0b', '#f472b6', '#22d3ee', '#a3e635']

function LogoOidoOps({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 70" className={className}>
      <defs>
        <linearGradient id="vf-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={AZUL} />
          <stop offset="100%" stopColor={VERDE} />
        </linearGradient>
      </defs>
      <path d="M14 2 L54 2 Q66 2 66 14 L66 52 Q66 62 54 62 L40 62 L34 70 L28 62 L14 62 Q2 62 2 52 L2 14 Q2 2 14 2 Z" fill="url(#vf-logo-g)" />
      <path d="M15 34 L29 48 L55 18" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="80" y="51" fontFamily="'Helvetica Neue', Arial, sans-serif" fontWeight="800" fontSize="44">
        <tspan fill="white">Oido</tspan><tspan fill={VERDE}>Ops</tspan>
      </text>
    </svg>
  )
}

// ── Geometría del árbol (px). Todo va en posición absoluta para poder trazar los hilos ──

const RAIZ_Y = 6
const RAIZ_H = 50
const RAMA_H = 34      // hueco entre el grupo y los restaurantes, donde van las ramas
const LOCAL_H = 72
const NODO_H = 60
const PASO = 72        // distancia vertical entre un ticket y el siguiente de su columna
const LOCAL_Y = RAIZ_Y + RAIZ_H + RAMA_H
const PRIMER_NODO_Y = LOCAL_Y + LOCAL_H + 16
const MOVIMIENTO = { type: 'tween', duration: 0.45, ease: 'easeOut' } as const

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  nifEmisor?: string
  nodoImpresion?: string // código de la Pi que imprime el ticket con el QR
  simular?: boolean      // añade ventas de ejemplo cada pocos segundos
}

export default function VerifactuMatrixLedger({
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
  const movil = useEsMovil()
  const [arbol, tam] = useTamano<HTMLDivElement>(movil)

  // Los restaurantes reales del grupo; si la API no responde, nombres genéricos
  const { data: restaurantes, isError } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const nombres = restaurantes?.length ? restaurantes.map(r => r.nombre).join('|') : isError ? LOCALES_EJEMPLO.join('|') : ''
  const locales = useMemo(() => (nombres ? armarLocales(nombres.split('|')) : []), [nombres])

  // Mermas ANTES de imprimir la cuenta: el plato sale de la comanda y nunca llega a una factura.
  // No son registros fiscales ni entran en la cadena; se cuentan aparte, como control interno.
  const [mermasPrevias, setMermasPrevias] = useState<{ n: number; total: number }[]>([])

  const bloquesRef = useRef<Bloque[]>([])
  const contador = useRef({ fac: [] as number[], rect: [] as number[], log: 0 })
  const temporizadores = useRef<number[]>([])
  const consola = useRef<HTMLDivElement>(null)

  const log = useCallback((texto: string, tono: LineaLog['tono'] = 'info') => {
    const hora = new Date().toTimeString().slice(0, 8)
    setLogs(prev => [...prev, { id: ++contador.current.log, hora, texto, tono }].slice(-60))
  }, [])

  const guardar = useCallback((lista: Bloque[]) => {
    bloquesRef.current = lista.slice(-MAX_BLOQUES)
    setBloques(bloquesRef.current)
  }, [])

  const venta = useCallback((local: number, fechaHora: string, estado: EstadoAeat): TransaccionVerifactu => (
    { local, numSerie: `${locales[local].serie}-2026-${++contador.current.fac[local]}`, tipo: 'F2', fechaHora, ...conIva(importeAlAzar()), estado }
  ), [locales])
  // Rectificativa por diferencias: descuenta solo lo que cambió en la cuenta, no anula el ticket
  const rectificativa = useCallback((origen: Pick<Bloque, 'local' | 'numSerie' | 'importeTotal'>, fechaHora: string, estado: EstadoAeat): TransaccionVerifactu => {
    const [plato, precio] = alAzar(PLATOS.filter(([, pr]) => pr <= origen.importeTotal))
    const antes = 1 + Math.floor(Math.random() * 3)
    const deshizoPor = alAzar(PERSONAL)
    const motivo: MotivoRectificacion = {
      causa: alAzar(['error_cobro', 'cliente_reclamo', 'cliente_reclamo', 'otro'] as const),
      cambio: alAzar(['quitado', 'merma', 'merma', 'invitacion'] as const),
      plato, precio, antes, despues: antes - 1,
      devolucion: Math.random() < 0.7 ? 'tarjeta' : 'cash',
      deshizoPor, cobroPor: Math.random() < 0.8 ? deshizoPor : alAzar(PERSONAL),
    }
    return {
      local: origen.local, tipo: 'R5', fechaHora, ...conIva(-precio), estado, rectificaA: origen.numSerie, motivo,
      numSerie: `${locales[origen.local].serie}-R-2026-${String(++contador.current.rect[origen.local]).padStart(3, '0')}`,
    }
  }, [locales])

  const anexar = useCallback(async (tx: TransaccionVerifactu) => {
    const previo = bloquesRef.current[bloquesRef.current.length - 1]
    const bloque = await crearBloque(tx, previo, nifEmisor)
    guardar([...bloquesRef.current, bloque])
    log(`[${locales[bloque.local]?.nombre}] SHA-256 ${bloque.numSerie} -> ${bloque.huella.slice(0, 8)}… encadenado a ${previo?.numSerie ?? '∅'}`, 'ok')
    if (bloque.rectificaA) log(`${bloque.numSerie} rectifica ${bloque.rectificaA} (R5, ${dos(bloque.importeTotal)} €)${bloque.motivo ? ` · ${textoMotivo(bloque.motivo)}` : ''}`)

    // "Envío" simulado: a los 2,5 s el registro pasa de la cola local a enviado
    if (bloque.estado === 'en_cola') {
      const t = window.setTimeout(() => {
        guardar(bloquesRef.current.map(b => (b.numSerie === bloque.numSerie ? { ...b, estado: 'enviada' as const } : b)))
        log(`${bloque.numSerie} enviado a AEAT Sandbox (simulado). Respuesta: Correcto.`, 'ok')
      }, 2500)
      temporizadores.current.push(t)
    }
  }, [guardar, log, nifEmisor, locales])

  // Cadena inicial: tickets de ejemplo repartidos entre los restaurantes, con una rectificativa
  useEffect(() => {
    if (locales.length === 0) return
    let vigente = true
    contador.current.fac = locales.map((_, i) => 100 + i * 7)
    contador.current.rect = locales.map(() => 10)
    setMermasPrevias(locales.map(() => ({ n: Math.floor(Math.random() * 3), total: 0 })).map(m => ({ ...m, total: Math.round(m.n * 8.4 * 100) / 100 })))
    ;(async () => {
      const lista: Bloque[] = []
      const TOTAL = 16
      for (let k = 0; k < TOTAL; k++) {
        const fechaHora = isoConHuso(new Date(Date.now() - (TOTAL - k) * 3 * 60_000))
        const tx = k === 10
          ? rectificativa(lista[6], fechaHora, 'enviada')
          : venta(Math.floor(Math.random() * locales.length), fechaHora, 'enviada')
        lista.push(await crearBloque(tx, lista[lista.length - 1], nifEmisor))
      }
      if (!vigente) return
      guardar(lista)
      log(`Cadena cargada: ${lista.length} registros de ${locales.length} restaurantes en UNA cadena (emisor ${nifEmisor}). SHA-256, formato AEAT v0.1.2.`)
    })()
    const pendientes = temporizadores.current
    return () => { vigente = false; pendientes.forEach(t => window.clearTimeout(t)) }
  }, [locales, nifEmisor, guardar, log, venta, rectificativa])

  // Ventas de ejemplo cada pocos segundos en un restaurante al azar; de vez en cuando, una rectificativa
  useEffect(() => {
    if (!simular || pausado || locales.length === 0) return
    const id = window.setInterval(() => {
      const lista = bloquesRef.current
      if (lista.length === 0) return
      const yaRectificadas = new Set(lista.map(b => b.rectificaA).filter(Boolean))
      const candidatas = lista.slice(-10).filter(b => b.tipo === 'F2' && b.estado === 'enviada' && !yaRectificadas.has(b.numSerie))
      const fechaHora = isoConHuso(new Date())
      if (candidatas.length > 0 && Math.random() < 0.16) {
        void anexar(rectificativa(candidatas[Math.floor(Math.random() * candidatas.length)], fechaHora, 'en_cola'))
      } else {
        void anexar(venta(Math.floor(Math.random() * locales.length), fechaHora, 'en_cola'))
      }
      if (Math.random() < 0.2) {
        const local = Math.floor(Math.random() * locales.length)
        const [plato, precio] = alAzar(PLATOS)
        setMermasPrevias(prev => prev.map((m, i) => (i === local ? { n: m.n + 1, total: Math.round((m.total + precio) * 100) / 100 } : m)))
        log(`[${locales[local].nombre}] merma antes de la cuenta: ${plato} (${alAzar(CAUSAS_MERMA)}) — ${alAzar(PERSONAL)} · ${dos(precio)} € · NO FISCAL: no llega a factura ni entra en la cadena`, 'merma')
      }
    }, 3500)
    return () => window.clearInterval(id)
  }, [simular, pausado, anexar, locales, venta, rectificativa, log])

  // Verificación real de la cadena cada vez que cambia
  useEffect(() => {
    let vigente = true
    primerBloqueRoto(bloques, nifEmisor).then(i => { if (vigente) setRotoEn(i) })
    return () => { vigente = false }
  }, [bloques, nifEmisor])

  useEffect(() => { consola.current?.scrollTo({ top: consola.current.scrollHeight }) }, [logs])

  // ── Colocación: cada ticket en la columna de su restaurante, el más nuevo arriba ──
  const n = Math.max(1, locales.length)
  const colW = tam.w / n
  const nodoW = Math.max(120, Math.min(colW - 28, 320))
  const cx = (local: number) => (local + 0.5) * colW
  const huecos = Math.max(1, Math.floor((tam.h - PRIMER_NODO_Y - 8) / PASO))

  const posiciones = useMemo(() => {
    const mapa = new Map<string, { x: number; y: number; visible: boolean }>()
    const cuenta = new Array<number>(n).fill(0)
    for (let i = bloques.length - 1; i >= 0; i--) {
      const b = bloques[i]
      const hueco = cuenta[b.local]++
      mapa.set(b.numSerie, { x: (b.local + 0.5) * colW, y: PRIMER_NODO_Y + hueco * PASO, visible: hueco < huecos })
    }
    return mapa
  }, [bloques, n, colW, huecos])

  // Hilo entre dos tickets: por el lateral si están en columnas distintas, recto si están apilados.
  // Siempre "M … C …" para que el trazo se pueda animar cuando la columna se desplaza.
  const hilo = (de: { x: number; y: number }, a: { x: number; y: number }) => {
    const y1 = de.y + NODO_H / 2
    const y2 = a.y + NODO_H / 2
    if (Math.abs(de.x - a.x) < 1) {
      return `M ${de.x} ${de.y + NODO_H} C ${de.x} ${de.y + NODO_H + 5} ${a.x} ${a.y - 5} ${a.x} ${a.y}`
    }
    const dir = a.x > de.x ? 1 : -1
    const x1 = de.x + dir * (nodoW / 2)
    const x2 = a.x - dir * (nodoW / 2)
    const tiro = Math.max(26, Math.abs(x2 - x1) * 0.45)
    return `M ${x1} ${y1} C ${x1 + dir * tiro} ${y1} ${x2 - dir * tiro} ${y2} ${x2} ${y2}`
  }
  // Lazo por el lado izquierdo de la columna: une una rectificativa con la factura que corrige
  const lazo = (de: { x: number; y: number }, a: { x: number; y: number }) => {
    const x = de.x - nodoW / 2
    return `M ${x} ${de.y + NODO_H / 2} C ${x - 14} ${de.y + NODO_H / 2} ${x - 14} ${a.y + NODO_H / 2} ${x} ${a.y + NODO_H / 2}`
  }

  // Demostración: alguien cambia a mano el importe de un ticket ya registrado, sin tocar su huella
  const manipular = () => {
    const lista = bloquesRef.current
    const visibles = lista.filter(b => posiciones.get(b.numSerie)?.visible)
    const objetivo = visibles[Math.max(0, visibles.length - 6)] ?? lista[Math.max(0, lista.length - 6)]
    if (!objetivo) return
    setManipulado({ numSerie: objetivo.numSerie, original: objetivo.importeTotal })
    guardar(lista.map(b => (b.numSerie === objetivo.numSerie ? { ...b, importeTotal: 1 } : b)))
    log(`!! ${objetivo.numSerie} (${locales[objetivo.local]?.nombre}): importe alterado ${dos(objetivo.importeTotal)} -> 1.00 fuera del sistema`, 'error')
    log(`!! La huella recalculada no coincide con la guardada. CADENA ROTA desde ese registro, en todos los restaurantes.`, 'error')
    void sacudida.start({ x: [0, -14, 14, -9, 9, -4, 4, 0], transition: { duration: 0.5 } })
  }
  const restaurar = () => {
    if (!manipulado) return
    guardar(bloquesRef.current.map(b => (b.numSerie === manipulado.numSerie ? { ...b, importeTotal: manipulado.original } : b)))
    log(`${manipulado.numSerie}: importe original restaurado. Cadena íntegra.`, 'ok')
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
  const porLocal = useMemo(() => locales.map((_, i) => {
    const suyos = bloques.filter(b => b.local === i)
    return { tickets: suyos.length, total: suyos.reduce((s, b) => s + b.importeTotal, 0), roto: rotoEn >= 0 && bloques.some((b, k) => b.local === i && k >= rotoEn) }
  }), [locales, bloques, rotoEn])

  useEffect(() => {
    if (!pantallaCompleta) return
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setPantallaCompleta(false) }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [pantallaCompleta])

  const boton = 'text-[11px] sm:text-sm font-bold border rounded-md px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap transition-colors'
  const listo = (movil || tam.w > 0) && locales.length > 0

  return (
    <motion.div
      animate={sacudida}
      className={`${pantallaCompleta ? 'fixed inset-0 z-50' : 'relative h-[calc(100dvh-5.5rem)] sm:h-full min-h-[560px] sm:min-h-[680px] rounded-2xl border border-[#4B9EDF]/25'} flex flex-col overflow-hidden bg-[#0f1a2e] font-mono text-slate-300`}
    >
      <LluviaMarca alerta={!integra} />

      {/* Header */}
      <div className="relative px-4 sm:px-8 pt-3 sm:pt-4 pb-3 border-b border-[#4B9EDF]/20 bg-[#0f1a2e]/75">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LogoOidoOps className="h-6 sm:h-9 w-auto" />
          <h2 className="text-sm sm:text-2xl font-bold tracking-[0.15em] text-white">
            <span className={`${integra ? 'text-[#4CC8A0]' : 'text-red-500'} animate-pulse`}>●</span> VERI*FACTU<span className="hidden sm:inline"> · CADENA EN VIVO</span>
          </h2>
          <span className="text-[10px] sm:text-[11px] font-bold text-amber-300 border border-amber-400/50 rounded px-2 py-1">SIMULACIÓN<span className="hidden sm:inline"> · DATOS DE EJEMPLO</span></span>
          {/* En el teléfono, una fila de botones a todo lo ancho */}
          <div className="w-full sm:w-auto sm:ml-auto grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
            <button onClick={() => setPausado(p => !p)} className={`${boton} text-slate-200 border-[#4B9EDF]/40 hover:bg-[#4B9EDF]/10`}>
              {pausado ? '▶ REANUDAR' : '⏸ PAUSA'}
            </button>
            {manipulado ? (
              <button onClick={restaurar} className={`${boton} text-[#4CC8A0] border-[#4CC8A0]/60 hover:bg-[#4CC8A0]/10`}>↺ RESTAURAR</button>
            ) : (
              <button onClick={manipular} disabled={bloques.length < 2} className={`${boton} text-rose-400 border-rose-500/60 hover:bg-rose-500/10 disabled:opacity-40`}>
                ⚠ <span className="sm:hidden">MANIPULAR</span><span className="hidden sm:inline">SIMULAR MANIPULACIÓN</span>
              </button>
            )}
            <button onClick={() => setPantallaCompleta(v => !v)} className={`${boton} text-slate-200 border-[#4B9EDF]/40 hover:bg-[#4B9EDF]/10`}>
              {pantallaCompleta ? <>✕ SALIR<span className="hidden sm:inline"> (ESC)</span></> : <>⛶ <span className="sm:hidden">COMPLETA</span><span className="hidden sm:inline">PANTALLA COMPLETA</span></>}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 mt-3 text-[11px] sm:text-sm">
          <span className={`col-span-2 text-center sm:text-left border rounded px-3 py-1 font-bold ${integra ? 'border-[#4CC8A0]/50 text-[#4CC8A0]' : 'border-red-500 text-red-400 bg-red-500/10 animate-pulse'}`}>
            {integra ? 'CADENA ÍNTEGRA' : `CADENA ROTA @ #${String(bloques[rotoEn]?.indice ?? 0).padStart(4, '0')}`}
          </span>
          <span className="border border-white/10 rounded px-3 py-1">REGISTROS <b className="text-white tabular-nums">{String(bloques.length).padStart(3, '0')}</b></span>
          <span className="border border-white/10 rounded px-3 py-1">FACTURADO <b className="text-[#4CC8A0] tabular-nums">{dos(kpis.total)} €</b></span>
          <span className="border border-white/10 rounded px-3 py-1">RECTIFICATIVAS <b className="text-rose-400 tabular-nums">{String(kpis.rectificativas).padStart(2, '0')}</b></span>
          <span className="border border-white/10 rounded px-3 py-1">EN COLA <b className="text-[#4B9EDF] tabular-nums">{String(kpis.enCola).padStart(2, '0')}</b></span>
          <span className="hidden lg:inline border border-white/10 rounded px-3 py-1 text-slate-400">NODO DE IMPRESIÓN {nodoImpresion}</span>
          <span className="hidden lg:inline border border-white/10 rounded px-3 py-1 text-slate-400">AEAT: SANDBOX · SIMULADO</span>
        </div>
        <p className={`mt-2 text-[10px] sm:text-sm font-bold tracking-wider truncate ${integra ? 'text-[#4CC8A0]/90' : 'text-red-500'}`}>
          <span className="text-slate-500 font-normal">ÚLTIMA HUELLA · {ultimo?.numSerie ?? '—'} · </span>{ultimaHuella || '…'}
        </p>
      </div>

      {/* Alerta de cadena rota */}
      <AnimatePresence>
        {!integra && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="relative overflow-hidden bg-red-600/90 text-white"
          >
            <p className="px-5 sm:px-8 py-2 text-sm sm:text-xl font-bold tracking-wider animate-pulse">
              ⚠ CADENA ROTA — registro alterado: {bloques[rotoEn]?.numSerie} ({locales[bloques[rotoEn]?.local ?? 0]?.nombre})
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {movil && (
        <CadenaMovil
          bloques={bloques} locales={locales} porLocal={porLocal} nif={nifEmisor} listo={listo}
          tonoDe={tonoDe} foco={pareja} onElegir={setSeleccion}
        />
      )}

      {/* Árbol: grupo → restaurantes → tickets, con los hilos de la cadena tejidos entre columnas */}
      {!movil && <div className="relative flex-1 min-h-[360px] overflow-x-auto overflow-y-hidden" style={BARRA_SCROLL}>
        <div ref={arbol} className="absolute inset-y-0 left-0 w-full min-w-[760px]">
          {!listo && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Generando cadena…</p>}

          {listo && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" width={tam.w} height={tam.h}>
              <defs>
                <linearGradient id="vf-hilo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={tam.w} y2="0">
                  <stop offset="0%" stopColor={AZUL} />
                  <stop offset="100%" stopColor={VERDE} />
                </linearGradient>
              </defs>

              {/* Ramas: del grupo a cada restaurante, y de cada restaurante a su primer ticket */}
              {locales.map((l, i) => {
                const y0 = RAIZ_Y + RAIZ_H
                const color = porLocal[i]?.roto ? ROJO : 'url(#vf-hilo)'
                return (
                  <g key={l.serie}>
                    <path
                      d={`M ${tam.w / 2} ${y0} C ${tam.w / 2} ${y0 + RAMA_H * 0.7} ${cx(i)} ${LOCAL_Y - RAMA_H * 0.7} ${cx(i)} ${LOCAL_Y}`}
                      fill="none" stroke={color} strokeWidth="2" opacity="0.7"
                    />
                    {(porLocal[i]?.tickets ?? 0) > 0 && (
                      <line x1={cx(i)} y1={LOCAL_Y + LOCAL_H} x2={cx(i)} y2={PRIMER_NODO_Y} stroke={color} strokeWidth="2" strokeDasharray="3 4" opacity="0.6" />
                    )}
                  </g>
                )
              })}

              {/* Hilos de la cadena: cada ticket apunta al registro anterior, esté en el restaurante que esté */}
              {bloques.map((b, i) => {
                if (i === 0) return null
                const de = posiciones.get(b.numSerie)
                const a = posiciones.get(bloques[i - 1].numSerie)
                if (!de || !a || !de.visible) return null
                const d = hilo(de, a)
                const rota = rotoEn >= 0 && i >= rotoEn
                const edad = bloques.length - 1 - i
                const opacidad = rota ? 0.9 : Math.max(0.28, 0.95 - edad * 0.07)
                return (
                  <g key={b.numSerie}>
                    <motion.path
                      fill="none" stroke={rota ? ROJO : 'url(#vf-hilo)'} strokeWidth={edad === 0 ? 2.5 : 1.75}
                      initial={{ d, opacity: 0 }} animate={{ d, opacity: opacidad }} transition={MOVIMIENTO}
                    />
                    {edad < 2 && (
                      <motion.path
                        fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 16"
                        initial={{ d, opacity: 0, strokeDashoffset: 0 }}
                        animate={{ d, opacity: 0.9, strokeDashoffset: -18 }}
                        transition={{ d: MOVIMIENTO, opacity: MOVIMIENTO, strokeDashoffset: { repeat: Infinity, ease: 'linear', duration: 0.6 } }}
                      />
                    )}
                  </g>
                )
              })}

              {/* Lazos de rectificación */}
              {bloques.map(b => {
                if (!b.rectificaA) return null
                const de = posiciones.get(b.numSerie)
                const a = posiciones.get(b.rectificaA)
                if (!de || !a || !de.visible || !a.visible) return null
                const d = lazo(de, a)
                const marcado = foco === b.numSerie || foco === b.rectificaA
                return (
                  <motion.path
                    key={`r-${b.numSerie}`} fill="none" stroke="#fb7185" strokeWidth={marcado ? 3 : 1.75} strokeDasharray="5 4"
                    initial={{ d, opacity: 0 }} animate={{ d, opacity: marcado ? 1 : 0.7 }} transition={MOVIMIENTO}
                  />
                )
              })}
            </svg>
          )}

          {/* Raíz: el grupo (el emisor de las facturas) */}
          {listo && (
            <div
              className={`absolute flex items-center gap-3 rounded-xl border-2 bg-[#16213a]/95 px-4 ${integra ? 'border-[#4CC8A0]/60 shadow-[0_0_24px_rgba(76,200,160,0.25)]' : 'border-red-500 shadow-[0_0_26px_rgba(239,68,68,0.6)]'}`}
              style={{ top: RAIZ_Y, height: RAIZ_H, left: tam.w / 2, transform: 'translateX(-50%)' }}
            >
              <LogoOidoOps className="h-6 w-auto shrink-0" />
              <div className="leading-tight whitespace-nowrap">
                <p className="text-xs font-bold text-white tracking-widest">GRUPO · UNA SOLA CADENA</p>
                <p className="text-[11px] text-slate-400">EMISOR {nifEmisor}</p>
              </div>
            </div>
          )}

          {/* Restaurantes */}
          {listo && locales.map((l, i) => (
            <div
              key={l.serie}
              className={`absolute rounded-xl border bg-[#16213a]/95 px-3 py-1.5 text-center ${porLocal[i]?.roto ? 'border-red-500' : 'border-[#4B9EDF]/50'}`}
              style={{ top: LOCAL_Y, height: LOCAL_H, width: nodoW, left: cx(i) - nodoW / 2 }}
            >
              <p className="text-sm font-bold text-white truncate">{l.nombre}</p>
              <p className="text-[11px] text-slate-400 truncate">
                SERIE {l.serie} · <span className="tabular-nums">{porLocal[i]?.tickets ?? 0}</span> tickets · <span className="text-[#4CC8A0] tabular-nums">{dos(porLocal[i]?.total ?? 0)} €</span>
              </p>
              <p className="text-[11px] text-amber-300/90 truncate" title="Mermas antes de imprimir la cuenta: no son registros fiscales ni entran en la cadena">
                🗑 <span className="tabular-nums">{mermasPrevias[i]?.n ?? 0}</span> {(mermasPrevias[i]?.n ?? 0) === 1 ? 'merma' : 'mermas'} sin factura · <span className="tabular-nums">{dos(mermasPrevias[i]?.total ?? 0)} €</span>
              </p>
            </div>
          ))}

          {/* Tickets */}
          <AnimatePresence>
            {listo && bloques.map((b, i) => {
              const pos = posiciones.get(b.numSerie)
              if (!pos || !pos.visible) return null
              const tono = tonoDe(b, i)
              const e = ESTILO[tono]
              const resaltado = pareja === b.numSerie || seleccion?.numSerie === b.numSerie
              return (
                <motion.button
                  key={b.numSerie}
                  type="button"
                  initial={{ y: pos.y - 46, opacity: 0, scale: 0.7 }}
                  animate={{ y: pos.y, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={MOVIMIENTO}
                  onClick={() => setSeleccion(b)}
                  onMouseEnter={() => setSobre(b.numSerie)}
                  onMouseLeave={() => setSobre(null)}
                  style={{ top: 0, left: pos.x - nodoW / 2, width: nodoW, height: NODO_H }}
                  className={`absolute text-left cursor-pointer rounded-lg border-2 bg-[#16213a]/95 px-3 py-1.5 hover:brightness-125 ${e.borde} ${e.brillo} ${resaltado ? 'ring-2 ring-white/80' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-bold truncate ${e.texto}`}>{b.numSerie}</span>
                    <span className={`text-base font-bold tabular-nums shrink-0 ${e.texto}`}>
                      {b.importeTotal < 0 ? '−' : ''}{dos(Math.abs(b.importeTotal))} €
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate">
                      {b.motivo && tono !== 'rota'
                        ? `${lineaMotivo(b.motivo)} · ${b.motivo.cobroPor}`
                        : `#${String(b.indice).padStart(4, '0')} · ${horaCorta(b.fechaHora).slice(0, 8)} · ${truncar(b.huella)}`}
                    </span>
                    <span className={`shrink-0 font-bold ${e.texto} ${tono === 'rota' ? 'animate-pulse' : ''}`}>
                      {b.motivo && tono === 'rectificativa' ? `🧾 RECT · ${CAUSA_BADGE[b.motivo.causa]}` : e.badge}
                    </span>
                  </div>
                </motion.button>
              )
            })}
          </AnimatePresence>

          {/* Los tickets más viejos se pierden hacia abajo */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10" style={{ background: `linear-gradient(to top, ${FONDO}, transparent)` }} />
        </div>
      </div>}

      {/* Consola */}
      <div ref={consola} style={BARRA_SCROLL} className="relative h-20 sm:h-28 shrink-0 overflow-y-auto border-t border-[#4B9EDF]/20 bg-black/40 px-4 sm:px-8 py-2 text-[10px] sm:text-xs leading-4 sm:leading-5">
        {logs.map(l => (
          <p key={l.id} className={l.tono === 'error' ? 'text-red-400 font-bold' : l.tono === 'ok' ? 'text-[#4CC8A0]' : l.tono === 'merma' ? 'text-amber-300/90' : 'text-slate-400'}>
            &gt; [{l.hora}] {l.texto}
          </p>
        ))}
      </div>

      <AnimatePresence>
        {seleccion && (
          <Inspector
            bloque={bloques.find(b => b.numSerie === seleccion.numSerie) ?? seleccion}
            nif={nifEmisor}
            local={locales[seleccion.local]?.nombre ?? ''}
            roto={rotoEn >= 0 && bloques.findIndex(b => b.numSerie === seleccion.numSerie) >= rotoEn}
            onClose={() => setSeleccion(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Teléfono: la cadena como línea de tiempo vertical ──────────────────────────
// La cadena es una sola para todo el grupo: en vertical se lee de arriba (lo último) hacia abajo,
// cada ticket unido al anterior por el hilo. El restaurante de cada uno, por su color.

function CadenaMovil({ bloques, locales, porLocal, nif, listo, tonoDe, foco, onElegir }: {
  bloques: Bloque[]
  locales: Local[]
  porLocal: { tickets: number; total: number; roto: boolean }[]
  nif: string
  listo: boolean
  tonoDe: (b: Bloque, i: number) => Tono
  foco: string | null
  onElegir: (b: Bloque) => void
}) {
  const recientes = bloques.map((b, i) => ({ b, i })).slice(-30).reverse()
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Restaurantes: pastillas con su color y sus cifras */}
      <div className="shrink-0 px-4 pt-3 pb-2 space-y-2">
        <p className="text-[10px] text-slate-400 tracking-widest">GRUPO · UNA SOLA CADENA · EMISOR {nif}</p>
        <div className="flex gap-2 overflow-x-auto pb-1" style={BARRA_SCROLL}>
          {locales.map((l, i) => (
            <div key={l.serie} className={`shrink-0 rounded-lg border bg-[#16213a]/95 px-2.5 py-1.5 ${porLocal[i]?.roto ? 'border-red-500' : 'border-white/10'}`}>
              <p className="text-[11px] font-bold text-white whitespace-nowrap">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: COLORES_LOCAL[i % COLORES_LOCAL.length] }} />
                {l.nombre}
              </p>
              <p className="text-[10px] text-slate-400 whitespace-nowrap tabular-nums">
                {porLocal[i]?.tickets ?? 0} tickets · <span className="text-[#4CC8A0]">{dos(porLocal[i]?.total ?? 0)} €</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-y-auto px-4 pb-6" style={BARRA_SCROLL}>
        {!listo && <p className="py-10 text-center text-sm text-slate-400">Generando cadena…</p>}
        <AnimatePresence initial={false}>
          {recientes.map(({ b, i }, k) => {
            const tono = tonoDe(b, i)
            const e = ESTILO[tono]
            const color = COLORES_LOCAL[b.local % COLORES_LOCAL.length]
            const ultimoVisible = k === recientes.length - 1
            const hiloRoto = tono === 'rota'
            return (
              <motion.div
                key={b.numSerie} layout
                initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={MOVIMIENTO}
                className="relative flex gap-3"
              >
                {/* Hilo de la cadena: punto del ticket y línea hasta el anterior */}
                <div className="relative w-4 shrink-0 flex flex-col items-center">
                  <span className={`mt-4 w-3 h-3 rounded-full border-2 ${tono === 'rota' ? 'border-red-500 bg-red-500/40' : 'border-white/80'}`} style={tono === 'rota' ? undefined : { background: color }} />
                  {!ultimoVisible && (
                    <span className="flex-1 w-0.5 mt-1"
                      style={{ background: hiloRoto ? ROJO : `linear-gradient(to bottom, ${AZUL}, ${VERDE})`, opacity: hiloRoto ? 0.9 : Math.max(0.35, 0.95 - k * 0.06) }} />
                  )}
                </div>
                <button type="button" onClick={() => onElegir(b)}
                  className={`flex-1 min-w-0 mb-2 text-left rounded-lg border-2 bg-[#16213a]/95 px-3 py-2 active:brightness-125 ${e.borde} ${e.brillo} ${foco === b.numSerie ? 'ring-2 ring-white/80' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-bold truncate ${e.texto}`}>{b.numSerie}</span>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${e.texto}`}>
                      {b.importeTotal < 0 ? '−' : ''}{dos(Math.abs(b.importeTotal))} €
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span className="truncate">
                      <span style={{ color }}>{locales[b.local]?.nombre}</span> · {horaCorta(b.fechaHora).slice(0, 8)} · {truncar(b.huella)}
                    </span>
                    <span className={`shrink-0 font-bold ${e.texto} ${tono === 'rota' ? 'animate-pulse' : ''}`}>{e.badge}</span>
                  </div>
                  {b.rectificaA && (
                    <p className="text-[10px] text-rose-300 mt-0.5 truncate">
                      ↩ corrige {b.rectificaA}{b.motivo ? ` · ${lineaMotivo(b.motivo)} · ${b.motivo.cobroPor}` : ''}
                    </p>
                  )}
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Inspector de un registro: datos en crudo, huella completa y QR ────────────

function Inspector({ bloque, nif, local, roto, onClose }: { bloque: Bloque; nif: string; local: string; roto: boolean; onClose: () => void }) {
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
        className="h-full w-full max-w-2xl overflow-y-auto border-l-2 border-[#4B9EDF]/50 bg-[#0f1a2e] p-4 sm:p-6 text-xs sm:text-sm text-slate-200 shadow-[0_0_40px_rgba(75,158,223,0.25)]"
      >
        <div className="flex items-center mb-3">
          <p className="min-w-0 text-lg sm:text-xl font-bold text-[#4CC8A0]">{bloque.numSerie} <span className="text-sm font-normal text-slate-400">· {local}</span></p>
          <button onClick={onClose} className="ml-auto shrink-0 whitespace-nowrap border border-[#4B9EDF]/40 hover:bg-[#4B9EDF]/10 rounded px-2 py-0.5">[x] CERRAR</button>
        </div>

        <p className="text-slate-400 mb-1">// HUELLA SHA-256 (64 caracteres)</p>
        <div className="flex items-start gap-2 mb-1">
          <code className="break-all text-sm sm:text-base font-bold text-[#4CC8A0]">{bloque.huella}</code>
          <button onClick={copiar} className="shrink-0 border border-[#4B9EDF]/40 hover:bg-[#4B9EDF]/10 rounded px-2 py-0.5">{copiado ? '✓ COPIADO' : 'COPIAR HASH'}</button>
        </div>
        <p className={`mb-3 ${recalculada && recalculada !== bloque.huella ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
          {recalculada && recalculada !== bloque.huella
            ? `✗ Recalculada ahora: ${recalculada} — NO coincide: el registro fue alterado.`
            : roto
              ? '⚠ Esta huella es correcta, pero un registro anterior de la cadena fue alterado.'
              : '✓ Recalculada ahora en el navegador: coincide.'}
        </p>

        {bloque.motivo && (
          <>
            <p className="text-slate-400 mb-1">// MOTIVO DE LA RECTIFICACIÓN</p>
            <div className="rounded border border-rose-400/40 bg-rose-500/10 p-3 mb-3 text-slate-200">
              <p className="text-base font-bold text-rose-300">↩ Cobro deshecho y vuelto a cobrar · {CAUSA_LABEL[bloque.motivo.causa]}</p>
              <p className="mt-1">
                <b>{lineaMotivo(bloque.motivo)}</b> ({CAMBIO_LABEL[bloque.motivo.cambio].toLowerCase()}) · −{dos(bloque.motivo.precio)} €
              </p>
              <p>Devuelto al cliente por: <b>{bloque.motivo.devolucion === 'cash' ? 'efectivo (de la caja)' : 'tarjeta (datáfono)'}</b></p>
              <p>{bloque.motivo.deshizoPor === bloque.motivo.cobroPor
                ? <>Lo hizo: <b>{bloque.motivo.cobroPor}</b></>
                : <>Deshizo el cobro: <b>{bloque.motivo.deshizoPor}</b> · volvió a cobrar: <b>{bloque.motivo.cobroPor}</b></>}</p>
              <p>Corrige a: <b>{bloque.rectificaA}</b> (rectificativa por diferencias: descuenta solo lo que cambió)</p>
            </div>
          </>
        )}

        <p className="text-slate-400 mb-1">// CADENA SOBRE LA QUE SE CALCULA (formato AEAT)</p>
        <pre className="whitespace-pre-wrap break-all rounded border border-white/10 bg-black/50 p-2 mb-3">{cadena}</pre>

        <p className="text-slate-400 mb-1">// REGISTRO DE ALTA (campos principales)</p>
        <pre className="overflow-x-auto rounded border border-white/10 bg-black/50 p-2 mb-3">{JSON.stringify(registro, null, 2)}</pre>

        <p className="text-slate-400 mb-1">// QR TRIBUTARIO</p>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          {qr && <img src={qr} alt="QR tributario de ejemplo" className="w-48 h-48 rounded bg-white p-1 shrink-0" />}
          <div className="min-w-0">
            <p className="break-all text-[#4B9EDF]">{url}</p>
            <p className="mt-2 text-amber-300/90">
              QR real en formato, de demostración en contenido: apunta al entorno de PRUEBAS de la AEAT, donde esta factura no existe.
            </p>
          </div>
        </div>

        <p className="text-slate-400 mb-1">// EMISOR Y RESPUESTA AEAT (simulado)</p>
        <pre className="whitespace-pre-wrap rounded border border-white/10 bg-black/50 p-2">
{`certificado:  ninguno — en real, certificado electrónico cualificado del emisor
endpoint:     sandbox simulado (no se envía nada)
estado:       ${bloque.estado === 'enviada' ? 'Correcto (simulado)' : 'En cola local, pendiente de envío'}`}
        </pre>
      </motion.div>
    </motion.div>
  )
}
