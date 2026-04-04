'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RecentCheckin } from '@/data/dashboard'
import { ExternalLink, FileText, Scale, Footprints, Dumbbell, Apple, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CheckinRowProps {
    checkin: RecentCheckin
}

export function CheckinRow({ checkin }: CheckinRowProps) {
    const reviewBadge = () => {
        if (checkin.needs_review && checkin.review_ai_status === 'completed') {
            return (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                    Borrador IA listo
                </Badge>
            )
        }

        if (!checkin.review_status) {
            return (
                <Badge variant="outline" className="bg-muted/50">
                    Sin review
                </Badge>
            )
        }

        const statusStyles = {
            draft: 'bg-warning/10 text-warning border-0',
            approved: 'bg-success/10 text-success border-0',
            rejected: 'bg-destructive/10 text-destructive border-0',
        }

        const statusLabels = {
            draft: 'Borrador',
            approved: 'Aprobado',
            rejected: 'Rechazado',
        }

        return (
            <Badge variant="secondary" className={statusStyles[checkin.review_status]}>
                {statusLabels[checkin.review_status]}
            </Badge>
        )
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }

    return (
        <div className="flex flex-col gap-4 border-b px-4 py-4 transition-colors hover:bg-muted/20 last:border-b-0 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                    <p className="font-medium truncate">{checkin.client_name}</p>
                    <p className="text-xs text-muted-foreground">
                        {formatDate(checkin.submitted_at)} · {new Date(checkin.submitted_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground lg:flex-1 lg:justify-center">
                {(checkin.weight_kg || checkin.weight_avg_kg) && (
                    <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
                        <Scale className="h-3.5 w-3.5" />
                        <span>{checkin.weight_avg_kg || checkin.weight_kg} kg</span>
                        {checkin.weight_delta_kg != null && (
                            <span className={cn(
                                'text-xs font-medium',
                                checkin.weight_delta_kg > 0 && 'text-warning',
                                checkin.weight_delta_kg < 0 && 'text-success'
                            )}>
                                {checkin.weight_delta_kg > 0 ? '+' : ''}{checkin.weight_delta_kg} kg
                            </span>
                        )}
                    </div>
                )}
                {checkin.steps_avg && (
                    <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
                        <Footprints className="h-3.5 w-3.5" />
                        <span>{Math.round(checkin.steps_avg).toLocaleString()}</span>
                    </div>
                )}
                {checkin.training_adherence_pct !== null && (
                    <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
                        <Dumbbell className="h-3.5 w-3.5" />
                        <span className={cn(
                            checkin.training_adherence_pct < 60 && 'text-destructive'
                        )}>
                            {checkin.training_adherence_pct}%
                        </span>
                    </div>
                )}
                {checkin.nutrition_adherence_pct !== null && (
                    <div className="flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
                        <Apple className="h-3.5 w-3.5" />
                        <span className={cn(
                            checkin.nutrition_adherence_pct < 60 && 'text-destructive'
                        )}>
                            {checkin.nutrition_adherence_pct}%
                        </span>
                    </div>
                )}
                {checkin.review_ai_status === 'pending' && (
                    <div className="flex items-center gap-1 rounded-full bg-primary/5 px-2.5 py-1 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>IA en curso</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 self-start lg:self-center">
                {reviewBadge()}
                <Button variant="ghost" size="sm" asChild>
                    <Link href={`/coach/clients?client=${checkin.client_id}`}>
                        <ExternalLink className="h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
