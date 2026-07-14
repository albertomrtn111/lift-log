'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Send, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { getMarkdownLineKind, tokenizeBoldMarkdown } from '@/lib/markdown/simple-markdown'
import { cn } from '@/lib/utils'
import {
    clearCoachAssistantChatAction,
    getCoachAssistantMessagesAction,
    sendCoachAssistantMessageAction,
    type CoachAssistantMessage,
} from './assistant-actions'

const SUGGESTIONS = [
    '¿Qué atletas tienen revisión esta semana?',
    '¿Quién lleva más tiempo sin entregar su revisión?',
    '¿Qué tengo pendiente hoy?',
    '¿Cómo puedo mejorar la adherencia de un atleta que entrega poco?',
]

export function CoachAssistantWidget() {
    const [open, setOpen] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [loading, setLoading] = useState(false)
    const [messages, setMessages] = useState<CoachAssistantMessage[]>([])
    const [input, setInput] = useState('')
    const [isPending, startTransition] = useTransition()
    const scrollRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const scrollToBottom = useCallback(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Carga perezosa: solo al abrir el panel por primera vez
    useEffect(() => {
        if (!open || loaded) return
        let cancelled = false
        setLoading(true)
        getCoachAssistantMessagesAction().then((history) => {
            if (cancelled) return
            setMessages(history)
            setLoaded(true)
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [open, loaded])

    useEffect(() => {
        if (open) scrollToBottom()
    }, [messages, open, scrollToBottom])

    const handleSend = (text?: string) => {
        const question = (text ?? input).trim()
        if (!question || isPending) return

        setInput('')
        if (textareaRef.current) textareaRef.current.style.height = 'auto'

        const optimistic: CoachAssistantMessage = {
            id: `temp-${Date.now()}`,
            coach_id: '',
            role: 'user',
            content: question,
            created_at: new Date().toISOString(),
        }
        setMessages(prev => [...prev, optimistic])

        startTransition(async () => {
            const result = await sendCoachAssistantMessageAction(question)
            if (result.success && result.messages) {
                setMessages(result.messages)
            } else {
                setMessages(prev => prev.filter(m => m.id !== optimistic.id))
                toast.error(result.error || 'No se pudo generar la respuesta.')
            }
        })
    }

    const handleClear = () => {
        if (messages.length === 0) return
        if (!confirm('¿Borrar toda la conversación con el asistente?')) return
        startTransition(async () => {
            const result = await clearCoachAssistantChatAction()
            if (result.success) {
                setMessages([])
            } else {
                toast.error(result.error || 'No se pudo borrar la conversación.')
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
        <>
            {/* Botón flotante, visible en todo el portal del coach */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Abrir asistente IA"
                className={cn(
                    'fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6',
                    'flex h-13 w-13 items-center justify-center rounded-full p-3.5',
                    'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg',
                    'transition-transform hover:scale-105 active:scale-95'
                )}
            >
                <Sparkles className="h-6 w-6" />
            </button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-md">
                    <SheetHeader className="shrink-0 border-b px-4 py-4 pr-14 text-left">
                        <div className="flex items-center justify-between gap-2">
                            <SheetTitle className="flex items-center gap-2 text-base">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                                    <Sparkles className="h-4 w-4 text-primary" />
                                </span>
                                Asistente IA
                                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[10px] text-primary">
                                    Solo consulta
                                </Badge>
                            </SheetTitle>
                            {messages.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClear}
                                    disabled={isPending}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    aria-label="Borrar conversación"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Conoce a tus atletas, tu agenda y tus tareas. Pregunta lo que necesites.
                        </p>
                    </SheetHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4">
                        {loading ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex h-full flex-col justify-end gap-4">
                                <div className="text-center">
                                    <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary/40" />
                                    <p className="text-sm font-medium">¿En qué te ayudo?</p>
                                    <p className="mx-auto mt-1 max-w-[260px] text-xs text-muted-foreground">
                                        Puedo responder sobre el estado de tus atletas, tu agenda de revisiones y tus tareas.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {SUGGESTIONS.map(suggestion => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => handleSend(suggestion)}
                                            disabled={isPending}
                                            className="w-full rounded-xl border bg-background px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {messages.map(message => {
                                    const isUser = message.role === 'user'
                                    return (
                                        <div
                                            key={message.id}
                                            className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}
                                        >
                                            <div
                                                className={cn(
                                                    'max-w-[92%] break-words rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm',
                                                    isUser
                                                        ? 'rounded-br-md bg-primary text-primary-foreground'
                                                        : 'rounded-bl-md border bg-background text-foreground'
                                                )}
                                            >
                                                {isUser ? (
                                                    <span className="whitespace-pre-wrap">{message.content}</span>
                                                ) : (
                                                    <AssistantMarkdown content={message.content} />
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                                {isPending && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Consultando los datos de tus atletas…
                                    </div>
                                )}
                                <div ref={scrollRef} />
                            </div>
                        )}
                    </div>

                    <footer className="shrink-0 border-t bg-card px-3 py-3">
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder="Pregunta sobre tus atletas…"
                                rows={1}
                                className="max-h-[120px] min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <Button
                                size="icon"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isPending}
                                className="h-10 w-10 shrink-0 rounded-xl"
                                aria-label="Enviar"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                            Solo consulta: no crea ni modifica nada. Puede cometer errores — verifica los datos importantes.
                        </p>
                    </footer>
                </SheetContent>
            </Sheet>
        </>
    )
}

function AssistantMarkdown({ content }: { content: string }) {
    const lines = content.split('\n')

    return (
        <div className="min-w-0 space-y-2 break-words">
            {lines.map((line, index) => {
                if (!line.trim()) {
                    return <div key={`blank-${index}`} className="h-2" />
                }

                const parsed = getMarkdownLineKind(line)

                if (parsed.type === 'bullet') {
                    return (
                        <div key={`${index}-${line}`} className="flex min-w-0 gap-2">
                            <span className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                            <span className="min-w-0">{renderInline(parsed.content)}</span>
                        </div>
                    )
                }

                if (parsed.type === 'numbered') {
                    return (
                        <div key={`${index}-${line}`} className="flex min-w-0 gap-2">
                            <span className="shrink-0 font-medium tabular-nums text-muted-foreground">{parsed.marker}</span>
                            <span className="min-w-0">{renderInline(parsed.content)}</span>
                        </div>
                    )
                }

                return (
                    <p key={`${index}-${line}`} className="min-w-0 break-words">
                        {renderInline(parsed.content)}
                    </p>
                )
            })}
        </div>
    )
}

function renderInline(text: string) {
    return tokenizeBoldMarkdown(text).map((token, index) => (
        token.bold ? (
            <strong key={`${index}-${token.text}`} className="font-semibold">
                {token.text}
            </strong>
        ) : (
            <span key={`${index}-${token.text}`}>{token.text}</span>
        )
    ))
}
