function parseLocalDate(value) {
  return new Date(`${value}T12:00:00`)
}

function toLocalDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfLocalWeek(date) {
  const result = new Date(date)
  const mondayOffset = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - mondayOffset)
  return result
}

function getDefaultWeekday(day) {
  return day?.defaultWeekday ?? day?.default_weekday ?? null
}

function sortDays(days) {
  return [...(days || [])].sort((a, b) => (a.order ?? a.order_index ?? 0) - (b.order ?? b.order_index ?? 0))
}

function getSessionDateForWeek(programStart, week, weekday) {
  if (!weekday) return null
  const weekStart = startOfLocalWeek(programStart)
  weekStart.setDate(weekStart.getDate() + ((week - 1) * 7))
  const sessionDate = new Date(weekStart)
  sessionDate.setDate(weekStart.getDate() + weekday - 1)
  return toLocalDateStr(sessionDate)
}

export function resolveRoutineInitialSelection({ program, days, today = new Date() }) {
  const orderedDays = sortDays(days)
  const firstDay = orderedDays[0] ?? null
  const totalWeeks = Math.max(Number(program?.totalWeeks ?? program?.weeks ?? 1) || 1, 1)
  const effectiveFrom = program?.effectiveFrom ?? program?.effective_from

  if (!effectiveFrom) {
    return {
      week: 1,
      dayId: firstDay?.id ?? '',
      sessionDate: null,
    }
  }

  const programStart = parseLocalDate(effectiveFrom)
  const programWeekStart = startOfLocalWeek(programStart)
  const todayWeekStart = startOfLocalWeek(today)
  const weekDiff = Math.floor((todayWeekStart.getTime() - programWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  const week = Math.min(Math.max(weekDiff + 1, 1), totalWeeks)
  const todayWeekday = today.getDay() === 0 ? 7 : today.getDay()
  const selectedDay = orderedDays.find((day) => getDefaultWeekday(day) === todayWeekday) ?? firstDay
  const selectedWeekday = getDefaultWeekday(selectedDay)

  return {
    week,
    dayId: selectedDay?.id ?? '',
    sessionDate: getSessionDateForWeek(programStart, week, selectedWeekday),
  }
}
