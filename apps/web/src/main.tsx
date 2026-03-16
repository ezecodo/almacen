import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RetiroPage from './pages/RetiroPage'
import AdminPage from './pages/AdminPage'
import ProductosPage from './pages/ProductosPage'
import EmpleadosPage from './pages/EmpleadosPage'
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
          <Route path="/" element={<RetiroPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/productos" element={<ProductosPage />} />
          <Route path="/admin/empleados" element={<EmpleadosPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
