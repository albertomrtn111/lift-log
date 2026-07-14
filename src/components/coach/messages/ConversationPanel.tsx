'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
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
import { Button } from '@/components/ui/button'
import { ReviewFeedbackCard } from '@/components/chat/ReviewFeedbackCard'
import { AttachmentBubble } from '@/components/chat/AttachmentBubble'
import { createClient } from '@/lib/supabase/client'
import { mergeUniqueMessages, reconcileOptimisticMessage } from '@/lib/messages'
import { uploadChatAttachment, formatAudioDuration } from '@/lib/chat-media'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { cn } from '@/lib/utils'
import { notifyCoachBadgesChanged } from '@/lib/coach-badges-events'
import type { Message, MessageAttachment } from '@/types/messages'
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
    const [uploading, setUploading] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const recorder = useVoiceRecorder()

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
            notifyCoachBadgesChanged()
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
                    markMessagesReadAction(coachId, clientId).then(() => notifyCoachBadgesChanged())
                    onUnreadChange?.(clientId, 0)
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                // Doble check azul en vivo cuando el cliente lee
                const updated = payload.new as Message
                if (updated.client_id !== clientId) return
                setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, clientId, onLastMessageChange, onUnreadChange])

    const dispatchMessage = useCallback((content: string, attachment?: MessageAttachment) => {
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
            attachment_type: attachment?.type ?? null,
            attachment_url: attachment?.url ?? null,
            attachment_name: attachment?.name ?? null,
            attachment_size: attachment?.size ?? null,
            attachment_mime: attachment?.mime ?? null,
            attachment_duration: attachment?.duration ?? null,
        }

        setMessages(prev => [...prev, optimisticMessage])
        onLastMessageChange?.(optimisticMessage)

        startTransition(async () => {
            const result = await sendMessageAction(coachId, clientId, content, attachment)
            if (result.success && result.message) {
                setMessages(prev =>
                    reconcileOptimisticMessage(prev, optimisticMessage.id, result.message!)
                )
                onLastMessageChange?.(result.message)
            } else {
                setMessages(prev => prev.filter(message => message.id !== optimisticMessage.id))
                toast.error(result.error || 'No se pudo enviar el mensaje.')
            }
        })
    }, [coachId, clientId, onLastMessageChange])

    const handleSend = () => {
        const content = input.trim()
        if (!content || isPending || isBlocked) return

        setInput('')
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }
        dispatchMessage(content)
    }

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || isBlocked) return

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
            dispatchMessage(input.trim(), attachment)
            setInput('')
        } finally {
            setUploading(null)
        }
    }

    const handleStartRecording = async () => {
        if (isBlocked) return
        const ok = await recorder.start()
        if (!ok && recorder.error) toast.error(recorder.error)
    }

    const handleSendRecording = async () => {
        const recording = await recorder.stop()
        if (!recording) return

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
            dispatchMessage('', attachment)
        } finally {
            setUploading(null)
        }
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

    const showMic = !input.trim() && !recorder.isRecording

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
                    <div className="space-y-1.5">
                        {messages.map((message, index) => {
                            const isReviewFeedback = message.message_type === 'review_feedback'
                            const isCoach = message.sender_role === 'coach'
                            const hasAttachment = !!message.attachment_url
                            const previousMessage = index > 0 ? messages[index - 1] : null
                            const showDateSeparator = !previousMessage
                                || dayKey(previousMessage.created_at) !== dayKey(message.created_at)
                            const isPendingMessage = message.id.startsWith('temp-')

                            return (
                                <div key={message.id}>
                                    {showDateSeparator && (
                                        <div className="my-3 flex justify-center">
                                            <span className="rounded-full bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                                                {formatDaySeparator(message.created_at)}
                                            </span>
                                        </div>
                                    )}
                                    <div className={cn('flex', isCoach ? 'justify-end' : 'justify-start')}>
                                        <div
                                            className={cn(
                                                'max-w-[82%] text-sm shadow-sm sm:max-w-[72%]',
                                                !isReviewFeedback && 'rounded-2xl px-3 py-2',
                                                !isReviewFeedback && (isCoach
                                                    ? 'rounded-br-md bg-primary text-primary-foreground'
                                                    : 'rounded-bl-md bg-card text-foreground')
                                            )}
                                        >
                                            {isReviewFeedback ? (
                                                <ReviewFeedbackCard content={message.content} createdAt={message.created_at} />
                                            ) : (
                                                <>
                                                    {hasAttachment && (
                                                        <div className={cn(message.content && 'mb-1.5')}>
                                                            <AttachmentBubble message={message} isOwn={isCoach} />
                                                        </div>
                                                    )}
                                                    {message.content && (
                                                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                                    )}
                                                    {/* Hora + ticks dentro de la burbuja, estilo WhatsApp */}
                                                    <span
                                                        className={cn(
                                                            'mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none',
                                                            isCoach ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                                        )}
                                                    >
                                                        {formatBubbleTime(message.created_at)}
                                                        {isCoach && (
                                                            isPendingMessage ? (
                                                                <Check className="h-3 w-3 opacity-50" />
                                                            ) : message.read_at ? (
                                                                <CheckCheck className="h-3 w-3 text-sky-300" />
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
                ) : recorder.isRecording ? (
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
                                disabled={!input.trim() || isPending || !!uploading}
                                className="h-10 w-10 shrink-0 rounded-full"
                                aria-label="Enviar mensaje"
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </footer>
        </section>
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
