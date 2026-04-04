'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendCoachMessageNotification } from '@/lib/notifications/client'
import { Message } from '@/types/messages'

// ============================================================================
// CHAT / MESSAGES ACTIONS (coach side)
// ============================================================================

/**
 * Fetch the most recent messages for a coach-client conversation.
 * Returns up to 50 messages, ordered oldest-first for display.
 * Pass `before` (ISO timestamp) to paginate backwards.
 */
export async function getMessagesAction(
    coachId: string,
    clientId: string,
    before?: string
): Promise<Message[]> {
    const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

    let query = supabase
        .from('messages')
        .select('*')
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50)

    if (before) {
        query = query.lt('created_at', before)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching messages:', error)
        return []
    }

    // Reverse so the oldest message is first (for chat display)
    return (data as Message[]).reverse()
}

/**
 * Send a message as the coach.
 */
export async function sendMessageAction(
    coachId: string,
    clientId: string,
    content: string
): Promise<{ success: boolean; message?: Message; error?: string }> {
    const { supabase, coachId: validatedCoachId, userId } = await requireActiveCoachId(coachId)

    const trimmed = content.trim()
    if (!trimmed || trimmed.length > 4000) {
        return { success: false, error: 'Mensaje vacío o demasiado largo (máx 4000 caracteres)' }
    }

    const { data, error } = await supabase
        .from('messages')
        .insert({
            coach_id: validatedCoachId,
            client_id: clientId,
            sender_role: 'coach',
            sender_id: userId,
            content: trimmed,
        })
        .select()
        .single()

    if (error) {
        console.error('Error sending message:', error)
        return { success: false, error: error.message }
    }

    if (data) {
        await sendCoachMessageNotification(clientId, trimmed)
    }

    return { success: true, message: data as Message }
}

/**
 * Mark all unread client messages as read (for the coach viewing them).
 */
export async function markMessagesReadAction(
    coachId: string,
    clientId: string
): Promise<void> {
    const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

    await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .eq('sender_role', 'client')
        .is('read_at', null)
}

/**
 * Get the count of unread messages from the client.
 */
export async function getUnreadCountAction(
    coachId: string,
    clientId: string
): Promise<number> {
    const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

    const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', validatedCoachId)
        .eq('client_id', clientId)
        .eq('sender_role', 'client')
        .is('read_at', null)

    if (error) {
        console.error('Error fetching unread count:', error)
        return 0
    }

    return count ?? 0
}
