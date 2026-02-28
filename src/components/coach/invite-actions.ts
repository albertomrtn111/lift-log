'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendInviteEmail } from '@/lib/n8n'

interface InviteResult {
    success: boolean
    error?: string
}

/**
 * Send an invite to a client via n8n webhook.
 * Updates invite_status and invited_at in the DB on success.
 */
export async function sendInviteAction(
    clientId: string,
    coachId: string
): Promise<InviteResult> {
    // Validate coach_id against membership
    const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

    // Fetch client data
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, email, full_name')
        .eq('id', clientId)
        .single()

    if (clientError || !client) {
        return { success: false, error: 'Client not found' }
    }

    // Fetch coach name
    const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('name')
        .eq('id', validatedCoachId)
        .single()

    if (coachError || !coach) {
        return { success: false, error: 'Coach not found' }
    }

    // Call n8n webhook with Basic Auth
    const result = await sendInviteEmail({
        clientId: client.id,
        email: client.email,
        fullName: client.full_name,
        coachName: coach.name,
    })

    if (!result.ok) {
        return { success: false, error: result.error || 'Failed to send invitation' }
    }

    // Update invite fields in DB
    const { error: updateError } = await supabase
        .from('clients')
        .update({
            invite_status: 'sent',
            invited_at: new Date().toISOString(),
            onboarding_updated_at: new Date().toISOString(),
        })
        .eq('id', clientId)

    if (updateError) {
        console.error('[sendInviteAction] DB update error:', updateError)
        // Webhook succeeded but DB update failed — not critical, invite was still sent
    }

    revalidatePath('/coach/members')
    revalidatePath('/coach/clients')

    return { success: true }
}

/**
 * Resend invite — same logic as sendInviteAction, reusable from client list or workspace.
 */
export async function resendInviteAction(
    clientId: string,
    coachId: string
): Promise<InviteResult> {
    return sendInviteAction(clientId, coachId)
}
