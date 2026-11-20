import { currentProgramWeek, programDayDate, weekdayOfDate } from './strength-week-skips.js'
import { todayKeyIn } from '../time-zone.js'

function getDefaultWeekday(day) {
  return day?.defaultWeekday ?? day?.default_weekday ?? null
}

function sortDays(days) {
  return [...(days || [])].sort((a, b) => (a.order ?? a.order_index ?? 0) - (b.order ?? b.order_index ?? 0))
}

/**
 * Semana, día y fecha con los que se abre la pantalla Fuerza del atleta.
 *
 * Todo va con fechas sin hora. «Hoy» es el día en la zona del espacio: el
 * servidor va en UTC y, si se usara su hora, por la mañana se abría la semana
 * anterior y de madrugada el día de ayer.
 *
 * @param {object} input
 * @param {any} input.program
 * @param {any[]} input.days
 * @param {string | Date} [input.today] YYYY-MM-DD ya en la zona del espacio, o un instante (por defecto, ahora)
 * @param {string | null} [input.timeZone] zona del espacio (coaches.timezone); sin ella, Europe/Madrid
 */
export function resolveRoutineInitialSelection({ program, days, today, timeZone }) {
  const orderedDays = sortDays(days)
  const firstDay = orderedDays[0] ?? null
  const totalWeeks = program?.totalWeeks ?? program?.weeks
  const effectiveFrom = program?.effectiveFrom ?? program?.effective_from

  if (!effectiveFrom) {
    return {
      week: 1,
      dayId: firstDay?.id ?? '',
      sessionDate: null,
    }
  }

  const todayKey = typeof today === 'string' ? today.slice(0, 10) : todayKeyIn(timeZone, today ?? new Date())
  const week = currentProgramWeek(effectiveFrom, todayKey, totalWeeks)
  const todayWeekday = weekdayOfDate(todayKey)
  // Los días que el coach quitó esa semana no se preseleccionan.
  const skipped = new Set((program?.skippedDays ?? []).filter((skip) => skip.week === week).map((skip) => skip.dayId))
  const weekDays = orderedDays.filter((day) => !skipped.has(day.id))
  const selectedDay = weekDays.find((day) => getDefaultWeekday(day) === todayWeekday) ?? weekDays[0] ?? firstDay
  const selectedWeekday = getDefaultWeekday(selectedDay)

  return {
    week,
    dayId: selectedDay?.id ?? '',
    sessionDate: programDayDate(effectiveFrom, week, selectedWeekday),
  }
}
