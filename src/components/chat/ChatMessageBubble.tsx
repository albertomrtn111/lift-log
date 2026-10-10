'use client'

import { AlertCircle, Check, CheckCheck, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/messages'
import { AttachmentBubble } from './AttachmentBubble'
import { ReviewFeedbackCard } from './ReviewFeedbackCard'

export type DeliveryState = 'sending' | 'failed' | 'sent' | 'read'

interface ChatMessageBubbleProps {
    message: Message
    isOwn: boolean
    /** Posición dentro de un grupo de mensajes seguidos del mismo autor */
    isFirstInGroup: boolean
    isLastInGroup: boolean
    delivery?: DeliveryState
    onRetry?: () => void
    /** Avatar del coach, solo se pinta en el último mensaje del grupo */
    avatar?: React.ReactNode
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/g
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u

function isEmojiOnly(text: string) {
    const trimmed = text.trim()
    if (!trimmed || /\d/.test(trimmed)) return false
    return EMOJI_ONLY.test(trimmed) && [...trimmed.replace(/\s/g, '')].length <= 8
}

function Linkified({ text, isOwn }: { text: string; isOwn: boolean }) {
    const parts = text.split(URL_PATTERN)
    return (
        <>
            {parts.map((part, index) => {
                if (index % 2 === 0) return part
                const href = part.startsWith('http') ? part : `https://${part}`
                return (
                    <a
                        key={index}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className={cn('break-all underline underline-offset-2', isOwn ? 'decoration-primary-foreground/50' : 'text-primary decoration-primary/40')}
                    >
                        {part}
                    </a>
                )
            })}
        </>
    )
}

function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function DeliveryIcon({ state }: { state: DeliveryState }) {
    if (state === 'sending') return <Clock3 className="h-3 w-3" aria-label="Enviando" />
    if (state === 'failed') return <AlertCircle className="h-3 w-3" aria-label="No enviado" />
    if (state === 'read') return <CheckCheck className="h-3.5 w-3.5" aria-label="Leído" />
    return <Check className="h-3.5 w-3.5 opacity-80" aria-label="Enviado" />
}

export function ChatMessageBubble({
    message,
    isOwn,
    isFirstInGroup,
    isLastInGroup,
    delivery,
    onRetry,
    avatar,
}: ChatMessageBubbleProps) {
    const isReview = message.message_type === 'review_feedback'
    const hasAttachment = !!message.attachment_url
    const isImageOnly = message.attachment_type === 'image' && !message.content
    const bigEmoji = !hasAttachment && isEmojiOnly(message.content)
    const failed = delivery === 'failed'

    const meta = (
        <span
            className={cn(
                'flex shrink-0 items-center gap-1 text-[10px] leading-none tabular-nums',
                isOwn && !bigEmoji ? 'text-primary-foreground/75' : 'text-muted-foreground',
                isOwn && delivery === 'read' && !bigEmoji && 'text-primary-foreground'
            )}
        >
            {formatTime(message.created_at)}
            {isOwn && delivery && <DeliveryIcon state={delivery} />}
        </span>
    )

    let body: React.ReactNode
    if (isReview) {
        body = <div className="w-[min(100%,22rem)]"><ReviewFeedbackCard content={message.content} createdAt={message.created_at} /></div>
    } else if (bigEmoji) {
        body = (
            <div className="flex flex-col items-end gap-0.5 px-1">
                <span className="text-[40px] leading-tight">{message.content}</span>
                {meta}
            </div>
        )
    } else {
        body = (
            <div
                className={cn(
                    'relative max-w-[min(80vw,26rem)] break-words text-[15px] leading-snug shadow-sm',
                    isImageOnly ? 'p-1' : 'px-3 py-2',
                    'rounded-[20px]',
                    isOwn
                        ? cn(
                            'bg-primary text-primary-foreground',
                            !isFirstInGroup && 'rounded-tr-md',
                            !isLastInGroup && 'rounded-br-md',
                            isLastInGroup && 'rounded-br-[6px]'
                        )
                        : cn(
                            'border border-border/70 bg-card text-foreground',
                            !isFirstInGroup && 'rounded-tl-md',
                            !isLastInGroup && 'rounded-bl-md',
                            isLastInGroup && 'rounded-bl-[6px]'
                        ),
                    failed && 'opacity-60'
                )}
            >
                {hasAttachment && (
                    <div className={cn(message.content && 'mb-1.5')}>
                        <AttachmentBubble message={message} isOwn={isOwn} />
                    </div>
                )}
                {message.content ? (
                    // La hora flota al final de la última línea, como en las apps de mensajería
                    <p className="whitespace-pre-wrap">
                        <Linkified text={message.content} isOwn={isOwn} />
                        <span aria-hidden className={cn('inline-block h-3', isOwn ? 'w-[4.25rem]' : 'w-11')} />
                        <span className="absolute bottom-1.5 right-3">{meta}</span>
                    </p>
                ) : (
                    <div className={cn('flex justify-end', isImageOnly ? 'px-2 pb-1 pt-1' : 'mt-1')}>{meta}</div>
                )}
            </div>
        )
    }

    return (
        <div className={cn('flex items-end gap-2', isOwn ? 'justify-end' : 'justify-start', isFirstInGroup ? 'mt-3' : 'mt-0.5')}>
            {!isOwn && (
                <div className="w-7 shrink-0">{isLastInGroup ? avatar : null}</div>
            )}
            <div className={cn('flex min-w-0 flex-col', isOwn ? 'items-end' : 'items-start')}>
                {body}
                {failed && onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive"
                    >
                        <AlertCircle className="h-3 w-3" />
                        No enviado · Toca para reintentar
                    </button>
                )}
            </div>
        </div>
    )
}
