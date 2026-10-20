'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachWorkspaceInfo } from '@/lib/onboarding/coach-workspace'
import { isDisciplineId, isExpectedAthletesId } from '@/lib/onboarding/coach-options'
import { createSampleAthlete } from '@/lib/onboarding/sample-athlete'

export async function completeWelcomeAction(input: {
    businessName: string
    disciplines: string[]
    expectedAthletes: string
}): Promise<{ success: true } | { success: false; error: string }> {
    let coachId: string
    let userId: string
    try {
        ({ coachId, userId } = await requireActiveCoachId())
    } catch {
        return { success: false, error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' }
    }

    const businessName = input.businessName.trim()
    const disciplines = Array.from(new Set(input.disciplines)).filter(isDisciplineId)
    if (!businessName) return { success: false, error: 'Escribe el nombre de tu negocio.' }
    if (businessName.length > 80) return { success: false, error: 'El nombre es demasiado largo (máximo 80 caracteres).' }
    if (disciplines.length === 0) return { success: false, error: 'Elige al menos una disciplina.' }
    if (!isExpectedAthletesId(input.expectedAthletes)) return { success: false, error: 'Indica cuántos atletas llevas, aproximadamente.' }

    const workspace = await getCoachWorkspaceInfo(coachId)
    if (!workspace) return { success: false, error: 'No encontramos tu espacio.' }

    const { welcome_pending: _pending, ...state } = workspace.onboarding_state
    const admin = createAdminClient()
    const { error } = await admin
        .from('coaches')
        .update({
            name: businessName,
            disciplines,
            expected_athletes: input.expectedAthletes,
            onboarding_state: { ...state, welcome_completed_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        })
        .eq('id', coachId)

    if (error) {
        console.error('[completeWelcomeAction]', error)
        return { success: false, error: 'No se pudo guardar. Inténtalo de nuevo.' }
    }

    // Lucía, la atleta de ejemplo. Si falla, el coach entra igualmente a su panel.
    if (state.guided) {
        await createSampleAthlete(coachId, userId).catch(sampleError => {
            console.error('[completeWelcomeAction] No se pudo crear la atleta de ejemplo:', sampleError)
        })
    }

    revalidatePath('/coach', 'layout')
    return { success: true }
}
