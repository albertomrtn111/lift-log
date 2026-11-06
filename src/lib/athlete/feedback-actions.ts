'use server'

import { createClient } from '@/lib/supabase/server'

/** Sus sensaciones de una sesión de sala. Vacías, se borran. */
export async function saveAthleteFeedbackAction(sessionId: string, rpe: number | null, comment: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('athlete_save_feedback', { p_session_id: sessionId, p_rpe: rpe, p_comment: comment })
    if (!error) return { success: true }
    return { success: false, error: error.code === '42501' ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.' }
}
