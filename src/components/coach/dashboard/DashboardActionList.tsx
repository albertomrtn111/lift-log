'use client'

import Link from 'next/link'
import { ArrowRight, Clock, FileText, Sparkles, AlertTriangle, Dumbbell, Scale } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DashboardActionItem } from '@/data/dashboard'
import { cn } from '@/lib/utils'

interface DashboardActionListProps {
    actions: DashboardActionItem[]
}

const priorityStyles = {
    high: 'bg-destructive/10 text-destructive border-destructive/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-muted text-muted-foreground border-border',
} as const

function getActionIcon(type: DashboardActionItem['type']) {
    switch (type) {
        case 'pending_review':
            return FileText
        case 'overdue_checkin':
            return AlertTriangle
        case 'low_adherence':
            return Sparkles
        case 'no_active_program':
            return Dumbbell
        case 'stale_weight':
            return Scale
        case 'due_today':
        case 'no_recent_checkin':
        default:
            return Clock
    }
}

export function DashboardActionList({ actions }: DashboardActionListProps) {
    if (actions.length === 0) {
        return (
            <div className="p-6 sm:p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <Clock className="h-6 w-6 text-success" />
                </div>
                <p className="font-medium">Nada urgente por resolver</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    El tablero está al día. Puedes aprovechar para revisar próximos check-ins o actividad reciente.
                </p>
            </div>
        )
    }

    return (
        <div className="divide-y">
            {actions.map((action) => {
                const Icon = getActionIcon(action.type)

                return (
                    <div
                        key={action.id}
                        className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-foreground">{action.title}</p>
                                    <Badge variant="outline" className={cn('capitalize', priorityStyles[action.priority])}>
                                        {action.priority === 'high' ? 'Alta prioridad' : action.priority === 'medium' ? 'Importante' : 'Seguimiento'}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                            </div>
                        </div>

                        <Button variant="ghost" size="sm" asChild className="shrink-0 self-start sm:self-center">
                            <Link href={action.href}>
                                {action.ctaLabel}
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                )
            })}
        </div>
    )
}
