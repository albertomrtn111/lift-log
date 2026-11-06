'use client'

import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ExternalLink, FolderOpen, ImagePlus, Link2, Loader2, Play, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
    assignVideoAction,
    countClientMediaAction,
    listFolderVideosAction,
    purgeClientMediaAction,
    removeExerciseMediaAction,
    saveCellAttachmentAction,
    setImageConsentAction,
    type FolderVideo,
    type MediaResult,
} from '@/lib/studio/media-actions'
import { mediaForExercise, youtubeId, youtubeSearchUrl, youtubeThumbnail } from '@/lib/studio/media-rules'
import { formatDuration, titleFromFile } from '@/lib/studio/video-rules'
import { sendVideo, type VideoStep } from '@/lib/studio/video-upload'
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
    const key = entry.video?.storage_key ?? entry.storage_key
    return key ? privateMediaUrl(key) : entry.url!
}

function mediaTitle(entry: StudioExerciseMedia) {
    if (entry.video) return entry.video.title
    if (entry.title) return entry.title
    if (entry.kind === 'youtube') return 'Vídeo de YouTube'
    return entry.kind === 'image' ? 'Imagen' : hostOf(entry.url!)
}

function mediaThumb(entry: StudioExerciseMedia) {
    if (entry.video) return entry.video.thumb_key ? privateMediaUrl(entry.video.thumb_key) : null
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
    const [videoStep, setVideoStep] = useState<VideoStep | null>(null)
    const [playing, setPlaying] = useState<string | null>(null)
    const [folder, setFolder] = useState<FolderVideo[] | null>(null)
    const [hiddenCount, setHiddenCount] = useState(0)
    const fileInput = useRef<HTMLInputElement>(null)
    const videoInput = useRef<HTMLInputElement>(null)
    const cameraInput = useRef<HTMLInputElement>(null)

    const media = useMemo(() => mediaForExercise(data.media, catalogExerciseId), [data.media, catalogExerciseId])
    const attachment = item?.attachment ?? null
    const busy = isPending || progress !== null || videoStep !== null

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

    async function addVideo(file: File) {
        setVideoStep({ label: 'Preparando', fraction: 0 })
        const sent = await sendVideo({
            file,
            coachId: data.coachId,
            clientId: folderClient,
            title: title.trim() || titleFromFile(file.name),
            onStep: setVideoStep,
        })
        setVideoStep(null)
        if (!sent.id) return void toast.error(sent.error)

        const assetId = sent.id
        startTransition(async () => finish(await assignVideoAction(assetId, catalogExerciseId, folderClient), () => setTitle('')))
    }

    function openFolder() {
        startTransition(async () => setFolder(await listFolderVideosAction(data.coachId)))
    }

    function assignVideo(assetId: string) {
        startTransition(async () => finish(await assignVideoAction(assetId, catalogExerciseId, folderClient), () => setFolder(null)))
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
            const result = await setImageConsentAction(clientId, accepted)
            finish(result)
            if (result.success && !accepted) setHiddenCount(await countClientMediaAction(clientId))
        })
    }

    function purge() {
        if (!clientId) return
        setHiddenCount(0)
        startTransition(async () => finish(await purgeClientMediaAction(clientId)))
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
                <div key={entry.id} className="space-y-2">
                    <MediaRow
                        href={mediaHref(entry)}
                        thumb={mediaThumb(entry)}
                        title={mediaTitle(entry)}
                        subtitle={[
                            entry.client_id ? `De ${clientName}` : 'De la sala',
                            entry.video ? formatDuration(entry.video.duration_seconds) : '',
                        ].filter(Boolean).join(' · ')}
                        icon={entry.kind === 'link' ? <Link2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        disabled={busy}
                        onPlay={entry.video ? () => setPlaying(playing === entry.id ? null : entry.id) : undefined}
                        onRemove={() => removeMedia(entry.id)}
                    />
                    {playing === entry.id && entry.video && (
                        <video
                            src={mediaHref(entry)}
                            poster={mediaThumb(entry) ?? undefined}
                            controls
                            autoPlay
                            playsInline
                            className="max-h-80 w-full rounded bg-black"
                        />
                    )}
                </div>
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
                    + Añadir enlace, imagen o vídeo
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

                    {scope !== 'session' && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-1">
                                <Button type="button" size="sm" variant="outline" className="min-w-0 px-1 text-xs" disabled={busy || missingConsent} onClick={() => videoInput.current?.click()}>
                                    <Video className="mr-1 h-3.5 w-3.5 shrink-0" /> Vídeo
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="min-w-0 px-1 text-xs" disabled={busy || missingConsent} onClick={() => cameraInput.current?.click()}>
                                    <Camera className="mr-1 h-3.5 w-3.5 shrink-0" /> Grabar
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="min-w-0 px-1 text-xs" disabled={busy} onClick={openFolder}>
                                    <FolderOpen className="mr-1 h-3.5 w-3.5 shrink-0" /> Carpeta
                                </Button>
                            </div>
                            {[videoInput, cameraInput].map((input, index) => (
                                <input
                                    key={index}
                                    ref={input}
                                    type="file"
                                    accept="video/*"
                                    capture={index === 1 ? 'environment' : undefined}
                                    className="hidden"
                                    aria-label={index === 1 ? 'Grabar vídeo' : 'Elegir vídeo'}
                                    onChange={event => {
                                        const file = event.target.files?.[0]
                                        event.target.value = ''
                                        if (file) void addVideo(file)
                                    }}
                                />
                            ))}
                            {videoStep && (
                                <div className="space-y-1 text-xs text-muted-foreground">
                                    <p>{videoStep.label} {Math.round(videoStep.fraction * 100)} %. Deja esta pantalla abierta.</p>
                                    <div className="h-1 overflow-hidden rounded bg-muted">
                                        <div className="h-full bg-primary" style={{ width: `${Math.round(videoStep.fraction * 100)}%` }} />
                                    </div>
                                </div>
                            )}
                            {!videoStep && (
                                <p className="text-xs text-muted-foreground">
                                    Se aligeran a 720p y sin sonido, y tardan lo que dura el vídeo. Grabar desde aquí da menos calidad que la app Cámara.
                                </p>
                            )}
                            {folder && (
                                <FolderPicker
                                    videos={folder.filter(video => !video.client_id || video.client_id === folderClient)}
                                    disabled={busy}
                                    onPick={assignVideo}
                                    onClose={() => setFolder(null)}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}

            <AlertDialog open={hiddenCount > 0} onOpenChange={open => { if (!open) setHiddenCount(0) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sus imágenes y vídeos quedan ocultos</AlertDialogTitle>
                        <AlertDialogDescription>
                            {hiddenCount === 1 ? 'Hay 1 archivo' : `Hay ${hiddenCount} archivos`} de {clientName}. ¿Quieres borrarlos también? No se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Dejarlos ocultos</AlertDialogCancel>
                        <AlertDialogAction onClick={purge}>Borrarlos</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function FolderPicker({ videos, disabled, onPick, onClose }: {
    videos: FolderVideo[]
    disabled: boolean
    onPick: (id: string) => void
    onClose: () => void
}) {
    return (
        <div className="space-y-1 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Vídeos de la carpeta</span>
                <button type="button" aria-label="Cerrar la carpeta" className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            {videos.length === 0 && <p className="text-xs text-muted-foreground">No hay vídeos que se puedan usar aquí.</p>}
            <ul className="max-h-48 space-y-1 overflow-y-auto">
                {videos.map(video => (
                    <li key={video.id}>
                        <button
                            type="button"
                            disabled={disabled}
                            className="flex min-h-11 w-full items-center gap-2 rounded text-left text-sm hover:bg-muted/60"
                            onClick={() => onPick(video.id)}
                        >
                            <span className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {video.thumb_key ? <img src={privateMediaUrl(video.thumb_key)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Play className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{video.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(video.duration_seconds)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function MediaRow({ href, thumb, title, subtitle, icon, disabled, onPlay, onRemove }: {
    href: string
    thumb: string | null
    title: string
    subtitle: string
    icon?: ReactNode
    disabled: boolean
    /** Si se reproduce aquí mismo, en vez de abrirse aparte. */
    onPlay?: () => void
    onRemove: () => void
}) {
    const rowClass = 'flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-md text-left hover:bg-muted/60'
    const content = (
        <>
            <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                {!thumb && icon}
            </span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            </span>
        </>
    )

    return (
        <div className="flex items-center gap-2">
            {onPlay
                ? <button type="button" className={rowClass} onClick={onPlay}>{content}</button>
                : <a href={href} target="_blank" rel="noopener noreferrer" className={rowClass}>{content}</a>}
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={disabled} aria-label={`Quitar ${title}`} onClick={onRemove}>
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}
