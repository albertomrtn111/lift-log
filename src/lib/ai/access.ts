import 'server-only'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

// La IA dentro de la app (Gemini) va desde el plan Pro (NXT-152). El asistente externo
// por MCP no pasa por aquí: está en todos los planes.
export const AI_NOT_IN_PLAN_MESSAGE = 'La IA dentro de NexTrain está incluida desde el plan Pro.'

/** El espacio no tiene la IA en su plan. Su mensaje se puede enseñar tal cual al coach. */
export class AINotInPlanError extends Error {
    constructor(message = AI_NOT_IN_PLAN_MESSAGE) {
        super(message)
        this.name = 'AINotInPlanError'
    }
}

/** ¿El plan del espacio (o una excepción vigente) incluye la IA? Si no se puede leer, no. */
export async function coachHasAI(coachId: string): Promise<boolean> {
    const { data, error } = await createAdminClient().rpc('coach_has_feature', {
        p_coach_id: coachId,
        p_feature: 'ai',
    })
    if (error) {
        console.error('[ai/access] No se ha podido leer el plan', error.message)
        return false
    }
    return data === true
}

export async function assertCoachHasAI(coachId: string) {
    if (!await coachHasAI(coachId)) throw new AINotInPlanError()
}

/** Coach con sesión y con la IA en su plan. */
export async function requireAICoach(coachId?: string) {
    const auth = await requireActiveCoachId(coachId)
    await assertCoachHasAI(auth.coachId)
    return auth
}

/** Coach con acceso a este atleta y con la IA en su plan. */
export async function requireAIClient(clientId: string, coachId?: string) {
    z.string().uuid().parse(clientId)
    const auth = await requireActiveCoachId(coachId)
    const { data, error } = await auth.supabase.from('clients').select('id')
        .eq('id', clientId).eq('coach_id', auth.coachId).maybeSingle()
    if (error || !data) throw new Error('No tienes acceso a este atleta.')
    await assertCoachHasAI(auth.coachId)
    return auth
}
