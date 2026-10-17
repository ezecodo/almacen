import type { MenuCategoria, MenuItem } from '../api'

// Los niveles de salida en palabras, igual que en el ticket de cocina (printer-server → printer.py):
// un número grande se confundía con la cantidad del plato.
const NIVELES = ['PRIMEROS', 'SEGUNDOS', 'TERCEROS', 'CUARTOS', 'QUINTOS', 'SEXTOS', 'SÉPTIMOS', 'OCTAVOS', 'NOVENOS', 'DÉCIMOS']
export const nombreNivel = (n: number) => NIVELES[n - 1] ?? `NIVEL ${n}`

// Categoría de "bloque propio" de un plato (🎫 Nombre en ticket en /admin/menu, ej. POSTRES).
// Una subcategoría hereda la opción de su categoría padre.
export function bloqueDePlato(nombre: string, menu: MenuItem[], categorias: MenuCategoria[]): string | null {
  const cat = categorias.find(c => c.nombre === menu.find(m => m.nombre === nombre)?.categoria)
  if (!cat) return null
  if (cat.nombreEnTicket) return cat.nombre
  const padre = cat.parentId ? categorias.find(c => c.id === cat.parentId) : undefined
  return padre?.nombreEnTicket ? padre.nombre : null
}

// Como en papel: un nivel cuyos platos son todos de un mismo bloque sale con su nombre (POSTRES)
export function tituloNivel(nivel: number, platos: string[], menu: MenuItem[], categorias: MenuCategoria[]) {
  const bloques = new Set(platos.map(p => bloqueDePlato(p, menu, categorias)))
  const [unico] = [...bloques]
  return bloques.size === 1 && unico ? unico.toUpperCase() : nombreNivel(nivel)
}

// Cabecera de nivel con el formato del ticket: texto chico en un recuadro invertido, a la
// izquierda y apoyado en una línea fina. `children` va a la derecha (ej. ▲▼ del nivel entero).
export default function NivelEtiqueta({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="bg-[var(--sala-txt)] text-[var(--sala-bg)] text-[11px] font-black uppercase tracking-wider px-2 py-0.5 shrink-0">{titulo}</span>
      <div className="flex-1 h-px bg-[var(--sala-tx3)]" />
      {children}
    </div>
  )
}
