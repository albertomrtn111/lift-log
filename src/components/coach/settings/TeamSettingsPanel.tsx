'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2, MailPlus, RefreshCw, Trash2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { INVITABLE_ROLES, ROLE_LABELS } from '@/lib/team/team-rules'
import {
    changeMemberRoleAction,
    getTeamAction,
    inviteMemberAction,
    removeMemberAction,
    resendInvitationAction,
    revokeInvitationAction,
    type TeamData,
} from './team-actions'

const roleLabel = (role: string) => ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role

export function TeamSettingsPanel() {
    const [team, setTeam] = useState<TeamData | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<string>('coach')
    const [pending, startTransition] = useTransition()

    const load = useCallback(async () => {
        const result = await getTeamAction()
        if (result.success && result.team) {
            setTeam(result.team)
            setLoadError(null)
        } else {
            setLoadError(result.error ?? 'No se pudo cargar el equipo')
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const run = (action: () => Promise<{ success: boolean; error?: string }>, done: string, onDone?: () => void) => {
        startTransition(async () => {
            const result = await action()
            if (!result.success) {
                toast.error(result.error ?? 'No se pudo completar')
                return
            }
            toast.success(done)
            onDone?.()
            await load()
        })
    }

    if (loadError) {
        return <Card className="p-5 text-sm text-muted-foreground">{loadError}</Card>
    }

    if (!team) {
        return (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando el equipo…
            </Card>
        )
    }

    if (!team.enabled) {
        return (
            <Card className="space-y-2 p-5">
                <div className="flex items-center gap-2 font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    Trabaja en equipo
                </div>
                <p className="text-sm text-muted-foreground">
                    El equipo está incluido en el plan Studio. Con él puedes invitar a otros profesionales a tu espacio.
                </p>
            </Card>
        )
    }

    const noSeats = team.seats === 0

    return (
        <div className="space-y-4">
            {team.canManage && (
                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-medium">Invitar al equipo</h2>
                        <p className="text-sm text-muted-foreground">
                            Le llegará un email con un enlace que caduca en 7 días.
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="team-email">Email</Label>
                            <Input
                                id="team-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="nombre@centro.com"
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Rol</Label>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger aria-label="Rol">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INVITABLE_ROLES.map((item) => (
                                        <SelectItem key={item} value={item}>{roleLabel(item)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            disabled={pending || !email.trim() || noSeats}
                            onClick={() => run(
                                () => inviteMemberAction({ email, role }),
                                'Invitación enviada',
                                () => setEmail(''),
                            )}
                        >
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailPlus className="mr-2 h-4 w-4" />}
                            Invitar
                        </Button>
                    </div>
                    {noSeats && <p className="text-sm text-muted-foreground">Tu plan no admite más miembros.</p>}
                </Card>
            )}

            {team.invitations.length > 0 && (
                <Card className="divide-y divide-border">
                    <h2 className="p-5 font-medium">Invitaciones pendientes</h2>
                    {team.invitations.map((invitation) => (
                        <div key={invitation.id} className="flex flex-wrap items-center gap-3 p-4">
                            <div className="min-w-0 flex-1">
                                <p className="break-all text-sm font-medium">{invitation.email}</p>
                                <p className="text-xs text-muted-foreground">{roleLabel(invitation.role)}</p>
                            </div>
                            {invitation.state === 'expired' && <Badge variant="outline">Caducada</Badge>}
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                onClick={() => run(() => resendInvitationAction(invitation.id), 'Invitación reenviada')}
                            >
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                Reenviar
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                onClick={() => run(() => revokeInvitationAction(invitation.id), 'Invitación cancelada')}
                            >
                                <X className="mr-1.5 h-3.5 w-3.5" />
                                Cancelar
                            </Button>
                        </div>
                    ))}
                </Card>
            )}

            <Card className="divide-y divide-border">
                <h2 className="p-5 font-medium">Equipo</h2>
                {team.members.map((member) => (
                    <div key={member.userId} className="flex flex-wrap items-center gap-3 p-4">
                        <div className="min-w-0 flex-1">
                            <p className="break-all text-sm font-medium">
                                {member.name}
                                {member.isYou && <span className="text-muted-foreground"> (tú)</span>}
                            </p>
                            {member.email !== member.name && (
                                <p className="break-all text-xs text-muted-foreground">{member.email}</p>
                            )}
                        </div>
                        {member.canChange ? (
                            <>
                                <Select
                                    value={member.role}
                                    disabled={pending}
                                    onValueChange={(value) => run(
                                        () => changeMemberRoleAction({ userId: member.userId, role: value }),
                                        'Rol cambiado',
                                    )}
                                >
                                    <SelectTrigger className="w-[160px]" aria-label={`Rol de ${member.name}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {INVITABLE_ROLES.map((item) => (
                                            <SelectItem key={item} value={item}>{roleLabel(item)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={pending}
                                    aria-label={`Quitar a ${member.name}`}
                                    onClick={() => {
                                        if (!window.confirm(`¿Quitar a ${member.name} del equipo?`)) return
                                        run(() => removeMemberAction(member.userId), 'Miembro quitado')
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                        )}
                    </div>
                ))}
            </Card>
        </div>
    )
}
