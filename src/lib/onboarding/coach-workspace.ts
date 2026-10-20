import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { findTier, isCycle, type Cycle, type TierId } from '@/components/auth/plans'
import type { DisciplineId, ExpectedAthletesId } from './coach-options'

/** Estado del onboarding guardado en coaches.onboarding_state */
export interface CoachOnboardingState {
    /** Espacio creado con el alta automática (coach nuevo) */
    guided?: boolean
    /** Falta contestar "Tu espacio está listo" */
    welcome_pending?: boolean
    welcome_completed_at?: string
    checklist_dismissed_at?: string
    sample_created_at?: string
    sample_explored_at?: string
    /** Ya se le ofreció configurar su IA tras aprobar una revisión */
    ai_offer_shown_at?: string
}

export interface SignupIntent {
    tier: TierId
    cycle: Cycle
    maxActiveClients: number
    fullName: string | null
}

/**
 * Plan elegido en /signup y guardado en los metadatos del usuario.
 * Solo cuenta si el email ya está confirmado. Los atletas invitados no lo tienen.
 */
export function getSignupIntent(user: User): SignupIntent | null {
    if (!user.email_confirmed_at) return null
    const metadata = user.user_metadata ?? {}
    const tier = findTier(typeof metadata.subscription_tier === 'string' ? metadata.subscription_tier : null)
    const cycle = typeof metadata.billing_cycle === 'string' ? metadata.billing_cycle : null
    if (!tier) return null
    return {
        tier: tier.id,
        cycle: isCycle(cycle) ? cycle : 'monthly',
        maxActiveClients: tier.athletes,
        fullName: typeof metadata.full_name === 'string' ? metadata.full_name.trim() || null : null,
    }
}

/**
 * Crea (o recupera) el espacio del coach que acaba de registrarse.
 * Idempotente: si ya es coach activo devuelve su espacio.
 */
export async function ensureCoachWorkspace(user: User, intent: SignupIntent): Promise<string> {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('create_coach_workspace', {
        p_user_id: user.id,
        p_name: intent.fullName ?? '',
        p_subscription_tier: intent.tier,
        p_billing_cycle: intent.cycle,
        p_max_active_clients: intent.maxActiveClients,
    })
    if (error || typeof data !== 'string') {
        throw new Error(error?.message ?? 'No se pudo crear tu espacio')
    }
    return data
}

export interface CoachWorkspaceInfo {
    id: string
    name: string
    disciplines: DisciplineId[]
    expected_athletes: ExpectedAthletesId | null
    onboarding_state: CoachOnboardingState
}

export async function getCoachWorkspaceInfo(coachId: string): Promise<CoachWorkspaceInfo | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('coaches')
        .select('id, name, disciplines, expected_athletes, onboarding_state')
        .eq('id', coachId)
        .maybeSingle()
    if (error || !data) return null
    return {
        ...data,
        disciplines: (data.disciplines ?? []) as DisciplineId[],
        onboarding_state: (data.onboarding_state ?? {}) as CoachOnboardingState,
    } as CoachWorkspaceInfo
}

/** Mezcla claves en coaches.onboarding_state sin perder las demás */
export async function updateCoachOnboardingState(coachId: string, patch: Partial<CoachOnboardingState>) {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('coaches')
        .select('onboarding_state')
        .eq('id', coachId)
        .single()
    if (error) throw new Error(error.message)
    const next = { ...((data?.onboarding_state ?? {}) as CoachOnboardingState), ...patch }
    const { error: updateError } = await admin
        .from('coaches')
        .update({ onboarding_state: next, updated_at: new Date().toISOString() })
        .eq('id', coachId)
    if (updateError) throw new Error(updateError.message)
    return next
}

/**
 * ¿Toca ofrecer "¿Quieres que los análisis suenen como tú?"? Solo una vez y
 * solo si el coach aún no tiene su perfil de IA aprobado. Lo marca como ofrecido.
 */
export async function claimAiProfileOffer(coachId: string): Promise<boolean> {
    const admin = createAdminClient()
    const [workspace, { data: aiProfile }] = await Promise.all([
        getCoachWorkspaceInfo(coachId),
        admin.from('coach_ai_profiles').select('profile_status').eq('coach_id', coachId).maybeSingle(),
    ])
    if (!workspace || aiProfile?.profile_status === 'approved') return false
    if (workspace.onboarding_state.ai_offer_shown_at) return false
    await updateCoachOnboardingState(coachId, { ai_offer_shown_at: new Date().toISOString() })
    return true
}
