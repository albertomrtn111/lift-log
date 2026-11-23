'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { roundToDecimals } from '@/lib/format/number'
import { hasRenderableCardioBlocks, resolveCardioPlanForDisplay } from '@/lib/cardio/structure'
import { buildSkipSet, isDaySkipped, mondayOfDate, programDayDate, programWeekOfDate } from '@/lib/training/strength-week-skips'
import { loadStrengthSkips } from '@/lib/training/strength-week-skips-data'
import { athleteNoteCells, isClientEditable, logFieldForColumnKey, mapRoutineColumns, nextExerciseLog } from '@/lib/training/exercise-notes'
import { todayKeyIn } from '@/lib/time-zone'
import { getCoachTimeZone } from '@/data/workspace-time-zone'
import { fetchAllPagesIn } from '@/lib/supabase/fetch-all-pages'

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type CalendarItemKind = 'strength' | 'cardio' | 'rest'

export interface CalendarItem {
    id: string
    kind: CalendarItemKind
    date: string          // YYYY-MM-DD
    title: string
    subtitle?: string
    isCompleted: boolean
    // Strength-specific
    programId?: string
    dayId?: string
    programName?: string
    weekIndex?: number
    // Cardio-specific
    cardioSessionId?: string
    activityType?: string
    trainingType?: string
    description?: string // Added
    targetDistanceKm?: number
    targetDurationMin?: number
    targetPace?: string
    coachNotes?: string
    plannedStructure?: any  // jsonb
    // Actual results (filled by client)
    actualDistanceKm?: number
    actualDurationMin?: number
    actualAvgPace?: string
    rpe?: number
    feedbackNotes?: string
    avgHeartRate?: number
    maxHeartRate?: number
}

// ------------------------------------------------------------------
// Resolve auth.uid() → clients.id
// ------------------------------------------------------------------

export async function getClientId(userId: string): Promise<string | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('clients')
        .select('id, email, status') // Added email/status for debug
        .eq('user_id', userId)
        .eq('status', 'active') // Ensure active
        .maybeSingle()

    if (error) {
        console.error('[getClientId] Error:', error)
        return null
    }
    if (!data) {
        console.warn('[getClientId] No active client found for user:', userId)

        // Debug: check if client exists but inactive or unlinked
        const { data: anyClient } = await supabase.from('clients').select('id, status').eq('user_id', userId)
        console.warn('[getClientId] Debug check for any client:', anyClient)

        return null
    }
    return data.id
}

// ------------------------------------------------------------------
// Get weekly schedule for the authenticated client
// ------------------------------------------------------------------

export async function getClientWeeklySchedule(
    clientId: string,
    weekStart: string,
    weekEnd: string
): Promise<CalendarItem[]> {
    const supabase = await createClient()

    const toDateStr = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }

    // Semana del programa de una fecha (con fechas sin hora, como la pantalla Fuerza).
    const getProgramWeekIndex = (dateStr: string, effectiveFrom?: string | null, totalWeeks?: number | null) => {
        const weekIndex = programWeekOfDate(effectiveFrom, dateStr)
        if (!weekIndex) return undefined
        if (totalWeeks && weekIndex > totalWeeks) return undefined
        return weekIndex
    }

    const startStr = weekStart
    const endStr = weekEnd

    // ----- 1. Virtual strength sessions from active program -----
    const strengthItems: CalendarItem[] = []

    const { data: programsArr } = await supabase
        .from('training_programs')
        .select(`
            id, name, weeks, effective_from,
            training_days ( id, name, order_index, default_weekday )
        `)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10)

    const activeProgram = (programsArr || []).find((p: any) =>
        p.training_days?.some((d: any) => d.default_weekday != null)
    ) || null

    // Días que el coach quitó en una semana concreta: esa semana no se muestran.
    const skipSet = buildSkipSet(await loadStrengthSkips(supabase, clientId))

    if (activeProgram && activeProgram.training_days) {
        const totalWeeks = activeProgram.weeks || 4

        for (const day of activeProgram.training_days as any[]) {
            if (!day.default_weekday) continue

            for (let week = 0; week < totalWeeks; week++) {
                // Fecha del día en esa semana del programa (lunes a domingo), sin hora.
                const sessionDateStr = programDayDate(activeProgram.effective_from, week + 1, day.default_weekday)

                if (sessionDateStr && sessionDateStr >= startStr && sessionDateStr <= endStr && !isDaySkipped(skipSet, activeProgram.id, day.id, week + 1)) {
                    strengthItems.push({
                        id: `virtual-${activeProgram.id}-${day.id}-w${week}`,
                        kind: 'strength',
                        date: sessionDateStr,
                        title: day.name,
                        subtitle: activeProgram.name,
                        isCompleted: false,
                        programId: activeProgram.id,
                        dayId: day.id,
                        programName: activeProgram.name,
                        weekIndex: week + 1,
                    })
                }
            }
        }
    }

    // ----- 2. Real scheduled strength sessions -----
    const { data: realStrength, error: realStrengthError } = await supabase
        .from('scheduled_strength_sessions')
        .select('id, program_id, day_id, scheduled_date, is_completed')
        .eq('client_id', clientId)
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr)

    const realStrengthItems: CalendarItem[] = []
    if (realStrength && realStrength.length > 0) {
        const dayIds = [...new Set(realStrength.map((s: any) => s.day_id))]
        const programIds = [...new Set(realStrength.map((s: any) => s.program_id))]

        const { data: daysData } = await supabase
            .from('training_days')
            .select('id, name, order_index')
            .in('id', dayIds)

        const { data: programsData } = await supabase
            .from('training_programs')
            .select('id, name, effective_from, weeks')
            .in('id', programIds)

        const daysMap = new Map((daysData || []).map((d: any) => [d.id, d]))
        const programsMap = new Map((programsData || []).map((p: any) => [p.id, p]))

        for (const s of realStrength as any[]) {
            const dayInfo = daysMap.get(s.day_id)
            const programInfo = programsMap.get(s.program_id) as any
            // Quitado por el coach esa semana (salvo que ya lo hubiera hecho).
            if (!s.is_completed && isDaySkipped(skipSet, s.program_id, s.day_id, programWeekOfDate(programInfo?.effective_from, s.scheduled_date))) continue
            realStrengthItems.push({
                id: s.id,
                kind: 'strength',
                date: s.scheduled_date,
                title: dayInfo?.name || 'Día',
                subtitle: programInfo?.name || 'Programa',
                isCompleted: s.is_completed ?? false,
                programId: s.program_id,
                dayId: s.day_id,
                programName: programInfo?.name,
                weekIndex: getProgramWeekIndex(s.scheduled_date, programInfo?.effective_from, programInfo?.weeks),
            })
        }
    }

    // Dedup: una sesión guardada sustituye al día de plantilla de su misma semana
    // (no de todo el rango: en la vista de mes, mover un día no lo borra de las demás semanas).
    const realDayWeeks = new Set((realStrength || []).map((r: any) => `${r.day_id}:${mondayOfDate(r.scheduled_date)}`))
    const dedupedVirtual = strengthItems.filter(v => !realDayWeeks.has(`${v.dayId}:${mondayOfDate(v.date)}`))
    const allStrength = [...dedupedVirtual, ...realStrengthItems]

    // ----- 3. Cardio sessions -----
    const { data: cardioData, error: cardioError } = await supabase
        .from('cardio_sessions')
        .select(`
            id, scheduled_date, activity_type, training_type, name, description,
            target_distance_km, target_duration_min, target_pace,
            structure, notes, planned_structure, coach_notes, is_completed,
            actual_distance_km, actual_duration_min, actual_avg_pace,
            rpe, feedback_notes, avg_heart_rate, max_heart_rate
        `)
        .eq('client_id', clientId)
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr)

    const cardioItems: CalendarItem[] = (cardioData || []).map((c: any) => {
        const plannedStructure = resolveCardioPlanForDisplay(c)
        const hasStructuredPlan = hasRenderableCardioBlocks(plannedStructure)

        return {
            id: c.id,
            kind: 'cardio' as const,
            date: c.scheduled_date,
            title: c.name || c.structure?.trainingType || c.training_type || c.activity_type || 'Cardio',
            subtitle: buildCardioSubtitle(c),
            isCompleted: c.is_completed ?? false,
            cardioSessionId: c.id,
            activityType: c.activity_type,
            trainingType: c.structure?.trainingType || c.training_type || undefined,
            description: hasStructuredPlan ? undefined : c.description || c.structure?.description || c.planned_structure?.description,
            targetDistanceKm: c.target_distance_km ? Number(c.target_distance_km) : undefined,
            targetDurationMin: c.target_duration_min ? Number(c.target_duration_min) : undefined,
            targetPace: c.target_pace,
            coachNotes: c.coach_notes || c.notes, // Priority: coach_notes > notes
            plannedStructure,
            actualDistanceKm: c.actual_distance_km ? Number(c.actual_distance_km) : undefined,
            actualDurationMin: c.actual_duration_min ? Number(c.actual_duration_min) : undefined,
            actualAvgPace: c.actual_avg_pace,
            rpe: c.rpe,
            feedbackNotes: c.feedback_notes,
            avgHeartRate: c.avg_heart_rate ? Number(c.avg_heart_rate) : undefined,
            maxHeartRate: c.max_heart_rate ? Number(c.max_heart_rate) : undefined,
        }
    })

    // ----- 4. Combine, sort by date -----
    const allItems = [...allStrength, ...cardioItems].sort(
        (a, b) => a.date.localeCompare(b.date)
    )

    // ----- 5. Fill rest days -----
    const result: CalendarItem[] = []
    const current = new Date(weekStart + 'T12:00:00')
    const end = new Date(weekEnd + 'T12:00:00')

    while (current <= end) {
        const dateStr = toDateStr(current)
        const daySessions = allItems.filter(i => i.date === dateStr)

        if (daySessions.length === 0) {
            result.push({
                id: `rest-${dateStr}`,
                kind: 'rest',
                date: dateStr,
                title: 'Descanso',
                isCompleted: false,
            })
        } else {
            result.push(...daySessions)
        }
        current.setDate(current.getDate() + 1)
    }

    return result
}

// ------------------------------------------------------------------
// Save session log (client fills results for a cardio session)
// ------------------------------------------------------------------

export async function saveCardioSessionLog(
    sessionId: string,
    data: {
        actualDistanceKm?: number
        actualDurationMin?: number
        actualAvgPace?: string
        rpe?: number
        feedbackNotes?: string
        avgHeartRate?: number
        maxHeartRate?: number
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { data: updated, error } = await supabase
        .from('cardio_sessions')
        .update({
            actual_distance_km: roundToDecimals(data.actualDistanceKm) ?? null,
            actual_duration_min: roundToDecimals(data.actualDurationMin) ?? null,
            actual_avg_pace: data.actualAvgPace ?? null,
            rpe: data.rpe ?? null,
            feedback_notes: data.feedbackNotes ?? null,
            avg_heart_rate: data.avgHeartRate ?? null,
            max_heart_rate: data.maxHeartRate ?? null,
            is_completed: true,
            performed_date: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select('id')

    if (error) {
        console.error('[saveCardioSessionLog]', error.message)
        return { success: false, error: error.message }
    }
    // Sin permiso (RLS) el update no da error: no cambia nada y la ficha diría «Guardado»
    if (!updated || updated.length === 0) {
        console.error('[saveCardioSessionLog] No row updated for session', sessionId)
        return { success: false, error: 'Session not updated' }
    }
    return { success: true }
}

// ------------------------------------------------------------------
// Mark a strength session as completed
// ------------------------------------------------------------------

export async function markStrengthSessionCompleted(
    sessionId: string,
    isVirtual: boolean,
    clientId: string,
    programId?: string,
    dayId?: string,
    date?: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    if (isVirtual && programId && dayId && date) {
        // Materialize the virtual session first
        const { data: clientData } = await supabase
            .from('clients')
            .select('coach_id')
            .eq('id', clientId)
            .single()

        if (!clientData?.coach_id) {
            return { success: false, error: 'Coach not found' }
        }

        const { error } = await supabase
            .from('scheduled_strength_sessions')
            .insert({
                client_id: clientId,
                coach_id: clientData.coach_id,
                program_id: programId,
                day_id: dayId,
                scheduled_date: date,
                is_completed: true,
            })

        if (error) return { success: false, error: error.message }
        revalidatePath('/planning')
        return { success: true }
    }

    // Real session — just update
    const { error } = await supabase
        .from('scheduled_strength_sessions')
        .update({ is_completed: true })
        .eq('id', sessionId)

    if (error) return { success: false, error: error.message }
    revalidatePath('/planning')
    return { success: true }
}

/**
 * Marca automáticamente una sesión de fuerza como completada
 * cuando el cliente registra cualquier ejercicio del día.
 * Si ya existe una sesión programada para la fecha calculada la actualiza;
 * si no existe (sesión virtual) la crea.
 */
export async function autoMarkStrengthDayComplete(
    clientId: string,
    programId: string,
    dayId: string,
    scheduledDate?: string,
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'Unauthorized' }
    }

    const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('id', clientId)
        .eq('status', 'active')
        .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle()

    if (clientError || !clientData?.coach_id) {
        const message = clientError?.message || 'Client not found for authenticated user'
        console.error('[autoMarkStrengthDayComplete] client authorization failed:', message)
        return { success: false, error: message }
    }

    // Sin fecha (día sin día de la semana fijo): hoy en la zona del espacio, no en UTC.
    const sessionDate = scheduledDate || todayKeyIn(await getCoachTimeZone(clientData.coach_id))

    const admin = createAdminClient()

    // Un día que el coach quitó esa semana no se da por hecho (en la app no se muestra).
    const { data: programRow } = await admin
        .from('training_programs')
        .select('effective_from')
        .eq('id', programId)
        .eq('client_id', clientId)
        .maybeSingle()
    const sessionWeek = programWeekOfDate(programRow?.effective_from, sessionDate)
    if (sessionWeek) {
        const { data: skip } = await admin
            .from('strength_day_week_skips')
            .select('id')
            .eq('program_id', programId)
            .eq('day_id', dayId)
            .eq('week_index', sessionWeek)
            .maybeSingle()
        if (skip) return { success: false, error: 'Day removed by the coach for this week' }
    }

    const { data: updatedSessions, error: updateError } = await admin
        .from('scheduled_strength_sessions')
        .update({
            is_completed: true,
            updated_at: new Date().toISOString(),
        })
        .eq('client_id', clientId)
        .eq('program_id', programId)
        .eq('day_id', dayId)
        .eq('scheduled_date', sessionDate)
        .select('id')

    if (updateError) {
        console.error('[autoMarkStrengthDayComplete] update failed:', updateError.message)
        return { success: false, error: updateError.message }
    }

    if (updatedSessions && updatedSessions.length > 0) {
        revalidatePath('/planning')
        return { success: true }
    }

    const { error: insertError } = await admin
        .from('scheduled_strength_sessions')
        .insert({
            client_id: clientId,
            coach_id: clientData.coach_id,
            program_id: programId,
            day_id: dayId,
            scheduled_date: sessionDate,
            is_completed: true,
        })

    if (insertError) {
        console.error('[autoMarkStrengthDayComplete] insert failed:', insertError.message)
        return { success: false, error: insertError.message }
    }

    revalidatePath('/planning')
    return { success: true }
}

// ------------------------------------------------------------------
// Get active training program with days/columns/exercises/cells
// ------------------------------------------------------------------

export async function getActiveClientProgram(clientId: string, programId?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('training_programs')
        .select(`
            id, name, weeks, effective_from, effective_to,
            training_days (
                id, name, order_index, default_weekday
            )
        `)
        .eq('client_id', clientId)

    if (programId) {
        query = query.eq('id', programId)
    } else {
        query = query.eq('status', 'active').order('created_at', { ascending: false })
    }

    const { data: programs } = await query.limit(1)

    const program = programs?.[0] || null
    if (!program) return null

    // Sort days by order_index
    const days = ((program.training_days as any[]) || []).sort(
        (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
    )

    // Fetch columns for this program
    const { data: columns } = await supabase
        .from('training_columns')
        .select('id, key, label, data_type, scope, editable_by, order_index')
        .eq('program_id', program.id)
        .order('order_index', { ascending: true })

    // Fetch exercises for all days
    const dayIds = days.map((d: any) => d.id)
    let exercises: any[] = []
    if (dayIds.length > 0) {
        const { data: exercisesData, error: exercisesError } = await supabase
            .from('training_exercises')
            .select('id, day_id, exercise_name, order_index, sets, reps, rir, rest_seconds, notes') // Correct columns
            .in('day_id', dayIds)
            .order('order_index', { ascending: true }) // Correct order column

        if (exercisesError) {
            console.error('[getActiveClientProgram] Exercises Error:', exercisesError)
        }
        exercises = exercisesData || []
    }

    // Fetch logs (instead of cells) for all exercises
    const exerciseIds = exercises.map((e: any) => e.id)
    let logs: any[] = []

    // Fetch exercise sets (new per-set tracking)
    let exerciseSets: any[] = []
    if (exerciseIds.length > 0) {
        // Por páginas: en programas largos pasan de 1.000 series (NXT-153).
        const { data: setsData, error: setsError } = await fetchAllPagesIn(exerciseIds, (ids, from, to) =>
            supabase
                .from('training_exercise_sets')
                .select('*')
                .in('exercise_id', ids)
                .order('set_index', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to)
        )
        if (setsError) console.error('[getActiveClientProgram] Sets Error:', setsError)
        exerciseSets = (setsData || []).sort((a: any, b: any) => (a.set_index ?? 0) - (b.set_index ?? 0))
    }

    if (exerciseIds.length > 0) {
        // clientId ya es el del atleta conectado (page.tsx); la RLS solo deja leer los suyos.
        const { data: logsData, error: logsError } = await fetchAllPagesIn(exerciseIds, (ids, from, to) =>
            supabase
                .from('training_exercise_logs')
                .select('id, exercise_id, week_index, sets, notes')
                .eq('client_id', clientId)
                .in('exercise_id', ids)
                .order('id', { ascending: true })
                .range(from, to)
        )
        if (logsError) console.error('[getActiveClientProgram] Logs Error:', logsError)
        logs = logsData || []
    }

    // Map logs to "virtual" cells for frontend compatibility
    // Need mapping of Column Key -> Column ID
    // columns array has { id, key }
    const colMap: Record<string, string> = {};
    (columns || []).forEach((c: any) => {
        if (c.key) colMap[c.key] = c.id;
    });

    // Create virtual cells
    let cells: any[] = [];
    logs.forEach((log: any) => {
        const set1 = Array.isArray(log.sets) && log.sets.length > 0 ? log.sets[0] : {};

        // Map Weight (c7)
        if (colMap['c7'] && set1.weight !== undefined && set1.weight !== null) {
            cells.push({
                id: `log-${log.id}-c7`, // Virtual ID
                exercise_id: log.exercise_id,
                column_id: colMap['c7'],
                week_index: log.week_index,
                value: set1.weight.toString()
            });
        }
        // Map Reps (c8)
        if (colMap['c8'] && set1.reps !== undefined && set1.reps !== null) {
            cells.push({
                id: `log-${log.id}-c8`,
                exercise_id: log.exercise_id,
                column_id: colMap['c8'],
                week_index: log.week_index,
                value: set1.reps.toString()
            });
        }
        // Map RIR (c9)
        if (colMap['c9'] && set1.rir !== undefined && set1.rir !== null) {
            cells.push({
                id: `log-${log.id}-c9`,
                exercise_id: log.exercise_id,
                column_id: colMap['c9'],
                week_index: log.week_index,
                value: set1.rir.toString()
            });
        }
    });
    // Nota del atleta de cada semana (log.notes), en su columna «Notas» ('notes' o 'c10')
    cells.push(...athleteNoteCells(columns || [], logs))

    // 'notes' (editable_by 'both') también es del atleta; añade 'c1' y las indicaciones del coach
    const mappedColumns = mapRoutineColumns(columns || [])

    // Días que el coach quitó en una semana: la pantalla Fuerza no los muestra esa semana.
    const skipRows = await loadStrengthSkips(supabase, clientId, [program.id])

    return {
        program: {
            id: program.id,
            name: program.name,
            totalWeeks: program.weeks || 4,
            effectiveFrom: program.effective_from,
            skippedDays: skipRows.map((row) => ({ dayId: row.day_id, week: row.week_index })),
        },
        days: days.map((d: any) => ({
            id: d.id,
            name: d.name,
            order: d.order_index,
            default_weekday: d.default_weekday,
            defaultWeekday: d.default_weekday ?? null,
        })),
        columns: mappedColumns,
        exercises: exercises.map((e: any) => ({
            id: e.id,
            dayId: e.day_id,
            name: e.exercise_name || 'Ejercicio', // Map exercise_name -> name with fallback
            order: e.order_index, // Map order_index -> order
            sets: e.sets,
            reps: e.reps,
            rir: e.rir,
            restSeconds: e.rest_seconds, // Map rest_seconds -> restSeconds
            notes: e.notes,
        })),
        cells: cells.map((c: any) => ({
            id: c.id,
            exerciseId: c.exercise_id,
            columnId: c.column_id,
            weekNumber: c.week_index,
            value: c.value,
        })),
        sets: exerciseSets.map((s: any) => ({
            id: s.id,
            exerciseId: s.exercise_id,
            weekNumber: s.week_index,
            setIndex: s.set_index,
            weightKg: s.weight_kg,
            reps: s.reps,
            rir: s.rir,
            completed: s.completed,
            isOverride: s.is_override ?? false,
            notes: s.notes,
        })),
    }
}

// ------------------------------------------------------------------
// Save a training cell value (client fills weight/reps/notes)
// ------------------------------------------------------------------

export async function saveTrainingCell(
    exerciseId: string,
    columnId: string,
    weekNumber: number,
    value: string,
    existingCellId?: string // This is ignored now for logs
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Get real client ID
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    if (!client) return { success: false, error: 'Client not found' }
    const clientId = client.id;

    // 1. Get Column Key to know what field to update
    const { data: col } = await supabase
        .from('training_columns')
        .select('key, editable_by')
        .eq('id', columnId)
        .maybeSingle();

    if (!col || !col.key) return { success: false, error: 'Invalid column' }
    if (!isClientEditable(col.editable_by)) return { success: false, error: 'Column not editable by the athlete' }

    // c7=peso, c8=reps, c9=RIR (serie 1, programas antiguos); 'notes' o c10 = nota del atleta
    const field = logFieldForColumnKey(col.key)
    if (!field) return { success: false, error: 'Not a loggable column' }

    // 2. Fetch Context (Program, Day...)
    // We need program_id, coach_id, day_id
    const { data: exercise } = await supabase
        .from('training_exercises')
        .select(`
            day_id,
            training_days (
                program_id,
                training_programs (coach_id)
            )
        `)
        .eq('id', exerciseId)
        .single();

    if (!exercise) return { success: false, error: 'Exercise not found' }

    const dayId = exercise.day_id;
    // @ts-ignore
    const programId = exercise.training_days?.program_id;
    // @ts-ignore
    const coachId = exercise.training_days?.training_programs?.coach_id;

    // 3. Fetch Existing Log
    const { data: existingLog, error: existingError } = await supabase
        .from('training_exercise_logs')
        .select('id, sets, notes')
        .eq('client_id', clientId)
        .eq('exercise_id', exerciseId)
        .eq('week_index', weekNumber)
        .maybeSingle();

    if (existingError) {
        console.error('Load Log Error:', existingError);
        return { success: false, error: existingError.message }
    }

    // 4. Update Value (la nota no crea una serie vacía)
    const next = nextExerciseLog(existingLog, field, value)

    // Sin nota ni valores no se guarda una fila vacía (contaría como resultado del atleta)
    if (next.empty) {
        if (!existingLog) return { success: true }
        const { error: deleteError } = await supabase
            .from('training_exercise_logs')
            .delete()
            .eq('id', existingLog.id)
            .eq('client_id', clientId)
        if (deleteError) {
            console.error('Delete Log Error:', deleteError);
            return { success: false, error: deleteError.message }
        }
        return { success: true }
    }

    if (!programId || !dayId || !coachId) return { success: false, error: 'Program not found' }

    // 5. Upsert
    const payload = {
        client_id: clientId,
        exercise_id: exerciseId,
        week_index: weekNumber,
        program_id: programId,
        day_id: dayId,
        coach_id: coachId,
        sets: next.sets,
        notes: next.notes,
        updated_at: new Date().toISOString()
    }

    // Using upsert on unique constraint (client, exercise, week)
    const { error } = await supabase
        .from('training_exercise_logs')
        .upsert(payload, { onConflict: 'client_id,exercise_id,week_index' })

    if (error) {
        console.error('Save Log Error:', error);
        return { success: false, error: error.message }
    }

    return { success: true };
}


// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function buildCardioSubtitle(c: any): string {
    const parts: string[] = []
    if (c.target_distance_km) parts.push(`${Number(c.target_distance_km)} km`)
    if (c.target_duration_min) parts.push(`${Number(c.target_duration_min)} min`)
    if (c.target_pace) parts.push(c.target_pace)
    if (parts.length === 0 && c.description) return c.description
    return parts.join(' · ') || c.activity_type || ''
}
