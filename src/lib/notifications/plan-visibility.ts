import type { PlanUpdateKind } from '@/lib/notifications/client'

// Qué tabla y qué columnas dicen si un plan tocado es el que el atleta ve.
export const PLAN_TABLES: Record<PlanUpdateKind, 'training_programs' | 'diet_plans' | 'macro_plans' | 'cardio_sessions' | 'client_supplements'> = {
    training: 'training_programs',
    diet: 'diet_plans',
    macros: 'macro_plans',
    cardio: 'cardio_sessions',
    supplements: 'client_supplements',
}

export const PLAN_COLUMNS: Record<PlanUpdateKind, string> = {
    training: 'client_id, status',
    diet: 'client_id, status',
    macros: 'client_id, effective_to',
    cardio: 'client_id, scheduled_date',
    supplements: 'client_id, is_active',
}

export type PlanRow = {
    client_id: string
    status?: string | null
    effective_to?: string | null
    scheduled_date?: string | null
    is_active?: boolean | null
}

/** Solo avisamos si el plan tocado es el que el cliente ve (o verá) en la app. */
export function isPlanVisibleToClient(kind: PlanUpdateKind, plan: PlanRow): boolean {
    const today = new Date().toISOString().slice(0, 10)
    if (kind === 'macros') return !plan.effective_to || plan.effective_to >= today
    // Una sesión de cardio pasada no cambia nada de lo que el atleta tiene por delante.
    if (kind === 'cardio') return !plan.scheduled_date || plan.scheduled_date >= today
    if (kind === 'supplements') return plan.is_active !== false
    return plan.status === 'active'
}
