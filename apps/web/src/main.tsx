import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InicioPage from './pages/InicioPage'
import EntrarPage from './pages/EntrarPage'
import RetiroPage from './pages/RetiroPage'
import AdminPage from './pages/AdminPage'
import ProductosPage from './pages/ProductosPage'
import EmpleadosPage from './pages/EmpleadosPage'
import StatsPage from './pages/StatsPage'
import AdminGuard from './components/AdminGuard'
import PulsoGuard from './components/PulsoGuard'
import PulsoPage from './pages/PulsoPage'
import AdminLayout from './components/AdminLayout'
import VerificarPage from './pages/VerificarPage'
import ValidarPage from './pages/ValidarPage'
import PropinasPage from './pages/PropinasPage'
import MenuPage from './pages/MenuPage'
import AlergenosPage from './pages/AlergenosPage'
import MaridajesPage from './pages/MaridajesPage'
import EscandallosPage from './pages/EscandallosPage'
import MisPropinasPage from './pages/MisPropinasPage'
import SalonPage from './pages/SalonPage'
import ComandasPage from './pages/ComandasPage'
import MesasFeedPage from './pages/MesasFeedPage'
import MermasPage from './pages/MermasPage'
import SetupPage from './pages/SetupPage'
import SalaLoginPage from './pages/SalaLoginPage'
import SalaMesasPage from './pages/SalaMesasPage'
import GrupoMenuPage from './pages/GrupoMenuPage'
import TurnosPage from './pages/TurnosPage'
import TurnoDetallePage from './pages/TurnoDetallePage'
import InventarioPage from './pages/InventarioPage'
import ReservasAdminPage from './pages/ReservasAdminPage'
import ReservaPublicaPage from './pages/ReservaPublicaPage'
import AdminHomePage from './pages/AdminHomePage'
import LogoLabPage from './pages/LogoLabPage'
import StaffingPage from './pages/StaffingPage'
import WikiPage from './pages/WikiPage'
import ChecklistsPage from './pages/ChecklistsPage'
import TicketsPage from './pages/TicketsPage'
import FacturasPage from './pages/FacturasPage'
import VerifactuPage from './pages/VerifactuPage'
import RestaurantesPage from './pages/RestaurantesPage'
import RedPage from './pages/RedPage'
import AccesosPage from './pages/AccesosPage'
import SinConexion from './components/SinConexion'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InicioPage />} />
          <Route path="/entrar" element={<EntrarPage />} />
          <Route path="/acceder" element={<Navigate to="/admin" replace />} />
          <Route path="/logo-lab" element={<LogoLabPage />} />
          <Route element={<SinConexion />}>
            <Route path="/sala/setup" element={<SetupPage />} />
            <Route path="/sala" element={<SalaLoginPage />} />
            <Route path="/sala/mesas" element={<SalaMesasPage />} />
          </Route>
          <Route path="/retiro" element={<RetiroPage />} />
          <Route path="/verificar/:id" element={<VerificarPage />} />
          <Route path="/mis-propinas" element={<MisPropinasPage />} />
          <Route path="/reservas/:slug" element={<ReservaPublicaPage />} />
          <Route element={<PulsoGuard />}>
            <Route path="/pulso" element={<PulsoPage />} />
          </Route>
          <Route element={<AdminGuard />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminHomePage />} />
              <Route path="/admin/retiros" element={<AdminPage />} />
              <Route path="/admin/productos" element={<ProductosPage />} />
              <Route path="/admin/empleados" element={<EmpleadosPage />} />
              <Route path="/admin/stats" element={<StatsPage />} />
              <Route path="/admin/validar" element={<ValidarPage />} />
              <Route path="/admin/propinas" element={<PropinasPage />} />
              <Route path="/admin/menu" element={<MenuPage />} />
              <Route path="/admin/alergenos" element={<AlergenosPage />} />
              <Route path="/admin/maridajes" element={<MaridajesPage />} />
              <Route path="/admin/escandallos" element={<EscandallosPage />} />
              <Route path="/admin/salon" element={<SalonPage />} />
              <Route path="/admin/comandas" element={<ComandasPage />} />
              <Route path="/admin/mesas" element={<MesasFeedPage />} />
              <Route path="/admin/mermas" element={<MermasPage />} />
              <Route path="/admin/grupos" element={<GrupoMenuPage />} />
              <Route path="/admin/turnos" element={<TurnosPage />} />
              <Route path="/admin/turnos/:id" element={<TurnoDetallePage />} />
              <Route path="/admin/inventario" element={<InventarioPage />} />
              <Route path="/admin/reservas" element={<ReservasAdminPage />} />
              <Route path="/admin/staffing" element={<StaffingPage />} />
              <Route path="/admin/wiki" element={<WikiPage />} />
              <Route path="/admin/checklists" element={<ChecklistsPage />} />
              <Route path="/admin/tickets" element={<TicketsPage />} />
              <Route path="/admin/facturas" element={<FacturasPage />} />
              <Route path="/admin/verifactu" element={<VerifactuPage />} />
              <Route path="/admin/restaurantes" element={<RestaurantesPage />} />
              <Route path="/admin/red" element={<RedPage />} />
              <Route path="/admin/accesos" element={<AccesosPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
