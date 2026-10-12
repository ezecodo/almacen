import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { existeGrupo, urlDeGrupo, useEsInstalacion } from '../lib/instalacion'

// "Acceder" de la vidriera: pide el identificador del grupo y manda a su instalación.
export default function EntrarPage() {
  const esInstalacion = useEsInstalacion()
  const [grupo, setGrupo] = useState('')
  const [error, setError] = useState('')
  const [buscando, setBuscando] = useState(false)

  // Dentro de la instalación de un cliente no hay nada que elegir
  if (esInstalacion) return <Navigate to="/acceder" replace />

  const codigo = grupo.trim().toLowerCase()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo || buscando) return
    if (!/^[a-z][a-z0-9-]{1,29}$/.test(codigo)) {
      setError('Ese nombre no es válido: solo letras, números y guiones')
      return
    }
    setBuscando(true)
    if (await existeGrupo(codigo)) {
      location.href = `${urlDeGrupo(codigo)}/acceder`
    } else {
      setError('No encontramos ese grupo. Revisa el nombre que te dimos.')
      setBuscando(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a2235] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-extrabold text-white mb-2">Oido<span className="text-[#4CC8A0]">Ops</span></h1>
        <p className="text-gray-400 text-sm mb-8">Escribe el nombre de tu grupo para entrar a tu panel</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={grupo}
            onChange={(e) => { setGrupo(e.target.value); setError('') }}
            placeholder="nombre-del-grupo"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`w-full text-center text-xl border-2 rounded-2xl px-4 py-4 bg-white focus:outline-none transition-colors ${
              error ? 'border-red-400' : 'border-transparent focus:border-[#4CC8A0]'
            }`}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={!codigo || buscando}
            className="w-full bg-gradient-to-r from-[#4B9EDF] to-[#4CC8A0] text-white font-bold py-4 rounded-2xl text-lg shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {buscando ? 'Buscando…' : 'Entrar'}
          </button>
        </form>
        <Link to="/" className="block mt-6 text-sm text-gray-400 hover:text-gray-200">
          ← Volver
        </Link>
      </div>
    </div>
  )
}
