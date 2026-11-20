import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface AthleteUsage {
    /** Atletas activos sin contar la de ejemplo */
    active: number
    /** Límite del plan; null = sin límite */
    limit: number | null
    /** La suscripción da acceso (no está cancelada ni caducada) */
    live: boolean
}

/**
 * Atletas activos frente al límite del plan, con las mismas reglas que la base
 * (coach_feature_limit). Si no se puede leer, null: la base decide igualmente.
 */
export async function getAthleteUsage(coachId: string): Promise<AthleteUsage | null> {
    const admin = createAdminClient()
    const [limit, plan, clients] = await Promise.all([
        admin.rpc('coach_feature_limit', { p_coach_id: coachId, p_feature: 'max_active_clients' }),
        admin.rpc('coach_effective_plan', { p_coach_id: coachId }),
        admin.from('clients').select('id', { count: 'exact', head: true })
            .eq('coach_id', coachId).eq('status', 'active').eq('is_sample', false),
    ])
    if (limit.error || plan.error || clients.error) {
        console.warn('[plan-usage] No se pudo leer el límite de atletas:', limit.error?.message ?? plan.error?.message ?? clients.error?.message)
        return null
    }
    return {
        active: clients.count ?? 0,
        limit: typeof limit.data === 'number' ? limit.data : null,
        live: plan.data !== null,
    }
}
