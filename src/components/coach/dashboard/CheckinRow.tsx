'use client'

import { Badge } from '@/components/ui/badge'
import { RecentCheckin } from '@/data/dashboard'
import { ChevronRight, FileText, Scale, Footprints, Dumbbell, Apple, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CheckinRowProps {
    checkin: RecentCheckin
}

export function CheckinRow({ checkin }: CheckinRowProps) {
    const reviewBadge = () => {
        // submitted_at ya viene limpio: null mientras el atleta no haya respondido
        if (!checkin.submitted_at) {
            return checkin.checkin_status === 'pending' ? (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400">
                    Pendiente<span className="hidden sm:inline">&nbsp;de respuesta</span>
                </Badge>
            ) : (
                <Badge variant="outline" className="bg-muted/50 text-muted-foreground">
                    {checkin.checkin_status === 'archived' ? 'Reemplazada' : 'Sin respuesta'}
                </Badge>
            )
        }

        if (checkin.review_status === 'approved') {
            return (
                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                    Aprobado
                </Badge>
            )
        }

        if (checkin.review_status === 'rejected') {
            return (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive border-0">
                    Rechazado
                </Badge>
            )
        }

        if (checkin.needs_review && checkin.review_ai_status === 'completed') {
            return (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                    Borrador IA listo
                </Badge>
            )
        }

        if (checkin.needs_review) {
            return (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400">
                    Por revisar
                </Badge>
            )
        }

        return (
            <Badge variant="outline" className="bg-muted/50">
                Respondida
            </Badge>
        )
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }

    const sentDate = new Date(checkin.sent_at)
    const weight = checkin.weight_avg_kg || checkin.weight_kg
    const hasMetrics = Boolean(weight || checkin.steps_avg || checkin.training_adherence_pct !== null
        || checkin.nutrition_adherence_pct !== null || checkin.review_ai_status === 'pending')

    return (
        <Link
            href={`/coach/clients?client=${checkin.client_id}`}
            className="flex items-start gap-3 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/40"
        >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">{checkin.client_name}</span>
                    <span className="shrink-0">{reviewBadge()}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    Enviada {formatDate(checkin.sent_at)} · {sentDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    {checkin.submitted_at && <> · Respondida {formatDate(checkin.submitted_at)}</>}
                </span>
                {hasMetrics && (
                    <span className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {weight && (
                            <MetricChip icon={Scale}>
                                {weight} kg
                                {checkin.weight_delta_kg != null && (
                                    <span className={cn(
                                        'font-semibold',
                                        checkin.weight_delta_kg > 0 && 'text-warning',
                                        checkin.weight_delta_kg < 0 && 'text-success'
                                    )}>
                                        {checkin.weight_delta_kg > 0 ? '+' : ''}{checkin.weight_delta_kg}
                                    </span>
                                )}
                            </MetricChip>
                        )}
                        {checkin.steps_avg && (
                            <MetricChip icon={Footprints}>{Math.round(checkin.steps_avg).toLocaleString('es-ES')}</MetricChip>
                        )}
                        {checkin.training_adherence_pct !== null && (
                            <MetricChip icon={Dumbbell} danger={checkin.training_adherence_pct < 60}>{checkin.training_adherence_pct}%</MetricChip>
                        )}
                        {checkin.nutrition_adherence_pct !== null && (
                            <MetricChip icon={Apple} danger={checkin.nutrition_adherence_pct < 60}>{checkin.nutrition_adherence_pct}%</MetricChip>
                        )}
                        {checkin.review_ai_status === 'pending' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-primary">
                                <Sparkles className="h-3 w-3" />
                                IA en curso
                            </span>
                        )}
                    </span>
                )}
            </span>
            <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
        </Link>
    )
}

function MetricChip({ icon: Icon, danger, children }: { icon: React.ElementType; danger?: boolean; children: React.ReactNode }) {
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 tabular-nums', danger && 'text-destructive')}>
            <Icon className="h-3 w-3" />
            {children}
        </span>
    )
}
