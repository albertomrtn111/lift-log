'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2, Mic } from 'lucide-react'
import {
    formatAudioDuration,
    formatFileSize,
    getChatAttachmentUrl,
} from '@/lib/chat-media'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/messages'

interface AttachmentBubbleProps {
    message: Message
    /** true si la burbuja es del emisor (fondo primary) para ajustar contraste */
    isOwn: boolean
}

/**
 * Renderiza el adjunto de un mensaje: documento, audio o imagen.
 * Resuelve la URL firmada del bucket privado al montar.
 */
export function AttachmentBubble({ message, isOwn }: AttachmentBubbleProps) {
    const [url, setUrl] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)

    const path = message.attachment_url

    useEffect(() => {
        if (!path) return
        let cancelled = false
        getChatAttachmentUrl(path).then((signed) => {
            if (cancelled) return
            if (signed) setUrl(signed)
            else setFailed(true)
        })
        return () => { cancelled = true }
    }, [path])

    if (!path) return null

    if (failed) {
        return (
            <p className={cn('text-xs italic', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                No se pudo cargar el adjunto
            </p>
        )
    }

    if (message.attachment_type === 'audio') {
        return (
            <div className="flex min-w-[220px] items-center gap-2.5 sm:min-w-[260px]">
                <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    isOwn ? 'bg-primary-foreground/15' : 'bg-primary/10'
                )}>
                    <Mic className={cn('h-4 w-4', isOwn ? 'text-primary-foreground' : 'text-primary')} />
                </div>
                {url ? (
                    <div className="min-w-0 flex-1">
                        <audio controls preload="metadata" src={url} className="h-9 w-full max-w-[260px]" />
                    </div>
                ) : (
                    <div className="flex h-9 flex-1 items-center">
                        <Loader2 className={cn('h-4 w-4 animate-spin', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')} />
                    </div>
                )}
                {message.attachment_duration ? (
                    <span className={cn('shrink-0 text-[11px] tabular-nums', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {formatAudioDuration(message.attachment_duration)}
                    </span>
                ) : null}
            </div>
        )
    }

    if (message.attachment_type === 'image') {
        return url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={url}
                    alt={message.attachment_name ?? 'Imagen'}
                    className="max-h-64 w-auto max-w-full rounded-lg object-cover"
                />
            </a>
        ) : (
            <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-muted/40">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    // Documento
    return (
        <a
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={cn(
                'flex min-w-[200px] items-center gap-3 rounded-lg p-2 transition-opacity sm:min-w-[240px]',
                isOwn ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' : 'bg-muted/60 hover:bg-muted',
                !url && 'pointer-events-none opacity-70'
            )}
        >
            <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                isOwn ? 'bg-primary-foreground/15' : 'bg-primary/10'
            )}>
                {url ? (
                    <FileText className={cn('h-5 w-5', isOwn ? 'text-primary-foreground' : 'text-primary')} />
                ) : (
                    <Loader2 className={cn('h-4 w-4 animate-spin', isOwn ? 'text-primary-foreground' : 'text-primary')} />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', isOwn ? 'text-primary-foreground' : 'text-foreground')}>
                    {message.attachment_name ?? 'Documento'}
                </p>
                <p className={cn('text-[11px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {formatFileSize(message.attachment_size)}
                </p>
            </div>
        </a>
    )
}
