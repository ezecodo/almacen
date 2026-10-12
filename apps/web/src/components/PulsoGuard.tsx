import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { api } from '../api'

const STORAGE_KEY = 'pulso_auth'

function isAuthenticated() {
  return sessionStorage.getItem(STORAGE_KEY) === 'true'
}

function PinGate({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [comprobando, setComprobando] = useState(false)

  // El PIN lo valida el servidor (PULSO_PIN en el .env de la API)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin || comprobando) return
    setComprobando(true)
    try {
      await api.auth.pulso(pin)
      sessionStorage.setItem(STORAGE_KEY, 'true')
      onSuccess()
    } catch (err) {
      setError((err as Error).message)
      setPin('')
      setComprobando(false)
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
            onChange={(e) => { setPin(e.target.value); setError('') }}
            placeholder="····"
            autoFocus
            className={`w-full text-center text-3xl tracking-widest border-2 rounded-xl px-4 py-4 focus:outline-none transition-colors ${
              error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-cyan-500'
            }`}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={comprobando}
            className="w-full bg-cyan-500 text-white text-lg font-semibold py-4 rounded-xl hover:bg-cyan-400 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}

export default function PulsoGuard() {
  const [auth, setAuth] = useState(isAuthenticated())

  if (!auth) return <PinGate onSuccess={() => setAuth(true)} />
  return <Outlet />
}
