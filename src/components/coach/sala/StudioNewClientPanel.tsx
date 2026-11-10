'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
    adoptClientAction,
    createStudioClientAction,
    type StudioPatientMatch,
    type StudioPersonMatch,
} from '@/lib/studio/client-actions'
import { duplicateText } from '@/lib/studio/client-rules'

/** Alta de un cliente en la sala. Antes de crear, avisa si ya existe alguien parecido. */
export function StudioNewClientPanel({ coachId, initialName, patient, onClose, onDone }: {
    coachId: string
    initialName: string
    /** Si viene de FisioTrack, se crea con sus datos y queda vinculado. */
    patient: StudioPatientMatch | null
    onClose: () => void
    onDone: (clientId: string) => void
}) {
    const [isPending, startTransition] = useTransition()
    const [fullName, setFullName] = useState(patient?.full_name ?? initialName)
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [birthday, setBirthday] = useState(patient?.birth_date ?? '')
    const [matches, setMatches] = useState<StudioPersonMatch[] | null>(null)

    function create(force: boolean) {
        if (fullName.trim().length < 2) return void toast.error('Escribe el nombre y los apellidos.')
        startTransition(async () => {
            const result = await createStudioClientAction({
                coachId,
                fullName,
                email,
                phone,
                birthday,
                patientId: patient?.id ?? null,
                force,
            })
            if (!result.success) return void toast.error(result.error)
            if (result.data.status === 'duplicates') return setMatches(result.data.matches)
            toast.success(result.data.status === 'linked' ? 'Ya tenía ficha: la abro.' : 'Cliente dado de alta.')
            onDone(result.data.client_id)
        })
    }

    function adopt(match: StudioPersonMatch) {
        startTransition(async () => {
            const result = await adoptClientAction(match.id)
            if (!result.success) return void toast.error(result.error)
            toast.success(match.active ? `${match.full_name} ya existía: lo abro.` : `${match.full_name} vuelve a estar activo.`)
            onDone(match.id)
        })
    }

    return (
        <Sheet open onOpenChange={open => { if (!open && !isPending) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">{patient ? 'Alta desde FisioTrack' : 'Nuevo cliente'}</SheetTitle>
                    <SheetDescription>
                        {patient ? 'Se crea con sus datos y queda vinculado con su ficha de FisioTrack.' : 'Se busca antes si ya existe para no duplicarlo.'}
                    </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {matches && (
                        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                            <p className="text-sm font-medium">
                                {matches.length === 1 ? 'Ya hay alguien parecido. ¿Es esta persona?' : 'Ya hay personas parecidas. ¿Es alguna de ellas?'}
                            </p>
                            {matches.map(match => (
                                <div key={match.id} className="flex items-center justify-between gap-2 rounded-md bg-background/60 p-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{match.full_name}</p>
                                        <p className="text-xs text-muted-foreground">{duplicateText(match)}</p>
                                    </div>
                                    <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={isPending} onClick={() => adopt(match)}>
                                        {match.active ? 'Es esta' : 'Reactivar'}
                                    </Button>
                                </div>
                            ))}
                            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => create(true)}>
                                No, es otra persona: crear igualmente
                            </Button>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="sala-new-name">Nombre y apellidos</Label>
                        <Input id="sala-new-name" value={fullName} autoComplete="off" maxLength={120} onChange={event => { setFullName(event.target.value); setMatches(null) }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="sala-new-email">Email</Label>
                            <Input id="sala-new-email" type="email" value={email} autoComplete="off" placeholder="Opcional" onChange={event => { setEmail(event.target.value); setMatches(null) }} />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <Label htmlFor="sala-new-phone">Teléfono</Label>
                            <Input id="sala-new-phone" type="tel" value={phone} autoComplete="off" placeholder="Opcional" onChange={event => { setPhone(event.target.value); setMatches(null) }} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="sala-new-birthday">Fecha de nacimiento</Label>
                        <Input id="sala-new-birthday" type="date" value={birthday} onChange={event => setBirthday(event.target.value)} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Entra activo en la sala, sin invitación a la app. Si lo das de alta tú, queda en tu lista.
                    </p>
                </div>
                <div className="flex items-center gap-2 border-t p-4">
                    <Button type="button" className="flex-1" disabled={isPending} onClick={() => create(false)}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Dar de alta
                    </Button>
                    <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>Cancelar</Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
