import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachWorkspaceInfo } from './coach-workspace'
import { buildCoachChecklist, type Checklist } from './checklist.js'

/** Tablas que cuentan como "primer plan" de un atleta */
const PLAN_TABLES = ['training_programs', 'diet_plans', 'macro_plans', 'cardio_sessions'] as const

export async function getCoachChecklist(coachId: string): Promise<Checklist | null> {
    const workspace = await getCoachWorkspaceInfo(coachId)
    if (!workspace) return null

    const admin = createAdminClient()
    const { data: clients, error } = await admin
        .from('clients')
        .select('id, is_sample, status, created_at')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: true })

    // Sin la migración aplicada no podemos distinguir a la atleta de ejemplo
    if (error) {
        console.warn('[getCoachChecklist]', error.message)
        return null
    }

    const sample = clients.find(client => client.is_sample) ?? null
    const realClients = clients.filter(client => !client.is_sample)
    const firstRealClient = realClients.find(client => client.status === 'active') ?? realClients[0] ?? null
    const realIds = realClients.map(client => client.id)

    const [hasFirstPlan, aiProfile] = await Promise.all([
        realIds.length === 0
            ? Promise.resolve(false)
            : Promise.all(PLAN_TABLES.map(table =>
                admin.from(table).select('id', { count: 'exact', head: true }).eq('coach_id', coachId).in('client_id', realIds)
            )).then(results => results.some(result => (result.count ?? 0) > 0)),
        admin.from('coach_ai_profiles').select('profile_status').eq('coach_id', coachId).maybeSingle(),
    ])

    return buildCoachChecklist({
        state: workspace.onboarding_state,
        sampleClientId: sample?.id ?? null,
        firstRealClientId: firstRealClient?.id ?? null,
        realClientCount: realClients.length,
        hasFirstPlan,
        aiProfileApproved: aiProfile.data?.profile_status === 'approved',
    })
}
