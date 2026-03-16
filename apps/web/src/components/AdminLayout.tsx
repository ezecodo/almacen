import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

export default function AdminLayout() {
  const navigate = useNavigate()

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
        {/* Izquierda: título */}
        <div className="flex items-center gap-3 min-w-fit">
          <img src="/sensi.png" alt="Sensi" className="h-7 object-contain" />
          <span className="text-gray-300">|</span>
          <h1 className="text-base font-bold text-gray-900 whitespace-nowrap">Panel Admin</h1>
        </div>

        {/* Centro: navegación */}
        <nav className="flex gap-1">
          {[
            { to: '/admin', label: 'Retiros', end: true },
            { to: '/admin/stats', label: 'Estadísticas' },
            { to: '/admin/empleados', label: 'Empleados' },
            { to: '/admin/productos', label: 'Catálogo' },
          ].map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Derecha: acciones */}
        <div className="flex items-center gap-3 min-w-fit">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← App
          </Link>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
            Salir
          </button>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
