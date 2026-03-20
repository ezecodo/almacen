import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/admin', label: 'Retiros', end: true },
  { to: '/admin/validar', label: 'Validar' },
  { to: '/admin/stats', label: 'Estadísticas' },
  { to: '/admin/empleados', label: 'Empleados' },
  { to: '/admin/productos', label: 'Catálogo' },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    navigate('/')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
      isActive ? 'bg-cyan-50 text-cyan-700' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        {/* Fila superior: logo + acciones */}
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/sensi.png" alt="Sensi" className="h-7 object-contain shrink-0" />
            <span className="text-gray-300 hidden sm:block">|</span>
            <h1 className="text-base font-bold text-gray-900 whitespace-nowrap hidden sm:block">Panel Admin</h1>
          </div>

          {/* Nav centrada — solo desktop */}
          <nav className="hidden md:flex gap-1">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={navClass}>{label}</NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              ← App
            </Link>
            <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
              Salir
            </button>
          </div>
        </div>

        {/* Nav scrollable — solo móvil */}
        <nav className="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>{label}</NavLink>
          ))}
        </nav>
      </header>

      <Outlet />
    </div>
  )
}
