import { useQuery } from '@tanstack/react-query'

// El mismo build se sirve en dos sitios: la instalación de cada cliente (con su API detrás)
// y la vidriera del producto (solo archivos, sin API). Se distinguen preguntando si hay API.
// Se mira el JSON y no solo el status: en la vidriera Nginx puede devolver index.html con 200.
async function hayInstalacion(base = ''): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/instalacion`)
    if (!res.ok) return false
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

// ¿Esta es la copia de la app que corre dentro de la Box del local (modo local, sin internet)?
export function useEsModoLocal(): boolean {
  return useQuery({
    queryKey: ['instalacion-local'],
    queryFn: async () => {
      const res = await fetch('/api/instalacion')
      return res.ok && (await res.json()).local === true
    },
    staleTime: Infinity,
    retry: false,
  }).data === true
}

// undefined mientras se averigua
export function useEsInstalacion(): boolean | undefined {
  return useQuery({ queryKey: ['instalacion'], queryFn: () => hayInstalacion(), staleTime: Infinity, retry: false }).data
}

// Cada cliente vive en <identificador>.<dirección de la vidriera>
export const urlDeGrupo = (codigo: string) => `${location.protocol}//${codigo}.${location.host}`

export const existeGrupo = (codigo: string) => hayInstalacion(urlDeGrupo(codigo))
