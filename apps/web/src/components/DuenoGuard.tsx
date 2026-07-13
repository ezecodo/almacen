import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'

const DUENO_PIN = import.meta.env.VITE_DUENO_PIN as string
const STORAGE_KEY = 'dueno_auth'

function isAuthenticated() {
  return sessionStorage.getItem(STORAGE_KEY) === 'true'
}

function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === DUENO_PIN) {
      sessionStorage.setItem(STORAGE_KEY, 'true')
      onSuccess()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="min-h-screen bg-[#1a2235] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 w-full max-w-sm text-center">
        <div className="text-5xl mb-4">📈</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Panel Propietario</h1>
        <p className="text-gray-400 text-sm mb-8">Introduce el PIN para continuar</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false) }}
            placeholder="····"
            autoFocus
            className={`w-full text-center text-3xl tracking-widest border-2 rounded-xl px-4 py-4 focus:outline-none transition-colors ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-cyan-500'
            }`}
          />
          {error && <p className="text-red-500 text-sm">PIN incorrecto</p>}
          <button
            type="submit"
            className="w-full bg-cyan-500 text-white text-lg font-semibold py-4 rounded-xl hover:bg-cyan-400 transition-colors"
          >
            Entrar
          </button>
        </form>
        <Link to="/" className="block mt-6 text-sm text-gray-400 hover:text-gray-600">
          ← Volver a la app
        </Link>
      </div>
    </div>
  )
}

export default function DuenoGuard() {
  const [auth, setAuth] = useState(isAuthenticated())

  if (!auth) return <PinGate onSuccess={() => setAuth(true)} />
  return <Outlet />
}
