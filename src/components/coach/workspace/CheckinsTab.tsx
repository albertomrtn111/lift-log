'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckinWithReview } from '@/data/workspace'
import { MetricDefinition } from '@/types/metrics'
import { FormTemplate } from '@/types/forms'
import {
    FileText,
    Activity,
    ChevronRight,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createReviewAction } from './actions'
import { CheckinPhotosViewer } from './CheckinPhotosViewer'

interface CheckinsTabProps {
    coachId: string
    clientId: string
    checkins: CheckinWithReview[]
    onRefresh: () => void
    metricDefinitions: MetricDefinition[]
    formTemplates: FormTemplate[]
}

export function CheckinsTab({ coachId, clientId, checkins, onRefresh, metricDefinitions, formTemplates }: CheckinsTabProps) {
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

    if (selectedCheckin) {
        // Calcular checkin anterior al seleccionado (para deltas de métricas)
        const sortedCompleted = [...checkins]
            .filter(c => c.status !== 'pending' && c.submitted_at)
            .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime())
        const selectedIndex = sortedCompleted.findIndex(c => c.id === selectedCheckin.id)
        const previousCheckin = selectedIndex >= 0 ? (sortedCompleted[selectedIndex + 1] ?? null) : null

        return (
            <CheckinDetailPanel
                checkin={selectedCheckin}
                previousCheckin={previousCheckin}
                onClose={() => setSelectedCheckin(null)}
                coachId={coachId}
                clientId={clientId}
                onRefresh={onRefresh}
                metricDefinitions={metricDefinitions}
                formTemplates={formTemplates}
            />
        )
    }

    return (
        <Card className="flex-1">
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
                        isSelected={false}
                        onClick={() => setSelectedCheckin(checkin)}
                        coachId={coachId}
                        clientId={clientId}
                        onRefresh={onRefresh}
                    />
                ))}
            </div>
        </Card>
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
                <Badge variant="outline" className="bg-muted/50 text-xs text-muted-foreground">
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

    const rawPayload = (checkin.raw_payload as Record<string, unknown>) || {}
    const metricCount = Object.keys(rawPayload).filter(k => k.startsWith('metric_') && rawPayload[k] !== null && rawPayload[k] !== '').length
    const questionCount = Object.keys(rawPayload).filter(k => k.startsWith('campo_') && rawPayload[k] !== null && rawPayload[k] !== '').length

    return (
        <div
            className={cn(
                'p-4 cursor-pointer transition-colors hover:bg-muted/30 flex items-center justify-between',
                isSelected && 'bg-primary/5'
            )}
            onClick={onClick}
        >
            <div>
                 <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-base">{checkin.submitted_at ? formatDate(checkin.submitted_at) : 'Pendiente'}</span>
                    {reviewBadge()}
                 </div>
                 <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        {metricCount} métricas
                    </span>
                    <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {questionCount} respuestas
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {!checkin.review && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCreateReview}
                        disabled={isPending}
                    >
                        Crear review
                    </Button>
                )}
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
        </div>
    )
}

function CheckinDetailPanel({
    checkin,
    previousCheckin,
    onClose,
    coachId,
    clientId,
    onRefresh,
    metricDefinitions,
    formTemplates
}: {
    checkin: CheckinWithReview
    previousCheckin?: CheckinWithReview | null
    onClose: () => void
    coachId: string
    clientId: string
    onRefresh: () => void
    metricDefinitions: MetricDefinition[]
    formTemplates: FormTemplate[]
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
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        })
    }

    const rawPayload = (checkin.raw_payload as Record<string, unknown>) || {}
    const metricKeys = Object.keys(rawPayload).filter(k => k.startsWith('metric_') && rawPayload[k] !== null && rawPayload[k] !== '')
    const questionKeys = Object.keys(rawPayload).filter(k => k.startsWith('campo_') && rawPayload[k] !== null && rawPayload[k] !== '')

    const getMetricLabel = (key: string) => {
        const id = key.replace('metric_', '')
        const def = metricDefinitions.find(m => m.id === id)
        return def ? def.name : 'Métrica'
    }

    const getMetricUnit = (key: string) => {
        const id = key.replace('metric_', '')
        const def = metricDefinitions.find(m => m.id === id)
        return def?.unit ? ` ${def.unit}` : ''
    }

    const previousPayload = (previousCheckin?.raw_payload as Record<string, unknown>) || {}

    const getMetricDelta = (key: string): number | null => {
        const curr = parseFloat(String(rawPayload[key] ?? ''))
        const prev = parseFloat(String(previousPayload[key] ?? ''))
        if (isNaN(curr) || isNaN(prev)) return null
        return Math.round((curr - prev) * 100) / 100
    }

    const checkinTemplate = formTemplates.find(t => t.id === checkin.form_template_id)
    const allFields = checkinTemplate ? checkinTemplate.schema : formTemplates.flatMap(t => t.schema)
    const getFieldLabel = (key: string) => {
        const field = allFields.find(f => f.id === key)
        if (field) return field.label
        const num = key.replace('campo_', '')
        return `Pregunta ${num}`
    }

    return (
        <Card className="w-full">
            <div className="p-4 sm:p-6 border-b flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row bg-muted/20">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-xl">Detalle del check-in</h3>
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">
                        {checkin.submitted_at ? formatDate(checkin.submitted_at) : 'Pendiente'}
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <Badge variant="secondary" className={cn("lg:text-sm", checkin.review?.status === 'approved' && 'bg-success/10 text-success border-success/20')}>
                        {checkin.review?.status === 'approved' ? 'Aprobado' : checkin.review?.status === 'draft' ? 'Borrador' : 'Sin review'}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full bg-background border">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="p-4 sm:p-8 space-y-12">
                {/* Datos de Progreso */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5 text-muted-foreground" />
                        Datos de progreso
                    </h4>
                    {metricKeys.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {metricKeys
                                .filter(key => key.startsWith('metric_'))
                                .map(key => (
                                <MetricBox
                                    key={key}
                                    label={getMetricLabel(key)}
                                    value={rawPayload[key] as number | string}
                                    unit={getMetricUnit(key)}
                                    delta={getMetricDelta(key)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground bg-muted/30 p-6 rounded-xl text-center border border-dashed">
                            Sin métricas registradas en este check-in
                        </p>
                    )}
                </div>

                {/* Preguntas */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Preguntas del entrenador
                    </h4>
                    {questionKeys.length > 0 ? (
                        <div className="space-y-4">
                            {questionKeys
                                .filter(key => key.startsWith('campo_'))
                                .map(key => (
                                <div key={key} className="bg-muted/10 p-5 rounded-xl border">
                                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                                        {getFieldLabel(key)}
                                    </p>
                                    <p className="text-base whitespace-pre-wrap">
                                        {String(rawPayload[key])}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground bg-muted/30 p-6 rounded-xl text-center border border-dashed">
                            Sin respuestas registradas
                        </p>
                    )}
                </div>

                {/* Fotos */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Fotos de progreso
                    </h4>
                    <CheckinPhotosViewer
                        checkinId={checkin.id}
                        coachId={coachId}
                    />
                </div>

                {/* Review */}
                <div className="space-y-4 pt-8 border-t">
                    <h4 className="font-semibold text-lg">Revisión</h4>
                    {checkin.review ? (
                        <div className="space-y-3 bg-muted/20 p-6 rounded-xl border">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm text-muted-foreground">Resumen del feedback</span>
                            </div>
                            <p className="text-base whitespace-pre-wrap">
                                {checkin.review.summary || 'Sin resumen escrito todavía.'}
                            </p>
                            <div className="pt-4">
                                <Button variant="outline" size="sm">
                                    <FileText className="h-4 w-4 mr-2" />
                                    Abrir editor completo de revisión
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center bg-muted/10 p-8 rounded-xl border border-dashed">
                            <p className="text-sm text-muted-foreground mb-4">
                                Este check-in aún no ha sido revisado
                            </p>
                            <Button onClick={handleCreateReview} disabled={isPending}>
                                Crear revisión para el cliente
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

function MetricBox({
    label,
    value,
    unit = '',
    delta,
}: {
    label: string
    value: number | string | null | undefined
    unit?: string
    delta?: number | null
}) {
    return (
        <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                {label}
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="font-semibold text-lg">
                    {value !== null && value !== undefined ? `${value.toLocaleString()}${unit}` : '—'}
                </p>
                {delta !== null && delta !== undefined && delta !== 0 && (
                    <span className={cn(
                        "text-xs font-semibold",
                        delta > 0 ? "text-green-500" : "text-red-500"
                    )}>
                        {delta > 0 ? `+${delta}` : `${delta}`}
                    </span>
                )}
                {delta === 0 && (
                    <span className="text-xs text-muted-foreground">= sin cambio</span>
                )}
            </div>
        </div>
    )
}

