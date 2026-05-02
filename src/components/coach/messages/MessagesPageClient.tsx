'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/messages'
import { ConversationPanel } from './ConversationPanel'

export interface CoachConversation {
    clientId: string
    clientName: string
    clientEmail: string
    status: string | null
    authUserId: string | null
    unreadCount: number
    lastMessage: Message | null
}

interface MessagesPageClientProps {
    coachId: string
    conversations: CoachConversation[]
    initialClientId: string | null
}

export function MessagesPageClient({
    coachId,
    conversations,
    initialClientId,
}: MessagesPageClientProps) {
    const router = useRouter()
    const [query, setQuery] = useState('')
    const [selectedClientId, setSelectedClientId] = useState(initialClientId)
    const [conversationState, setConversationState] = useState(conversations)

    useEffect(() => {
        setConversationState(conversations)
    }, [conversations])

    useEffect(() => {
        const supabase = createClient()
        const channel = supabase
            .channel(`coach-message-list:${coachId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                const newMessage = payload.new as Message
                setConversationState(prev => {
                    const selected = selectedClientId
                    return sortConversations(prev.map(conversation => {
                        if (conversation.clientId !== newMessage.client_id) return conversation

                        const isUnread = newMessage.sender_role === 'client' && selected !== newMessage.client_id
                        return {
                            ...conversation,
                            lastMessage: newMessage,
                            unreadCount: isUnread ? conversation.unreadCount + 1 : conversation.unreadCount,
                        }
                    }))
                })
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, selectedClientId])

    const filteredConversations = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return conversationState
        return conversationState.filter(conversation =>
            conversation.clientName.toLowerCase().includes(needle) ||
            conversation.clientEmail.toLowerCase().includes(needle)
        )
    }, [conversationState, query])

    const selectedConversation = conversationState.find(conversation => conversation.clientId === selectedClientId) ?? null

    const handleSelectConversation = useCallback((clientId: string) => {
        setSelectedClientId(clientId)
        setConversationState(prev => {
            let changed = false
            const next = prev.map(conversation => {
                if (conversation.clientId !== clientId || conversation.unreadCount === 0) return conversation
                changed = true
                return { ...conversation, unreadCount: 0 }
            })
            return changed ? next : prev
        })
        if (clientId !== selectedClientId) {
            router.replace(`/coach/messages?client=${clientId}`)
        }
    }, [router, selectedClientId])

    const handleUnreadChange = useCallback((clientId: string, count: number) => {
        setConversationState(prev => {
            let changed = false
            const next = prev.map(conversation => {
                if (conversation.clientId !== clientId || conversation.unreadCount === count) return conversation
                changed = true
                return { ...conversation, unreadCount: count }
            })
            return changed ? next : prev
        })
    }, [])

    const handleLastMessageChange = useCallback((message: Message) => {
        setConversationState(prev => {
            let changed = false
            const next = prev.map(conversation => {
                if (conversation.clientId !== message.client_id) return conversation
                if (conversation.lastMessage?.id === message.id) return conversation
                changed = true
                return { ...conversation, lastMessage: message }
            })
            return changed ? sortConversations(next) : prev
        })
    }, [])

    return (
        <div className="h-[calc(100vh-11.5rem)] min-h-[620px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid h-full min-h-0 lg:grid-cols-[360px_1fr]">
                <aside
                    className={cn(
                        'flex min-h-0 flex-col border-r border-border bg-card',
                        selectedConversation && 'hidden lg:flex'
                    )}
                >
                    <div className="border-b border-border p-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Buscar conversación"
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {filteredConversations.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
                                <MessageCircle className="mb-3 h-10 w-10 opacity-30" />
                                No hay conversaciones con ese filtro.
                            </div>
                        ) : (
                            filteredConversations.map(conversation => {
                                const isActive = conversation.clientId === selectedClientId
                                const preview = getPreview(conversation.lastMessage)
                                const isBlocked = !conversation.authUserId

                                return (
                                    <button
                                        key={conversation.clientId}
                                        type="button"
                                        onClick={() => handleSelectConversation(conversation.clientId)}
                                        className={cn(
                                            'flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors',
                                            'hover:bg-muted/50',
                                            isActive && 'bg-primary/10'
                                        )}
                                    >
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                            {conversation.clientName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="truncate text-sm font-semibold text-foreground">
                                                    {conversation.clientName}
                                                </p>
                                                {conversation.lastMessage ? (
                                                    <span className="shrink-0 text-[11px] text-muted-foreground">
                                                        {formatConversationTime(conversation.lastMessage.created_at)}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2">
                                                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                                    {preview}
                                                </p>
                                                {conversation.unreadCount > 0 ? (
                                                    <Badge className="h-5 min-w-[20px] rounded-full border-0 px-1.5 text-[10px]">
                                                        {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            {isBlocked ? (
                                                <p className="mt-1 text-[11px] text-amber-600">
                                                    Pendiente de registro
                                                </p>
                                            ) : null}
                                        </div>
                                    </button>
                                )
                            })
                        )}
                    </div>
                </aside>

                <main className={cn('min-h-0', !selectedConversation && 'hidden lg:block')}>
                    {selectedConversation ? (
                        <div className="flex h-full min-h-0 flex-col">
                            <button
                                type="button"
                                onClick={() => setSelectedClientId(null)}
                                className="border-b border-border px-4 py-2 text-left text-sm font-medium text-primary lg:hidden"
                            >
                                Volver a mensajes
                            </button>
                            <ConversationPanel
                                coachId={coachId}
                                clientId={selectedConversation.clientId}
                                clientName={selectedConversation.clientName}
                                clientEmail={selectedConversation.clientEmail}
                                isBlocked={!selectedConversation.authUserId}
                                onUnreadChange={handleUnreadChange}
                                onLastMessageChange={handleLastMessageChange}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                            <MessageCircle className="mb-4 h-14 w-14 text-primary/30" />
                            <h2 className="text-lg font-semibold">Selecciona una conversación</h2>
                            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                                Elige un atleta del listado para ver el historial y responder desde aquí.
                            </p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}

function sortConversations(conversations: CoachConversation[]) {
    return [...conversations].sort((a, b) => {
        const unreadDiff = Number(b.unreadCount > 0) - Number(a.unreadCount > 0)
        if (unreadDiff !== 0) return unreadDiff

        const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0
        const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0
        if (aTime !== bTime) return bTime - aTime

        return a.clientName.localeCompare(b.clientName, 'es')
    })
}

function getPreview(message: Message | null) {
    if (!message) return 'Sin mensajes todavía'
    if (message.message_type === 'review_feedback') return 'Revisión enviada'
    const prefix = message.sender_role === 'coach' ? 'Tú: ' : ''
    return `${prefix}${message.content}`
}

function formatConversationTime(dateStr: string) {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    }

    if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}
