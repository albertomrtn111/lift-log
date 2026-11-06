'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Loader2, Play, Plus, Trash2, Upload, X } from 'lucide-react'
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
import { StudioExerciseSearch } from '@/components/coach/sala/StudioExerciseSearch'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { StudioVideo, StudioVideoFolder as FolderData } from '@/data/studio'
import { privateMediaUrl } from '@/lib/storage/media-refs'
import {
    assignVideoAction,
    removeExerciseMediaAction,
    removeVideoAction,
    renameVideoAction,
    setImageConsentAction,
    type MediaResult,
} from '@/lib/studio/media-actions'
import { formatDuration, formatSize, titleFromFile } from '@/lib/studio/video-rules'
import { sendVideo, type VideoStep } from '@/lib/studio/video-upload'

const ROOM = 'sala'

type QueueEntry = { id: string; name: string; step: VideoStep | null; state: 'waiting' | 'working' | 'done' | 'failed'; error?: string }

export function StudioVideoFolder({ coachId, folder }: { coachId: string; folder: FolderData }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [target, setTarget] = useState(ROOM)
    const [queue, setQueue] = useState<QueueEntry[]>([])
    const pickInput = useRef<HTMLInputElement>(null)
    const cameraInput = useRef<HTMLInputElement>(null)

    const client = folder.clients.find(entry => entry.id === target) ?? null
    const missingConsent = Boolean(client) && !client?.consent
    const working = queue.some(entry => entry.state === 'working' || entry.state === 'waiting')

    function run(action: () => Promise<MediaResult>) {
        startTransition(async () => {
            const result = await action()
            if (!result.success) return void toast.error(result.error)
            router.refresh()
        })
    }

    // Uno detrás de otro: aligerar exige tener el vídeo en reproducción.
    async function upload(files: File[]) {
        const entries = files.map(file => ({ id: crypto.randomUUID(), name: file.name, step: null, state: 'waiting' as const }))
        const change = (id: string, patch: Partial<QueueEntry>) => {
            setQueue(current => current.map(entry => (entry.id === id ? { ...entry, ...patch } : entry)))
        }
        setQueue(entries)
        for (const [index, file] of files.entries()) {
            const { id } = entries[index]
            change(id, { state: 'working' })
            const result = await sendVideo({
                file,
                coachId,
                clientId: client?.id ?? null,
                title: titleFromFile(file.name),
                onStep: step => change(id, { step }),
            })
            change(id, result.error ? { state: 'failed', error: result.error } : { state: 'done' })
            if (result.id) router.refresh()
        }
    }

    function onFiles(input: HTMLInputElement) {
        const files = Array.from(input.files ?? [])
        input.value = ''
        if (files.length > 0) void upload(files)
    }

    return (
        <div className="space-y-4">
            <Card className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-end">
                    <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="sala-video-target">Para quién es</Label>
                        <Select value={target} disabled={working} onValueChange={setTarget}>
                            <SelectTrigger id="sala-video-target"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ROOM}>Toda la sala</SelectItem>
                                {folder.clients.map(entry => <SelectItem key={entry.id} value={entry.id}>{entry.fullName}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <Button className="flex-1 sm:flex-none" disabled={working || missingConsent} onClick={() => pickInput.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" /> Subir vídeos
                        </Button>
                        <Button variant="outline" className="flex-1 sm:flex-none" disabled={working || missingConsent} onClick={() => cameraInput.current?.click()}>
                            <Camera className="mr-2 h-4 w-4" /> Grabar ahora
                        </Button>
                    </div>
                </div>

                <input ref={pickInput} type="file" accept="video/*" multiple className="hidden" aria-label="Elegir vídeos" onChange={event => onFiles(event.target)} />
                <input ref={cameraInput} type="file" accept="video/*" capture="environment" className="hidden" aria-label="Grabar vídeo" onChange={event => onFiles(event.target)} />

                {client && !client.consent && (
                    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 p-2">
                        <Label htmlFor="sala-video-consent" className="text-sm font-normal">
                            Consentimiento de imagen de {client.fullName} firmado en el centro
                        </Label>
                        <Switch
                            id="sala-video-consent"
                            checked={false}
                            disabled={isPending}
                            onCheckedChange={() => run(() => setImageConsentAction(client.id, true))}
                        />
                    </div>
                )}

                <p className="text-sm text-muted-foreground">
                    Se aligeran en este dispositivo a 720p y sin sonido, y tardan lo que dura el vídeo: deja la pantalla abierta.
                    Grabar desde aquí da menos calidad que la app Cámara.
                </p>

                {queue.length > 0 && (
                    <ul className="space-y-2 border-t pt-3">
                        {queue.map(entry => (
                            <li key={entry.id} className="text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate">{entry.name}</span>
                                    <span className="shrink-0 text-muted-foreground">
                                        {entry.state === 'waiting' && 'En cola'}
                                        {entry.state === 'working' && (entry.step ? `${entry.step.label} ${Math.round(entry.step.fraction * 100)} %` : 'Preparando')}
                                        {entry.state === 'done' && <Check className="h-4 w-4 text-primary" aria-label="Subido" />}
                                        {entry.state === 'failed' && 'No se ha subido'}
                                    </span>
                                </div>
                                {entry.state === 'working' && (
                                    <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                                        <div className="h-full bg-primary" style={{ width: `${Math.round((entry.step?.fraction ?? 0) * 100)}%` }} />
                                    </div>
                                )}
                                {entry.error && <p className="mt-0.5 text-destructive">{entry.error}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {folder.videos.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">Aún no hay vídeos en la sala.</Card>
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {folder.videos.map(video => (
                        <VideoCard key={video.id} video={video} entries={folder.entries} busy={isPending} onRun={run} />
                    ))}
                </div>
            )}
        </div>
    )
}

function VideoCard({ video, entries, busy, onRun }: {
    video: StudioVideo
    entries: FolderData['entries']
    busy: boolean
    onRun: (action: () => Promise<MediaResult>) => void
}) {
    const [playing, setPlaying] = useState(false)
    const [title, setTitle] = useState(video.title)
    const [assigning, setAssigning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const source = privateMediaUrl(video.storage_key)
    const poster = video.thumb_key ? privateMediaUrl(video.thumb_key) : undefined

    function rename() {
        const clean = title.trim()
        if (!clean) return setTitle(video.title)
        if (clean !== video.title) onRun(() => renameVideoAction(video.id, clean))
    }

    return (
        <Card className="min-w-0 space-y-2 overflow-hidden p-3">
            {playing ? (
                <video src={source} poster={poster} controls autoPlay playsInline className="aspect-video w-full rounded bg-black" />
            ) : (
                <button
                    type="button"
                    aria-label={`Ver ${video.title}`}
                    className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded bg-muted"
                    onClick={() => setPlaying(true)}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {poster && <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                        <Play className="h-5 w-5" />
                    </span>
                </button>
            )}

            <Input
                value={title}
                maxLength={120}
                aria-label="Nombre del vídeo"
                className="font-medium"
                onChange={event => setTitle(event.target.value)}
                onBlur={rename}
            />
            <p className="text-xs text-muted-foreground">
                {[video.client_name ?? 'Toda la sala', formatDuration(video.duration_seconds), formatSize(video.size_bytes), video.created_by_name].filter(Boolean).join(' · ')}
            </p>

            {video.exercises.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {video.exercises.map(exercise => (
                        <span key={exercise.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium">
                            <span className="min-w-0 truncate">{exercise.name}</span>
                            <button
                                type="button"
                                aria-label={`Quitar de ${exercise.name}`}
                                disabled={busy}
                                className="rounded-full p-0.5 hover:bg-primary/20"
                                onClick={() => onRun(() => removeExerciseMediaAction(exercise.id))}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {assigning ? (
                <StudioExerciseSearch
                    id={`sala-video-${video.id}`}
                    label="Asignar a un ejercicio"
                    entries={entries}
                    disabled={busy}
                    onPick={entry => onRun(() => assignVideoAction(video.id, entry.catalogExerciseId, video.client_id))}
                />
            ) : (
                <div className="flex items-center justify-between gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setAssigning(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Asignar a ejercicio
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label={`Borrar ${video.title}`} disabled={busy} onClick={() => setConfirming(true)}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                </div>
            )}

            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Borrar este vídeo?</AlertDialogTitle>
                        <AlertDialogDescription>Desaparecerá de todos sus ejercicios. No se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRun(() => removeVideoAction(video.id))}>Borrar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
