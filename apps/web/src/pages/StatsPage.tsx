import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { api } from '../api'

const CYAN = '#22d3ee'
const CYAN_DIM = '#0e7490'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Skeleton() {
  return <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
}

export default function StatsPage() {
  const { data: porDia, isLoading: loadingDia } = useQuery({
    queryKey: ['stats-dia'],
    queryFn: () => api.stats.retirosPorDia(30),
  })

  const { data: porRestaurante, isLoading: loadingRest } = useQuery({
    queryKey: ['stats-restaurante'],
    queryFn: () => api.stats.retirosPorRestaurante(),
  })

  const { data: productosTop, isLoading: loadingProd } = useQuery({
    queryKey: ['stats-productos'],
    queryFn: () => api.stats.productosTop(10, 30),
  })

  const { data: empleados, isLoading: loadingEmp } = useQuery({
    queryKey: ['stats-empleados'],
    queryFn: () => api.stats.actividadEmpleados(),
  })

  const mesActual = new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-cyan-600 text-sm hover:underline">← Admin</Link>
          <h1 className="text-xl font-bold text-gray-900">Estadísticas</h1>
        </div>
        <span className="text-sm text-gray-400 capitalize">{mesActual}</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Retiros por día */}
        <div className="lg:col-span-2">
          <Card title="Retiros por día — últimos 30 días">
            {loadingDia ? <Skeleton /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={porDia} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CYAN} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CYAN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(v) => [v, 'Retiros']}
                    labelFormatter={(l) => new Date(l).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Area type="monotone" dataKey="total" stroke={CYAN} strokeWidth={2} fill="url(#cyanGrad)" dot={false} activeDot={{ r: 4, fill: CYAN }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Retiros por restaurante */}
        <Card title={`Retiros por restaurante — ${mesActual}`}>
          {loadingRest ? <Skeleton /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porRestaurante} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [v, 'Retiros']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {porRestaurante?.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? CYAN : CYAN_DIM} fillOpacity={1 - i * 0.12} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Actividad empleados */}
        <Card title={`Actividad empleados — ${mesActual}`}>
          {loadingEmp ? <Skeleton /> : !empleados?.length ? (
            <p className="text-gray-400 text-sm text-center py-8">Sin datos este mes</p>
          ) : (
            <ul className="space-y-3">
              {empleados.map((e, i) => {
                const max = empleados[0].total
                return (
                  <li key={e.empleadoId} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                    <span className="text-sm text-gray-700 w-32 truncate">{e.nombre}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${(e.total / max) * 100}%`, background: CYAN }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-6 text-right">{e.total}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Productos top */}
        <div className="lg:col-span-2">
          <Card title="Productos más retirados — últimos 30 días">
            {loadingProd ? <Skeleton /> : !productosTop?.length ? (
              <p className="text-gray-400 text-sm text-center py-8">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={productosTop} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip
                    formatter={(v, name) => [v, name === 'vecesRetirado' ? 'Veces retirado' : 'Cantidad total']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Bar dataKey="vecesRetirado" fill={CYAN} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

      </main>
    </div>
  )
}
