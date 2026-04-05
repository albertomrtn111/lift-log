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
    RefreshCw,
    Send,
    AlertTriangle,
    Loader2,
    MoreVertical,
    ClipboardList,
    Check,
    Copy,
} from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getClientDisplayIdentity } from '@/lib/client-utils'
import { toggleClientStatusAction } from './actions'
import { resendInviteAction } from '../invite-actions'
import { sendOnboardingAction } from '../onboarding-actions'
import { sendReviewAction } from '../review-actions'
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
    const [onboardingLinkModal, setOnboardingLinkModal] = useState<{ url: string } | null>(null)
    const [reviewLinkModal, setReviewLinkModal] = useState<{ url: string } | null>(null)
    const [copied, setCopied] = useState(false)
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

    const handleSendReview = () => {
        startTransition(async () => {
            const result = await sendReviewAction(client.id, coachId)
            if (result.success && result.form_url) {
                toast({
                    title: 'Revisión enviada ✓',
                    description: `Revisión creada para ${client.full_name}`,
                })
                setReviewLinkModal({ url: result.form_url })
            } else {
                toast({
                    title: 'Error al enviar revisión',
                    description: result.error || 'Error desconocido',
                    variant: 'destructive',
                })
            }
        })
    }

    const handleCopyOnboardingLink = async () => {
        if (!onboardingLinkModal) return
        try {
            await navigator.clipboard.writeText(onboardingLinkModal.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast({ title: 'Error al copiar', description: 'No se pudo copiar el enlace', variant: 'destructive' })
        }
    }

    const handleCopyReviewLink = async () => {
        if (!reviewLinkModal) return
        try {
            await navigator.clipboard.writeText(reviewLinkModal.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast({ title: 'Error al copiar', description: 'No se pudo copiar el enlace', variant: 'destructive' })
        }
    }

    // Format next_checkin_date
    const formattedCheckinDate = client.next_checkin_date
        ? format(parseLocalDate(client.next_checkin_date), "EEE d 'de' MMM", { locale: es })
        : null

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

            <Card className="p-3.5 mb-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Client Info */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {initials}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-sm font-semibold truncate">{displayName}</h2>
                                <Badge
                                    variant={client.status === 'active' ? 'default' : 'secondary'}
                                    className={cn(
                                        'text-[10px] px-1.5 py-0',
                                        client.status === 'active' && 'bg-success/10 text-success border-0',
                                        client.status === 'inactive' && 'bg-muted text-muted-foreground',
                                        !client.status && 'bg-warning/10 text-warning border-0'
                                    )}
                                >
                                    {client.status === 'active' ? 'Activo' : client.status === 'inactive' ? 'Inactivo' : !client.status ? 'Desconocido' : client.status}
                                </Badge>
                                {isPendingSignup && (
                                    <Badge className="bg-amber-500/10 text-amber-500 border-0 text-[10px] px-1.5 py-0">
                                        Registro pendiente
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                                {formattedCheckinDate && (
                                    <span className="hidden sm:inline text-[11px] text-muted-foreground/70">·</span>
                                )}
                                {formattedCheckinDate && (
                                    <span className="hidden sm:inline text-[11px] text-muted-foreground capitalize whitespace-nowrap">Check-in {formattedCheckinDate}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions: Editar + Dropdown */}
                    <div className="flex items-center gap-2 self-start xl:self-center">
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
                                    onClick={handleSendOnboarding}
                                    disabled={isPending}
                                >
                                    {isPending ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <ClipboardList className="h-4 w-4 mr-2" />
                                    )}
                                    Enviar onboarding
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={handleSendReview}
                                    disabled={isPending}
                                >
                                    {isPending ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    Enviar revisión
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
                                    {client.status === 'active' ? (
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

            {/* Onboarding Link Modal */}
            <Dialog open={!!onboardingLinkModal} onOpenChange={(v) => { if (!v) { setOnboardingLinkModal(null); setCopied(false) } }}>
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
                                size="icon"
                                variant="outline"
                                onClick={handleCopyOnboardingLink}
                                className="shrink-0"
                            >
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Review Link Modal */}
            <Dialog open={!!reviewLinkModal} onOpenChange={(v) => { if (!v) { setReviewLinkModal(null); setCopied(false) } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Revisión creada</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Comparte este enlace con el cliente para que complete su revisión:
                        </p>
                        <div className="flex items-center gap-2">
                            <Input
                                readOnly
                                value={reviewLinkModal?.url ?? ''}
                                className="text-xs font-mono"
                            />
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={handleCopyReviewLink}
                                className="shrink-0"
                            >
                                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
