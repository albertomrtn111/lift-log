'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, CalendarRange, Flag, Loader2, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import {
    archiveSeasonPlan, getSeasonOverview, saveSeasonWeek, saveSeasonWeekTargets, type SeasonTargetChange,
} from '@/app/(coach)/coach/workspace/season-actions'
import type { SeasonEventOption, SeasonOverview, SeasonWeek, SeasonWeekTarget, SeasonWeekType } from '@/types/season'
import { DISCIPLINE_META, dayLabel } from './season-meta'
import { SeasonCreateDialog } from './SeasonCreateDialog'
import { SeasonGrid } from './SeasonGrid'
import { SeasonVolumeChart } from './SeasonVolumeChart'

function applyChanges(overview: SeasonOverview, changes: SeasonTargetChange[]): SeasonOverview {
    const unit = overview.season.primaryUnit
    return {
        ...overview,
        weeks: overview.weeks.map((week) => {
            const weekChanges = changes.filter((change) => change.seasonWeekId === week.id)
            if (!weekChanges.length) return week
            const disciplines = { ...week.disciplines }
            for (const change of weekChanges) {
                const target: SeasonWeekTarget | null = change.value === null ? null : {
                    target_minutes: change.discipline !== 'strength' && unit === 'time' ? change.value : null,
                    target_km: change.discipline !== 'strength' && unit === 'distance' ? change.value : null,
                    target_sessions: change.discipline === 'strength' ? change.value : null,
                }
                disciplines[change.discipline] = { ...disciplines[change.discipline], target }
            }
            return { ...week, disciplines }
        }),
    }
}

export function SeasonTab({ clientId, coachId, onOpenWeek }: {
    clientId: string
    coachId: string
    /** Abre Planificación en la semana indicada (lunes "YYYY-MM-DD") */
    onOpenWeek: (weekStart: string) => void
}) {
    const { toast } = useToast()
    const requestId = useRef(0)
    const [loading, setLoading] = useState(true)
    const [overview, setOverview] = useState<SeasonOverview | null>(null)
    const [events, setEvents] = useState<SeasonEventOption[]>([])
    const [error, setError] = useState<string | null>(null)
    const [confirmArchive, setConfirmArchive] = useState(false)

    const load = useCallback(async () => {
        const id = ++requestId.current
        setLoading(true)
        const result = await getSeasonOverview(clientId, coachId)
        if (id !== requestId.current) return
        if (result.success) {
            setOverview(result.data.overview)
            setEvents(result.data.events)
            setError(null)
        } else {
            setError(result.error)
        }
        setLoading(false)
    }, [clientId, coachId])

    useEffect(() => { load() }, [load])

    const handleTargetsChange = async (changes: SeasonTargetChange[]) => {
        setOverview((current) => current ? applyChanges(current, changes) : current)
        const result = await saveSeasonWeekTargets({ coachId, changes })
        if (!result.success) {
            toast({ title: 'No se guardó el objetivo', description: result.error, variant: 'destructive' })
            load()
        }
    }

    const handleWeekTypeChange = async (week: SeasonWeek, weekType: SeasonWeekType) => {
        setOverview((current) => current ? {
            ...current,
            weeks: current.weeks.map((item) => item.id === week.id ? { ...item, weekType } : item),
        } : current)
        const result = await saveSeasonWeek({ coachId, seasonWeekId: week.id, weekType })
        if (!result.success) {
            toast({ title: 'No se guardó el tipo de semana', description: result.error, variant: 'destructive' })
            load()
        }
    }

    const handleArchive = async () => {
        if (!overview) return
        const result = await archiveSeasonPlan({ coachId, seasonId: overview.season.id })
        setConfirmArchive(false)
        if (!result.success) {
            toast({ title: 'No se pudo archivar', description: result.error, variant: 'destructive' })
            return
        }
        toast({ title: 'Temporada archivada' })
        load()
    }

    if (loading && !overview) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        )
    }

    if (error && !overview) {
        return (
            <Card className="border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={load}>Reintentar</Button>
            </Card>
        )
    }

    if (!overview) {
        return (
            <Card className="border-dashed border-border/70 p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                    <CalendarRange className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold">Sin plan de temporada</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    Decide primero cuánto debe entrenar cada semana por disciplina, con sus descargas, y después rellena las semanas con sesiones en Planificación.
                </p>
                <div className="mt-4">
                    <SeasonCreateDialog clientId={clientId} coachId={coachId} events={events} onCreated={load} />
                </div>
            </Card>
        )
    }

    const { season, weeks } = overview
    const currentWeek = weeks.find((week) => week.timing === 'current')
    const openWeek = (week: SeasonWeek) => onOpenWeek(week.weekStart)

    return (
        <div className="space-y-4 p-0 sm:p-4">
            <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Archivar «{season.name}»?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deja de aparecer en Planificación y podrás crear otra temporada. Las sesiones del calendario no cambian.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleArchive}>Archivar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold leading-tight tracking-tight sm:text-2xl">{season.name}</h2>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground sm:text-sm">
                        <span>{weeks.length} semanas · {dayLabel(season.startDate)} – {dayLabel(season.endDate)}</span>
                        {currentWeek && <span>· vas por la semana {currentWeek.weekNumber}</span>}
                        {season.targetEvent && (
                            <span className="inline-flex items-center gap-1">
                                · <Flag className="h-3 w-3" />{season.targetEvent.title} ({dayLabel(season.targetEvent.eventDate)})
                            </span>
                        )}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {season.disciplines.map((discipline) => {
                            const meta = DISCIPLINE_META[discipline]
                            const Icon = meta.icon
                            return (
                                <span key={discipline} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.chipClass}`}>
                                    <Icon className="h-3 w-3" />{meta.label}
                                </span>
                            )
                        })}
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {season.primaryUnit === 'time' ? 'Objetivo en tiempo' : 'Objetivo en km'}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Opciones de la temporada">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
                                <Archive className="mr-2 h-4 w-4" />Archivar temporada
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <SeasonVolumeChart season={season} weeks={weeks} onOpenWeek={openWeek} />

            <div className="space-y-2">
                <div>
                    <h3 className="font-semibold">Objetivos por semana</h3>
                    <p className="text-xs text-muted-foreground">
                        Escribe el objetivo en {season.primaryUnit === 'time' ? 'horas (3, 3,5 o 3:30)' : 'km'}; la fuerza, en sesiones. Debajo, en color, lo programado y lo hecho
                        (verde dentro del 90-110 %). * Hay sesiones hechas sin duración ni distancia.
                    </p>
                </div>
                <SeasonGrid
                    season={season}
                    weeks={weeks}
                    onTargetsChange={handleTargetsChange}
                    onWeekTypeChange={handleWeekTypeChange}
                    onOpenWeek={openWeek}
                />
            </div>
        </div>
    )
}
