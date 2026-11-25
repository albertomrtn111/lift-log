'use server'

import { getCoachActor } from '@/lib/auth/get-coach-actor'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageTeam } from '@/lib/team/team-rules.js'
import { getCoachWorkspaceInfo, updateCoachOnboardingState } from '@/lib/onboarding/coach-workspace'
import { isDisciplineId, isExpectedAthletesId } from '@/lib/onboarding/coach-options'
import { createSampleAthlete } from '@/lib/onboarding/sample-athlete'
import {
    isSetupStepId,
    METHOD_STEP_IDS,
    methodStepError,
    nextSetupStep,
    sanitizeMethodForm,
    validateAboutYou,
    validateBusiness,
    visibleSetupSteps,
    type SetupStepId,
} from '@/lib/onboarding/coach-setup.js'
import { coachHasInAppAI, generateApprovedCoachProfile } from '@/lib/onboarding/coach-setup-profile'

export type SetupActionResult = { success: true } | { success: false; error: string; field?: string }

export type FinishSetupResult =
    | { success: true; aiEnabled: boolean; aiReady: boolean; aiSummary: string | null }
    | { success: false; error: string; step?: SetupStepId }

/**
 * Solo el propietario o un administrador rellenan el formulario del espacio
 * (y cambian el nombre del negocio, NXT-163).
 */
async function requireSetupManager() {
    let actor: Awaited<ReturnType<typeof getCoachActor>>
    try {
        actor = await getCoachActor()
    } catch {
        return { ok: false, error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' } as const
    }
    if (!canManageTeam(actor.role)) {
        return { ok: false, error: 'Solo el propietario o un administrador del espacio pueden configurarlo.' } as const
    }
    const workspace = await getCoachWorkspaceInfo(actor.coachId)
    if (!workspace) return { ok: false, error: 'No encontramos tu espacio.' } as const
    return { ok: true, actor, workspace } as const
}

const SAVE_ERROR = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'

async function saveMethod(coachId: string, form: Record<string, unknown>) {
    const { error } = await createAdminClient()
        .from('coach_ai_profiles')
        .upsert(
            { coach_id: coachId, onboarding_status: 'in_progress', ...sanitizeMethodForm(form) },
            { onConflict: 'coach_id' },
        )
    if (error) console.error('[welcome/saveMethod]', error)
    return !error
}

/**
 * Guarda un paso del formulario y deja apuntado el siguiente, para retomar
 * ahí si cierra a medias.
 */
export async function saveSetupStepAction(step: string, payload: Record<string, unknown>): Promise<SetupActionResult> {
    const auth = await requireSetupManager()
    if (!auth.ok) return { success: false, error: auth.error }
    const { actor, workspace } = auth
    if (!isSetupStepId(step)) return { success: false, error: 'Paso desconocido.' }

    const admin = createAdminClient()
    const now = new Date().toISOString()
    let disciplines = workspace.disciplines as string[]

    if (step === 'tu') {
        const validated = validateAboutYou(payload)
        if (!validated.ok) return { success: false, error: validated.error, field: validated.field }
        const { fullName, phone, city } = validated.data
        const [profileResult, coachResult] = await Promise.all([
            admin.from('profiles').update({ full_name: fullName, phone, updated_at: now }).eq('id', actor.userId),
            admin.from('coaches').update({ city, updated_at: now }).eq('id', actor.coachId),
        ])
        if (profileResult.error || coachResult.error) {
            console.error('[welcome/tu]', profileResult.error ?? coachResult.error)
            return { success: false, error: SAVE_ERROR }
        }
    } else if (step === 'negocio') {
        const validated = validateBusiness(payload)
        if (!validated.ok) return { success: false, error: validated.error, field: validated.field }
        const { businessName, instagram, website } = validated.data
        const { error } = await admin
            .from('coaches')
            .update({ name: businessName, instagram, website, updated_at: now })
            .eq('id', actor.coachId)
        if (error) {
            console.error('[welcome/negocio]', error)
            return { success: false, error: SAVE_ERROR }
        }
    } else if (step === 'disciplinas') {
        disciplines = Array.from(new Set(Array.isArray(payload.disciplines) ? payload.disciplines : [])).filter(isDisciplineId)
        if (disciplines.length === 0) return { success: false, error: 'Elige al menos una disciplina.', field: 'disciplines' }
        if (!isExpectedAthletesId(payload.expectedAthletes)) {
            return { success: false, error: 'Indica cuántos atletas llevas, aproximadamente.', field: 'expectedAthletes' }
        }
        const { error } = await admin
            .from('coaches')
            .update({ disciplines, expected_athletes: payload.expectedAthletes, updated_at: now })
            .eq('id', actor.coachId)
        if (error) {
            console.error('[welcome/disciplinas]', error)
            return { success: false, error: SAVE_ERROR }
        }
    } else {
        const stepError = methodStepError(step, payload)
        if (stepError) return { success: false, error: stepError }
        if (!(await saveMethod(actor.coachId, payload))) return { success: false, error: SAVE_ERROR }
    }

    const next = nextSetupStep(step, disciplines)
    if (next) await updateCoachOnboardingState(actor.coachId, { setup_step: next }).catch(error => {
        // No es grave: solo sirve para retomar en el paso exacto
        console.error('[welcome/setup_step]', error)
    })
    return { success: true }
}

/**
 * Último paso: guarda el método, crea y aprueba el perfil de IA (en los planes
 * que la incluyen), crea la atleta de ejemplo y da el espacio por configurado.
 * Si la IA falla, el coach entra igualmente (aiReady: false).
 */
export async function finishSetupAction(form: Record<string, unknown>): Promise<FinishSetupResult> {
    const auth = await requireSetupManager()
    if (!auth.ok) return { success: false, error: auth.error }
    const { actor, workspace } = auth

    // Todo lo obligatorio, por si llegó aquí saltándose algún paso
    for (const step of visibleSetupSteps(workspace.disciplines)) {
        if (!METHOD_STEP_IDS.includes(step.id)) continue
        const stepError = methodStepError(step.id, form)
        if (stepError) return { success: false, error: stepError, step: step.id }
    }
    if (!(await saveMethod(actor.coachId, form))) return { success: false, error: SAVE_ERROR }

    // En Starter no hay IA dentro de la app: las respuestas quedan guardadas y no se genera nada
    const aiEnabled = await coachHasInAppAI(actor.coachId)
    const ai = aiEnabled
        ? await generateApprovedCoachProfile(actor.coachId).catch(error => {
            console.error('[welcome/finish] Perfil de IA:', error)
            return { success: false as const, error: 'error' }
        })
        : { success: false as const, error: 'plan' }

    const admin = createAdminClient()
    const fresh = await getCoachWorkspaceInfo(actor.coachId)
    const { welcome_pending: _pending, setup_step: _step, ...state } = fresh?.onboarding_state ?? workspace.onboarding_state
    const { error } = await admin
        .from('coaches')
        .update({
            onboarding_state: { ...state, welcome_completed_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
        })
        .eq('id', actor.coachId)
    if (error) {
        console.error('[welcome/finish]', error)
        return { success: false, error: SAVE_ERROR }
    }

    // Lucía, la atleta de ejemplo. Si falla, el coach entra igualmente a su panel.
    if (state.guided) {
        await createSampleAthlete(actor.coachId, actor.userId).catch(sampleError => {
            console.error('[welcome/finish] No se pudo crear la atleta de ejemplo:', sampleError)
        })
    }

    let aiSummary: string | null = null
    if (ai.success) {
        const { data } = await admin
            .from('coach_ai_profiles')
            .select('generated_profile_summary')
            .eq('coach_id', actor.coachId)
            .maybeSingle()
        aiSummary = typeof data?.generated_profile_summary === 'string' ? data.generated_profile_summary : null
    }

    // Sin revalidatePath: refrescaría /welcome, que ya redirige al panel, y el coach se
    // saltaría la pantalla final. «Ir a mi panel» entra con una carga completa.
    return { success: true, aiEnabled, aiReady: ai.success, aiSummary }
}
