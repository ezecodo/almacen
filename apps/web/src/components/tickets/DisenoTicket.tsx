import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api, disenoTicketDe, type BloqueOrdenTicket, type DisenoTicket } from '../../api'

// Diseño de la cuenta (la que se entrega a la mesa) y de la factura simplificada (la que sale al
// cobrar, con el QR) de un local. A la derecha, la imagen que dibuja el servidor: la misma que
// recibe la Box, así que lo que se ve es exactamente lo que sale en papel.

const TIPOS_BLOQUE: { tipo: BloqueOrdenTicket['tipo']; label: string }[] = [
  { tipo: 'pax', label: 'Lo que se cobra por comensal (pan)' },
  { tipo: 'barra', label: 'Lo que sale por barra (bebidas)' },
  { tipo: 'cocina', label: 'Lo que sale por cocina (comida)' },
  { tipo: 'categorias', label: 'Categorías de la carta…' },
]

function Interruptor({ label, valor, onChange }: { label: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer select-none">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!valor)}
        className={`shrink-0 w-10 h-6 rounded-full relative transition-colors ${valor ? 'bg-cyan-600' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${valor ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">{titulo}</p>
      {children}
    </div>
  )
}

export default function DisenoTicketSection({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()
  const { data: config, isFetched } = useQuery({ queryKey: ['ticket-config', restaurantId], queryFn: () => api.tickets.getConfig(restaurantId) })
  const { data: empresa } = useQuery({ queryKey: ['empresa-config'], queryFn: api.tickets.getEmpresa })
  const { data: categorias = [] } = useQuery({ queryKey: ['menu-cats', restaurantId], queryFn: () => api.menuCategorias.list(restaurantId) })
  const { data: cerradas = [] } = useQuery({ queryKey: ['comandas-cerradas', restaurantId], queryFn: () => api.comandas.list(restaurantId, 'cerrada') })

  const [diseno, setDiseno] = useState<DisenoTicket>(disenoTicketDe(null))
  const [tipo, setTipo] = useState<'cuenta' | 'factura'>('cuenta')
  const [comandaId, setComandaId] = useState<number | null>(null)
  const [cambiado, setCambiado] = useState(false)

  useEffect(() => { setDiseno(disenoTicketDe(config?.diseno)); setCambiado(false) }, [config, restaurantId])
  useEffect(() => { setComandaId(null) }, [restaurantId])

  const cambiar = (f: (d: DisenoTicket) => DisenoTicket) => { setDiseno(d => f(d)); setCambiado(true) }

  // La vista previa se pide un momento después de dejar de tocar
  const [pedido, setPedido] = useState(diseno)
  useEffect(() => { const t = setTimeout(() => setPedido(diseno), 350); return () => clearTimeout(t) }, [diseno])
  const { data: imagen, isFetching, error } = useQuery({
    queryKey: ['ticket-vista-previa', restaurantId, tipo, comandaId, JSON.stringify(pedido), config?.logo?.length ?? 0],
    queryFn: () => api.tickets.vistaPrevia({ restaurantId, tipo, comandaId, diseno: pedido }),
    placeholderData: keepPreviousData,
  })
  const url = useMemo(() => (imagen ? URL.createObjectURL(imagen) : null), [imagen])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const guardar = useMutation({
    mutationFn: () => api.tickets.updateConfig({ restaurantId, nombreComercial: config!.nombreComercial, diseno }),
    onSuccess: () => { setCambiado(false); qc.invalidateQueries({ queryKey: ['ticket-config', restaurantId] }) },
  })

  const moverBloque = (i: number, d: -1 | 1) => cambiar(x => {
    const orden = [...x.orden]
    const j = i + d
    if (j < 0 || j >= orden.length) return x
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
    return { ...x, orden }
  })
  const editarBloque = (i: number, b: Partial<BloqueOrdenTicket>) =>
    cambiar(x => ({ ...x, orden: x.orden.map((o, k) => (k === i ? { ...o, ...b } : o)) }))

  const superiores = categorias.filter(c => c.parentId === null)
  const serieValida = !diseno.serie || /^[A-Z0-9]{1,10}$/.test(diseno.serie)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <h2 className="font-bold text-gray-800 mb-1">🧾 Cuenta y factura</h2>
      <p className="text-xs text-gray-400 mb-4">
        La <b>cuenta</b> sale al tocar «Imprimir cuenta» (no es factura). La <b>factura simplificada</b> nace al cobrar la mesa,
        con su número y el QR tributario. La vista previa es la imagen que imprime la Box.
      </p>

      {isFetched && !config && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-4">⚠️ Primero guarda los datos del local arriba, en «Local».</p>
      )}

      <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="min-w-0">
          <Grupo titulo="Arriba">
            <Interruptor label="Logo (si no hay, el nombre en grande)" valor={diseno.cabecera.logo} onChange={v => cambiar(d => ({ ...d, cabecera: { ...d.cabecera, logo: v } }))} />
            <Interruptor label="Dirección" valor={diseno.cabecera.direccion} onChange={v => cambiar(d => ({ ...d, cabecera: { ...d.cabecera, direccion: v } }))} />
            <Interruptor label="Teléfono" valor={diseno.cabecera.telefono} onChange={v => cambiar(d => ({ ...d, cabecera: { ...d.cabecera, telefono: v } }))} />
            <Interruptor label="Razón social" valor={diseno.cabecera.razonSocial} onChange={v => cambiar(d => ({ ...d, cabecera: { ...d.cabecera, razonSocial: v } }))} />
            <Interruptor label="NIF" valor={diseno.cabecera.nif} onChange={v => cambiar(d => ({ ...d, cabecera: { ...d.cabecera, nif: v } }))} />
          </Grupo>

          <Grupo titulo="La mesa">
            <Interruptor label="Camarero" valor={diseno.mesa.camarero} onChange={v => cambiar(d => ({ ...d, mesa: { ...d.mesa, camarero: v } }))} />
            <Interruptor label="Comensales (pax)" valor={diseno.mesa.pax} onChange={v => cambiar(d => ({ ...d, mesa: { ...d.mesa, pax: v } }))} />
          </Grupo>

          <Grupo titulo="Platos e importes">
            <Interruptor label="Precio unitario" valor={diseno.precioUnitario} onChange={v => cambiar(d => ({ ...d, precioUnitario: v }))} />
            <Interruptor label="Base imponible además del IVA" valor={diseno.desgloseIva} onChange={v => cambiar(d => ({ ...d, desgloseIva: v }))} />
          </Grupo>

          <Grupo titulo="Orden de los platos">
            <p className="text-[11px] text-gray-400 mb-2">
              De arriba abajo. Dentro de cada bloque, en el orden en que se pidieron. Un bloque de categorías gana a barra y cocina
              (así un bloque «Cafés» se lleva los cafés). Lo que no cae en ningún bloque va al final.
            </p>
            <div className="space-y-2">
              {diseno.orden.map((b, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center text-xs font-black text-gray-400">{i + 1}</span>
                    <input
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                      value={b.nombre}
                      maxLength={40}
                      placeholder="Nombre (solo para ti)"
                      onChange={e => editarBloque(i, { nombre: e.target.value })}
                    />
                    <button onClick={() => moverBloque(i, -1)} disabled={i === 0} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 disabled:opacity-30">▲</button>
                    <button onClick={() => moverBloque(i, 1)} disabled={i === diseno.orden.length - 1} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 disabled:opacity-30">▼</button>
                    <button onClick={() => cambiar(d => ({ ...d, orden: d.orden.filter((_, k) => k !== i) }))} className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500">✕</button>
                  </div>
                  <select
                    className="mt-2 w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                    value={b.tipo}
                    onChange={e => editarBloque(i, { tipo: e.target.value as BloqueOrdenTicket['tipo'] })}
                  >
                    {TIPOS_BLOQUE.map(t => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
                  </select>
                  {b.tipo === 'categorias' && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {superiores.map(c => {
                        const marcada = b.categorias.includes(c.nombre)
                        return (
                          <button
                            key={c.id}
                            onClick={() => editarBloque(i, { categorias: marcada ? b.categorias.filter(x => x !== c.nombre) : [...b.categorias, c.nombre] })}
                            className={`text-xs font-semibold px-2 py-1 rounded-lg ${marcada ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {c.icono} {c.nombre}
                          </button>
                        )
                      })}
                      {b.categorias.length === 0 && <p className="text-[11px] text-amber-600">Elige al menos una categoría (sus subcategorías van con ella).</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {diseno.orden.length < 12 && (
              <button
                onClick={() => cambiar(d => ({ ...d, orden: [...d.orden, { nombre: '', tipo: 'categorias', categorias: [] }] }))}
                className="mt-2 text-sm font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg"
              >
                + Añadir bloque
              </button>
            )}
          </Grupo>

          <Grupo titulo="Cuenta (al imprimir la cuenta)">
            <label className="block text-xs font-semibold text-gray-500 mb-1 mt-1">Texto bajo la mesa</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={diseno.cuenta.rotulo}
              maxLength={60}
              onChange={e => cambiar(d => ({ ...d, cuenta: { ...d.cuenta, rotulo: e.target.value } }))}
            />
            <Interruptor label="Rayas para escribir la propina" valor={diseno.cuenta.lineasPropina} onChange={v => cambiar(d => ({ ...d, cuenta: { ...d.cuenta, lineasPropina: v } }))} />
          </Grupo>

          <Grupo titulo="Factura simplificada (al cobrar)">
            <Interruptor label="Imprimirla al cobrar" valor={diseno.factura.imprimirAlCobrar} onChange={v => cambiar(d => ({ ...d, factura: { ...d.factura, imprimirAlCobrar: v } }))} />
            <Interruptor label="Rayas para escribir la propina" valor={diseno.factura.lineasPropina} onChange={v => cambiar(d => ({ ...d, factura: { ...d.factura, lineasPropina: v } }))} />
            <label className="block text-xs font-semibold text-gray-500 mb-1 mt-2">Serie de las facturas de este local</label>
            <input
              className={`w-32 border rounded-xl px-3 py-2 text-sm font-mono uppercase ${serieValida ? 'border-gray-200' : 'border-red-400'}`}
              value={diseno.serie ?? ''}
              placeholder={`L${restaurantId}`}
              maxLength={10}
              onChange={e => cambiar(d => ({ ...d, serie: e.target.value.toUpperCase() || undefined }))}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Letras y números, sin espacios. El número sigue solo y sin saltos. Mejor no cambiarla una vez emitidas facturas.
              {' '}Con efectivo, al cobrar se abre el cajón de esa impresora. Número, NIF y QR no se pueden quitar.
            </p>
            {!empresa?.nif && <p className="text-xs text-red-500 mt-1">⚠️ Sin NIF en «Empresa» no se emite ninguna factura.</p>}
            {(empresa?.verifactuModo ?? 'pruebas') !== 'produccion' && (
              <p className="text-xs text-amber-600 mt-1">Modo pruebas: el QR apunta al entorno de pruebas de la AEAT y no se le envía nada.</p>
            )}
          </Grupo>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => guardar.mutate()}
              disabled={!config || !cambiado || !serieValida || guardar.isPending}
              className="text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 px-4 py-2 rounded-xl"
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar diseño'}
            </button>
            {cambiado && <span className="text-xs text-amber-600">Hay cambios sin guardar</span>}
            {guardar.error && <span className="text-xs text-red-500">{(guardar.error as Error).message}</span>}
          </div>
        </div>

        <div className="md:sticky md:top-4 w-full md:w-[320px]">
          <div className="flex gap-1.5 mb-2">
            {(['cuenta', 'factura'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={`flex-1 text-sm font-semibold px-3 py-1.5 rounded-lg ${tipo === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {t === 'cuenta' ? 'Cuenta' : 'Factura'}
              </button>
            ))}
          </div>
          <select
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs mb-2"
            value={comandaId ?? ''}
            onChange={e => setComandaId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Mesa de ejemplo</option>
            {cerradas.slice(0, 30).map(c => (
              <option key={c.id} value={c.id}>
                Mesa {c.mesa?.numero ?? '-'} · {c.camareroNombre ?? '-'} · {new Date(c.closedAt ?? c.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </option>
            ))}
          </select>
          <div className="bg-gray-100 rounded-xl p-3 flex justify-center relative">
            {url
              ? <img src={url} alt="Vista previa del ticket" className={`w-full bg-white shadow transition-opacity ${isFetching ? 'opacity-60' : ''}`} style={{ imageRendering: 'pixelated' }} />
              : <p className="text-xs text-gray-400 py-16">{error ? (error as Error).message : 'Dibujando…'}</p>}
          </div>
          {tipo === 'factura' && <p className="text-[11px] text-gray-400 mt-1.5">Ejemplo con un número inventado: no se registra.</p>}
        </div>
      </div>
    </div>
  )
}
