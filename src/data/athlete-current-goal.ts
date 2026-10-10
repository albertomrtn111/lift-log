import { createClient } from '@/lib/supabase/server'
import type { AthleteCurrentGoal } from '@/types/athlete-current-goal'

export async function getAthleteCurrentGoal(
    coachId: string,
    clientId: string
): Promise<AthleteCurrentGoal | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('athlete_current_goals')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .maybeSingle()

    if (error) {
        console.error('Error loading athlete current goal:', error)
        return null
    }
    return data as AthleteCurrentGoal | null
}
