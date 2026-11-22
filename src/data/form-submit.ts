'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureReviewForCheckin } from '@/data/workspace'
import { generateCheckinAnalysis, type GenerateCheckinAnalysisResult } from '@/lib/ai/analyze-checkin'
import { ensureCheckinReviewTemplateLink } from '@/lib/reviews/checkin-template-linking'
import { notifyCoachCheckinSubmitted, notifyCoachOnboardingCompleted } from '@/lib/notifications/coach'
import { markReviewNotificationsRead } from '@/lib/notifications/client'
import { canAthleteChangeCheckin, checkinBlockedCopy } from '@/lib/reviews/checkin-submission-rules'
import { loadCheckinSubmissionState } from '@/lib/reviews/checkin-submission-state'

/** Lo que esperamos al borrador de IA antes de avisar al coach sin él. */
const AI_DRAFT_WAIT_MS = 90_000

/**
 * Avisa al coach cuando termine el análisis de IA (para poder decir
 * «borrador listo») o, como mucho, a los 90 s. Nunca lanza.
 */
function notifyCoachAfterAnalysis(
    analysis: Promise<GenerateCheckinAnalysisResult> | null,
    input: { coachId: string; clientId: string; checkinId: string }
) {
    const aiReady = analysis
        ? Promise.race([
            analysis.then(result => result.success).catch(() => false),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), AI_DRAFT_WAIT_MS)),
        ])
        : Promise.resolve(false)

    void aiReady.then(ready => notifyCoachCheckinSubmitted({ ...input, aiReady: ready }))
}

interface SubmitFormResult {
    success: boolean
    error?: string
    isOnboarding?: boolean
    /** El check-in ya no admite cambios (cerrado por el coach o caducado) */
    closed?: boolean
}

export async function submitFormAction(
    checkinId: string,
    payload: Record<string, unknown>
): Promise<SubmitFormResult> {
    const supabase = await createClient()

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }
    const admin = createAdminClient()

    // 2. Verify the checkin exists and load its type
    const { data: checkin, error: checkinErr } = await admin
        .from('checkins')
        .select('id, coach_id, client_id, type, status, submitted_at, created_at, form_template_id, review_template_id, review_schedule_id, period_start, period_end')
        .eq('id', checkinId)
        .single()

    if (checkinErr || !checkin) {
        return { success: false, error: 'Formulario no encontrado' }
    }

    // 3. Verify ownership: the client's auth_user_id must match the current user
    const { data: client } = await admin
        .from('clients')
        .select('id, auth_user_id, user_id, status')
        .eq('id', checkin.client_id)
        .single()

    if (!client || (client.auth_user_id !== user.id && client.user_id !== user.id)) {
        return { success: false, error: 'No tienes permiso para enviar este formulario' }
    }
    if (client.status !== 'active') {
        return { success: false, error: 'Te has quedado sin licencia: habla con tu entrenador para volver a enviar revisiones.' }
    }

    // 4. Validate server-side photo requirements from the review template.
    const linkedCheckin = await ensureCheckinReviewTemplateLink(admin, checkin)

    // Revisión cerrada por el coach (o caducada): no se cambia nada.
    const submissionState = await loadCheckinSubmissionState(admin, checkin)
    if (!submissionState || !canAthleteChangeCheckin(submissionState)) {
        return {
            success: false,
            closed: true,
            error: checkinBlockedCopy(submissionState ?? 'closed')?.message,
        }
    }

    if (linkedCheckin.review_template_id) {
        const { data: reviewTemplate, error: reviewTemplateErr } = await admin
            .from('review_templates')
            .select('include_progress_photos, photos_required, photos_max_items')
            .eq('id', linkedCheckin.review_template_id)
            .eq('coach_id', linkedCheckin.coach_id)
            .maybeSingle()

        if (reviewTemplateErr) {
            return { success: false, error: reviewTemplateErr.message }
        }

        if (reviewTemplate?.include_progress_photos) {
            const { count, error: mediaCountErr } = await admin
                .from('checkin_media')
                .select('id', { count: 'exact', head: true })
                .eq('checkin_id', checkinId)
                .eq('client_id', checkin.client_id)
                .eq('media_type', 'progress_photo')

            if (mediaCountErr) {
                return { success: false, error: mediaCountErr.message }
            }

            const photoCount = count ?? 0
            const maxPhotos = reviewTemplate.photos_max_items ?? 6
            if (reviewTemplate.photos_required && photoCount === 0) {
                return { success: false, error: 'Sube al menos una foto de progreso antes de enviar la revisión.' }
            }
            if (photoCount > maxPhotos) {
                return { success: false, error: `Esta revisión permite un máximo de ${maxPhotos} fotos.` }
            }
        }
    }

    // 5. Validate type for onboarding-specific forms
    const isOnboarding = checkin.type === 'onboarding'

    // 6. Update checkin with submitted data
    const now = new Date().toISOString()
    // Solo si sigue abierto: si el coach lo cierra mientras tanto, no se pisa.
    const { data: updatedCheckin, error: updateErr } = await admin
        .from('checkins')
        .update({
            raw_payload: payload,
            submitted_at: now,
            status: 'reviewed',
        })
        .eq('id', checkinId)
        .in('status', ['pending', 'reviewed'])
        .select('id')
        .maybeSingle()

    if (updateErr) {
        console.error('[submitFormAction] Checkin update error:', updateErr)
        return { success: false, error: updateErr.message }
    }
    if (!updatedCheckin) {
        return { success: false, closed: true, error: checkinBlockedCopy('closed')?.message }
    }

    // 7. If this is an onboarding form, update the client's onboarding status
    if (isOnboarding) {
        const { error: clientErr } = await admin
            .from('clients')
            .update({
                onboarding_status: 'accepted',
                onboarding_updated_at: now,
            })
            .eq('id', client.id)

        if (clientErr) {
            // Non-blocking: checkin was already saved, log the error
            console.error('[submitFormAction] Client onboarding update error:', clientErr)
        }

        void notifyCoachOnboardingCompleted({ coachId: checkin.coach_id, clientId: client.id })
    }

    // La revisión ya está enviada: sus avisos en el buzón del atleta dejan de estar pendientes.
    void markReviewNotificationsRead(client.id, checkinId)

    // 8. For regular check-ins, ensure a review exists and launch AI analysis asynchronously.
    if (!isOnboarding) {
        let analysis: Promise<GenerateCheckinAnalysisResult> | null = null
        try {
            const { data: adminCheckin, error: adminCheckinError } = await admin
                .from('checkins')
                .select('id, coach_id, client_id')
                .eq('id', checkinId)
                .single()

            if (adminCheckinError || !adminCheckin) {
                console.error('[submitFormAction] Could not load checkin for AI review:', adminCheckinError)
            } else {
                const review = await ensureReviewForCheckin(
                    adminCheckin.coach_id,
                    adminCheckin.client_id,
                    adminCheckin.id,
                    null
                )

                if (!review) {
                    console.error('[submitFormAction] Could not create or load review for AI analysis')
                } else {
                    // Solo una revisión abierta (borrador): nunca se reabre una aprobada.
                    // Se rehace el análisis de IA con las respuestas nuevas.
                    const { data: resetReview, error: reviewResetError } = await admin
                        .from('reviews')
                        .update({
                            ai_status: 'pending',
                            ai_summary: null,
                            ai_error: null,
                            ai_generated_at: null,
                            analysis: null,
                        })
                        .eq('id', review.id)
                        .eq('status', 'draft')
                        .select('id')
                        .maybeSingle()

                    if (reviewResetError) {
                        console.error('[submitFormAction] Could not reset AI review fields:', reviewResetError)
                    } else if (!resetReview) {
                        console.error('[submitFormAction] Review is not a draft; AI analysis skipped:', review.id)
                    } else {
                        analysis = generateCheckinAnalysis(checkinId, review.id, {
                            coachId: adminCheckin.coach_id,
                            clientId: adminCheckin.client_id,
                        })
                    }
                }
            }
        } catch (aiBootstrapError) {
            console.error('[submitFormAction] AI bootstrap failed:', aiBootstrapError)
        }

        notifyCoachAfterAnalysis(analysis, {
            coachId: checkin.coach_id,
            clientId: client.id,
            checkinId,
        })
    }

    return { success: true, isOnboarding }
}
