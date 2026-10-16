/**
 * Datos de Lucía, la atleta de ejemplo: seis semanas cerradas de seguimiento
 * más la semana en curso. Lógica pura y determinista (testeada en scripts/).
 */

export const SAMPLE_WEEKS = 6

const DAY_MS = 24 * 60 * 60 * 1000

/** @param {string} isoDate @param {number} days */
export function addDays(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Lunes de la semana de una fecha YYYY-MM-DD */
export function mondayOf(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
    return addDays(isoDate, weekday === 0 ? -6 : 1 - weekday)
}

const round1 = value => Math.round(value * 10) / 10

/** Variación suave y repetible para que las gráficas no parezcan una recta */
const wobble = (index, amplitude) => Math.sin(index * 1.7) * amplitude + Math.cos(index * 0.6) * amplitude * 0.5

export const SAMPLE_PROGRAM = {
    name: 'Fuerza · 3 días (ejemplo)',
    weeks: 8,
    days: [
        {
            name: 'Día 1 · Pierna',
            default_weekday: 1,
            exercises: [
                { exercise_name: 'Sentadilla trasera con barra', sets: 4, reps: '6-8', rir: 2, rest_seconds: 150 },
                { exercise_name: 'Peso muerto rumano', sets: 3, reps: '8-10', rir: 2, rest_seconds: 120 },
                { exercise_name: 'Zancada búlgara con mancuernas', sets: 3, reps: '10', rir: 2, rest_seconds: 90 },
                { exercise_name: 'Hip thrust con barra', sets: 3, reps: '10-12', rir: 1, rest_seconds: 90 },
            ],
        },
        {
            name: 'Día 2 · Torso',
            default_weekday: 3,
            exercises: [
                { exercise_name: 'Press banca con barra', sets: 4, reps: '6-8', rir: 2, rest_seconds: 150 },
                { exercise_name: 'Remo con barra', sets: 4, reps: '8-10', rir: 2, rest_seconds: 120 },
                { exercise_name: 'Press militar con mancuernas', sets: 3, reps: '10', rir: 2, rest_seconds: 90 },
                { exercise_name: 'Jalón al pecho', sets: 3, reps: '10-12', rir: 1, rest_seconds: 90 },
            ],
        },
        {
            name: 'Día 3 · Full body',
            default_weekday: 5,
            exercises: [
                { exercise_name: 'Peso muerto convencional', sets: 3, reps: '5', rir: 2, rest_seconds: 180 },
                { exercise_name: 'Press inclinado con mancuernas', sets: 3, reps: '8-10', rir: 2, rest_seconds: 120 },
                { exercise_name: 'Prensa de piernas', sets: 3, reps: '12', rir: 2, rest_seconds: 90 },
                { exercise_name: 'Plancha frontal', sets: 3, reps: '40 s', rir: null, rest_seconds: 60 },
            ],
        },
    ],
}

export const SAMPLE_MACROS = {
    name: 'Déficit moderado',
    kcal: 1850,
    protein_g: 130,
    carbs_g: 195,
    fat_g: 60,
    steps: 9000,
    notes: 'Plan de ejemplo: déficit suave para bajar grasa manteniendo el rendimiento.',
}

/** Sesiones que Lucía se saltó (semana, día) para que la adherencia sea creíble */
const MISSED_SESSIONS = new Set(['3-2'])

const FEEDBACK = [
    'Buen arranque, Lucía. Mantenemos calorías y nos centramos en cumplir las tres sesiones.',
    'Semana sólida. El peso baja a buen ritmo; sube un poco los pasos los fines de semana.',
    'Te saltaste el torso del miércoles: lo movemos al jueves si te cuadra mejor. Por lo demás, perfecto.',
    'Muy bien con la dieta. Subimos 2,5 kg en sentadilla la próxima semana.',
    'Semana con más estrés y aun así cumpliste. Prioriza dormir 7 h y seguimos igual.',
]

/**
 * @param {string} today Fecha de hoy YYYY-MM-DD
 */
export function buildSampleAthleteData(today) {
    const currentMonday = mondayOf(today)
    const startDate = addDays(currentMonday, -7 * SAMPLE_WEEKS)
    const totalDays = 7 * SAMPLE_WEEKS + Math.max(0, daysBetween(currentMonday, today))

    // Peso diario: de 68,6 a ~66,4 kg con ruido de báscula
    const metrics = []
    const adherence = []
    for (let index = 0; index < totalDays; index++) {
        const date = addDays(startDate, index)
        metrics.push({
            metric_date: date,
            weight_kg: round1(68.6 - index * 0.05 + wobble(index, 0.25)),
            steps: Math.round(9000 + wobble(index + 3, 1400)),
            sleep_h: round1(7.1 + wobble(index + 7, 0.45)),
        })
        adherence.push({
            log_date: date,
            adherence_pct: Math.min(100, Math.max(60, Math.round(88 + wobble(index + 11, 9)))),
        })
    }

    // Sesiones de fuerza programadas: semanas cerradas y la actual
    const sessions = []
    for (let week = 1; week <= SAMPLE_WEEKS + 1; week++) {
        SAMPLE_PROGRAM.days.forEach((day, dayIndex) => {
            const date = addDays(startDate, (week - 1) * 7 + (day.default_weekday - 1))
            sessions.push({
                day_index: dayIndex,
                scheduled_date: date,
                is_completed: date < today && !MISSED_SESSIONS.has(`${week}-${dayIndex + 1}`),
            })
        })
    }

    // Revisiones semanales: cinco aprobadas y la de esta semana analizada y pendiente
    const checkins = []
    for (let week = 1; week <= SAMPLE_WEEKS; week++) {
        const periodStart = addDays(startDate, (week - 1) * 7)
        const periodEnd = addDays(periodStart, 6)
        const weekMetrics = metrics.filter(m => m.metric_date >= periodStart && m.metric_date <= periodEnd)
        const weekAdherence = adherence.filter(a => a.log_date >= periodStart && a.log_date <= periodEnd)
        const weekSessions = sessions.filter(s => s.scheduled_date >= periodStart && s.scheduled_date <= periodEnd)
        const isCurrent = week === SAMPLE_WEEKS

        checkins.push({
            week,
            period_start: periodStart,
            period_end: periodEnd,
            submitted_on: addDays(periodEnd, 1),
            weight_kg: weekMetrics[weekMetrics.length - 1].weight_kg,
            weight_avg_kg: round1(average(weekMetrics.map(m => m.weight_kg))),
            steps_avg: Math.round(average(weekMetrics.map(m => m.steps))),
            sleep_avg_h: round1(average(weekMetrics.map(m => m.sleep_h))),
            training_adherence_pct: Math.round((weekSessions.filter(s => s.is_completed).length / weekSessions.length) * 100),
            nutrition_adherence_pct: Math.round(average(weekAdherence.map(a => a.adherence_pct))),
            notes: isCurrent
                ? 'Semana buena. Me he notado con algo menos de energía el viernes, pero he hecho todo. El sábado cena fuera.'
                : week === 5 ? 'Mucho trabajo esta semana, he dormido poco.' : 'Todo bien, sin molestias.',
            reviewed: !isCurrent,
            message_to_client: isCurrent ? null : FEEDBACK[week - 1],
        })
    }

    return {
        startDate,
        nextCheckinDate: addDays(currentMonday, 7),
        metrics,
        adherence,
        sessions,
        checkins,
    }
}

/**
 * Análisis de la IA ya hecho para la revisión de esta semana
 * (mismo formato que genera analyze-checkin).
 */
export function buildSampleAnalysis(current, previous) {
    const delta = round1(current.weight_avg_kg - previous.weight_avg_kg)
    const deltaText = `${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')} kg`
    const weight = String(current.weight_avg_kg).replace('.', ',')
    return {
        overall_summary: `Semana muy completa: media de ${weight} kg (${deltaText}), ${current.training_adherence_pct} % de las sesiones y ${current.nutrition_adherence_pct} % de adherencia a la dieta. Comenta menos energía el viernes; nada preocupante con el sueño actual.`,
        body_metrics_summary: `Peso medio de ${weight} kg y ${current.steps_avg.toLocaleString('es-ES')} pasos de media.`,
        weight_trend_analysis: `La tendencia sigue a la baja a un ritmo de unos 0,3-0,4 kg por semana, dentro de lo previsto para un déficit moderado.`,
        training_analysis: 'Ha completado el bloque de la semana. Las cargas progresan en sentadilla y press banca sin molestias.',
        cardio_analysis: 'Pasos estables por encima del objetivo de 9.000 entre semana; el fin de semana baja algo.',
        nutrition_analysis: 'Buena adherencia. La cena fuera del sábado no afecta a la tendencia semanal.',
        adherence_analysis: 'Adherencia alta y constante en las seis semanas.',
        coach_recommendations: [
            'Mantener calorías y macros una semana más.',
            'Proponer un tentempié con hidratos antes de la sesión del viernes.',
        ],
        suggested_changes: ['Subir 2,5 kg en sentadilla y peso muerto rumano si el RIR se mantiene.'],
        warnings_or_flags: [],
    }
}

/** Mensaje de ejemplo que el coach envía al aprobar la revisión de Lucía */
export function buildSampleFeedback(coachFirstName) {
    const signature = coachFirstName ? `\n\n${coachFirstName}` : ''
    return `¡Gran semana, Lucía! El peso sigue bajando a buen ritmo y has cumplido todas las sesiones.\n\nMantenemos la dieta igual. El viernes, toma un plátano o unas tortitas de arroz una hora antes de entrenar para llegar con más energía. La semana que viene subimos 2,5 kg en sentadilla.${signature}`
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function daysBetween(from, to) {
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}
