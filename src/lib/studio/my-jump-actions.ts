'use server'

import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { parseNumber, setRows, setsFields } from '@/lib/studio/editor-rules'
import { cleanAnalysis, myJumpCell, myJumpRows } from '@/lib/studio/my-jump-rules'
import type { StudioResult } from '@/lib/studio/session-actions'

export interface MyJumpImportSet {
    clientId: string
    /** AAAA-MM-DD */
    date: string
    catalogExerciseId: string
    loadKg: number | null
    reps: { mpv: number; mv: number; pv: number; rom: number }[]
}

const UUID = /^[0-9a-f-]{36}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

type RpcError = { code?: string; message?: string }

function failure(error: RpcError | null, done: number): { success: false; error: string } {
    const already = done > 0 ? ` Se ${done === 1 ? 'ha importado 1 serie' : `han importado ${done} series`} antes del fallo.` : ''
    if (error?.code === '42501') return { success: false, error: `No tienes permiso para guardar en ese cliente.${already}` }
    if (error?.code === 'NT409') return { success: false, error: `Otra persona estaba cambiando ese ejercicio. Vuelve a importar ese archivo.${already}` }
    if (error?.code === '22023') return { success: false, error: `${error.message ?? 'Revisa los datos.'}${already}` }
    return { success: false, error: `No se ha podido importar. Inténtalo de nuevo.${already}` }
}

/**
 * Guarda series de My Jump: cada una en la sesión de su cliente ese día (si no hay, se crea) y en su
 * ejercicio (si no está, se añade). Se suman a las series que ya hubiera por series.
 */
export async function importMyJumpAction(input: MyJumpImportSet[]): Promise<StudioResult<{ sets: number; sessions: number }>> {
    const sets = input.filter(set => UUID.test(set.clientId) && DAY.test(set.date) && UUID.test(set.catalogExerciseId))
    if (sets.length === 0 || sets.length > 200) return { success: false, error: 'No hay series que importar.' }

    const supabase = await createClient()
    const { data: equations } = await supabase
        .from('exercise_vbt_equations')
        .select('catalog_exercise_id, velocity_type')
        .in('catalog_exercise_id', [...new Set(sets.map(set => set.catalogExerciseId))])
    const equationOf = (catalogId: string) => (equations ?? []).find(equation => equation.catalog_exercise_id === catalogId) ?? null

    // Cliente y día, y dentro cada ejercicio con sus series en el orden en que llegaron.
    const byDay = new Map<string, Map<string, MyJumpImportSet[]>>()
    for (const set of sets) {
        const key = `${set.clientId}|${set.date}`
        const exercises = byDay.get(key) ?? new Map<string, MyJumpImportSet[]>()
        exercises.set(set.catalogExerciseId, [...(exercises.get(set.catalogExerciseId) ?? []), set])
        byDay.set(key, exercises)
    }

    let done = 0
    let created = 0
    for (const [key, exercises] of byDay) {
        const [clientId, date] = key.split('|')
        const batch = randomUUID()

        const { data: existing } = await supabase
            .from('studio_sessions')
            .select('id')
            .eq('client_id', clientId)
            .eq('session_date', date)
            .not('status', 'in', '(cancelled,no_show)')
            .order('created_at')
            .limit(1)
        let sessionId = existing?.[0]?.id as string | undefined
        if (!sessionId) {
            const { data, error } = await supabase.rpc('studio_create_session', {
                p_client_id: clientId,
                p_session_date: date,
                p_start_time: null,
                p_professional_id: null,
                p_name: null,
            })
            if (error) return failure(error, done)
            sessionId = data.id as string
            created++
        }

        for (const [catalogId, list] of exercises) {
            const { data: item } = await supabase
                .from('studio_session_items')
                .select('id, version')
                .eq('session_id', sessionId)
                .eq('catalog_exercise_id', catalogId)
                .order('sort_order')
                .limit(1)
                .maybeSingle()

            const { data: saved } = item
                ? await supabase
                    .from('studio_session_sets')
                    .select('set_index, load_kg, reps, time_seconds, rir, rpe, velocity_ms, rep_detail, source, is_detailed')
                    .eq('item_id', item.id)
                    .order('set_index')
                : { data: [] }
            const detailed = (saved ?? []).filter(set => set.is_detailed)

            const imported = myJumpRows(
                list.map(set => ({ loadKg: set.loadKg && set.loadKg > 0 ? set.loadKg : null, analysis: cleanAnalysis(set.reps) })),
                equationOf(catalogId)
            )
            if (imported.length === 0) continue
            const rows = [...(detailed.length > 0 ? setRows(detailed, 0) : []), ...imported]
            const payload = setsFields(rows)
            if (payload.error || !payload.sets) return { success: false, error: payload.error ?? 'Revisa las series.' }
            const cell = myJumpCell(rows)!

            const fields: Record<string, unknown> = {
                sets: Math.min(rows.length, 30),
                reps: cell.reps.slice(0, 40),
                load_kg: parseNumber(cell.loadKg),
                velocity_ms: parseNumber(cell.velocityMs),
            }
            if (!item) fields.catalog_exercise_id = catalogId
            const savedItem = await supabase.rpc('studio_save_item', {
                p_session_id: sessionId,
                p_item_id: item?.id ?? null,
                p_version: item?.version ?? null,
                p_fields: fields,
                p_batch_id: batch,
            })
            if (savedItem.error) return failure(savedItem.error, done)

            const savedSets = await supabase.rpc('studio_save_sets', {
                p_item_id: savedItem.data.id,
                p_version: savedItem.data.version,
                p_sets: payload.sets,
                p_batch_id: batch,
            })
            if (savedSets.error) return failure(savedSets.error, done)
            done += imported.length
        }
    }

    return { success: true, data: { sets: done, sessions: created } }
}
