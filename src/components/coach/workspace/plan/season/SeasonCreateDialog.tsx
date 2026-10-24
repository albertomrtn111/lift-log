'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { createSeasonPlan } from '@/app/(coach)/coach/workspace/season-actions'
import { addDays, measureFor, mondayOf, parseTargetInput, weekCountBetween } from '@/lib/season/volume'
import type { SeasonDiscipline, SeasonEventOption, SeasonUnit } from '@/types/season'
import { DISCIPLINE_META, dayLabel } from './season-meta'

const ALL_DISCIPLINES: SeasonDiscipline[] = ['run', 'bike', 'swim', 'strength', 'other']
const UNIT_SUFFIX = { minutes: 'h', km: 'km', sessions: 'ses' } as const

function todayLocal() {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function SeasonCreateDialog({ clientId, coachId, events, onCreated }: {
    clientId: string
    coachId: string
    events: SeasonEventOption[]
    onCreated: () => void | Promise<void>
}) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [eventId, setEventId] = useState<string>('none')
    const [startDate, setStartDate] = useState(() => addDays(mondayOf(todayLocal()), 7))
    const [weeks, setWeeks] = useState('16')
    const [unit, setUnit] = useState<SeasonUnit>('time')
    const [disciplines, setDisciplines] = useState<SeasonDiscipline[]>(['run', 'bike', 'swim', 'strength'])
    const [base, setBase] = useState<Partial<Record<SeasonDiscipline, string>>>({})
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const event = events.find((item) => item.id === eventId) ?? null
    const monday = startDate ? mondayOf(startDate) : ''

    const chooseEvent = (value: string) => {
        setEventId(value)
        const chosen = events.find((item) => item.id === value)
        if (!chosen) return
        if (!name.trim()) setName(chosen.title)
        // La temporada termina en la semana de la carrera
        if (monday && chosen.eventDate >= monday) setWeeks(String(weekCountBetween(monday, chosen.eventDate)))
    }

    const toggleDiscipline = (discipline: SeasonDiscipline) => {
        setDisciplines((current) => current.includes(discipline)
            ? current.filter((item) => item !== discipline)
            : ALL_DISCIPLINES.filter((item) => item === discipline || current.includes(item)))
    }

    const parsedBase = useMemo(() => Object.fromEntries(disciplines.map((discipline) => [
        discipline,
        parseTargetInput(base[discipline] ?? '', measureFor(discipline, unit)),
    ])) as Record<SeasonDiscipline, number | null>, [base, disciplines, unit])

    const submit = async () => {
        setError(null)
        const weekCount = Number(weeks)
        if (!monday) return setError('Elige la fecha de inicio.')
        if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 60) return setError('La temporada tiene entre 1 y 60 semanas.')
        if (!disciplines.length) return setError('Elige al menos una disciplina.')
        const invalid = disciplines.find((discipline) => Number.isNaN(parsedBase[discipline]))
        if (invalid) return setError(`Revisa el volumen de ${DISCIPLINE_META[invalid].label.toLowerCase()}.`)

        setSaving(true)
        const result = await createSeasonPlan({
            coachId,
            clientId,
            name: name.trim() || (event ? event.title : 'Temporada'),
            startDate: monday,
            weeks: weekCount,
            primaryUnit: unit,
            disciplines,
            targetEventId: event?.id ?? null,
            baseTargets: Object.fromEntries(disciplines
                .filter((discipline) => (parsedBase[discipline] ?? 0) > 0)
                .map((discipline) => [discipline, parsedBase[discipline]!])),
        })
        setSaving(false)
        if (!result.success) return setError(result.error)
        toast({ title: 'Temporada creada', description: `${weekCount} semanas desde el ${dayLabel(monday)}.` })
        setOpen(false)
        await onCreated()
    }

    const weekCount = Number(weeks)
    const endLabel = monday && Number.isInteger(weekCount) && weekCount > 0 ? dayLabel(addDays(monday, weekCount * 7 - 1)) : null

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="rounded-full"><Plus className="mr-1 h-4 w-4" />Crear temporada</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Nueva temporada</DialogTitle>
                    <DialogDescription>
                        Define el volumen por semana y disciplina antes de crear sesiones. Luego podrás ajustar cada semana en la rejilla.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {events.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Carrera objetivo</Label>
                            <Select value={eventId} onValueChange={chooseEvent}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin carrera</SelectItem>
                                    {events.map((item) => (
                                        <SelectItem key={item.id} value={item.id}>{item.title} · {dayLabel(item.eventDate)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="season-name">Nombre</Label>
                        <Input id="season-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Triatlón olímpico" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="season-start">Inicio</Label>
                            <Input id="season-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                            {monday && monday !== startDate && (
                                <p className="text-xs text-muted-foreground">Empieza el lunes {dayLabel(monday)}.</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="season-weeks">Semanas</Label>
                            <Input id="season-weeks" type="number" min={1} max={60} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
                            {endLabel && <p className="text-xs text-muted-foreground">Termina el {endLabel}.</p>}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Unidad principal</Label>
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                            {([['time', 'Tiempo'], ['distance', 'Distancia']] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setUnit(value)}
                                    className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-all', unit === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {unit === 'time'
                                ? 'El tiempo es lo único comparable entre nadar, bici y correr.'
                                : 'Para planes solo de carrera. La fuerza se mide siempre en sesiones.'}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Disciplinas y volumen de la semana 1</Label>
                        <p className="text-xs text-muted-foreground">
                            El volumen es opcional: se copia a todas las semanas y después ajustas descargas y progresión en la rejilla.
                        </p>
                        <div className="space-y-2">
                            {ALL_DISCIPLINES.map((discipline) => {
                                const meta = DISCIPLINE_META[discipline]
                                const Icon = meta.icon
                                const active = disciplines.includes(discipline)
                                const measure = measureFor(discipline, unit)
                                return (
                                    <div key={discipline} className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => toggleDiscipline(discipline)}
                                            className={cn(
                                                'flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                                                active ? cn('border-transparent', meta.chipClass) : 'border-border text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{meta.label}</span>
                                        </button>
                                        <div className="relative w-28 shrink-0">
                                            <Input
                                                aria-label={`Volumen semanal de ${meta.label}`}
                                                inputMode="decimal"
                                                disabled={!active}
                                                value={base[discipline] ?? ''}
                                                onChange={(e) => setBase((current) => ({ ...current, [discipline]: e.target.value }))}
                                                placeholder={measure === 'minutes' ? '3:30' : measure === 'km' ? '40' : '2'}
                                                className={cn('pr-9 text-right tabular-nums', active && Number.isNaN(parsedBase[discipline]) && 'border-destructive')}
                                            />
                                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{UNIT_SUFFIX[measure]}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Crear temporada
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
