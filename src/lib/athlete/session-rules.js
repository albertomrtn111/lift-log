// Textos de las sesiones de sala en la app del atleta (probado con node --test).

/** «jueves, 6 nov» @param {string} date YYYY-MM-DD */
export function sessionDateLabel(date) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00.000Z`))
}

/** «lunes, 9 nov, 18:30», en hora de Madrid. @param {string} startsAt */
export function appointmentLabel(startsAt) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(startsAt))
}
