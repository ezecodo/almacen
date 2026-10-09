import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Alergeno, MenuItem } from '../api'
import { useAlergenos } from '../components/Alergenos'

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400'

// ── Fila del catálogo: se guarda sola al salir de cada campo ───────────────────
function AlergenoRow({ alergeno, onError }: { alergeno: Alergeno; onError: (msg: string) => void }) {
  const qc = useQueryClient()
  const [icono, setIcono]       = useState(alergeno.icono)
  const [nombre, setNombre]     = useState(alergeno.nombre)
  const [nombreEn, setNombreEn] = useState(alergeno.nombreEn)
  const usos = alergeno._count?.items ?? 0

  const refrescar = () => qc.invalidateQueries({ queryKey: ['alergenos'] })
  const guardar = useMutation({
    mutationFn: (body: Partial<{ nombre: string; nombreEn: string; icono: string }>) => api.alergenos.update(alergeno.id, body),
    onSuccess: refrescar,
    onError: (e: Error) => { onError(e.message); setNombre(alergeno.nombre) },
  })
  const eliminar = useMutation({
    mutationFn: () => api.alergenos.delete(alergeno.id),
    onSuccess: () => { refrescar(); qc.invalidateQueries({ queryKey: ['menu'] }) },
  })

  const confirmarEliminar = () => {
    const aviso = usos > 0 ? `\n\nEstá marcado en ${usos} ${usos === 1 ? 'plato' : 'platos'}: se les quitará.` : ''
    if (confirm(`¿Eliminar el alérgeno "${alergeno.nombre}"?${aviso}`)) eliminar.mutate()
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={icono}
        onChange={e => setIcono(e.target.value)}
        onBlur={() => icono !== alergeno.icono && guardar.mutate({ icono })}
        className="w-14 shrink-0 border border-gray-200 rounded-xl px-2 py-2 text-center text-lg focus:outline-none focus:border-cyan-400"
      />
      <input
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onBlur={() => nombre.trim() && nombre !== alergeno.nombre ? guardar.mutate({ nombre }) : setNombre(alergeno.nombre)}
        className={inputCls}
      />
      <input
        value={nombreEn}
        onChange={e => setNombreEn(e.target.value)}
        onBlur={() => nombreEn !== alergeno.nombreEn && guardar.mutate({ nombreEn })}
        placeholder="En inglés"
        className={inputCls}
      />
      <span className="hidden sm:block w-24 shrink-0 text-xs text-gray-400 text-right">
        {usos} {usos === 1 ? 'plato' : 'platos'}
      </span>
      <button
        onClick={confirmarEliminar}
        disabled={eliminar.isPending}
        className="shrink-0 text-xs text-red-500 hover:text-red-700 px-2 py-2"
      >
        Eliminar
      </button>
    </div>
  )
}

// ── Catálogo: añadir / renombrar / quitar alérgenos ────────────────────────────
function Catalogo({ alergenos }: { alergenos: Alergeno[] }) {
  const qc = useQueryClient()
  const [icono, setIcono]       = useState('')
  const [nombre, setNombre]     = useState('')
  const [nombreEn, setNombreEn] = useState('')
  const [error, setError]       = useState('')

  const crear = useMutation({
    mutationFn: () => api.alergenos.create({ nombre: nombre.trim(), nombreEn: nombreEn.trim(), icono: icono.trim() }),
    onSuccess: () => {
      setIcono(''); setNombre(''); setNombreEn(''); setError('')
      qc.invalidateQueries({ queryKey: ['alergenos'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="font-bold text-gray-800">Catálogo de alérgenos</h2>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        Común a todos los restaurantes. Los cambios se guardan al salir de cada campo.
      </p>
      <div className="space-y-2">
        {alergenos.map(a => <AlergenoRow key={a.id} alergeno={a} onError={setError} />)}
      </div>

      <form
        className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100"
        onSubmit={e => { e.preventDefault(); if (nombre.trim()) crear.mutate() }}
      >
        <input
          value={icono}
          onChange={e => setIcono(e.target.value)}
          placeholder="🥥"
          className="w-14 shrink-0 border border-gray-200 rounded-xl px-2 py-2 text-center text-lg focus:outline-none focus:border-cyan-400"
        />
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nuevo alérgeno (ej: Coco)" className={inputCls} />
        <input value={nombreEn} onChange={e => setNombreEn(e.target.value)} placeholder="En inglés" className={inputCls} />
        <button
          type="submit"
          disabled={!nombre.trim() || crear.isPending}
          className="shrink-0 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          + Añadir
        </button>
      </form>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function AlergenosPage() {
  const qc = useQueryClient()
  const alergenos = useAlergenos()
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const [ridSel, setRidSel] = useState<number | null>(null)
  const rid = ridSel ?? restaurantes[0]?.id ?? null

  const { data: menu = [] } = useQuery({
    queryKey: ['menu', rid],
    queryFn: () => api.menu.list(rid),
    enabled: rid !== null,
  })
  const { data: cats = [] } = useQuery({
    queryKey: ['menu-cats', rid],
    queryFn: () => api.menuCategorias.list(rid),
    enabled: rid !== null,
  })

  const grupos = [...new Set(cats.map(c => c.grupo).filter(Boolean))]
  const [grupoSel, setGrupoSel] = useState<string | null>(null)
  const grupo = grupoSel ?? grupos.find(g => /comida/i.test(g)) ?? grupos[0] ?? null

  // Categorías de la sección elegida, con las subcategorías a continuación de su padre
  const tops = cats.filter(c => c.grupo === grupo && c.parentId === null).sort((a, b) => a.orden - b.orden)
  const catsOrdenadas = tops.flatMap(t => [t, ...cats.filter(c => c.parentId === t.id).sort((a, b) => a.orden - b.orden)])
  const bloques = catsOrdenadas
    .map(c => ({
      cat: c,
      items: menu.filter(m => m.activo && m.categoria === c.nombre).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
    }))
    .filter(b => b.items.length > 0)

  const guardar = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { alergenoIds?: number[]; alergenosNota?: string } }) => api.menu.update(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: ['menu', rid] })
      qc.setQueryData<MenuItem[]>(['menu', rid], prev => prev?.map(i => (i.id === id ? { ...i, ...body } : i)))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['menu'] })
      qc.invalidateQueries({ queryKey: ['alergenos'] })
    },
  })

  const toggle = (item: MenuItem, alergenoId: number) => {
    const actuales = item.alergenoIds ?? []
    const alergenoIds = actuales.includes(alergenoId) ? actuales.filter(i => i !== alergenoId) : [...actuales, alergenoId]
    guardar.mutate({ id: item.id, body: { alergenoIds } })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-800">Alérgenos</h1>
        <p className="text-sm text-gray-400">Marca qué lleva cada plato. El personal lo consulta en la Wiki de la app de sala.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => setRidSel(r.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
              rid === r.id ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-gray-800 mr-2">Platos</h2>
          {grupos.map(g => (
            <button
              key={g}
              onClick={() => setGrupoSel(g)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                grupo === g ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">🌐 = plato global: el cambio vale para todos los restaurantes</span>
        </div>

        {alergenos.length === 0 && <p className="px-5 pb-5 text-sm text-gray-400">Añade primero algún alérgeno al catálogo de abajo.</p>}
        {alergenos.length > 0 && bloques.length === 0 && <p className="px-5 pb-5 text-sm text-gray-400">No hay platos en esta sección.</p>}

        {alergenos.length > 0 && bloques.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left px-5 py-2 min-w-[180px]" />
                  {alergenos.map(a => (
                    <th key={a.id} className="px-1 py-2 align-bottom font-medium">
                      <div className="w-12 mx-auto text-center">
                        <div className="text-lg leading-none">{a.icono}</div>
                        <div className="text-[10px] text-gray-500 leading-tight mt-1 break-words">{a.nombre}</div>
                      </div>
                    </th>
                  ))}
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 min-w-[260px]">Nota (opcional)</th>
                </tr>
              </thead>
              <tbody>
                {bloques.map(({ cat, items }) => [
                  <tr key={`c-${cat.id}`}>
                    <td colSpan={alergenos.length + 2} className="sticky left-0 bg-gray-50 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 border-y border-gray-100">
                      {cat.nombre}
                    </td>
                  </tr>,
                  ...items.map(item => (
                    <tr key={item.id} className="hover:bg-cyan-50/40">
                      <td className="sticky left-0 z-10 bg-white px-5 py-1.5 border-b border-gray-50 whitespace-nowrap font-medium text-gray-800">
                        {item.nombre}
                        {item.restaurantId === null && <span className="ml-1.5 text-xs" title="Global: vale para todos los restaurantes">🌐</span>}
                      </td>
                      {alergenos.map(a => {
                        const on = (item.alergenoIds ?? []).includes(a.id)
                        return (
                          <td key={a.id} className="px-1 py-1.5 border-b border-gray-50 text-center">
                            <button
                              onClick={() => toggle(item, a.id)}
                              title={`${item.nombre} — ${a.nombre}`}
                              className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                                on ? 'bg-amber-400 text-white' : 'bg-gray-50 border border-gray-200 text-transparent hover:border-amber-300'
                              }`}
                            >
                              ✓
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 border-b border-gray-50">
                        <input
                          key={`${item.id}-${item.alergenosNota}`}
                          defaultValue={item.alergenosNota}
                          onBlur={e => e.target.value !== item.alergenosNota && guardar.mutate({ id: item.id, body: { alergenosNota: e.target.value } })}
                          placeholder="trazas, 'en la salsa'…"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-cyan-400"
                        />
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Catalogo alergenos={alergenos} />
    </div>
  )
}
