'use client'

import { FormEvent, useMemo, useState, useTransition } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    CalendarPlus,
    CheckCircle2,
    CircleDot,
    Flag,
    MapPin,
    MoreHorizontal,
    Pencil,
    Target,
    Trash2,
    Trophy,
    XCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { parseLocalDate } from '@/lib/date-utils'
import type { ClientEvent, ClientEventPriority, ClientEventStatus, ClientEventType } from '@/data/workspace'
import {
    createClientEventAction,
    deleteClientEventAction,
    updateClientEventAction,
} from './event-actions'

interface EventsTabProps {
    coachId: string
    clientId: string
    events: ClientEvent[]
    onRefresh: () => void
}

type EventFormState = {
    title: string
    eventDate: string
    eventType: ClientEventType
    status: ClientEventStatus
    priority: ClientEventPriority
    location: string
    target: string
    notes: string
}

const eventTypeLabels: Record<ClientEventType, string> = {
    race: 'Carrera',
    test: 'Test',
    camp: 'Concentración',
    other: 'Otro',
}

const eventStatusLabels: Record<ClientEventStatus, string> = {
    planned: 'Planificado',
    completed: 'Completado',
    cancelled: 'Cancelado',
}

const priorityLabels: Record<ClientEventPriority, string> = {
    a: 'A',
    b: 'B',
    c: 'C',
}

function toLocalDateInputValue(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDaysUntil(eventDate: string) {
    const today = startOfLocalDay(new Date())
    const date = startOfLocalDay(parseLocalDate(eventDate))
    return Math.round((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function formatDaysUntil(days: number) {
    if (days === 0) return 'Hoy'
    if (days === 1) return 'Mañana'
    if (days > 1) return `${days} días`
    if (days === -1) return 'Ayer'
    return `Hace ${Math.abs(days)} días`
}

function createEmptyForm(): EventFormState {
    return {
        title: '',
        eventDate: toLocalDateInputValue(new Date()),
        eventType: 'race',
        status: 'planned',
        priority: 'b',
        location: '',
        target: '',
        notes: '',
    }
}

function formFromEvent(event: ClientEvent): EventFormState {
    return {
        title: event.title,
        eventDate: event.event_date,
        eventType: event.event_type,
        status: event.status,
        priority: event.priority,
        location: event.location ?? '',
        target: event.target ?? '',
        notes: event.notes ?? '',
    }
}

function EventDateTile({ eventDate }: { eventDate: string }) {
    const date = parseLocalDate(eventDate)

    return (
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border bg-muted/45">
            <span className="text-lg font-bold leading-none">{format(date, 'dd')}</span>
            <span className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">
                {format(date, 'MMM', { locale: es }).replace('.', '')}
            </span>
        </div>
    )
}

function StatusBadge({ status }: { status: ClientEventStatus }) {
    if (status === 'completed') {
        return <Badge className="border-0 bg-emerald-500/10 text-emerald-600">Completado</Badge>
    }

    if (status === 'cancelled') {
        return <Badge className="border-0 bg-muted text-muted-foreground">Cancelado</Badge>
    }

    return <Badge className="border-0 bg-primary/10 text-primary">Planificado</Badge>
}

function PriorityBadge({ priority }: { priority: ClientEventPriority }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                'px-2 py-0 text-[10px]',
                priority === 'a' && 'border-rose-500/30 text-rose-500',
                priority === 'b' && 'border-blue-500/30 text-blue-500',
                priority === 'c' && 'border-muted-foreground/25 text-muted-foreground'
            )}
        >
            Objetivo {priorityLabels[priority]}
        </Badge>
    )
}

function EventCard({
    event,
    onEdit,
    onDelete,
    deleting,
}: {
    event: ClientEvent
    onEdit: (event: ClientEvent) => void
    onDelete: (event: ClientEvent) => void
    deleting: boolean
}) {
    const daysUntil = getDaysUntil(event.event_date)
    const isInactive = event.status === 'completed' || event.status === 'cancelled'

    return (
        <Card className={cn('p-4 transition-colors', isInactive && 'bg-muted/25')}>
            <div className="flex gap-4">
                <EventDateTile eventDate={event.event_date} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-semibold sm:text-base">{event.title}</h3>
                                <PriorityBadge priority={event.priority} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                    <Trophy className="h-3.5 w-3.5" />
                                    {eventTypeLabels[event.event_type]}
                                </span>
                                {event.location && (
                                    <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {event.location}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <StatusBadge status={event.status} />
                            <span className={cn(
                                'min-w-[4.75rem] text-right text-xs font-semibold',
                                daysUntil < 0 ? 'text-muted-foreground' : 'text-primary'
                            )}>
                                {formatDaysUntil(daysUntil)}
                            </span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onEdit(event)}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => onDelete(event)}
                                        disabled={deleting}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {(event.target || event.notes) && (
                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            {event.target && (
                                <div className="rounded-lg bg-muted/40 px-3 py-2">
                                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        <Target className="h-3 w-3" />
                                        Objetivo
                                    </p>
                                    <p className="mt-1 text-sm">{event.target}</p>
                                </div>
                            )}
                            {event.notes && (
                                <div className="rounded-lg bg-muted/40 px-3 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        Notas
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-sm">{event.notes}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

export function EventsTab({ coachId, clientId, events, onRefresh }: EventsTabProps) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingEvent, setEditingEvent] = useState<ClientEvent | null>(null)
    const [form, setForm] = useState<EventFormState>(createEmptyForm)

    const { upcomingEvents, pastEvents, nextEvent, mainObjectives } = useMemo(() => {
        const upcoming = events.filter(event => event.status === 'planned' && getDaysUntil(event.event_date) >= 0)
        const past = events.filter(event => event.status !== 'planned' || getDaysUntil(event.event_date) < 0)

        return {
            upcomingEvents: upcoming,
            pastEvents: past.slice().reverse(),
            nextEvent: upcoming[0] ?? null,
            mainObjectives: upcoming.filter(event => event.priority === 'a').length,
        }
    }, [events])

    const openCreateDialog = () => {
        setEditingEvent(null)
        setForm(createEmptyForm())
        setDialogOpen(true)
    }

    const openEditDialog = (event: ClientEvent) => {
        setEditingEvent(event)
        setForm(formFromEvent(event))
        setDialogOpen(true)
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        startTransition(async () => {
            const payload = {
                coachId,
                clientId,
                title: form.title,
                eventDate: form.eventDate,
                eventType: form.eventType,
                status: form.status,
                priority: form.priority,
                location: form.location,
                target: form.target,
                notes: form.notes,
            }

            const result = editingEvent
                ? await updateClientEventAction(editingEvent.id, payload)
                : await createClientEventAction(payload)

            if (result.success) {
                toast({
                    title: editingEvent ? 'Evento actualizado' : 'Evento creado',
                    description: editingEvent ? 'Los cambios se han guardado correctamente.' : 'Ya aparece en el workspace del atleta.',
                })
                setDialogOpen(false)
                onRefresh()
            } else {
                toast({
                    title: 'No se pudo guardar',
                    description: result.error,
                    variant: 'destructive',
                })
            }
        })
    }

    const handleDelete = (event: ClientEvent) => {
        startTransition(async () => {
            const result = await deleteClientEventAction(coachId, clientId, event.id)
            if (result.success) {
                toast({ title: 'Evento eliminado', description: 'El evento se ha quitado del calendario del atleta.' })
                onRefresh()
            } else {
                toast({ title: 'No se pudo eliminar', description: result.error, variant: 'destructive' })
            }
        })
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Eventos y carreras</h2>
                    <p className="text-sm text-muted-foreground">
                        Objetivos de competición, tests importantes y fechas que condicionan la planificación.
                    </p>
                </div>
                <Button onClick={openCreateDialog} className="gap-2">
                    <CalendarPlus className="h-4 w-4" />
                    Crear evento
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Próximo evento</p>
                    <p className="mt-2 text-lg font-semibold">{nextEvent ? nextEvent.title : 'Sin fecha'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {nextEvent ? formatDaysUntil(getDaysUntil(nextEvent.event_date)) : 'Crea una carrera o test objetivo'}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Eventos futuros</p>
                    <p className="mt-2 text-lg font-semibold">{upcomingEvents.length}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Planificados para este atleta</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Objetivos A</p>
                    <p className="mt-2 text-lg font-semibold">{mainObjectives}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Fechas clave de mayor prioridad</p>
                </Card>
            </div>

            {events.length === 0 ? (
                <Card className="p-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Flag className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 font-semibold">Sin eventos todavía</h3>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                        Añade la carrera objetivo, un test de rendimiento o una fecha límite para que la planificación tenga contexto.
                    </p>
                    <Button onClick={openCreateDialog} className="mt-4 gap-2">
                        <CalendarPlus className="h-4 w-4" />
                        Crear primer evento
                    </Button>
                </Card>
            ) : (
                <div className="space-y-6">
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <CircleDot className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">Próximos eventos</h3>
                            <Badge variant="secondary">{upcomingEvents.length}</Badge>
                        </div>
                        {upcomingEvents.length > 0 ? (
                            <div className="space-y-3">
                                {upcomingEvents.map(event => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        onEdit={openEditDialog}
                                        onDelete={handleDelete}
                                        deleting={isPending}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Card className="p-6 text-center text-sm text-muted-foreground">
                                No hay eventos futuros planificados.
                            </Card>
                        )}
                    </section>

                    {pastEvents.length > 0 && (
                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold">Historial</h3>
                                <Badge variant="secondary">{pastEvents.length}</Badge>
                            </div>
                            <div className="space-y-3">
                                {pastEvents.map(event => (
                                    <EventCard
                                        key={event.id}
                                        event={event}
                                        onEdit={openEditDialog}
                                        onDelete={handleDelete}
                                        deleting={isPending}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingEvent ? 'Editar evento' : 'Crear evento'}</DialogTitle>
                        <DialogDescription>
                            Registra carreras, tests o fechas importantes que deben orientar la planificación.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="space-y-2 sm:col-span-2">
                                <span className="text-sm font-medium">Nombre del evento</span>
                                <Input
                                    value={form.title}
                                    onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                                    placeholder="10K Ciudad de México"
                                    required
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Fecha</span>
                                <Input
                                    type="date"
                                    value={form.eventDate}
                                    onChange={event => setForm(prev => ({ ...prev, eventDate: event.target.value }))}
                                    required
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Tipo</span>
                                <Select
                                    value={form.eventType}
                                    onValueChange={(value: ClientEventType) => setForm(prev => ({ ...prev, eventType: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="race">Carrera</SelectItem>
                                        <SelectItem value="test">Test</SelectItem>
                                        <SelectItem value="camp">Concentración</SelectItem>
                                        <SelectItem value="other">Otro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Prioridad</span>
                                <Select
                                    value={form.priority}
                                    onValueChange={(value: ClientEventPriority) => setForm(prev => ({ ...prev, priority: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="a">Objetivo A</SelectItem>
                                        <SelectItem value="b">Objetivo B</SelectItem>
                                        <SelectItem value="c">Objetivo C</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Estado</span>
                                <Select
                                    value={form.status}
                                    onValueChange={(value: ClientEventStatus) => setForm(prev => ({ ...prev, status: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="planned">Planificado</SelectItem>
                                        <SelectItem value="completed">Completado</SelectItem>
                                        <SelectItem value="cancelled">Cancelado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Ubicación</span>
                                <Input
                                    value={form.location}
                                    onChange={event => setForm(prev => ({ ...prev, location: event.target.value }))}
                                    placeholder="Madrid"
                                />
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm font-medium">Objetivo</span>
                                <Input
                                    value={form.target}
                                    onChange={event => setForm(prev => ({ ...prev, target: event.target.value }))}
                                    placeholder="Sub 45 min, acabar fuerte..."
                                />
                            </label>

                            <label className="space-y-2 sm:col-span-2">
                                <span className="text-sm font-medium">Notas</span>
                                <Textarea
                                    value={form.notes}
                                    onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                                    placeholder="Detalles logísticos, estrategia, referencias de ritmo o ajustes del taper."
                                />
                            </label>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isPending} className="gap-2">
                                {form.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : form.status === 'cancelled' ? <XCircle className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                                {isPending ? 'Guardando...' : editingEvent ? 'Guardar cambios' : 'Crear evento'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
