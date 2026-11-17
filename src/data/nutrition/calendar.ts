import { createClient } from '@/lib/supabase/client'
import type { MacroDayTypeConfig } from './types'

/**
 * Calendario de nutrición: lo que toca cada día según la regla única
 * nutrition_targets_for (día planificado > plan base vigente en esa fecha).
 */
export interface CalendarDay {
    day: string
    source: 'planned' | 'base' | 'none'
    block_id: string | null
    block_name: string | null
    planned_day_id: string | null
    label: string | null
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps: number | null
    day_type_config: MacroDayTypeConfig | null
    macro_plan_id: string | null
    diet_plan_id: string | null
}

/** Un día listo para guardar en un bloque. */
export interface PlannedDayInput {
    date: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    day_type_config?: MacroDayTypeConfig | null
    steps?: number | null
    label?: string | null
    diet_plan_id?: string | null
    notes?: string | null
}

export interface BlockInput {
    name: string
    kind: 'week' | 'days' | 'block'
    progression?: Record<string, unknown> | null
    notes?: string | null
    change_note?: string | null
}

export interface SavedBlock {
    id: string
    name: string
    start_date: string
    end_date: string
    days: number
    replaced_dates: string[]
    archived_block_ids: string[]
}

/** Error del guardado cuando el bloque pisa días ya planificados y hay que confirmarlo. */
export class PlannedDaysConflictError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PlannedDaysConflictError'
    }
}

const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

export function toCalendarDay(row: Record<string, any>): CalendarDay {
    const cfg = row.day_type_config
    return {
        day: row.day,
        source: row.source,
        block_id: row.block_id ?? null,
        block_name: row.block_name ?? null,
        planned_day_id: row.planned_day_id ?? null,
        label: row.label ?? null,
        kcal: num(row.kcal),
        protein_g: num(row.protein_g),
        carbs_g: num(row.carbs_g),
        fat_g: num(row.fat_g),
        steps: row.steps === null || row.steps === undefined ? null : num(row.steps),
        day_type_config: cfg?.training && cfg?.rest ? cfg : null,
        macro_plan_id: row.macro_plan_id ?? null,
        diet_plan_id: row.diet_plan_id ?? null,
    }
}

export async function getNutritionCalendar(clientId: string, from: string, to: string): Promise<CalendarDay[]> {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('nutrition_targets_for', {
        p_client_id: clientId,
        p_from: from,
        p_to: to,
    })
    if (error) {
        console.error('Error fetching nutrition calendar:', error)
        throw error
    }
    return ((data as Record<string, any>[]) || []).map(toCalendarDay)
}

export async function saveNutritionBlock(params: {
    coachId: string
    clientId: string
    blockId?: string | null
    block: BlockInput
    days: PlannedDayInput[]
    replaceConflicts?: boolean
}): Promise<SavedBlock> {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('save_nutrition_block', {
        p_coach_id: params.coachId,
        p_client_id: params.clientId,
        p_block_id: params.blockId ?? null,
        p_block: params.block,
        p_days: params.days,
        p_replace_conflicts: params.replaceConflicts ?? false,
    })
    if (error) {
        if (error.hint === 'replace_conflicts') throw new PlannedDaysConflictError(error.message)
        console.error('Error saving nutrition block:', error)
        throw error
    }
    return data as SavedBlock
}

/** Devuelve esos días al plan base. Los días pasados no se tocan. */
export async function clearPlannedDays(coachId: string, clientId: string, dates: string[]) {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('clear_nutrition_planned_days', {
        p_coach_id: coachId,
        p_client_id: clientId,
        p_dates: dates,
    })
    if (error) {
        console.error('Error clearing planned days:', error)
        throw error
    }
    return data as { cleared_dates: string[]; archived_block_ids: string[] }
}

export interface PlannedDayRow {
    plan_date: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    day_type_config: MacroDayTypeConfig | null
    label: string | null
    archived_at: string | null
}

/** Días de un bloque (vigentes y sustituidos) para el historial. */
export async function getBlockDays(blockId: string): Promise<PlannedDayRow[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('nutrition_planned_days')
        .select('plan_date, kcal, protein_g, carbs_g, fat_g, day_type_config, label, archived_at')
        .eq('block_id', blockId)
        .order('plan_date', { ascending: true })
        .order('created_at', { ascending: false })
    if (error) throw error
    // Si un día se rehízo, se queda el más reciente
    const seen = new Set<string>()
    return ((data as PlannedDayRow[]) || []).filter(d => !seen.has(d.plan_date) && seen.add(d.plan_date))
}

export interface DietChoice {
    id: string
    name: string
    status: string
}

/** Dietas por opciones que se pueden asignar a días concretos. */
export async function listAssignableDiets(coachId: string, clientId: string): Promise<DietChoice[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('diet_plans')
        .select('id, name, status')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .in('status', ['active', 'scheduled', 'draft'])
        .order('created_at', { ascending: false })
    if (error) throw error
    return (data as DietChoice[]) || []
}

/** Un borrador asignado a días concretos pasa a «programada» (no sustituye a la activa). */
export async function markDietScheduled(dietPlanId: string) {
    const supabase = createClient()
    const { error } = await supabase
        .from('diet_plans')
        .update({ status: 'scheduled' })
        .eq('id', dietPlanId)
        .eq('status', 'draft')
    if (error) throw error
}
