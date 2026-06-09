const HEADER = [
  'Programa',
  'Día',
  'Ejercicio',
  'Semana',
  'Serie',
  'Peso (kg)',
  'Reps',
  'RIR',
  'Completada',
  'Notas',
  'Series prescritas',
  'Reps prescritas',
  'RIR prescrito',
]

function formatValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(value).replace('.', ',')
  }
  return String(value).replaceAll('"', '""')
}

function csvLine(values) {
  return values.map((value) => {
    const formatted = formatValue(value)
    return /[;\n"]/.test(formatted) ? `"${formatted}"` : formatted
  }).join(';')
}

function sortedEntries(record) {
  return Object.entries(record || {})
    .map(([week, sets]) => [Number(week), Array.isArray(sets) ? sets : []])
    .filter(([week]) => Number.isFinite(week))
    .sort(([a], [b]) => a - b)
}

export function buildTrainingProgressCsv(data) {
  const rows = [HEADER]
  const programName = data?.program?.name || 'Programa'

  for (const day of data?.days || []) {
    for (const exercise of day.exercises || []) {
      const weekEntries = sortedEntries(exercise.setsByWeek)
      if (weekEntries.length === 0) {
        rows.push([
          programName,
          day.name,
          exercise.name,
          '',
          '',
          '',
          '',
          '',
          '',
          'Sin registros',
          exercise.prescribedSets,
          exercise.prescribedReps,
          exercise.prescribedRir,
        ])
        continue
      }

      for (const [week, sets] of weekEntries) {
        if (sets.length === 0) continue
        for (const set of sets) {
          rows.push([
            programName,
            day.name,
            exercise.name,
            week,
            Number(set.setIndex ?? 0) + 1,
            set.weightKg,
            set.reps,
            set.rir,
            set.completed ? 'Sí' : 'No',
            set.notes,
            exercise.prescribedSets,
            exercise.prescribedReps,
            exercise.prescribedRir,
          ])
        }
      }
    }
  }

  return `\uFEFF${rows.map(csvLine).join('\n')}`
}

