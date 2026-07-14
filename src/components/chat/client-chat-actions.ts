'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCoach } from '@/lib/notifications/coach'
import type { Message, MessageAttachment } from '@/types/messages'

interface ClientChatContext {
    userId: string
    clientId: string
    coachId: string
}

interface ClientChatResult {
    success: boolean
    context?: ClientChatContext
    messages?: Message[]
    message?: Message
    error?: string
}

async function getCurrentClientChatContext(): Promise<ClientChatContext | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const admin = createAdminClient()
    const { data: client, error } = await admin
        .from('clients')
        .select('id, coach_id')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('status', 'active')
        .maybeSingle()

    if (error) {
        console.error('[client-chat] Error resolving client context:', error)
        return null
    }

    if (!client?.id || !client.coach_id) return null

    return {
        userId: user.id,
        clientId: client.id,
        coachId: client.coach_id,
    }
}

export async function getClientChatMessagesAction(): Promise<ClientChatResult> {
    const context = await getCurrentClientChatContext()
    if (!context) {
        return {
            success: false,
            error: 'No se pudo cargar tu perfil de cliente.',
        }
    }

    const admin = createAdminClient()
    const { data, error } = await admin
        .from('messages')
        .select('*')
        .eq('coach_id', context.coachId)
        .eq('client_id', context.clientId)
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        console.error('[client-chat] Error loading messages:', error)
        return {
            success: false,
            context,
            error: 'No se pudieron cargar los mensajes.',
        }
    }

    await admin
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('coach_id', context.coachId)
        .eq('client_id', context.clientId)
        .eq('sender_role', 'coach')
        .is('read_at', null)

    return {
        success: true,
        context,
        messages: ((data ?? []) as Message[]).reverse(),
    }
}

export async function sendClientChatMessageAction(
    content: string,
    attachment?: MessageAttachment
): Promise<ClientChatResult> {
    const context = await getCurrentClientChatContext()
    if (!context) {
        return {
            success: false,
            error: 'No se pudo cargar tu perfil de cliente.',
        }
    }

    const trimmed = content.trim()
    if ((!trimmed && !attachment) || trimmed.length > 4000) {
        return {
            success: false,
            context,
            error: 'Mensaje vacío o demasiado largo (máx 4000 caracteres).',
        }
    }

    // Seguridad: el adjunto debe vivir en la carpeta de esta conversación
    if (attachment && !attachment.url.startsWith(`${context.coachId}/${context.clientId}/`)) {
        return {
            success: false,
            context,
            error: 'Adjunto no válido para esta conversación.',
        }
    }

    const admin = createAdminClient()
    const { data, error } = await admin
        .from('messages')
        .insert({
            coach_id: context.coachId,
            client_id: context.clientId,
            sender_role: 'client',
            sender_id: context.userId,
            content: trimmed,
            message_type: 'chat',
            attachment_type: attachment?.type ?? null,
            attachment_url: attachment?.url ?? null,
            attachment_name: attachment?.name ?? null,
            attachment_size: attachment?.size ?? null,
            attachment_mime: attachment?.mime ?? null,
            attachment_duration: attachment?.duration ?? null,
        })
        .select()
        .single()

    if (error) {
        console.error('[client-chat] Error sending message:', error)
        return {
            success: false,
            context,
            error: 'No se pudo enviar el mensaje.',
        }
    }

    // Push al coach (respeta sus preferencias; nunca bloquea el envío)
    try {
        const { data: clientRow } = await admin
            .from('clients')
            .select('full_name')
            .eq('id', context.clientId)
            .single()

        const previewSource = trimmed
            || (attachment?.type === 'audio' ? '🎤 Nota de voz'
                : attachment?.type === 'image' ? '📷 Imagen'
                : `📎 ${attachment?.name ?? 'Documento'}`)
        const preview = previewSource.length > 100 ? `${previewSource.substring(0, 97)}...` : previewSource
        await notifyCoach(context.coachId, 'messages', {
            title: `Mensaje de ${clientRow?.full_name ?? 'un atleta'}`,
            body: preview,
            url: `/coach/messages?client=${context.clientId}`,
            tag: `coach-message-${context.clientId}`,
        })
    } catch (notifyError) {
        console.warn('[client-chat] Push al coach falló (non-blocking):', notifyError)
    }

    return {
        success: true,
        context,
        message: data as Message,
    }
}

export async function markClientCoachMessageReadAction(messageId: string): Promise<void> {
    const context = await getCurrentClientChatContext()
    if (!context) return

    const admin = createAdminClient()
    await admin
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('coach_id', context.coachId)
        .eq('client_id', context.clientId)
        .eq('sender_role', 'coach')
}
