import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
    getCoachAIProfile,
    markOnboardingComplete,
    saveGeneratedProfile,
    saveGenerationError,
} from '@/data/coach-ai-profile'
import { generateCoachAIProfile } from '@/lib/ai/generate-coach-profile'

/**
 * ¿El plan del espacio incluye la IA dentro de la app? (Starter no, NXT-152.)
 * Mientras la función «ai» no exista en plan_features, no se corta a nadie.
 */
export async function coachHasInAppAI(coachId: string): Promise<boolean> {
    const admin = createAdminClient()
    const { count, error: countError } = await admin
        .from('plan_features')
        .select('plan', { count: 'exact', head: true })
        .eq('feature', 'ai')
    if (countError) {
        console.error('[coachHasInAppAI]', countError.message)
        return true
    }
    if (!count) return true
    const { data, error } = await admin.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'ai' })
    if (error) {
        console.error('[coachHasInAppAI]', error.message)
        return false
    }
    return data === true
}

/**
 * Al terminar el formulario guiado: genera el perfil de IA con sus respuestas
 * y lo deja aprobado, sin pantalla de revisión. Si la IA falla, las respuestas
 * quedan guardadas y el coach puede generarlo después desde Ajustes › Perfil.
 */
export async function generateApprovedCoachProfile(coachId: string): Promise<{ success: true } | { success: false; error: string }> {
    const profile = await getCoachAIProfile(coachId)
    if (!profile) return { success: false, error: 'No hay respuestas guardadas.' }

    await markOnboardingComplete(coachId)
    const result = await generateCoachAIProfile(profile)
    if (!result.success) {
        await saveGenerationError(coachId, result.error)
        return { success: false, error: result.error }
    }

    const { output } = result
    const saved = await saveGeneratedProfile(coachId, {
        generated_profile_summary: output.professional_summary,
        generated_methodology: output.methodology,
        generated_communication_style: output.communication_style,
        generated_master_rules: output.master_rules,
        generated_system_prompt: output.system_prompt,
        generated_profile_json: output as Record<string, unknown>,
    })
    if (!saved.success) return { success: false, error: saved.error ?? 'No se pudo guardar el perfil.' }

    const { error } = await createAdminClient()
        .from('coach_ai_profiles')
        .update({ profile_status: 'approved', approved_at: new Date().toISOString() })
        .eq('coach_id', coachId)
    if (error) return { success: false, error: error.message }
    return { success: true }
}
