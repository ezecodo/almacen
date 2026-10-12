import { Navigate } from 'react-router-dom'
import { useEsInstalacion } from '../lib/instalacion'
import LandingPage from './LandingPage'

// Raíz del sitio: en la instalación de un cliente va directo al panel de administración (que pide el PIN);
// en la vidriera (sin API detrás) muestra la presentación del producto.
export default function InicioPage() {
  const esInstalacion = useEsInstalacion()
  if (esInstalacion === undefined) return <div className="min-h-screen bg-[#1a2235]" />
  return esInstalacion ? <Navigate to="/admin" replace /> : <LandingPage />
}
