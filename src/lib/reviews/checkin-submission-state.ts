import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasAthleteResponse } from '@/lib/reviews/checkin-response'
import { getCheckinSubmissionState, type CheckinSubmissionState } from '@/lib/reviews/checkin-submission-rules'

/**
 * Estado de envío de un check-in según el propio check-in y la revisión del coach.
 * Devuelve null si no se pudo leer la revisión: quien llama no deja cambiar nada.
 */
export async function loadCheckinSubmissionState(
    admin: SupabaseClient,
    checkin: { id: string; status: string | null; submitted_at: string | null; created_at: string },
): Promise<CheckinSubmissionState | null> {
    const { data: review, error } = await admin
        .from('reviews')
        .select('status')
        .eq('checkin_id', checkin.id)
        .maybeSingle()

    if (error) {
        console.error('[checkin-submission-state] review lookup failed:', error.message)
        return null
    }

    return getCheckinSubmissionState({
        checkinStatus: checkin.status,
        reviewStatus: (review?.status as string | null | undefined) ?? null,
        answered: hasAthleteResponse(checkin),
    })
}
