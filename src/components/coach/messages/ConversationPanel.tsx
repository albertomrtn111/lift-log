'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReviewFeedbackCard } from '@/components/chat/ReviewFeedbackCard'
import { createClient } from '@/lib/supabase/client'
import { mergeUniqueMessages, reconcileOptimisticMessage } from '@/lib/messages'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/messages'
import {
    getMessagesAction,
    markMessagesReadAction,
    sendMessageAction,
} from './actions'

interface ConversationPanelProps {
    coachId: string
    clientId: string
    clientName: string
    clientEmail?: string
    isBlocked?: boolean
    onUnreadChange?: (clientId: string, count: number) => void
    onLastMessageChange?: (message: Message) => void
}

export function ConversationPanel({
    coachId,
    clientId,
    clientName,
    clientEmail,
    isBlocked = false,
    onUnreadChange,
    onLastMessageChange,
}: ConversationPanelProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            const nextMessages = await getMessagesAction(coachId, clientId)
            if (!cancelled) {
                setMessages(mergeUniqueMessages(nextMessages))
                setLoading(false)
                onUnreadChange?.(clientId, 0)
            }
            await markMessagesReadAction(coachId, clientId)
        }

        load()
        return () => { cancelled = true }
    }, [coachId, clientId, onUnreadChange])

    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    useEffect(() => {
        const supabase = createClient()

        const channel = supabase
            .channel(`coach-messages:${coachId}:${clientId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                const newMessage = payload.new as Message
                if (newMessage.client_id !== clientId) return

                setMessages(prev => mergeUniqueMessages([...prev, newMessage]))
                onLastMessageChange?.(newMessage)

                if (newMessage.sender_role === 'client') {
                    markMessagesReadAction(coachId, clientId)
                    onUnreadChange?.(clientId, 0)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, clientId, onLastMessageChange, onUnreadChange])

    const handleSend = () => {
        const content = input.trim()
        if (!content || isPending || isBlocked) return

        const optimisticMessage: Message = {
            id: `temp-${Date.now()}`,
            coach_id: coachId,
            client_id: clientId,
            sender_role: 'coach',
            sender_id: '',
            content,
            message_type: 'chat',
            read_at: null,
            created_at: new Date().toISOString(),
        }

        setMessages(prev => [...prev, optimisticMessage])
        onLastMessageChange?.(optimisticMessage)
        setInput('')

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }

        startTransition(async () => {
            const result = await sendMessageAction(coachId, clientId, content)
            if (result.success && result.message) {
                setMessages(prev =>
                    reconcileOptimisticMessage(prev, optimisticMessage.id, result.message!)
                )
                onLastMessageChange?.(result.message)
            } else {
                setMessages(prev => prev.filter(message => message.id !== optimisticMessage.id))
            }
        })
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            handleSend()
        }
    }

    const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(event.target.value)
        const element = event.target
        element.style.height = 'auto'
        element.style.height = Math.min(element.scrollHeight, 120) + 'px'
    }

    return (
        <section className="flex min-h-0 flex-1 flex-col bg-background">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {clientName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">{clientName}</h2>
                    {clientEmail ? (
                        <p className="truncate text-xs text-muted-foreground">{clientEmail}</p>
                    ) : null}
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-3 py-4 sm:px-5">
                {loading ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                            No hay mensajes todavía.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {messages.map(message => {
                            const isReviewFeedback = message.message_type === 'review_feedback'
                            const isCoach = message.sender_role === 'coach'

                            return (
                                <div
                                    key={message.id}
                                    className={cn(
                                        'flex flex-col',
                                        isCoach ? 'items-end' : 'items-start'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'max-w-[82%] text-sm shadow-sm sm:max-w-[72%]',
                                            !isReviewFeedback && 'rounded-2xl px-4 py-2.5 whitespace-pre-wrap',
                                            !isReviewFeedback && (isCoach
                                                ? 'rounded-br-md bg-primary text-primary-foreground'
                                                : 'rounded-bl-md bg-card text-foreground')
                                        )}
                                    >
                                        {isReviewFeedback ? (
                                            <ReviewFeedbackCard content={message.content} createdAt={message.created_at} />
                                        ) : (
                                            message.content
                                        )}
                                    </div>
                                    <span className="mt-1 px-1 text-[10px] text-muted-foreground">
                                        {formatTimestamp(message.created_at)}
                                    </span>
                                </div>
                            )
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <footer className="border-t border-border bg-card px-3 py-3 sm:px-4">
                {isBlocked ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        Este cliente todavía no ha terminado el registro. Los mensajes se activarán cuando tenga cuenta.
                    </div>
                ) : (
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe un mensaje..."
                            rows={1}
                            className="max-h-[120px] flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <Button
                            size="icon"
                            onClick={handleSend}
                            disabled={!input.trim() || isPending}
                            className="h-10 w-10 shrink-0 rounded-xl"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                )}
            </footer>
        </section>
    )
}

function formatTimestamp(dateStr: string) {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    }

    if (date.toDateString() === yesterday.toDateString()) {
        return `Ayer ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
    }

    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    })
}
