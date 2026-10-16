import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ColorVino, ParejaMaridajeAdmin, MaridajesAdmin, RasgoVino } from '../api'

// Maridajes: Claude puntúa cada vino con cada plato a partir de las fichas (botón "Recalcular") y
// aquí se revisa y corrige. Lo que se toca a mano queda fijado: el siguiente recálculo no lo cambia.
// La sala usa esto en el botón 🍷 del pedido de una mesa.

const COLORES: { id: ColorVino | null; label: string; cls: string }[] = [
  { id: 'blanco', label: 'Blancos', cls: 'bg-amber-50 text-amber-700' },
  { id: 'tinto', label: 'Tintos', cls: 'bg-rose-50 text-rose-700' },
  { id: 'rosado', label: 'Rosados', cls: 'bg-pink-50 text-pink-700' },
  { id: 'espumoso', label: 'Cavas y espumosos', cls: 'bg-sky-50 text-sky-700' },
  { id: null, label: 'Color por decidir (lo dice la IA al recalcular)', cls: 'bg-gray-100 text-gray-600' },
]

const fmtFecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function colorPuntos(p: number) {
  if (p >= 8) return 'bg-emerald-500 text-white'
  if (p >= 6) return 'bg-emerald-100 text-emerald-800'
  if (p >= 4) return 'bg-gray-100 text-gray-600'
  return 'bg-red-50 text-red-500'
}

function FilaPareja({ pareja, nombre, precio }: { pareja: ParejaMaridajeAdmin; nombre: string; precio: number }) {
  const qc = useQueryClient()
  const editar = useMutation({
    mutationFn: (body: Parameters<typeof api.maridajes.editar>[1]) => api.maridajes.editar(pareja.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maridajes-admin'] }),
  })
  const puntos = (p: number) => editar.mutate({ puntos: Math.max(0, Math.min(10, p)) })

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0 ${pareja.oculto ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => puntos(pareja.puntos - 1)} className="w-6 h-6 rounded-lg text-gray-400 hover:bg-gray-100">−</button>
        <span className={`w-8 text-center text-sm font-bold rounded-lg py-0.5 tabular-nums ${colorPuntos(pareja.puntos)}`}>{pareja.puntos}</span>
        <button onClick={() => puntos(pareja.puntos + 1)} className="w-6 h-6 rounded-lg text-gray-400 hover:bg-gray-100">+</button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-semibold text-gray-800 text-sm ${pareja.oculto ? 'line-through' : ''}`}>{nombre}</span>
          <span className="text-xs text-gray-400 tabular-nums">{precio.toFixed(2)} €</span>
          {pareja.editado && <span className="text-[10px] font-bold uppercase text-cyan-600 bg-cyan-50 rounded px-1.5 py-0.5">✋ A mano</span>}
        </div>
        {pareja.motivo && <p className="text-xs text-gray-600 mt-0.5">{pareja.motivo}</p>}
        {pareja.motivoEn && <p className="text-xs text-gray-400 italic">{pareja.motivoEn}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        {pareja.editado && (
          <button onClick={() => editar.mutate({ editado: false })} title="Que lo vuelva a decidir la IA en el próximo recálculo"
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1">↺ IA</button>
        )}
        <button onClick={() => editar.mutate({ oculto: !pareja.oculto })}
          className="text-xs text-gray-400 hover:text-red-600 px-2 py-1">{pareja.oculto ? 'Mostrar' : 'Este no'}</button>
      </div>
    </div>
  )
}

// ── Perfil de los vinos: para cuando el cliente pide por gusto antes de pedir comida ───────────
const RASGOS: { id: RasgoVino; label: string; uno: string; cinco: string }[] = [
  { id: 'cuerpo', label: 'Cuerpo', uno: 'ligero', cinco: 'con cuerpo' },
  { id: 'dulzor', label: 'Dulzor', uno: 'seco', cinco: 'dulce' },
  { id: 'fruta', label: 'Fruta', uno: 'poca', cinco: 'mucha' },
  { id: 'madera', label: 'Madera', uno: 'sin', cinco: 'mucha' },
  { id: 'frescor', label: 'Frescor', uno: 'suave', cinco: 'muy fresco' },
  { id: 'aromatico', label: 'Aromático', uno: 'neutro', cinco: 'muy' },
]

function PerfilesVinos({ data }: { data: MaridajesAdmin }) {
  const qc = useQueryClient()
  const editar = useMutation({
    mutationFn: ({ vinoId, body }: { vinoId: number; body: Parameters<typeof api.maridajes.editarPerfil>[1] }) => api.maridajes.editarPerfil(vinoId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maridajes-admin'] }),
  })
  const perfilDe = new Map(data.perfiles.map(p => [p.vinoId, p]))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs text-gray-400 mb-4">
        Del 1 al 5. Lo usa la sala cuando el cliente pide por gusto ("con cuerpo", "seco"…). Toca un punto para corregirlo.
      </p>
      {/* Scroll propio con la cabecera fija: al bajar se sigue viendo a qué rasgo es cada columna de puntos */}
      <div className="max-h-[70vh] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#f3f4f6]">
          <tr className="text-[10px] uppercase tracking-wider text-gray-500">
            <th className="text-left font-semibold py-2 bg-white">Vino</th>
            {RASGOS.map(r => (
              <th key={r.id} className="font-semibold py-2 px-2 whitespace-nowrap bg-white" title={`1 = ${r.uno} · 5 = ${r.cinco}`}>
                {r.label}<span className="block normal-case tracking-normal font-normal">{r.uno} → {r.cinco}</span>
              </th>
            ))}
            <th className="bg-white" />
          </tr>
        </thead>
        {COLORES.map(c => {
          const vinos = data.vinos.filter(v => v.color === c.id).sort((a, b) => a.precio - b.precio)
          if (vinos.length === 0) return null
          return (
            <tbody key={c.label}>
              <tr><td colSpan={RASGOS.length + 2} className="pt-4 pb-1">
                <span className={`inline-block text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-0.5 ${c.cls}`}>{c.label}</span>
              </td></tr>
              {vinos.map(v => {
                const p = perfilDe.get(v.id)
                return (
                  <tr key={v.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-gray-800">{v.nombre}</span>
                      <span className="text-xs text-gray-400 ml-2 tabular-nums">{v.precio.toFixed(2)} €</span>
                      {p?.editado && <span className="ml-2 text-[10px] font-bold uppercase text-cyan-600 bg-cyan-50 rounded px-1.5 py-0.5">✋ A mano</span>}
                    </td>
                    {RASGOS.map(r => (
                      <td key={r.id} className="px-2">
                        {p ? (
                          <div className="flex gap-0.5 justify-center">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} onClick={() => editar.mutate({ vinoId: v.id, body: { [r.id]: n } })} title={String(n)}
                                className={`w-3.5 h-3.5 rounded-full ${n <= p[r.id] ? 'bg-rose-400' : 'bg-gray-100 hover:bg-gray-200'}`} />
                            ))}
                          </div>
                        ) : <span className="block text-center text-[10px] text-amber-500">—</span>}
                      </td>
                    ))}
                    <td className="text-right">
                      {p?.editado && (
                        <button onClick={() => editar.mutate({ vinoId: v.id, body: { editado: false } })} title="Que lo vuelva a decidir la IA en el próximo recálculo"
                          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1">↺ IA</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
      </div>
    </div>
  )
}

export default function MaridajesPage() {
  const qc = useQueryClient()
  const [platoId, setPlatoId] = useState<number | null>(null)
  const [vista, setVista] = useState<'platos' | 'perfiles'>('platos')
  const [error, setError] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['maridajes-admin'],
    queryFn: api.maridajes.admin,
    // Mientras Claude trabaja, se pregunta cómo va cada 2 s
    refetchInterval: q => (q.state.data?.estado.enCurso ? 2000 : false),
  })

  const recalcular = useMutation({
    mutationFn: (soloNuevos: boolean) => api.maridajes.recalcular(soloNuevos),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['maridajes-admin'] }) },
    onError: (e: Error) => setError(e.message),
  })

  const vinoPorId = useMemo(() => new Map((data?.vinos ?? []).map(v => [v.id, v])), [data])
  const parejasDe = useMemo(() => {
    const m = new Map<number, ParejaMaridajeAdmin[]>()
    for (const p of data?.parejas ?? []) m.set(p.platoId, [...(m.get(p.platoId) ?? []), p])
    return m
  }, [data])
  const porCategoria = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>['platos']>()
    for (const p of data?.platos ?? []) m.set(p.categoria, [...(m.get(p.categoria) ?? []), p])
    return [...m]
  }, [data])

  if (isLoading || !data) return <p className="text-gray-400 text-sm p-6">Cargando…</p>

  const { estado } = data
  const conParejas = data.platos.filter(p => parejasDe.has(p.id)).length
  const ultima = data.parejas.reduce<string | null>((max, p) => (!max || p.updatedAt > max ? p.updatedAt : max), null)
  const plato = data.platos.find(p => p.id === platoId) ?? null
  const parejasPlato = plato ? parejasDe.get(plato.id) ?? [] : []

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-800">🍷 Maridajes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Qué vino recomendar con cada plato, y cómo es cada vino para cuando el cliente pide por gusto. Lo usa el
          camarero en el botón 🍷 del pedido de una mesa. La IA lo calcula a partir de las fichas de la carta; aquí lo
          corriges, y lo que tocas a mano se queda.
        </p>
      </div>

      {/* Recalcular */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="text-sm text-gray-600">
            <b>{data.vinos.length}</b> vinos · <b>{conParejas}</b> de {data.platos.length} platos calculados
            {ultima && <span className="text-gray-400"> · último cambio {fmtFecha(ultima)}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => recalcular.mutate(true)} disabled={!data.hayClave || estado.enCurso || recalcular.isPending}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Solo platos nuevos
            </button>
            <button onClick={() => recalcular.mutate(false)} disabled={!data.hayClave || estado.enCurso || recalcular.isPending}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white disabled:opacity-40">
              ✨ Recalcular todo con IA
            </button>
          </div>
        </div>
        {data.vinos.length === 0 && (
          <p className="text-xs text-amber-600 mt-3">
            No hay vinos para el asistente. Conéctalo en <Link to="/admin/menu" className="underline font-semibold">Menú</Link>: abre
            la categoría de los vinos (por ejemplo "Vinos botella") → <b>Asistente → 🍷 Vinos</b>. Entra todo lo que cuelga de ella.
          </p>
        )}
        {data.vinos.some(v => v.sinFicha) && (
          <p className="text-xs text-amber-600 mt-3" title={data.vinos.filter(v => v.sinFicha).map(v => v.nombre).join(', ')}>
            {data.vinos.filter(v => v.sinFicha).length} vinos sin ficha: la IA solo tiene su nombre y descripción, así que sus
            sugerencias serán más pobres. La ficha (uvas, crianza, notas) se escribe en Menú, en cada vino.
          </p>
        )}
        {!data.hayClave && (
          <p className="text-xs text-amber-600 mt-3">Falta la clave de Anthropic (<code>ANTHROPIC_API_KEY</code>) en el servidor: sin ella no se puede calcular.</p>
        )}
        {estado.enCurso && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>La IA está probando cada vino con cada plato…</span>
              <span className="tabular-nums">{estado.hechos} / {estado.total}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-cyan-500 transition-all" style={{ width: `${estado.total ? (estado.hechos / estado.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        {!estado.enCurso && estado.termino && (
          <p className="text-xs text-gray-400 mt-3">
            Último recálculo: {fmtFecha(estado.termino)}, {estado.total - estado.errores.length} de {estado.total} platos bien.
          </p>
        )}
        {estado.errores.length > 0 && (
          <ul className="text-xs text-red-500 mt-2 space-y-0.5">{estado.errores.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      <div className="flex gap-2">
        {([['platos', 'Por plato'], ['perfiles', 'Perfil de los vinos']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setVista(id)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl ${vista === id ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {vista === 'perfiles' && <PerfilesVinos data={data} />}

      {/* Revisar por plato */}
      {vista === 'platos' && <div className="grid md:grid-cols-[240px_1fr] gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 md:max-h-[70vh] overflow-y-auto">
          {porCategoria.map(([cat, platos]) => (
            <div key={cat} className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 mb-1">{cat}</p>
              {platos.map(p => (
                <button key={p.id} onClick={() => setPlatoId(p.id)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded-lg flex justify-between gap-2 ${platoId === p.id ? 'bg-cyan-50 text-cyan-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                  <span className="truncate">{p.nombre}</span>
                  {!parejasDe.has(p.id) && <span className="text-[10px] text-amber-500 shrink-0">sin calcular</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {!plato && <p className="text-sm text-gray-400 text-center py-10">Elige un plato para ver qué vinos le van.</p>}
          {plato && parejasPlato.length === 0 && <p className="text-sm text-gray-400 text-center py-10">{plato.nombre}: todavía sin calcular.</p>}
          {plato && parejasPlato.length > 0 && (
            <>
              <h2 className="font-black text-gray-800 text-lg mb-1">{plato.nombre}</h2>
              <p className="text-xs text-gray-400 mb-4">Puntos de 0 a 10. "Este no" lo quita de las recomendaciones con este plato.</p>
              {COLORES.map(c => {
                const filas = parejasPlato.filter(p => vinoPorId.get(p.vinoId)?.color === c.id).sort((a, b) => b.puntos - a.puntos)
                if (filas.length === 0) return null
                return (
                  <div key={c.label} className="mb-5">
                    <span className={`inline-block text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-0.5 mb-1 ${c.cls}`}>{c.label}</span>
                    {filas.map(p => {
                      const v = vinoPorId.get(p.vinoId)!
                      return <FilaPareja key={p.id} pareja={p} nombre={v.nombre} precio={v.precio} />
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>}
    </div>
  )
}
