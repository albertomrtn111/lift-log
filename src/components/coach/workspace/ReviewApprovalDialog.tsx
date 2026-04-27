'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCheck, Loader2, MessageSquareText } from 'lucide-react'
import type { CheckinWithReview } from '@/data/workspace'
import { completeReviewAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface ReviewApprovalDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    checkin: CheckinWithReview | null
    onCompleted?: () => void
}

function getReviewStateMeta(checkin: CheckinWithReview | null) {
    if (!checkin?.review) {
        return {
            label: 'Sin revisión',
            className: 'bg-muted/60 text-muted-foreground border-border',
        }
    }

    if (checkin.review.status === 'approved' && checkin.review.message_to_client?.trim()) {
        return {
            label: 'Aprobada y enviada',
            className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
        }
    }

    if (checkin.review.status === 'approved') {
        return {
            label: 'Aprobada',
            className: 'bg-green-500/10 text-green-700 border-green-500/20',
        }
    }

    if (checkin.review.status === 'draft') {
        return {
            label: 'Borrador',
            className: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
        }
    }

    return {
        label: 'Rechazada',
        className: 'bg-red-500/10 text-red-700 border-red-500/20',
    }
}

export function ReviewApprovalDialog({
    open,
    onOpenChange,
    coachId,
    clientId,
    checkin,
    onCompleted,
}: ReviewApprovalDialogProps) {
    const [feedbackText, setFeedbackText] = useState('')
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()

    const stateMeta = useMemo(() => getReviewStateMeta(checkin), [checkin])

    useEffect(() => {
        if (!open) return
        setFeedbackText('')
    }, [open, checkin?.id])

    if (!checkin) return null

    const formattedDate = checkin.submitted_at
        ? format(new Date(checkin.submitted_at), "d MMM yyyy", { locale: es })
        : checkin.period_end
            ? format(new Date(checkin.period_end), "d MMM yyyy", { locale: es })
            : 'Revisión'
    const isAlreadyApproved = checkin.review?.status === 'approved'
    const approveOnlyLabel = isAlreadyApproved ? 'Mantener aprobada' : 'Aprobar sin feedback'
    const sendLabel = isAlreadyApproved ? 'Enviar feedback' : 'Aprobar y enviar'

    const handleSubmit = (sendToClient: boolean) => {
        startTransition(async () => {
            const result = await completeReviewAction({
                coachId,
                clientId,
                checkinId: checkin.id,
                feedbackMessage: feedbackText,
                sendToClient,
            })

            if (result.success) {
                toast({
                    title: result.sentToClient ? 'Revisión aprobada y enviada' : 'Revisión aprobada',
                    description: result.sentToClient
                        ? 'El feedback ya está disponible en el chat del cliente.'
                        : 'La revisión se cerró sin enviar feedback desde la app.',
                })
                onOpenChange(false)
                onCompleted?.()
                return
            }

            if (result.partialSuccess) {
                toast({
                    title: 'Revisión aprobada con incidencia',
                    description: result.error || 'El cierre interno se completó, pero falló una parte del envío.',
                    variant: 'destructive',
                })
                onOpenChange(false)
                onCompleted?.()
                return
            }

            toast({
                title: 'No se pudo completar la revisión',
                description: result.error || 'Ha ocurrido un error inesperado.',
                variant: 'destructive',
            })
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader className="space-y-3">
                    <div className="flex items-center gap-2">
                        <CheckCheck className="h-5 w-5 text-primary" />
                        <DialogTitle>{isAlreadyApproved ? 'Enviar feedback de revisión' : 'Cerrar revisión'} · {formattedDate}</DialogTitle>
                    </div>
                    <DialogDescription>
                        {isAlreadyApproved
                            ? 'La revisión interna ya está aprobada. Desde aquí puedes dejarla tal como está o enviar un feedback opcional al cliente.'
                            : 'La aprobación interna y la comunicación al cliente se gestionan por separado. Puedes cerrar la revisión sin enviar texto, o aprobarla y mandar feedback desde aquí.'}
                    </DialogDescription>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={cn('text-xs', stateMeta.className)}>
                            {stateMeta.label}
                        </Badge>
                        {checkin.review?.ai_status === 'completed' && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20 text-xs">
                                IA lista
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <Label htmlFor="review-feedback">Feedback opcional al cliente</Label>
                    <Textarea
                        id="review-feedback"
                        placeholder="Escribe aquí un feedback si quieres enviarlo desde la app. Si prefieres usar WhatsApp, audio o llamada, puedes aprobar sin rellenar este campo."
                        value={feedbackText}
                        onChange={(event) => setFeedbackText(event.target.value)}
                        rows={6}
                        className="resize-none"
                        autoFocus
                    />
                    <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                        <div className="flex items-start gap-2">
                            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <p>
                                Si eliges <strong>Aprobar y enviar</strong>, el mensaje llegará al chat del cliente como un bloque formal de revisión, no como un mensaje casual.
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {approveOnlyLabel}
                    </Button>
                    <Button onClick={() => handleSubmit(true)} disabled={isPending || !feedbackText.trim()}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {sendLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
