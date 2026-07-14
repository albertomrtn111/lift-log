'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Check,
    CheckCheck,
    Loader2,
    MessageSquare,
    Mic,
    Paperclip,
    Send,
    Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Message, MessageAttachment } from '@/types/messages'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { createClient } from '@/lib/supabase/client'
import { ReviewFeedbackCard } from '@/components/chat/ReviewFeedbackCard'
import { AttachmentBubble } from '@/components/chat/AttachmentBubble'
import { mergeUniqueMessages, reconcileOptimisticMessage } from '@/lib/messages'
import { uploadChatAttachment, formatAudioDuration } from '@/lib/chat-media'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import {
    getClientChatMessagesAction,
    markClientCoachMessageReadAction,
    sendClientChatMessageAction,
} from './client-chat-actions'

interface ChatSession {
    coachId: string
    clientId: string
    userId: string
}

export function ClientChat() {
    const { client } = useClientAppContext()
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [uploading, setUploading] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [chatSession, setChatSession] = useState<ChatSession | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const recorder = useVoiceRecorder()

    const coachId = chatSession?.coachId ?? client?.coachId
    const clientId = chatSession?.clientId ?? client?.clientId
    const userId = chatSession?.userId ?? client?.userId

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Load initial messages + mark coach messages as read.
    // No esperamos al contexto (/api/me): la acción resuelve su propia sesión,
    // así el chat carga en paralelo con el contexto en vez de en cascada.
    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            setLoadError(null)

            const result = await getClientChatMessagesAction()
            if (cancelled) return

            if (result.success && result.context) {
                setChatSession(result.context)
                setMessages(mergeUniqueMessages(result.messages ?? []))
            } else {
                setLoadError(result.error ?? 'No se pudo cargar el chat.')
                setChatSession(null)
            }
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [])

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
                    setMessages(prev => mergeUniqueMessages([...prev, newMsg]))
                    // If it's a coach message, mark as read
                    if (newMsg.sender_role === 'coach') {
                        markClientCoachMessageReadAction(newMsg.id)
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `client_id=eq.${clientId}`,
            }, (payload) => {
                // Doble check azul en vivo cuando el coach lee tus mensajes
                const updated = payload.new as Message
                if (updated.coach_id !== coachId) return
                setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, clientId])

    const dispatchMessage = useCallback(async (content: string, attachment?: MessageAttachment) => {
        if (!coachId || !clientId || !userId) return

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
            attachment_type: attachment?.type ?? null,
            attachment_url: attachment?.url ?? null,
            attachment_name: attachment?.name ?? null,
            attachment_size: attachment?.size ?? null,
            attachment_mime: attachment?.mime ?? null,
            attachment_duration: attachment?.duration ?? null,
        }

        setMessages(prev => [...prev, optimisticMsg])

        setSending(true)
        const result = await sendClientChatMessageAction(content, attachment)

        if (result.success && result.message) {
            if (result.context) setChatSession(result.context)
            setMessages(prev =>
                reconcileOptimisticMessage(prev, optimisticMsg.id, result.message!)
            )
        } else {
            console.error('Error sending message:', result.error)
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
            toast.error(result.error ?? 'No se pudo enviar el mensaje.')
        }
        setSending(false)
    }, [coachId, clientId, userId])

    // Send text message
    const handleSend = async () => {
        const content = input.trim()
        if (!content || sending) return

        setInput('')
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }
        await dispatchMessage(content)
    }

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file || !coachId || !clientId) return

        setUploading(file.name)
        try {
            const { attachment, error } = await uploadChatAttachment({
                coachId,
                clientId,
                file,
                fileName: file.name,
                mime: file.type || 'application/octet-stream',
            })
            if (error || !attachment) {
                toast.error(error || 'No se pudo subir el archivo.')
                return
            }
            await dispatchMessage(input.trim(), attachment)
            setInput('')
        } finally {
            setUploading(null)
        }
    }

    const handleStartRecording = async () => {
        const ok = await recorder.start()
        if (!ok && recorder.error) toast.error(recorder.error)
    }

    const handleSendRecording = async () => {
        const recording = await recorder.stop()
        if (!recording || !coachId || !clientId) return

        setUploading('nota de voz')
        try {
            const { attachment, error } = await uploadChatAttachment({
                coachId,
                clientId,
                file: recording.blob,
                fileName: recording.fileName,
                mime: recording.mime,
                duration: recording.duration,
            })
            if (error || !attachment) {
                toast.error(error || 'No se pudo enviar la nota de voz.')
                return
            }
            await dispatchMessage('', attachment)
        } finally {
            setUploading(null)
        }
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

    if (loading && !chatSession) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (loadError || !coachId || !clientId) {
        return (
            <Card className="p-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">{loadError ?? 'No se pudo cargar el chat.'}</p>
            </Card>
        )
    }

    const showMic = !input.trim() && !recorder.isRecording

    return (
        <Card className="flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '400px' }}>
            {/* Header */}
            <div className="p-4 border-b flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Chat con tu entrenador</h3>
            </div>

            {/* Messages area */}
            <div
                className="flex-1 overflow-y-auto p-4 space-y-1.5"
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
                    messages.map((msg, index) => {
                        const isReviewFeedback = msg.message_type === 'review_feedback'
                        const isClient = msg.sender_role === 'client'
                        const hasAttachment = !!msg.attachment_url
                        const previousMsg = index > 0 ? messages[index - 1] : null
                        const showDateSeparator = !previousMsg
                            || dayKey(previousMsg.created_at) !== dayKey(msg.created_at)
                        const isPendingMsg = msg.id.startsWith('temp-')

                        return (
                            <div key={msg.id}>
                                {showDateSeparator && (
                                    <div className="my-3 flex justify-center">
                                        <span className="rounded-full bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                                            {formatDaySeparator(msg.created_at)}
                                        </span>
                                    </div>
                                )}
                                <div className={cn('flex', isClient ? 'justify-end' : 'justify-start')}>
                                    <div
                                        className={cn(
                                            'max-w-[80%] text-sm break-words',
                                            !isReviewFeedback && 'rounded-2xl px-3 py-2',
                                            !isReviewFeedback && (isClient
                                                ? 'bg-primary/10 text-foreground rounded-br-md'
                                                : 'bg-muted/30 text-foreground rounded-bl-md')
                                        )}
                                    >
                                        {isReviewFeedback ? (
                                            <ReviewFeedbackCard content={msg.content} createdAt={msg.created_at} />
                                        ) : (
                                            <>
                                                {hasAttachment && (
                                                    <div className={cn(msg.content && 'mb-1.5')}>
                                                        <AttachmentBubble message={msg} isOwn={false} />
                                                    </div>
                                                )}
                                                {msg.content && (
                                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                                )}
                                                {/* Hora + ticks dentro de la burbuja, estilo WhatsApp */}
                                                <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none text-muted-foreground">
                                                    {formatBubbleTime(msg.created_at)}
                                                    {isClient && (
                                                        isPendingMsg ? (
                                                            <Check className="h-3 w-3 opacity-50" />
                                                        ) : msg.read_at ? (
                                                            <CheckCheck className="h-3 w-3 text-sky-500" />
                                                        ) : (
                                                            <Check className="h-3 w-3" />
                                                        )
                                                    )}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-3 border-t bg-muted/10">
                {recorder.isRecording ? (
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={recorder.cancel}
                            className="h-10 w-10 shrink-0 rounded-full text-destructive hover:text-destructive"
                            aria-label="Cancelar grabación"
                        >
                            <Trash2 className="h-5 w-5" />
                        </Button>
                        <div className="flex flex-1 items-center gap-2">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                            <span className="text-sm font-medium tabular-nums">
                                {formatAudioDuration(recorder.elapsedSeconds)}
                            </span>
                            <span className="text-xs text-muted-foreground">Grabando nota de voz…</span>
                        </div>
                        <Button
                            size="icon"
                            onClick={handleSendRecording}
                            className="h-10 w-10 shrink-0 rounded-full"
                            aria-label="Enviar nota de voz"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-end gap-1.5">
                        <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileSelected}
                            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,video/*,audio/*"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!!uploading}
                            className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                            aria-label="Adjuntar archivo"
                        >
                            {uploading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Paperclip className="h-5 w-5" />
                            )}
                        </Button>
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={uploading ? `Subiendo ${uploading}…` : 'Escribe un mensaje…'}
                            rows={1}
                            disabled={!!uploading}
                            className="max-h-[120px] flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                        />
                        {showMic ? (
                            <Button
                                size="icon"
                                onClick={handleStartRecording}
                                disabled={!!uploading}
                                className="h-10 w-10 shrink-0 rounded-full"
                                aria-label="Grabar nota de voz"
                            >
                                <Mic className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                size="icon"
                                onClick={handleSend}
                                disabled={!input.trim() || sending || !!uploading}
                                className="h-10 w-10 shrink-0 rounded-full"
                                aria-label="Enviar mensaje"
                            >
                                {sending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </Card>
    )
}

function dayKey(dateStr: string) {
    return new Date(dateStr).toDateString()
}

function formatDaySeparator(dateStr: string) {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Hoy'
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

    return date.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    })
}

function formatBubbleTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
