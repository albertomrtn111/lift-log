'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientWithMeta } from '@/types/coach'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'

interface ClientRowProps {
    client: ClientWithMeta
    showFrequency?: boolean
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

    return (
        <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/30 transition-colors border-b last:border-b-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {initials}
                </div>
                <div className="min-w-0">
                    <p className="font-medium truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{client.email}</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {getDueBadge()}
                {showFrequency && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                        cada {client.checkin_frequency_days}d
                    </span>
                )}
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/coach/clients?client=${client.id}`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Abrir</span>
                    </Link>
                </Button>
            </div>
        </div>
    )
}
