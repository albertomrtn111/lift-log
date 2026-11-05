import { requireActiveCoachId } from '@/lib/auth/require-coach'

/** Usuario activo del espacio con su rol. Lanza un error si no pertenece a ninguno. */
export async function getCoachActor() {
    const { supabase, coachId, userId } = await requireActiveCoachId()
    const { data } = await supabase
        .from('coach_memberships')
        .select('role')
        .eq('coach_id', coachId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single()
    return { supabase, coachId, userId, role: (data?.role as string | undefined) ?? '' }
}
