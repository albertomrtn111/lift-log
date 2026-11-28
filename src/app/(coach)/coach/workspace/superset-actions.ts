'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import {
    planDrop,
    planEqualizeSets,
    planLink,
    planMove,
    planMoveBlock,
    planNormalizeOrder,
    planRemoveFromBlock,
    planUnlinkBlock,
} from '@/lib/training/supersets'

/**
 * Superseries en el editor de programas de fuerza (NXT-121). Cada acción lee el
 * día de la base de datos, calcula los cambios con src/lib/training/supersets.js
 * y devuelve el estado final de los ejercicios del día para el editor.
 * Las series del atleta no se tocan: solo orden, clave de bloque, descanso y series.
 */

export type DayExerciseState = {
    id: string
    order_index: number
    superset_key: string | null
    rest_seconds: number | null
    sets: number | null
}

export type SupersetActionResult =
    | { success: true; exercises: DayExerciseState[] }
    | { success: false; error: string }

type ExerciseUpdate = { id: string; superset_key?: string | null; rest_seconds?: number | null; sets?: number | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_FIELDS = 'id, order_index, superset_key, rest_seconds, sets, created_at, exercise_name'

async function loadDay(dayId: string) {
    if (!UUID.test(String(dayId ?? ''))) throw new Error('El día no es válido.')
    const supabase = await createClient()
    const { data: day } = await supabase
        .from('training_days')
        .select('id, coach_id, program_id')
        .eq('id', dayId)
        .maybeSingle()
    if (!day) throw new Error('No se ha encontrado el día.')
    // Comprueba que quien edita es entrenador activo de ese espacio.
    await requireActiveCoachId(day.coach_id)

    const { data: exercises, error } = await supabase
        .from('training_exercises')
        .select(DAY_FIELDS)
        .eq('day_id', dayId)
        .eq('coach_id', day.coach_id)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
    if (error || !exercises) throw new Error('No se pudieron cargar los ejercicios del día.')
    return { supabase, day, exercises }
}

function toState(rows: any[]): DayExerciseState[] {
    return rows.map((row, index) => ({
        id: row.id,
        order_index: row.order_index ?? index + 1,
        superset_key: row.superset_key ?? null,
        rest_seconds: row.rest_seconds ?? null,
        sets: row.sets ?? null,
    }))
}

/** Escribe orden (si cambia) y cambios de bloque, y deja el día normalizado. */
async function persist(
    dayId: string,
    loaded: Awaited<ReturnType<typeof loadDay>>,
    updates: ExerciseUpdate[],
    order: string[] | null,
): Promise<SupersetActionResult> {
    const { supabase, day } = loaded
    let rows: any[] = loaded.exercises.map((row) => ({ ...row }))
    const byId = new Map(rows.map((row) => [row.id, row]))

    if (order) {
        const known = new Set(rows.map((row) => row.id))
        if (order.length !== rows.length || order.some((id) => !known.has(id))) {
            return { success: false, error: 'La lista de ejercicios ha cambiado. Recarga el programa e inténtalo de nuevo.' }
        }
        rows = order.map((id, index) => ({ ...byId.get(id), order_index: index + 1 }))
    }
    for (const update of updates) {
        const row = rows.find((candidate) => candidate.id === update.id)
        if (row) Object.assign(row, update)
    }
    // Lo que el cambio haya dejado suelto o partido se arregla en el mismo guardado.
    for (const fix of planNormalizeOrder(rows).updates) {
        const row = rows.find((candidate) => candidate.id === fix.id)
        if (row) Object.assign(row, fix)
    }

    const original = new Map(loaded.exercises.map((row: any, index: number) => [row.id, { ...row, order_index: row.order_index ?? index + 1 }]))
    const updatedAt = new Date().toISOString()
    const writes = rows
        .map((row, index) => {
            const before = original.get(row.id)!
            const fields: Record<string, unknown> = {}
            const orderIndex = index + 1
            if (before.order_index !== orderIndex) fields.order_index = orderIndex
            if ((before.superset_key ?? null) !== (row.superset_key ?? null)) fields.superset_key = row.superset_key ?? null
            if ((before.rest_seconds ?? null) !== (row.rest_seconds ?? null)) fields.rest_seconds = row.rest_seconds ?? null
            if ((before.sets ?? null) !== (row.sets ?? null)) fields.sets = row.sets ?? null
            return { id: row.id, fields }
        })
        .filter((write) => Object.keys(write.fields).length > 0)

    const results = await Promise.all(
        writes.map((write) =>
            supabase
                .from('training_exercises')
                .update({ ...write.fields, updated_at: updatedAt })
                .eq('id', write.id)
                .eq('day_id', dayId)
                .eq('coach_id', day.coach_id),
        ),
    )
    const failed = results.find((result) => result.error)?.error
    if (failed) {
        // Vuelve a lo que había para no dejar el día a medias.
        await Promise.all(
            writes.map((write) => {
                const before = original.get(write.id)!
                const restore: Record<string, unknown> = {}
                for (const field of Object.keys(write.fields)) restore[field] = before[field] ?? null
                return supabase.from('training_exercises').update(restore).eq('id', write.id).eq('day_id', dayId)
            }),
        )
        return { success: false, error: failed.message }
    }

    revalidatePath('/coach/clients')
    return { success: true, exercises: toState(rows.map((row, index) => ({ ...row, order_index: index + 1 }))) }
}

async function run(dayId: string, plan: (exercises: any[]) => { updates?: ExerciseUpdate[]; order?: string[] | null; error?: string }) {
    try {
        const loaded = await loadDay(dayId)
        const result = plan(loaded.exercises)
        if (result.error) return { success: false, error: result.error } as SupersetActionResult
        return await persist(dayId, loaded, result.updates ?? [], result.order ?? null)
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar.' } as SupersetActionResult
    }
}

/** Enlaza dos ejercicios seguidos (o los suma al bloque de uno de ellos). */
export async function linkExercisesAction(dayId: string, upperId: string, lowerId: string) {
    return run(dayId, (exercises) => {
        const plan = planLink(exercises, upperId, lowerId)
        return 'error' in plan ? { error: plan.error } : { updates: plan.updates }
    })
}

/** Deshace la superserie entera a la que pertenece el ejercicio. */
export async function unlinkSupersetAction(dayId: string, memberId: string) {
    return run(dayId, (exercises) => planUnlinkBlock(exercises, memberId))
}

/** Saca un ejercicio de su superserie (si estaba en medio, pasa detrás del bloque). */
export async function removeFromSupersetAction(dayId: string, memberId: string) {
    return run(dayId, (exercises) => planRemoveFromBlock(exercises, memberId))
}

/** Iguala las series de la superserie al mayor número. */
export async function equalizeSupersetSetsAction(dayId: string, memberId: string) {
    return run(dayId, (exercises) => planEqualizeSets(exercises, memberId))
}

/** Subir o bajar un ejercicio respetando las superseries. */
export async function moveExerciseInDayAction(dayId: string, exerciseId: string, direction: 'up' | 'down') {
    return run(dayId, (exercises) => {
        const order = planMove(exercises, exerciseId, direction)
        return order ? { order } : { error: 'No se puede mover más.' }
    })
}

/** Subir o bajar una superserie entera. */
export async function moveSupersetBlockAction(dayId: string, memberId: string, direction: 'up' | 'down') {
    return run(dayId, (exercises) => {
        const order = planMoveBlock(exercises, memberId, direction)
        return order ? { order } : { error: 'No se puede mover más.' }
    })
}

/** Soltar al arrastrar: un ejercicio o, con wholeBlock, la superserie entera. */
export async function dropExerciseInDayAction(dayId: string, draggedId: string, targetId: string, wholeBlock = false) {
    return run(dayId, (exercises) => {
        const order = planDrop(exercises, draggedId, targetId, { wholeBlock })
        return { order }
    })
}

/** Deja el día sin bloques sueltos ni partidos (por ejemplo, tras eliminar un ejercicio). */
export async function normalizeDaySupersetsAction(dayId: string) {
    return run(dayId, () => ({ updates: [] }))
}
