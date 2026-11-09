'use client'

import Link from 'next/link'
import { AlertTriangle, ChevronRight, Dumbbell, FileWarning, Scale, Sparkles } from 'lucide-react'
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

const severityChip = {
    high: 'bg-red-500/[0.12] text-red-600 dark:text-red-400',
    medium: 'bg-amber-400/15 text-amber-700 dark:text-amber-300',
} as const

const severityRing = {
    high: 'ring-[#F87171]',
    medium: 'ring-[#FBBF24]',
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
        <ul className="px-2 pb-2 sm:px-3">
            {clients.map((client) => {
                const { displayName, initials } = getClientDisplayIdentity(client)
                const PrimaryIcon = reasonIcons[client.attentionReasons[0]?.code ?? 'overdue_checkin']
                const isHigh = client.primarySeverity === 'high'

                return (
                    <li key={client.id}>
                        <Link
                            href={`/coach/clients?client=${client.id}`}
                            className="group flex items-center gap-3.5 rounded-2xl px-2 py-2.5 text-foreground no-underline transition-colors hover:bg-foreground/[0.035] sm:px-3"
                        >
                            <span className="relative shrink-0">
                                <AthleteAvatar
                                    initials={initials}
                                    avatarUrl={client.avatar_url}
                                    seed={displayName}
                                    className={cn('h-11 w-11 ring-2 ring-offset-2 ring-offset-card', severityRing[client.primarySeverity])}
                                    fallbackClassName="text-[14px]"
                                />
                                <span className="sr-only"><PrimaryIcon /></span>
                            </span>

                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                    <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{displayName}</span>
                                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold', severityChip[client.primarySeverity])}>
                                        {isHigh ? 'Alta' : 'Media'}
                                    </span>
                                </span>
                                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                                    {[client.primaryReason, ...client.attentionReasons.slice(1, 3).map(reason => reason.label)].join(' · ')}
                                </span>
                            </span>

                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                    </li>
                )
            })}
        </ul>
    )
}
