'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClientWithMeta } from '@/types/coach'
import { StatusFilter } from '@/data/members'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    MoreHorizontal,
    UserX,
    UserCheck,
    Edit,
    ExternalLink,
    AlertCircle,
    Loader2,
    Send,
    ClipboardList,
    Copy,
    Check,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { deactivateClientAction, reactivateClientAction } from './actions'
import { resendInviteAction } from './invite-actions'
import { sendOnboardingAction } from './onboarding-actions'
import { useState } from 'react'
import { EditClientModal } from './EditClientModal'
import { useToast } from '@/hooks/use-toast'
import { Input } from '@/components/ui/input'

interface MembersTableProps {
    clients: ClientWithMeta[]
    statusFilter: StatusFilter
    coachId: string
}

export function MembersTable({ clients, statusFilter, coachId }: MembersTableProps) {
    const router = useRouter()

    if (clients.length === 0) {
        const emptyMessage = statusFilter === 'active'
            ? 'No hay clientes activos'
            : statusFilter === 'inactive'
                ? 'No hay clientes inactivos'
                : 'No hay clientes registrados'

        return (
            <Card className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{emptyMessage}</h3>
                <p className="text-muted-foreground mb-4">
                    {statusFilter === 'inactive'
                        ? 'Todos tus clientes están activos.'
                        : 'Añade tu primer cliente para empezar.'}
                </p>
            </Card>
        )
    }

    return (
        <Card>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Signup</TableHead>
                        <TableHead>Próximo check-in</TableHead>
                        <TableHead className="hidden lg:table-cell">Frecuencia</TableHead>
                        <TableHead className="hidden lg:table-cell">Inicio</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {clients.map((client) => (
                        <ClientRow key={client.id} client={client} coachId={coachId} onUpdate={() => router.refresh()} />
                    ))}
                </TableBody>
            </Table>
        </Card>
    )
}

function ClientRow({ client, coachId, onUpdate }: { client: ClientWithMeta; coachId: string; onUpdate: () => void }) {
    const [isPending, startTransition] = useTransition()
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [onboardingLinkModal, setOnboardingLinkModal] = useState<{ url: string } | null>(null)
    const [copied, setCopied] = useState(false)
    const { toast } = useToast()

    // DEV: Warn if status is null/unexpected
    if (process.env.NODE_ENV === 'development' && !client.status) {
        console.warn(`[MembersTable] Client "${client.full_name}" (${client.id}) has NULL/undefined status — showing as 'Desconocido'`)
    }

    const isPendingSignup = !client.auth_user_id

    const handleDeactivate = () => {
        startTransition(async () => {
            await deactivateClientAction(client.id)
            onUpdate()
        })
    }

    const handleReactivate = () => {
        startTransition(async () => {
            await reactivateClientAction(client.id)
            onUpdate()
        })
    }

    const handleResendInvite = () => {
        startTransition(async () => {
            const result = await resendInviteAction(client.id, coachId)
            if (result.success) {
                toast({
                    title: 'Invite resent ✓',
                    description: `Invitation resent to ${client.email}`,
                })
            } else {
                toast({
                    title: 'Failed to resend invite',
                    description: result.error || 'Unknown error',
                    variant: 'destructive',
                })
            }
            onUpdate()
        })
    }

    const handleSendOnboarding = () => {
        startTransition(async () => {
            const result = await sendOnboardingAction(client.id, coachId)
            if (result.success && result.form_url) {
                toast({
                    title: 'Onboarding enviado ✓',
                    description: `Onboarding creado para ${client.full_name}`,
                })
                setOnboardingLinkModal({ url: result.form_url })
            } else {
                toast({
                    title: 'Error al enviar onboarding',
                    description: result.error || 'Error desconocido',
                    variant: 'destructive',
                })
            }
        })
    }

    const handleCopyLink = async () => {
        if (!onboardingLinkModal) return
        try {
            await navigator.clipboard.writeText(onboardingLinkModal.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast({
                title: 'Error al copiar',
                description: 'No se pudo copiar el enlace',
                variant: 'destructive',
            })
        }
    }

    const getCheckinBadge = () => {
        if (client.status !== 'active') return <span className="text-muted-foreground">—</span>

        if (client.daysUntilCheckin <= 0) {
            return <Badge variant="destructive">Hoy</Badge>
        } else if (client.daysUntilCheckin <= 2) {
            return <Badge className="bg-warning text-warning-foreground">{client.daysUntilCheckin}d</Badge>
        } else if (client.daysUntilCheckin <= 7) {
            return <Badge variant="secondary">{client.daysUntilCheckin}d</Badge>
        }
        return <span className="text-muted-foreground">{client.daysUntilCheckin}d</span>
    }

    return (
        <>
            <TableRow className={cn(isPending && 'opacity-50', client.status === 'inactive' && 'opacity-70')}>
                <TableCell>
                    <div>
                        <p className="font-medium">{client.full_name}</p>
                        <p className="text-sm text-muted-foreground">{client.email}</p>
                    </div>
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell>
                    {isPendingSignup ? (
                        <div className="flex items-center gap-2">
                            <Badge className="bg-amber-500/10 text-amber-500 border-0">
                                Pending signup
                            </Badge>
                        </div>
                    ) : (
                        <Badge className="bg-success/10 text-success border-0">
                            Active
                        </Badge>
                    )}
                </TableCell>
                <TableCell>
                    {client.status === 'active' ? (
                        <div className="flex items-center gap-2">
                            <span className="text-sm">{client.next_checkin_date}</span>
                            {getCheckinBadge()}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                        {client.checkin_frequency_days} días
                    </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">{client.start_date}</span>
                </TableCell>
                <TableCell>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isPending}>
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href={`/coach/clients?client=${client.id}`}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Abrir workspace
                                </Link>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* Send Onboarding */}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            <DropdownMenuItem
                                                onClick={handleSendOnboarding}
                                                disabled={isPendingSignup}
                                                className={isPendingSignup ? 'opacity-50' : ''}
                                            >
                                                <ClipboardList className="h-4 w-4 mr-2" />
                                                Enviar onboarding
                                            </DropdownMenuItem>
                                        </span>
                                    </TooltipTrigger>
                                    {isPendingSignup && (
                                        <TooltipContent side="left">
                                            <p className="text-xs">El cliente debe registrarse para recibir formularios</p>
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            </TooltipProvider>

                            {isPendingSignup && (
                                <>
                                    <DropdownMenuItem onClick={handleResendInvite}>
                                        <Send className="h-4 w-4 mr-2" />
                                        Resend invite
                                    </DropdownMenuItem>
                                </>
                            )}

                            <DropdownMenuSeparator />
                            {client.status === 'active' ? (
                                <DropdownMenuItem
                                    onClick={handleDeactivate}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <UserX className="h-4 w-4 mr-2" />
                                    Dar de baja
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem
                                    onClick={handleReactivate}
                                    className="text-success focus:text-success"
                                >
                                    <UserCheck className="h-4 w-4 mr-2" />
                                    Reactivar
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
            </TableRow>

            <EditClientModal
                client={client}
                open={editModalOpen}
                onOpenChange={setEditModalOpen}
                onSuccess={onUpdate}
            />

            {/* Onboarding Link Modal */}
            <Dialog open={!!onboardingLinkModal} onOpenChange={(v) => { if (!v) setOnboardingLinkModal(null) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Onboarding creado</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Comparte este enlace con el cliente para que complete su onboarding:
                        </p>
                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={onboardingLinkModal?.url ?? ''}
                                className="text-xs font-mono"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={handleCopyLink}
                                className="shrink-0"
                            >
                                {copied ? (
                                    <Check className="h-4 w-4 text-success" />
                                ) : (
                                    <Copy className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOnboardingLinkModal(null)}>
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
