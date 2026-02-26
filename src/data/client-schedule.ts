'use server'

import { createClient } from '@/lib/supabase/server'

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
    weekStart: Date,
    weekEnd: Date
): Promise<CalendarItem[]> {
    const supabase = await createClient()

    const toDateStr = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }

    const startStr = toDateStr(weekStart)
    const endStr = toDateStr(weekEnd)

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

    if (activeProgram && activeProgram.training_days) {
        const programStart = new Date(activeProgram.effective_from + 'T12:00:00')
        const totalWeeks = activeProgram.weeks || 4

        for (const day of activeProgram.training_days as any[]) {
            if (!day.default_weekday) continue

            for (let week = 0; week < totalWeeks; week++) {
                // Calculate Monday of the target week
                const ws = new Date(programStart)
                ws.setDate(ws.getDate() + (week * 7))
                const mondayOffset = (ws.getDay() + 6) % 7
                const monday = new Date(ws)
                monday.setDate(monday.getDate() - mondayOffset)

                // Calculate specific session date
                const sessionDate = new Date(monday)
                sessionDate.setDate(monday.getDate() + (day.default_weekday - 1))
                const sessionDateStr = toDateStr(sessionDate)

                if (sessionDateStr >= startStr && sessionDateStr <= endStr) {
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
            .select('id, name')
            .in('id', programIds)

        const daysMap = new Map((daysData || []).map((d: any) => [d.id, d]))
        const programsMap = new Map((programsData || []).map((p: any) => [p.id, p]))

        for (const s of realStrength as any[]) {
            const dayInfo = daysMap.get(s.day_id)
            const programInfo = programsMap.get(s.program_id)
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
            })
        }
    }

    // Dedup: real sessions override virtual ones for the same day_id
    const realDayIds = new Set(realStrengthItems.map(r => r.dayId))
    const dedupedVirtual = strengthItems.filter(v => !realDayIds.has(v.dayId))
    const allStrength = [...dedupedVirtual, ...realStrengthItems]

    // ----- 3. Cardio sessions -----
    const { data: cardioData, error: cardioError } = await supabase
        .from('cardio_sessions')
        .select(`
            id, scheduled_date, activity_type, training_type, name, description,
            target_distance_km, target_duration_min, target_pace,
            structure, notes, planned_structure, coach_notes, is_completed,
            actual_distance_km, actual_duration_min, actual_avg_pace,
            rpe, feedback_notes
        `)
        .eq('client_id', clientId)
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr)

    const cardioItems: CalendarItem[] = (cardioData || []).map((c: any) => ({
        id: c.id,
        kind: 'cardio' as const,
        date: c.scheduled_date,
        title: c.name || c.training_type || c.activity_type || 'Cardio',
        subtitle: buildCardioSubtitle(c),
        isCompleted: c.is_completed ?? false,
        cardioSessionId: c.id,
        activityType: c.activity_type,
        trainingType: c.training_type,
        description: c.description,
        targetDistanceKm: c.target_distance_km ? Number(c.target_distance_km) : undefined,
        targetDurationMin: c.target_duration_min ? Number(c.target_duration_min) : undefined,
        targetPace: c.target_pace,
        coachNotes: c.coach_notes || c.notes, // Priority: coach_notes > notes
        plannedStructure: c.planned_structure || c.structure, // Priority: planned_structure > structure
        actualDistanceKm: c.actual_distance_km ? Number(c.actual_distance_km) : undefined,
        actualDurationMin: c.actual_duration_min ? Number(c.actual_duration_min) : undefined,
        actualAvgPace: c.actual_avg_pace,
        rpe: c.rpe,
        feedbackNotes: c.feedback_notes,
    }))

    // ----- 4. Combine, sort by date -----
    const allItems = [...allStrength, ...cardioItems].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // ----- 5. Fill rest days -----
    const result: CalendarItem[] = []
    const current = new Date(weekStart)
    const end = new Date(weekEnd)

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
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('cardio_sessions')
        .update({
            actual_distance_km: data.actualDistanceKm ?? null,
            actual_duration_min: data.actualDurationMin ?? null,
            actual_avg_pace: data.actualAvgPace ?? null,
            rpe: data.rpe ?? null,
            feedback_notes: data.feedbackNotes ?? null,
            is_completed: true,
            performed_date: new Date().toISOString(),
        })
        .eq('id', sessionId)

    if (error) {
        console.error('[saveCardioSessionLog]', error.message)
        return { success: false, error: error.message }
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
        return { success: true }
    }

    // Real session — just update
    const { error } = await supabase
        .from('scheduled_strength_sessions')
        .update({ is_completed: true })
        .eq('id', sessionId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

// ------------------------------------------------------------------
// Get active training program with days/columns/exercises/cells
// ------------------------------------------------------------------

export async function getActiveClientProgram(clientId: string) {
    const supabase = await createClient()

    // Fetch most recent active program
    const { data: programs } = await supabase
        .from('training_programs')
        .select(`
            id, name, weeks, effective_from, effective_to,
            training_days (
                id, name, order_index, default_weekday
            )
        `)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)

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

    if (exerciseIds.length > 0) {
        const user = await supabase.auth.getUser();
        const authUserId = user.data.user?.id;

        if (authUserId) {
            // Get real client ID
            const { data: client } = await supabase
                .from('clients')
                .select('id')
                .eq('user_id', authUserId)
                .single();

            if (client) {
                const { data: logsData } = await supabase
                    .from('training_exercise_logs')
                    .select('id, exercise_id, week_index, sets, notes')
                    .eq('client_id', client.id) // Correct ID
                    .in('exercise_id', exerciseIds)
                logs = logsData || []
            }
        }
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
        // Map Notes (c10) - stored in log.notes column
        if (colMap['c10'] && log.notes) {
            cells.push({
                id: `log-${log.id}-c10`,
                exercise_id: log.exercise_id,
                column_id: colMap['c10'],
                week_index: log.week_index,
                value: log.notes
            });
        }
    });

    // Map columns and ensure 'c1' (Exercise Name) exists
    const mappedColumns = (columns || []).map((c: any) => ({
        id: c.id,
        key: c.key,
        label: c.label,
        type: c.data_type, // Map data_type -> type
        scope: c.scope,
        editable: c.editable_by === 'client', // Map editable_by -> editable
        order: c.order_index,
    }))

    // Prepend 'c1' if not present, to ensure ExerciseTable renders the name
    if (!mappedColumns.find((c: any) => c.id === 'c1')) {
        mappedColumns.unshift({
            id: 'c1',
            key: 'c1',
            label: 'Ejercicio',
            type: 'text',
            scope: 'exercise',
            editable: false,
            order: 0,
        })
    }

    return {
        program: {
            id: program.id,
            name: program.name,
            totalWeeks: program.weeks || 4,
            effectiveFrom: program.effective_from,
        },
        days: days.map((d: any) => ({
            id: d.id,
            name: d.name,
            order: d.order_index,
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
        .single();

    if (!client) return { success: false, error: 'Client not found' }
    const clientId = client.id;

    // 1. Get Column Key to know what field to update
    const { data: col } = await supabase
        .from('training_columns')
        .select('key')
        .eq('id', columnId)
        .single();

    if (!col || !col.key) return { success: false, error: 'Invalid column' }

    // Map column key to field
    // c7=weight, c8=reps, c9=rir, c10=notes
    let field = '';
    if (col.key === 'c7') field = 'weight';
    else if (col.key === 'c8') field = 'reps';
    else if (col.key === 'c9') field = 'rir';
    else if (col.key === 'c10') field = 'notes';
    else return { success: false, error: 'Not a loggable column' }

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
    const { data: existingLog } = await supabase
        .from('training_exercise_logs')
        .select('*')
        .eq('client_id', clientId)
        .eq('exercise_id', exerciseId)
        .eq('week_index', weekNumber)
        .single();

    let sets = existingLog?.sets || [];
    if (!Array.isArray(sets)) sets = [];
    if (sets.length === 0) sets.push({ set: 1 }); // Init set 1

    let notes = existingLog?.notes || '';

    // 4. Update Value
    if (field === 'notes') {
        notes = value;
    } else {
        // Update Set 1
        // Parse value if possible (weight/rir are numbers)
        // c8 (reps) is text column but JSON expects... number? 
        // User example says "reps": 8. 
        // If users type "10", we parse. If "3x10", we store string?
        // JSONB stores whatever.
        let val: any = value;
        if (field === 'weight' || field === 'rir') {
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) val = parsed;
        }
        // For reps, if it looks like number, store as number
        if (field === 'reps') {
            const parsed = parseFloat(value);
            // If strictly digits allow parsing, else string
            if (!isNaN(parsed) && /^\d+$/.test(value)) val = parsed;
        }

        sets[0][field] = val;
        sets[0].set = 1; // Ensure set number
    }

    // 5. Upsert
    const payload = {
        client_id: clientId,
        exercise_id: exerciseId,
        week_index: weekNumber,
        program_id: programId,
        day_id: dayId,
        coach_id: coachId,
        sets,
        notes,
        updated_at: new Date().toISOString()
    }

    // Check if we need insert or update
    // Using upsert on unique constraint (client, exercise, week)
    const { error } = await supabase
        .from('training_exercise_logs')
        .upsert(payload, { onConflict: 'client_id, exercise_id, week_index' })

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
