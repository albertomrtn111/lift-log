'use client'

import { useState, useTransition } from 'react'
import { Client } from '@/types/coach'
import { FormTemplate } from '@/types/forms'
import { ClientStatus } from '@/data/workspace'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Edit,
    UserX,
    UserCheck,
    Calendar,
    RefreshCw,
    Send,
    AlertTriangle,
    Loader2,
    MoreVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import { toggleClientStatusAction } from './actions'
import { resendInviteAction } from '../invite-actions'
import { EditClientModal } from '../EditClientModal'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseLocalDate } from '@/lib/date-utils'

interface WorkspaceHeaderProps {
    client: Client
    clientStatus: ClientStatus | null
    coachId: string
    formTemplates: FormTemplate[]
    onClientUpdated: () => void
}

export function WorkspaceHeader({ client, clientStatus, coachId, formTemplates, onClientUpdated }: WorkspaceHeaderProps) {
    const [isPending, startTransition] = useTransition()
    const [editModalOpen, setEditModalOpen] = useState(false)
    const { displayName, initials } = getClientDisplayIdentity(client)
    const { toast } = useToast()

    const isPendingSignup = !client.auth_user_id

    if (process.env.NODE_ENV === 'development' && !client.status) {
        console.warn(`[WorkspaceHeader] Client "${client.full_name}" (${client.id}) has NULL/undefined status`)
    }

    const handleToggleStatus = () => {
        startTransition(async () => {
            await toggleClientStatusAction(client.id, client.status)
            onClientUpdated()
        })
    }

    const handleResendInvite = () => {
        startTransition(async () => {
            const result = await resendInviteAction(client.id, coachId)
            if (result.success) {
                toast({
                    title: 'Invitación reenviada ✓',
                    description: `Se ha reenviado la invitación a ${client.email}`,
                })
            } else {
                toast({
                    title: 'Error al reenviar invitación',
                    description: result.error || 'Error desconocido',
                    variant: 'destructive',
                })
            }
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

    // Format next_checkin_date
    const formattedCheckinDate = client.next_checkin_date
        ? format(parseLocalDate(client.next_checkin_date), "EEE d 'de' MMM", { locale: es })
        : 'Sin fecha'

    return (
        <>
            {/* Pending Signup Banner */}
            {isPendingSignup && (
                <Card className="p-4 mb-4 border-amber-500/30 bg-amber-500/5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                            <div>
                                <p className="font-medium text-amber-500">Este cliente aún no se ha registrado</p>
                                <p className="text-sm text-muted-foreground">
                                    Envía una invitación y espera a que cree su cuenta. Las funciones de planificación estarán deshabilitadas hasta entonces.
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 shrink-0"
                            onClick={handleResendInvite}
                            disabled={isPending}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                            Reenviar invitación
                        </Button>
                    </div>
                </Card>
            )}

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
                                        client.status === 'inactive' && 'bg-muted text-muted-foreground',
                                        !client.status && 'bg-warning/10 text-warning border-0'
                                    )}
                                >
                                    {client.status === 'active' ? 'Activo' : client.status === 'inactive' ? 'Inactivo' : !client.status ? 'Desconocido' : client.status}
                                </Badge>
                                {isPendingSignup && (
                                    <Badge className="bg-amber-500/10 text-amber-500 border-0">
                                        Registro pendiente
                                    </Badge>
                                )}
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
                                <span className="font-medium capitalize">{formattedCheckinDate}</span>
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

                    {/* Actions: Editar + Dropdown */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditModalOpen(true)}
                        >
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar cliente
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={handleToggleStatus}
                                    disabled={isPending}
                                    className={cn(
                                        client.status === 'active' && 'text-destructive focus:text-destructive',
                                        client.status === 'inactive' && 'text-success focus:text-success'
                                    )}
                                >
                                    {isPending ? (
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    ) : client.status === 'active' ? (
                                        <UserX className="h-4 w-4 mr-2" />
                                    ) : (
                                        <UserCheck className="h-4 w-4 mr-2" />
                                    )}
                                    {client.status === 'active' ? 'Dar de baja' : 'Reactivar'}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </Card>

            <EditClientModal
                client={client}
                formTemplates={formTemplates}
                open={editModalOpen}
                onOpenChange={setEditModalOpen}
                onSuccess={onClientUpdated}
            />
        </>
    )
}
