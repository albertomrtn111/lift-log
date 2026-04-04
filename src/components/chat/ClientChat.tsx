'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Message } from '@/types/messages'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { createClient } from '@/lib/supabase/client'
import { ReviewFeedbackCard } from '@/components/chat/ReviewFeedbackCard'

export function ClientChat() {
    const { client, isLoading: contextLoading } = useClientAppContext()
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const coachId = client?.coachId
    const clientId = client?.clientId
    const userId = client?.userId

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Load initial messages + mark coach messages as read
    useEffect(() => {
        if (!coachId || !clientId) return
        let cancelled = false
        const supabase = createClient()

        async function load() {
            setLoading(true)

            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('coach_id', coachId!)
                .eq('client_id', clientId!)
                .order('created_at', { ascending: false })
                .limit(50)

            if (!cancelled && data) {
                setMessages((data as Message[]).reverse())
            }
            if (error) console.error('Error loading messages:', error)

            setLoading(false)

            // Mark coach messages as read
            await supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('coach_id', coachId!)
                .eq('client_id', clientId!)
                .eq('sender_role', 'coach')
                .is('read_at', null)
        }

        load()
        return () => { cancelled = true }
    }, [coachId, clientId])

    // Auto-scroll when messages change
    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    // Realtime subscription
    useEffect(() => {
        if (!coachId || !clientId) return
        const supabase = createClient()

        const channel = supabase
            .channel(`client-messages:${coachId}:${clientId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `client_id=eq.${clientId}`,
            }, (payload) => {
                const newMsg = payload.new as Message
                if (newMsg.coach_id === coachId) {
                    setMessages(prev => {
                        if (prev.some(m => m.id === newMsg.id)) return prev
                        return [...prev, newMsg]
                    })
                    // If it's a coach message, mark as read
                    if (newMsg.sender_role === 'coach') {
                        supabase
                            .from('messages')
                            .update({ read_at: new Date().toISOString() })
                            .eq('id', newMsg.id)
                            .then()
                    }
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, clientId])

    // Send message
    const handleSend = async () => {
        if (!coachId || !clientId || !userId) return
        const content = input.trim()
        if (!content || sending) return

        // Optimistic insert
        const optimisticMsg: Message = {
            id: `temp-${Date.now()}`,
            coach_id: coachId,
            client_id: clientId,
            sender_role: 'client',
            sender_id: userId,
            content,
            message_type: 'chat',
            read_at: null,
            created_at: new Date().toISOString(),
        }

        setMessages(prev => [...prev, optimisticMsg])
        setInput('')
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }

        setSending(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('messages')
            .insert({
                coach_id: coachId,
                client_id: clientId,
                sender_role: 'client',
                sender_id: userId,
                content,
            })
            .select()
            .single()

        if (data) {
            setMessages(prev =>
                prev.map(m => m.id === optimisticMsg.id ? (data as Message) : m)
            )
        } else {
            console.error('Error sending message:', error)
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        }
        setSending(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

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

    if (contextLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!coachId || !clientId) {
        return (
            <Card className="p-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">No se pudo cargar el chat.</p>
            </Card>
        )
    }

    return (
        <Card className="flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '400px' }}>
            {/* Header */}
            <div className="p-4 border-b flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Chat con tu entrenador</h3>
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
                        const isClient = msg.sender_role === 'client'

                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    'flex flex-col max-w-[80%]',
                                    isClient
                                        ? 'ml-auto items-end'
                                        : 'mr-auto items-start'
                                )}
                            >
                                <div
                                    className={cn(
                                        'text-sm break-words',
                                        !isReviewFeedback && 'rounded-2xl px-4 py-2.5 whitespace-pre-wrap',
                                        !isReviewFeedback && (isClient
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
                    disabled={!input.trim() || sending}
                    className="rounded-xl h-10 w-10 shrink-0"
                >
                    {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                </Button>
            </div>
        </Card>
    )
}
