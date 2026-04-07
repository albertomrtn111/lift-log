'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Message } from '@/types/messages'
import {
    getMessagesAction,
    sendMessageAction,
    markMessagesReadAction,
} from './chat-actions'
import { createClient } from '@/lib/supabase/client'
import { ReviewFeedbackCard } from '@/components/chat/ReviewFeedbackCard'
import { mergeUniqueMessages, reconcileOptimisticMessage } from '@/lib/messages'

interface ChatTabProps {
    coachId: string
    clientId: string
    clientName: string
    onUnreadChange?: (count: number) => void
}

export function ChatTab({ coachId, clientId, clientName, onUnreadChange }: ChatTabProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Scroll to bottom
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Load initial messages + mark as read
    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            const msgs = await getMessagesAction(coachId, clientId)
            if (!cancelled) {
                setMessages(mergeUniqueMessages(msgs))
                setLoading(false)
                onUnreadChange?.(0)
            }
            // Mark client messages as read
            await markMessagesReadAction(coachId, clientId)
        }

        load()
        return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coachId, clientId])

    // Auto-scroll when messages change
    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    // Realtime subscription
    useEffect(() => {
        const supabase = createClient()

        const channel = supabase
            .channel(`messages:${coachId}:${clientId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                const newMsg = payload.new as Message
                if (newMsg.client_id === clientId) {
                    setMessages(prev => mergeUniqueMessages([...prev, newMsg]))
                    // If it's a client message, mark as read immediately
                    if (newMsg.sender_role === 'client') {
                        markMessagesReadAction(coachId, clientId)
                        onUnreadChange?.(0)
                    }
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coachId, clientId])

    // Send message
    const handleSend = () => {
        const content = input.trim()
        if (!content || isPending) return

        // Optimistic insert
        const optimisticMsg: Message = {
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

        setMessages(prev => [...prev, optimisticMsg])
        setInput('')

        // Auto-resize textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }

        startTransition(async () => {
            const result = await sendMessageAction(coachId, clientId, content)
            if (result.success && result.message) {
                setMessages(prev =>
                    reconcileOptimisticMessage(prev, optimisticMsg.id, result.message!)
                )
            } else {
                // Remove optimistic message on error
                setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
            }
        })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Auto-resize textarea
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
        const el = e.target
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }

    const formatTimestamp = (dateStr: string) => {
        const date = new Date(dateStr)
        const today = new Date()
        const isToday = date.toDateString() === today.toDateString()

        if (isToday) {
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        }
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <Card className="flex flex-col h-[600px]">
            {/* Header */}
            <div className="p-4 border-b flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Chat con {clientName}</h3>
            </div>

            {/* Messages area */}
            <div
                className="flex-1 overflow-y-auto p-4 space-y-3"
                aria-live="polite"
            >
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground text-sm">
                            No hay mensajes aún. ¡Envía el primero!
                        </p>
                    </div>
                ) : (
                    messages.map(msg => {
                        const isReviewFeedback = msg.message_type === 'review_feedback'
                        const isCoach = msg.sender_role === 'coach'

                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    'flex flex-col max-w-[80%]',
                                    isCoach
                                        ? 'ml-auto items-end'
                                        : 'mr-auto items-start'
                                )}
                            >
                                <div
                                    className={cn(
                                        'text-sm break-words',
                                        !isReviewFeedback && 'rounded-2xl px-4 py-2.5 whitespace-pre-wrap',
                                        !isReviewFeedback && (isCoach
                                                ? 'bg-primary/10 text-foreground rounded-br-md'
                                                : 'bg-muted/30 text-foreground rounded-bl-md')
                                    )}
                                >
                                    {isReviewFeedback ? (
                                        <ReviewFeedbackCard content={msg.content} createdAt={msg.created_at} />
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                                <span className="text-[10px] text-muted-foreground mt-1 px-1">
                                    {formatTimestamp(msg.created_at)}
                                </span>
                            </div>
                        )
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-3 border-t flex items-end gap-2 bg-muted/10">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe un mensaje..."
                    rows={1}
                    className="flex-1 resize-none bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                    style={{ maxHeight: '120px' }}
                />
                <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!input.trim() || isPending}
                    className="rounded-xl h-10 w-10 shrink-0"
                >
                    {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                </Button>
            </div>
        </Card>
    )
}
