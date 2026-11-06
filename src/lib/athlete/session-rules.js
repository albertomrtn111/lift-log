// Textos de las sesiones de sala en la app del atleta (probado con node --test).

/** «jueves, 6 nov» @param {string} date YYYY-MM-DD */
export function sessionDateLabel(date) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00.000Z`))
}
