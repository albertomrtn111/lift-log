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

export interface ClientChatCoach {
    name: string
    avatarUrl: string | null
}

interface ClientChatResult {
    success: boolean
    context?: ClientChatContext
    coach?: ClientChatCoach
    messages?: Message[]
    /** Quedan mensajes más antiguos por cargar */
    hasMore?: boolean
    message?: Message
    error?: string
}

const PAGE_SIZE = 40

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

async function getCoachIdentity(coachId: string): Promise<ClientChatCoach> {
    const admin = createAdminClient()
    const { data: coach } = await admin
        .from('coaches')
        .select('name, created_by')
        .eq('id', coachId)
        .maybeSingle()

    if (coach?.created_by) {
        const { data: profile } = await admin
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', coach.created_by)
            .maybeSingle()
        if (profile?.full_name) {
            return { name: profile.full_name, avatarUrl: profile.avatar_url ?? null }
        }
    }

    return { name: coach?.name || 'Tu coach', avatarUrl: null }
}

/**
 * Sin `before`: carga la última página, marca como leídos los mensajes del
 * coach y devuelve su identidad. Con `before`: página anterior a esa fecha.
 * Los mensajes del coach vuelven con el read_at previo a marcarlos, para que la
 * pantalla sepa dónde empiezan los no leídos.
 */
export async function getClientChatMessagesAction(before?: string): Promise<ClientChatResult> {
    const context = await getCurrentClientChatContext()
    if (!context) {
        return {
            success: false,
            error: 'No se pudo cargar tu perfil de cliente.',
        }
    }

    const admin = createAdminClient()
    let query = admin
        .from('messages')
        .select('*')
        .eq('coach_id', context.coachId)
        .eq('client_id', context.clientId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE + 1)
    if (before) query = query.lt('created_at', before)

    const [{ data, error }, coach] = await Promise.all([
        query,
        before ? Promise.resolve(undefined) : getCoachIdentity(context.coachId),
    ])

    if (error) {
        console.error('[client-chat] Error loading messages:', error)
        return {
            success: false,
            context,
            error: 'No se pudieron cargar los mensajes.',
        }
    }

    const rows = (data ?? []) as Message[]
    const hasMore = rows.length > PAGE_SIZE

    if (!before) {
        await admin
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('coach_id', context.coachId)
            .eq('client_id', context.clientId)
            .eq('sender_role', 'coach')
            .is('read_at', null)
    }

    return {
        success: true,
        context,
        coach,
        hasMore,
        messages: rows.slice(0, PAGE_SIZE).reverse(),
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
