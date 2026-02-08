import { createClient } from '@/lib/supabase/server'
import type { Client } from '@/types/coach'

// ============================================================================
// TYPES
// ============================================================================

export interface Review {
    id: string
    coach_id: string
    client_id: string
    checkin_id: string
    status: 'draft' | 'approved' | 'rejected'
    summary: string | null
    analysis: Record<string, unknown> | null
    proposal: Record<string, unknown> | null
    message_to_client: string | null
    created_by: string | null
    approved_by: string | null
    created_at: string
}

export interface Checkin {
    id: string
    coach_id: string
    client_id: string
    submitted_at: string
    period_start: string | null
    period_end: string | null
    weight_kg: number | null
    weight_avg_kg: number | null
    steps_avg: number | null
    training_adherence_pct: number | null
    nutrition_adherence_pct: number | null
    sleep_avg_h: number | null
    notes: string | null
    raw_payload: Record<string, unknown> | null
}

export interface CheckinWithReview extends Checkin {
    review: Review | null
}

export interface ClientStatus {
    lastCheckinDate: string | null
    daysSinceCheckin: number | null
    nextCheckinDate: string
    daysUntilCheckin: number
    trainingAdherence: number | null
    nutritionAdherence: number | null
    statusLevel: 'ok' | 'warning' | 'risk'
}

export interface MacroPlan {
    id: string
    coach_id: string
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps_goal: number | null
    cardio_goal: string | null
    notes: string | null
    effective_from: string
    effective_to: string | null
    created_at: string
}

export interface TrainingProgram {
    id: string
    coach_id: string
    client_id: string
    name: string
    status: 'draft' | 'active' | 'completed' | 'archived'
    total_weeks: number
    effective_from: string
    effective_to: string | null
    created_at: string
}

// Diet plan with meals structure
export interface DietPlanMealItem {
    quantity: string
    name: string
    note?: string
}

export interface DietPlanMealOption {
    title: string
    items: DietPlanMealItem[]
    notes?: string
}

export interface DietPlanMeals {
    meals_per_day: number
    labels: string[]
    days: {
        default: Record<string, { options: DietPlanMealOption[] }>
    }
}

export interface DietPlan {
    id: string
    coach_id: string
    client_id: string
    name: string
    meals: DietPlanMeals
    effective_from: string
    effective_to: string | null
    created_at: string
}

// ============================================================================
// CLIENT QUERIES
// ============================================================================

export async function getClientForWorkspace(coachId: string, clientId: string): Promise<Client | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('coach_id', coachId)
        .eq('id', clientId)
        .single()

    if (error || !data) return null
    return data as Client
}

export async function getClientsForSelector(coachId: string): Promise<Pick<Client, 'id' | 'full_name' | 'email' | 'status'>[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, email, status')
        .eq('coach_id', coachId)
        .order('status', { ascending: true })
        .order('full_name', { ascending: true })

    if (error || !data) return []
    return data
}

// ============================================================================
// CLIENT STATUS
// ============================================================================

export async function getClientStatus(coachId: string, clientId: string): Promise<ClientStatus | null> {
    const supabase = await createClient()
    const today = new Date()

    // Get client
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('next_checkin_date')
        .eq('coach_id', coachId)
        .eq('id', clientId)
        .single()

    if (clientError || !client) return null

    // Get latest checkin
    const { data: checkin } = await supabase
        .from('checkins')
        .select('submitted_at, training_adherence_pct, nutrition_adherence_pct')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()

    const nextCheckin = new Date(client.next_checkin_date)
    const daysUntilCheckin = Math.ceil((nextCheckin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    let daysSinceCheckin: number | null = null
    if (checkin?.submitted_at) {
        const lastCheckin = new Date(checkin.submitted_at)
        daysSinceCheckin = Math.floor((today.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60 * 24))
    }

    const trainingAdh = checkin?.training_adherence_pct ?? null
    const nutritionAdh = checkin?.nutrition_adherence_pct ?? null

    // Calculate status level
    let statusLevel: 'ok' | 'warning' | 'risk' = 'ok'
    if (daysUntilCheckin < -3 || (trainingAdh !== null && trainingAdh < 60) || (nutritionAdh !== null && nutritionAdh < 60)) {
        statusLevel = 'risk'
    } else if (daysUntilCheckin < 0 || (trainingAdh !== null && trainingAdh < 75) || (nutritionAdh !== null && nutritionAdh < 75)) {
        statusLevel = 'warning'
    }

    return {
        lastCheckinDate: checkin?.submitted_at?.split('T')[0] || null,
        daysSinceCheckin,
        nextCheckinDate: client.next_checkin_date,
        daysUntilCheckin,
        trainingAdherence: trainingAdh,
        nutritionAdherence: nutritionAdh,
        statusLevel,
    }
}

// ============================================================================
// CHECK-IN QUERIES
// ============================================================================

export async function listCheckins(coachId: string, clientId: string): Promise<CheckinWithReview[]> {
    const supabase = await createClient()

    const { data: checkins, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })

    if (error || !checkins) return []

    // Get reviews for these checkins
    const checkinIds = checkins.map(c => c.id)
    const { data: reviews } = await supabase
        .from('reviews')
        .select('*')
        .in('checkin_id', checkinIds)

    const reviewMap = new Map(reviews?.map(r => [r.checkin_id, r]) || [])

    return checkins.map(checkin => ({
        ...checkin,
        review: reviewMap.get(checkin.id) || null,
    })) as CheckinWithReview[]
}

export async function getLatestCheckin(coachId: string, clientId: string): Promise<CheckinWithReview | null> {
    const supabase = await createClient()

    const { data: checkin, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .single()

    if (error || !checkin) return null

    // Get review
    const { data: review } = await supabase
        .from('reviews')
        .select('*')
        .eq('checkin_id', checkin.id)
        .single()

    return {
        ...checkin,
        review: review || null,
    } as CheckinWithReview
}

// ============================================================================
// REVIEW CRUD
// ============================================================================

export async function getReviewByCheckin(checkinId: string): Promise<Review | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('checkin_id', checkinId)
        .single()

    if (error || !data) return null
    return data as Review
}

export async function createReviewForCheckin(
    coachId: string,
    clientId: string,
    checkinId: string,
    createdBy: string
): Promise<Review | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('reviews')
        .insert({
            coach_id: coachId,
            client_id: clientId,
            checkin_id: checkinId,
            status: 'draft',
            created_by: createdBy,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating review:', error)
        return null
    }
    return data as Review
}

export async function updateReview(
    reviewId: string,
    updates: Partial<Pick<Review, 'summary' | 'analysis' | 'proposal' | 'message_to_client' | 'status' | 'approved_by'>>
): Promise<boolean> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('reviews')
        .update(updates)
        .eq('id', reviewId)

    if (error) {
        console.error('Error updating review:', error)
        return false
    }
    return true
}

// ============================================================================
// MACRO PLAN QUERIES
// ============================================================================

export async function getActiveMacroPlan(coachId: string, clientId: string): Promise<MacroPlan | null> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Active plan: effective_from <= today AND (effective_to IS NULL OR effective_to >= today)
    // Order by effective_from DESC, then created_at DESC for same-day plans
    const { data, error } = await supabase
        .from('macro_plans')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error || !data) return null
    return data as MacroPlan
}

export async function listMacroPlans(coachId: string, clientId: string): Promise<MacroPlan[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('macro_plans')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('effective_from', { ascending: false })

    if (error || !data) return []
    return data as MacroPlan[]
}

export async function upsertMacroPlan(plan: Omit<MacroPlan, 'id' | 'created_at'>): Promise<MacroPlan | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('macro_plans')
        .upsert(plan)
        .select()
        .single()

    if (error) {
        console.error('Error upserting macro plan:', error)
        return null
    }
    return data as MacroPlan
}

// ============================================================================
// DIET PLAN QUERIES
// ============================================================================

export async function getActiveDietPlan(coachId: string, clientId: string): Promise<DietPlan | null> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Active plan: effective_from <= today AND (effective_to IS NULL OR effective_to >= today)
    const { data, error } = await supabase
        .from('diet_plans')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error || !data) return null
    return data as DietPlan
}

export async function listDietPlans(coachId: string, clientId: string): Promise<DietPlan[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('diet_plans')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('effective_from', { ascending: false })

    if (error || !data) return []
    return data as DietPlan[]
}

// ============================================================================
// TRAINING PROGRAM QUERIES
// ============================================================================

export async function getActiveTrainingProgram(coachId: string, clientId: string): Promise<TrainingProgram | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_programs')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0] as TrainingProgram
}

export async function listTrainingPrograms(coachId: string, clientId: string): Promise<TrainingProgram[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_programs')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as TrainingProgram[]
}

export async function getTrainingDays(programId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_days')
        .select('*')
        .eq('program_id', programId)
        .order('day_order', { ascending: true })

    if (error || !data) return []
    return data
}

export async function getTrainingColumns(programId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_columns')
        .select('*')
        .eq('program_id', programId)
        .order('col_order', { ascending: true })

    if (error || !data) return []
    return data
}

export async function getTrainingExercises(dayId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_exercises')
        .select('*')
        .eq('day_id', dayId)
        .order('exercise_order', { ascending: true })

    if (error || !data) return []
    return data
}

export async function getTrainingCells(programId: string, dayId: string, weekIndex: number) {
    const supabase = await createClient()

    // Get exercises for this day
    const { data: exercises } = await supabase
        .from('training_exercises')
        .select('id')
        .eq('day_id', dayId)

    if (!exercises) return []
    const exerciseIds = exercises.map(e => e.id)

    const { data, error } = await supabase
        .from('training_cells')
        .select('*')
        .in('exercise_id', exerciseIds)
        .eq('week_index', weekIndex)

    if (error || !data) return []
    return data
}

// ============================================================================
// CLIENT METRICS / PROGRESS
// ============================================================================

export async function getClientMetrics(coachId: string, clientId: string, days: number = 30) {
    const supabase = await createClient()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Try client_metrics first
    const { data: metrics } = await supabase
        .from('client_metrics')
        .select('*')
        .eq('client_id', clientId)
        .gte('metric_date', startDate.toISOString().split('T')[0])
        .order('metric_date', { ascending: true })

    if (metrics && metrics.length > 0) {
        return metrics
    }

    // Fallback to checkins
    const { data: checkins } = await supabase
        .from('checkins')
        .select('submitted_at, weight_kg, weight_avg_kg, steps_avg, sleep_avg_h, training_adherence_pct, nutrition_adherence_pct')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .gte('submitted_at', startDate.toISOString())
        .order('submitted_at', { ascending: true })

    return checkins?.map(c => ({
        metric_date: c.submitted_at.split('T')[0],
        weight_kg: c.weight_avg_kg || c.weight_kg,
        steps: c.steps_avg,
        sleep_h: c.sleep_avg_h,
        training_adherence: c.training_adherence_pct,
        nutrition_adherence: c.nutrition_adherence_pct,
    })) || []
}
