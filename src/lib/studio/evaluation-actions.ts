'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import type { StudioResult } from '@/lib/studio/session-actions'

export interface StudioEvaluation {
    id: string
    client_id: string
    eval_date: string | null
    results: Record<string, number>
    source: 'manual' | 'excel'
    version: number
    created_at: string
    updated_at: string
}

export interface StudioEvaluationTest {
    test_key: string
    name: string | null
    unit: string | null
    direction: number
    group_name: string | null
    hidden: boolean
}

export interface StudioEvaluationFile {
    evaluations: StudioEvaluation[]
    info: Record<string, string | number>
    names: Record<string, string>
    tests: StudioEvaluationTest[]
}

const COLUMNS = 'id, client_id, eval_date, results, source, version, created_at, updated_at'
const KEY = /^[a-z0-9_]{1,60}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

type RpcError = { code?: string; message?: string }

function failure(error: RpcError | null): { success: false; error: string; conflict?: boolean } {
    if (error?.code === '42501') return { success: false, error: 'No tienes permiso para hacer esto.' }
    if (error?.code === '22023') return { success: false, error: error.message ?? 'Revisa los datos.' }
    if (error?.code === '23505') return { success: false, error: 'Ya hay una evaluación con esa fecha.' }
    return { success: false, error: 'No se ha podido guardar. Inténtalo de nuevo.' }
}

/** Las evaluaciones de un cliente, sus datos de deportista y los tests propios u ocultos del espacio. */
export async function getClientEvaluationsAction(clientId: string): Promise<StudioResult<StudioEvaluationFile>> {
    const supabase = await createClient()
    const { data: client } = await supabase.from('clients').select('coach_id').eq('id', clientId).maybeSingle()
    if (!client) return { success: false, error: 'No tienes acceso a este cliente.' }
    const [evaluations, profile, tests] = await Promise.all([
        supabase.from('client_evaluations').select(COLUMNS).eq('client_id', clientId).order('eval_date', { ascending: true, nullsFirst: true }),
        supabase.from('client_evaluation_profiles').select('info, test_names').eq('client_id', clientId).maybeSingle(),
        supabase.from('evaluation_tests').select('test_key, name, unit, direction, group_name, hidden').eq('coach_id', client.coach_id),
    ])
    if (evaluations.error) return failure(evaluations.error)
    return {
        success: true,
        data: {
            evaluations: (evaluations.data ?? []) as StudioEvaluation[],
            info: (profile.data?.info ?? {}) as Record<string, string | number>,
            names: (profile.data?.test_names ?? {}) as Record<string, string>,
            tests: (tests.data ?? []) as StudioEvaluationTest[],
        },
    }
}

/** Nueva evaluación vacía en una fecha (o se abre la que ya hay ese día). */
export async function addEvaluationAction(clientId: string, date: string | null): Promise<StudioResult<StudioEvaluation>> {
    if (date && !DAY.test(date)) return { success: false, error: 'La fecha no es válida.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('evaluation_merge', { p_client_id: clientId, p_eval_date: date, p_results: {}, p_source: 'manual' })
    if (error) return failure(error)
    return { success: true, data: data as StudioEvaluation }
}

/** Un resultado de una evaluación: un número, o null para quitarlo. Si otro la cambió entretanto, avisa. */
export async function saveEvaluationValueAction(
    evaluationId: string,
    version: number,
    key: string,
    value: number | null
): Promise<StudioResult<StudioEvaluation>> {
    if (!KEY.test(key) || (value !== null && !Number.isFinite(value))) return { success: false, error: 'Escribe un número.' }
    const supabase = await createClient()
    const { data: current, error: readError } = await supabase.from('client_evaluations').select('results, version').eq('id', evaluationId).maybeSingle()
    if (readError || !current) return failure(readError)
    if (current.version !== version) {
        return { success: false, conflict: true, error: 'Otra persona ha cambiado esta evaluación. Ya tienes lo último: vuelve a escribirlo.' }
    }
    const results = { ...(current.results as Record<string, number>) }
    if (value === null) delete results[key]
    else results[key] = value
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
        .from('client_evaluations')
        .update({ results, version: version + 1, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('id', evaluationId)
        .eq('version', version)
        .select(COLUMNS)
        .maybeSingle()
    if (error) return failure(error)
    if (!data) return { success: false, conflict: true, error: 'Otra persona ha cambiado esta evaluación. Ya tienes lo último: vuelve a escribirlo.' }
    return { success: true, data: data as StudioEvaluation }
}

/** Cambiar la fecha de una evaluación. */
export async function setEvaluationDateAction(evaluationId: string, date: string | null): Promise<StudioResult> {
    if (date && !DAY.test(date)) return { success: false, error: 'La fecha no es válida.' }
    const supabase = await createClient()
    const { error } = await supabase.from('client_evaluations').update({ eval_date: date, updated_at: new Date().toISOString() }).eq('id', evaluationId)
    return error ? failure(error) : { success: true, data: undefined }
}

/** Borrar una evaluación entera (se pide confirmación antes en la pantalla). */
export async function deleteEvaluationAction(evaluationId: string): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.from('client_evaluations').delete().eq('id', evaluationId)
    return error ? failure(error) : { success: true, data: undefined }
}

/** Datos del deportista (deporte, posición, peso…). */
export async function saveEvaluationInfoAction(clientId: string, info: Record<string, string | number>): Promise<StudioResult> {
    const supabase = await createClient()
    const { data: client } = await supabase.from('clients').select('coach_id').eq('id', clientId).maybeSingle()
    if (!client) return { success: false, error: 'No tienes acceso a este cliente.' }
    const clean = Object.fromEntries(Object.entries(info).filter(([key, value]) => /^[a-z0-9]{1,30}$/.test(key) && String(value).trim() !== '').slice(0, 20))
    const { error } = await supabase.from('client_evaluation_profiles').upsert({ client_id: clientId, coach_id: client.coach_id, info: clean, updated_at: new Date().toISOString() })
    return error ? failure(error) : { success: true, data: undefined }
}

/** Un test propio del espacio, o esconder y recuperar cualquiera. */
export async function saveEvaluationTestAction(test: {
    key: string
    name?: string | null
    unit?: string | null
    direction?: number
    group?: string | null
    hidden?: boolean
}): Promise<StudioResult> {
    if (!KEY.test(test.key)) return { success: false, error: 'Ese test no es válido.' }
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No tienes permiso para hacer esto.' }
    const supabase = await createClient()
    const { data: existing } = await supabase.from('evaluation_tests').select('*').eq('coach_id', coachId).eq('test_key', test.key).maybeSingle()
    const { error } = await supabase.from('evaluation_tests').upsert({
        coach_id: coachId,
        test_key: test.key,
        name: test.name !== undefined ? (test.name?.trim() || null) : existing?.name ?? null,
        unit: test.unit !== undefined ? (test.unit?.trim() || null) : existing?.unit ?? null,
        direction: test.direction ?? existing?.direction ?? 0,
        group_name: test.group !== undefined ? test.group : existing?.group_name ?? null,
        hidden: test.hidden ?? existing?.hidden ?? false,
        updated_at: new Date().toISOString(),
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export interface EvaluationImportItem {
    clientId: string
    info: Record<string, string | number>
    names: Record<string, string>
    dates: { date: string; results: Record<string, number> }[]
}

/** Importar del Excel: cada fecha se suma a la evaluación de ese día; los datos y nombres, a su ficha. */
export async function importEvaluationsAction(items: EvaluationImportItem[]): Promise<StudioResult<{ people: number; evaluations: number }>> {
    if (items.length === 0 || items.length > 300) return { success: false, error: 'No hay nada que importar.' }
    const supabase = await createClient()
    let people = 0
    let evaluations = 0
    for (const item of items) {
        const { data: client } = await supabase.from('clients').select('coach_id').eq('id', item.clientId).maybeSingle()
        if (!client) continue
        for (const entry of item.dates.slice(0, 20)) {
            const results = Object.fromEntries(Object.entries(entry.results).filter(([key, value]) => KEY.test(key) && Number.isFinite(value)))
            const { error } = await supabase.rpc('evaluation_merge', {
                p_client_id: item.clientId,
                p_eval_date: DAY.test(entry.date) ? entry.date : null,
                p_results: results,
                p_source: 'excel',
            })
            if (error) return failure(error)
            evaluations++
        }
        const { data: profile } = await supabase.from('client_evaluation_profiles').select('info, test_names').eq('client_id', item.clientId).maybeSingle()
        const { error } = await supabase.from('client_evaluation_profiles').upsert({
            client_id: item.clientId,
            coach_id: client.coach_id,
            info: { ...(profile?.info ?? {}), ...item.info },
            test_names: { ...(profile?.test_names ?? {}), ...item.names },
            updated_at: new Date().toISOString(),
        })
        if (error) return failure(error)
        people++
    }
    return { success: true, data: { people, evaluations } }
}
