'use client'

import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, ImagePlus, Link2, Loader2, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { StudioExerciseMedia, StudioGridData, StudioItem } from '@/data/studio'
import { uploadMedia } from '@/lib/media-upload'
import { privateMediaUrl } from '@/lib/storage/media-refs'
import {
    addExerciseImageAction,
    addExerciseLinkAction,
    removeExerciseMediaAction,
    saveCellAttachmentAction,
    setImageConsentAction,
    type MediaResult,
} from '@/lib/studio/media-actions'
import { mediaForExercise, youtubeId, youtubeSearchUrl, youtubeThumbnail } from '@/lib/studio/media-rules'
import { cn } from '@/lib/utils'

type Scope = 'client' | 'sala' | 'session'

function hostOf(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

function mediaHref(entry: StudioExerciseMedia) {
    return entry.storage_key ? privateMediaUrl(entry.storage_key) : entry.url!
}

function mediaTitle(entry: StudioExerciseMedia) {
    if (entry.title) return entry.title
    if (entry.kind === 'youtube') return 'Vídeo de YouTube'
    return entry.kind === 'image' ? 'Imagen' : hostOf(entry.url!)
}

function mediaThumb(entry: StudioExerciseMedia) {
    if (entry.storage_key) return privateMediaUrl(entry.storage_key)
    const id = entry.url ? youtubeId(entry.url) : null
    return id ? youtubeThumbnail(id) : null
}

/** Lo que ayuda a hacer el ejercicio: primero lo del cliente, después lo de la sala y lo de esta sesión. */
export function StudioTechnique({ data, item, catalogExerciseId, exerciseName }: {
    data: StudioGridData
    item: StudioItem | null
    catalogExerciseId: string
    exerciseName: string
}) {
    const router = useRouter()
    const clientId = data.group ? null : data.client.id
    const clientName = data.client.fullName
    const [isPending, startTransition] = useTransition()
    const [adding, setAdding] = useState(false)
    const [scope, setScope] = useState<Scope>(clientId ? 'client' : 'sala')
    const [link, setLink] = useState('')
    const [title, setTitle] = useState('')
    const [progress, setProgress] = useState<number | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)

    const media = useMemo(() => mediaForExercise(data.media, catalogExerciseId), [data.media, catalogExerciseId])
    const attachment = item?.attachment ?? null
    const busy = isPending || progress !== null

    // Lo de esta sesión va a la carpeta del cliente; en una clase, a la de la sala.
    const folderClient = scope === 'sala' ? null : clientId
    const missingConsent = Boolean(folderClient) && !data.imageConsent

    const scopes: { value: Scope; label: string }[] = [
        ...(clientId ? [{ value: 'client' as const, label: `Solo ${clientName.split(' ')[0]}` }] : []),
        { value: 'sala', label: 'Toda la sala' },
        ...(item ? [{ value: 'session' as const, label: 'Esta sesión' }] : []),
    ]

    function finish(result: MediaResult, after?: () => void) {
        if (!result.success) return void toast.error(result.error)
        after?.()
        router.refresh()
    }

    function addLink() {
        startTransition(async () => {
            const result = scope === 'session'
                ? await saveCellAttachmentAction({ itemId: item!.id, imageKey: attachment?.image_key ?? null, linkText: link })
                : await addExerciseLinkAction({ coachId: data.coachId, catalogExerciseId, clientId: folderClient, text: link, title })
            finish(result, () => {
                setLink('')
                setTitle('')
            })
        })
    }

    async function addImage(file: File) {
        setProgress(0)
        const uploaded = await uploadMedia<{ key: string }>(
            { kind: 'studio', coachId: data.coachId, ...(folderClient ? { clientId: folderClient } : {}) },
            file,
            file.name,
            setProgress
        )
        setProgress(null)
        if (!uploaded.data) return void toast.error(uploaded.error)

        const key = uploaded.data.key
        startTransition(async () => {
            const result = scope === 'session'
                ? await saveCellAttachmentAction({ itemId: item!.id, imageKey: key, linkText: attachment?.link_url ?? '' })
                : await addExerciseImageAction({ coachId: data.coachId, catalogExerciseId, clientId: folderClient, storageKey: key, title })
            finish(result, () => setTitle(''))
        })
    }

    function removeMedia(id: string) {
        startTransition(async () => finish(await removeExerciseMediaAction(id)))
    }

    function saveAttachment(imageKey: string | null, linkText: string) {
        startTransition(async () => finish(await saveCellAttachmentAction({ itemId: item!.id, imageKey, linkText })))
    }

    function setConsent(accepted: boolean) {
        if (!clientId) return
        startTransition(async () => {
            finish(await setImageConsentAction(clientId, accepted), () => {
                if (!accepted) toast.success('Sus imágenes quedan ocultas.')
            })
        })
    }

    return (
        <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Técnica</span>
                <a
                    href={youtubeSearchUrl(exerciseName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                    Buscar en YouTube <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
            </div>

            {media.map(entry => (
                <MediaRow
                    key={entry.id}
                    href={mediaHref(entry)}
                    thumb={mediaThumb(entry)}
                    title={mediaTitle(entry)}
                    subtitle={entry.client_id ? `De ${clientName}` : 'De la sala'}
                    icon={entry.kind === 'link' ? <Link2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    disabled={busy}
                    onRemove={() => removeMedia(entry.id)}
                />
            ))}
            {attachment?.image_key && (
                <MediaRow
                    href={privateMediaUrl(attachment.image_key)}
                    thumb={privateMediaUrl(attachment.image_key)}
                    title="Imagen"
                    subtitle="De esta sesión"
                    disabled={busy}
                    onRemove={() => saveAttachment(null, attachment.link_url ?? '')}
                />
            )}
            {attachment?.link_url && (
                <MediaRow
                    href={attachment.link_url}
                    thumb={youtubeId(attachment.link_url) ? youtubeThumbnail(youtubeId(attachment.link_url)!) : null}
                    title={hostOf(attachment.link_url)}
                    subtitle="De esta sesión"
                    icon={<Link2 className="h-4 w-4" />}
                    disabled={busy}
                    onRemove={() => saveAttachment(attachment.image_key, '')}
                />
            )}

            {!adding ? (
                <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setAdding(true)}>
                    + Añadir enlace o imagen
                </button>
            ) : (
                <div className="space-y-2 border-t pt-2">
                    <div className={cn('grid gap-1', scopes.length === 3 ? 'grid-cols-3' : 'grid-cols-2')} role="group" aria-label="Para quién es">
                        {scopes.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={scope === option.value}
                                onClick={() => setScope(option.value)}
                                className={cn(
                                    'min-h-9 min-w-0 truncate rounded-md border px-1 text-xs font-medium',
                                    scope === option.value ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <Input
                        value={link}
                        aria-label="Enlace"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="Pega un enlace"
                        onChange={event => setLink(event.target.value)}
                    />
                    {scope !== 'session' && (
                        <Input
                            value={title}
                            aria-label="Nombre"
                            maxLength={120}
                            autoComplete="off"
                            placeholder="Nombre (opcional)"
                            onChange={event => setTitle(event.target.value)}
                        />
                    )}

                    {clientId && scope !== 'sala' && (
                        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 p-2">
                            <Label htmlFor="sala-image-consent" className="text-xs font-normal">
                                Consentimiento de imagen firmado en el centro
                            </Label>
                            <Switch id="sala-image-consent" checked={data.imageConsent} disabled={busy} onCheckedChange={setConsent} />
                        </div>
                    )}
                    {missingConsent && (
                        <p className="text-xs text-muted-foreground">Para subir imágenes suyas hace falta su consentimiento.</p>
                    )}
                    {scope === 'sala' && (
                        <p className="text-xs text-muted-foreground">No subas aquí fotos en las que se reconozca a alguien.</p>
                    )}

                    <div className="flex gap-2">
                        <Button type="button" size="sm" className="flex-1" disabled={busy || !link.trim()} onClick={addLink}>
                            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            Añadir enlace
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            disabled={busy || missingConsent}
                            onClick={() => fileInput.current?.click()}
                        >
                            <ImagePlus className="mr-1 h-3.5 w-3.5" />
                            {progress === null ? 'Subir imagen' : `${Math.round(progress * 100)} %`}
                        </Button>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            aria-label="Elegir imagen"
                            onChange={event => {
                                const file = event.target.files?.[0]
                                event.target.value = ''
                                if (file) void addImage(file)
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

function MediaRow({ href, thumb, title, subtitle, icon, disabled, onRemove }: {
    href: string
    thumb: string | null
    title: string
    subtitle: string
    icon?: ReactNode
    disabled: boolean
    onRemove: () => void
}) {
    return (
        <div className="flex items-center gap-2">
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-md hover:bg-muted/60">
                <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    {!thumb && icon}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                </span>
            </a>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={disabled} aria-label={`Quitar ${title}`} onClick={onRemove}>
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}
