import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

const NAV_GROUPS = [
  {
    label: 'Sala',
    icon: '🍽',
    items: [
      { to: '/admin/mesas',    label: 'Mesas en vivo' },
      { to: '/admin/comandas', label: 'Comandas' },
      { to: '/admin/turnos',   label: 'Turnos' },
      { to: '/admin/mermas',   label: 'Mermas' },
      { to: '/admin/propinas', label: 'Propinas' },
    ],
  },
  {
    label: 'Reservas',
    icon: '📅',
    items: [
      { to: '/admin/reservas', label: 'Reservas' },
    ],
  },
  {
    label: 'Carta',
    icon: '📋',
    items: [
      { to: '/admin/menu',   label: 'Menú' },
      { to: '/admin/grupos', label: 'Grupos' },
      { to: '/admin/salon',  label: 'Salón' },
    ],
  },
  {
    label: 'Inventario',
    icon: '📦',
    items: [
      { to: '/admin/inventario', label: 'Inventario' },
    ],
  },
  {
    label: 'Almacén',
    icon: '🏭',
    items: [
      { to: '/admin/retiros',   label: 'Retiros' },
      { to: '/admin/validar',   label: 'Validar' },
      { to: '/admin/productos', label: 'Catálogo' },
      { to: '/admin/stats',     label: 'Estadísticas' },
    ],
  },
  {
    label: 'Equipo',
    icon: '👥',
    items: [
      { to: '/admin/empleados', label: 'Empleados' },
    ],
  },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    navigate('/')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors ${
      isActive
        ? 'bg-cyan-50 text-cyan-700 font-semibold'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-200">
        <img src="/oidoops.svg" alt="OidoOps" className="h-7 object-contain" />
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 mb-1">
              {group.icon} {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={linkClass}
                  onClick={onNavigate}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-200 flex items-center justify-between">
        <Link to="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          ← App
        </Link>
        <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
          Salir
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Sidebar desktop — fijo */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 bg-white border-r border-gray-200">
        <SidebarContent />
      </aside>

      {/* Sidebar móvil — overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl z-50 flex flex-col">
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar móvil */}
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-800 p-1 rounded-lg hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <img src="/oidoops.svg" alt="OidoOps" className="h-6 object-contain" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

      </div>
    </div>
  )
}
