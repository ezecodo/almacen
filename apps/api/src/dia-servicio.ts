// El día de servicio no cambia a medianoche: un turno de noche que sigue a las 00:30 sigue siendo
// "hoy" para las reservas. El día corta a las 06:00 (hora de Madrid).
export const CORTE_DIA_HORAS = 6

// Fecha (YYYY-MM-DD) y hora (HH:MM) de Madrid de un momento
export function ahoraEnMadrid(momento = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(momento).map(p => [p.type, p.value]))
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` }
}

// Día de servicio (YYYY-MM-DD) al que pertenece un momento
export function diaDeServicio(momento = new Date()) {
  return ahoraEnMadrid(new Date(momento.getTime() - CORTE_DIA_HORAS * 3600_000)).fecha
}
