import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import RetiroPage from './pages/RetiroPage'
import AdminPage from './pages/AdminPage'
import ProductosPage from './pages/ProductosPage'
import EmpleadosPage from './pages/EmpleadosPage'
import StatsPage from './pages/StatsPage'
import AdminGuard from './components/AdminGuard'
import AdminLayout from './components/AdminLayout'
import VerificarPage from './pages/VerificarPage'
import ValidarPage from './pages/ValidarPage'
import PropinasPage from './pages/PropinasPage'
import MenuPage from './pages/MenuPage'
import MisPropinasPage from './pages/MisPropinasPage'
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
          <Route path="/" element={<LandingPage />} />
          <Route path="/retiro" element={<RetiroPage />} />
          <Route path="/verificar/:id" element={<VerificarPage />} />
          <Route path="/mis-propinas" element={<MisPropinasPage />} />
          <Route element={<AdminGuard />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/productos" element={<ProductosPage />} />
              <Route path="/admin/empleados" element={<EmpleadosPage />} />
              <Route path="/admin/stats" element={<StatsPage />} />
              <Route path="/admin/validar" element={<ValidarPage />} />
              <Route path="/admin/propinas" element={<PropinasPage />} />
              <Route path="/admin/menu" element={<MenuPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
