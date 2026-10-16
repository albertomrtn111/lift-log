'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendAthleteInvite } from '@/lib/onboarding/athlete-invite'

interface InviteResult {
    success: boolean
    error?: string
}

/**
 * Envía (o reenvía) la invitación del atleta: email "X te ha invitado a
 * entrenar en NexTrain" con el enlace "Crear mi acceso".
 */
export async function sendInviteAction(
    clientId: string,
    coachId: string
): Promise<InviteResult> {
    let validatedCoachId: string
    let userId: string
    try {
        ({ coachId: validatedCoachId, userId } = await requireActiveCoachId(coachId))
    } catch {
        return { success: false, error: 'No autorizado' }
    }

    const result = await sendAthleteInvite({ coachId: validatedCoachId, coachUserId: userId, clientId })
    if (!result.ok) return { success: false, error: result.error }

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')
    revalidatePath('/coach/dashboard')

    return { success: true }
}

export async function resendInviteAction(
    clientId: string,
    coachId: string
): Promise<InviteResult> {
    return sendInviteAction(clientId, coachId)
}
