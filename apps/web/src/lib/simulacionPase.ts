import { useEffect, useMemo, useRef, useState } from 'react'
import type { FloorPlan, MesaPase, PlatoPase } from '../api'

// Servicio de mentira para la pantalla de pase: para practicar, probar el mando o enseñarla en una demo.
// Todo vive en la memoria de esta pantalla: no toca el servidor, ni la sala, ni imprime nada. Con la carta
// y los salones de verdad entran mesas solas, el tiempo corre más deprisa, el del pase recoge lo listo y
// de vez en cuando un camarero pide que siga una mesa. Tú haces de jefe de cocina.

const TICK_MS = 4000
const MINUTOS_POR_TICK = 1 // cada 4 s pasa un minuto: los colores se ven cambiar
const MAX_ACTIVAS = 14
const CAMAREROS = ['Lucía', 'Marc', 'Carla', 'Pau', 'Nora']
const PLATOS_POR_DEFECTO = ['PATATAS BRAVAS', 'CROQUETAS', 'PULPO', 'ENSALADILLA', 'TORTILLA', 'CARRILLERA', 'CALAMARES', 'PIMIENTOS PADRÓN']

const azar = (n: number) => Math.floor(Math.random() * n)
const elegir = <T,>(lista: T[]) => lista[azar(lista.length)]
const haceMin = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const atrasar = (iso: string) => new Date(new Date(iso).getTime() - MINUTOS_POR_TICK * 60000).toISOString()

let nuevoId = 1

function nuevaMesa(numero: number, salon: string, platos: string[], edadMin: number, avance: number): MesaPase {
  const enviadoAt = haceMin(edadMin)
  const nombres = [...platos].sort(() => Math.random() - 0.5).slice(0, 3 + azar(5))
  const niveles = 2 + azar(2)
  const items: PlatoPase[] = nombres.map((nombre, k) => {
    const nivel = 1 + Math.floor((k * niveles) / nombres.length)
    const cantidad = 1 + azar(3) === 3 ? 2 : 1
    const hecho = nivel === 1 && Math.random() < avance
    return {
      id: nuevoId++, nombre, cantidad, nota: Math.random() < 0.1 ? 'sin sal' : '', nivel, enviadoAt,
      listos: hecho ? cantidad : 0, servidos: hecho ? cantidad : 0, listoAt: hecho ? haceMin(Math.max(1, edadMin - 8)) : null,
    }
  })
  return {
    comandaId: nuevoId++, mesa: numero, salon, pax: 2 + azar(5), camarero: elegir(CAMAREROS), noComparten: Math.random() < 0.1,
    nota: '', sigueAt: null, siguePor: null, desde: enviadoAt, alergias: Math.random() < 0.12 ? ['Gluten'] : [], items,
  }
}

const faltaServir = (m: MesaPase) => m.items.some(i => i.servidos < i.cantidad)
const haciaAtras = (m: MesaPase): MesaPase => ({
  ...m,
  sigueAt: m.sigueAt && atrasar(m.sigueAt),
  items: m.items.map(i => ({ ...i, enviadoAt: atrasar(i.enviadoAt), listoAt: i.listoAt && atrasar(i.listoAt) })),
})

export function useSimulacionPase(activa: boolean, platosCarta: string[], salones: FloorPlan[]) {
  const [mesas, setMesas] = useState<MesaPase[]>([])
  const fuente = useRef({ platos: platosCarta, salones })
  fuente.current = { platos: platosCarta, salones }

  useEffect(() => {
    if (!activa) { setMesas([]); return }
    const sitios = () => {
      const lista = fuente.current.salones.flatMap(p => p.mesas.filter(m => m.tipo !== 'barra').map(m => ({ numero: m.numero, salon: p.nombre })))
      return lista.length ? lista : Array.from({ length: 30 }, (_, k) => ({ numero: k + 1, salon: 'Sala' }))
    }
    const platos = () => (fuente.current.platos.length >= 3 ? fuente.current.platos : PLATOS_POR_DEFECTO)
    const libre = (ocupadas: (number | null)[]) => {
      const libres = sitios().filter(s => !ocupadas.includes(s.numero))
      return libres.length ? elegir(libres) : null
    }
    // Arranca a media noche: unas mesas ya van tarde, otras acaban de pedir
    const inicio: MesaPase[] = []
    for (const edad of [42, 30, 22, 14, 8, 3]) {
      const s = libre(inicio.map(m => m.mesa))
      if (s) inicio.push(nuevaMesa(s.numero, s.salon, platos(), edad, 0.8))
    }
    setMesas(inicio)

    const reloj = setInterval(() => setMesas(prev => {
      let siguiente = prev.map(haciaAtras)
      // El del pase recoge algo de lo listo
      const conListo = siguiente.flatMap(m => m.items.filter(i => i.listos > i.servidos))
      if (conListo.length && Math.random() < 0.5) {
        const id = elegir(conListo).id
        siguiente = siguiente.map(m => ({ ...m, items: m.items.map(i => (i.id === id ? { ...i, servidos: i.listos } : i)) }))
      }
      // Un camarero ve una demora y avisa
      const sinAviso = siguiente.filter(m => !m.sigueAt && m.items.some(i => i.listos < i.cantidad))
      if (sinAviso.length && Math.random() < 0.08) {
        const id = elegir(sinAviso).comandaId
        siguiente = siguiente.map(m => (m.comandaId === id ? { ...m, sigueAt: new Date().toISOString(), siguePor: elegir(CAMAREROS) } : m))
      }
      // Las mesas terminadas se van y entran otras
      const terminadas = siguiente.filter(m => !faltaServir(m))
      if (terminadas.length > 4) siguiente = siguiente.filter(m => m !== terminadas[0])
      if (siguiente.filter(faltaServir).length < MAX_ACTIVAS && Math.random() < 0.3) {
        const s = libre(siguiente.map(m => m.mesa))
        if (s) siguiente = [...siguiente, nuevaMesa(s.numero, s.salon, platos(), 0, 0)]
      }
      return siguiente
    }), TICK_MS)
    return () => clearInterval(reloj)
  }, [activa])

  const ordenadas = useMemo(() => mesas.map(m => {
    const faltan = m.items.filter(i => i.servidos < i.cantidad)
    const desde = (faltan.length ? faltan : m.items).reduce((h, i) => (i.enviadoAt < h ? i.enviadoAt : h), m.items[0].enviadoAt)
    return { ...m, desde }
  }).sort((a, b) => a.desde.localeCompare(b.desde)), [mesas])

  const marcar = (id: number, listos: number, servidos: number) => setMesas(prev => prev.map(m => {
    const item = m.items.find(i => i.id === id)
    if (!item) return m
    const sale = listos > item.listos
    return {
      ...m, sigueAt: sale ? null : m.sigueAt, siguePor: sale ? null : m.siguePor,
      items: m.items.map(i => (i.id === id ? { ...i, listos, servidos, listoAt: sale ? new Date().toISOString() : i.listoAt } : i)),
    }
  }))
  return { mesas: ordenadas, marcar }
}
