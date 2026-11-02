'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { AVATAR_MAX_SIDE, fitWithin } from '@/lib/chat-image-rules'
import {
    AVATAR_CROP_MAX_ZOOM,
    AVATAR_CROP_WORKING_SIDE,
    cropRect,
    displaySize,
    initialCrop,
    outputSide,
    panCrop,
    zoomCrop,
    type CropState,
} from '@/lib/avatar-crop-rules'

/** Margen entre el círculo y el borde de la zona de la foto */
const CIRCLE_MARGIN = 20
const KEY_PAN_STEP = 0.04
const KEY_ZOOM_STEP = 1.1
/** El zoom del pellizco llega a 3,9999…: los botones lo dan por máximo */
const ZOOM_EPSILON = 0.001

type Point = { x: number; y: number }

interface AvatarCropDialogProps {
    /** Foto elegida; null cierra el diálogo */
    file: File | null
    onCancel: () => void
    /** Recibe el cuadrado recortado (PNG). Si devuelve false el diálogo sigue abierto para reintentar. */
    onSave: (file: File) => Promise<boolean>
}

/**
 * Encuadre de la foto de perfil, como en WhatsApp: la foto se mueve debajo de
 * un círculo fijo, se amplía pellizcando, con la rueda o con el deslizador, y
 * el círculo puede llegar a cualquier borde de la foto (la foto se descentra).
 * La geometría está en avatar-crop-rules.js.
 */
export function AvatarCropDialog({ file, onCancel, onSave }: AvatarCropDialogProps) {
    /** Copia de trabajo fuera del DOM: de aquí sale el recorte */
    const sourceRef = useRef<HTMLCanvasElement | null>(null)
    // El contenido del diálogo se monta en un portal después del primer render:
    // refs de callback para enterarse de cuándo existen
    const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null)
    const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null)
    const pointers = useRef(new Map<number, Point>())
    const gestureStartZoom = useRef(1)
    const [image, setImage] = useState<{ width: number; height: number } | null>(null)
    const [loadError, setLoadError] = useState(false)
    const [crop, setCrop] = useState<CropState>(initialCrop)
    const [stage, setStage] = useState({ width: 0, height: 0 })
    const [saving, setSaving] = useState(false)

    const diameter = Math.max(0, Math.min(stage.width, stage.height) - CIRCLE_MARGIN * 2)

    // Copia de trabajo girada según el EXIF y reducida a 2048 px: las fotos de
    // 24-48 MP del iPhone no caben en un canvas de Safari a tamaño completo.
    useEffect(() => {
        if (!file) return
        let cancelled = false
        pointers.current.clear()
        setImage(null)
        setLoadError(false)
        setCrop(initialCrop())
        setSaving(false)

        decodeUpright(file)
            .then(source => {
                if (cancelled) {
                    source.release()
                    return
                }
                const { width, height } = fitWithin(source.width, source.height, AVATAR_CROP_WORKING_SIDE)
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const context = canvas.getContext('2d')
                if (!context) {
                    source.release()
                    throw new Error('Sin contexto 2D')
                }
                context.imageSmoothingQuality = 'high'
                context.drawImage(source.image, 0, 0, width, height)
                source.release()
                sourceRef.current = canvas
                setImage({ width, height })
            })
            .catch(error => {
                console.warn('[AvatarCropDialog] No se pudo abrir la foto:', error)
                if (!cancelled) setLoadError(true)
            })

        return () => {
            cancelled = true
            sourceRef.current = null
        }
    }, [file])

    useEffect(() => {
        const source = sourceRef.current
        if (!image || !canvasElement || !source) return
        canvasElement.width = image.width
        canvasElement.height = image.height
        canvasElement.getContext('2d')?.drawImage(source, 0, 0)
    }, [image, canvasElement])

    useEffect(() => {
        if (!stageElement) return
        // Medida inicial sin esperar al observer (que no avisa con la pestaña en segundo plano)
        const { width, height } = stageElement.getBoundingClientRect()
        setStage({ width, height })
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            setStage({ width, height })
        })
        observer.observe(stageElement)
        return () => observer.disconnect()
    }, [stageElement])

    /** Punto de pantalla → diámetros desde el centro del círculo */
    const toCircle = useCallback((clientX: number, clientY: number): Point => {
        const rect = stageElement?.getBoundingClientRect()
        if (!rect || diameter === 0) return { x: 0, y: 0 }
        return {
            x: (clientX - rect.left - rect.width / 2) / diameter,
            y: (clientY - rect.top - rect.height / 2) / diameter,
        }
    }, [stageElement, diameter])

    // Rueda y pellizco del trackpad (llega como rueda con ctrlKey; en Safari de
    // escritorio, como gesture*). Hacen falta listeners no pasivos para que la
    // página no haga zoom ni scroll.
    useEffect(() => {
        const element = stageElement
        if (!element || !image) return
        const { width, height } = image

        const onWheel = (event: WheelEvent) => {
            event.preventDefault()
            const focus = toCircle(event.clientX, event.clientY)
            const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002))
            setCrop(current => zoomCrop(current, current.zoom * factor, focus, width, height))
        }
        const onGestureStart = (event: Event) => {
            event.preventDefault()
            setCrop(current => {
                gestureStartZoom.current = current.zoom
                return current
            })
        }
        const onGestureChange = (event: Event) => {
            event.preventDefault()
            // En iOS el pellizco ya llega por pointer events
            if (pointers.current.size > 1) return
            const gesture = event as Event & { scale: number; clientX: number; clientY: number }
            const focus = toCircle(gesture.clientX, gesture.clientY)
            setCrop(current => zoomCrop(current, gestureStartZoom.current * gesture.scale, focus, width, height))
        }

        element.addEventListener('wheel', onWheel, { passive: false })
        element.addEventListener('gesturestart', onGestureStart)
        element.addEventListener('gesturechange', onGestureChange)
        return () => {
            element.removeEventListener('wheel', onWheel)
            element.removeEventListener('gesturestart', onGestureStart)
            element.removeEventListener('gesturechange', onGestureChange)
        }
    }, [image, stageElement, toCircle])

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!image) return
        try {
            event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
            // Puntero que ya no está activo: se sigue sin captura
        }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const active = pointers.current
        if (!image || diameter === 0 || !active.has(event.pointerId)) return
        const before = Array.from(active.values())
        active.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const after = Array.from(active.values())
        const { width, height } = image

        if (after.length === 1) {
            const dx = (after[0].x - before[0].x) / diameter
            const dy = (after[0].y - before[0].y) / diameter
            setCrop(current => panCrop(current, dx, dy, width, height))
            return
        }

        // Pellizco: zoom alrededor del punto medio de los dos dedos y arrastre
        // de ese punto medio
        const [a0, b0] = before
        const [a1, b1] = after
        const distanceBefore = Math.hypot(a0.x - b0.x, a0.y - b0.y)
        const distanceAfter = Math.hypot(a1.x - b1.x, a1.y - b1.y)
        if (distanceBefore < 1) return
        const midBefore = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
        const midAfter = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
        const focus = toCircle(midBefore.x, midBefore.y)
        setCrop(current => {
            const zoomed = zoomCrop(current, current.zoom * (distanceAfter / distanceBefore), focus, width, height)
            return panCrop(zoomed, (midAfter.x - midBefore.x) / diameter, (midAfter.y - midBefore.y) / diameter, width, height)
        })
    }

    const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        pointers.current.delete(event.pointerId)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!image) return
        const { width, height } = image
        const step = event.shiftKey ? KEY_PAN_STEP * 4 : KEY_PAN_STEP
        const moves: Record<string, Point> = {
            ArrowLeft: { x: step, y: 0 },
            ArrowRight: { x: -step, y: 0 },
            ArrowUp: { x: 0, y: step },
            ArrowDown: { x: 0, y: -step },
        }
        const move = moves[event.key]
        if (move) {
            event.preventDefault()
            // Las flechas mueven el círculo sobre la foto (la foto va al revés)
            setCrop(current => panCrop(current, move.x, move.y, width, height))
        } else if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            setCrop(current => zoomCrop(current, current.zoom * KEY_ZOOM_STEP, { x: 0, y: 0 }, width, height))
        } else if (event.key === '-') {
            event.preventDefault()
            setCrop(current => zoomCrop(current, current.zoom / KEY_ZOOM_STEP, { x: 0, y: 0 }, width, height))
        }
    }

    const setZoom = (zoom: number) => {
        if (!image) return
        setCrop(current => zoomCrop(current, zoom, { x: 0, y: 0 }, image.width, image.height))
    }

    const handleSave = async () => {
        const canvas = sourceRef.current
        if (!file || !image || !canvas || saving) return
        setSaving(true)
        try {
            const cropped = await renderCrop(canvas, crop, file.name)
            const done = await onSave(cropped)
            if (!done) setSaving(false)
        } catch (error) {
            console.error('[AvatarCropDialog] No se pudo recortar la foto:', error)
            setSaving(false)
        }
    }

    const base = image ? displaySize(image.width, image.height, 1) : { width: 0, height: 0 }

    return (
        <DialogPrimitive.Root
            open={file !== null}
            onOpenChange={open => {
                if (!open && !saving) onCancel()
            }}
        >
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    onPointerDownOutside={event => event.preventDefault()}
                    className={cn(
                        'fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white outline-none',
                        'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(680px,92dvh)] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-2xl sm:shadow-2xl',
                    )}
                >
                    <div className="px-5 pb-3 pt-[calc(var(--safe-area-top,0px)+1rem)] text-center sm:pt-5">
                        <DialogPrimitive.Title className="text-base font-semibold">Encuadra tu foto</DialogPrimitive.Title>
                        <DialogPrimitive.Description className="mt-0.5 text-xs text-white/60">
                            Arrastra para moverla. Pellizca o usa el deslizador para ampliarla.
                        </DialogPrimitive.Description>
                    </div>

                    <div
                        ref={setStageElement}
                        tabIndex={image ? 0 : -1}
                        role="application"
                        aria-label="Zona de encuadre: flechas para mover, + y - para ampliar"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerEnd}
                        onPointerCancel={handlePointerEnd}
                        onKeyDown={handleKeyDown}
                        className={cn(
                            'relative min-h-0 flex-1 touch-none select-none overflow-hidden outline-none',
                            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40',
                            image && 'cursor-grab active:cursor-grabbing',
                        )}
                    >
                        <canvas
                            ref={setCanvasElement}
                            aria-hidden
                            className={cn('absolute left-1/2 top-1/2 max-w-none', !image && 'invisible')}
                            style={{
                                width: base.width * diameter,
                                height: base.height * diameter,
                                transform: `translate(-50%, -50%) translate(${crop.x * diameter}px, ${crop.y * diameter}px) scale(${crop.zoom})`,
                            }}
                        />
                        {image && diameter > 0 && (
                            <div
                                aria-hidden
                                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90"
                                style={{ width: diameter, height: diameter, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)' }}
                            />
                        )}
                        {!image && !loadError && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-white/70" />
                            </div>
                        )}
                        {loadError && (
                            <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-sm text-white/80">
                                No se pudo abrir esta foto. Prueba con otra en JPG o PNG.
                            </div>
                        )}
                    </div>

                    <div className="space-y-4 px-5 pb-[calc(var(--safe-area-bottom,0px)+1rem)] pt-4">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setZoom(crop.zoom / 1.25)}
                                disabled={!image || crop.zoom <= 1 + ZOOM_EPSILON}
                                aria-label="Reducir"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
                            >
                                <ZoomOut className="h-5 w-5" />
                            </button>
                            <Slider
                                value={[crop.zoom]}
                                min={1}
                                max={AVATAR_CROP_MAX_ZOOM}
                                step={0.01}
                                disabled={!image}
                                onValueChange={([value]) => setZoom(value)}
                                aria-label="Ampliar"
                                className="py-3 [&>span:first-child]:bg-white/20"
                            />
                            <button
                                type="button"
                                onClick={() => setZoom(crop.zoom * 1.25)}
                                disabled={!image || crop.zoom >= AVATAR_CROP_MAX_ZOOM - ZOOM_EPSILON}
                                aria-label="Ampliar"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
                            >
                                <ZoomIn className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={saving}
                                className="h-12 rounded-full border border-white/25 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={!image || saving}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}

type DecodedImage = {
    image: CanvasImageSource
    width: number
    height: number
    release: () => void
}

/**
 * Abre la foto ya girada según el EXIF. createImageBitmap primero; si el
 * navegador no lo sabe hacer con ese formato, un <img> (Safari abre HEIC así).
 */
async function decodeUpright(file: File): Promise<DecodedImage> {
    if (typeof createImageBitmap !== 'undefined') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
            return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
        } catch {
            // Se intenta con <img>
        }
    }
    const url = URL.createObjectURL(file)
    try {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        await img.decode()
        if (!img.naturalWidth || !img.naturalHeight) throw new Error('Imagen vacía')
        return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
    } catch (error) {
        URL.revokeObjectURL(url)
        throw error
    }
}

/** Cuadrado recortado en PNG (sin pérdida: el flujo de subida ya comprime después) */
async function renderCrop(source: HTMLCanvasElement, crop: CropState, originalName: string): Promise<File> {
    const { sx, sy, size } = cropRect(crop, source.width, source.height)
    const side = outputSide(size, AVATAR_MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Sin contexto 2D')
    // Fondo blanco para PNG con transparencias (el servidor guarda WebP opaco)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, side, side)
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, sx, sy, size, size, 0, 0, side, side)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('No se pudo generar la imagen')
    const base = originalName.replace(/\.[^./]+$/, '') || 'foto'
    return new File([blob], `${base}.png`, { type: 'image/png' })
}
