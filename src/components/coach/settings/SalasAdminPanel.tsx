'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    createSalaAction,
    getSalasAction,
    resendSalaInvitationAction,
    type SalaSummary,
} from './salas-admin-actions'

export function SalasAdminPanel() {
    const [salas, setSalas] = useState<SalaSummary[] | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [pending, startTransition] = useTransition()

    const load = useCallback(async () => {
        const result = await getSalasAction()
        if (result.success) {
            setSalas(result.data ?? [])
            setLoadError(null)
        } else {
            setLoadError(result.error)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    function create() {
        startTransition(async () => {
            const result = await createSalaAction({ name, ownerEmail: email })
            if (result.success) {
                toast.success('Sala creada e invitación enviada')
                setName('')
                setEmail('')
            } else {
                toast.error(result.error)
            }
            await load()
        })
    }

    function resend(invitationId: string) {
        startTransition(async () => {
            const result = await resendSalaInvitationAction(invitationId)
            if (result.success) toast.success('Invitación reenviada')
            else toast.error(result.error)
        })
    }

    return (
        <div className="space-y-4">
            <Card className="space-y-4 p-5">
                <div>
                    <h2 className="font-medium">Dar de alta una sala</h2>
                    <p className="text-sm text-muted-foreground">
                        Crea el espacio con el plan Studio de cortesía y envía la invitación a su propietario. Le
                        llegará un email con un enlace que caduca en 7 días.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="sala-name">Nombre de la sala</Label>
                        <Input id="sala-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sala-email">Email del propietario</Label>
                        <Input id="sala-email" type="email" value={email} onChange={event => setEmail(event.target.value)} />
                    </div>
                </div>
                <Button disabled={pending || name.trim().length < 2 || !email.trim()} onClick={create}>
                    {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Crear sala e invitar
                </Button>
            </Card>

            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {salas && salas.length > 0 && (
                <Card className="divide-y divide-border">
                    {salas.map(sala => (
                        <div key={sala.coachId} className="flex items-center gap-3 p-4">
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-medium">{sala.name}</p>
                                {sala.invitedEmail && (
                                    <p className="break-words text-xs text-muted-foreground">{sala.invitedEmail}</p>
                                )}
                            </div>
                            <Badge variant={sala.ownerActive ? 'default' : 'secondary'}>
                                {sala.ownerActive ? 'Activa' : 'Pendiente'}
                            </Badge>
                            {sala.invitationId && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    disabled={pending}
                                    aria-label={`Reenviar la invitación de ${sala.name}`}
                                    onClick={() => resend(sala.invitationId as string)}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </Card>
            )}
        </div>
    )
}
