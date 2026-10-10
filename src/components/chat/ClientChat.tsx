'use client'

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Message, MessageAttachment } from '@/types/messages'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { createClient } from '@/lib/supabase/client'
import { mergeUniqueMessages, reconcileOptimisticMessage } from '@/lib/messages'
import { uploadChatAttachment } from '@/lib/chat-media'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { ChatMessageBubble, type DeliveryState } from './ChatMessageBubble'
import { ChatComposer, type ChatComposerHandle } from './ChatComposer'
import {
    getClientChatMessagesAction,
    markClientCoachMessageReadAction,
    sendClientChatMessageAction,
    type ClientChatCoach,
} from './client-chat-actions'

interface ChatSession {
    coachId: string
    clientId: string
    userId: string
}

interface PendingPayload {
    content: string
    attachment?: MessageAttachment
}

type ScrollIntent =
    | { kind: 'bottom'; smooth: boolean }
    | { kind: 'unread' }
    | { kind: 'preserve'; previousHeight: number; previousTop: number }

/** Mensajes seguidos del mismo autor a menos de esto se agrupan visualmente */
const GROUP_WINDOW_MS = 5 * 60 * 1000
const NEAR_BOTTOM_PX = 140

const SUGGESTIONS = [
    'Tengo una duda con el entreno de hoy',
    '¿Puedo cambiar alguna comida?',
    'Hoy me noto bastante cansado',
]

export function ClientChat() {
    const { client } = useClientAppContext()
    const [messages, setMessages] = useState<Message[]>([])
    const [coach, setCoach] = useState<ClientChatCoach | null>(null)
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [sending, setSending] = useState(false)
    const [uploading, setUploading] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [chatSession, setChatSession] = useState<ChatSession | null>(null)
    const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set())
    const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null)
    const [showJump, setShowJump] = useState(false)
    const [newWhileAway, setNewWhileAway] = useState(0)
    const [reloadKey, setReloadKey] = useState(0)

    const scrollRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<ChatComposerHandle>(null)
    const scrollIntent = useRef<ScrollIntent | null>(null)
    const nearBottom = useRef(true)
    const pendingPayloads = useRef(new Map<string, PendingPayload>())
    const knownIds = useRef(new Set<string>())

    const recorder = useVoiceRecorder()

    const coachId = chatSession?.coachId ?? client?.coachId
    const clientId = chatSession?.clientId ?? client?.clientId
    const userId = chatSession?.userId ?? client?.userId

    // Carga inicial. No espera al contexto (/api/me): la acción resuelve su
    // propia sesión, así el chat carga en paralelo en vez de en cascada.
    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            setLoadError(null)
            const result = await getClientChatMessagesAction()
            if (cancelled) return

            if (result.success && result.context) {
                const loaded = mergeUniqueMessages(result.messages ?? [])
                // Llegan con el read_at previo a marcarlos: el primero sin leer marca el separador
                const unread = loaded.find(message => message.sender_role === 'coach' && !message.read_at)
                setChatSession(result.context)
                setCoach(result.coach ?? null)
                setHasMore(Boolean(result.hasMore))
                setFirstUnreadId(unread?.id ?? null)
                scrollIntent.current = unread ? { kind: 'unread' } : { kind: 'bottom', smooth: false }
                setMessages(loaded)
            } else {
                setLoadError(result.error ?? 'No se pudo cargar el chat.')
                setChatSession(null)
            }
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [reloadKey])

    useEffect(() => {
        knownIds.current = new Set(messages.map(message => message.id))
    }, [messages])

    // Aplica el desplazamiento pedido justo después de pintar los mensajes
    useLayoutEffect(() => {
        const container = scrollRef.current
        const intent = scrollIntent.current
        if (!container || !intent) return
        scrollIntent.current = null

        if (intent.kind === 'preserve') {
            container.scrollTop = container.scrollHeight - intent.previousHeight + intent.previousTop
            return
        }
        if (intent.kind === 'unread') {
            const divider = container.querySelector<HTMLElement>('[data-unread-divider]')
            if (divider) {
                container.scrollTop = Math.max(0, divider.offsetTop - 16)
                return
            }
        }
        container.scrollTo({
            top: container.scrollHeight,
            behavior: intent.kind === 'bottom' && intent.smooth ? 'smooth' : 'auto',
        })
    }, [messages])

    const scrollToBottom = useCallback((smooth = true) => {
        const container = scrollRef.current
        if (!container) return
        container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
        setNewWhileAway(0)
    }, [])

    const loadOlder = useCallback(async () => {
        const container = scrollRef.current
        const oldest = messages.find(message => !message.id.startsWith('temp-'))
        if (!container || !oldest || loadingOlder || !hasMore) return

        setLoadingOlder(true)
        const result = await getClientChatMessagesAction(oldest.created_at)
        if (result.success) {
            scrollIntent.current = {
                kind: 'preserve',
                previousHeight: container.scrollHeight,
                previousTop: container.scrollTop,
            }
            setHasMore(Boolean(result.hasMore))
            setMessages(prev => mergeUniqueMessages([...(result.messages ?? []), ...prev]))
        } else {
            toast.error(result.error ?? 'No se pudieron cargar los mensajes anteriores.')
        }
        setLoadingOlder(false)
    }, [messages, loadingOlder, hasMore])

    const handleScroll = () => {
        const container = scrollRef.current
        if (!container) return
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight
        nearBottom.current = distance < NEAR_BOTTOM_PX
        setShowJump(distance > NEAR_BOTTOM_PX * 2)
        if (nearBottom.current) setNewWhileAway(0)
        if (container.scrollTop < 80) loadOlder()
    }

    // Tiempo real: mensajes nuevos y doble check cuando el coach lee
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
                const incoming = payload.new as Message
                if (incoming.coach_id !== coachId) return

                if (knownIds.current.has(incoming.id)) return
                if (nearBottom.current || incoming.sender_role === 'client') {
                    scrollIntent.current = { kind: 'bottom', smooth: true }
                } else {
                    setNewWhileAway(count => count + 1)
                }
                setMessages(prev => mergeUniqueMessages([...prev, incoming]))
                if (incoming.sender_role === 'coach') {
                    markClientCoachMessageReadAction(incoming.id)
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `client_id=eq.${clientId}`,
            }, (payload) => {
                const updated = payload.new as Message
                if (updated.coach_id !== coachId) return
                setMessages(prev => prev.map(message => message.id === updated.id ? { ...message, read_at: updated.read_at } : message))
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [coachId, clientId])

    const dispatchMessage = useCallback(async (payload: PendingPayload, reuseId?: string) => {
        if (!coachId || !clientId || !userId) return
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
            scrollIntent.current = { kind: 'bottom', smooth: true }
            setFirstUnreadId(null)
            setMessages(prev => [...prev, optimistic])
        }

        setSending(true)
        const result = await sendClientChatMessageAction(content, attachment)
        setSending(false)

        if (result.success && result.message) {
            pendingPayloads.current.delete(optimisticId)
            if (result.context) setChatSession(result.context)
            setMessages(prev => reconcileOptimisticMessage(prev, optimisticId, result.message!))
        } else {
            // Se queda en la conversación marcado como no enviado para reintentarlo
            setFailedIds(prev => new Set(prev).add(optimisticId))
            toast.error(result.error ?? 'No se pudo enviar el mensaje.')
        }
    }, [coachId, clientId, userId])

    const handleRetry = (messageId: string) => {
        const payload = pendingPayloads.current.get(messageId)
        if (payload) dispatchMessage(payload, messageId)
    }

    const handleSend = async () => {
        const content = input.trim()
        if (!content || sending) return
        setInput('')
        composerRef.current?.resetHeight()
        await dispatchMessage({ content })
    }

    const uploadAndSend = async (label: string, file: Blob, fileName: string, mime: string, duration?: number, caption = '') => {
        if (!coachId || !clientId) return
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
        () => [...messages].reverse().find(message => message.sender_role === 'client')?.id ?? null,
        [messages]
    )

    const coachName = coach?.name ?? 'Tu coach'
    const coachAvatar = <CoachAvatar name={coachName} avatarUrl={coach?.avatarUrl ?? null} size="sm" />

    const header = (
        <header className="app-mobile-header shrink-0 border-b border-border/60 bg-background/90 backdrop-blur-xl">
            <div className="flex min-h-[4.25rem] items-center gap-3 px-4 py-3 pr-24">
                {loading && !coach ? (
                    <>
                        <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                        <div className="space-y-1.5">
                            <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                        </div>
                    </>
                ) : (
                    <>
                        <CoachAvatar name={coachName} avatarUrl={coach?.avatarUrl ?? null} size="md" />
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tu entrenador</p>
                            <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-foreground">{coachName}</h1>
                        </div>
                    </>
                )}
            </div>
        </header>
    )

    if (!loading && (loadError || !coachId || !clientId)) {
        return (
            <ChatShell header={header}>
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <MessageCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold">No se pudo abrir el chat</p>
                    <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">{loadError ?? 'Inténtalo de nuevo en unos segundos.'}</p>
                    <button
                        type="button"
                        onClick={() => setReloadKey(key => key + 1)}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reintentar
                    </button>
                </div>
            </ChatShell>
        )
    }

    return (
        <ChatShell header={header}>
            <div className="relative min-h-0 flex-1">
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="h-full overflow-y-auto overscroll-contain px-3 pb-3"
                    aria-live="polite"
                >
                    {loading ? (
                        <ChatSkeleton />
                    ) : messages.length === 0 ? (
                        <EmptyChat
                            coachName={coachName}
                            avatarUrl={coach?.avatarUrl ?? null}
                            onPick={(text) => {
                                setInput(text)
                                composerRef.current?.focus()
                            }}
                        />
                    ) : (
                        <>
                            <div className="flex h-10 items-center justify-center">
                                {loadingOlder ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : hasMore ? (
                                    <button
                                        type="button"
                                        onClick={loadOlder}
                                        className="rounded-full px-3 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                                    >
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
                                        const previous = day.messages[index - 1]
                                        const next = day.messages[index + 1]
                                        const isOwn = message.sender_role === 'client'
                                        const isFirstInGroup = !sameGroup(previous, message) || message.id === firstUnreadId
                                        const isLastInGroup = !sameGroup(message, next) || next?.id === firstUnreadId

                                        return (
                                            <Fragment key={message.id}>
                                                {message.id === firstUnreadId && (
                                                    <div data-unread-divider className="my-4 flex items-center gap-3">
                                                        <span className="h-px flex-1 bg-primary/25" />
                                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Mensajes nuevos</span>
                                                        <span className="h-px flex-1 bg-primary/25" />
                                                    </div>
                                                )}
                                                <ChatMessageBubble
                                                    message={message}
                                                    isOwn={isOwn}
                                                    isFirstInGroup={isFirstInGroup}
                                                    isLastInGroup={isLastInGroup}
                                                    delivery={isOwn ? deliveryOf(message, failedIds) : undefined}
                                                    onRetry={() => handleRetry(message.id)}
                                                    avatar={coachAvatar}
                                                />
                                                {isOwn && message.id === lastOwnMessageId && message.read_at && (
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
                        onClick={() => scrollToBottom()}
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
        </ChatShell>
    )
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

/** Ocupa exactamente el alto visible entre la parte superior y la barra inferior */
function ChatShell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="app-mobile-page flex h-[calc(100dvh-var(--app-bottom-nav-height)-var(--safe-area-bottom))] flex-col overflow-hidden">
            {header}
            {children}
        </div>
    )
}

function CoachAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string | null; size: 'sm' | 'md' | 'lg' }) {
    const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'C'
    const dimension = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'md' ? 'h-11 w-11 text-sm' : 'h-7 w-7 text-[10px]'

    return (
        <span className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-bold text-primary ring-1 ring-border/60', dimension)}>
            {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : initials}
        </span>
    )
}

function EmptyChat({ coachName, avatarUrl, onPick }: { coachName: string; avatarUrl: string | null; onPick: (text: string) => void }) {
    const firstName = coachName.split(' ')[0]
    return (
        <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center animate-fade-in">
            <CoachAvatar name={coachName} avatarUrl={avatarUrl} size="lg" />
            <h2 className="mt-4 text-lg font-bold tracking-tight">Habla con {firstName}</h2>
            <p className="mt-1 max-w-[17rem] text-sm text-muted-foreground">
                Resuelve dudas de tu plan, cuéntale cómo te encuentras o envíale una foto o una nota de voz.
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
                {SUGGESTIONS.map(text => (
                    <button
                        key={text}
                        type="button"
                        onClick={() => onPick(text)}
                        className="rounded-2xl border border-border/70 bg-card px-4 py-2.5 text-left text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                    >
                        {text}
                    </button>
                ))}
            </div>
        </div>
    )
}

function ChatSkeleton() {
    const rows = [
        { own: false, width: 'w-48' },
        { own: false, width: 'w-32' },
        { own: true, width: 'w-40' },
        { own: false, width: 'w-56' },
        { own: true, width: 'w-28' },
        { own: true, width: 'w-44' },
    ]
    return (
        <div className="space-y-2 pt-6" aria-label="Cargando mensajes">
            {rows.map((row, index) => (
                <div key={index} className={cn('flex', row.own ? 'justify-end' : 'justify-start pl-9')}>
                    <div className={cn('h-9 animate-pulse rounded-[20px]', row.width, row.own ? 'bg-primary/15' : 'bg-muted')} />
                </div>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function deliveryOf(message: Message, failedIds: Set<string>): DeliveryState {
    if (failedIds.has(message.id)) return 'failed'
    if (message.id.startsWith('temp-')) return 'sending'
    return message.read_at ? 'read' : 'sent'
}

function sameGroup(a: Message | undefined, b: Message | undefined) {
    if (!a || !b) return false
    if (a.message_type === 'review_feedback' || b.message_type === 'review_feedback') return false
    return a.sender_role === b.sender_role
        && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < GROUP_WINDOW_MS
}

function groupByDay(messages: Message[]) {
    const days: { key: string; date: Date; messages: Message[] }[] = []
    for (const message of messages) {
        const date = new Date(message.created_at)
        const key = date.toDateString()
        const current = days[days.length - 1]
        if (current?.key === key) current.messages.push(message)
        else days.push({ key, date, messages: [message] })
    }
    return days
}

function formatDaySeparator(date: Date) {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Hoy'
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

    const diffDays = (today.getTime() - date.getTime()) / 86_400_000
    if (diffDays < 7) return date.toLocaleDateString('es-ES', { weekday: 'long' })

    return date.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    })
}

function formatReadAt(dateStr: string) {
    const date = new Date(dateStr)
    const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    return date.toDateString() === new Date().toDateString() ? `a las ${time}` : `el ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
}
