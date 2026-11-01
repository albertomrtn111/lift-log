'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCoachAthleteJoined } from '@/lib/notifications/coach'

type StepId = 'install' | 'push' | 'watch'
type Resolution = 'done' | 'skipped'

const STEPS: StepId[] = ['install', 'push', 'watch']

/** Marca un paso de la bienvenida como hecho u omitido (en clients.preferences.onboarding) */
export async function setAthleteOnboardingStepAction(step: StepId, resolution: Resolution): Promise<{ success: boolean }> {
    if (!STEPS.includes(step) || (resolution !== 'done' && resolution !== 'skipped')) return { success: false }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const admin = createAdminClient()
    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id, preferences')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (!client) return { success: false }

    const preferences = (client.preferences ?? {}) as { onboarding?: Record<string, string> }
    const isFirstStep = Object.keys(preferences.onboarding ?? {}).length === 0
    const onboarding = { ...(preferences.onboarding ?? {}) }
    // "Hecho" no se rebaja a "omitido" si el atleta vuelve atrás
    if (onboarding[step] !== 'done') onboarding[step] = resolution

    const { error } = await admin
        .from('clients')
        .update({ preferences: { ...preferences, onboarding }, onboarding_updated_at: new Date().toISOString() })
        .eq('id', client.id)
    if (error) {
        console.error('[setAthleteOnboardingStepAction]', error)
        return { success: false }
    }

    // Primer paso de la bienvenida = primera vez en la app: el coach lo ve en su campana.
    if (isFirstStep && client.coach_id) {
        await notifyCoachAthleteJoined({ coachId: client.coach_id, clientId: client.id })
    }

    revalidatePath('/bienvenida')
    return { success: true }
}
