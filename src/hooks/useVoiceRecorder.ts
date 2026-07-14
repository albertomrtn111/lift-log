'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface VoiceRecording {
    blob: Blob
    mime: string
    duration: number
    fileName: string
}

/** Elige el mejor formato soportado por el navegador (Safari → mp4). */
function pickMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return ''
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export function useVoiceRecorder() {
    const [isRecording, setIsRecording] = useState(false)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const recorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const startedAtRef = useRef<number>(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const cancelledRef = useRef(false)
    const resolveRef = useRef<((rec: VoiceRecording | null) => void) | null>(null)

    const cleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
        recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        setIsRecording(false)
        setElapsedSeconds(0)
    }, [])

    useEffect(() => () => cleanup(), [cleanup])

    const start = useCallback(async (): Promise<boolean> => {
        setError(null)
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setError('Tu navegador no soporta la grabación de audio.')
            return false
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mimeType = pickMimeType()
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

            chunksRef.current = []
            cancelledRef.current = false

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data)
            }

            recorder.onstop = () => {
                const resolve = resolveRef.current
                resolveRef.current = null
                const duration = Math.round((Date.now() - startedAtRef.current) / 1000)
                const mime = recorder.mimeType || mimeType || 'audio/webm'

                if (cancelledRef.current || chunksRef.current.length === 0 || duration < 1) {
                    resolve?.(null)
                } else {
                    const blob = new Blob(chunksRef.current, { type: mime })
                    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
                    resolve?.({
                        blob,
                        mime,
                        duration,
                        fileName: `nota-de-voz-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`,
                    })
                }
                cleanup()
            }

            recorder.start(250)
            recorderRef.current = recorder
            startedAtRef.current = Date.now()
            setElapsedSeconds(0)
            setIsRecording(true)
            timerRef.current = setInterval(() => {
                setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000))
            }, 500)
            return true
        } catch (err) {
            console.error('[voice-recorder] getUserMedia:', err)
            setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
            cleanup()
            return false
        }
    }, [cleanup])

    /** Detiene y devuelve la grabación (o null si se canceló / quedó vacía). */
    const stop = useCallback((): Promise<VoiceRecording | null> => {
        const recorder = recorderRef.current
        if (!recorder || recorder.state === 'inactive') {
            cleanup()
            return Promise.resolve(null)
        }
        return new Promise((resolve) => {
            resolveRef.current = resolve
            recorder.stop()
        })
    }, [cleanup])

    const cancel = useCallback(() => {
        cancelledRef.current = true
        const recorder = recorderRef.current
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop()
        } else {
            cleanup()
        }
    }, [cleanup])

    return { isRecording, elapsedSeconds, error, start, stop, cancel }
}
