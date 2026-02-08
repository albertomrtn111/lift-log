'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientStatus, CheckinWithReview, MacroPlan, TrainingProgram, Review } from '@/data/workspace'
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Clock,
    Dumbbell,
    Apple,
    FileText,
    Edit,
    Check,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    ArrowRight,
    Scale,
    Target
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createReviewAction, approveReviewAction, revertReviewToDraftAction } from './actions'

interface ResumenTabProps {
    coachId: string
    clientId: string
    clientStatus: ClientStatus | null
    latestCheckin: CheckinWithReview | null
    activeMacroPlan: MacroPlan | null
    activeProgram: TrainingProgram | null
    onRefresh: () => void
    onSwitchTab: (tab: string) => void
}

export function ResumenTab({
    coachId,
    clientId,
    clientStatus,
    latestCheckin,
    activeMacroPlan,
    activeProgram,
    onRefresh,
    onSwitchTab,
}: ResumenTabProps) {
    return (
        <div className="space-y-6">
            {/* Status Card */}
            <StatusCard status={clientStatus} latestCheckin={latestCheckin} />

            {/* Latest Review Card */}
            <ReviewCard
                coachId={coachId}
                clientId={clientId}
                checkin={latestCheckin}
                onRefresh={onRefresh}
            />

            {/* Active Plans Mini */}
            <div className="grid sm:grid-cols-2 gap-4">
                <ActivePlanCard
                    title="Plan nutricional"
                    icon={Apple}
                    hasData={!!activeMacroPlan}
                    content={
                        activeMacroPlan ? (
                            <div className="space-y-1">
                                <p className="font-medium">{activeMacroPlan.kcal} kcal</p>
                                <p className="text-sm text-muted-foreground">
                                    P{activeMacroPlan.protein_g}g · C{activeMacroPlan.carbs_g}g · G{activeMacroPlan.fat_g}g
                                </p>
                                {activeMacroPlan.steps_goal && (
                                    <p className="text-xs text-muted-foreground">{activeMacroPlan.steps_goal.toLocaleString()} pasos/día</p>
                                )}
                            </div>
                        ) : null
                    }
                    onView={() => onSwitchTab('plan')}
                />
                <ActivePlanCard
                    title="Programa entrenamiento"
                    icon={Dumbbell}
                    hasData={!!activeProgram}
                    content={
                        activeProgram ? (
                            <div className="space-y-1">
                                <p className="font-medium">{activeProgram.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {activeProgram.total_weeks} semanas
                                </p>
                                <Badge variant="secondary" className="mt-1">
                                    {activeProgram.status === 'active' ? 'Activo' : activeProgram.status}
                                </Badge>
                            </div>
                        ) : null
                    }
                    onView={() => onSwitchTab('plan')}
                />
            </div>
        </div>
    )
}

function StatusCard({ status, latestCheckin }: { status: ClientStatus | null; latestCheckin: CheckinWithReview | null }) {
    if (!status) {
        return (
            <Card className="p-6 text-center text-muted-foreground">
                Cargando estado del cliente...
            </Card>
        )
    }

    const StatusIcon = {
        ok: CheckCircle,
        warning: AlertTriangle,
        risk: XCircle,
    }[status.statusLevel]

    const statusColors = {
        ok: 'text-success',
        warning: 'text-warning',
        risk: 'text-destructive',
    }

    const statusLabels = {
        ok: 'Todo en orden',
        warning: 'Requiere atención',
        risk: 'En riesgo',
    }

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    Estado
                </h3>
                <div className={cn('flex items-center gap-2', statusColors[status.statusLevel])}>
                    <StatusIcon className="h-5 w-5" />
                    <span className="font-medium">{statusLabels[status.statusLevel]}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Último check-in</p>
                    <p className="font-medium">
                        {status.lastCheckinDate || 'Sin check-ins'}
                    </p>
                    {status.daysSinceCheckin !== null && (
                        <p className="text-xs text-muted-foreground">hace {status.daysSinceCheckin}d</p>
                    )}
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Próximo check-in</p>
                    <p className="font-medium">{status.nextCheckinDate}</p>
                    <p className={cn(
                        'text-xs',
                        status.daysUntilCheckin < 0 && 'text-destructive',
                        status.daysUntilCheckin === 0 && 'text-warning',
                    )}>
                        {status.daysUntilCheckin < 0
                            ? `Atrasado ${Math.abs(status.daysUntilCheckin)}d`
                            : status.daysUntilCheckin === 0
                                ? 'Hoy'
                                : `En ${status.daysUntilCheckin}d`}
                    </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Adherencia entreno</p>
                    <p className={cn(
                        'font-medium',
                        status.trainingAdherence !== null && status.trainingAdherence < 60 && 'text-destructive'
                    )}>
                        {status.trainingAdherence !== null ? `${status.trainingAdherence}%` : '—'}
                    </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Adherencia nutrición</p>
                    <p className={cn(
                        'font-medium',
                        status.nutritionAdherence !== null && status.nutritionAdherence < 60 && 'text-destructive'
                    )}>
                        {status.nutritionAdherence !== null ? `${status.nutritionAdherence}%` : '—'}
                    </p>
                </div>
            </div>
        </Card>
    )
}

function ReviewCard({
    coachId,
    clientId,
    checkin,
    onRefresh
}: {
    coachId: string
    clientId: string
    checkin: CheckinWithReview | null
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()
    const [expanded, setExpanded] = useState(false)

    const handleCreateReview = () => {
        if (!checkin) return
        startTransition(async () => {
            await createReviewAction(coachId, clientId, checkin.id)
            onRefresh()
        })
    }

    const handleApprove = () => {
        if (!checkin?.review) return
        startTransition(async () => {
            await approveReviewAction(checkin.review!.id)
            onRefresh()
        })
    }

    const handleRevert = () => {
        if (!checkin?.review) return
        startTransition(async () => {
            await revertReviewToDraftAction(checkin.review!.id)
            onRefresh()
        })
    }

    if (!checkin) {
        return (
            <Card className="p-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold">Sin check-ins</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    El cliente aún no ha enviado ningún check-in
                </p>
            </Card>
        )
    }

    const review = checkin.review

    return (
        <Card>
            <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Último Review</h3>
                    {review && (
                        <Badge
                            variant="secondary"
                            className={cn(
                                review.status === 'draft' && 'bg-warning/10 text-warning',
                                review.status === 'approved' && 'bg-success/10 text-success',
                            )}
                        >
                            {review.status === 'draft' ? 'Borrador' : 'Aprobado'}
                        </Badge>
                    )}
                </div>
                <span className="text-sm text-muted-foreground">
                    Check-in: {new Date(checkin.submitted_at).toLocaleDateString('es-ES')}
                </span>
            </div>

            <div className="p-4">
                {!review ? (
                    <div className="text-center py-4">
                        <p className="text-muted-foreground mb-4">
                            Este check-in no tiene review asociado
                        </p>
                        <Button onClick={handleCreateReview} disabled={isPending}>
                            <FileText className="h-4 w-4 mr-2" />
                            Crear review
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Resumen</p>
                            <p className="text-sm">{review.summary || 'Sin resumen (pendiente IA)'}</p>
                        </div>

                        {/* Message to client */}
                        {review.message_to_client && (
                            <div>
                                <p className="text-sm text-muted-foreground mb-1">Mensaje al cliente</p>
                                <p className="text-sm bg-muted/50 p-3 rounded-lg">{review.message_to_client}</p>
                            </div>
                        )}

                        {/* Expandable analysis/proposal */}
                        {(review.analysis || review.proposal) && (
                            <div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpanded(!expanded)}
                                    className="w-full justify-between"
                                >
                                    <span>Ver detalles (IA)</span>
                                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                                {expanded && (
                                    <div className="mt-2 p-3 bg-muted/30 rounded-lg text-xs font-mono space-y-2">
                                        {review.analysis && (
                                            <div>
                                                <p className="font-semibold mb-1">Analysis:</p>
                                                <pre className="whitespace-pre-wrap">{JSON.stringify(review.analysis, null, 2)}</pre>
                                            </div>
                                        )}
                                        {review.proposal && (
                                            <div>
                                                <p className="font-semibold mb-1">Proposal:</p>
                                                <pre className="whitespace-pre-wrap">{JSON.stringify(review.proposal, null, 2)}</pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t">
                            {review.status === 'draft' && (
                                <>
                                    <Button size="sm" onClick={handleApprove} disabled={isPending}>
                                        <Check className="h-4 w-4 mr-2" />
                                        Aprobar
                                    </Button>
                                    <Button variant="outline" size="sm" disabled>
                                        <Edit className="h-4 w-4 mr-2" />
                                        Editar
                                    </Button>
                                </>
                            )}
                            {review.status === 'approved' && (
                                <Button variant="outline" size="sm" onClick={handleRevert} disabled={isPending}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Volver a borrador
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}

function ActivePlanCard({
    title,
    icon: Icon,
    hasData,
    content,
    onView
}: {
    title: string
    icon: React.ElementType
    hasData: boolean
    content: React.ReactNode
    onView: () => void
}) {
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <h3 className="font-medium text-sm">{title}</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={onView}>
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
            {hasData ? (
                content
            ) : (
                <p className="text-sm text-muted-foreground">Sin plan activo</p>
            )}
        </Card>
    )
}
