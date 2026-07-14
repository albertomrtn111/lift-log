import 'server-only'

import { resolveHrBounds, type CustomZones, type HrZoneMethod } from '@/lib/training/zones'

import { createAdminClient } from '@/lib/supabase/admin'
import {
    buildEventTiming,
    formatContextSections,
    takeRecentChatMessages,
} from './nextia-context-format'

type NextIAMessage = {
    role: 'user' | 'assistant'
    content: string
    created_at: string
}

export type BuildNextIAAthleteContextInput = {
    coachId: string
    clientId: string
    recentMessages: NextIAMessage[]
    referenceDate?: string
}

function toLocalDateStr(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number) {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
}

function stringifyCompact(value: unknown, maxLength = 1200) {
    if (value == null) return ''
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function asNumber(value: unknown) {
    if (value == null || value === '') return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

function formatList(items: string[], emptyText: string) {
    const clean = items.map(item => item.trim()).filter(Boolean)
    if (clean.length === 0) return emptyText
    return clean.map(item => `- ${item}`).join('\n')
}

function formatGeneratedAthleteProfile(profile: any) {
    if (!profile) return 'Sin perfil IA del atleta generado.'

    const generated = profile.generated_profile_json || {}
    return [
        profile.generated_athlete_summary || generated.athlete_summary ? `Resumen: ${profile.generated_athlete_summary || generated.athlete_summary}` : '',
        profile.generated_goals_and_calendar || generated.goals_and_calendar ? `Objetivos/calendario: ${profile.generated_goals_and_calendar || generated.goals_and_calendar}` : '',
        profile.generated_health_and_constraints || generated.health_and_constraints ? `Salud/restricciones: ${profile.generated_health_and_constraints || generated.health_and_constraints}` : '',
        profile.generated_training_profile || generated.training_profile ? `Perfil entrenamiento: ${profile.generated_training_profile || generated.training_profile}` : '',
        profile.generated_nutrition_and_body_context || generated.nutrition_and_body_context ? `Nutricion/contexto corporal: ${profile.generated_nutrition_and_body_context || generated.nutrition_and_body_context}` : '',
        profile.generated_key_points_and_working_rules || generated.key_points_and_working_rules ? `Reglas de trabajo: ${profile.generated_key_points_and_working_rules || generated.key_points_and_working_rules}` : '',
    ].filter(Boolean).join('\n') || 'Perfil IA del atleta disponible pero sin resumen generado.'
}

function formatBaseline(baseline: any) {
    if (!baseline) return 'Sin datos base configurados.'

    const age = baseline.birth_date
        ? Math.floor((Date.now() - new Date(`${baseline.birth_date}T12:00:00`).getTime()) / (365.25 * 86400000))
        : null
    const sexLabel = baseline.sex === 'male' ? 'hombre' : baseline.sex === 'female' ? 'mujer' : null

    return [
        age ? `Edad: ${age} anos${sexLabel ? ` (${sexLabel})` : ''}` : '',
        baseline.height_cm ? `Altura: ${baseline.height_cm} cm` : '',
        baseline.reference_weight_kg ? `Peso de referencia: ${baseline.reference_weight_kg} kg${baseline.reference_weight_date ? ` (${baseline.reference_weight_date})` : ''}` : '',
        baseline.vo2max ? `VO2max: ${baseline.vo2max} ml/kg/min` : '',
        baseline.endurance_enabled === false ? 'Perfil de SOLO FUERZA: el coach ha desactivado el bloque de resistencia (no analizar zonas de FC/ritmo).' : '',
    ].filter(Boolean).join('\n') || 'Sin datos base configurados.'
}

function formatThresholds(thresholds: any) {
    if (!thresholds) return 'Sin umbrales configurados. Interpreta FC y ritmos con prudencia.'

    const formatPaceStr = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/km`
    const method = (thresholds.hr_zone_method ?? 'friel_lthr') as HrZoneMethod
    const common = {
        method,
        maxHr: thresholds.max_hr,
        restingHr: thresholds.resting_hr,
        custom: thresholds.custom_zones as CustomZones | null,
    }
    const runBounds = resolveHrBounds({ ...common, sport: 'run', lthr: thresholds.run_lthr })
    const bikeBounds = resolveHrBounds({ ...common, sport: 'bike', lthr: thresholds.bike_lthr })

    const boundsLine = (label: string, resolved: { bounds: number[]; source: string } | null) =>
        resolved
            ? `${label}: Z1 <${resolved.bounds[0]} · Z2 ${resolved.bounds[0]}-${resolved.bounds[1] - 1} · Z3 ${resolved.bounds[1]}-${resolved.bounds[2] - 1} · Z4 ${resolved.bounds[2]}-${resolved.bounds[3] - 1} · Z5 >=${resolved.bounds[3]} ppm${resolved.source === 'custom' ? ' (intervalos personalizados por el coach)' : ''}`
            : ''

    return [
        thresholds.max_hr ? `FC maxima: ${thresholds.max_hr} ppm` : '',
        thresholds.resting_hr ? `FC reposo: ${thresholds.resting_hr} ppm` : '',
        thresholds.run_lthr ? `LTHR carrera: ${thresholds.run_lthr} ppm` : '',
        boundsLine('Zonas FC carrera', runBounds),
        thresholds.run_threshold_pace_sec ? `Ritmo umbral carrera: ${formatPaceStr(thresholds.run_threshold_pace_sec)}` : '',
        thresholds.bike_lthr ? `LTHR ciclismo: ${thresholds.bike_lthr} ppm` : '',
        boundsLine('Zonas FC ciclismo', bikeBounds),
        thresholds.bike_ftp_watts ? `FTP ciclismo: ${thresholds.bike_ftp_watts} W` : '',
        thresholds.tested_at ? `Ultimo test: ${thresholds.tested_at}` : 'Sin fecha de test registrada',
    ].filter(Boolean).join('\n') || 'Sin umbrales configurados.'
}

function formatGeneratedCoachProfile(profile: any) {
    if (!profile) return 'Sin perfil IA del coach generado.'

    const methodology = profile.generated_methodology
        ? stringifyCompact(profile.generated_methodology, 1000)
        : ''
    const rules = profile.generated_master_rules
        ? stringifyCompact(profile.generated_master_rules, 1000)
        : ''

    return [
        profile.generated_profile_summary ? `Resumen coach: ${profile.generated_profile_summary}` : '',
        methodology ? `Metodologia: ${methodology}` : '',
        profile.generated_communication_style ? `Estilo comunicacion: ${profile.generated_communication_style}` : '',
        rules ? `Reglas maestras: ${rules}` : '',
    ].filter(Boolean).join('\n') || 'Perfil IA del coach disponible pero sin resumen generado.'
}

function formatEvents(events: any[], referenceDate: string) {
    return formatList(events.map(event => {
        const timing = buildEventTiming(referenceDate, event.event_date)
        return [
            `${event.title} (${event.event_type || 'evento'}, prioridad ${event.priority || 'b'})`,
            `fecha ${event.event_date}; ${timing.label}`,
            event.target ? `objetivo: ${event.target}` : '',
            event.location ? `ubicacion: ${event.location}` : '',
            event.notes ? `notas: ${event.notes}` : '',
        ].filter(Boolean).join(' | ')
    }), 'Sin eventos proximos planificados.')
}

function formatPayloadSummary(payload: unknown) {
    if (!payload || typeof payload !== 'object') return ''
    const entries = Object.entries(payload as Record<string, unknown>)
        .filter(([, value]) => value != null && value !== '')
        .slice(0, 12)
        .map(([key, value]) => `${key}: ${stringifyCompact(value, 220)}`)

    return entries.length > 0 ? `Campos check-in:\n${entries.map(entry => `- ${entry}`).join('\n')}` : ''
}

function formatLatestReview(checkin: any, review: any) {
    if (!checkin) return 'Sin check-in reciente.'

    return [
        `Fecha envio: ${checkin.submitted_at ? String(checkin.submitted_at).split('T')[0] : 'sin fecha'}`,
        `Periodo: ${checkin.period_start || '—'} -> ${checkin.period_end || '—'}`,
        checkin.weight_kg != null ? `Peso: ${checkin.weight_kg} kg` : '',
        checkin.weight_avg_kg != null ? `Peso medio: ${checkin.weight_avg_kg} kg` : '',
        checkin.steps_avg != null ? `Pasos medios: ${checkin.steps_avg}` : '',
        checkin.training_adherence_pct != null ? `Adherencia entrenamiento: ${checkin.training_adherence_pct}%` : '',
        checkin.nutrition_adherence_pct != null ? `Adherencia nutricion: ${checkin.nutrition_adherence_pct}%` : '',
        checkin.sleep_avg_h != null ? `Sueño medio: ${checkin.sleep_avg_h}h` : '',
        checkin.notes ? `Notas atleta: ${checkin.notes}` : '',
        review?.status ? `Estado revision: ${review.status}` : '',
        review?.ai_summary ? `Resumen IA revision: ${review.ai_summary}` : '',
        review?.analysis ? `Analisis revision: ${stringifyCompact(review.analysis, 1600)}` : '',
        review?.message_to_client ? `Feedback enviado: ${review.message_to_client}` : '',
        formatPayloadSummary(checkin.raw_payload),
    ].filter(Boolean).join('\n') || 'Check-in reciente sin datos utiles.'
}

function formatStrengthProgram(program: any, days: any[], exercises: any[], sets: any[]) {
    if (!program) return 'Sin programa activo de fuerza.'

    const exercisesByDay = new Map<string, any[]>()
    for (const exercise of exercises) {
        const list = exercisesByDay.get(exercise.day_id) || []
        list.push(exercise)
        exercisesByDay.set(exercise.day_id, list)
    }

    const setsByExercise = new Map<string, any[]>()
    for (const set of sets) {
        const list = setsByExercise.get(set.exercise_id) || []
        list.push(set)
        setsByExercise.set(set.exercise_id, list)
    }

    const totalWeeks = program.total_weeks ?? program.weeks ?? '—'
    const lines = [
        `Programa: ${program.name} (${totalWeeks} semanas, estado ${program.status}, desde ${program.effective_from || '—'})`,
    ]

    for (const day of days.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
        lines.push(`Dia: ${day.name}`)
        const dayExercises = (exercisesByDay.get(day.id) || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        for (const exercise of dayExercises) {
            const prescribed = [
                exercise.sets ? `${exercise.sets} series` : '',
                exercise.reps ? `${exercise.reps} reps` : '',
                exercise.rir != null ? `RIR ${exercise.rir}` : '',
                exercise.rest_seconds != null ? `descanso ${exercise.rest_seconds}s` : '',
                exercise.notes ? `notas ${exercise.notes}` : '',
            ].filter(Boolean).join(' · ')
            lines.push(`- ${exercise.exercise_name}${exercise.muscle_group ? ` [${exercise.muscle_group}]` : ''}: ${prescribed || 'sin pauta'}`)

            const weeklySets = (setsByExercise.get(exercise.id) || [])
                .sort((a, b) => (a.week_index ?? 0) - (b.week_index ?? 0) || (a.set_index ?? 0) - (b.set_index ?? 0))
                .slice(-24)
                .map(set => {
                    const parts = [
                        `S${set.week_index}`,
                        `set ${set.set_index}`,
                        set.weight_kg != null ? `${set.weight_kg}kg` : '',
                        set.reps != null ? `${set.reps} reps` : '',
                        set.rir != null ? `RIR ${set.rir}` : '',
                        set.completed ? 'completado' : '',
                        set.notes ? `notas ${set.notes}` : '',
                    ].filter(Boolean)
                    return parts.join(' · ')
                })
            if (weeklySets.length > 0) {
                lines.push(`  Progresion: ${weeklySets.join(' | ')}`)
            }
        }
    }

    return lines.slice(0, 180).join('\n')
}

function formatStrengthPlanning(strengthSessions: any[]) {
    return formatList(strengthSessions.map(session => {
        const day = session.training_days?.name || 'Sesion fuerza'
        const program = session.training_programs?.name || 'programa'
        const status = session.is_completed ? 'completada' : 'planificada/no completada'
        return `${session.scheduled_date}: ${day} (${program}) | ${status}`
    }), 'Sin sesiones de fuerza planificadas en las ultimas 4 semanas.')
}

function getCardioTitle(session: any) {
    return session.name || session.structure?.trainingType || session.training_type || session.activity_type || 'Cardio'
}

function formatCardio(cardioSessions: any[]) {
    return formatList(cardioSessions.map(session => {
        const planned = [
            session.target_distance_km != null ? `${session.target_distance_km} km plan` : '',
            session.target_duration_min != null ? `${session.target_duration_min} min plan` : '',
            session.target_pace ? `ritmo objetivo ${session.target_pace}` : '',
        ].filter(Boolean).join(', ') || 'sin objetivo cuantificado'
        const actual = [
            session.actual_distance_km != null ? `${session.actual_distance_km} km hechos` : '',
            session.actual_duration_min != null ? `${session.actual_duration_min} min hechos` : '',
            session.actual_avg_pace ? `ritmo medio ${session.actual_avg_pace}` : '',
            session.avg_heart_rate != null ? `FC media ${session.avg_heart_rate}` : '',
            session.max_heart_rate != null ? `FC max ${session.max_heart_rate}` : '',
            session.rpe != null ? `RPE ${session.rpe}` : '',
        ].filter(Boolean).join(', ') || 'sin registro realizado'
        const notes = [
            session.coach_notes || session.notes ? `notas coach: ${session.coach_notes || session.notes}` : '',
            session.feedback_notes ? `feedback atleta: ${session.feedback_notes}` : '',
        ].filter(Boolean).join(' | ')

        return `${session.scheduled_date}: ${getCardioTitle(session)} | plan: ${planned} | real: ${actual}${notes ? ` | ${notes}` : ''}`
    }), 'Sin cardio planificado en las ultimas 4 semanas.')
}

function formatRecentProgress(metrics: any[], dietLogs: any[], workoutLogs: any[]) {
    const metricLines = metrics.slice(-14).map(metric => {
        const parts = [
            metric.weight_kg != null ? `${metric.weight_kg}kg` : '',
            metric.steps != null ? `${metric.steps} pasos` : '',
            metric.sleep_h != null ? `${metric.sleep_h}h sueño` : '',
            metric.notes ? `notas ${metric.notes}` : '',
        ].filter(Boolean).join(', ')
        return parts ? `${metric.metric_date}: ${parts}` : ''
    }).filter(Boolean)

    const dietAverage = dietLogs.length > 0
        ? Math.round(dietLogs.reduce((sum, log) => sum + Number(log.adherence_pct || 0), 0) / dietLogs.length)
        : null
    const completedWorkouts = workoutLogs.filter(log => log.completed).length

    return [
        metricLines.length > 0 ? `Metricas recientes:\n${metricLines.map(line => `- ${line}`).join('\n')}` : '',
        dietAverage != null ? `Adherencia nutricional media 28d: ${dietAverage}% (${dietLogs.length} registros)` : '',
        workoutLogs.length > 0 ? `Entrenamientos marcados completados 28d: ${completedWorkouts}/${workoutLogs.length}` : '',
    ].filter(Boolean).join('\n') || 'Sin datos recientes de progreso en las ultimas 4 semanas.'
}

function formatRecentMessages(messages: NextIAMessage[]) {
    const recent = takeRecentChatMessages(messages, 12)
    return formatList(recent.map(message => {
        const speaker = message.role === 'assistant' ? 'NextIA' : 'Coach'
        return `${speaker}: ${message.content}`
    }), 'Sin historial previo en Chat NextIA.')
}

export async function buildNextIAAthleteContext({
    coachId,
    clientId,
    recentMessages,
    referenceDate = toLocalDateStr(new Date()),
}: BuildNextIAAthleteContextInput) {
    const admin = createAdminClient()
    const today = new Date(`${referenceDate}T12:00:00`)
    const fromDate = toLocalDateStr(addDays(today, -27))
    const futureDate = toLocalDateStr(addDays(today, 365))

    const { data: client } = await admin
        .from('clients')
        .select('id, full_name, email, status, coach_id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (!client) {
        throw new Error('No se encontro el atleta o no pertenece a este coach.')
    }

    const [
        athleteProfileResult,
        coachProfileResult,
        eventsResult,
        checkinsResult,
        activeProgramResult,
        cardioResult,
        metricsResult,
        dietResult,
        workoutResult,
        strengthScheduleResult,
        thresholdsResult,
        baselineResult,
    ] = await Promise.all([
        admin.from('athlete_ai_profiles').select('*').eq('coach_id', coachId).eq('client_id', clientId).maybeSingle(),
        admin.from('coach_ai_profiles').select('*').eq('coach_id', coachId).maybeSingle(),
        admin.from('client_events').select('title, event_date, event_type, priority, location, target, notes').eq('coach_id', coachId).eq('client_id', clientId).eq('status', 'planned').gte('event_date', referenceDate).lte('event_date', futureDate).order('event_date', { ascending: true }).limit(8),
        admin.from('checkins').select('id, submitted_at, period_start, period_end, weight_kg, weight_avg_kg, steps_avg, training_adherence_pct, nutrition_adherence_pct, sleep_avg_h, notes, raw_payload, reviews(status, ai_summary, analysis, message_to_client)').eq('coach_id', coachId).eq('client_id', clientId).eq('type', 'checkin').not('submitted_at', 'is', null).order('submitted_at', { ascending: false }).limit(1),
        admin.from('training_programs').select('*').eq('coach_id', coachId).eq('client_id', clientId).eq('status', 'active').order('created_at', { ascending: false }).limit(1),
        admin.from('cardio_sessions').select('id, scheduled_date, name, description, activity_type, training_type, target_distance_km, target_duration_min, target_pace, notes, structure, planned_structure, coach_notes, is_completed, actual_distance_km, actual_duration_min, actual_avg_pace, rpe, feedback_notes, avg_heart_rate, max_heart_rate').eq('coach_id', coachId).eq('client_id', clientId).gte('scheduled_date', fromDate).lte('scheduled_date', referenceDate).order('scheduled_date', { ascending: true }),
        admin.from('client_metrics').select('metric_date, weight_kg, steps, sleep_h, notes').eq('client_id', clientId).gte('metric_date', fromDate).lte('metric_date', referenceDate).order('metric_date', { ascending: true }),
        admin.from('diet_adherence_logs').select('log_date, adherence_pct').eq('client_id', clientId).gte('log_date', fromDate).lte('log_date', referenceDate).order('log_date', { ascending: true }),
        admin.from('workout_logs').select('workout_date, completed').eq('client_id', clientId).gte('workout_date', fromDate).lte('workout_date', referenceDate).order('workout_date', { ascending: true }),
        admin.from('scheduled_strength_sessions').select('scheduled_date, is_completed, training_days(name), training_programs(name)').eq('coach_id', coachId).eq('client_id', clientId).gte('scheduled_date', fromDate).lte('scheduled_date', referenceDate).order('scheduled_date', { ascending: true }),
        admin.from('athlete_thresholds').select('max_hr, resting_hr, run_lthr, run_threshold_pace_sec, bike_lthr, bike_ftp_watts, hr_zone_method, custom_zones, tested_at').eq('client_id', clientId).maybeSingle(),
        admin.from('athlete_baseline').select('birth_date, sex, height_cm, reference_weight_kg, reference_weight_date, vo2max, endurance_enabled').eq('client_id', clientId).maybeSingle(),
    ])

    const latestCheckin = checkinsResult.data?.[0] || null
    // La review llega anidada en la query de checkins (antes: roundtrip extra)
    const reviewResult = { data: (latestCheckin as any)?.reviews?.[0] ?? null }

    const activeProgram = activeProgramResult.data?.[0] || null
    let trainingDays: any[] = []
    let trainingExercises: any[] = []
    let trainingSets: any[] = []

    if (activeProgram) {
        // Una sola query anidada (antes eran 3 roundtrips secuenciales)
        const { data: nestedDays } = await admin
            .from('training_days')
            .select(`
                id, name, order_index,
                training_exercises (
                    id, day_id, exercise_name, muscle_group, order_index, sets, reps, rir, rest_seconds, notes,
                    training_exercise_sets ( exercise_id, week_index, set_index, weight_kg, reps, rir, completed, notes )
                )
            `)
            .eq('program_id', activeProgram.id)
            .order('order_index', { ascending: true })

        const sortByOrder = (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
        const sortSets = (a: any, b: any) =>
            (a.week_index ?? 0) - (b.week_index ?? 0) || (a.set_index ?? 0) - (b.set_index ?? 0)

        trainingDays = (nestedDays || []).map(({ training_exercises: _ex, ...day }: any) => day)
        trainingExercises = (nestedDays || [])
            .flatMap((day: any) => day.training_exercises || [])
            .sort(sortByOrder)
            .map(({ training_exercise_sets: _sets, ...exercise }: any) => exercise)
        trainingSets = (nestedDays || [])
            .flatMap((day: any) => day.training_exercises || [])
            .flatMap((exercise: any) => exercise.training_exercise_sets || [])
            .sort(sortSets)
    }

    return formatContextSections([
        {
            title: 'Atleta',
            content: `Nombre: ${client.full_name || client.email || 'Atleta'}\nEstado: ${client.status || 'sin estado'}`,
        },
        { title: 'Datos base del atleta', content: formatBaseline(baselineResult.data) },
        { title: 'Umbrales fisiologicos y zonas', content: formatThresholds(thresholdsResult.data) },
        { title: 'Perfil IA del atleta optimizado', content: formatGeneratedAthleteProfile(athleteProfileResult.data) },
        { title: 'Perfil IA del coach optimizado', content: formatGeneratedCoachProfile(coachProfileResult.data) },
        { title: 'Eventos proximos', content: formatEvents(eventsResult.data || [], referenceDate) },
        { title: 'Ultimo check-in y revision', content: formatLatestReview(latestCheckin, reviewResult.data) },
        { title: 'Programa activo de fuerza y progresion', content: formatStrengthProgram(activeProgram, trainingDays, trainingExercises, trainingSets) },
        { title: 'Planificacion fuerza ultimas 4 semanas', content: formatStrengthPlanning(strengthScheduleResult.data || []) },
        { title: 'Cardio ultimas 4 semanas', content: formatCardio(cardioResult.data || []) },
        { title: 'Datos relevantes de progreso', content: formatRecentProgress(metricsResult.data || [], dietResult.data || [], workoutResult.data || []) },
        { title: 'Ultimos mensajes Chat NextIA', content: formatRecentMessages(recentMessages) },
    ])
}
