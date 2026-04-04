'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, Dumbbell, FileText } from 'lucide-react'
import type { ActivityItem } from '@/data/dashboard'

interface ActivityFeedProps {
    items: ActivityItem[]
}

function getActivityIcon(type: ActivityItem['type']) {
    switch (type) {
        case 'review_approved':
            return CheckCircle2
        case 'program_activated':
            return Dumbbell
        case 'checkin_received':
        default:
            return FileText
    }
}

export function ActivityFeed({ items }: ActivityFeedProps) {
    if (items.length === 0) {
        return (
            <div className="p-6 text-center">
                <p className="font-medium">Sin actividad reciente</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Cuando entren check-ins, se aprueben reviews o actives programas aparecerán aquí.
                </p>
            </div>
        )
    }

    return (
        <div className="divide-y">
            {items.map((item) => {
                const Icon = getActivityIcon(item.type)
                return (
                    <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/20 no-underline text-foreground"
                    >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{item.title}</p>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(item.timestamp).toLocaleString('es-ES', {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                )
            })}
        </div>
    )
}
