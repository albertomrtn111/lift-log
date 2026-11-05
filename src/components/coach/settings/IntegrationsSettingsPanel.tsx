'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
    connectAgendaAction,
    disconnectAgendaAction,
    getIntegrationsAction,
    mapStaffAction,
    updateServiceAction,
    type IntegrationsData,
} from '@/components/coach/settings/integrations-actions'

const KINDS = { training: 'Entrenamiento', physio: 'Fisioterapia', online: 'Online', none: 'No es sesión' }
const GROUP_MODES = { auto: 'Clase si coinciden', individual: 'Siempre individual', shared: 'Siempre compartida' }
const NO_ONE = 'none'

/** Conecta la agenda del centro. Los datos solo bajan: NexTrain nunca escribe en ella. */
export function IntegrationsSettingsPanel() {
    const [data, setData] = useState<IntegrationsData | null>(null)
    const [token, setToken] = useState('')
    const [isPending, startTransition] = useTransition()

    const load = useCallback(async () => {
        const result = await getIntegrationsAction()
        if (result.success) setData(result.data)
        else toast.error(result.error)
    }, [])

    useEffect(() => { void load() }, [load])

    function run(action: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
        startTransition(async () => {
            const result = await action()
            if (!result.success) return void toast.error(result.error)
            after?.()
            await load()
        })
    }

    if (!data) {
        return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
    }

    const connected = data.connection && data.connection.status !== 'disconnected'

    return (
        <div className="space-y-4">
            <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h2 className="font-semibold">FisioTrack</h2>
                        <p className="text-sm text-muted-foreground">Las citas bajan a NexTrain y crean las sesiones de sala.</p>
                    </div>
                    <Badge variant={data.connection?.status === 'active' ? 'default' : 'secondary'}>
                        {data.connection?.status === 'active' ? 'Conectada' : data.connection?.status === 'error' ? 'Con error' : 'Sin conectar'}
                    </Badge>
                </div>
                {data.connection?.last_error && <p className="text-sm text-destructive">{data.connection.last_error}</p>}
                {data.connection?.last_sync_at && (
                    <p className="text-xs text-muted-foreground">Última sincronización: {new Date(data.connection.last_sync_at).toLocaleString('es-ES')}</p>
                )}
                <div className="space-y-1.5">
                    <Label htmlFor="agenda-token">{connected ? 'Cambiar el token' : 'Token de solo lectura'}</Label>
                    <Input
                        id="agenda-token"
                        type="password"
                        value={token}
                        autoComplete="off"
                        placeholder="FisioTrack → Settings → API, permiso Read"
                        onChange={event => setToken(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Se guarda cifrado y no se puede volver a ver.</p>
                </div>
                <div className="flex gap-2">
                    <Button disabled={isPending || !token.trim()} onClick={() => run(() => connectAgendaAction(data.coachId, token), () => setToken(''))}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Conectar
                    </Button>
                    {connected && (
                        <Button variant="outline" disabled={isPending} onClick={() => run(() => disconnectAgendaAction(data.coachId))}>
                            Desconectar
                        </Button>
                    )}
                </div>
            </Card>

            {data.staff.length > 0 && (
                <Card className="space-y-3 p-4">
                    <h2 className="font-semibold">Profesionales</h2>
                    {data.staff.map(member => (
                        <div key={member.external_id} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-sm">{member.external_name}</span>
                            <Select
                                value={member.user_id ?? NO_ONE}
                                disabled={isPending}
                                onValueChange={value => run(() => mapStaffAction(data.coachId, member.external_id, value === NO_ONE ? null : value))}
                            >
                                <SelectTrigger className="w-48" aria-label={`Miembro del equipo para ${member.external_name}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_ONE}>Sin asociar</SelectItem>
                                    {data.team.map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    ))}
                </Card>
            )}

            {data.services.length > 0 && (
                <Card className="space-y-3 p-4">
                    <h2 className="font-semibold">Servicios</h2>
                    <p className="text-sm text-muted-foreground">Elige cuáles crean sesión y cuándo son una clase.</p>
                    {data.services.map(service => (
                        <div key={service.id} className="grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_9rem_11rem_auto] sm:items-center">
                            <span className="min-w-0 truncate text-sm font-medium">{service.name}</span>
                            <Select
                                value={service.kind}
                                disabled={isPending}
                                onValueChange={kind => run(() => updateServiceAction(service.id, kind, service.group_mode, service.creates_session))}
                            >
                                <SelectTrigger aria-label={`Tipo de ${service.name}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(KINDS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select
                                value={service.group_mode}
                                disabled={isPending}
                                onValueChange={mode => run(() => updateServiceAction(service.id, service.kind, mode, service.creates_session))}
                            >
                                <SelectTrigger aria-label={`Modo de grupo de ${service.name}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(GROUP_MODES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <label className="flex items-center gap-2 text-sm">
                                <Switch
                                    checked={service.creates_session}
                                    disabled={isPending}
                                    aria-label={`${service.name} crea sesión`}
                                    onCheckedChange={creates => run(() => updateServiceAction(service.id, service.kind, service.group_mode, creates))}
                                />
                                Crea sesión
                            </label>
                        </div>
                    ))}
                </Card>
            )}
        </div>
    )
}
