'use client'

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, Loader2, MessageCircle, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mergeUniqueMessages, reconcileOptimisticMessage } from '@/lib/messages'
import { uploadChatAttachment } from '@/lib/chat-media'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'
import { notifyCoachBadgesChanged } from '@/lib/coach-badges-events'
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble'
import { ChatComposer, type ChatComposerHandle } from '@/components/chat/ChatComposer'
import { deliveryOf, formatDaySeparator, formatReadAt, groupByDay, initialsOf, sameGroup } from '@/components/chat/chat-utils'
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
    /** Volver a la bandeja (solo móvil) */
    onBack?: () => void
    onUnreadChange?: (clientId: string, count: number) => void
    onLastMessageChange?: (message: Message) => void
}

interface PendingPayload {
    content: string
    attachment?: MessageAttachment
}

type ScrollIntent =
    | { kind: 'bottom'; smooth: boolean }
    | { kind: 'preserve'; previousHeight: number; previousTop: number }

/** Tamaño de página de getMessagesAction */
const PAGE_SIZE = 50
const NEAR_BOTTOM_PX = 140

export function ConversationPanel({
    coachId,
    clientId,
    clientName,
    clientEmail,
    isBlocked = false,
    onBack,
    onUnreadChange,
    onLastMessageChange,
}: ConversationPanelProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [sending, setSending] = useState(false)
    const [uploading, setUploading] = useState<string | null>(null)
    const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
    const [showJump, setShowJump] = useState(false)
    const [newWhileAway, setNewWhileAway] = useState(0)

    const scrollRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<ChatComposerHandle>(null)
    const scrollIntent = useRef<ScrollIntent | null>(null)
    const nearBottom = useRef(true)
    const knownIds = useRef(new Set<string>())
    const pendingPayloads = useRef(new Map<string, PendingPayload>())
    const activeClientId = useRef(clientId)
    activeClientId.current = clientId

    const recorder = useVoiceRecorder()

    // Carga al cambiar de conversación
    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            setMessages([])
            setFailedIds(new Set())
            setNewWhileAway(0)
            setInput('')
            const nextMessages = await getMessagesAction(coachId, clientId)
            if (cancelled) return
            scrollIntent.current = { kind: 'bottom', smooth: false }
            setHasMore(nextMessages.length >= PAGE_SIZE)
            setMessages(mergeUniqueMessages(nextMessages))
            setLoading(false)
            onUnreadChange?.(clientId, 0)
            await markMessagesReadAction(coachId, clientId)
            notifyCoachBadgesChanged()
        }

        load()
        return () => { cancelled = true }
    }, [coachId, clientId, onUnreadChange])

    useEffect(() => {
        knownIds.current = new Set(messages.map(message => message.id))
    }, [messages])

    useLayoutEffect(() => {
        const container = scrollRef.current
        const intent = scrollIntent.current
        if (!container || !intent) return
        scrollIntent.current = null

        if (intent.kind === 'preserve') {
            container.scrollTop = container.scrollHeight - intent.previousHeight + intent.previousTop
            return
        }
        container.scrollTo({ top: container.scrollHeight, behavior: intent.smooth ? 'smooth' : 'auto' })
    }, [messages])

    const scrollToBottom = () => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
        setNewWhileAway(0)
    }

    const loadOlder = useCallback(async () => {
        const container = scrollRef.current
        const oldest = messages.find(message => !message.id.startsWith('temp-'))
        if (!container || !oldest || loadingOlder || !hasMore) return

        setLoadingOlder(true)
        const older = await getMessagesAction(coachId, clientId, oldest.created_at)
        scrollIntent.current = { kind: 'preserve', previousHeight: container.scrollHeight, previousTop: container.scrollTop }
        setHasMore(older.length >= PAGE_SIZE)
        setMessages(prev => mergeUniqueMessages([...older, ...prev]))
        setLoadingOlder(false)
    }, [messages, loadingOlder, hasMore, coachId, clientId])

    const handleScroll = () => {
        const container = scrollRef.current
        if (!container) return
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight
        nearBottom.current = distance < NEAR_BOTTOM_PX
        setShowJump(distance > NEAR_BOTTOM_PX * 2)
        if (nearBottom.current) setNewWhileAway(0)
        if (container.scrollTop < 80) loadOlder()
    }

    // Recupera lo que Realtime no entregó mientras la pestaña estaba en segundo
    // plano o sin conexión: mensajes nuevos y read_at de los propios.
    const resync = useCallback(async () => {
        const latest = await getMessagesAction(coachId, clientId)
        // Si entretanto se abrió otra conversación, esta respuesta ya no aplica
        if (latest.length === 0 || activeClientId.current !== clientId) return
        const fresh = latest.filter(message => !knownIds.current.has(message.id))
        const overlaps = fresh.length < latest.length
        if (fresh.length > 0 && nearBottom.current) scrollIntent.current = { kind: 'bottom', smooth: true }
        if (!overlaps) setHasMore(latest.length >= PAGE_SIZE)
        setMessages(prev => overlaps
            ? mergeUniqueMessages([...prev, ...latest])
            // Hueco mayor que una página: se sustituye conservando los pendientes de envío
            : mergeUniqueMessages([...latest, ...prev.filter(message => message.id.startsWith('temp-'))]))
        onLastMessageChange?.(latest[latest.length - 1])

        if (fresh.some(message => message.sender_role === 'client' && !message.read_at)) {
            onUnreadChange?.(clientId, 0)
            await markMessagesReadAction(coachId, clientId)
            notifyCoachBadgesChanged()
        }
    }, [coachId, clientId, onLastMessageChange, onUnreadChange])

    useResyncOnReturn(resync, !loading)

    // Tiempo real
    useEffect(() => {
        const supabase = createClient()

        const channel = supabase
            .channel(uniqueChannelName(`coach-messages:${coachId}:${clientId}`))
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                const incoming = payload.new as Message
                if (incoming.client_id !== clientId || knownIds.current.has(incoming.id)) return

                if (nearBottom.current || incoming.sender_role === 'coach') {
                    scrollIntent.current = { kind: 'bottom', smooth: true }
                } else {
                    setNewWhileAway(count => count + 1)
                }
                setMessages(prev => mergeUniqueMessages([...prev, incoming]))
                onLastMessageChange?.(incoming)

                if (incoming.sender_role === 'client') {
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
                // Doble check en vivo cuando el atleta lee
                const updated = payload.new as Message
                if (updated.client_id !== clientId) return
                setMessages(prev => prev.map(message => message.id === updated.id ? { ...message, read_at: updated.read_at } : message))
            })
            .subscribe(resyncOnResubscribe(resync))

        return () => {
            supabase.removeChannel(channel)
        }
    }, [coachId, clientId, onLastMessageChange, onUnreadChange, resync])

    const dispatchMessage = useCallback(async (payload: PendingPayload, reuseId?: string) => {
        const { content, attachment } = payload
        const optimisticId = reuseId ?? `temp-${Date.now()}`
        pendingPayloads.current.set(optimisticId, payload)
        setFailedIds(prev => {
            if (!prev.has(optimisticId)) return prev
            const next = new Set(prev)
            next.delete(optimisticId)
            return next
        })

        if (!reuseId) {
            const optimistic: Message = {
                id: optimisticId,
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
            scrollIntent.current = { kind: 'bottom', smooth: true }
            setMessages(prev => [...prev, optimistic])
            onLastMessageChange?.(optimistic)
        }

        setSending(true)
        const result = await sendMessageAction(coachId, clientId, content, attachment)
        setSending(false)

        if (result.success && result.message) {
            pendingPayloads.current.delete(optimisticId)
            setMessages(prev => reconcileOptimisticMessage(prev, optimisticId, result.message!))
            onLastMessageChange?.(result.message)
        } else {
            setFailedIds(prev => new Set(prev).add(optimisticId))
            toast.error(result.error || 'No se pudo enviar el mensaje.')
        }
    }, [coachId, clientId, onLastMessageChange])

    const handleSend = async () => {
        const content = input.trim()
        if (!content || sending || isBlocked) return
        setInput('')
        composerRef.current?.resetHeight()
        await dispatchMessage({ content })
    }

    const uploadAndSend = async (label: string, file: Blob, fileName: string, mime: string, duration?: number, caption = '') => {
        if (isBlocked) return
        setUploading(label)
        try {
            const { attachment, error } = await uploadChatAttachment({ coachId, clientId, file, fileName, mime, duration })
            if (error || !attachment) {
                toast.error(error || 'No se pudo subir el archivo.')
                return
            }
            await dispatchMessage({ content: caption, attachment })
        } finally {
            setUploading(null)
        }
    }

    const handleFileSelected = async (file: File) => {
        const caption = input.trim()
        if (caption) {
            setInput('')
            composerRef.current?.resetHeight()
        }
        await uploadAndSend(file.name, file, file.name, file.type || 'application/octet-stream', undefined, caption)
    }

    const handleStartRecording = async () => {
        if (isBlocked) return
        const ok = await recorder.start()
        if (!ok && recorder.error) toast.error(recorder.error)
    }

    const handleSendRecording = async () => {
        const recording = await recorder.stop()
        if (!recording) return
        await uploadAndSend('nota de voz', recording.blob, recording.fileName, recording.mime, recording.duration)
    }

    const days = useMemo(() => groupByDay(messages), [messages])
    const lastOwnMessageId = useMemo(
        () => [...messages].reverse().find(message => message.sender_role === 'coach')?.id ?? null,
        [messages]
    )

    const initials = initialsOf(clientName, 'A')
    const athleteAvatar = (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary ring-1 ring-border/60">
            {initials}
        </span>
    )

    return (
        <section className="flex h-full min-h-0 flex-1 flex-col bg-background">
            <header className="flex shrink-0 items-center gap-2.5 border-b border-border/60 bg-background/90 px-2 py-2.5 backdrop-blur-xl sm:px-4 lg:px-5">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Volver a conversaciones"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted lg:hidden"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                )}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-1 ring-border/60">
                    {initials}
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">{clientName}</h2>
                    {clientEmail ? <p className="truncate text-xs text-muted-foreground">{clientEmail}</p> : null}
                </div>
                <Link
                    href={`/coach/clients?client=${clientId}`}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    <UserRound className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Ver ficha</span>
                </Link>
            </header>

            <div className="relative min-h-0 flex-1">
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="h-full overflow-y-auto overscroll-contain bg-muted/20 px-3 pb-3 sm:px-5"
                    aria-live="polite"
                >
                    {loading ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center px-6 text-center animate-fade-in">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                <MessageCircle className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-semibold">Sin mensajes todavía</p>
                            <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                                {isBlocked ? 'Podrás escribirle cuando termine su registro.' : `Escribe a ${clientName.split(' ')[0]} para empezar la conversación.`}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex h-10 items-center justify-center">
                                {loadingOlder ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : hasMore ? (
                                    <button type="button" onClick={loadOlder} className="rounded-full px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5">
                                        Ver mensajes anteriores
                                    </button>
                                ) : (
                                    <span className="text-[11px] text-muted-foreground/70">Inicio de la conversación</span>
                                )}
                            </div>

                            {days.map(day => (
                                <section key={day.key}>
                                    <div className="sticky top-2 z-10 my-2 flex justify-center">
                                        <span className="rounded-full border border-border/60 bg-background/85 px-3 py-1 text-[11px] font-semibold capitalize text-muted-foreground shadow-sm backdrop-blur">
                                            {formatDaySeparator(day.date)}
                                        </span>
                                    </div>
                                    {day.messages.map((message, index) => {
                                        const isOwn = message.sender_role === 'coach'
                                        return (
                                            <Fragment key={message.id}>
                                                <ChatMessageBubble
                                                    message={message}
                                                    isOwn={isOwn}
                                                    isFirstInGroup={!sameGroup(day.messages[index - 1], message)}
                                                    isLastInGroup={!sameGroup(message, day.messages[index + 1])}
                                                    delivery={isOwn ? deliveryOf(message, failedIds) : undefined}
                                                    onRetry={() => {
                                                        const payload = pendingPayloads.current.get(message.id)
                                                        if (payload) dispatchMessage(payload, message.id)
                                                    }}
                                                    avatar={athleteAvatar}
                                                />
                                                {isOwn && message.id === lastOwnMessageId && message.read_at && message.message_type === 'chat' && (
                                                    <p className="mt-1 pr-1 text-right text-[11px] text-muted-foreground animate-fade-in">
                                                        Visto {formatReadAt(message.read_at)}
                                                    </p>
                                                )}
                                            </Fragment>
                                        )
                                    })}
                                </section>
                            ))}
                        </>
                    )}
                </div>

                {showJump && (
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        className="absolute bottom-3 right-3 z-20 flex h-10 items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-3 text-sm font-medium shadow-lg backdrop-blur animate-fade-in"
                        aria-label="Ir al último mensaje"
                    >
                        {newWhileAway > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                                {newWhileAway}
                            </span>
                        )}
                        <ChevronDown className="h-4 w-4" />
                    </button>
                )}
            </div>

            {isBlocked ? (
                <div className="shrink-0 border-t border-border/60 bg-background px-3 py-3">
                    <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        Este atleta todavía no ha terminado el registro. Los mensajes se activarán cuando tenga cuenta.
                    </p>
                </div>
            ) : (
                <ChatComposer
                    ref={composerRef}
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    onFileSelected={handleFileSelected}
                    onStartRecording={handleStartRecording}
                    onCancelRecording={recorder.cancel}
                    onSendRecording={handleSendRecording}
                    isRecording={recorder.isRecording}
                    recordingSeconds={recorder.elapsedSeconds}
                    uploading={uploading}
                    sending={sending}
                />
            )}
        </section>
    )
}
