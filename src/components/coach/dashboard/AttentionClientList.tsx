'use client'

import Link from 'next/link'
import { AlertTriangle, ChevronRight, Dumbbell, FileWarning, Scale, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AthleteAvatar } from '@/components/coach/AthleteAvatar'
import type { AttentionClient, AttentionReasonCode } from '@/data/dashboard'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import { cn } from '@/lib/utils'

interface AttentionClientListProps {
    clients: AttentionClient[]
}

const reasonIcons: Record<AttentionReasonCode, typeof AlertTriangle> = {
    pending_review: FileWarning,
    overdue_checkin: AlertTriangle,
    low_adherence: Sparkles,
    no_active_program: Dumbbell,
    no_recent_checkin: AlertTriangle,
    stale_weight: Scale,
}

const severityBadgeClass = {
    high: 'bg-destructive/10 text-destructive border-destructive/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
} as const

export function AttentionClientList({ clients }: AttentionClientListProps) {
    if (clients.length === 0) {
        return (
            <div className="p-6 sm:p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                    <AlertTriangle className="h-6 w-6 text-success" />
                </div>
                <p className="font-medium">Sin clientes críticos ahora mismo</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    No hay casos con revisiones pendientes, atraso relevante, baja adherencia o falta de programa activo.
                </p>
            </div>
        )
    }

    return (
        <ul className="divide-y divide-border/60">
            {clients.map((client) => {
                const { displayName, initials } = getClientDisplayIdentity(client)
                const PrimaryIcon = reasonIcons[client.attentionReasons[0]?.code ?? 'overdue_checkin']
                const isHigh = client.primarySeverity === 'high'

                return (
                    <li key={client.id}>
                        <Link
                            href={`/coach/clients?client=${client.id}`}
                            className="flex items-center gap-3 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/40"
                        >
                            <span className="relative shrink-0">
                                <AthleteAvatar
                                    initials={initials}
                                    avatarUrl={client.avatar_url}
                                    className="h-10 w-10"
                                    fallbackClassName="bg-primary/10 text-sm font-bold text-primary"
                                />
                                <span className={cn(
                                    'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card',
                                    isHigh ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-white'
                                )}>
                                    <PrimaryIcon className="h-2.5 w-2.5" />
                                </span>
                            </span>

                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className="truncate text-[15px] font-semibold">{displayName}</span>
                                    <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[10px]', severityBadgeClass[client.primarySeverity])}>
                                        {isHigh ? 'Alta' : 'Media'}
                                    </Badge>
                                </span>
                                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                                    {[client.primaryReason, ...client.attentionReasons.slice(1, 3).map(reason => reason.label)].join(' · ')}
                                </span>
                            </span>

                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                        </Link>
                    </li>
                )
            })}
        </ul>
    )
}
