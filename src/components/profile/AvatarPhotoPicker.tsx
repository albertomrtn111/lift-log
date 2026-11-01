'use client'

import { useRef, useState } from 'react'
import { Camera, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initialsOf } from '@/components/chat/chat-utils'
import { AVATAR_ACCEPT, useAvatarUpload } from '@/hooks/useAvatarUpload'

interface PickerState {
    /** Abre el selector de fotos del móvil (cámara o galería) */
    choose: () => void
    uploading: boolean
    /** Foto actual: la que ya tenía o la recién subida */
    url: string | null
    /** Se ha subido una foto en esta pantalla */
    uploaded: boolean
}

/**
 * Círculo con la foto de perfil (o las iniciales) que se toca para elegir una
 * foto nueva. Los botones los pone quien lo usa con `children`.
 */
export function AvatarPhotoPicker({ name, initialUrl, onUploaded, children, className }: {
    name: string | null
    initialUrl: string | null
    onUploaded?: (url: string) => void
    children: (state: PickerState) => React.ReactNode
    className?: string
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const { upload, uploading } = useAvatarUpload()
    const [url, setUrl] = useState(initialUrl)
    const [uploaded, setUploaded] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const choose = () => {
        if (!uploading) inputRef.current?.click()
    }

    const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setError(null)
        const result = await upload(file)
        if (!result.ok) {
            setError(result.error)
            return
        }
        setUrl(result.url)
        setUploaded(true)
        onUploaded?.(result.url)
    }

    return (
        <>
            <div className={cn('flex flex-col items-center', className)}>
                <button
                    type="button"
                    onClick={choose}
                    disabled={uploading}
                    aria-label={url ? 'Cambiar foto de perfil' : 'Elegir foto de perfil'}
                    className="relative rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97]"
                >
                    <span className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-3xl font-bold text-primary ring-4 ring-background shadow-md">
                        {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt="" className="h-full w-full object-cover" />
                        ) : initialsOf(name ?? '', '')
                            || <Camera className="h-9 w-9" strokeWidth={1.75} />}
                    </span>
                    {uploading && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </span>
                    )}
                    <span className={cn(
                        'absolute bottom-0.5 right-0.5 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-background shadow-md',
                        uploaded ? 'bg-success text-white' : 'bg-primary text-primary-foreground',
                    )}>
                        {uploaded ? <Check className="h-4 w-4" strokeWidth={3} /> : <Camera className="h-4 w-4" />}
                    </span>
                </button>
                <input ref={inputRef} type="file" accept={AVATAR_ACCEPT} className="hidden" onChange={handleChange} />
                {error && <p role="alert" className="mt-3 text-center text-sm text-destructive">{error}</p>}
            </div>
            {children({ choose, uploading, url, uploaded })}
        </>
    )
}
