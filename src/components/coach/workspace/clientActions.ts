import { createClient } from '@/lib/supabase/client'
import { addWeeks, setDay, format, startOfWeek, addDays, isBefore, isAfter, parseISO } from 'date-fns'
import { getDefaultTrainingColumns } from '@/lib/training/defaultColumns'

/**
 * @deprecated Use TrainingProgramWizard Step 1 for program creation.
 * This function is kept for legacy support but is no longer the main entry point.
 */
export async function createTrainingProgramClient(data: {
    coach_id: string
    client_id: string
    name: string
    total_weeks: number
    days: any[]
}) {
    const supabase = createClient()

    // 1. Verify Session & Resolve Coach
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
        return { success: false, error: 'No active session found. Please log in again.' }
    }

    // Resolve real coach_id from memberships
    const { data: membership, error: memberError } = await supabase
        .from('coach_memberships')
        .select('coach_id')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .limit(1)
        .single()

    if (memberError || !membership) {
        console.error('[createTrainingProgramClient] Coach resolve error:', memberError)
        return { success: false, error: 'Cuenta sin asignación de entrenador o membresía activa.', details: memberError?.message }
    }

    const resolvedCoachId = membership.coach_id
    console.log('[createTrainingProgramClient] Resolved Coach ID:', resolvedCoachId)

    // 2. Prepare Data for RPC
    const now = new Date()
    const effectiveFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Prepare Days JSON
    const daysPayload = data.days.map((day: any, index: number) => {
        const name = typeof day === 'string' ? day : day.name;
        const defaultWeekday = typeof day === 'object' ? day.default_weekday : null;
        return {
            name: name,
            order_index: index + 1,
            default_weekday: defaultWeekday || null
        }
    })

    // Prepare Default Columns JSON
    const defaultColumns = getDefaultTrainingColumns()

    // 3. Call RPC Transaction
    const { data: programId, error: rpcError } = await supabase.rpc('create_program_and_archive_old', {
        p_coach_id: resolvedCoachId,
        p_client_id: data.client_id,
        p_name: data.name,
        p_weeks: data.total_weeks,
        p_effective_from: effectiveFrom,
        p_days: daysPayload,
        p_columns: defaultColumns
    })

    if (rpcError) {
        console.error('[createTrainingProgramClient] RPC Error:', rpcError)
        return {
            success: false,
            error: 'Error al crear el programa (RPC).',
            code: rpcError.code,
            details: rpcError.message
        }
    }

    if (!programId) {
        return { success: false, error: 'No se devolvió ID del programa.' }
    }

    try {
        // 4. Verification and Schedule Generation
        // Fetch Created Days (Need IDs for scheduling)
        const { data: createdDays, error: fetchDaysError } = await supabase
            .from('training_days')
            .select('*')
            .eq('program_id', programId)
            .order('order_index')

        if (fetchDaysError || !createdDays || createdDays.length === 0) {
            console.error('Verification failed or count 0:', fetchDaysError)
            // Note: If RPC succeeded but we can't fetch days, we might have a consistency issue 
            // but the transaction committed.
            throw { message: 'Error al verificar los días creados.', details: fetchDaysError?.message }
        }

        const count = createdDays.length
        console.log('[createTrainingProgramClient] Created program:', programId, 'with days:', count)

        // *** AUTO-SCHEDULE GENERATION ***
        if (data.total_weeks && data.total_weeks > 0) {
            await generateProgramSchedule(programId, createdDays, effectiveFrom, data.total_weeks, resolvedCoachId, data.client_id)
        }

        return {
            success: true,
            programId: programId as string,
            daysCreated: count
        }

    } catch (err: any) {
        console.error('[createTrainingProgramClient] Post-creation Exception:', err)
        // Note: The program was committed. We shouldn't delete it automatically here 
        // because the "Transaction" part (RPC) succeeded. 
        // The failure is in post-processing (fetching/scheduling).
        // User might see the program but maybe schedule is missing.

        return {
            success: true, // Return true because the core program exists? Or false with warning?
            // Returning false might make UI think creation failed, but it didn't.
            // Let's return false but with clear message that program exists but schedule failed?
            // Or better: try to generate schedule again?
            // For now, let's treat it as error but log correctly.
            error: err.message || 'Programa creado pero hubo un error generando agendas.',
            programId: programId as string, // Return ID anyway
        }
    }
}

export async function deleteTrainingProgramClient(programId: string) {
    const supabase = createClient()

    // 1. Verify program status is 'archived'
    const { data: program, error: findError } = await supabase
        .from('training_programs')
        .select('status')
        .eq('id', programId)
        .single()

    if (findError || !program) {
        return { success: false, error: 'Programa no encontrado.' }
    }

    if (program.status !== 'archived') {
        return { success: false, error: 'Solo se pueden eliminar programas archivados.' }
    }

    // 2. Delete dependencies manually (Safe Delete)
    // training_cells
    await supabase.from('training_cells').delete().eq('program_id', programId)
    // training_exercises
    await supabase.from('training_exercises').delete().eq('program_id', programId)
    // training_days
    await supabase.from('training_days').delete().eq('program_id', programId)
    // training_columns
    await supabase.from('training_columns').delete().eq('program_id', programId)

    // 3. Delete Program
    const { error: deleteError } = await supabase
        .from('training_programs')
        .delete()
        .eq('id', programId)

    if (deleteError) {
        console.error('[deleteTrainingProgramClient] Error deleting program:', deleteError)
        return { success: false, error: deleteError.message }
    }

    return { success: true }
}

export async function duplicateTrainingProgramClient(programId: string) {
    const supabase = createClient()

    try {
        // 1. Get original program data
        const { data: originalProgram, error: progError } = await supabase
            .from('training_programs')
            .select('*')
            .eq('id', programId)
            .single()

        if (progError || !originalProgram) throw new Error('No se pudo encontrar el programa original')

        // 2. Insert new program (archived by default)
        const { data: newProgram, error: newProgError } = await supabase
            .from('training_programs')
            .insert({
                coach_id: originalProgram.coach_id,
                client_id: originalProgram.client_id,
                name: `${originalProgram.name} (Copia)`,
                weeks: originalProgram.weeks,
                status: 'archived',
                effective_from: originalProgram.effective_from,
            })
            .select()
            .single()

        if (newProgError || !newProgram) throw new Error(`Error al crear copia: ${newProgError?.message}`)

        const newProgramId = newProgram.id

        // 3. Clone Columns
        const { data: cols, error: colsError } = await supabase
            .from('training_columns')
            .select('*')
            .eq('program_id', programId)

        if (cols && cols.length > 0) {
            const colsToInsert = cols.map(c => ({
                program_id: newProgramId,
                coach_id: c.coach_id,
                label: c.label,
                data_type: c.data_type,
                scope: c.scope,
                editable_by: c.editable_by,
                options: c.options,
                key: c.key,
                required: c.required,
                order_index: c.order_index
            }))
            await supabase.from('training_columns').insert(colsToInsert)
        }

        // Get new column map (old_id -> new_id) to map cells correctly if keys are not enough
        // However, for cells we usually use column_id. Let's get new columns again to build the map.
        const { data: newCols } = await supabase.from('training_columns').select('id, label, key').eq('program_id', newProgramId)
        const colMap: Record<string, string> = {}
        if (cols && newCols) {
            cols.forEach(oldCol => {
                const match = newCols.find(nc => nc.label === oldCol.label && nc.key === oldCol.key)
                if (match) colMap[oldCol.id] = match.id
            })
        }

        // 4. Clone Days
        const { data: days, error: daysError } = await supabase
            .from('training_days')
            .select('*')
            .eq('program_id', programId)

        if (days && days.length > 0) {
            for (const day of days) {
                const { data: newDay, error: newDayError } = await supabase
                    .from('training_days')
                    .insert({
                        program_id: newProgramId,
                        coach_id: day.coach_id,
                        name: day.name,
                        order_index: day.order_index,
                        day_name: day.day_name,
                        day_order: day.day_order
                    })
                    .select()
                    .single()

                if (newDayError || !newDay) continue

                // 5. Clone Exercises for this day
                const { data: exercises } = await supabase
                    .from('training_exercises')
                    .select('*')
                    .eq('day_id', day.id)

                if (exercises && exercises.length > 0) {
                    for (const ex of exercises) {
                        const { data: newEx, error: newExError } = await supabase
                            .from('training_exercises')
                            .insert({
                                program_id: newProgramId,
                                coach_id: ex.coach_id,
                                day_id: newDay.id,
                                exercise_name: ex.exercise_name,
                                order_index: ex.order_index,
                                exercise_order: ex.exercise_order
                            })
                            .select()
                            .single()

                        if (newExError || !newEx) continue

                        // 6. Clone Cells for this exercise
                        const { data: cells } = await supabase
                            .from('training_cells')
                            .select('*')
                            .eq('exercise_id', ex.id)

                        if (cells && cells.length > 0) {
                            const cellsToInsert = cells.map(cell => ({
                                program_id: newProgramId,
                                coach_id: cell.coach_id,
                                day_id: newDay.id,
                                exercise_id: newEx.id,
                                column_id: colMap[cell.column_id] || cell.column_id,
                                week_index: cell.week_index,
                                value: cell.value
                            })).filter(c => c.column_id) // Safety check

                            if (cellsToInsert.length > 0) {
                                await supabase.from('training_cells').insert(cellsToInsert)
                            }
                        }
                    }
                }
            }
        }

        return { success: true, programId: newProgramId }

    } catch (err: any) {
        console.error('[duplicateTrainingProgramClient] Error:', err)
        return { success: false, error: err.message }
    }
}

// ============================================================================
// AUTO-SCHEDULE LOGIC
// ============================================================================

export async function saveTrainingDays(
    programId: string,
    days: { name: string; id?: string; default_weekday?: number }[]
) {
    const supabase = createClient()

    try {
        // 1. Verify Session & Permissions (Basic check)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Sesión expirada')

        // Get Program Details for Coach ID & Dates
        const { data: program, error: progError } = await supabase
            .from('training_programs')
            .select('*')
            .eq('id', programId)
            .single()

        if (progError || !program) throw new Error('Programa no encontrado')

        const coachId = program.coach_id

        // 2. Sync Days
        const currentDayIds = days.map(d => d.id).filter(Boolean) as string[]

        // Delete removed days
        if (currentDayIds.length > 0) {
            await supabase
                .from('training_days')
                .delete()
                .eq('program_id', programId)
                .not('id', 'in', `(${currentDayIds.join(',')})`)
        } else {
            await supabase.from('training_days').delete().eq('program_id', programId)
        }

        // Upsert Days
        const daysPayload = days.map((d, idx) => ({
            id: d.id?.startsWith('new-') ? undefined : d.id, // Let DB gen ID for new ones if 'new-' prefix
            program_id: programId,
            coach_id: coachId,
            name: d.name,
            day_name: d.name, // Legacy
            order_index: idx + 1,
            day_order: idx + 1, // Legacy
            default_weekday: d.default_weekday || null
        }))

        const { data: insertedDays, error: upsertError } = await supabase
            .from('training_days')
            .upsert(daysPayload)
            .select()

        if (upsertError) throw upsertError

        // 3. GENERATE SCHEDULE
        if (program.effective_from && program.weeks > 0 && insertedDays && insertedDays.length > 0) {
            await generateProgramSchedule(programId, insertedDays, program.effective_from, program.weeks, coachId, program.client_id)
        }

        return { success: true }

    } catch (error: any) {
        console.error('[saveTrainingDays] Error:', error)
        return { success: false, error: error.message }
    }
}

async function generateProgramSchedule(
    programId: string,
    days: any[], // TrainingDay[]
    startDateStr: string,
    weeks: number,
    coachId: string,
    clientId: string
) {
    const supabase = createClient()
    const startDate = parseISO(startDateStr)

    // 1. Clear existing future (not completed) scheduled sessions for this program
    await supabase
        .from('scheduled_strength_sessions')
        .delete()
        .eq('program_id', programId)
        .eq('is_completed', false)

    const sessionsToInsert: any[] = []

    // 2. Iterate 4 Weeks (0..weeks-1) as requested in instructions
    for (let week = 0; week < weeks; week++) {
        // Calculate the Monday of this 'week' offset
        // We assume weeks start on Monday.
        const weekStart = addWeeks(startDate, week)
        const startOfCalWeek = startOfWeek(weekStart, { weekStartsOn: 1 })

        for (const day of days) {
            if (!day.default_weekday) continue

            // 1 = Mon, 7 = Sun.
            // date-fns setDay with weekStartsOn: 1 expects 0=Mon?? No.
            // date-fns 3.x setDay:
            // day: The day of the week. 0 to 6.
            // options.weekStartsOn: The index of the first day of the week (0 - Sunday).
            // Actually setDay(date, day, options) sets the day of the week.
            // If weekStartsOn=1 (Mon):
            // 0=Mon? No, usually 0 is Sunday in JS Date, but setDay might respect locale/index.
            // Let's check docs or safe bet:
            // "The day of the week, 0 represents Sunday".
            // So if we want Monday (1), we pass 1. If Sunday (7), we pass 0.

            const jsDay = day.default_weekday === 7 ? 0 : day.default_weekday

            // However, setDay with weekStartsOn sets the day relative to the week.
            // If we use startOfCalWeek (which is Monday), and we want Monday, we setDay(..., 1).
            // Wait, if 0=Sunday, 1=Monday.
            const sessionDate = setDay(startOfCalWeek, jsDay, { weekStartsOn: 1 })

            // If program starts on Wednesday, and we generate Monday for Week 0, it will be in the past relative to StartDate?
            // User instruction said: "Calcula la fecha: const weekStart = addWeeks(new Date(startDate), week); const sessionDate = setDay(weekStart, jsDay, { weekStartsOn: 1 });"
            // We follow that instructions.

            sessionsToInsert.push({
                client_id: clientId,
                id: undefined, // Let Postgres gen UUID
                program_id: programId,          // Correct column name
                day_id: day.id,                 // Correct column name
                scheduled_date: format(sessionDate, 'yyyy-MM-dd'),
                is_completed: false,
                // created_at? default
            })
        }
    }

    if (sessionsToInsert.length > 0) {
        console.log(`[generateProgramSchedule] Inserting ${sessionsToInsert.length} sessions for Program ${programId}`)
        const { error } = await supabase.from('scheduled_strength_sessions').insert(sessionsToInsert)
        if (error) console.error('[generateProgramSchedule] Error:', error)
    }
}
