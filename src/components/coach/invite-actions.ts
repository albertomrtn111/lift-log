'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'

const N8N_WEBHOOK_URL = 'https://n8n.ascenttech.cloud/webhook/invite-client'

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
        .eq('id', coachId)
        .single()

    if (coachError || !coach) {
        return { success: false, error: 'Coach not found' }
    }

    // Call n8n webhook
    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: client.id,
                email: client.email,
                full_name: client.full_name,
                coach_name: coach.name,
            }),
        })

        if (!response.ok) {
            console.error('[sendInviteAction] Webhook failed:', response.status, await response.text())
            return { success: false, error: `Webhook error (${response.status})` }
        }
    } catch (err: any) {
        console.error('[sendInviteAction] Webhook exception:', err)
        return { success: false, error: 'Failed to contact invitation service' }
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
