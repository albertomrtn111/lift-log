import { createClient } from '@/lib/supabase/client'
import type { MacroDayTypeConfig } from './types'

/**
 * Historial de nutrición: cada plan de macros y cada dieta por opciones
 * (sin borradores), con sus fechas, el motivo del cambio y el peso del atleta
 * al empezar y al terminar. Sale de la vista nutrition_plan_history.
 */
export interface NutritionHistoryEntry {
    kind: 'macros' | 'options'
    id: string
    name: string | null
    effective_from: string
    effective_to: string | null
    archived_at: string | null
    change_note: string | null
    notes: string | null
    status: 'active' | 'scheduled' | 'archived'
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    steps: number | null
    day_type_config: MacroDayTypeConfig | null
    meals_count: number | null
    days: number
    start_weight_kg: number | null
    end_weight_kg: number | null
    created_at: string
}

export interface WeightPoint {
    date: string
    weight: number
}

export interface NutritionHistory {
    plans: NutritionHistoryEntry[]
    weights: WeightPoint[]
}

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
}

export async function getNutritionHistory(coachId: string, clientId: string): Promise<NutritionHistory> {
    const supabase = createClient()

    const { data, error } = await supabase
        .from('nutrition_plan_history')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching nutrition history:', error)
        throw error
    }

    const plans: NutritionHistoryEntry[] = (data || []).map((row: Record<string, any>) => ({
        ...row,
        kcal: toNumber(row.kcal),
        protein_g: toNumber(row.protein_g),
        carbs_g: toNumber(row.carbs_g),
        fat_g: toNumber(row.fat_g),
        steps: toNumber(row.steps),
        days: toNumber(row.days) ?? 0,
        start_weight_kg: toNumber(row.start_weight_kg),
        end_weight_kg: toNumber(row.end_weight_kg),
    })) as NutritionHistoryEntry[]

    const firstStart = plans.reduce<string | null>(
        (min, p) => (!min || p.effective_from < min ? p.effective_from : min),
        null,
    )
    if (!firstStart) return { plans, weights: [] }

    // Peso desde dos semanas antes del primer plan: registro diario y, si el
    // atleta no lo usa, los check-ins.
    const since = new Date(`${firstStart}T00:00:00Z`)
    since.setUTCDate(since.getUTCDate() - 14)
    const sinceDate = since.toISOString().slice(0, 10)

    const { data: metrics, error: metricsError } = await supabase
        .from('client_metrics')
        .select('metric_date, weight_kg')
        .eq('client_id', clientId)
        .gte('metric_date', sinceDate)
        .not('weight_kg', 'is', null)
        .order('metric_date', { ascending: true })

    if (metricsError) throw metricsError

    let weights: WeightPoint[] = (metrics || [])
        .map(m => ({ date: m.metric_date as string, weight: toNumber(m.weight_kg) ?? 0 }))
        .filter(p => p.weight > 0)

    if (weights.length < 2) {
        const { data: checkins, error: checkinsError } = await supabase
            .from('checkins')
            .select('submitted_at, period_end, weight_kg, weight_avg_kg')
            .eq('client_id', clientId)
            .gte('period_end', sinceDate)
            .order('period_end', { ascending: true })

        if (checkinsError) throw checkinsError

        weights = (checkins || [])
            .map(c => ({
                date: ((c.submitted_at as string | null)?.slice(0, 10) ?? c.period_end) as string,
                weight: toNumber(c.weight_avg_kg) ?? toNumber(c.weight_kg) ?? 0,
            }))
            .filter(p => p.date && p.weight > 0)
    }

    return { plans, weights }
}
