'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Pause, Play } from 'lucide-react'
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
        return <VoiceNotePlayer url={url} duration={message.attachment_duration ?? null} isOwn={isOwn} />
    }

    if (message.attachment_type === 'image') {
        return url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={url}
                    alt={message.attachment_name ?? 'Imagen'}
                    className="max-h-72 w-auto max-w-full rounded-[14px] object-cover"
                />
            </a>
        ) : (
            <div className={cn('flex h-40 w-56 items-center justify-center rounded-[14px]', isOwn ? 'bg-primary-foreground/10' : 'bg-muted/40')}>
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

const WAVE_BARS = [0.35, 0.6, 0.45, 0.8, 0.55, 1, 0.7, 0.4, 0.85, 0.5, 0.65, 0.9, 0.45, 0.7, 0.35, 0.6, 0.8, 0.5, 0.4, 0.65, 0.3, 0.55, 0.45, 0.35]

/** Nota de voz con controles propios: play/pausa, onda con progreso y tiempo */
function VoiceNotePlayer({ url, duration, isOwn }: { url: string | null; duration: number | null; isOwn: boolean }) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const [playing, setPlaying] = useState(false)
    const [current, setCurrent] = useState(0)
    const [total, setTotal] = useState<number>(duration ?? 0)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        const onTime = () => setCurrent(audio.currentTime)
        const onMeta = () => {
            // Los webm de MediaRecorder suelen reportar Infinity: manda la duración guardada
            if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration)
        }
        const onEnd = () => { setPlaying(false); setCurrent(0) }
        const onPause = () => setPlaying(false)
        const onPlay = () => setPlaying(true)
        audio.addEventListener('timeupdate', onTime)
        audio.addEventListener('loadedmetadata', onMeta)
        audio.addEventListener('ended', onEnd)
        audio.addEventListener('pause', onPause)
        audio.addEventListener('play', onPlay)
        return () => {
            audio.removeEventListener('timeupdate', onTime)
            audio.removeEventListener('loadedmetadata', onMeta)
            audio.removeEventListener('ended', onEnd)
            audio.removeEventListener('pause', onPause)
            audio.removeEventListener('play', onPlay)
        }
    }, [url])

    const toggle = () => {
        const audio = audioRef.current
        if (!audio) return
        if (audio.paused) {
            // Solo una nota sonando a la vez
            document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause() })
            audio.play().catch(() => setPlaying(false))
        } else {
            audio.pause()
        }
    }

    const seek = (event: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current
        if (!audio || !total) return
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        audio.currentTime = ratio * total
        setCurrent(audio.currentTime)
    }

    const progress = total > 0 ? Math.min(1, current / total) : 0
    const shown = playing || current > 0 ? current : total

    return (
        <div className="flex w-[220px] items-center gap-2.5 sm:w-[260px]">
            {url && <audio ref={audioRef} src={url} preload="metadata" className="hidden" />}
            <button
                type="button"
                onClick={toggle}
                disabled={!url}
                aria-label={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95',
                    isOwn ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                )}
            >
                {!url ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : playing ? (
                    <Pause className="h-4 w-4" fill="currentColor" />
                ) : (
                    <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                )}
            </button>
            <div
                className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
                onClick={seek}
                role="presentation"
            >
                {WAVE_BARS.map((height, index) => {
                    const active = (index + 0.5) / WAVE_BARS.length <= progress
                    return (
                        <span
                            key={index}
                            className={cn(
                                'w-[3px] flex-1 rounded-full transition-colors',
                                isOwn
                                    ? active ? 'bg-primary-foreground' : 'bg-primary-foreground/35'
                                    : active ? 'bg-primary' : 'bg-foreground/20'
                            )}
                            style={{ height: `${Math.round(height * 100)}%` }}
                        />
                    )
                })}
            </div>
            <span className={cn('w-9 shrink-0 text-right text-[11px] tabular-nums', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {formatAudioDuration(Math.round(shown))}
            </span>
        </div>
    )
}
