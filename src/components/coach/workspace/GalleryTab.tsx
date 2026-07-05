'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { createClient } from '@/lib/supabase/client'
import { CheckinWithReview } from '@/data/workspace'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    Camera,
    Loader2,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    X,
    GitCompareArrows,
    Check,
    CalendarDays,
    Scale,
} from 'lucide-react'

interface MediaRow {
    id: string
    checkin_id: string
    path: string
    taken_at: string | null
}

interface WeightRow {
    metric_date: string
    weight_kg: number | string
}

/** Peso medio de los 7 días previos (incluidos) a la fecha de la revisión */
interface CheckinWeight {
    avgKg: number
    daysWithData: number
    source: 'metrics' | 'checkin'
}

/** Foto enriquecida con la info de su revisión */
interface GalleryPhoto extends MediaRow {
    checkinLabel: string
    checkinType: 'checkin' | 'onboarding'
    checkinDateIso: string | null
}

interface GallerySection {
    checkin: CheckinWithReview
    label: string
    photos: GalleryPhoto[]
}

interface GalleryTabProps {
    coachId: string
    clientId: string
    checkins: CheckinWithReview[]
}

const MAX_COMPARE = 4

function checkinDate(c: CheckinWithReview): string | null {
    return c.submitted_at ?? c.period_end ?? c.period_start
}

function formatDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
    if (!iso) return 'Sin fecha'
    try {
        return new Date(iso).toLocaleDateString('es-ES', opts ?? {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    } catch {
        return 'Sin fecha'
    }
}

function checkinLabel(c: CheckinWithReview): string {
    const prefix = c.type === 'onboarding' ? 'Onboarding' : 'Revisión'
    return `${prefix} · ${formatDate(checkinDate(c))}`
}

function formatKg(kg: number): string {
    return `${kg.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
}

/** Calcula el peso medio por revisión: media de client_metrics en los 7 días
 *  anteriores (incluida la fecha de la revisión). Si no hay datos diarios,
 *  usa el peso medio/puntual registrado en el propio check-in. */
function computeCheckinWeights(
    checkins: CheckinWithReview[],
    weights: WeightRow[]
): Map<string, CheckinWeight> {
    const result = new Map<string, CheckinWeight>()
    const parsed = weights
        .map((w) => ({ date: w.metric_date, kg: Number(w.weight_kg) }))
        .filter((w) => Number.isFinite(w.kg) && w.kg > 0)

    for (const c of checkins) {
        const ref = checkinDate(c)
        if (!ref) continue
        const refDay = new Date(ref)
        if (isNaN(refDay.getTime())) continue
        const end = refDay.toISOString().slice(0, 10)
        const startDay = new Date(refDay)
        startDay.setDate(startDay.getDate() - 6)
        const start = startDay.toISOString().slice(0, 10)

        const window = parsed.filter((w) => w.date >= start && w.date <= end)
        if (window.length > 0) {
            const avg = window.reduce((sum, w) => sum + w.kg, 0) / window.length
            result.set(c.id, {
                avgKg: Math.round(avg * 10) / 10,
                daysWithData: window.length,
                source: 'metrics',
            })
            continue
        }

        const fallback = c.weight_avg_kg ?? c.weight_kg
        if (fallback !== null && Number.isFinite(Number(fallback)) && Number(fallback) > 0) {
            result.set(c.id, {
                avgKg: Math.round(Number(fallback) * 10) / 10,
                daysWithData: 0,
                source: 'checkin',
            })
        }
    }
    return result
}

export function GalleryTab({ coachId, clientId, checkins }: GalleryTabProps) {
    const supabase = createClient()
    const [media, setMedia] = useState<MediaRow[]>([])
    const [weights, setWeights] = useState<WeightRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Modo comparación
    const [compareMode, setCompareMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [compareOpen, setCompareOpen] = useState(false)

    // Lightbox (índice sobre la lista plana de fotos)
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    const fetchMedia = useCallback(async () => {
        const ids = checkins.map((c) => c.id)
        if (ids.length === 0) {
            setMedia([])
            return
        }
        const { data, error: fetchErr } = await supabase
            .from('checkin_media')
            .select('id, checkin_id, path, taken_at')
            .in('checkin_id', ids)
            .eq('media_type', 'progress_photo')
            .order('taken_at', { ascending: true })

        if (fetchErr) {
            console.error('[GalleryTab] Fetch error:', fetchErr)
            setError('Error al cargar la galería')
            return
        }
        setMedia((data as MediaRow[]) ?? [])
    }, [checkins, supabase])

    const fetchWeights = useCallback(async () => {
        const { data, error: fetchErr } = await supabase
            .from('client_metrics')
            .select('metric_date, weight_kg')
            .eq('client_id', clientId)
            .not('weight_kg', 'is', null)
            .order('metric_date', { ascending: true })

        if (fetchErr) {
            // No bloquea la galería: solo se pierde la métrica de peso
            console.error('[GalleryTab] Weights fetch error:', fetchErr)
            return
        }
        setWeights((data as WeightRow[]) ?? [])
    }, [clientId, supabase])

    useEffect(() => {
        setLoading(true)
        Promise.all([fetchMedia(), fetchWeights()]).finally(() => setLoading(false))
    }, [fetchMedia, fetchWeights])

    // Peso medio 7 días por revisión
    const checkinWeights = useMemo(
        () => computeCheckinWeights(checkins, weights),
        [checkins, weights]
    )

    const getPublicUrl = useCallback(
        (path: string): string => {
            const { data } = supabase.storage.from('checkin-media').getPublicUrl(path)
            return data.publicUrl
        },
        [supabase]
    )

    // Secciones: una por revisión (más reciente primero), solo las que tienen fotos
    const sections: GallerySection[] = useMemo(() => {
        const byCheckin = new Map<string, MediaRow[]>()
        for (const m of media) {
            const list = byCheckin.get(m.checkin_id) ?? []
            list.push(m)
            byCheckin.set(m.checkin_id, list)
        }
        return [...checkins]
            .sort((a, b) => (checkinDate(b) ?? '').localeCompare(checkinDate(a) ?? ''))
            .filter((c) => (byCheckin.get(c.id)?.length ?? 0) > 0)
            .map((c) => ({
                checkin: c,
                label: checkinLabel(c),
                photos: (byCheckin.get(c.id) ?? []).map((m) => ({
                    ...m,
                    checkinLabel: checkinLabel(c),
                    checkinType: c.type,
                    checkinDateIso: checkinDate(c),
                })),
            }))
    }, [media, checkins])

    // Lista plana (en el orden visual) para navegar en el lightbox
    const flatPhotos: GalleryPhoto[] = useMemo(
        () => sections.flatMap((s) => s.photos),
        [sections]
    )

    const selectedPhotos: GalleryPhoto[] = useMemo(
        () => flatPhotos.filter((p) => selectedIds.includes(p.id)),
        [flatPhotos, selectedIds]
    )

    // Referencia para el delta de peso: la revisión más antigua entre las seleccionadas
    const compareBaseline = useMemo(() => {
        const withWeight = selectedPhotos.filter((p) => checkinWeights.has(p.checkin_id))
        if (withWeight.length === 0) return null
        const oldest = [...withWeight].sort((a, b) =>
            (a.checkinDateIso ?? '').localeCompare(b.checkinDateIso ?? '')
        )[0]
        return {
            checkinId: oldest.checkin_id,
            weight: checkinWeights.get(oldest.checkin_id)!,
            dateLabel: formatDate(oldest.checkinDateIso, { day: 'numeric', month: 'short' }),
        }
    }, [selectedPhotos, checkinWeights])

    const toggleSelect = (photoId: string) => {
        setSelectedIds((prev) => {
            if (prev.includes(photoId)) return prev.filter((id) => id !== photoId)
            if (prev.length >= MAX_COMPARE) return prev // límite alcanzado
            return [...prev, photoId]
        })
    }

    const exitCompareMode = () => {
        setCompareMode(false)
        setSelectedIds([])
    }

    const handlePhotoClick = (photo: GalleryPhoto) => {
        if (compareMode) {
            toggleSelect(photo.id)
        } else {
            const idx = flatPhotos.findIndex((p) => p.id === photo.id)
            if (idx >= 0) setLightboxIndex(idx)
        }
    }

    const goPrev = useCallback(() => {
        setLightboxIndex((i) =>
            i === null ? i : (i - 1 + flatPhotos.length) % flatPhotos.length
        )
    }, [flatPhotos.length])

    const goNext = useCallback(() => {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % flatPhotos.length))
    }, [flatPhotos.length])

    useEffect(() => {
        if (lightboxIndex === null) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                goPrev()
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                goNext()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [lightboxIndex, goPrev, goNext])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 border rounded-lg bg-muted/20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
            </div>
        )
    }

    if (sections.length === 0) {
        return (
            <Card className="p-10 text-center">
                <Camera className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Sin fotos todavía</p>
                <p className="text-xs text-muted-foreground mt-1">
                    Cuando el cliente suba fotos en sus revisiones, aparecerán aquí agrupadas.
                </p>
            </Card>
        )
    }

    const activePhoto = lightboxIndex !== null ? flatPhotos[lightboxIndex] : null

    return (
        <div className="space-y-6">
            {/* Barra de acciones */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Galería de fotos</h3>
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                        {flatPhotos.length}
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    {compareMode ? (
                        <>
                            <span className="text-xs text-muted-foreground">
                                {selectedIds.length}/{MAX_COMPARE} seleccionadas
                            </span>
                            <Button variant="ghost" size="sm" onClick={exitCompareMode}>
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                disabled={selectedIds.length < 2}
                                onClick={() => setCompareOpen(true)}
                            >
                                <GitCompareArrows className="h-4 w-4 mr-1.5" />
                                Comparar ({selectedIds.length})
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => setCompareMode(true)}>
                            <GitCompareArrows className="h-4 w-4 mr-1.5" />
                            Comparar
                        </Button>
                    )}
                </div>
            </div>

            {compareMode && (
                <p className="text-xs text-muted-foreground -mt-3">
                    Toca las fotos que quieras comparar (mínimo 2, máximo {MAX_COMPARE}). Cada una
                    mantiene la revisión a la que pertenece.
                </p>
            )}

            {/* Secciones por revisión */}
            {sections.map((section) => (
                <div key={section.checkin.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-medium">{section.label}</h4>
                        {section.checkin.type === 'onboarding' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                                Inicial
                            </Badge>
                        )}
                        {(() => {
                            const w = checkinWeights.get(section.checkin.id)
                            if (!w) return null
                            return (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 h-4 font-medium"
                                    title={
                                        w.source === 'metrics'
                                            ? `Media de los 7 días previos a la revisión (${w.daysWithData} días con registro)`
                                            : 'Peso registrado en la revisión (sin datos diarios en esa semana)'
                                    }
                                >
                                    <Scale className="h-2.5 w-2.5 mr-1" />
                                    {formatKg(w.avgKg)}
                                    {w.source === 'metrics' ? ' · media 7d' : ''}
                                </Badge>
                            )
                        })()}
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4 ml-auto">
                            {section.photos.length} {section.photos.length === 1 ? 'foto' : 'fotos'}
                        </Badge>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                        {section.photos.map((photo) => {
                            const isSelected = selectedIds.includes(photo.id)
                            const selectionOrder = selectedIds.indexOf(photo.id) + 1
                            return (
                                <button
                                    key={photo.id}
                                    type="button"
                                    onClick={() => handlePhotoClick(photo)}
                                    className={`relative group aspect-square rounded-md overflow-hidden bg-muted border block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all ${
                                        compareMode && isSelected
                                            ? 'ring-2 ring-primary border-primary'
                                            : ''
                                    } ${
                                        compareMode && !isSelected && selectedIds.length >= MAX_COMPARE
                                            ? 'opacity-40'
                                            : ''
                                    }`}
                                    title={compareMode ? 'Seleccionar para comparar' : 'Ver foto'}
                                >
                                    <img
                                        src={getPublicUrl(photo.path)}
                                        alt={photo.checkinLabel}
                                        className={`w-full h-full object-cover transition-transform ${
                                            compareMode ? '' : 'group-hover:scale-105'
                                        }`}
                                        loading="lazy"
                                    />
                                    {compareMode && (
                                        <div
                                            className={`absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                                                isSelected
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-black/40 text-white/80 border border-white/40'
                                            }`}
                                        >
                                            {isSelected ? selectionOrder : <Check className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />}
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}

            {/* ============ LIGHTBOX (vista individual) ============ */}
            <DialogPrimitive.Root
                open={lightboxIndex !== null}
                onOpenChange={(open) => {
                    if (!open) setLightboxIndex(null)
                }}
            >
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                    <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col outline-none">
                        <DialogPrimitive.Title className="sr-only">Galería de fotos</DialogPrimitive.Title>
                        {activePhoto && (
                            <>
                                <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-sm font-medium tabular-nums shrink-0">
                                            {(lightboxIndex ?? 0) + 1} / {flatPhotos.length}
                                        </span>
                                        <Badge className="bg-white/15 text-white hover:bg-white/15 border-0 truncate">
                                            {activePhoto.checkinLabel}
                                        </Badge>
                                        {(() => {
                                            const w = checkinWeights.get(activePhoto.checkin_id)
                                            if (!w) return null
                                            return (
                                                <Badge className="bg-white/15 text-white hover:bg-white/15 border-0 shrink-0">
                                                    <Scale className="h-3 w-3 mr-1" />
                                                    {formatKg(w.avgKg)}
                                                    {w.source === 'metrics' ? ' · 7d' : ''}
                                                </Badge>
                                            )
                                        })()}
                                    </div>
                                    <DialogPrimitive.Close asChild>
                                        <button
                                            type="button"
                                            className="rounded-md p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                                            title="Cerrar (Esc)"
                                        >
                                            <X className="h-5 w-5" />
                                        </button>
                                    </DialogPrimitive.Close>
                                </div>
                                <div className="relative flex-1 flex items-center justify-center min-h-0 px-2 pb-4 sm:px-14">
                                    {flatPhotos.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={goPrev}
                                            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/25 text-white p-2 sm:p-2.5 transition-colors"
                                            title="Anterior (←)"
                                        >
                                            <ChevronLeft className="h-6 w-6" />
                                        </button>
                                    )}
                                    <img
                                        key={activePhoto.id}
                                        src={getPublicUrl(activePhoto.path)}
                                        alt={activePhoto.checkinLabel}
                                        className="max-h-full max-w-full object-contain rounded-md select-none"
                                        draggable={false}
                                    />
                                    {flatPhotos.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={goNext}
                                            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/25 text-white p-2 sm:p-2.5 transition-colors"
                                            title="Siguiente (→)"
                                        >
                                            <ChevronRight className="h-6 w-6" />
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            {/* ============ VISTA DE COMPARACIÓN ============ */}
            <DialogPrimitive.Root open={compareOpen} onOpenChange={setCompareOpen}>
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                    <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col outline-none">
                        <DialogPrimitive.Title className="sr-only">
                            Comparación de fotos
                        </DialogPrimitive.Title>

                        <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
                            <div className="flex items-center gap-2">
                                <GitCompareArrows className="h-4 w-4" />
                                <span className="text-sm font-medium">
                                    Comparando {selectedPhotos.length} fotos
                                </span>
                            </div>
                            <DialogPrimitive.Close asChild>
                                <button
                                    type="button"
                                    className="rounded-md p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                    title="Cerrar (Esc)"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </DialogPrimitive.Close>
                        </div>

                        <div
                            className={`flex-1 min-h-0 grid gap-2 px-3 pb-4 ${
                                selectedPhotos.length <= 2
                                    ? 'grid-cols-1 sm:grid-cols-2'
                                    : selectedPhotos.length === 3
                                        ? 'grid-cols-1 sm:grid-cols-3'
                                        : 'grid-cols-2 sm:grid-cols-4'
                            }`}
                        >
                            {selectedPhotos.map((photo) => (
                                <div
                                    key={photo.id}
                                    className="flex flex-col min-h-0 rounded-lg overflow-hidden bg-white/5 border border-white/10"
                                >
                                    {/* Etiqueta: a qué revisión pertenece + peso medio 7d */}
                                    <div className="px-3 py-2 bg-white/10 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="h-3.5 w-3.5 text-white/60 shrink-0" />
                                            <span className="text-xs font-medium text-white truncate">
                                                {photo.checkinLabel}
                                            </span>
                                        </div>
                                        {(() => {
                                            const w = checkinWeights.get(photo.checkin_id)
                                            if (!w) return null
                                            const isBaseline =
                                                compareBaseline?.checkinId === photo.checkin_id
                                            const delta =
                                                compareBaseline && !isBaseline
                                                    ? Math.round(
                                                          (w.avgKg - compareBaseline.weight.avgKg) * 10
                                                      ) / 10
                                                    : null
                                            return (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span
                                                        className="inline-flex items-center gap-1 text-xs font-semibold text-white"
                                                        title={
                                                            w.source === 'metrics'
                                                                ? `Media de los 7 días previos (${w.daysWithData} días con registro)`
                                                                : 'Peso registrado en la revisión'
                                                        }
                                                    >
                                                        <Scale className="h-3 w-3 text-white/60" />
                                                        {formatKg(w.avgKg)}
                                                        <span className="text-[10px] font-normal text-white/50">
                                                            {w.source === 'metrics' ? 'media 7d' : 'en revisión'}
                                                        </span>
                                                    </span>
                                                    {delta !== null && delta !== 0 && (
                                                        <span
                                                            className={`text-[11px] font-semibold ${
                                                                delta < 0 ? 'text-emerald-400' : 'text-amber-400'
                                                            }`}
                                                            title={`Diferencia respecto a la revisión del ${compareBaseline!.dateLabel}`}
                                                        >
                                                            {delta > 0 ? '+' : ''}
                                                            {formatKg(delta).replace(' kg', '')} kg vs{' '}
                                                            {compareBaseline!.dateLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                    <div className="flex-1 min-h-0 flex items-center justify-center p-2">
                                        <img
                                            src={getPublicUrl(photo.path)}
                                            alt={photo.checkinLabel}
                                            className="max-h-full max-w-full object-contain select-none"
                                            draggable={false}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        </div>
    )
}
