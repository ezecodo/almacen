import { useEffect, useRef, useState } from 'react'

// Un joystick o mando USB/Bluetooth en la pantalla de pase, con la Gamepad API del navegador. Cada modelo
// numera sus botones a su manera (el Speedlink Competition Pro Extra no trae mapa conocido), así que
// aquí solo se leen pulsaciones: qué botón hace qué se decide con la calibración y se guarda en esta tablet.
// El navegador no enseña el mando hasta que se pulsa algún botón con la página delante.

export type FuncionMando = 'marcar' | 'atras' | 'alto' | 'planta'
export type DireccionMando = 'arriba' | 'abajo' | 'izquierda' | 'derecha'
export type MapaMando = Record<FuncionMando, number>

const CLAVE = 'pase_mando'
const UMBRAL = 0.5
const REPETIR_DESDE_MS = 450 // palanca mantenida: empieza a repetir…
const REPETIR_CADA_MS = 200  // …a este ritmo

export function leerMapa(): MapaMando | null {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '') as MapaMando } catch { return null }
}
export const guardarMapa = (m: MapaMando) => localStorage.setItem(CLAVE, JSON.stringify(m))

function direccion(p: Gamepad): DireccionMando | null {
  const [x = 0, y = 0] = p.axes
  // En el mapa estándar la cruceta son los botones 12 a 15
  const b = (i: number) => !!p.buttons[i]?.pressed
  if (p.mapping === 'standard') {
    if (b(12)) return 'arriba'
    if (b(13)) return 'abajo'
    if (b(14)) return 'izquierda'
    if (b(15)) return 'derecha'
  }
  if (Math.abs(x) < UMBRAL && Math.abs(y) < UMBRAL) return null
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'arriba' : 'abajo'
  return x < 0 ? 'izquierda' : 'derecha'
}

export function useMando(onMover: (d: DireccionMando) => void, onBoton: (boton: number) => void) {
  const [nombre, setNombre] = useState<string | null>(null)
  const mover = useRef(onMover)
  const boton = useRef(onBoton)
  mover.current = onMover
  boton.current = onBoton

  useEffect(() => {
    let vivo = true
    let antes: boolean[] = []
    let dirAntes: DireccionMando | null = null
    let proxima = 0
    const leer = (t: number) => {
      if (!vivo) return
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p && p.connected)
      setNombre(pad?.id ?? null)
      if (pad) {
        const pulsados = pad.buttons.map(b => b.pressed)
        pulsados.forEach((p, i) => { if (p && !antes[i] && !(pad.mapping === 'standard' && i >= 12 && i <= 15)) boton.current(i) })
        antes = pulsados
        const d = direccion(pad)
        if (d && (d !== dirAntes || t >= proxima)) {
          mover.current(d)
          proxima = t + (d !== dirAntes ? REPETIR_DESDE_MS : REPETIR_CADA_MS)
        }
        dirAntes = d
      }
      requestAnimationFrame(leer)
    }
    requestAnimationFrame(leer)
    return () => { vivo = false }
  }, [])
  return nombre
}
