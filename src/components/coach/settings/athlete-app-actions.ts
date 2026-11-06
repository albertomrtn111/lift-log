'use server'

import { getActiveCoachId } from '@/lib/auth/active-coach'
import { createClient } from '@/lib/supabase/server'

export interface AthleteAppSettings {
    coachId: string
    athleteApp: boolean
    chat: boolean
}

export async function getAthleteAppSettingsAction(): Promise<AthleteAppSettings | null> {
    const coachId = await getActiveCoachId()
    if (!coachId) return null
    const supabase = await createClient()
    const { data } = await supabase.from('athlete_app_settings').select('athlete_app, chat').eq('coach_id', coachId).maybeSingle()
    return { coachId, athleteApp: data?.athlete_app ?? true, chat: data?.chat ?? true }
}

export async function saveAthleteAppSettingsAction(settings: AthleteAppSettings): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_save_app_settings', {
        p_coach_id: settings.coachId,
        p_athlete_app: settings.athleteApp,
        p_chat: settings.chat,
    })
    if (!error) return { success: true }
    return { success: false, error: error.code === '42501' ? error.message : 'No se ha podido guardar. Inténtalo de nuevo.' }
}
