'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    CheckCircle2,
    ClipboardCheck,
    Clock,
    FileText,
    Loader2,
    MessageSquareQuote,
    PenLine,
    RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { DynamicForm } from '@/components/forms/DynamicForm'
import { parseLocalDate } from '@/lib/date-utils'
import {
    getClientReviewFormAction,
    getClientReviewsAction,
    type ClientReviewFormData,
    type ClientReviewItem,
    type ClientReviewUiStatus,
} from '@/data/client-reviews'

interface ClientReviewsTabProps {
    initialCheckinId?: string | null
}

const STATUS_META: Record<ClientReviewUiStatus, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    pending: {
        label: 'Pendiente',
        icon: Clock,
        className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    },
    submitted: {
        label: 'Enviada',
        icon: CheckCircle2,
        className: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    feedback: {
        label: 'Con feedback',
        icon: MessageSquareQuote,
        className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
}

function formatDate(date: string | null) {
    if (!date) return 'Sin fecha'
    return format(parseLocalDate(date.split('T')[0]), 'd MMM yyyy', { locale: es })
}

function formatPeriod(review: ClientReviewItem) {
    if (review.periodStart && review.periodEnd) {
        return `${formatDate(review.periodStart)} - ${formatDate(review.periodEnd)}`
    }

    if (review.periodEnd) return `Hasta ${formatDate(review.periodEnd)}`
    if (review.periodStart) return `Desde ${formatDate(review.periodStart)}`
    return `Creada ${formatDate(review.createdAt)}`
}

function ReviewStatusBadge({ status }: { status: ClientReviewUiStatus }) {
    const meta = STATUS_META[status]
    const Icon = meta.icon

    return (
        <Badge variant="outline" className={meta.className}>
            <Icon className="mr-1 h-3 w-3" />
            {meta.label}
        </Badge>
    )
}

function ReviewCard({
    review,
    onOpen,
}: {
    review: ClientReviewItem
    onOpen: (checkinId: string) => void
}) {
    const isPending = review.status === 'pending'
    const actionLabel = isPending ? 'Rellenar' : 'Editar'

    return (
        <Card className="overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold">{review.templateTitle}</h3>
                            <ReviewStatusBadge status={review.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{formatPeriod(review)}</p>
                        {review.submittedAt && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Enviada {formatDate(review.submittedAt)}
                            </p>
                        )}
                    </div>
                    <Button size="sm" onClick={() => onOpen(review.checkinId)} className="shrink-0 gap-1.5">
                        {isPending ? <PenLine className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                        {actionLabel}
                    </Button>
                </div>

                {review.feedbackMessage && (
                    <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <MessageSquareQuote className="h-3.5 w-3.5" />
                            Feedback de tu coach
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{review.feedbackMessage}</p>
                    </div>
                )}
            </div>
        </Card>
    )
}

export function ClientReviewsTab({ initialCheckinId }: ClientReviewsTabProps) {
    const [reviews, setReviews] = useState<ClientReviewItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [formLoading, setFormLoading] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [formData, setFormData] = useState<ClientReviewFormData | null>(null)
    const [autoOpened, setAutoOpened] = useState(false)

    const loadReviews = useCallback(async () => {
        setLoading(true)
        const result = await getClientReviewsAction()
        if (result.success) {
            setReviews(result.reviews)
            setError(null)
        } else {
            setReviews([])
            setError(result.error ?? 'No se pudieron cargar tus revisiones.')
        }
        setLoading(false)
    }, [])

    const openReviewForm = useCallback(async (checkinId: string) => {
        setSheetOpen(true)
        setFormLoading(true)
        setFormError(null)
        setFormData(null)

        const result = await getClientReviewFormAction(checkinId)
        if (result.success && result.form) {
            setFormData(result.form)
        } else {
            setFormError(result.error ?? 'No se pudo abrir esta revision.')
        }
        setFormLoading(false)
    }, [])

    useEffect(() => {
        loadReviews()
    }, [loadReviews])

    useEffect(() => {
        if (!initialCheckinId || autoOpened || loading) return
        setAutoOpened(true)
        openReviewForm(initialCheckinId)
    }, [autoOpened, initialCheckinId, loading, openReviewForm])

    const stats = useMemo(() => {
        return {
            pending: reviews.filter(review => review.status === 'pending').length,
            submitted: reviews.filter(review => review.status === 'submitted').length,
            feedback: reviews.filter(review => review.status === 'feedback').length,
        }
    }, [reviews])

    if (loading) {
        return (
            <div className="flex min-h-[360px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
                <Card className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">Pendientes</p>
                    <p className="mt-1 text-xl font-bold">{stats.pending}</p>
                </Card>
                <Card className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">Enviadas</p>
                    <p className="mt-1 text-xl font-bold">{stats.submitted}</p>
                </Card>
                <Card className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">Feedback</p>
                    <p className="mt-1 text-xl font-bold">{stats.feedback}</p>
                </Card>
            </div>

            {error && (
                <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {error}
                </Card>
            )}

            {reviews.length === 0 ? (
                <Card className="p-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold">Aun no hay revisiones</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Cuando tu entrenador te envie una revision, aparecera aqui para rellenarla desde la app.
                    </p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {reviews.map(review => (
                        <ReviewCard key={review.checkinId} review={review} onOpen={openReviewForm} />
                    ))}
                </div>
            )}

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden p-0 sm:max-w-xl">
                    <SheetHeader className="border-b px-4 py-4 text-left">
                        <SheetTitle className="flex items-center gap-2 text-base">
                            <ClipboardCheck className="h-4 w-4 text-primary" />
                            Revision
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-4 py-5">
                        {formLoading ? (
                            <div className="flex min-h-[320px] items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : formError ? (
                            <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                                {formError}
                            </Card>
                        ) : formData ? (
                            <DynamicForm
                                key={formData.checkinId}
                                checkinId={formData.checkinId}
                                templateTitle={formData.templateTitle}
                                templateType={formData.templateType}
                                schema={formData.schema}
                                coachId={formData.coachId}
                                clientId={formData.clientId}
                                metrics={formData.metrics}
                                initialValues={formData.initialValues}
                                embedded
                                redirectOnOnboarding={false}
                                onSubmitted={() => {
                                    loadReviews()
                                }}
                            />
                        ) : null}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
