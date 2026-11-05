'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { StudioClientSummary, StudioGroupSummary, StudioProfessional } from '@/data/studio'
import { WEEKDAYS } from '@/lib/studio/group-rules'
import { normalizeText } from '@/lib/studio/grid-rules'
import { archiveGroupAction, mergeGroupsAction, saveGroupAction } from '@/lib/studio/session-actions'

const NO_GROUP = 'none'

/** Crear o gestionar un grupo: nombre, horario, profesionales e integrantes. */
export function StudioGroupPanel({ coachId, group, groups, clients, team, memberIds, onClose, onSaved }: {
    coachId: string
    group: StudioGroupSummary | null
    groups: StudioGroupSummary[]
    clients: StudioClientSummary[]
    team: StudioProfessional[]
    memberIds: string[]
    onClose: () => void
    onSaved: (groupId: string) => void
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [name, setName] = useState(group?.name ?? '')
    const [schedule, setSchedule] = useState<{ weekday: number; time: string }[]>(group?.schedule ?? [])
    const [professionals, setProfessionals] = useState<string[]>(group?.professional_ids ?? [])
    const [members, setMembers] = useState<Set<string>>(new Set(memberIds))
    const [search, setSearch] = useState('')
    const [mergeInto, setMergeInto] = useState(NO_GROUP)

    const shown = useMemo(() => {
        const query = normalizeText(search)
        return clients.filter(client => !query || normalizeText(client.fullName).includes(query))
    }, [clients, search])

    function save() {
        if (!name.trim()) return void toast.error('Ponle un nombre al grupo.')
        startTransition(async () => {
            const result = await saveGroupAction({
                coachId,
                groupId: group?.id ?? null,
                name,
                schedule,
                professionalIds: professionals,
                memberIds: [...members],
            })
            if (!result.success) return void toast.error(result.error)
            router.refresh()
            onSaved(result.data.id)
        })
    }

    function archive() {
        if (!group) return
        startTransition(async () => {
            const result = await archiveGroupAction(group.id, false)
            if (!result.success) return void toast.error(result.error)
            router.push('/coach/sala')
            router.refresh()
        })
    }

    function merge() {
        if (!group || mergeInto === NO_GROUP) return
        startTransition(async () => {
            const result = await mergeGroupsAction(group.id, mergeInto)
            if (!result.success) return void toast.error(result.error)
            router.refresh()
            onSaved(mergeInto)
        })
    }

    const others = groups.filter(entry => entry.id !== group?.id)

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">{group ? group.name : 'Nuevo grupo'}</SheetTitle>
                    <SheetDescription>Una clase con su lista y los valores de cada persona.</SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="grupo-nombre">Nombre</Label>
                        <Input
                            id="grupo-nombre"
                            value={name}
                            maxLength={120}
                            autoComplete="off"
                            placeholder="TEAM martes, Pareja Ana y Luis…"
                            onChange={event => setName(event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <span className="text-sm font-medium">Horario</span>
                        {schedule.map((slot, index) => (
                            <div key={index} className="flex gap-2">
                                <Select
                                    value={String(slot.weekday)}
                                    onValueChange={value => setSchedule(schedule.map((entry, position) => (position === index ? { ...entry, weekday: Number(value) } : entry)))}
                                >
                                    <SelectTrigger aria-label="Día"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {WEEKDAYS.map((day: string, weekday: number) => <SelectItem key={day} value={String(weekday)}>{day}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Input
                                    type="time"
                                    value={slot.time}
                                    aria-label="Hora"
                                    onChange={event => setSchedule(schedule.map((entry, position) => (position === index ? { ...entry, time: event.target.value } : entry)))}
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="shrink-0"
                                    aria-label="Quitar este horario"
                                    onClick={() => setSchedule(schedule.filter((_, position) => position !== index))}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <Button type="button" size="sm" variant="ghost" onClick={() => setSchedule([...schedule, { weekday: 0, time: '18:00' }])}>
                            <Plus className="mr-1 h-3.5 w-3.5" /> Añadir horario
                        </Button>
                    </div>

                    {team.length > 1 && (
                        <div className="space-y-2">
                            <span className="text-sm font-medium">Profesionales</span>
                            {team.map(member => (
                                <label key={member.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={professionals.includes(member.id)}
                                        onCheckedChange={checked => setProfessionals(
                                            checked ? [...professionals, member.id] : professionals.filter(id => id !== member.id)
                                        )}
                                    />
                                    {member.name}
                                </label>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2">
                        <span className="text-sm font-medium">Integrantes ({members.size})</span>
                        <Input
                            value={search}
                            autoComplete="off"
                            aria-label="Buscar cliente"
                            placeholder="Buscar cliente…"
                            onChange={event => setSearch(event.target.value)}
                        />
                        <ul className="max-h-56 space-y-1 overflow-y-auto">
                            {shown.map(client => (
                                <li key={client.id}>
                                    <label className="flex min-h-9 items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={members.has(client.id)}
                                            onCheckedChange={checked => {
                                                const next = new Set(members)
                                                if (checked) next.add(client.id)
                                                else next.delete(client.id)
                                                setMembers(next)
                                            }}
                                        />
                                        {client.fullName}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {group && (
                        <div className="space-y-2 border-t pt-4">
                            {others.length > 0 && (
                                <>
                                    <Label>Unir con otro grupo</Label>
                                    <div className="flex gap-2">
                                        <Select value={mergeInto} onValueChange={setMergeInto}>
                                            <SelectTrigger aria-label="Grupo con el que unir"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NO_GROUP}>Elige un grupo</SelectItem>
                                                {others.map(entry => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" variant="outline" className="shrink-0" disabled={isPending || mergeInto === NO_GROUP} onClick={merge}>Unir</Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Sus sesiones e integrantes pasan al otro y este queda archivado.</p>
                                </>
                            )}
                            <Button type="button" variant="outline" className="w-full" disabled={isPending} onClick={archive}>Archivar grupo</Button>
                        </div>
                    )}
                </div>

                <div className="border-t p-4">
                    <Button type="button" className="w-full" disabled={isPending} onClick={save}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {group ? 'Guardar grupo' : 'Crear grupo'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
