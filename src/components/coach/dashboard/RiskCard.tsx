'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AtRiskClient } from '@/data/dashboard'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface RiskCardProps {
    client: AtRiskClient
}

export function RiskCard({ client }: RiskCardProps) {
    const riskColors = {
        overdue: 'border-destructive/30 bg-destructive/5',
        low_adherence: 'border-warning/30 bg-warning/5',
        no_recent_checkin: 'border-muted-foreground/30 bg-muted/50',
    }

    const riskBadgeColors = {
        overdue: 'bg-destructive/10 text-destructive border-0',
        low_adherence: 'bg-warning/10 text-warning border-0',
        no_recent_checkin: 'bg-muted text-muted-foreground border-0',
    }

    return (
        <Card className={cn('p-4', riskColors[client.riskReason])}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-medium truncate">{client.full_name}</p>
                        <Badge
                            variant="secondary"
                            className={cn('mt-1', riskBadgeColors[client.riskReason])}
                        >
                            {client.riskDetail}
                        </Badge>
                    </div>
                </div>
                <Button variant="ghost" size="sm" asChild className="shrink-0">
                    <Link href={`/coach/clients?client=${client.id}`}>
                        <ExternalLink className="h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </Card>
    )
}
