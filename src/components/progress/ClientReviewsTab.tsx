'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    ArrowLeft,
    BarChart3,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    Eye,
    FileText,
    History,
    Loader2,
    MessageSquareQuote,
    PenLine,
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
import { CheckinPhotosViewer } from '@/components/coach/workspace/CheckinPhotosViewer'
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

function hasAnswer(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value)) return value.length > 0
    return true
}

function formatAnswer(value: unknown): string {
    if (Array.isArray(value)) return value.map(String).join(', ')
    if (typeof value === 'boolean') return value ? 'Sí' : 'No'
    if (typeof value === 'object' && value !== null) return JSON.stringify(value)
    return String(value)
}

function fallbackLabel(key: string): string {
    return key
        .replace(/^metric_/, '')
        .replace(/^campo_/, 'Pregunta ')
        .replace(/_/g, ' ')
        .replace(/^./, letter => letter.toUpperCase())
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

    return (
        <Card className="overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words font-semibold">{review.templateTitle}</h3>
                            <ReviewStatusBadge status={review.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{formatPeriod(review)}</p>
                        {review.submittedAt && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Enviada {formatDate(review.submittedAt)}
                            </p>
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant={isPending ? 'default' : 'outline'}
                        onClick={() => onOpen(review.checkinId)}
                        className="min-h-10 shrink-0 gap-1.5"
                    >
                        {isPending ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {isPending ? 'Completar' : 'Ver'}
                    </Button>
                </div>

                {review.feedbackMessage && (
                    <div className="mt-4 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <MessageSquareQuote className="h-3.5 w-3.5" />
                            Feedback de tu coach
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">
                            {review.feedbackMessage}
                        </p>
                    </div>
                )}
            </div>
        </Card>
    )
}

function AnswerList({
    items,
}: {
    items: Array<{ key: string; label: string; value: unknown; unit?: string | null }>
}) {
    if (items.length === 0) {
        return <p className="text-sm text-muted-foreground">Sin datos registrados.</p>
    }

    return (
        <div className="divide-y overflow-hidden rounded-md border">
            {items.map(item => (
                <div key={item.key} className="space-y-1 bg-background px-3 py-3.5">
                    <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                    <p className="whitespace-pre-wrap break-words text-sm font-medium">
                        {formatAnswer(item.value)}{item.unit ? ` ${item.unit}` : ''}
                    </p>
                </div>
            ))}
        </div>
    )
}

function ClientReviewDetail({
    review,
    form,
    onEdit,
}: {
    review: ClientReviewItem
    form: ClientReviewFormData
    onEdit: () => void
}) {
    const metricItems = form.metrics
        .map(metric => ({
            key: `metric_${metric.id}`,
            label: metric.name,
            value: form.initialValues[`metric_${metric.id}`],
            unit: metric.unit,
        }))
        .filter(item => hasAnswer(item.value))

    const questionItems = form.schema
        .filter(field => field.type !== 'photo_upload')
        .map(field => ({
            key: field.id,
            label: field.label,
            value: form.initialValues[field.id],
        }))
        .filter(item => hasAnswer(item.value))

    const knownKeys = new Set([
        ...metricItems.map(item => item.key),
        ...form.schema.map(field => field.id),
    ])
    const otherItems = Object.entries(form.initialValues)
        .filter(([key, value]) => !knownKeys.has(key) && hasAnswer(value))
        .map(([key, value]) => ({ key, label: fallbackLabel(key), value }))

    return (
        <div className="space-y-7 pb-6">
            <div className="space-y-3 border-b pb-5">
                <div className="flex flex-wrap items-center gap-2">
                    <ReviewStatusBadge status={review.status} />
                    <span className="text-xs text-muted-foreground">{formatPeriod(review)}</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">{form.templateTitle}</h2>
                        {review.submittedAt && (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Enviada el {formatDate(review.submittedAt)}
                            </p>
                        )}
                    </div>
                    {review.canEdit && (
                        <Button variant="outline" onClick={onEdit} className="min-h-11 gap-2 sm:w-auto">
                            <PenLine className="h-4 w-4" />
                            Editar respuestas
                        </Button>
                    )}
                </div>
                {review.feedbackMessage && review.canEdit && (
                    <p className="text-xs text-muted-foreground">
                        Si guardas cambios, la revisión se enviará de nuevo a tu coach para que la revise.
                    </p>
                )}
            </div>

            {metricItems.length > 0 && (
                <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        Métricas registradas
                    </h3>
                    <AnswerList items={metricItems} />
                </section>
            )}

            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Tus respuestas
                </h3>
                <AnswerList items={[...questionItems, ...otherItems]} />
            </section>

            {(review.photoCount > 0 || form.photoConfig?.enabled || form.schema.some(field => field.type === 'photo_upload')) && (
                <section className="space-y-3">
                    <CheckinPhotosViewer checkinId={review.checkinId} coachId={form.coachId} />
                </section>
            )}

            {review.feedbackMessage && (
                <section className="space-y-3 border-t pt-6">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        <MessageSquareQuote className="h-4 w-4" />
                        Feedback de tu coach
                    </h3>
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {review.feedbackMessage}
                        </p>
                    </div>
                </section>
            )}
        </div>
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
    const [activeCheckinId, setActiveCheckinId] = useState<string | null>(null)
    const [editing, setEditing] = useState(false)
    const [autoOpened, setAutoOpened] = useState(false)

    const loadReviews = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true)
        const result = await getClientReviewsAction()
        if (result.success) {
            setReviews(result.reviews)
            setError(null)
        } else {
            setReviews([])
            setError(result.error ?? 'No se pudieron cargar tus revisiones.')
        }
        if (showLoading) setLoading(false)
    }, [])

    const openReview = useCallback(async (checkinId: string) => {
        const selected = reviews.find(review => review.checkinId === checkinId)
        setActiveCheckinId(checkinId)
        setEditing(selected?.status === 'pending')
        setSheetOpen(true)
        setFormLoading(true)
        setFormError(null)
        setFormData(null)

        const result = await getClientReviewFormAction(checkinId)
        if (result.success && result.form) {
            setFormData(result.form)
        } else {
            setFormError(result.error ?? 'No se pudo abrir esta revisión.')
        }
        setFormLoading(false)
    }, [reviews])

    const refreshOpenReview = useCallback(async () => {
        if (!activeCheckinId) return
        await loadReviews(false)
        const result = await getClientReviewFormAction(activeCheckinId)
        if (result.success && result.form) setFormData(result.form)
        setEditing(false)
    }, [activeCheckinId, loadReviews])

    useEffect(() => {
        loadReviews()
    }, [loadReviews])

    useEffect(() => {
        if (!initialCheckinId || autoOpened || loading) return
        setAutoOpened(true)
        openReview(initialCheckinId)
    }, [autoOpened, initialCheckinId, loading, openReview])

    const pendingReviews = useMemo(
        () => reviews.filter(review => review.status === 'pending'),
        [reviews]
    )
    const historyReviews = useMemo(
        () => reviews.filter(review => review.status !== 'pending'),
        [reviews]
    )
    const activeReview = activeCheckinId
        ? reviews.find(review => review.checkinId === activeCheckinId) ?? null
        : null

    const handleSheetChange = (open: boolean) => {
        setSheetOpen(open)
        if (!open) {
            setEditing(false)
            setActiveCheckinId(null)
            setFormData(null)
            setFormError(null)
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-[360px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-7">
            <div className="grid grid-cols-2 gap-2">
                <Card className="p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-medium text-muted-foreground">Pendientes</p>
                            <p className="mt-1 text-xl font-bold">{pendingReviews.length}</p>
                        </div>
                        <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                </Card>
                <Card className="p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <p className="text-[11px] font-medium text-muted-foreground">En tu historial</p>
                            <p className="mt-1 text-xl font-bold">{historyReviews.length}</p>
                        </div>
                        <History className="h-5 w-5 text-primary" />
                    </div>
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
                    <h3 className="font-semibold">Aún no hay revisiones</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Cuando tu entrenador te envíe una revisión, aparecerá aquí para rellenarla desde la app.
                    </p>
                </Card>
            ) : (
                <>
                    <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <Clock className="h-4 w-4 text-amber-600" />
                                Pendientes
                            </h2>
                            <Badge variant="secondary">{pendingReviews.length}</Badge>
                        </div>
                        {pendingReviews.length > 0 ? (
                            <div className="space-y-3">
                                {pendingReviews.map(review => (
                                    <ReviewCard key={review.checkinId} review={review} onOpen={openReview} />
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/20 p-4">
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                                <p className="text-sm text-muted-foreground">Estás al día con tus revisiones.</p>
                            </div>
                        )}
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold">
                                <History className="h-4 w-4 text-primary" />
                                Historial
                            </h2>
                            <Badge variant="secondary">{historyReviews.length}</Badge>
                        </div>
                        {historyReviews.length > 0 ? (
                            <div className="space-y-3">
                                {historyReviews.map(review => (
                                    <ReviewCard key={review.checkinId} review={review} onOpen={openReview} />
                                ))}
                            </div>
                        ) : (
                            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                                Las revisiones que envíes se guardarán aquí.
                            </p>
                        )}
                    </section>
                </>
            )}

            <Sheet open={sheetOpen} onOpenChange={handleSheetChange}>
                <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden p-0 sm:max-w-xl">
                    <SheetHeader className="border-b px-4 py-4 text-left">
                        <div className="flex min-w-0 items-center gap-2 pr-8">
                            {editing && activeReview?.status !== 'pending' && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0"
                                    onClick={() => setEditing(false)}
                                    title="Volver al detalle"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            )}
                            <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
                                <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" />
                                <span className="truncate">
                                    {editing ? 'Editar revisión' : 'Detalle de revisión'}
                                </span>
                            </SheetTitle>
                        </div>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                        {formLoading ? (
                            <div className="flex min-h-[320px] items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : formError ? (
                            <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                                {formError}
                            </Card>
                        ) : formData && activeReview ? (
                            editing ? (
                                <DynamicForm
                                    key={`${formData.checkinId}-edit`}
                                    checkinId={formData.checkinId}
                                    templateTitle={formData.templateTitle}
                                    templateType={formData.templateType}
                                    schema={formData.schema}
                                    coachId={formData.coachId}
                                    clientId={formData.clientId}
                                    metrics={formData.metrics}
                                    initialValues={formData.initialValues}
                                    photoConfig={formData.photoConfig}
                                    embedded
                                    submissionMode={activeReview.status === 'pending' ? 'submit' : 'update'}
                                    redirectOnOnboarding={false}
                                    onSubmitted={refreshOpenReview}
                                />
                            ) : (
                                <ClientReviewDetail
                                    review={activeReview}
                                    form={formData}
                                    onEdit={() => setEditing(true)}
                                />
                            )
                        ) : null}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
