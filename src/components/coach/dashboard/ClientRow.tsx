'use client'

import { Badge } from '@/components/ui/badge'
import { ClientWithMeta } from '@/types/coach'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface ClientRowProps {
    client: ClientWithMeta
    showFrequency?: boolean
}

/** Adherence dot color: green ≥80, yellow 60-79, red <60, gray if null */
function getAdherenceDotColor(pct: number | null | undefined): string {
    if (pct == null) return 'bg-zinc-400/50'
    if (pct >= 80) return 'bg-green-500'
    if (pct >= 60) return 'bg-yellow-500'
    return 'bg-red-500'
}

/** Human-readable time since a date */
function timeSince(dateStr: string): string {
    const now = new Date()
    const date = new Date(dateStr)
    const months = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30))
    if (months < 1) return 'menos de 1 mes'
    if (months === 1) return '1 mes'
    if (months < 12) return `${months} meses`
    const years = Math.floor(months / 12)
    const rem = months % 12
    if (rem === 0) return `${years} año${years > 1 ? 's' : ''}`
    return `${years}a ${rem}m`
}

export function ClientRow({ client, showFrequency = true }: ClientRowProps) {
    const getDueBadge = () => {
        if (client.daysUntilCheckin < 0) {
            return (
                <Badge variant="destructive">
                    Atrasado {Math.abs(client.daysUntilCheckin)}d
                </Badge>
            )
        }
        if (client.daysUntilCheckin === 0) {
            return <Badge className="bg-warning text-warning-foreground">Hoy</Badge>
        }
        if (client.daysUntilCheckin <= 2) {
            return <Badge variant="secondary">{client.daysUntilCheckin}d</Badge>
        }
        return <span className="text-sm text-muted-foreground">{client.daysUntilCheckin}d</span>
    }

    const { displayName, initials } = getClientDisplayIdentity(client)
    const clientSince = timeSince(client.start_date)

    return (
        <Link
            href={`/coach/clients?client=${client.id}`}
            className="flex items-center justify-between py-3 px-4 hover:bg-muted/30 transition-colors border-b last:border-b-0 no-underline text-foreground"
        >
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Avatar with adherence dot */}
                <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xs font-bold text-white">
                        {initials}
                    </div>
                    <div
                        className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                            getAdherenceDotColor(client.lastAdherencePct)
                        )}
                    />
                </div>
                <div className="min-w-0">
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="font-medium truncate">{displayName}</p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                {client.email}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Cliente desde hace {clientSince}</span>
                        {client.hasPendingReview && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-warning/10 text-warning border-warning/30">
                                Review pendiente
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {getDueBadge()}
                {showFrequency && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                        cada {client.checkin_frequency_days}d
                    </span>
                )}
                <div className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <span className="hidden sm:inline">Revisar</span>
                    <ChevronRight className="h-4 w-4" />
                </div>
            </div>
        </Link>
    )
}
