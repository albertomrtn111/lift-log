'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, Dumbbell, FileWarning, Scale, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
                    No hay casos con reviews pendientes, atraso relevante, baja adherencia o falta de programa activo.
                </p>
            </div>
        )
    }

    return (
        <div className="divide-y">
            {clients.map((client) => {
                const { displayName, initials } = getClientDisplayIdentity(client)
                const PrimaryIcon = reasonIcons[client.attentionReasons[0]?.code ?? 'overdue_checkin']

                return (
                    <div
                        key={client.id}
                        className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="relative mt-0.5 shrink-0">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-sm font-bold text-white">
                                    {initials}
                                </div>
                                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-background">
                                    <PrimaryIcon className="h-3.5 w-3.5 text-destructive" />
                                </div>
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">{displayName}</p>
                                    <Badge variant="outline" className={cn(severityBadgeClass[client.primarySeverity])}>
                                        {client.primarySeverity === 'high' ? 'Prioridad alta' : 'Atención'}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{client.primaryReason}</p>
                                {client.attentionReasons.length > 1 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {client.attentionReasons.slice(1, 3).map((reason) => (
                                            <Badge
                                                key={`${client.id}-${reason.code}`}
                                                variant="secondary"
                                                className="bg-muted/60 text-muted-foreground border-0"
                                            >
                                                {reason.label}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button variant="ghost" size="sm" asChild className="shrink-0 self-start sm:self-center">
                            <Link href={`/coach/clients?client=${client.id}`}>
                                Abrir cliente
                                <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                )
            })}
        </div>
    )
}
