'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureReviewForCheckin } from '@/data/workspace'
import { generateCheckinAnalysis } from '@/lib/ai/analyze-checkin'
import { ensureCheckinReviewTemplateLink } from '@/lib/reviews/checkin-template-linking'

interface SubmitFormResult {
    success: boolean
    error?: string
    isOnboarding?: boolean
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
        .select('id, coach_id, client_id, type, status, form_template_id, review_template_id, review_schedule_id, period_start, period_end')
        .eq('id', checkinId)
        .single()

    if (checkinErr || !checkin) {
        return { success: false, error: 'Formulario no encontrado' }
    }

    // 3. Verify ownership: the client's auth_user_id must match the current user
    const { data: client } = await admin
        .from('clients')
        .select('id, auth_user_id, user_id')
        .eq('id', checkin.client_id)
        .single()

    if (!client || (client.auth_user_id !== user.id && client.user_id !== user.id)) {
        return { success: false, error: 'No tienes permiso para enviar este formulario' }
    }

    // 4. Validate server-side photo requirements from the review template.
    const linkedCheckin = await ensureCheckinReviewTemplateLink(admin, checkin)

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
    const { error: updateErr } = await admin
        .from('checkins')
        .update({
            raw_payload: payload,
            submitted_at: now,
            status: 'reviewed',
        })
        .eq('id', checkinId)

    if (updateErr) {
        console.error('[submitFormAction] Checkin update error:', updateErr)
        return { success: false, error: updateErr.message }
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
    }

    // 8. For regular check-ins, ensure a review exists and launch AI analysis asynchronously.
    if (!isOnboarding) {
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
                    const { error: reviewResetError } = await admin
                        .from('reviews')
                        .update({
                            status: 'draft',
                            approved_by: null,
                            ai_status: 'pending',
                            ai_summary: null,
                            ai_error: null,
                            ai_generated_at: null,
                            analysis: null,
                        })
                        .eq('id', review.id)

                    if (reviewResetError) {
                        console.error('[submitFormAction] Could not reset AI review fields:', reviewResetError)
                    } else {
                        void generateCheckinAnalysis(checkinId, review.id)
                    }
                }
            }
        } catch (aiBootstrapError) {
            console.error('[submitFormAction] AI bootstrap failed:', aiBootstrapError)
        }
    }

    return { success: true, isOnboarding }
}
