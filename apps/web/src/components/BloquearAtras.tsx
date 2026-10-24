import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Sala y TPV: el "atrás" del sistema (en Android, deslizar desde un borde) no hace nada.
// Con prisa se dispara sin querer y la app volvía a una pantalla anterior o quedaba en blanco.
// Una web no puede apagar el gesto, así que se deja una entrada de más en el historial con la
// misma dirección: el gesto la consume y se vuelve a poner. Dentro de la sala se navega con
// botones y deslizando, nunca con el atrás del sistema.
const ZONA = /^\/(sala|tpv)(\/mesas)?\/?$/

export default function BloquearAtras() {
  const { pathname } = useLocation()
  const activo = ZONA.test(pathname)

  useEffect(() => {
    if (!activo) return
    // Copia del estado del router (key, idx) para que al volver a esta entrada no note ningún cambio
    const poner = () => {
      if (!window.history.state?.oidoAtras) window.history.pushState({ ...window.history.state, oidoAtras: true }, '')
    }
    poner()
    window.addEventListener('popstate', poner)
    return () => window.removeEventListener('popstate', poner)
  }, [activo, pathname]) // pathname: tras un navigate con replace (PIN → mesas) hay que volver a ponerla
  return null
}
