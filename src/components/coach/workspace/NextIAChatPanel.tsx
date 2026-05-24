'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Bot, Loader2, MessageSquareText, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getMarkdownLineKind, tokenizeBoldMarkdown } from '@/lib/markdown/simple-markdown'
import {
    getNextIAMessagesAction,
    sendNextIAMessageAction,
    type NextIAChatMessage,
} from './nextia-actions'

interface NextIAChatPanelProps {
    coachId: string
    clientId: string
    clientName?: string | null
    standalone?: boolean
}

const SUGGESTIONS = [
    'Como ves al atleta esta semana?',
    'Que cambiarias con el evento que tiene cerca?',
    'Resume riesgos y prioridades del bloque actual.',
]

export function NextIAChatPanel({ coachId, clientId, clientName, standalone = false }: NextIAChatPanelProps) {
    const [messages, setMessages] = useState<NextIAChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const scrollRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)

        getNextIAMessagesAction(coachId, clientId)
            .then((nextMessages) => {
                if (cancelled) return
                setMessages(nextMessages)
            })
            .catch((err) => {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'No se pudo cargar Chat NextIA.')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [coachId, clientId])

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isPending])

    const resizeTextarea = () => {
        const element = textareaRef.current
        if (!element) return
        element.style.height = 'auto'
        element.style.height = `${Math.min(element.scrollHeight, 120)}px`
    }

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(event.target.value)
        requestAnimationFrame(resizeTextarea)
    }

    const handleSend = () => {
        const content = input.trim()
        if (!content || isPending) return

        const optimisticMessage: NextIAChatMessage = {
            id: `temp-${Date.now()}`,
            coach_id: coachId,
            client_id: clientId,
            role: 'user',
            content,
            context_version: 'nextia-athlete-v1',
            created_at: new Date().toISOString(),
        }

        setMessages(prev => [...prev, optimisticMessage])
        setInput('')
        setError(null)
        requestAnimationFrame(resizeTextarea)

        startTransition(async () => {
            const result = await sendNextIAMessageAction({ coachId, clientId, content })
            if (result.success && result.messages) {
                setMessages(result.messages)
                return
            }

            setMessages(prev => prev.filter(message => message.id !== optimisticMessage.id))
            setError(result.error || 'No se pudo generar la respuesta de NextIA.')
        })
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            handleSend()
        }
    }

    return (
        <Card className={cn(
            'flex min-h-[520px] min-w-0 max-w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
            standalone ? 'h-[calc(100vh-16rem)] min-h-[640px]' : 'lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]'
        )}>
            <header className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">Chat NextIA</h3>
                        <p className="truncate text-xs text-muted-foreground">
                            {clientName ? `Contexto privado de ${clientName}` : 'Contexto privado del atleta'}
                        </p>
                    </div>
                </div>
            </header>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/20 px-3 py-4">
                {loading ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col justify-center gap-4 text-center">
                        <div>
                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <p className="text-sm font-medium">Pregunta sobre este atleta</p>
                        </div>
                        <div className="space-y-2 text-left">
                            {SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => {
                                        setInput(suggestion)
                                        requestAnimationFrame(resizeTextarea)
                                    }}
                                    className="w-full rounded-lg border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="min-w-0 space-y-3">
                        {messages.map((message) => {
                            const isUser = message.role === 'user'
                            return (
                                <div
                                    key={message.id}
                                    className={cn('flex min-w-0 max-w-full flex-col', isUser ? 'items-end' : 'items-start')}
                                >
                                    <div
                                        className={cn(
                                            'min-w-0 max-w-[92%] break-words rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm',
                                            isUser
                                                ? 'rounded-br-md bg-primary text-primary-foreground'
                                                : 'rounded-bl-md border bg-background text-foreground'
                                        )}
                                    >
                                        {isUser ? (
                                            <span className="whitespace-pre-wrap break-words">{message.content}</span>
                                        ) : (
                                            <NextIAMarkdown content={message.content} />
                                        )}
                                    </div>
                                    <span className="mt-1 px-1 text-[10px] text-muted-foreground">
                                        {isUser ? 'Coach' : 'NextIA'} · {formatTime(message.created_at)}
                                    </span>
                                </div>
                            )
                        })}
                        {isPending ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                NextIA esta leyendo el contexto
                            </div>
                        ) : null}
                        <div ref={scrollRef} />
                    </div>
                )}
            </div>

            <footer className="border-t bg-card px-3 py-3">
                {error ? (
                    <div className="mb-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {error}
                    </div>
                ) : null}
                <div className="flex min-w-0 items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Pregunta a NextIA..."
                        rows={1}
                        className="max-h-[120px] min-h-10 min-w-0 flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!input.trim() || isPending || loading}
                        className="h-10 w-10 shrink-0 rounded-xl"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <MessageSquareText className="h-3 w-3" />
                    Privado del coach
                </div>
            </footer>
        </Card>
    )
}

function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

function NextIAMarkdown({ content }: { content: string }) {
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
                            <span className="min-w-0">{renderInlineMarkdown(parsed.content)}</span>
                        </div>
                    )
                }

                if (parsed.type === 'numbered') {
                    return (
                        <div key={`${index}-${line}`} className="flex min-w-0 gap-2">
                            <span className="shrink-0 font-medium tabular-nums text-muted-foreground">{parsed.marker}</span>
                            <span className="min-w-0">{renderInlineMarkdown(parsed.content)}</span>
                        </div>
                    )
                }

                return (
                    <p key={`${index}-${line}`} className="min-w-0 break-words">
                        {renderInlineMarkdown(parsed.content)}
                    </p>
                )
            })}
        </div>
    )
}

function renderInlineMarkdown(text: string) {
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
