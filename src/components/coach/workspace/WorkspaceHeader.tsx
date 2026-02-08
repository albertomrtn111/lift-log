'use client'

import { useState, useTransition } from 'react'
import { Client } from '@/types/coach'
import { ClientStatus } from '@/data/workspace'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Edit,
    UserX,
    UserCheck,
    ExternalLink,
    Calendar,
    RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import { toggleClientStatusAction } from './actions'
import { EditClientModal } from '../EditClientModal'

interface WorkspaceHeaderProps {
    client: Client
    clientStatus: ClientStatus | null
    onClientUpdated: () => void
}

export function WorkspaceHeader({ client, clientStatus, onClientUpdated }: WorkspaceHeaderProps) {
    const [isPending, startTransition] = useTransition()
    const [editModalOpen, setEditModalOpen] = useState(false)
    const { displayName, initials } = getClientDisplayIdentity(client)

    const handleToggleStatus = () => {
        startTransition(async () => {
            await toggleClientStatusAction(client.id, client.status)
            onClientUpdated()
        })
    }

    const getCheckinBadge = () => {
        if (!clientStatus) return null

        const { daysUntilCheckin } = clientStatus

        if (daysUntilCheckin < -3) {
            return <Badge variant="destructive">Atrasado {Math.abs(daysUntilCheckin)}d</Badge>
        }
        if (daysUntilCheckin < 0) {
            return <Badge className="bg-warning text-warning-foreground">Atrasado {Math.abs(daysUntilCheckin)}d</Badge>
        }
        if (daysUntilCheckin === 0) {
            return <Badge className="bg-warning text-warning-foreground">Hoy</Badge>
        }
        if (daysUntilCheckin <= 3) {
            return <Badge variant="secondary">{daysUntilCheckin}d</Badge>
        }
        return <span className="text-sm">{daysUntilCheckin}d</span>
    }

    const getStatusBadge = () => {
        if (!clientStatus) return null

        const colors = {
            ok: 'bg-success/10 text-success border-0',
            warning: 'bg-warning/10 text-warning border-0',
            risk: 'bg-destructive/10 text-destructive border-0',
        }
        const labels = { ok: 'OK', warning: 'Atención', risk: 'En riesgo' }

        return (
            <Badge variant="secondary" className={colors[clientStatus.statusLevel]}>
                {labels[clientStatus.statusLevel]}
            </Badge>
        )
    }

    return (
        <>
            <Card className="p-4 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    {/* Client Info */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xl font-bold text-white shrink-0">
                            {initials}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-semibold">{displayName}</h2>
                                <Badge
                                    variant={client.status === 'active' ? 'default' : 'secondary'}
                                    className={cn(
                                        client.status === 'active' && 'bg-success/10 text-success border-0',
                                        client.status === 'inactive' && 'bg-muted text-muted-foreground'
                                    )}
                                >
                                    {client.status === 'active' ? 'Activo' : 'Inactivo'}
                                </Badge>
                                {getStatusBadge()}
                            </div>
                            <p className="text-sm text-muted-foreground">{client.email}</p>
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <span className="text-muted-foreground">Próximo check-in: </span>
                                <span className="font-medium">{client.next_checkin_date}</span>
                                <span className="ml-2">{getCheckinBadge()}</span>
                            </div>
                        </div>
                        <div className="hidden lg:block">
                            <span className="text-muted-foreground">Frecuencia: </span>
                            <span className="font-medium">{client.checkin_frequency_days}d</span>
                        </div>
                        {clientStatus?.trainingAdherence !== null && (
                            <div className="hidden xl:block">
                                <span className="text-muted-foreground">Adherencia: </span>
                                <span className={cn(
                                    'font-medium',
                                    (clientStatus?.trainingAdherence ?? 100) < 60 && 'text-destructive'
                                )}>
                                    {clientStatus?.trainingAdherence}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditModalOpen(true)}
                        >
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleToggleStatus}
                            disabled={isPending}
                            className={cn(
                                client.status === 'active' && 'text-destructive hover:text-destructive',
                                client.status === 'inactive' && 'text-success hover:text-success'
                            )}
                        >
                            {isPending ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : client.status === 'active' ? (
                                <>
                                    <UserX className="h-4 w-4 mr-2" />
                                    Dar de baja
                                </>
                            ) : (
                                <>
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    Reactivar
                                </>
                            )}
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Ver como cliente (próximamente)">
                            <a href="/routine" target="_blank">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    </div>
                </div>
            </Card>

            <EditClientModal
                client={client}
                open={editModalOpen}
                onOpenChange={setEditModalOpen}
                onSuccess={onClientUpdated}
            />
        </>
    )
}
