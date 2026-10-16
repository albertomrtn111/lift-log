'use server'

import { createClient } from '@/lib/supabase/server'
import { sendPlanUpdatedNotification, type PlanUpdateKind } from '@/lib/notifications/client'

const PLAN_TABLES: Record<PlanUpdateKind, 'training_programs' | 'diet_plans' | 'macro_plans'> = {
    training: 'training_programs',
    diet: 'diet_plans',
    macros: 'macro_plans',
}

type PlanRow = {
    client_id: string
    status?: string | null
    effective_to?: string | null
}

/** Solo avisamos si el plan tocado es el que el cliente ve (o verá) en la app. */
function isPlanVisibleToClient(kind: PlanUpdateKind, plan: PlanRow): boolean {
    if (kind === 'macros') {
        const today = new Date().toISOString().slice(0, 10)
        return !plan.effective_to || plan.effective_to >= today
    }
    return plan.status === 'active'
}

/**
 * Avisa al cliente de que su entrenamiento, dieta o macros han cambiado.
 * Se llama tras un guardado correcto desde el portal del coach (incluidos los
 * flujos que escriben en Supabase desde el navegador). Nunca lanza: un fallo
 * de aviso no debe romper el guardado del coach.
 */
export async function notifyClientPlanUpdatedAction(input: {
    clientId: string
    kind: PlanUpdateKind
    planId?: string | null
}): Promise<{ notified: boolean }> {
    try {
        if (!input.clientId || !PLAN_TABLES[input.kind]) return { notified: false }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { notified: false }

        // RLS: el coach solo ve a sus atletas.
        const { data: client } = await supabase
            .from('clients')
            .select('id, coach_id')
            .eq('id', input.clientId)
            .maybeSingle()
        if (!client) return { notified: false }

        const { data: membership } = await supabase
            .from('coach_memberships')
            .select('coach_id')
            .eq('user_id', user.id)
            .eq('coach_id', client.coach_id)
            .eq('status', 'active')
            .maybeSingle()
        if (!membership) return { notified: false }

        if (input.planId) {
            const columns = input.kind === 'macros' ? 'client_id, effective_to' : 'client_id, status'
            const { data: plan } = await supabase
                .from(PLAN_TABLES[input.kind])
                .select(columns)
                .eq('id', input.planId)
                .maybeSingle()

            const row = plan as PlanRow | null
            if (!row || row.client_id !== input.clientId || !isPlanVisibleToClient(input.kind, row)) {
                return { notified: false }
            }
        }

        const result = await sendPlanUpdatedNotification(input.clientId, input.kind)
        return { notified: result.status === 'sent' }
    } catch (error) {
        console.warn('[notifyClientPlanUpdatedAction] Aviso no enviado (non-blocking):', error)
        return { notified: false }
    }
}
