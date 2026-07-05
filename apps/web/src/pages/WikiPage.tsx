import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, WikiCategoria, WikiArticulo } from '../api'
import { speak, VozSelector, LANGS, Lang } from '../lib/tts'

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400'

function GlobalBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
      🌐 Global
    </span>
  )
}

// ── Modal: crear / editar categoría ───────────────────────────────────────────
function CategoriaModal({
  categoria,
  onClose,
  onSaved,
}: {
  categoria: WikiCategoria | null // null = crear
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [icono, setIcono]   = useState(categoria?.icono ?? '')

  const guardar = useMutation({
    mutationFn: () =>
      categoria
        ? api.wiki.updateCategoria(categoria.id, { nombre, icono })
        : api.wiki.createCategoria({ nombre, icono }),
    onSuccess: () => { onSaved(); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{categoria ? 'Editar categoría' : 'Nueva categoría'}</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={icono}
              onChange={e => setIcono(e.target.value)}
              placeholder="📖"
              className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-center text-xl focus:outline-none focus:border-cyan-400"
            />
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Nombre (ej: Bienvenida)"
              className={inputCls}
              autoFocus
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancelar</button>
          <button
            onClick={() => guardar.mutate()}
            disabled={!nombre.trim() || guardar.isPending}
            className="text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 px-4 py-2 rounded-xl"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: crear / editar artículo ────────────────────────────────────────────
function ArticuloModal({
  articulo,
  categorias,
  categoriaIdInicial,
  restaurantId, // scope al crear (null = Global)
  onClose,
  onSaved,
}: {
  articulo: WikiArticulo | null // null = crear
  categorias: WikiCategoria[]
  categoriaIdInicial: number
  restaurantId: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [categoriaId, setCategoriaId] = useState(articulo?.categoriaId ?? categoriaIdInicial)
  const [titulo, setTitulo] = useState(articulo?.titulo ?? '')
  const [guiones, setGuiones] = useState<Record<Lang, string>>({
    en: articulo?.guiones?.en ?? '',
    fr: articulo?.guiones?.fr ?? '',
    de: articulo?.guiones?.de ?? '',
  })
  const [notas, setNotas]   = useState(articulo?.notas ?? '')

  const setGuion = (lang: Lang, texto: string) => setGuiones(prev => ({ ...prev, [lang]: texto }))
  // Solo enviar idiomas con texto (los vacíos no cuentan como escuchables)
  const guionesLimpios = (): { en?: string; fr?: string; de?: string } =>
    Object.fromEntries(LANGS.map(l => [l.code, guiones[l.code].trim()]).filter(([, v]) => v))

  const guardar = useMutation({
    mutationFn: () =>
      articulo
        ? api.wiki.updateArticulo(articulo.id, { categoriaId, titulo, guiones: guionesLimpios(), notas })
        : api.wiki.createArticulo({ categoriaId, restaurantId, titulo, guiones: guionesLimpios(), notas }),
    onSuccess: () => { onSaved(); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">{articulo ? 'Editar artículo' : 'Nuevo artículo'}</h3>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Categoría</label>
            <select value={categoriaId} onChange={e => setCategoriaId(Number(e.target.value))} className={inputCls}>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Speech de bienvenida" className={inputCls} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Guion por idioma — lo que se dice al cliente. Rellená solo los idiomas que quieras (los que tengan texto se podrán escuchar).
            </label>
            <div className="space-y-3">
              {LANGS.map(l => (
                <div key={l.code}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">{l.flag} {l.label}</span>
                    <button
                      onClick={() => speak(guiones[l.code], l.code)}
                      disabled={!guiones[l.code].trim()}
                      className="text-xs font-semibold text-cyan-600 hover:text-cyan-800 disabled:opacity-30 flex items-center gap-1"
                      title="Escuchar"
                    >
                      🔊 Escuchar
                    </button>
                  </div>
                  <textarea
                    value={guiones[l.code]}
                    onChange={e => setGuion(l.code, e.target.value)}
                    rows={l.code === 'en' ? 5 : 3}
                    placeholder={l.code === 'en' ? 'Hi, welcome! Is this your first time here? Let me explain our concept…' : `(opcional) Guion en ${l.label.toLowerCase()}`}
                    className={inputCls + ' resize-y font-medium'}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2.5">
              <VozSelector />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">📝 Notas para el camarero (español, opcional)</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              placeholder="Ej: cuando digan OK, preguntar si quieren empezar con agua para la mesa."
              className={inputCls + ' resize-y'}
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Cancelar</button>
          <button
            onClick={() => guardar.mutate()}
            disabled={!titulo.trim() || guardar.isPending}
            className="text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 px-4 py-2 rounded-xl"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function WikiPage() {
  const qc = useQueryClient()
  const [modoGlobal, setModoGlobal] = useState(true)
  const [restaurantSel, setRestaurantSel] = useState<number | null>(null)
  const [catModal, setCatModal] = useState<{ categoria: WikiCategoria | null } | null>(null)
  const [artModal, setArtModal] = useState<{ articulo: WikiArticulo | null; categoriaId: number } | null>(null)

  const rid = modoGlobal ? null : restaurantSel

  const { data: restaurantes = [] } = useQuery({
    queryKey: ['restaurantes'],
    queryFn: api.restaurantes.list,
  })

  const { data: categorias = [] } = useQuery<WikiCategoria[]>({
    queryKey: ['wiki-cats'],
    queryFn: api.wiki.listCategorias,
  })

  const { data: articulos = [] } = useQuery<WikiArticulo[]>({
    queryKey: ['wiki-arts', rid],
    queryFn: () => api.wiki.listArticulos(rid),
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['wiki-cats'] })
    qc.invalidateQueries({ queryKey: ['wiki-arts'] })
  }

  const eliminarCat = useMutation({
    mutationFn: (id: number) => api.wiki.deleteCategoria(id),
    onSuccess: invalidar,
  })
  const eliminarArt = useMutation({
    mutationFn: (id: number) => api.wiki.deleteArticulo(id),
    onSuccess: invalidar,
  })
  const toggleArt = useMutation({
    mutationFn: (id: number) => api.wiki.toggleArticulo(id),
    onSuccess: invalidar,
  })

  const catsOrdenadas = [...categorias].sort((a, b) => a.orden - b.orden)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-black text-gray-800">📖 Wiki</h1>
        <button
          onClick={() => setCatModal({ categoria: null })}
          className="text-sm font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-3 py-2 rounded-xl"
        >
          + Categoría
        </button>
      </div>
      <p className="text-sm text-gray-400 mb-4">Base de conocimiento: speeches, protocolos y conceptos del grupo.</p>

      {/* Selector de scope */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setModoGlobal(true)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            modoGlobal ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          🌐 Global
        </button>
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => { setModoGlobal(false); setRestaurantSel(r.id) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !modoGlobal && restaurantSel === r.id ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {!modoGlobal && restaurantSel === null && (
        <p className="text-sm text-gray-400 text-center py-10">Seleccioná un restaurante.</p>
      )}

      {/* Categorías + artículos */}
      {catsOrdenadas.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">
          No hay categorías todavía. Creá una para empezar (ej: “Bienvenida”).
        </p>
      )}

      <div className="space-y-6">
        {catsOrdenadas.map(cat => {
          const arts = articulos.filter(a => a.categoriaId === cat.id).sort((a, b) => a.orden - b.orden)
          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* Cabecera categoría */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.icono || '📄'}</span>
                  <span className="font-bold text-gray-800">{cat.nombre}</span>
                  <span className="text-xs text-gray-400">({arts.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setArtModal({ articulo: null, categoriaId: cat.id })} className="text-xs font-semibold text-cyan-600 hover:text-cyan-800">
                    + Artículo
                  </button>
                  <button onClick={() => setCatModal({ categoria: cat })} className="text-xs text-gray-400 hover:text-gray-600">Editar</button>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar la categoría "${cat.nombre}" y todos sus artículos?`)) eliminarCat.mutate(cat.id) }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Artículos */}
              {arts.length === 0 && (
                <p className="text-xs text-gray-300 px-4 py-4">Sin artículos en esta categoría.</p>
              )}
              <div className="divide-y divide-gray-50">
                {arts.map(art => {
                  const esGlobal = art.restaurantId === null
                  const soloLectura = rid !== null && esGlobal // en vista restaurante, los globales no se editan
                  const idiomas = LANGS.filter(l => (art.guiones?.[l.code] ?? '').trim())
                  const preview = idiomas[0] ? art.guiones[idiomas[0].code] : ''
                  return (
                    <div key={art.id} className={`px-4 py-3 ${!art.activo ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800 text-sm">{art.titulo}</span>
                            {idiomas.map(l => <span key={l.code} title={l.label} className="text-xs">{l.flag}</span>)}
                            {esGlobal && rid !== null && <GlobalBadge />}
                            {!art.activo && <span className="text-[10px] text-gray-400">(oculto)</span>}
                          </div>
                          {preview && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{preview}</p>}
                          {art.notas && <p className="text-xs text-amber-600 mt-1">📝 {art.notas}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {idiomas.map(l => (
                            <button key={l.code} onClick={() => speak(art.guiones[l.code] ?? '', l.code)} title={`Escuchar ${l.label}`} className="text-sm hover:opacity-70">
                              {l.flag}
                            </button>
                          ))}
                          {!soloLectura && (
                            <>
                              <button onClick={() => setArtModal({ articulo: art, categoriaId: art.categoriaId })} className="text-xs text-gray-400 hover:text-gray-600">Editar</button>
                              <button onClick={() => toggleArt.mutate(art.id)} className={`text-xs font-medium ${art.activo ? 'text-gray-400 hover:text-gray-600' : 'text-green-500 hover:text-green-700'}`}>
                                {art.activo ? 'Ocultar' : 'Activar'}
                              </button>
                              <button onClick={() => { if (confirm(`¿Eliminar "${art.titulo}"?`)) eliminarArt.mutate(art.id) }} className="text-xs text-red-400 hover:text-red-600">✕</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {catModal && (
        <CategoriaModal
          categoria={catModal.categoria}
          onClose={() => setCatModal(null)}
          onSaved={invalidar}
        />
      )}
      {artModal && (
        <ArticuloModal
          articulo={artModal.articulo}
          categorias={catsOrdenadas}
          categoriaIdInicial={artModal.categoriaId}
          restaurantId={rid}
          onClose={() => setArtModal(null)}
          onSaved={invalidar}
        />
      )}
    </div>
  )
}
