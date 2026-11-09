'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { pickVoiceMimeType, voiceNoteFileName, voiceRecordingProblem } from '@/lib/voice-note-rules'

export interface VoiceRecording {
    blob: Blob
    mime: string
    duration: number
    fileName: string
}

interface ActiveRecording {
    recorder: MediaRecorder
    stream: MediaStream
    startedAt: number
    resolve: ((recording: VoiceRecording | null) => void) | null
    cancelled: boolean
    failed: boolean
}

interface VoiceRecorderOptions {
    /** Se llama con un mensaje para el usuario cuando no se puede grabar o la grabación sale mal */
    onError?: (message: string) => void
}

const EMPTY_RECORDING = 'No se ha grabado nada. Prueba otra vez.'
const INTERRUPTED_RECORDING = 'Se ha cortado la grabación. Prueba otra vez.'

/**
 * Graba notas de voz con MediaRecorder.
 *
 * Solo puede haber una grabación a la vez. Mientras el navegador pide el micrófono
 * todavía no hay grabación en curso, y un segundo toque arrancaba otra grabadora
 * que escribía en la misma lista de trozos: salía un archivo con dos grabaciones
 * mezcladas que no se podía escuchar. Ahora cada grabación guarda sus trozos aparte
 * y otro `start()` se ignora hasta que termina el primero.
 */
export function useVoiceRecorder({ onError }: VoiceRecorderOptions = {}) {
    const [isRecording, setIsRecording] = useState(false)
    const [isStarting, setIsStarting] = useState(false)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const activeRef = useRef<ActiveRecording | null>(null)
    const startingRef = useRef(false)
    // Cambia al cancelar o desmontar: un micrófono que llega tarde se cierra sin grabar
    const sessionRef = useRef(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    const report = useCallback((message: string) => {
        setError(message)
        onErrorRef.current?.(message)
    }, [])

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const release = useCallback((active: ActiveRecording) => {
        active.stream.getTracks().forEach((track) => track.stop())
        if (activeRef.current === active) {
            activeRef.current = null
            stopTimer()
            setIsRecording(false)
            setElapsedSeconds(0)
        }
    }, [stopTimer])

    useEffect(() => () => {
        sessionRef.current++
        const active = activeRef.current
        activeRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
        if (active) {
            active.cancelled = true
            if (active.recorder.state !== 'inactive') active.recorder.stop()
            active.stream.getTracks().forEach((track) => track.stop())
        }
    }, [])

    /** true si ha empezado a grabar. Un toque mientras se pide el micrófono se ignora. */
    const start = useCallback(async (): Promise<boolean> => {
        if (startingRef.current || activeRef.current) return false
        setError(null)
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            report('Tu navegador no soporta la grabación de audio.')
            return false
        }

        startingRef.current = true
        setIsStarting(true)
        const session = ++sessionRef.current
        let stream: MediaStream | null = null
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            if (session !== sessionRef.current) {
                // Se canceló o se cerró el chat mientras se pedía el micrófono
                stream.getTracks().forEach((track) => track.stop())
                return false
            }

            const mimeType = pickVoiceMimeType((type) => MediaRecorder.isTypeSupported(type))
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            const chunks: Blob[] = []
            const active: ActiveRecording = {
                recorder, stream, startedAt: Date.now(), resolve: null, cancelled: false, failed: false,
            }

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data)
            }
            recorder.onerror = (event) => {
                console.error('[voice-recorder] error del grabador:', (event as Event & { error?: unknown }).error ?? event)
                active.failed = true
            }

            recorder.onstop = async () => {
                const resolve = active.resolve
                active.resolve = null
                const duration = Math.round((Date.now() - active.startedAt) / 1000)
                const mime = recorder.mimeType || mimeType || 'audio/webm'
                release(active)

                if (active.cancelled || (duration < 1 && !active.failed)) return resolve?.(null)
                if (active.failed) {
                    report(INTERRUPTED_RECORDING)
                    return resolve?.(null)
                }
                if (chunks.length === 0) {
                    report(EMPTY_RECORDING)
                    return resolve?.(null)
                }
                const blob = new Blob(chunks, { type: mime })
                const problem = voiceRecordingProblem(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))
                if (problem) {
                    console.error('[voice-recorder] grabación sin cabecera reconocible', mime, blob.size)
                    report(problem)
                    return resolve?.(null)
                }
                resolve?.({ blob, mime, duration, fileName: voiceNoteFileName(mime) })
            }

            recorder.start(250)
            activeRef.current = active
            setElapsedSeconds(0)
            setIsRecording(true)
            stopTimer()
            timerRef.current = setInterval(() => {
                setElapsedSeconds(Math.round((Date.now() - active.startedAt) / 1000))
            }, 500)
            return true
        } catch (err) {
            console.error('[voice-recorder] getUserMedia:', err)
            stream?.getTracks().forEach((track) => track.stop())
            report('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
            return false
        } finally {
            startingRef.current = false
            setIsStarting(false)
        }
    }, [release, report, stopTimer])

    /** Detiene y devuelve la grabación, o null si se canceló o salió mal (ya avisado con onError). */
    const stop = useCallback((): Promise<VoiceRecording | null> => {
        const active = activeRef.current
        if (!active || active.recorder.state === 'inactive') {
            if (active) release(active)
            return Promise.resolve(null)
        }
        return new Promise((resolve) => {
            active.resolve = resolve
            active.recorder.stop()
        })
    }, [release])

    const cancel = useCallback(() => {
        sessionRef.current++
        const active = activeRef.current
        if (!active) return
        active.cancelled = true
        if (active.recorder.state !== 'inactive') active.recorder.stop()
        else release(active)
    }, [release])

    return { isRecording, isStarting, elapsedSeconds, error, start, stop, cancel }
}
