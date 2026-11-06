'use client'

import { uploadMedia } from '@/lib/media-upload'
import { saveVideoAction } from '@/lib/studio/media-actions'
import {
    MAX_VIDEO_BYTES,
    MAX_VIDEO_MB,
    TARGET_BITS_PER_SECOND,
    durationProblem,
    enoughFrames,
    needsCompression,
    recorderType,
    targetSize,
} from '@/lib/studio/video-rules'

const STALL_MS = 15_000
const FRAMES_PER_SECOND = 30

function openVideo(file: Blob): Promise<HTMLVideoElement> {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    // Fuera de la página algunos móviles no decodifican: va dentro, sin que se vea.
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    video.src = URL.createObjectURL(file)
    document.body.appendChild(video)

    return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(video)
        video.onerror = () => {
            closeVideo(video)
            reject(new Error('Este navegador no puede leer este vídeo. Prueba desde el móvil con el que lo grabaste.'))
        }
    })
}

function closeVideo(video: HTMLVideoElement) {
    URL.revokeObjectURL(video.src)
    video.removeAttribute('src')
    video.remove()
}

function frameToBlob(video: HTMLVideoElement): Promise<Blob | null> {
    const canvas = document.createElement('canvas')
    const size = targetSize(video.videoWidth, video.videoHeight)
    canvas.width = Math.round(size.width / 2)
    canvas.height = Math.round(size.height / 2)
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
}

/** Miniatura de un vídeo que no se aligera. Si no sale en unos segundos, va sin ella. */
function grabThumbnail(video: HTMLVideoElement): Promise<Blob | null> {
    return new Promise(resolve => {
        const timer = window.setTimeout(() => resolve(null), 5000)
        video.onseeked = () => {
            window.clearTimeout(timer)
            resolve(frameToBlob(video))
        }
        video.currentTime = Math.min(1, video.duration / 2)
    })
}

/**
 * Vuelve a grabar el vídeo a 720p mientras se reproduce sin sonido, así que tarda lo que dura.
 * Pasa por un lienzo porque es lo único que funciona igual en Chrome, Safari y Firefox.
 */
function recompress(video: HTMLVideoElement, onProgress: (fraction: number) => void): Promise<{ blob: Blob; thumb: Blob | null }> {
    const type = recorderType(candidate => MediaRecorder.isTypeSupported(candidate))
    const canvas = document.createElement('canvas')
    const size = targetSize(video.videoWidth, video.videoHeight)
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!type || !context || !canvas.captureStream) return Promise.reject(new Error('unsupported'))

    return new Promise((resolve, reject) => {
        const chunks: Blob[] = []
        const recorder = new MediaRecorder(canvas.captureStream(FRAMES_PER_SECOND), { mimeType: type, videoBitsPerSecond: TARGET_BITS_PER_SECOND })
        const thumbAt = Math.min(1, video.duration / 2)
        let thumb: Promise<Blob | null> | null = null
        let lastTime = -1
        let lastMove = Date.now()
        let frames = 0
        let finished = false

        const stop = (error?: Error) => {
            if (finished) return
            finished = true
            window.clearInterval(timer)
            document.removeEventListener('visibilitychange', onHidden)
            video.pause()
            if (error) recorder.onstop = null
            if (recorder.state !== 'inactive') recorder.stop()
            if (error) reject(error)
        }
        const interrupted = new Error('Se ha interrumpido. Deja esta pantalla abierta mientras se aligera el vídeo.')
        const onHidden = () => { if (document.hidden) stop(interrupted) }

        // Con temporizador: lo que sigue al refresco de pantalla se para sin avisar y saldría un vídeo roto.
        const draw = () => {
            if (video.currentTime !== lastTime) {
                lastTime = video.currentTime
                lastMove = Date.now()
                frames += 1
                context.drawImage(video, 0, 0, canvas.width, canvas.height)
                onProgress(Math.min(1, video.currentTime / video.duration))
                if (!thumb && video.currentTime >= thumbAt) thumb = frameToBlob(video)
            } else if (Date.now() - lastMove > STALL_MS) {
                stop(interrupted)
            }
        }
        let timer = 0

        recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data) }
        recorder.onstop = async () => {
            if (!enoughFrames(frames, video.duration)) return reject(interrupted)
            resolve({ blob: new Blob(chunks, { type: type.split(';')[0] }), thumb: await thumb })
        }
        recorder.onerror = () => stop(new Error('unsupported'))
        video.onended = () => stop()
        document.addEventListener('visibilitychange', onHidden)

        video.currentTime = 0
        recorder.start(1000)
        video.play()
            .then(() => {
                if (!finished) timer = window.setInterval(draw, 1000 / FRAMES_PER_SECOND)
            })
            .catch(() => stop(new Error('unsupported')))
    })
}

/** Deja el vídeo listo para subir: aligerado si hace falta y con su miniatura. */
export async function prepareVideo(file: File, onProgress: (fraction: number) => void) {
    const video = await openVideo(file)
    try {
        const seconds = video.duration
        const problem = durationProblem(seconds)
        if (problem) throw new Error(problem)

        const light = !needsCompression({ size: file.size, seconds, width: video.videoWidth, height: video.videoHeight })
        const original = async () => {
            if (file.size > MAX_VIDEO_BYTES) {
                throw new Error(`Este navegador no puede aligerarlo y supera los ${MAX_VIDEO_MB} MB. Prueba desde otro.`)
            }
            return { blob: file as Blob, thumb: await grabThumbnail(video) }
        }

        let prepared: { blob: Blob; thumb: Blob | null }
        if (light) {
            prepared = await original()
        } else {
            try {
                prepared = await recompress(video, onProgress)
            } catch (error) {
                if ((error as Error).message !== 'unsupported') throw error
                prepared = await original()
            }
        }
        return { ...prepared, seconds: Math.round(seconds) }
    } finally {
        closeVideo(video)
    }
}

export type VideoStep = { label: string; fraction: number }

/** Aligera, sube y da de alta un vídeo en la carpeta. */
export async function sendVideo({ file, coachId, clientId, title, onStep }: {
    file: File
    coachId: string
    clientId: string | null
    title: string
    onStep: (step: VideoStep) => void
}): Promise<{ id?: string; error?: string }> {
    const folder = { coachId, ...(clientId ? { clientId } : {}) }
    let prepared: Awaited<ReturnType<typeof prepareVideo>>
    try {
        prepared = await prepareVideo(file, fraction => onStep({ label: 'Aligerando', fraction }))
    } catch (error) {
        return { error: (error as Error).message }
    }

    let thumbKey: string | null = null
    if (prepared.thumb) {
        const uploaded = await uploadMedia<{ key: string }>({ kind: 'studio', ...folder }, prepared.thumb, 'miniatura.jpg')
        thumbKey = uploaded.data?.key ?? null
    }

    const uploaded = await uploadMedia<{ key: string; mime: string; size: number }>(
        { kind: 'studio-video', ...folder },
        prepared.blob,
        file.name,
        fraction => onStep({ label: 'Subiendo', fraction })
    )
    if (!uploaded.data) return { error: uploaded.error }

    const saved = await saveVideoAction({
        coachId,
        clientId,
        storageKey: uploaded.data.key,
        thumbKey,
        title,
        durationSeconds: prepared.seconds,
        sizeBytes: uploaded.data.size,
        mime: uploaded.data.mime,
    })
    return saved.success ? { id: saved.id } : { error: saved.error }
}
