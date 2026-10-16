import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, Comanda, MenuItem, ColorVino, ParejaMaridaje, PerfilVino, RasgoVino, valorItem } from '../api'
import { speak } from '../lib/tts'

// 🍷 ¿Qué vino? — el asistente de vinos de la sala. Puntúa cada vino del color que quieren con:
//   · la comida de la mesa, si ya la pidieron (maridajes que Claude dejó calculados), y/o
//   · lo que pide el cliente ("full-bodied", "seco"…), comparado con el perfil de cada vino.
// Se quedan los que encajan y se ofrecen DEL MÁS CARO AL MÁS BARATO (se quiere vender botella buena,
// pero nunca una que no vaya): los dos más caros y, de tercero, el que mejor encaja, como alternativa
// a mano si el cliente duda. Con comida en la mesa hay un techo de precio (lo gastado en comida × 1,5,
// mínimo 35 €) para no ofrecer 100 € a quien pidió dos tapas; lo que lo pasa queda en "Ver más caros".
// Solo cruza lo guardado en /admin/maridajes: instantáneo y sin internet.

const COLORES: { id: ColorVino | 'todos'; label: string }[] = [
  { id: 'blanco', label: 'Blanco' },
  { id: 'tinto', label: 'Tinto' },
  { id: 'rosado', label: 'Rosado' },
  { id: 'espumoso', label: 'Cava' },
  { id: 'todos', label: 'Me da igual' },
]

// Lo que pide el cliente → qué rasgo del perfil (1-5) y hacia dónde. "contra" = el opuesto, se excluyen
type GustoId = 'cuerpo' | 'ligero' | 'seco' | 'dulce' | 'afrutado' | 'fresco' | 'madera' | 'sinMadera' | 'aromatico'
const GUSTOS: { id: GustoId; es: string; en: string; rasgo: RasgoVino; objetivo: number; contra?: GustoId }[] = [
  { id: 'cuerpo', es: 'Con cuerpo', en: 'Full-bodied', rasgo: 'cuerpo', objetivo: 5, contra: 'ligero' },
  { id: 'ligero', es: 'Ligero', en: 'Light', rasgo: 'cuerpo', objetivo: 1, contra: 'cuerpo' },
  { id: 'seco', es: 'Seco', en: 'Dry', rasgo: 'dulzor', objetivo: 1, contra: 'dulce' },
  { id: 'dulce', es: 'Suave / dulce', en: 'Sweet', rasgo: 'dulzor', objetivo: 4, contra: 'seco' },
  { id: 'afrutado', es: 'Afrutado', en: 'Fruity', rasgo: 'fruta', objetivo: 5 },
  { id: 'fresco', es: 'Fresco', en: 'Crisp', rasgo: 'frescor', objetivo: 5 },
  { id: 'madera', es: 'Con madera', en: 'Oaky', rasgo: 'madera', objetivo: 5, contra: 'sinMadera' },
  { id: 'sinMadera', es: 'Sin madera', en: 'Unoaked', rasgo: 'madera', objetivo: 1, contra: 'madera' },
  { id: 'aromatico', es: 'Aromático', en: 'Aromatic', rasgo: 'aromatico', objetivo: 5 },
]

const NEUTRO = 5          // sin dato (plato nuevo sin calcular, vino sin perfil): ni suma ni resta
const PEGA = 7            // nota a partir de la cual un vino "encaja"
const A_LA_VISTA = 3      // cuántos se ven antes de "Ver más"
const TECHO_X = 1.5       // techo de precio = comida × esto…
const TECHO_MIN = 35      // …y nunca menos que esto

// Rasgo 1-5 vs lo pedido: igual = 10, a un punto = 7,5, a dos = 5…
const notaRasgo = (valor: number, objetivo: number) => Math.max(0, 10 - Math.abs(valor - objetivo) * 2.5)

// Lo que destaca de un vino, en dos palabras, para que el camarero lo cuente
function rasgosDestacados(p: PerfilVino | null): string[] {
  if (!p) return []
  const r: string[] = []
  if (p.cuerpo >= 4) r.push('con cuerpo'); else if (p.cuerpo <= 2) r.push('ligero')
  if (p.dulzor >= 3) r.push('suave'); else r.push('seco')
  if (p.fruta >= 4) r.push('afrutado')
  if (p.frescor >= 4) r.push('fresco')
  if (p.madera >= 4) r.push('con madera'); else if (p.madera === 1) r.push('sin madera')
  if (p.aromatico >= 4) r.push('aromático')
  return r
}

type Etiqueta = 'primero' | 'mejor' | null
interface Sugerencia {
  vino: MenuItem; nota: number; etiqueta: Etiqueta; perfil: PerfilVino | null
  razon: ParejaMaridaje | null; platoRazon: string; vaCon: string[]
}
const ETIQUETA: Record<Exclude<Etiqueta, null>, string> = { primero: '💎 Recomendar primero', mejor: '⭐ El que mejor encaja' }

// Los dos más caros y, si no está entre ellos, el que mejor encaja de tercero
function ordenar<T extends { nota: number; vino: MenuItem }>(lista: T[]): (T & { etiqueta: Etiqueta })[] {
  const porPrecio = [...lista].sort((a, b) => b.vino.precio - a.vino.precio)
  if (porPrecio.length === 0) return []
  const mejor = porPrecio.reduce((m, c) => (c.nota > m.nota ? c : m), porPrecio[0])
  const orden = porPrecio.indexOf(mejor) < 2
    ? porPrecio
    : [porPrecio[0], porPrecio[1], mejor, ...porPrecio.slice(2).filter(c => c !== mejor)]
  return orden.map((c, i) => ({ ...c, etiqueta: i === 0 ? 'primero' : c === mejor && orden[0] !== mejor ? 'mejor' : null }))
}

export default function MaridajeSheet({ comanda, menu, agotadoIds, onAdd, onClose }: {
  comanda: Comanda
  menu: MenuItem[]
  agotadoIds: Set<number>
  onAdd: (vino: MenuItem) => void
  onClose: () => void
}) {
  const [color, setColor] = useState<ColorVino | 'todos' | null>(null)
  const [gustos, setGustos] = useState<Set<GustoId>>(new Set())
  const [verMas, setVerMas] = useState<'baratos' | 'caros' | null>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['maridajes', comanda.restaurantId],
    queryFn: () => api.maridajes.sala(comanda.restaurantId),
    staleTime: 5 * 60_000,
  })

  // La comida de la mesa (cocina, sin lo automático): platos reconocidos por nombre y lo que suma
  const itemsComida = comanda.items.filter(i => i.tipo !== 'barra' && !i.autoGenerado)
  const platos = useMemo(() => {
    const nombres = new Set(itemsComida.map(i => i.nombre))
    return menu.filter(m => nombres.has(m.nombre))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comanda.items, menu])
  const comida = itemsComida.reduce((s, i) => s + valorItem(i), 0)
  const techo = platos.length > 0 ? Math.max(TECHO_MIN, comida * TECHO_X) : Infinity

  const infoVino = useMemo(() => new Map((data?.vinos ?? []).map(v => [v.id, v])), [data])
  const coloresConVino = new Set(data?.vinos.map(v => v.color))

  const tocarGusto = (id: GustoId) => {
    setVerMas(null)
    setGustos(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id); return n }
      const contra = GUSTOS.find(g => g.id === id)?.contra
      if (contra) n.delete(contra)
      n.add(id)
      return n
    })
  }

  const listo = !!color && (platos.length > 0 || gustos.size > 0)

  const { dentro, caros, encajan } = useMemo(() => {
    const vacio = { dentro: [] as Sugerencia[], caros: [] as Sugerencia[], encajan: true }
    if (!data || !listo) return vacio
    const pareja = new Map(data.parejas.map(p => [`${p.platoId}-${p.vinoId}`, p]))
    const pedidos = GUSTOS.filter(g => gustos.has(g.id))
    const vinos = menu.filter(m => {
      const v = infoVino.get(m.id)
      return v && !agotadoIds.has(m.id) && (color === 'todos' || v.color === color)
    })

    const puntuados = vinos.map(vino => {
      const perfil = infoVino.get(vino.id)?.perfil ?? null
      const deEste = platos.map(p => ({ plato: p, par: pareja.get(`${p.id}-${vino.id}`) }))
      const notas: number[] = []
      if (deEste.length) notas.push(deEste.reduce((s, d) => s + (d.par?.puntos ?? NEUTRO), 0) / deEste.length)
      if (pedidos.length) notas.push(perfil ? pedidos.reduce((s, g) => s + notaRasgo(perfil[g.rasgo], g.objetivo), 0) / pedidos.length : NEUTRO)
      // El motivo que se cuenta: el del plato con el que mejor va, si Claude lo escribió
      const conMotivo = deEste.filter(d => d.par?.motivo).sort((a, b) => b.par!.puntos - a.par!.puntos)[0]
      return {
        vino, perfil,
        nota: notas.reduce((a, b) => a + b, 0) / notas.length,
        razon: conMotivo?.par ?? null,
        platoRazon: conMotivo?.plato.nombre ?? '',
        vaCon: deEste.filter(d => (d.par?.puntos ?? 0) >= 8).map(d => d.plato.nombre),
      }
    }).sort((a, b) => b.nota - a.nota)

    const buenos = puntuados.filter(p => p.nota >= PEGA)
    const base = buenos.length > 0 ? buenos : puntuados.slice(0, A_LA_VISTA)
    let bajoTecho = base.filter(p => p.vino.precio <= techo)
    if (bajoTecho.length === 0) bajoTecho = base // si todo lo que encaja pasa del techo, se ignora el techo
    return {
      encajan: buenos.length > 0,
      dentro: ordenar(bajoTecho),
      caros: base.filter(p => !bajoTecho.includes(p)).sort((a, b) => b.vino.precio - a.vino.precio).map(p => ({ ...p, etiqueta: null })),
    }
  }, [data, listo, color, gustos, platos, menu, infoVino, agotadoIds, techo])

  const visibles = verMas === 'baratos' ? dentro : dentro.slice(0, A_LA_VISTA)
  const sinCalcular = data && data.parejas.length === 0 && data.vinos.every(v => !v.perfil)

  const Tarjeta = ({ s }: { s: Sugerencia }) => {
    const notasFicha = s.vino.ficha?.split('\n').slice(1).join(' ').trim()
    const enIngles = s.razon?.motivoEn || s.vino.ficha?.replace(/\n/g, '. ')
    const destacados = rasgosDestacados(s.perfil)
    return (
      <div className="rounded-xl bg-[var(--sala-srf)] p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-wide ${s.etiqueta === 'primero' ? 'text-amber-300' : 'text-[#4CC8A0]'}`}>{s.etiqueta ? ETIQUETA[s.etiqueta] : ''}</span>
          <span className="text-[var(--sala-tx3)] text-[11px] font-bold tabular-nums">{s.nota.toFixed(1).replace('.', ',')}/10</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <h3 className="text-[var(--sala-txt)] font-black text-lg uppercase leading-tight">{s.vino.nombre}</h3>
          <span className="text-[var(--sala-txt)] text-base font-bold tabular-nums shrink-0">{s.vino.precio.toFixed(2)} €</span>
        </div>
        {s.vino.descripcion && <p className="text-[var(--sala-tx3)] text-xs mt-0.5">{s.vino.descripcion}</p>}
        {destacados.length > 0 && <p className="text-[var(--sala-tx3)] text-[11px] uppercase tracking-wide mt-1">{destacados.join(' · ')}</p>}
        {s.razon ? (
          <p className="text-[var(--sala-tx2)] text-sm mt-2">
            {platos.length > 1 && <span className="font-bold">{s.platoRazon}: </span>}{s.razon.motivo}
          </p>
        ) : notasFicha ? (
          <p className="text-[var(--sala-tx2)] text-sm mt-2">{notasFicha}</p>
        ) : null}
        {platos.length > 1 && s.vaCon.length > 0 && (
          <p className="text-[#4CC8A0] text-xs mt-1">Va muy bien con {s.vaCon.join(', ')}</p>
        )}
        <div className="flex gap-2 mt-3">
          {enIngles && (
            <button onClick={() => speak(`${s.vino.nombre.toLowerCase()}. ${enIngles}`, 'en')}
              className="px-3 py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold active:scale-95 transition-transform">
              🔊 English
            </button>
          )}
          <button onClick={() => { onAdd(s.vino); onClose() }}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-black uppercase active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }}>
            + Añadir a la mesa
          </button>
        </div>
      </div>
    )
  }

  const chip = (activo: boolean) =>
    `rounded-xl font-black uppercase tracking-wide active:scale-95 transition-all ${activo ? 'text-white shadow-lg' : 'bg-[var(--sala-srf)] text-[var(--sala-tx2)]'}`
  const fondoActivo = { background: 'linear-gradient(135deg, #4B9EDF, #4CC8A0)' }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[var(--sala-hdr)] border-t sm:border border-[var(--sala-brd2)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider mb-1">🍷 ¿Qué vino?</p>
        <p className="text-[var(--sala-tx2)] text-xs mb-3">
          {platos.length > 0
            ? <>Con {platos.map(p => p.nombre).join(', ')} · comida {comida.toFixed(0)} € → vino hasta {techo.toFixed(0)} €</>
            : 'Sin comida todavía: elige lo que pide el cliente'}
        </p>

        {isLoading && <p className="text-center text-[var(--sala-tx4)] text-sm py-8">Cargando…</p>}
        {isError && <p className="text-center text-red-400 text-sm py-8">No se pudieron cargar los vinos.</p>}
        {sinCalcular && (
          <p className="text-center text-[var(--sala-tx4)] text-sm py-8">
            Todavía no hay recomendaciones de vino.<br />Se preparan desde el panel, en Carta → Maridajes.
          </p>
        )}

        {data && !sinCalcular && (
          <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
            <div className="flex flex-wrap gap-2">
              {COLORES.filter(c => c.id === 'todos' || coloresConVino.has(c.id)).map(c => (
                <button key={c.id} onClick={() => { setColor(c.id); setVerMas(null) }}
                  className={`${chip(color === c.id)} px-4 py-2.5 text-sm`} style={color === c.id ? fondoActivo : undefined}>
                  {c.label}
                </button>
              ))}
            </div>

            <div>
              <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                {platos.length > 0 ? '¿Piden algo en concreto? (opcional)' : '¿Qué les gusta?'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {GUSTOS.map(g => (
                  <button key={g.id} onClick={() => tocarGusto(g.id)}
                    className={`${chip(gustos.has(g.id))} px-3 py-2 text-xs leading-tight text-left`} style={gustos.has(g.id) ? fondoActivo : undefined}>
                    {g.es}<span className="block text-[10px] font-semibold normal-case opacity-70">{g.en}</span>
                  </button>
                ))}
              </div>
            </div>

            {!color && <p className="text-center text-[var(--sala-tx4)] text-sm py-4">¿Qué color quieren?</p>}
            {color && !listo && <p className="text-center text-[var(--sala-tx4)] text-sm py-4">Toca lo que pide el cliente.</p>}
            {listo && dentro.length === 0 && <p className="text-center text-[var(--sala-tx4)] text-sm py-4">No hay vinos de este color en la carta.</p>}
            {listo && !encajan && dentro.length > 0 && (
              <p className="text-amber-400 text-xs px-1">
                {platos.length > 2 ? 'Con tanta variedad ningún vino de este color va con todo:' : 'Ninguno encaja del todo con lo pedido:'} estos son los que más se acercan.
              </p>
            )}

            {listo && visibles.map(s => <Tarjeta key={s.vino.id} s={s} />)}
            {listo && verMas !== 'baratos' && dentro.length > A_LA_VISTA && (
              <button onClick={() => setVerMas('baratos')}
                className="w-full py-2.5 rounded-xl border border-dashed border-[var(--sala-brd2)] text-[var(--sala-tx2)] text-sm font-semibold">
                Ver más baratos ({dentro.length - A_LA_VISTA})
              </button>
            )}
            {listo && caros.length > 0 && (verMas === 'caros' ? (
              <>
                <p className="text-[var(--sala-tx3)] text-[11px] font-semibold uppercase tracking-wider pt-2">Pasan de {techo.toFixed(0)} € · por si quieren darse un gusto</p>
                {caros.map(s => <Tarjeta key={s.vino.id} s={s} />)}
              </>
            ) : (
              <button onClick={() => setVerMas('caros')}
                className="w-full py-2.5 rounded-xl border border-dashed border-amber-700/50 text-amber-300 text-sm font-semibold">
                💎 Ver más caros ({caros.length})
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} className="mt-3 w-full py-2.5 rounded-xl bg-[var(--sala-btn2)] text-[var(--sala-tx2)] text-sm font-semibold">
          Cerrar
        </button>
      </div>
    </div>
  )
}
