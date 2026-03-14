'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckinWithReview } from '@/data/workspace'
import {
    FileText,
    Scale,
    Footprints,
    Moon,
    Dumbbell,
    Apple,
    ChevronRight,
    X,
    Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createReviewAction } from './actions'
import { CheckinPhotosViewer } from './CheckinPhotosViewer'

interface CheckinsTabProps {
    coachId: string
    clientId: string
    checkins: CheckinWithReview[]
    onRefresh: () => void
}

export function CheckinsTab({ coachId, clientId, checkins, onRefresh }: CheckinsTabProps) {
    const [selectedCheckin, setSelectedCheckin] = useState<CheckinWithReview | null>(null)

    if (checkins.length === 0) {
        return (
            <Card className="p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg">Sin check-ins</h3>
                <p className="text-muted-foreground mt-2">
                    El cliente aún no ha enviado ningún check-in
                </p>
            </Card>
        )
    }

    return (
        <div className="flex gap-6">
            {/* Checkins List */}
            <Card className={cn('flex-1', selectedCheckin && 'lg:flex-[0.6]')}>
                <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Check-ins
                    </h3>
                    <span className="text-sm text-muted-foreground">{checkins.length} registros</span>
                </div>
                <div className="divide-y max-h-[600px] overflow-y-auto">
                    {checkins.map(checkin => (
                        <CheckinRow
                            key={checkin.id}
                            checkin={checkin}
                            isSelected={selectedCheckin?.id === checkin.id}
                            onClick={() => setSelectedCheckin(checkin)}
                            coachId={coachId}
                            clientId={clientId}
                            onRefresh={onRefresh}
                        />
                    ))}
                </div>
            </Card>

            {/* Detail Panel */}
            {selectedCheckin && (
                <CheckinDetailPanel
                    checkin={selectedCheckin}
                    onClose={() => setSelectedCheckin(null)}
                    coachId={coachId}
                    clientId={clientId}
                    onRefresh={onRefresh}
                />
            )}
        </div>
    )
}

function CheckinRow({
    checkin,
    isSelected,
    onClick,
    coachId,
    clientId,
    onRefresh
}: {
    checkin: CheckinWithReview
    isSelected: boolean
    onClick: () => void
    coachId: string
    clientId: string
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()

    const handleCreateReview = (e: React.MouseEvent) => {
        e.stopPropagation()
        startTransition(async () => {
            await createReviewAction(coachId, clientId, checkin.id)
            onRefresh()
        })
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    const reviewBadge = () => {
        if (!checkin.review) {
            return (
                <Badge variant="outline" className="bg-muted/50 text-xs">
                    Sin review
                </Badge>
            )
        }
        const colors = {
            draft: 'bg-warning/10 text-warning border-0',
            approved: 'bg-success/10 text-success border-0',
            rejected: 'bg-destructive/10 text-destructive border-0',
        }
        const labels = { draft: 'Borrador', approved: 'Aprobado', rejected: 'Rechazado' }
        return (
            <Badge variant="secondary" className={cn('text-xs', colors[checkin.review.status])}>
                {labels[checkin.review.status]}
            </Badge>
        )
    }

    return (
        <div
            className={cn(
                'p-4 cursor-pointer transition-colors hover:bg-muted/30',
                isSelected && 'bg-primary/5'
            )}
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{formatDate(checkin.submitted_at)}</span>
                <div className="flex items-center gap-2">
                    {reviewBadge()}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {(checkin.weight_avg_kg || checkin.weight_kg) && (
                    <span className="flex items-center gap-1">
                        <Scale className="h-3.5 w-3.5" />
                        {checkin.weight_avg_kg || checkin.weight_kg} kg
                    </span>
                )}
                {checkin.steps_avg && (
                    <span className="flex items-center gap-1">
                        <Footprints className="h-3.5 w-3.5" />
                        {Math.round(checkin.steps_avg).toLocaleString()}
                    </span>
                )}
                {checkin.training_adherence_pct !== null && (
                    <span className={cn(
                        'flex items-center gap-1',
                        checkin.training_adherence_pct < 60 && 'text-destructive'
                    )}>
                        <Dumbbell className="h-3.5 w-3.5" />
                        {checkin.training_adherence_pct}%
                    </span>
                )}
                {checkin.nutrition_adherence_pct !== null && (
                    <span className={cn(
                        'flex items-center gap-1',
                        checkin.nutrition_adherence_pct < 60 && 'text-destructive'
                    )}>
                        <Apple className="h-3.5 w-3.5" />
                        {checkin.nutrition_adherence_pct}%
                    </span>
                )}
            </div>

            {!checkin.review && (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={handleCreateReview}
                    disabled={isPending}
                >
                    Crear review
                </Button>
            )}
        </div>
    )
}

function CheckinDetailPanel({
    checkin,
    onClose,
    coachId,
    clientId,
    onRefresh
}: {
    checkin: CheckinWithReview
    onClose: () => void
    coachId: string
    clientId: string
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()

    const handleCreateReview = () => {
        startTransition(async () => {
            await createReviewAction(coachId, clientId, checkin.id)
            onRefresh()
        })
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
    }

    return (
        <Card className="hidden lg:block w-[400px] shrink-0">
            <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold">Detalle check-in</h3>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                {/* Header */}
                <div className="pb-4 border-b">
                    <p className="font-medium">{formatDate(checkin.submitted_at)}</p>
                    {checkin.period_start && checkin.period_end && (
                        <p className="text-sm text-muted-foreground">
                            Periodo: {checkin.period_start} - {checkin.period_end}
                        </p>
                    )}
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <MetricBox
                        icon={Scale}
                        label="Peso"
                        value={checkin.weight_avg_kg || checkin.weight_kg}
                        unit="kg"
                    />
                    <MetricBox
                        icon={Footprints}
                        label="Pasos avg"
                        value={checkin.steps_avg ? Math.round(checkin.steps_avg) : null}
                    />
                    <MetricBox
                        icon={Moon}
                        label="Sueño avg"
                        value={checkin.sleep_avg_h}
                        unit="h"
                    />
                    <MetricBox
                        icon={Dumbbell}
                        label="Adherencia entreno"
                        value={checkin.training_adherence_pct}
                        unit="%"
                        warning={checkin.training_adherence_pct !== null && checkin.training_adherence_pct < 60}
                    />
                    <MetricBox
                        icon={Apple}
                        label="Adherencia nutrición"
                        value={checkin.nutrition_adherence_pct}
                        unit="%"
                        warning={checkin.nutrition_adherence_pct !== null && checkin.nutrition_adherence_pct < 60}
                    />
                </div>

                {/* Notes */}
                {checkin.notes && (
                    <div>
                        <p className="text-sm font-medium mb-1">Notas del cliente</p>
                        <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                            {checkin.notes}
                        </p>
                    </div>
                )}

                {/* Photos Viewer */}
                <div className="pt-2">
                    <CheckinPhotosViewer
                        checkinId={checkin.id}
                        coachId={coachId}
                    />
                </div>

                {/* Extra metrics from raw_payload (production) */}
                {(() => {
                    if (!checkin.raw_payload || typeof checkin.raw_payload !== 'object') return null
                    const coveredFields = new Set([
                        'weight_avg_kg', 'weight_kg', 'steps_avg', 'sleep_avg_h',
                        'training_adherence_pct', 'nutrition_adherence_pct'
                    ])
                    const extras = Object.entries(checkin.raw_payload as Record<string, unknown>)
                        .filter(([key, val]) => !coveredFields.has(key) && typeof val === 'number')
                    if (extras.length === 0) return null
                    return (
                        <div>
                            <p className="text-sm font-medium mb-2">Otros datos</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {extras.map(([key, val]) => (
                                    <MetricBox
                                        key={key}
                                        icon={Activity}
                                        label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        value={val as number}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                })()}

                {/* Raw Payload — solo visible en desarrollo */}
                {process.env.NODE_ENV !== 'production' && checkin.raw_payload && (
                    <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Ver datos raw (dev)
                        </summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                            {JSON.stringify(checkin.raw_payload, null, 2)}
                        </pre>
                    </details>
                )}

                {/* Review Section */}
                <div className="pt-4 border-t">
                    {checkin.review ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Review</span>
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        checkin.review.status === 'draft' && 'bg-warning/10 text-warning',
                                        checkin.review.status === 'approved' && 'bg-success/10 text-success',
                                    )}
                                >
                                    {checkin.review.status === 'draft' ? 'Borrador' : 'Aprobado'}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {checkin.review.summary || 'Sin resumen'}
                            </p>
                            <Button variant="outline" size="sm" className="w-full">
                                <FileText className="h-4 w-4 mr-2" />
                                Ver review completo
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-3">
                                Este check-in no tiene review
                            </p>
                            <Button onClick={handleCreateReview} disabled={isPending} size="sm">
                                Crear review
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

function MetricBox({
    icon: Icon,
    label,
    value,
    unit = '',
    warning = false
}: {
    icon: React.ElementType
    label: string
    value: number | null | undefined
    unit?: string
    warning?: boolean
}) {
    return (
        <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Icon className="h-3 w-3" />
                {label}
            </div>
            <p className={cn('font-medium', warning && 'text-destructive')}>
                {value !== null && value !== undefined ? `${value.toLocaleString()}${unit}` : '—'}
            </p>
        </div>
    )
}
