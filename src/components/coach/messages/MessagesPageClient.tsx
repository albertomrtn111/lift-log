'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { initialsOf } from '@/components/chat/chat-utils'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { notifyCoachBadgesChanged } from '@/lib/coach-badges-events'
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'
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

type ConversationFilter = 'all' | 'unread'

export function MessagesPageClient({
    coachId,
    conversations,
    initialClientId,
}: MessagesPageClientProps) {
    const router = useRouter()
    const [query, setQuery] = useState('')
    const [filter, setFilter] = useState<ConversationFilter>('all')
    const [selectedClientId, setSelectedClientId] = useState(initialClientId)
    const [conversationState, setConversationState] = useState(conversations)

    useEffect(() => {
        setConversationState(conversations)
    }, [conversations])

    // Preserve the split-pane desktop behaviour while opening the inbox first on
    // phones. This also handles resizing from mobile to desktop.
    useEffect(() => {
        if (selectedClientId || initialClientId || conversationState.length === 0) return

        const desktopQuery = window.matchMedia('(min-width: 1024px)')
        const selectFirstConversation = () => {
            if (desktopQuery.matches) {
                setSelectedClientId(current => current ?? conversationState[0]?.clientId ?? null)
            }
        }

        selectFirstConversation()
        desktopQuery.addEventListener('change', selectFirstConversation)
        return () => desktopQuery.removeEventListener('change', selectFirstConversation)
    }, [conversationState, initialClientId, selectedClientId])

    // Ref y no dependencia: cambiar de conversación no debe cerrar y reabrir el
    // canal de la bandeja (los mensajes que llegaran entre medias se perderían).
    const selectedClientIdRef = useRef(selectedClientId)
    selectedClientIdRef.current = selectedClientId

    // Vuelta a primer plano o reconexión: el servidor recalcula la bandeja
    const resync = useCallback(() => router.refresh(), [router])
    useResyncOnReturn(resync)

    useEffect(() => {
        const supabase = createClient()
        const channel = supabase
            .channel(uniqueChannelName(`coach-message-list:${coachId}`))
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                const newMessage = payload.new as Message
                setConversationState(prev => {
                    const selected = selectedClientIdRef.current
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
            .subscribe(resyncOnResubscribe(resync))

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, resync])

    const unreadConversationCount = useMemo(
        () => conversationState.filter(conversation => conversation.unreadCount > 0).length,
        [conversationState]
    )

    const filteredConversations = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return conversationState.filter(conversation => {
            if (filter === 'unread' && conversation.unreadCount === 0) return false
            if (!needle) return true
            return conversation.clientName.toLowerCase().includes(needle) ||
                conversation.clientEmail.toLowerCase().includes(needle)
        })
    }, [conversationState, filter, query])

    const selectedConversation = conversationState.find(conversation => conversation.clientId === selectedClientId) ?? null

    const handleSelectConversation = useCallback((clientId: string) => {
        const unreadBeforeSelect = conversationState.find(conversation => conversation.clientId === clientId)?.unreadCount ?? 0
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
        if (unreadBeforeSelect > 0) {
            notifyCoachBadgesChanged({ messagesUnreadDelta: -unreadBeforeSelect })
        }
        if (clientId !== selectedClientId) {
            router.replace(`/coach/messages?client=${clientId}`, { scroll: false })
        }
    }, [conversationState, router, selectedClientId])

    const handleBackToInbox = useCallback(() => {
        setSelectedClientId(null)
        router.replace('/coach/messages', { scroll: false })
    }, [router])

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
        <div className="flex h-full min-h-0 flex-col lg:block lg:h-auto">
            <CoachPageHeader
                static
                eyebrow="Operativa"
                title="Mensajes"
                description="Conversaciones con tus atletas"
                className={cn('lg:sticky lg:top-0', selectedConversation && 'max-lg:hidden')}
            />

            <div className="min-h-0 flex-1 lg:px-8 lg:pt-6">
                <div className="h-full min-h-0 overflow-hidden bg-card lg:h-[calc(100dvh-12rem)] lg:min-h-[460px] lg:rounded-2xl lg:border lg:border-border/70 lg:shadow-sm">
                    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
                        <aside
                            aria-label="Conversaciones"
                            className={cn(
                                'flex min-h-0 min-w-0 flex-col bg-card lg:border-r lg:border-border/60',
                                selectedConversation && 'hidden lg:flex'
                            )}
                        >
                            <div className="shrink-0 space-y-2 border-b border-border/60 p-3 lg:p-4">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Buscar atleta"
                                        aria-label="Buscar conversación"
                                        className="h-10 rounded-full border-border/70 bg-muted/40 pl-9"
                                    />
                                </div>
                                <ClientTabSwitcher
                                    value={filter}
                                    onValueChange={setFilter}
                                    options={[
                                        { value: 'all', label: 'Todos' },
                                        { value: 'unread', label: unreadConversationCount > 0 ? `No leídos · ${unreadConversationCount}` : 'No leídos' },
                                    ]}
                                />
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                                {filteredConversations.length === 0 ? (
                                    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                            <MessageCircle className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <p className="text-sm font-semibold">
                                            {filter === 'unread' && !query ? 'Estás al día' : 'Sin resultados'}
                                        </p>
                                        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                                            {filter === 'unread' && !query
                                                ? 'No tienes mensajes pendientes de leer.'
                                                : 'No hay conversaciones con ese filtro.'}
                                        </p>
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-border/50">
                                        {filteredConversations.map(conversation => {
                                            const isActive = conversation.clientId === selectedClientId
                                            const unread = conversation.unreadCount > 0
                                            const isBlocked = !conversation.authUserId

                                            return (
                                                <li key={conversation.clientId}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectConversation(conversation.clientId)}
                                                        aria-current={isActive ? 'true' : undefined}
                                                        className={cn(
                                                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                                                            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                                                            isActive && 'bg-primary/[0.07] lg:shadow-[inset_3px_0_0_hsl(var(--primary))]'
                                                        )}
                                                    >
                                                        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                                            {initialsOf(conversation.clientName, 'A')}
                                                            {conversation.status === 'active' && (
                                                                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
                                                            )}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-baseline justify-between gap-3">
                                                                <span className={cn('truncate text-[15px] text-foreground', unread ? 'font-bold' : 'font-semibold')}>
                                                                    {conversation.clientName}
                                                                </span>
                                                                {conversation.lastMessage && (
                                                                    <span className={cn('shrink-0 text-[11px] tabular-nums', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                                                                        {formatConversationTime(conversation.lastMessage.created_at)}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className="mt-0.5 flex items-center gap-2">
                                                                <span className={cn('min-w-0 flex-1 truncate text-[13px]', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                                                                    {isBlocked ? <span className="text-amber-600 dark:text-amber-400">Pendiente de registro</span> : getPreview(conversation.lastMessage)}
                                                                </span>
                                                                {unread && (
                                                                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                                                                        {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </span>
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>
                        </aside>

                        <main className={cn('min-h-0 min-w-0', !selectedConversation && 'hidden lg:block')}>
                            {selectedConversation ? (
                                <ConversationPanel
                                    coachId={coachId}
                                    clientId={selectedConversation.clientId}
                                    clientName={selectedConversation.clientName}
                                    clientEmail={selectedConversation.clientEmail}
                                    isBlocked={!selectedConversation.authUserId}
                                    onBack={handleBackToInbox}
                                    onUnreadChange={handleUnreadChange}
                                    onLastMessageChange={handleLastMessageChange}
                                />
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                                        <MessageCircle className="h-7 w-7 text-primary" />
                                    </div>
                                    <h2 className="text-lg font-semibold">Selecciona una conversación</h2>
                                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                        Elige un atleta del listado para ver el historial y responder desde aquí.
                                    </p>
                                </div>
                            )}
                        </main>
                    </div>
                </div>
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
    if (message.attachment_type === 'audio') return `${prefix}Nota de voz`
    if (message.attachment_type === 'image') return `${prefix}Imagen`
    if (message.attachment_type === 'document') {
        return `${prefix}${message.attachment_name ?? 'Documento adjunto'}`
    }
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
