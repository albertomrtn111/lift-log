'use client'

import { useState } from 'react'
import { ChevronDown, ExternalLink, Play } from 'lucide-react'
import type { AthleteMedia } from '@/data/athlete-sessions'
import { privateMediaUrl } from '@/lib/storage/media-refs'
import { youtubeId, youtubeThumbnail } from '@/lib/studio/media-rules'
import { cn } from '@/lib/utils'

function titleOf(entry: AthleteMedia) {
    if (entry.video) return entry.video.title
    if (entry.title) return entry.title
    if (entry.kind === 'youtube') return 'Vídeo de YouTube'
    return entry.kind === 'image' ? 'Imagen' : 'Enlace'
}

function thumbOf(entry: AthleteMedia) {
    if (entry.video) return entry.video.thumb_key ? privateMediaUrl(entry.video.thumb_key) : null
    if (entry.storage_key) return privateMediaUrl(entry.storage_key)
    const id = entry.url ? youtubeId(entry.url) : null
    return id ? youtubeThumbnail(id) : null
}

/** Botón Ver técnica de un ejercicio: lo suyo primero y después lo de la sala. */
export function AthleteTechnique({ media }: { media: AthleteMedia[] }) {
    const [open, setOpen] = useState(false)
    const [playing, setPlaying] = useState<string | null>(null)
    if (media.length === 0) return null

    return (
        <div className="mt-2">
            <button type="button" aria-expanded={open} className="inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-primary" onClick={() => setOpen(!open)}>
                Ver técnica <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {open && (
                <ul className="space-y-2">
                    {media.map(entry => {
                        const thumb = thumbOf(entry)
                        const inside = (
                            <>
                                <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Play className="h-4 w-4" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{titleOf(entry)}</span>
                            </>
                        )
                        return (
                            <li key={entry.id} className="space-y-2">
                                {entry.video ? (
                                    <button type="button" className="flex min-h-11 w-full items-center gap-2 text-left" onClick={() => setPlaying(playing === entry.id ? null : entry.id)}>
                                        {inside}
                                    </button>
                                ) : (
                                    <a
                                        href={entry.storage_key ? privateMediaUrl(entry.storage_key) : entry.url!}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex min-h-11 items-center gap-2"
                                    >
                                        {inside}
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                    </a>
                                )}
                                {playing === entry.id && entry.video && (
                                    <video
                                        src={privateMediaUrl(entry.video.storage_key)}
                                        poster={thumb ?? undefined}
                                        controls
                                        autoPlay
                                        playsInline
                                        className="max-h-80 w-full rounded-xl bg-black"
                                    />
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
