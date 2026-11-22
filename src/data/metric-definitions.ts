'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import type { MetricDefinition } from '@/types/metrics'
import { decideMetricRemoval, normalizeMetricUsage } from '@/lib/safe-delete'

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getMetricDefinitions(): Promise<MetricDefinition[]> {
    const { supabase, coachId } = await requireActiveCoachId()

    const { data, error } = await supabase
        .from('metric_definitions')
        .select('*')
        .eq('coach_id', coachId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

    if (error) {
        console.error('[getMetricDefinitions] Error:', error)
        return []
    }

    return data as MetricDefinition[]
}

export async function createMetricDefinition(data: {
    name: string
    description?: string | null
    unit?: string | null
    value_type: string
    category: string
    min_value?: number | null
    max_value?: number | null
}): Promise<{ success: boolean; data?: MetricDefinition; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    // Get max sort_order
    const { data: maxSort } = await supabase
        .from('metric_definitions')
        .select('sort_order')
        .eq('coach_id', coachId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

    const newSortOrder = (maxSort?.sort_order ?? 0) + 1

    const { data: newMetric, error } = await supabase
        .from('metric_definitions')
        .insert({
            coach_id: coachId,
            ...data,
            is_active: true,
            sort_order: newSortOrder,
        })
        .select()
        .single()

    if (error) {
        console.error('[createMetricDefinition] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/metrics')
    return { success: true, data: newMetric as MetricDefinition }
}

export async function updateMetricDefinition(
    id: string,
    updates: Partial<MetricDefinition>
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    const { error } = await supabase
        .from('metric_definitions')
        .update(updates)
        .eq('id', id)
        .eq('coach_id', coachId)

    if (error) {
        console.error('[updateMetricDefinition] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/metrics')
    return { success: true }
}

export async function toggleMetricActive(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    // Get current state
    const { data: metric, error: fetchErr } = await supabase
        .from('metric_definitions')
        .select('is_active')
        .eq('id', id)
        .eq('coach_id', coachId)
        .single()

    if (fetchErr || !metric) {
        return { success: false, error: 'Metric not found' }
    }

    const { error } = await supabase
        .from('metric_definitions')
        .update({ is_active: !metric.is_active })
        .eq('id', id)
        .eq('coach_id', coachId)

    if (error) {
        console.error('[toggleMetricActive] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/metrics')
    return { success: true }
}

/** Valores de la métrica en las revisiones de todos los atletas, para el aviso de NXT-149. */
export async function getMetricRemovalInfo(id: string): Promise<
    { success: true; usage: ReturnType<typeof normalizeMetricUsage> } | { success: false; error: string }
> {
    const { supabase } = await requireActiveCoachId()
    const { data, error } = await supabase.rpc('nexttrain_metric_usage', { p_metric_id: id })
    if (error || !data) return { success: false, error: 'No se ha podido comprobar si la métrica tiene valores. No se ha borrado nada.' }
    return { success: true, usage: normalizeMetricUsage(data) }
}

/**
 * «Eliminar» una métrica (NXT-149). Si tiene valores en alguna revisión, se archiva:
 * deja de pedirse (is_active = false) y su historial conserva el nombre y la unidad.
 * Sin valores, se borra como antes.
 */
export async function deleteMetricDefinition(id: string): Promise<
    { success: true; mode: 'archive' | 'delete' } | { success: false; error: string }
> {
    const { supabase, coachId } = await requireActiveCoachId()

    const archive = async () => {
        const { data, error } = await supabase
            .from('metric_definitions')
            .update({ archived_at: new Date().toISOString(), is_active: false })
            .eq('id', id)
            .eq('coach_id', coachId)
            .select('id')
        if (error || !data || data.length === 0) {
            return { success: false as const, error: error?.message ?? 'No se ha podido archivar la métrica.' }
        }
        revalidatePath('/coach/metrics')
        return { success: true as const, mode: 'archive' as const }
    }

    const info = await getMetricRemovalInfo(id)
    if (!info.success) return info
    if (decideMetricRemoval(info.usage) === 'archive') return archive()

    const { data, error } = await supabase
        .from('metric_definitions')
        .delete()
        .eq('id', id)
        .eq('coach_id', coachId)
        .select('id')

    if (error) {
        // Si entretanto alguien ha guardado un valor, la base no deja borrarla: se archiva.
        if (/valores/i.test(error.message)) return archive()
        console.error('[deleteMetricDefinition] Error:', error)
        return { success: false, error: error.message }
    }
    if (!data || data.length === 0) return { success: false, error: 'No se ha podido eliminar la métrica.' }

    revalidatePath('/coach/metrics')
    return { success: true, mode: 'delete' }
}

/** Saca una métrica de «Archivadas» y vuelve a pedirse en las revisiones (NXT-149). */
export async function restoreArchivedMetric(id: string): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()
    const { data, error } = await supabase
        .from('metric_definitions')
        .update({ archived_at: null, is_active: true })
        .eq('id', id)
        .eq('coach_id', coachId)
        .select('id')
    if (error || !data || data.length === 0) {
        return { success: false, error: error?.message ?? 'No se ha podido recuperar la métrica.' }
    }
    revalidatePath('/coach/metrics')
    return { success: true }
}

export async function reorderMetricDefinitions(ids: string[]): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    // Execute sequential updates to avoid locking issues with mass bulk update
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const { error } = await supabase
            .from('metric_definitions')
            .update({ sort_order: i })
            .eq('id', id)
            .eq('coach_id', coachId)

        if (error) {
            console.error('[reorderMetricDefinitions] Error on update:', error)
            return { success: false, error: error.message }
        }
    }

    revalidatePath('/coach/metrics')
    return { success: true }
}
