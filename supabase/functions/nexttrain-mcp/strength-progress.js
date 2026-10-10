const DAY_MS = 86_400_000

function utcDay(value) {
  return Date.parse(`${value}T00:00:00Z`)
}

function addDays(value, count) {
  return new Date(utcDay(value) + count * DAY_MS).toISOString().slice(0, 10)
}

function monday(value) {
  const weekday = new Date(utcDay(value)).getUTCDay()
  return addDays(value, -((weekday + 6) % 7))
}

export function programWeekForDate(startDate, value) {
  if (!startDate || !value) return null
  return Math.floor((utcDay(value) - utcDay(monday(startDate))) / (7 * DAY_MS)) + 1
}

export function setEvidence(set) {
  if (set.completed === true) return 'confirmed'
  if (set.is_override === true && [set.weight_kg, set.reps, set.rir, set.notes].some((value) => value !== null && value !== undefined && value !== '')) {
    return 'recorded_unverified'
  }
  return null
}

export function findStrengthSession(program, trainingDay, weekIndex, sessions) {
  if (!program?.effective_from || !trainingDay?.id || !Number.isInteger(Number(weekIndex)) || Number(weekIndex) < 1) return null
  const matches = sessions.filter((session) => session.program_id === program.id && session.day_id === trainingDay.id
    && programWeekForDate(program.effective_from, session.scheduled_date) === Number(weekIndex))
  if (matches.length !== 1) return null
  return matches[0]
}

export function programProgress(program, days, sessions, asOfDate, confirmedWeekIndices = null) {
  const weeks = Number(program.total_weeks ?? program.weeks)
  const validWeeks = Number.isInteger(weeks) && weeks > 0 ? weeks : null
  const start = program.effective_from
  const estimatedEnd = start && validWeeks ? addDays(start, validWeeks * 7 - 1) : null
  const end = program.effective_to || estimatedEnd
  const started = Boolean(start && asOfDate >= start)
  const currentWeek = started && validWeeks ? Math.min(validWeeks, Math.max(1, programWeekForDate(start, asOfDate))) : 0
  const fullWeeksElapsed = started && validWeeks ? Math.min(validWeeks, Math.floor((utcDay(asOfDate) - utcDay(start)) / (7 * DAY_MS))) : 0
  const remainingDays = end && asOfDate <= end ? Math.floor((utcDay(end) - utcDay(asOfDate)) / DAY_MS) + 1 : 0
  const completed = sessions.filter((session) => session.is_completed === true)
  const executedWeeks = [...new Set(completed.map((session) => programWeekForDate(start, session.scheduled_date))
    .filter((index) => index !== null && index >= 1 && (!validWeeks || index <= validWeeks)))].sort((a, b) => a - b)
  const completedKeys = new Set(completed.map((session) => `${session.day_id}:${programWeekForDate(start, session.scheduled_date)}`))
  const recurringDays = days.filter((trainingDay) => Number.isInteger(Number(trainingDay.default_weekday))
    && Number(trainingDay.default_weekday) >= 1 && Number(trainingDay.default_weekday) <= 7)
  let totalExpected = 0
  let pastUnconfirmed = 0
  let futureExpected = 0
  if (validWeeks && start) {
    const firstMonday = monday(start)
    for (let week = 1; week <= validWeeks; week++) {
      for (const trainingDay of recurringDays) {
        const expectedDate = addDays(firstMonday, (week - 1) * 7 + Number(trainingDay.default_weekday) - 1)
        if (expectedDate < start || (end && expectedDate > end)) continue
        totalExpected++
        if (completedKeys.has(`${trainingDay.id}:${week}`)) continue
        if (expectedDate < asOfDate) pastUnconfirmed++
        else futureExpected++
      }
    }
  }
  const status = program.status === 'archived' ? 'archived'
    : !started ? 'upcoming' : end && asOfDate > end ? 'finished' : 'active'
  return {
    status, stored_status: program.status, as_of_date: asOfDate,
    start_date: start, estimated_end_date: end, end_date_source: program.effective_to ? 'explicit' : 'derived_from_duration',
    total_weeks: validWeeks, current_calendar_week_index: currentWeek, full_calendar_weeks_elapsed: fullWeeksElapsed,
    calendar_weeks_remaining_including_current: Math.ceil(remainingDays / 7),
    weeks_after_current: validWeeks ? Math.max(0, validWeeks - currentWeek) : null,
    weeks_with_completed_session_markers: executedWeeks.length, completed_session_week_indices: executedWeeks,
    latest_week_with_completed_session: executedWeeks.at(-1) ?? null,
    training_weeks_confirmed_by_sets: confirmedWeekIndices === null ? null : new Set(confirmedWeekIndices).size,
    confirmed_training_week_indices: confirmedWeekIndices === null ? null : [...new Set(confirmedWeekIndices)].sort((a, b) => a - b),
    scheduled_sessions: sessions.length, completed_sessions: completed.length,
    expected_sessions_from_current_template: validWeeks ? totalExpected : null,
    past_sessions_without_completion_record: pastUnconfirmed,
    future_expected_sessions: futureExpected,
    omitted_sessions: null,
    omitted_sessions_reason: 'No existe un estado de sesión omitida; una fecha pasada sin confirmación no demuestra que el atleta faltara.',
    deload_week_indices: null,
    deload_data_status: 'not_recorded_as_structured_program_data',
    possible_deload_from_name: /descarga|deload/i.test(program.name || ''),
  }
}

export function programTransitions(programs) {
  const chronological = [...programs].sort((a, b) => String(a.effective_from).localeCompare(String(b.effective_from))
    || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
  return chronological.flatMap((program, index) => {
    const previous = chronological.slice(0, index).reverse().find((item) => item.effective_from < program.effective_from)
    if (!previous) return []
    return [{
      from_program_id: previous.id, from_program_name: previous.name,
      to_program_id: program.id, to_program_name: program.name,
      transition_date: program.effective_from,
      date_source: 'next_program_start',
      note: 'Posible cambio de bloque inferido por cronología; no prueba que el programa anterior terminara ni registra modificaciones internas.',
    }]
  })
}
