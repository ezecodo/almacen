// Planificador automático de turnos ("por necesidad"). Función pura: recibe empleados, necesidades,
// tipos de turno y lo que ya hay planificado en la semana, y devuelve los turnos a crear más un informe.
//
// Reglas que nunca se rompen:
//   - días libres fijos del empleado
//   - máximo 5 días de trabajo en la semana (2 libres), un turno por día
//   - nunca más horas que su contrato
//   - nunca más gente que la que pide cada local, día y puesto (lo ya planificado a mano se respeta)
// Objetivo: dejar los menos huecos posibles. Orden de preferencia para cubrir un hueco:
//   1. fijos del local con ese puesto   2. rotativos con ese puesto
//   3. suplentes del local (cocinero que puede ser jefe, camarero que puede ser encargado)
//   4. suplentes rotativos
//   5. fijos de otro local a los que les sobra ese día (prestados)   6. suplentes prestados
// Se resuelve como un flujo de costo mínimo (ver más abajo): garantiza la menor cantidad posible de huecos y,
// entre las soluciones con esos huecos, la que más respeta ese orden y reparte los días más parejo.
// Primero se decide quién trabaja qué días; al final se reparten las horas de cada uno con los tipos de
// turno de su puesto, lo más largos posible sin pasarse del contrato (un 35 h hace 8+8+8+5+5, no 8+8+8+8).
// Producción no se planifica (decisión de Eze: son pocos y se organizan solos).

export type Puesto = 'jefeCocina' | 'cocineros' | 'friegaplatos' | 'camareros' | 'encargados'
export const PUESTOS: Puesto[] = ['jefeCocina', 'cocineros', 'friegaplatos', 'camareros', 'encargados']
export type Necesidad = Record<Puesto, number>

export interface EmpleadoP {
  id: number; nombre: string; tipo: string; rol: string | null; restaurantId: number | null
  horasSemanales: number; diasLibresFijos: number[]; puedeEncargado: boolean; puedeJefeCocina: boolean
}
export interface TipoP {
  id: number; nombre: string; horaInicio: string; horaFin: string; restaurantId: number | null
  tipoEmpleado: string | null; rolEmpleado: string | null; excluirAutoPlanning: boolean
}
export interface TurnoExistenteP {
  empleadoId: number; restaurantId: number; dia: number; horaInicio: string; horaFin: string; ausente: boolean
}
export interface TurnoPlan {
  empleadoId: number; restaurantId: number; dia: number; horaInicio: string; horaFin: string
  tipoId: number | null; tipoNombre: string | null; puesto: Puesto; suplente: boolean; prestado: boolean
}
export interface Hueco { restaurantId: number; dia: number; puesto: Puesto; faltan: number; motivo: string }
export interface FaltanHoras { empleadoId: number; nombre: string; asignadas: number; contrato: number }
export interface ResultadoPlan {
  turnos: TurnoPlan[]
  huecos: Hueco[]
  faltanHoras: FaltanHoras[]
  // por local y día: lo pedido y lo cubierto al final (lo que ya había + lo nuevo)
  cobertura: Record<number, { needed: Necesidad; covered: Necesidad }[]>
}

const ROL_DE: Record<Puesto, string> = {
  jefeCocina: 'jefe_cocina', cocineros: 'cocinero', friegaplatos: 'friegaplatos', camareros: 'camarero', encargados: 'encargado',
}
const PUESTO_DE: Record<string, Puesto> = {
  jefe_cocina: 'jefeCocina', cocinero: 'cocineros', friegaplatos: 'friegaplatos', camarero: 'camareros', encargado: 'encargados',
}
// Palabras del nombre del tipo de turno que lo atan a un puesto (los tipos de Sensi no dicen su puesto)
const PALABRAS: Record<Puesto, string[]> = {
  jefeCocina: ['jefe', 'cocin'], cocineros: ['cocin'], friegaplatos: ['friega', 'office'],
  camareros: ['camarer'], encargados: ['encargad'],
}
const TODAS_PALABRAS = ['jefe', 'cocin', 'friega', 'office', 'camarer', 'encargad', 'produc']

export function minutos(ini: string, fin: string) {
  const [a, b] = ini.split(':').map(Number), [c, d] = fin.split(':').map(Number)
  let m = c * 60 + d - (a * 60 + b)
  if (m <= 0) m += 24 * 60
  return m
}
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const vacia = (): Necesidad => ({ jefeCocina: 0, cocineros: 0, friegaplatos: 0, camareros: 0, encargados: 0 })

export const esExacto = (e: EmpleadoP, p: Puesto) => e.rol === ROL_DE[p]
export const esSuplente = (e: EmpleadoP, p: Puesto) =>
  (p === 'jefeCocina' && e.rol === 'cocinero' && e.puedeJefeCocina) ||
  (p === 'encargados' && e.rol === 'camarero' && e.puedeEncargado)

// Cobertura de un día con la regla de siempre: primero los de puesto exacto; el suplente solo tapa un
// déficit y entonces deja de contar en su propio puesto.
export function cubrirDia(trabajando: EmpleadoP[], needed: Necesidad): Necesidad {
  const conRol = trabajando.filter(e => e.rol && PUESTO_DE[e.rol])
  const out = vacia()
  const comoSuplente = new Set<number>()
  for (const p of PUESTOS) {
    let n = conRol.filter(e => esExacto(e, p)).length
    if (n < needed[p]) {
      const sups = conRol.filter(e => !comoSuplente.has(e.id) && esSuplente(e, p)).slice(0, needed[p] - n)
      sups.forEach(e => comoSuplente.add(e.id))
      n += sups.length
    }
    out[p] = n
  }
  for (const p of PUESTOS) out[p] -= conRol.filter(e => comoSuplente.has(e.id) && esExacto(e, p)).length
  return out
}

export function planificar(entrada: {
  restaurantIds: number[]
  necesidades: Record<number, Necesidad[]>   // por local, 7 días (0 = lunes)
  empleados: EmpleadoP[]                      // activos y no excluidos
  tipos: TipoP[]                              // activos
  existentes: TurnoExistenteP[]               // de la semana, en cualquier local
  prestar: boolean                            // fijos de otro local pueden cubrir huecos
}): ResultadoPlan {
  const { restaurantIds, necesidades, tipos, existentes, prestar } = entrada
  const empleados = entrada.empleados.filter(e => e.rol && PUESTO_DE[e.rol])
  const porId = new Map(entrada.empleados.map(e => [e.id, e]))

  // Estado de cada empleado en la semana
  const ocupado = new Map<number, Set<number>>()     // días con algún turno (también ausente)
  const usados = new Map<number, number>()           // minutos que cuentan para el contrato
  for (const e of entrada.empleados) { ocupado.set(e.id, new Set()); usados.set(e.id, 0) }
  for (const t of existentes) {
    if (!ocupado.has(t.empleadoId)) continue
    ocupado.get(t.empleadoId)!.add(t.dia)
    if (!t.ausente) usados.set(t.empleadoId, usados.get(t.empleadoId)! + minutos(t.horaInicio, t.horaFin))
  }

  // Huecos de partida: lo pedido menos lo que ya cubren los turnos existentes
  const faltan = new Map<string, number>()
  const k = (r: number, d: number, p: Puesto) => `${r}|${d}|${p}`
  const cubiertoPrevio: Record<number, Necesidad[]> = {}
  for (const r of restaurantIds) {
    cubiertoPrevio[r] = []
    for (let d = 0; d < 7; d++) {
      const nec = necesidades[r]?.[d] ?? vacia()
      const trab = existentes.filter(t => t.restaurantId === r && t.dia === d && !t.ausente)
        .map(t => porId.get(t.empleadoId)).filter((e): e is EmpleadoP => !!e)
      const cub = cubrirDia(trab, nec)
      cubiertoPrevio[r].push(cub)
      for (const p of PUESTOS) if (nec[p] > cub[p]) faltan.set(k(r, d, p), nec[p] - cub[p])
    }
  }

  // Turno que le toca a un empleado cubriendo un puesto en un local, que entre en sus horas
  const tiposDe = (e: EmpleadoP, p: Puesto, r: number) => {
    const aptos = tipos.filter(t => !t.excluirAutoPlanning && (t.restaurantId === null || t.restaurantId === r) &&
      (!t.tipoEmpleado || t.tipoEmpleado === e.tipo))
    const nota = (t: TipoP) => {
      if (t.rolEmpleado) return t.rolEmpleado === ROL_DE[p] ? 3 : -1
      const n = norm(t.nombre)
      if (PALABRAS[p].some(w => n.includes(w))) return 2
      return TODAS_PALABRAS.some(w => n.includes(w)) ? -1 : 1
    }
    const mejor = Math.max(-1, ...aptos.map(nota))
    return mejor < 0 ? [] : aptos.filter(t => nota(t) === mejor)
  }
  // Turnos posibles (inicio, fin, minutos) de un empleado cubriendo un puesto en un local, del más largo al más corto
  type Opcion = { horaInicio: string; horaFin: string; tipo: TipoP | null; m: number }
  const opcionesDe = (e: EmpleadoP, p: Puesto, r: number): Opcion[] => {
    const ts = tiposDe(e, p, r)
    if (!ts.length) {
      // Sin tipos de turno: de 16:00, 8 h o 4 h
      return [480, 240].map(m => {
        const fin = 16 * 60 + m
        return { horaInicio: '16:00', horaFin: `${String(Math.floor(fin / 60) % 24).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`, tipo: null, m }
      })
    }
    return ts.map(t => ({ horaInicio: t.horaInicio, horaFin: t.horaFin, tipo: t, m: minutos(t.horaInicio, t.horaFin) })).sort((a, b) => b.m - a.m)
  }
  const minimo = (e: EmpleadoP, p: Puesto, r: number) => Math.min(...opcionesDe(e, p, r).map(o => o.m))
  // Lo nuevo asignado a cada empleado (antes de repartir horas): puesto y local por día
  const nuevos = new Map<number, Array<{ r: number; d: number; p: Puesto; suplente: boolean; prestado: boolean }>>()
  for (const e of entrada.empleados) nuevos.set(e.id, [])
  const libre = (e: EmpleadoP, d: number) => !e.diasLibresFijos.includes(d) && !ocupado.get(e.id)!.has(d) && ocupado.get(e.id)!.size < 5

  // ── Quién trabaja qué día: flujo de costo mínimo ───────────────────────────────────────────
  // Fuente → empleado (un arco por cada día más que puede hacer, con costo creciente para repartir parejo
  // según su contrato) → empleado×día (capacidad 1: un turno por día) → hueco local×día×puesto (capacidad =
  // lo que falta) → sumidero. El flujo máximo es la menor cantidad posible de huecos; entre todas las formas
  // de lograrlo se elige la de menor costo: fijos del local (0), rotativos (100), suplentes del local (200),
  // suplentes rotativos (300), prestados (400), suplentes prestados (500).
  // `cerrados`: días que además no puede trabajar (los libres seguidos elegidos para él, ver más abajo).
  type Asignacion = { e: EmpleadoP; r: number; d: number; p: Puesto; suplente: boolean; prestado: boolean }
  const capacidad = (e: EmpleadoP) => {
    const puestosE = PUESTOS.filter(p => esExacto(e, p) || esSuplente(e, p))
    const corto = Math.min(...restaurantIds.flatMap(r => puestosE.map(p => minimo(e, p, r))))
    return Math.max(0, Math.min(5 - ocupado.get(e.id)!.size, Math.floor((e.horasSemanales * 60 - usados.get(e.id)!) / corto)))
  }
  function resolver(cerrados: Map<number, number[]>): { asig: Asignacion[]; flujo: number; costo: number } {
    type Arco = { a: number; cap: number; costo: number; rev: number }
    const red: Arco[][] = []
    const nodo = () => { red.push([]); return red.length - 1 }
    const arco = (de: number, a: number, cap: number, costo: number) => {
      red[de].push({ a, cap, costo, rev: red[a].length })
      red[a].push({ a: de, cap: 0, costo: -costo, rev: red[de].length - 1 })
      return red[de].length - 1
    }
    const fuente = nodo(), sumidero = nodo()
    const nodoHueco = new Map<string, number>()
    for (const [clave, n] of faltan) {
      if (n <= 0) continue
      // La 1ª persona que falta cuesta 0, la 2ª 60, la 3ª 120…: con los mismos huecos, mejor 2 de 3 cocineros
      // cada día que un día con 0. (No cambia cuántos huecos quedan: solo dónde.)
      const v = nodo(); nodoHueco.set(clave, v)
      for (let u = 0; u < n; u++) arco(v, sumidero, 1, u * 60)
    }
    const salidas: Array<Asignacion & { desde: number; i: number }> = []
    for (const e of empleados) {
      const cap = capacidad(e)
      if (cap <= 0) continue
      const puestosE = PUESTOS.filter(p => esExacto(e, p) || esSuplente(e, p))
      const vE = nodo()
      // k-ésimo día extra: cuesta más cuanto más lleva respecto de lo que da su contrato (máx. ~25, < 100)
      const diasContrato = Math.max(1, Math.min(5, e.horasSemanales / 8))
      for (let n = 0; n < cap; n++) arco(fuente, vE, 1, Math.round(20 * (ocupado.get(e.id)!.size + n + 1) / diasContrato))
      const cerr = cerrados.get(e.id) ?? []
      for (let d = 0; d < 7; d++) {
        if (!libre(e, d) || cerr.includes(d)) continue
        let vED = -1
        for (const r of restaurantIds) {
          const origen = e.restaurantId === r ? 0 : e.restaurantId === null ? 1 : 2
          if (origen === 2 && !prestar) continue
          for (const p of puestosE) {
            const v = nodoHueco.get(k(r, d, p))
            if (v === undefined) continue
            const suplente = !esExacto(e, p)
            const costo = origen === 2 ? (suplente ? 500 : 400) : (suplente ? 200 : 0) + origen * 100
            if (vED < 0) { vED = nodo(); arco(vE, vED, 1, 0) }
            salidas.push({ e, d, desde: vED, i: arco(vED, v, 1, costo), r, p, suplente, prestado: origen === 2 })
          }
        }
      }
    }
    // Caminos más baratos sucesivos (Bellman-Ford con cola) hasta que no quede ninguno
    let flujo = 0, costo = 0
    for (;;) {
      const dist = red.map(() => Infinity), previo: Array<[number, number] | null> = red.map(() => null), enCola = red.map(() => false)
      dist[fuente] = 0
      const cola = [fuente]; enCola[fuente] = true
      for (let c = 0; c < cola.length; c++) {
        const u = cola[c]; enCola[u] = false
        const sal = red[u]
        for (let i = 0; i < sal.length; i++) {
          const x = sal[i]
          if (x.cap > 0 && dist[u] + x.costo < dist[x.a]) {
            dist[x.a] = dist[u] + x.costo; previo[x.a] = [u, i]
            if (!enCola[x.a]) { enCola[x.a] = true; cola.push(x.a) }
          }
        }
      }
      if (dist[sumidero] === Infinity) break
      flujo++; costo += dist[sumidero]
      for (let v = sumidero; v !== fuente;) {
        const [u, i] = previo[v]!
        red[u][i].cap -= 1
        red[v][red[u][i].rev].cap += 1
        v = u
      }
    }
    return { asig: salidas.filter(x => red[x.desde][x.i].cap === 0), flujo, costo }
  }

  // ── Libres seguidos ────────────────────────────────────────────────────────────────────────
  // Cada uno con contrato de 30 h o más libra al menos dos días seguidos (de lunes-martes a domingo-lunes;
  // con un día fijo, el par que lo incluye; con dos fijos, esos). Se elige un par para cada uno donde menos
  // falta hace su puesto, y después se prueba cambiar el par de cada persona: el cambio se queda si deja
  // menos huecos o, con los mismos, mejores preferencias. Límite de 400 pruebas (unos 3 s), no de tiempo:
  // así la vista previa y lo que se guarda salen idénticos.
  const opcionesLibres = new Map<number, number[][]>()
  for (const e of empleados) {
    if (e.horasSemanales < 30 || capacidad(e) <= 0 || e.diasLibresFijos.length >= 2) continue
    const pares = Array.from({ length: 7 }, (_, d) => [d, (d + 1) % 7])
      .filter(par => e.diasLibresFijos.every(f => par.includes(f)))
      .filter(par => par.every(d => !ocupado.get(e.id)!.has(d)))
      .map(par => par.filter(d => !e.diasLibresFijos.includes(d)))
    if (pares.length) opcionesLibres.set(e.id, pares)
  }
  // Par inicial: donde la demanda de su puesto (en todo el grupo) menos la gente ya puesta es menor
  const presion = new Map<string, number>()
  for (const [clave, n] of faltan) {
    const [, ds, p] = clave.split('|')
    presion.set(`${p}|${ds}`, (presion.get(`${p}|${ds}`) ?? 0) + n)
  }
  const cerrados = new Map<number, number[]>()
  for (const e of [...empleados].filter(e => opcionesLibres.has(e.id)).sort((a, b) => opcionesLibres.get(a.id)!.length - opcionesLibres.get(b.id)!.length || a.id - b.id)) {
    const p = PUESTO_DE[e.rol!]
    const ops = opcionesLibres.get(e.id)!
    const mejor = ops.reduce((x, y) =>
      y.reduce((s, d) => s + (presion.get(`${p}|${d}`) ?? 0), 0) < x.reduce((s, d) => s + (presion.get(`${p}|${d}`) ?? 0), 0) ? y : x)
    cerrados.set(e.id, mejor)
    for (let d = 0; d < 7; d++) if (!mejor.includes(d) && libre(e, d)) presion.set(`${p}|${d}`, (presion.get(`${p}|${d}`) ?? 0) - 1)
  }
  let mejor = resolver(cerrados)
  let pruebas = 400
  for (let vuelta = 0, mejoro = true; mejoro && vuelta < 4 && pruebas > 0; vuelta++) {
    mejoro = false
    for (const [id, ops] of opcionesLibres) {
      if (pruebas <= 0) break
      const actual = cerrados.get(id)!
      for (const op of ops) {
        if (op.join() === actual.join()) continue
        cerrados.set(id, op)
        pruebas--
        const prueba = resolver(cerrados)
        if (prueba.flujo > mejor.flujo || (prueba.flujo === mejor.flujo && prueba.costo < mejor.costo)) { mejor = prueba; mejoro = true }
        else cerrados.set(id, actual)
        if (cerrados.get(id) !== actual) break
      }
    }
  }
  for (const x of mejor.asig) {
    nuevos.get(x.e.id)!.push({ r: x.r, d: x.d, p: x.p, suplente: x.suplente, prestado: x.prestado })
    ocupado.get(x.e.id)!.add(x.d)
    faltan.set(k(x.r, x.d, x.p), faltan.get(k(x.r, x.d, x.p))! - 1)
  }

  const turnos: TurnoPlan[] = []
  // Reparto de horas: cada día, el turno más largo que todavía deje sitio para el más corto en los días que quedan
  for (const e of entrada.empleados) {
    const dias = nuevos.get(e.id)!.sort((a, b) => a.d - b.d)
    let quedan = e.horasSemanales * 60 - usados.get(e.id)!
    dias.forEach((x, i) => {
      const reservar = dias.slice(i + 1).reduce((m, y) => m + minimo(e, y.p, y.r), 0)
      const ops = opcionesDe(e, x.p, x.r)
      const o = ops.find(o => o.m + reservar <= quedan) ?? ops[ops.length - 1]
      quedan -= o.m
      usados.set(e.id, usados.get(e.id)! + o.m)
      turnos.push({
        empleadoId: e.id, restaurantId: x.r, dia: x.d, horaInicio: o.horaInicio, horaFin: o.horaFin,
        tipoId: o.tipo?.id ?? null, tipoNombre: o.tipo?.nombre ?? null, puesto: x.p, suplente: x.suplente, prestado: x.prestado,
      })
    })
  }
  turnos.sort((a, b) => a.dia - b.dia || a.restaurantId - b.restaurantId || a.empleadoId - b.empleadoId)

  // Informe
  const huecos: Hueco[] = []
  for (const [clave, n] of faltan) {
    if (n <= 0) continue
    const [rs, ds, p] = clave.split('|')
    const r = Number(rs), d = Number(ds), puesto = p as Puesto
    const pueden = entrada.empleados.filter(e => esExacto(e, puesto) || esSuplente(e, puesto))
    const motivo = !pueden.length
      ? 'No hay nadie con este puesto (ni suplentes marcados)'
      : pueden.some(e => libre(e, d))
        ? 'Los que podrían no tienen horas de contrato libres'
        : 'Todos los que pueden ya trabajan ese día, libran por días fijos o ya hacen 5 días'
    huecos.push({ restaurantId: r, dia: d, puesto, faltan: n, motivo })
  }
  huecos.sort((a, b) => a.restaurantId - b.restaurantId || a.dia - b.dia || PUESTOS.indexOf(a.puesto) - PUESTOS.indexOf(b.puesto))

  const enAlcance = (e: EmpleadoP) => e.restaurantId === null || restaurantIds.includes(e.restaurantId)
  const faltanHoras: FaltanHoras[] = empleados
    .filter(e => enAlcance(e) && usados.get(e.id)! < e.horasSemanales * 60)
    .map(e => ({ empleadoId: e.id, nombre: e.nombre, asignadas: Math.round(usados.get(e.id)! / 6) / 10, contrato: e.horasSemanales }))
    .sort((a, b) => (b.contrato - b.asignadas) - (a.contrato - a.asignadas))

  const cobertura: ResultadoPlan['cobertura'] = {}
  for (const r of restaurantIds) {
    cobertura[r] = Array.from({ length: 7 }, (_, d) => {
      const needed = necesidades[r]?.[d] ?? vacia()
      const covered = { ...cubiertoPrevio[r][d] }
      for (const t of turnos) if (t.restaurantId === r && t.dia === d) covered[t.puesto]++
      return { needed, covered }
    })
  }

  return { turnos, huecos, faltanHoras, cobertura }
}
