import 'server-only'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { z } from 'zod'

export async function requireAICoach(coachId?: string) {
    return requireActiveCoachId(coachId)
}

export async function requireAIClient(clientId: string, coachId?: string) {
    z.string().uuid().parse(clientId)
    const auth = await requireActiveCoachId(coachId)
    const { data, error } = await auth.supabase.from('clients').select('id')
        .eq('id', clientId).eq('coach_id', auth.coachId).maybeSingle()
    if (error || !data) throw new Error('No tienes acceso a este atleta.')
    return auth
}
