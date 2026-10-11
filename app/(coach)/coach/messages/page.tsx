import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getClientsForSelector } from '@/data/workspace'
import type { Message } from '@/types/messages'
import { MessagesPageClient } from '@/components/coach/messages/MessagesPageClient'
import type { CoachConversation } from '@/components/coach/messages/MessagesPageClient'

interface CoachMessagesPageProps {
    searchParams: Promise<{ client?: string }>
}

export default async function CoachMessagesPage({ searchParams }: CoachMessagesPageProps) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const clients = await getClientsForSelector(coachId)
    const conversations = await getCoachConversations(coachId, clients)
    // On mobile the inbox should open first. A conversation is selected only when
    // its URL was requested explicitly; the client component selects the first one
    // automatically on desktop.
    const selectedClientId =
        params.client && conversations.some(conversation => conversation.clientId === params.client)
            ? params.client
            : null

    return (
        <div className="flex h-[calc(100dvh-4.5rem-var(--safe-area-top)-var(--safe-area-bottom))] min-h-0 flex-col overflow-hidden lg:h-auto lg:min-h-screen lg:overflow-visible lg:pb-4">
            <MessagesPageClient
                coachId={coachId}
                conversations={conversations}
                initialClientId={selectedClientId}
            />
        </div>
    )
}

async function getCoachConversations(
    coachId: string,
    clients: Awaited<ReturnType<typeof getClientsForSelector>>
): Promise<CoachConversation[]> {
    const supabase = await createClient()
    const clientIds = clients.map(client => client.id)

    if (clientIds.length === 0) return []

    const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('coach_id', coachId)
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(1000)

    const messages = (data ?? []) as Message[]
    const latestByClient = new Map<string, Message>()
    const unreadByClient = new Map<string, number>()

    for (const message of messages) {
        if (!latestByClient.has(message.client_id)) {
            latestByClient.set(message.client_id, message)
        }

        if (
            message.sender_role === 'client' &&
            message.message_type === 'chat' &&
            !message.read_at
        ) {
            unreadByClient.set(
                message.client_id,
                (unreadByClient.get(message.client_id) ?? 0) + 1
            )
        }
    }

    const conversations = clients.map(client => ({
        clientId: client.id,
        clientName: client.full_name || client.email || 'Atleta',
        clientEmail: client.email,
        status: client.status,
        authUserId: client.auth_user_id,
        unreadCount: unreadByClient.get(client.id) ?? 0,
        lastMessage: latestByClient.get(client.id) ?? null,
    }))

    return conversations.sort((a, b) => {
        const unreadDiff = Number(b.unreadCount > 0) - Number(a.unreadCount > 0)
        if (unreadDiff !== 0) return unreadDiff

        const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0
        const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0
        if (aTime !== bTime) return bTime - aTime

        return a.clientName.localeCompare(b.clientName, 'es')
    })
}
