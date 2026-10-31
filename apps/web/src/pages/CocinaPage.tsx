import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, LineaCocina, TipoFicha } from '../api'
import { enModoLocal } from '../lib/conexion'
import MiHorario from '../components/MiHorario'
import { PropinasPeriodo } from './MisPropinasPage'
import AgotadosSala from '../components/AgotadosSala'
import { useRestaurantEvents } from '../hooks/useRestaurantEvents'

// Pantalla del personal de cocina en la app central (/sala/cocina): entran con su PIN en /sala como
// todos y ven lo suyo — 📖 la wiki de cocina (las fichas técnicas que crea el chef ejecutivo en
// /admin/escandallos: platos de la carta del local donde trabajan hoy y todas las elaboraciones, con
// las cantidades escaladas a lo que van a hacer, sin precios) — y lo común a todo el personal:
// 🗓 su horario y 💰 sus propinas.

const LOCAL_KEY = 'cocina_restaurante'
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : NaN }

// ── Foto (se pide con la sesión: un <img src> directo no la manda) ───────────────
function useFoto(tipo: TipoFicha, id: number, fotoAt: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!fotoAt) { setUrl(null); return }
    let viva = true
    let u: string | null = null
    api.cocina.foto(tipo, id).then(b => { if (viva) { u = URL.createObjectURL(b); setUrl(u) } }).catch(() => {})
    return () => { viva = false; if (u) URL.revokeObjectURL(u) }
  }, [tipo, id, fotoAt])
  return url
}

function Miniatura({ tipo, id, fotoAt, icono }: { tipo: TipoFicha; id: number; fotoAt: string | null; icono: string }) {
  const url = useFoto(tipo, id, fotoAt)
  return url
    ? <img src={url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
    : <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center text-2xl shrink-0">{icono}</div>
}

// ── Cantidades escaladas: 1500 g → 1,5 kg ───────────────────────────────────────
function cantidadTexto(l: LineaCocina, factor: number) {
  if (l.texto) return l.texto
  if (l.cantidad <= 0) return 'c/s'
  const v = l.cantidad * factor
  const redondo = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: n < 10 ? 1 : 0 })
  if (l.unidad === 'g' && v >= 1000) return `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg`
  if (l.unidad === 'ml' && v >= 1000) return `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} l`
  return `${redondo(v)} ${l.unidad}`
}

const porUnidadBase = (unidad: string) => (unidad === 'kg' || unidad === 'l' ? 1000 : 1)

// ── Ficha a pantalla completa ───────────────────────────────────────────────────
function FichaVista({ tipo, id, onVolver, onAbrir }: { tipo: TipoFicha; id: number; onVolver: () => void; onAbrir: (tipo: TipoFicha, id: number) => void }) {
  const { data: f, isLoading, error } = useQuery({ queryKey: ['cocina-ficha', tipo, id], queryFn: () => api.cocina.ficha(tipo, id) })
  const foto = useFoto(tipo, id, f?.fotoAt ?? null)
  const [cuanto, setCuanto] = useState('')

  // Lo de partida: las raciones del plato, o la tanda de la elaboración en kg / l / ud
  const base = !f ? null : f.tipo === 'plato' ? f.raciones : f.rendimiento ? f.rendimiento / porUnidadBase(f.unidadTanda) : null
  useEffect(() => { if (base !== null) setCuanto(String(base)) }, [base])
  const factor = base && num(cuanto) > 0 ? num(cuanto) / base : 1
  // El emplatado se escribe un paso por renglón
  const pase = (f?.emplatado ?? '').split('\n').map(x => x.replace(/^\s*\d+[.)-]?\s*/, '').trim()).filter(Boolean)

  return (
    <div className="fixed inset-0 z-40 bg-[#0f1a2e] text-slate-100 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-[#0f1a2e]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <button onClick={onVolver} className="w-11 h-11 rounded-xl bg-white/5 text-xl shrink-0">←</button>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-400">{f?.tipo === 'plato' ? f.categoria : '⚗️ Elaboración'}</p>
          <h1 className="text-xl font-black leading-tight">{f?.nombre ?? 'Cargando…'}</h1>
        </div>
      </div>

      {isLoading && <p className="p-6 text-slate-400">Cargando…</p>}
      {error && <p className="p-6 text-red-400">{(error as Error).message}</p>}
      {f && (
        <div className="max-w-2xl mx-auto p-4 space-y-5 pb-16">
          {foto && <img src={foto} alt="" className="w-full max-h-80 object-cover rounded-2xl" />}

          {f.tipo === 'plato' && f.alergenos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {f.alergenos.map(a => <span key={a.nombre} className="px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-200 text-sm font-semibold">{a.icono} {a.nombre}</span>)}
              {f.alergenosNota && <p className="w-full text-xs text-amber-200/80">{f.alergenosNota}</p>}
            </div>
          )}

          {/* Al pase: cómo se monta y sale el plato, lo que mira la línea en pleno servicio */}
          {pase.length > 0 && (
            <section className="rounded-2xl bg-[#4CC8A0]/10 border border-[#4CC8A0]/40 overflow-hidden">
              <h2 className="px-4 py-2.5 bg-[#4CC8A0]/15 text-sm font-black uppercase tracking-wider text-[#4CC8A0]">🍽 Al pase · para sacar el plato</h2>
              <ol className="px-4 py-3 space-y-3">
                {pase.map((paso, i) => (
                  <li key={i} className="flex gap-3 text-xl leading-snug">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-[#4CC8A0] text-[#0f1a2e] text-base font-black flex items-center justify-center">{i + 1}</span>
                    <span>{paso}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {pase.length > 0 && f.partes.length > 0 && (
            <h2 className="pt-2 text-sm font-black uppercase tracking-wider text-slate-400">🔪 Preparación · mise en place</h2>
          )}

          {/* Escalar: cuánto se va a hacer */}
          {base !== null && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <span className="text-slate-300">{f.tipo === 'plato' ? 'Para' : 'Tanda de'}</span>
              <button onClick={() => setCuanto(c => String(Math.max(1, Math.round((num(c) || base) - 1))))} className="w-11 h-11 rounded-xl bg-white/10 text-2xl font-bold">−</button>
              <input value={cuanto} onChange={ev => setCuanto(ev.target.value)} inputMode="decimal"
                className="w-20 text-center text-2xl font-black bg-[#0f1a2e] border border-white/15 rounded-xl py-1.5 focus:outline-none focus:border-[#4CC8A0]" />
              <button onClick={() => setCuanto(c => String(Math.round((num(c) || base) + 1)))} className="w-11 h-11 rounded-xl bg-white/10 text-2xl font-bold">+</button>
              <span className="text-slate-300">{f.tipo === 'plato' ? (num(cuanto) === 1 ? 'ración' : 'raciones') : f.unidadTanda}</span>
              {factor !== 1 && <button onClick={() => setCuanto(String(base))} className="ml-auto text-sm text-[#4B9EDF] font-semibold">Receta original ({base})</button>}
            </div>
          )}

          {f.partes.map((p, k) => (
            <section key={k} className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
              {p.nombre && <h2 className="px-4 py-2.5 bg-white/5 text-sm font-black uppercase tracking-wider text-[#4CC8A0]">{p.nombre}</h2>}
              {p.lineas.length > 0 && (
                <ul className="divide-y divide-white/5">
                  {p.lineas.map((l, i) => (
                    <li key={i} className="flex items-baseline gap-3 px-4 py-2.5 text-lg">
                      {l.elaboracionId
                        ? <button onClick={() => onAbrir('elab', l.elaboracionId!)} className="flex-1 text-left font-semibold text-[#4B9EDF]">⚗️ {l.nombre} ›</button>
                        : <span className="flex-1">{l.nombre}</span>}
                      <span className={`font-mono font-bold tabular-nums ${l.texto || l.cantidad <= 0 ? 'text-slate-400' : 'text-white'}`}>{cantidadTexto(l, factor)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {p.pasos.length > 0 && (
                <ol className="px-4 py-3 space-y-2.5 border-t border-white/5">
                  {p.pasos.map((paso, i) => (
                    <li key={i} className="flex gap-3 text-lg leading-snug">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e] text-sm font-black flex items-center justify-center">{i + 1}</span>
                      <span>{paso}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}

          {f.notas && (
            <section className="rounded-2xl bg-amber-400/10 border border-amber-400/30 px-4 py-3">
              <h2 className="text-sm font-black uppercase tracking-wider text-amber-300 mb-1.5">📝 Notas</h2>
              <p className="text-lg leading-snug whitespace-pre-line">{f.notas}</p>
            </section>
          )}
          {f.tipo === 'elab' && f.usadaEn.length > 0 && (
            <p className="text-sm text-slate-400">Se usa en: {f.usadaEn.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Lista ───────────────────────────────────────────────────────────────────────
function Recetario({ restauranteDispositivo }: { restauranteDispositivo: number | null }) {
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  // El local donde trabaja hoy: el del dispositivo, salvo que elija otro (las recetas no son secretas)
  const [ridSel, setRidSel] = useState<number | null>(() => Number(localStorage.getItem(LOCAL_KEY)) || null)
  const rid = ridSel ?? restauranteDispositivo ?? restaurantes[0]?.id ?? null
  const [vista, setVista] = useState<'platos' | 'elaboraciones'>('platos')
  const [busca, setBusca] = useState('')
  // Pila de fichas abiertas: desde un plato se entra a la elaboración que lleva y "←" vuelve al plato
  const [abiertas, setAbiertas] = useState<{ tipo: TipoFicha; id: number }[]>([])

  const recetas = useQuery({ queryKey: ['cocina-recetas', rid], queryFn: () => api.cocina.recetas(rid), enabled: rid !== null })

  const nb = norm(busca.trim())
  const platos = useMemo(() => (recetas.data?.platos ?? [])
    .filter(p => !nb || norm(p.nombre).includes(nb) || norm(p.categoria).includes(nb))
    .sort((a, b) => a.categoriaOrden - b.categoriaOrden), [recetas.data, nb])
  const elaboraciones = (recetas.data?.elaboraciones ?? []).filter(e => !nb || norm(e.nombre).includes(nb))
  const porCategoria = useMemo(() => {
    const m = new Map<string, typeof platos>()
    for (const p of platos) m.set(p.categoria, [...(m.get(p.categoria) ?? []), p])
    return [...m.entries()]
  }, [platos])

  const elegirLocal = (id: number) => { setRidSel(id); localStorage.setItem(LOCAL_KEY, String(id)) }
  const abrir = (tipo: TipoFicha, id: number) => setAbiertas(a => [...a, { tipo, id }])
  const actual = abiertas[abiertas.length - 1]
  const pestana = (activa: boolean) => `flex-1 py-3 rounded-xl text-base font-black ${activa ? 'bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e]' : 'bg-white/5 text-slate-300'}`

  return (
    <div>
      {/* Dónde trabajas hoy: se ven los platos de su carta */}
      {restaurantes.length > 1 && (
        <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto">
          {restaurantes.map(r => (
            <button key={r.id} onClick={() => elegirLocal(r.id)}
              className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-bold ${rid === r.id ? 'bg-[#4CC8A0] text-[#0f1a2e]' : 'bg-white/5 text-slate-300'}`}>
              {r.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={() => setVista('platos')} className={pestana(vista === 'platos')}>🍽 Platos</button>
          <button onClick={() => setVista('elaboraciones')} className={pestana(vista === 'elaboraciones')}>⚗️ Elaboraciones</button>
        </div>
        <input value={busca} onChange={ev => setBusca(ev.target.value)} placeholder="🔍 Buscar"
          className="w-full text-lg bg-white/5 border border-white/10 rounded-xl px-4 py-3 placeholder:text-slate-500 focus:outline-none focus:border-[#4CC8A0]" />
      </div>

      <div className="px-4 py-4 space-y-5 pb-16">
        {recetas.isLoading && <p className="text-slate-400">Cargando…</p>}
        {recetas.error && <p className="text-red-400">{(recetas.error as Error).message}</p>}

        {vista === 'platos' && porCategoria.map(([cat, ps]) => (
          <div key={cat}>
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{cat}</h2>
            <div className="space-y-2">
              {ps.map(p => (
                <button key={p.id} onClick={() => abrir('plato', p.id)} className="w-full flex items-center gap-3 rounded-2xl bg-white/5 active:bg-white/10 p-2.5 text-left">
                  <Miniatura tipo="plato" id={p.id} fotoAt={p.fotoAt} icono="🍽" />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold leading-tight">{p.nombre}</p>
                    {p.partes > 1 && <p className="text-sm text-slate-400">{p.partes} partes</p>}
                  </div>
                  <span className="text-slate-500 text-xl pr-1">›</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {vista === 'platos' && recetas.data && platos.length === 0 && (
          <p className="text-slate-400">{nb ? 'Ningún plato con ese nombre.' : 'Este local todavía no tiene platos con ficha.'}</p>
        )}

        {vista === 'elaboraciones' && (
          <div className="space-y-2">
            {elaboraciones.map(e => (
              <button key={e.id} onClick={() => abrir('elab', e.id)} className="w-full flex items-center gap-3 rounded-2xl bg-white/5 active:bg-white/10 p-2.5 text-left">
                <Miniatura tipo="elab" id={e.id} fotoAt={e.fotoAt} icono="⚗️" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold leading-tight">{e.nombre}</p>
                  {e.produccion && <p className="text-sm text-slate-400">la hace {e.produccion}</p>}
                </div>
                <span className="text-slate-500 text-xl pr-1">›</span>
              </button>
            ))}
            {recetas.data && elaboraciones.length === 0 && <p className="text-slate-400">{nb ? 'Ninguna elaboración con ese nombre.' : 'Todavía no hay elaboraciones con ficha.'}</p>}
          </div>
        )}
      </div>

      {actual && <FichaVista key={`${actual.tipo}-${actual.id}-${abiertas.length}`} tipo={actual.tipo} id={actual.id}
        onVolver={() => setAbiertas(a => a.slice(0, -1))} onAbrir={abrir} />}
    </div>
  )
}

// ── Pantalla ────────────────────────────────────────────────────────────────────
type Pestana = 'recetas' | 'altos' | 'horario' | 'propinas'

// 🚫 Altos: el jefe de cocina canta lo que se acabó (sale ALTO en las impresoras y la sala lo ve apagado),
// igual que el encargado desde su panel 💼. Siempre del local donde entró (el del dispositivo).
function Altos({ restaurantId }: { restaurantId: number }) {
  const { data: agotados = [] } = useQuery({ queryKey: ['agotados', restaurantId], queryFn: () => api.agotados.list(restaurantId) })
  return <div data-sala-theme="dark" className="px-4 pb-10 space-y-3"><AgotadosSala restaurantId={restaurantId} agotados={agotados} /></div>
}

export default function CocinaPage() {
  const navigate = useNavigate()
  const empleado = (() => { try { return JSON.parse(sessionStorage.getItem('oidoops_camarero') ?? '') as { id: number; nombre: string; rol?: string | null } } catch { return null } })()
  const restaurante = (() => { try { return JSON.parse(localStorage.getItem('oidoops_restaurant') ?? '') as { id: number; nombre: string } } catch { return null } })()
  const [pestana, setPestana] = useState<Pestana>('recetas')
  const jefe = empleado?.rol === 'jefe_cocina' && !!restaurante
  useRestaurantEvents(jefe ? restaurante.id : null)
  useEffect(() => { if (!empleado) navigate('/sala', { replace: true }) }, [])
  if (!empleado) return null
  const salir = () => { sessionStorage.removeItem('oidoops_camarero'); navigate('/sala', { replace: true }) }
  const tab = (p: Pestana, texto: string) => (
    <button onClick={() => setPestana(p)}
      className={`flex-1 py-2.5 rounded-xl text-sm font-black ${pestana === p ? 'bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-[#0f1a2e]' : 'text-slate-300'}`}>
      {texto}
    </button>
  )

  return (
    <div className="min-h-screen bg-[#0f1a2e] text-slate-100">
      <header className="px-4 pt-6 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[#4CC8A0] text-xs font-semibold">{restaurante?.nombre}</p>
          <h1 className="text-2xl font-black">Hola, {empleado.nombre.split(' ')[0]}</h1>
        </div>
        <button onClick={salir} className="text-slate-400 text-sm mt-1 px-2 py-1">Salir</button>
      </header>
      <div className="px-4 pb-4">
        <div className="flex gap-1 rounded-2xl bg-white/5 p-1">
          {tab('recetas', '📖 Recetas')}
          {jefe && tab('altos', '🚫 Altos')}
          {tab('horario', '🗓 Horario')}
          {tab('propinas', '💰 Propinas')}
        </div>
      </div>

      {enModoLocal() ? (
        <p className="mx-4 rounded-2xl bg-amber-400/10 px-4 py-3 text-sm text-amber-400">Sin internet: las recetas, el horario y las propinas vuelven cuando vuelva la conexión.</p>
      ) : pestana === 'recetas' ? (
        <Recetario restauranteDispositivo={restaurante?.id ?? null} />
      ) : pestana === 'altos' && jefe ? (
        <Altos restaurantId={restaurante.id} />
      ) : pestana === 'horario' ? (
        <div className="px-4 pb-10"><MiHorario restaurantId={restaurante?.id} /></div>
      ) : (
        <PropinasPeriodo empleadoId={empleado.id} />
      )}
    </div>
  )
}
