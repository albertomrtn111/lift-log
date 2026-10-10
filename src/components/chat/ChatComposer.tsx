'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { ArrowUp, Loader2, Mic, Paperclip, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatAudioDuration } from '@/lib/chat-media'

export interface ChatComposerHandle {
    focus: () => void
    resetHeight: () => void
}

interface ChatComposerProps {
    value: string
    onChange: (value: string) => void
    onSend: () => void
    onFileSelected: (file: File) => void
    onStartRecording: () => void
    onCancelRecording: () => void
    onSendRecording: () => void
    isRecording: boolean
    recordingSeconds: number
    uploading: string | null
    sending: boolean
}

const MAX_TEXTAREA_HEIGHT = 128

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
    value,
    onChange,
    onSend,
    onFileSelected,
    onStartRecording,
    onCancelRecording,
    onSendRecording,
    isRecording,
    recordingSeconds,
    uploading,
    sending,
}, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
        focus: () => textareaRef.current?.focus(),
        resetHeight: () => {
            if (textareaRef.current) textareaRef.current.style.height = 'auto'
        },
    }))

    const canSend = value.trim().length > 0 && !sending && !uploading

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // En móvil Intro añade línea (se envía con el botón); en escritorio envía
        const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
        if (event.key === 'Enter' && !event.shiftKey && !isTouch && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (canSend) onSend()
        }
    }

    const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(event.target.value)
        const el = event.target
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
    }

    return (
        <div className="border-t border-border/60 bg-background/90 px-3 pb-2.5 pt-2 backdrop-blur-xl">
            {uploading && (
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground animate-fade-in">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    <span className="truncate">Enviando {uploading}…</span>
                </div>
            )}

            {isRecording ? (
                <div className="flex items-center gap-2 animate-fade-in">
                    <button
                        type="button"
                        onClick={onCancelRecording}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
                        aria-label="Cancelar grabación"
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>
                    <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-destructive/25 bg-destructive/[0.06] px-4">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{formatAudioDuration(recordingSeconds)}</span>
                        <RecordingWave />
                    </div>
                    <button
                        type="button"
                        onClick={onSendRecording}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
                        aria-label="Enviar nota de voz"
                    >
                        <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                </div>
            ) : (
                <div className="flex items-end gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) onFileSelected(file)
                        }}
                        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,video/*,audio/*"
                    />
                    <div className="flex min-w-0 flex-1 items-end rounded-[22px] border border-border/80 bg-muted/40 transition-colors focus-within:border-primary/40 focus-within:bg-background">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!!uploading}
                            className="flex h-11 w-10 shrink-0 items-center justify-center pl-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            aria-label="Adjuntar archivo"
                        >
                            <Paperclip className="h-[18px] w-[18px]" />
                        </button>
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Mensaje"
                            rows={1}
                            enterKeyHint="enter"
                            aria-label="Escribe un mensaje"
                            className="min-h-[44px] flex-1 resize-none bg-transparent py-[11px] pr-4 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none"
                            style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
                        />
                    </div>
                    {value.trim() ? (
                        <button
                            type="button"
                            onClick={onSend}
                            disabled={!canSend}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-95 disabled:opacity-50"
                            aria-label="Enviar mensaje"
                        >
                            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.5} />}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onStartRecording}
                            disabled={!!uploading}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-95 disabled:opacity-50"
                            aria-label="Grabar nota de voz"
                        >
                            <Mic className="h-5 w-5" />
                        </button>
                    )}
                </div>
            )}
        </div>
    )
})

function RecordingWave() {
    return (
        <span className="flex h-5 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
            {Array.from({ length: 28 }, (_, index) => (
                <span
                    key={index}
                    className="w-[3px] shrink-0 rounded-full bg-destructive/50 animate-pulse-soft"
                    style={{
                        height: `${30 + ((index * 37) % 70)}%`,
                        animationDelay: `${(index % 7) * 120}ms`,
                    }}
                />
            ))}
        </span>
    )
}
