import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, Comanda, Impresora, ImpresionRuta, TipoTicket } from '../api'
import TicketCobro from '../components/tickets/TicketCobro'
import TicketComanda from '../components/tickets/TicketComanda'

const TIPOS_TICKET: { tipo: TipoTicket; label: string }[] = [
  { tipo: 'cocina', label: '🍳 Cocina' },
  { tipo: 'barra',  label: '🍹 Barra' },
  { tipo: 'cobro',  label: '💶 Cobro' },
]

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1'

// ── Sección Empresa (singleton, sin selector de restaurante) ──────────────────
function EmpresaSection() {
  const qc = useQueryClient()
  const { data: empresa } = useQuery({ queryKey: ['empresa-config'], queryFn: api.tickets.getEmpresa })

  const [razonSocial, setRazonSocial] = useState('')
  const [nif, setNif] = useState('')
  const [tasaIva, setTasaIva] = useState(10)
  const [mensajePie, setMensajePie] = useState('')

  useEffect(() => {
    if (!empresa) return
    setRazonSocial(empresa.razonSocial)
    setNif(empresa.nif ?? '')
    setTasaIva(empresa.tasaIva)
    setMensajePie(empresa.mensajePie ?? '')
  }, [empresa])

  const guardar = useMutation({
    mutationFn: () => api.tickets.updateEmpresa({
      razonSocial, nif: nif || null, tasaIva, mensajePie: mensajePie || null,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa-config'] }),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <h2 className="font-bold text-gray-800 mb-1">🏢 Empresa</h2>
      <p className="text-xs text-gray-400 mb-4">Datos comunes a los 5 restaurantes.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Razón social</label>
          <input className={inputCls} value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Sensi Tapas Group SL" />
        </div>
        <div>
          <label className={labelCls}>NIF / CIF</label>
          <input className={inputCls} value={nif} onChange={e => setNif(e.target.value)} placeholder="B12345678" />
        </div>
        <div>
          <label className={labelCls}>IVA (%)</label>
          <input type="number" step="0.1" className={inputCls} value={tasaIva} onChange={e => setTasaIva(Number(e.target.value))} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Mensaje pie de ticket (por defecto)</label>
          <input className={inputCls} value={mensajePie} onChange={e => setMensajePie(e.target.value)} placeholder="Servicio no incluido. ¡Gracias por tu visita!" />
        </div>
      </div>
      <button
        onClick={() => guardar.mutate()}
        disabled={guardar.isPending}
        className="mt-4 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 px-4 py-2 rounded-xl"
      >
        Guardar
      </button>
    </div>
  )
}

// ── Sección Locales (por restaurante) ─────────────────────────────────────────
function LocalSection({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['ticket-config', restaurantId],
    queryFn: () => api.tickets.getConfig(restaurantId),
  })

  const [nombreComercial, setNombreComercial] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [mensajePieOverride, setMensajePieOverride] = useState('')

  useEffect(() => {
    setNombreComercial(config?.nombreComercial ?? '')
    setDireccion(config?.direccion ?? '')
    setTelefono(config?.telefono ?? '')
    setMensajePieOverride(config?.mensajePieOverride ?? '')
  }, [config, restaurantId])

  const guardar = useMutation({
    mutationFn: () => api.tickets.updateConfig({
      restaurantId,
      nombreComercial,
      direccion: direccion || null,
      telefono: telefono || null,
      mensajePieOverride: mensajePieOverride || null,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-config', restaurantId] }),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <h2 className="font-bold text-gray-800 mb-1">📍 Local</h2>
      <p className="text-xs text-gray-400 mb-4">Datos específicos de este restaurante.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Nombre comercial (aparece en el ticket)</label>
          <input className={inputCls} value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} placeholder="Sensi Tapas - Gòtic" />
        </div>
        <div>
          <label className={labelCls}>Dirección</label>
          <input className={inputCls} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Carrer de la Ciutat 4, Barcelona" />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input className={inputCls} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="93 123 45 67" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Mensaje pie propio (opcional — si no, usa el de Empresa)</label>
          <input className={inputCls} value={mensajePieOverride} onChange={e => setMensajePieOverride(e.target.value)} placeholder="Dejar vacío para heredar el de Empresa" />
        </div>
      </div>
      <button
        onClick={() => guardar.mutate()}
        disabled={!nombreComercial.trim() || guardar.isPending}
        className="mt-4 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 px-4 py-2 rounded-xl"
      >
        Guardar
      </button>
    </div>
  )
}

// ── Impresoras (por restaurante) ──────────────────────────────────────────────
function ImpresoraRow({ impresora, onChanged }: { impresora: Impresora; onChanged: () => void }) {
  const [nombre, setNombre] = useState(impresora.nombre)
  const [ip, setIp] = useState(impresora.ip)

  const actualizar = useMutation({
    mutationFn: (data: Partial<{ nombre: string; ip: string }>) => api.tickets.updateImpresora(impresora.id, data),
    onSuccess: onChanged,
  })
  const eliminar = useMutation({
    mutationFn: () => api.tickets.deleteImpresora(impresora.id),
    onSuccess: onChanged,
  })

  return (
    <div className="flex gap-2 items-center">
      <input
        className={inputCls}
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onBlur={() => nombre.trim() && nombre !== impresora.nombre && actualizar.mutate({ nombre })}
        placeholder="Cocina"
      />
      <input
        className={inputCls}
        value={ip}
        onChange={e => setIp(e.target.value)}
        onBlur={() => ip.trim() && ip !== impresora.ip && actualizar.mutate({ ip })}
        placeholder="192.168.1.50"
      />
      <button onClick={() => eliminar.mutate()} className="text-gray-400 hover:text-red-500 text-lg px-2">✕</button>
    </div>
  )
}

function ImpresorasSection({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()
  const { data: impresoras = [] } = useQuery({
    queryKey: ['impresoras', restaurantId],
    queryFn: () => api.tickets.listImpresoras(restaurantId),
  })

  const [nombre, setNombre] = useState('')
  const [ip, setIp] = useState('')

  const invalidar = () => qc.invalidateQueries({ queryKey: ['impresoras', restaurantId] })

  const crear = useMutation({
    mutationFn: () => api.tickets.createImpresora({ restaurantId, nombre, ip }),
    onSuccess: () => { invalidar(); setNombre(''); setIp('') },
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <h2 className="font-bold text-gray-800 mb-1">🖨️ Impresoras</h2>
      <p className="text-xs text-gray-400 mb-4">Las IP de las térmicas de este restaurante (sacala del test print de la impresora).</p>

      <div className="space-y-2 mb-3">
        {impresoras.map(imp => <ImpresoraRow key={imp.id} impresora={imp} onChanged={invalidar} />)}
      </div>

      <div className="flex gap-2 items-center">
        <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (ej: Cocina)" />
        <input className={inputCls} value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.50" />
        <button
          onClick={() => crear.mutate()}
          disabled={!nombre.trim() || !ip.trim() || crear.isPending}
          className="shrink-0 text-sm font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-40 px-3 py-2 rounded-xl"
        >
          + Añadir
        </button>
      </div>
    </div>
  )
}

// ── Rutas de impresión (por sala): a qué impresora sale cada tipo de ticket y cuántas copias ──
function RutaRow({ ruta, impresoras, onChanged }: { ruta: ImpresionRuta; impresoras: Impresora[]; onChanged: () => void }) {
  const actualizar = useMutation({
    mutationFn: (data: Partial<{ impresoraId: number; copias: number }>) => api.tickets.updateRuta(ruta.id, data),
    onSuccess: onChanged,
  })
  const eliminar = useMutation({
    mutationFn: () => api.tickets.deleteRuta(ruta.id),
    onSuccess: onChanged,
  })

  return (
    <div className="flex gap-2 items-center">
      <select
        className={inputCls}
        value={ruta.impresoraId}
        onChange={e => actualizar.mutate({ impresoraId: Number(e.target.value) })}
      >
        {impresoras.map(imp => <option key={imp.id} value={imp.id}>{imp.nombre} ({imp.ip})</option>)}
      </select>
      <input
        type="number"
        min={1}
        max={5}
        className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
        value={ruta.copias}
        onChange={e => actualizar.mutate({ copias: Number(e.target.value) })}
      />
      <span className="text-xs text-gray-400">copia{ruta.copias === 1 ? '' : 's'}</span>
      <button onClick={() => eliminar.mutate()} className="ml-auto text-gray-400 hover:text-red-500 text-lg px-2">✕</button>
    </div>
  )
}

function RutasSection({ restaurantId }: { restaurantId: number }) {
  const qc = useQueryClient()
  const { data: floorPlans = [] } = useQuery({
    queryKey: ['floorplans', restaurantId],
    queryFn: () => api.salon.list(restaurantId),
  })
  const { data: impresoras = [] } = useQuery({
    queryKey: ['impresoras', restaurantId],
    queryFn: () => api.tickets.listImpresoras(restaurantId),
  })

  const [floorSel, setFloorSel] = useState<number | null>(null)
  useEffect(() => {
    if (floorPlans.length > 0 && !floorPlans.some(f => f.id === floorSel)) setFloorSel(floorPlans[0].id)
  }, [floorPlans, floorSel])

  const { data: rutas = [] } = useQuery({
    queryKey: ['rutas', floorSel],
    queryFn: () => api.tickets.listRutas(floorSel as number),
    enabled: !!floorSel,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['rutas', floorSel] })

  const crear = useMutation({
    mutationFn: (tipoTicket: TipoTicket) => api.tickets.createRuta({ floorPlanId: floorSel as number, tipoTicket, impresoraId: impresoras[0].id, copias: 1 }),
    onSuccess: invalidar,
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <h2 className="font-bold text-gray-800 mb-1">🖨️ ¿A dónde sale cada ticket?</h2>
      <p className="text-xs text-gray-400 mb-4">Por sala: qué tickets salen por cuál impresora, y cuántas copias (ej: 2 copias de cocina — jefe de cocina + pase).</p>

      {impresoras.length === 0 && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-4">⚠️ Primero agregá al menos una impresora arriba.</p>
      )}

      {floorPlans.length === 0 ? (
        <p className="text-sm text-gray-400">Este restaurante todavía no tiene salas creadas en Salón.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {floorPlans.map(f => (
              <button
                key={f.id}
                onClick={() => setFloorSel(f.id)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${floorSel === f.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {f.nombre}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {TIPOS_TICKET.map(({ tipo, label }) => (
              <div key={tipo}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
                <div className="space-y-2">
                  {rutas.filter(r => r.tipoTicket === tipo).map(r => (
                    <RutaRow key={r.id} ruta={r} impresoras={impresoras} onChanged={invalidar} />
                  ))}
                </div>
                <button
                  onClick={() => crear.mutate(tipo)}
                  disabled={impresoras.length === 0 || crear.isPending}
                  className="mt-2 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-40 px-3 py-1.5 rounded-lg"
                >
                  + Destino
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sección Vista previa ───────────────────────────────────────────────────────
function PreviewSection({ restaurantId }: { restaurantId: number }) {
  const { data: empresa } = useQuery({ queryKey: ['empresa-config'], queryFn: api.tickets.getEmpresa })
  const { data: config } = useQuery({
    queryKey: ['ticket-config', restaurantId],
    queryFn: () => api.tickets.getConfig(restaurantId),
  })
  const { data: comandas = [] } = useQuery({
    queryKey: ['comandas-cerradas', restaurantId],
    queryFn: () => api.comandas.list(restaurantId, 'cerrada'),
  })

  const [comandaId, setComandaId] = useState<number | null>(null)
  const [tab, setTab] = useState<'cobro' | 'cocina' | 'barra'>('cobro')

  useEffect(() => { setComandaId(null) }, [restaurantId])

  const comanda: Comanda | undefined = comandas.find(c => c.id === comandaId)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="font-bold text-gray-800 mb-1">🖨️ Vista previa</h2>
      <p className="text-xs text-gray-400 mb-4">
        Elegí una comanda cerrada real para ver cómo saldría el ticket. Imprimí (Cmd+P) y guardá como PDF — el CSS ya está ajustado a 80mm.
      </p>

      {!config && (
        <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-4">
          ⚠️ Este restaurante todavía no tiene configurado el nombre comercial arriba en "Local".
        </p>
      )}

      <select
        className={inputCls + ' mb-4'}
        value={comandaId ?? ''}
        onChange={e => setComandaId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— Elegí una comanda cerrada —</option>
        {comandas.map(c => (
          <option key={c.id} value={c.id}>
            Mesa {c.mesa?.numero ?? '-'} · {c.camareroNombre ?? '-'} · {new Date(c.closedAt ?? c.createdAt).toLocaleString('es-ES')}
          </option>
        ))}
      </select>

      {comanda && config && empresa && (
        <>
          <div className="flex gap-2 mb-4">
            {(['cobro', 'cocina', 'barra'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${tab === t ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {t === 'cobro' ? 'Ticket cobro' : t === 'cocina' ? 'Comanda cocina' : 'Comanda barra'}
              </button>
            ))}
            <button
              onClick={() => window.print()}
              className="ml-auto text-sm font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg"
            >
              🖨️ Imprimir / PDF
            </button>
          </div>

          <div className="bg-gray-100 rounded-xl py-6 flex justify-center">
            <div id="ticket-print-area" className="bg-white shadow">
              {tab === 'cobro' && <TicketCobro empresa={empresa} config={config} comanda={comanda} />}
              {tab === 'cocina' && <TicketComanda comanda={comanda} tipo="cocina" />}
              {tab === 'barra' && <TicketComanda comanda={comanda} tipo="barra" />}
            </div>
          </div>
        </>
      )}

      {comandas.length === 0 && (
        <p className="text-sm text-gray-400">Este restaurante todavía no tiene comandas cerradas para previsualizar.</p>
      )}
    </div>
  )
}

export default function TicketsPage() {
  const { data: restaurantes = [] } = useQuery({ queryKey: ['restaurantes'], queryFn: api.restaurantes.list })
  const [restaurantSel, setRestaurantSel] = useState<number | null>(null)

  useEffect(() => {
    if (!restaurantSel && restaurantes.length > 0) setRestaurantSel(restaurantes[0].id)
  }, [restaurantes, restaurantSel])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-gray-800 mb-1">🧾 Tickets</h1>
      <p className="text-sm text-gray-400 mb-6">Configuración del ticket de cobro y comandas de cocina/barra (impresión térmica 80mm).</p>

      <EmpresaSection />

      <div className="flex flex-wrap gap-2 mb-4">
        {restaurantes.map(r => (
          <button
            key={r.id}
            onClick={() => setRestaurantSel(r.id)}
            className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${restaurantSel === r.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      {restaurantSel && (
        <>
          <LocalSection restaurantId={restaurantSel} />
          <ImpresorasSection restaurantId={restaurantSel} />
          <RutasSection restaurantId={restaurantSel} />
          <PreviewSection restaurantId={restaurantSel} />
        </>
      )}
    </div>
  )
}
