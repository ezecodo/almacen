import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, Empleado, Restaurante } from '../api'

// Dar un badge de Oído Talent a un empleado, a nombre del restaurante. Lo firma el back-office de
// Oído y le llega al empleado por correo, con el enlace para descargar el QR de su CV.
// BASIC = cumplió; GOLD = superó las expectativas (exige tener ya un BASIC de cualquier local).

const PUESTO: Record<string, string> = {
  camarero: 'Camarero/a', encargado: 'Encargado/a', jefe_cocina: 'Jefe/a de cocina',
  cocinero: 'Cocinero/a', produccion: 'Producción', friegaplatos: 'Friegaplatos',
}
const CAMPO = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500'

export default function BadgeModal({ empleado, restaurantes, onClose }: { empleado: Empleado; restaurantes: Restaurante[]; onClose: () => void }) {
  const [nombre, ...resto] = empleado.nombre.trim().split(/\s+/)
  const [f, setF] = useState({
    restaurantId: empleado.restaurantId ?? restaurantes[0]?.id ?? 0,
    tipo: 'BASIC' as 'BASIC' | 'GOLD',
    nombre,
    apellido: resto.join(' '),
    email: empleado.email ?? '',
    rol: PUESTO[empleado.rol ?? ''] ?? '',
    fechaInicio: '',
    sigue: true,
    fechaFin: '',
    skills: '',
    nota: '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(s => ({ ...s, [k]: v }))

  const dar = useMutation({
    mutationFn: () => api.empleados.darBadge(empleado.id, {
      restaurantId: f.restaurantId,
      tipo: f.tipo,
      nombre: f.nombre.trim(),
      apellido: f.apellido.trim(),
      email: f.email.trim(),
      rol: f.rol.trim(),
      fechaInicio: f.fechaInicio,
      fechaFin: f.sigue ? null : f.fechaFin || null,
      skills: f.skills.split(',').map(s => s.trim()).filter(Boolean),
      nota: f.nota.trim(),
    }),
  })
  const listo = f.restaurantId && f.nombre.trim() && f.apellido.trim() && f.email.trim() && f.rol.trim() && f.fechaInicio && (f.sigue || f.fechaFin)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        {dar.data ? (
          <div className="text-center space-y-3">
            <p className="text-4xl">🏅</p>
            <h2 className="text-lg font-bold text-gray-900">Badge {dar.data.codigo} emitido</h2>
            <p className="text-sm text-gray-500">
              {dar.data.avisado
                ? <>Le hemos enviado un correo a <b>{f.email}</b> con el enlace para verlo y descargar el QR para su CV.</>
                : 'No pudimos avisarle por correo. Pásale tú este enlace:'}
            </p>
            <a href={dar.data.url} target="_blank" rel="noreferrer" className="block break-all text-sm font-semibold text-cyan-600">{dar.data.url}</a>
            <button onClick={onClose} className="w-full bg-cyan-500 text-white font-semibold py-3 rounded-xl">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (listo) dar.mutate() }} className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Dar un badge a {empleado.nombre}</h2>
            <p className="text-sm text-gray-400">Un reconocimiento verificable que se lleva a sus próximos trabajos. Le llega por correo.</p>

            <div className="grid grid-cols-2 gap-2">
              {(['BASIC', 'GOLD'] as const).map(t => (
                <button key={t} type="button" onClick={() => set('tipo', t)}
                  className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${f.tipo === t ? (t === 'GOLD' ? 'border-amber-400 bg-amber-50' : 'border-cyan-500 bg-cyan-50') : 'border-gray-200'}`}>
                  <span className="block font-bold text-gray-900">{t === 'GOLD' ? '⭐ Gold' : 'Badge'}</span>
                  <span className="block text-xs text-gray-500">{t === 'GOLD' ? 'Superó las expectativas' : 'Hizo bien su trabajo'}</span>
                </button>
              ))}
            </div>

            {restaurantes.length > 1 && (
              <label className="block text-xs font-semibold text-gray-500">Lo da
                <select value={f.restaurantId} onChange={e => set('restaurantId', Number(e.target.value))} className={CAMPO}>
                  {restaurantes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-500">Nombre
                <input value={f.nombre} onChange={e => set('nombre', e.target.value)} className={CAMPO} />
              </label>
              <label className="block text-xs font-semibold text-gray-500">Apellido
                <input value={f.apellido} onChange={e => set('apellido', e.target.value)} className={CAMPO} />
              </label>
            </div>
            <label className="block text-xs font-semibold text-gray-500">Su email (ahí le llega el badge)
              <input type="email" value={f.email} onChange={e => set('email', e.target.value)} className={CAMPO} />
            </label>
            <label className="block text-xs font-semibold text-gray-500">Puesto
              <input value={f.rol} onChange={e => set('rol', e.target.value)} placeholder="Camarero/a de sala" className={CAMPO} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-gray-500">Empezó
                <input type="date" value={f.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} className={CAMPO} />
              </label>
              <label className="block text-xs font-semibold text-gray-500">Terminó
                <input type="date" value={f.fechaFin} disabled={f.sigue} onChange={e => set('fechaFin', e.target.value)} className={`${CAMPO} disabled:bg-gray-100`} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={f.sigue} onChange={e => set('sigue', e.target.checked)} /> Sigue trabajando aquí
            </label>
            <label className="block text-xs font-semibold text-gray-500">En qué destaca (separado por comas, opcional)
              <input value={f.skills} onChange={e => set('skills', e.target.value)} placeholder="Trato al cliente, vinos, rapidez" className={CAMPO} />
            </label>
            <label className="block text-xs font-semibold text-gray-500">Unas palabras (opcional)
              <textarea value={f.nota} onChange={e => set('nota', e.target.value)} rows={2} className={CAMPO} />
            </label>

            {dar.isError && <p className="text-red-500 text-sm">{(dar.error as Error).message}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 font-semibold py-3 rounded-xl">Cancelar</button>
              <button type="submit" disabled={!listo || dar.isPending} className="flex-1 bg-cyan-500 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                {dar.isPending ? 'Emitiendo…' : 'Dar el badge'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
