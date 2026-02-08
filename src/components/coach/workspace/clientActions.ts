import { createClient } from '@/lib/supabase/client'

/**
 * @deprecated Use TrainingProgramWizard Step 1 for program creation.
 * This function is kept for legacy support but is no longer the main entry point.
 */
export async function createTrainingProgramClient(data: {
    coach_id: string
    client_id: string
    name: string
    total_weeks: number
    days: string[]
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

    // 2. Archive existing active programs for THIS coach and client
    const { error: archiveError } = await supabase
        .from('training_programs')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('coach_id', resolvedCoachId)
        .eq('client_id', data.client_id)
        .eq('status', 'active')

    if (archiveError) {
        console.error('[createTrainingProgramClient] Error archiving old programs:', archiveError)
    }

    // 3. Step 1: Insert Program
    const programPayload = {
        coach_id: resolvedCoachId,
        client_id: data.client_id,
        name: data.name,
        weeks: data.total_weeks, // Usar 'weeks' según BBDD
        status: 'active',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: null,
    }

    console.log('[createTrainingProgramClient] Program Payload:', programPayload)

    const { data: program, error: programError } = await supabase
        .from('training_programs')
        .insert(programPayload)
        .select()

    if (programError || !program) {
        console.error('[createTrainingProgramClient] Error creating program:', programError)
        return {
            success: false,
            error: 'Error al crear el programa base.',
            code: programError?.code,
            details: programError?.message
        }
    }

    const programId = program[0].id

    try {
        // 4. Step 2: Create Days
        const daysToInsert = data.days.map((name, index) => ({
            program_id: programId,
            coach_id: resolvedCoachId,
            name: name,
            order_index: index + 1,
            day_name: name, // Legacy compat
            day_order: index + 1, // Legacy compat
        }))

        console.log('[createTrainingProgramClient] Days Payload (check coach_id & program_id):', daysToInsert)

        const { error: daysError } = await supabase
            .from('training_days')
            .insert(daysToInsert)

        if (daysError) {
            console.error('Error creating days:', daysError)
            throw { message: 'Error al crear los días de entrenamiento.', code: daysError.code, details: daysError.message }
        }

        // 5. Step 3: Read-your-writes Verification for Days
        const { count, error: countError } = await supabase
            .from('training_days')
            .select('*', { count: 'exact', head: true })
            .eq('program_id', programId)

        console.log('[createTrainingProgramClient] Verification count for program_id:', programId, 'is:', count)

        if (countError || count === 0) {
            console.error('Verification failed or count 0:', countError)
            throw { message: 'La verificación de días falló (count 0).', details: countError?.message }
        }

        // 6. Step 4: Create Default Columns
        const defaultColumns = [
            { label: 'Ejercicio', data_type: 'text', scope: 'exercise', editable_by: 'coach', col_order: 1 },
            { label: 'Series', data_type: 'number', scope: 'cell', editable_by: 'coach', col_order: 2 },
            { label: 'Reps', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 3 },
            { label: 'RIR', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 4 },
            { label: 'Descanso', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 5 },
            { label: 'Tips', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 6 },
            { label: 'Peso', data_type: 'number', scope: 'cell', editable_by: 'client', col_order: 7 },
            { label: 'Reps hechas', data_type: 'number', scope: 'cell', editable_by: 'client', col_order: 8 },
            { label: 'Notas', data_type: 'text', scope: 'cell', editable_by: 'both', col_order: 9 },
        ]

        const columnsToInsert = defaultColumns.map((col: any) => ({
            ...col,
            program_id: programId,
            coach_id: resolvedCoachId,
        }))

        console.log('[createTrainingProgramClient] Columns Payload:', columnsToInsert)

        const { error: colError } = await supabase
            .from('training_columns')
            .insert(columnsToInsert)

        if (colError) {
            console.error('Error creating columns:', colError)
            // No hacemos rollback aquí si los días ya están creados, pero lo marcamos como error
            return { success: false, error: 'Error al crear columnas por defecto.', details: colError.message }
        }

        return {
            success: true,
            programId: programId,
            daysCreated: count
        }

    } catch (err: any) {
        console.error('[createTrainingProgramClient] Exception (Rolling back):', err)

        // MANUAL ROLLBACK
        await supabase.from('training_programs').delete().eq('id', programId)
        console.warn('[createTrainingProgramClient] Rollback executed for program:', programId)

        return {
            success: false,
            error: err.message || 'Error desconocido durante la creación.',
            code: err.code,
            details: err.details
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
                col_order: c.col_order,
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
