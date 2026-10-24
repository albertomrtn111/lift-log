'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Copy, MoreHorizontal, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
    deviationStatus, formatAmount, measureFor, parseTargetInput, targetAmount, targetInputValue,
} from '@/lib/season/volume'
import type { SeasonTargetChange } from '@/app/(coach)/coach/workspace/season-actions'
import type { SeasonDiscipline, SeasonMeasure, SeasonPlan, SeasonWeek, SeasonWeekType } from '@/types/season'
import { DEVIATION_TEXT, DISCIPLINE_META, WEEK_TYPES, WEEK_TYPE_META, dayLabel } from './season-meta'

const UNIT_SUFFIX: Record<SeasonMeasure, string> = { minutes: 'h', km: 'km', sessions: 'ses' }

function TargetCell({ value, measure, label, onSave }: {
    value: number | null
    measure: SeasonMeasure
    label: string
    onSave: (value: number | null) => void
}) {
    const [text, setText] = useState(() => targetInputValue(value, measure))
    useEffect(() => { setText(targetInputValue(value, measure)) }, [value, measure])
    const parsed = parseTargetInput(text, measure)
    const invalid = Number.isNaN(parsed)

    const commit = () => {
        if (invalid) { setText(targetInputValue(value, measure)); return }
        if (parsed !== value) onSave(parsed)
    }

    return (
        <div className="relative">
            <Input
                aria-label={label}
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') { setText(targetInputValue(value, measure)); (e.target as HTMLInputElement).blur() }
                }}
                placeholder="—"
                className={cn('h-8 pr-8 text-right text-sm font-semibold tabular-nums', invalid && 'border-destructive')}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{UNIT_SUFFIX[measure]}</span>
        </div>
    )
}

function CellReading({ week, discipline, measure }: { week: SeasonWeek; discipline: SeasonDiscipline; measure: SeasonMeasure }) {
    const cell = week.disciplines[discipline]
    const target = targetAmount(cell.target, measure)
    const planned = cell.planned[measure]
    const done = cell.done[measure]
    const plannedStatus = deviationStatus(target, planned)
    const doneStatus = deviationStatus(planned || target, done)

    return (
        <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
            {/* En el futuro, sin sesiones todavía no es un error: aún hay tiempo para rellenarla */}
            <p
                className={cn('truncate', week.timing === 'future' && plannedStatus === 'empty' ? 'text-muted-foreground' : DEVIATION_TEXT[plannedStatus])}
                title="Programado en el calendario"
            >
                {plannedStatus === 'empty' ? (week.timing === 'future' ? 'Sin sesiones aún' : 'Sin planificar') : `Prog. ${formatAmount(planned, measure)}`}
            </p>
            {week.timing !== 'future' && (
                <p
                    className={cn('truncate', week.timing === 'current' ? 'text-muted-foreground' : DEVIATION_TEXT[doneStatus])}
                    title={cell.doneMissingData ? `${cell.doneMissingData} sesión(es) hechas sin duración ni distancia` : 'Realizado'}
                >
                    Hecho {formatAmount(done, measure)}{week.timing === 'current' ? ' (en curso)' : ''}{cell.doneMissingData ? ' *' : ''}
                </p>
            )}
        </div>
    )
}

export function SeasonGrid({ season, weeks, onTargetsChange, onWeekTypeChange, onOpenWeek }: {
    season: SeasonPlan
    weeks: SeasonWeek[]
    onTargetsChange: (changes: SeasonTargetChange[]) => void
    onWeekTypeChange: (week: SeasonWeek, weekType: SeasonWeekType) => void
    onOpenWeek: (week: SeasonWeek) => void
}) {
    const disciplines = season.disciplines

    const copyToNext = (index: number, all: boolean) => {
        const source = weeks[index]
        const targetsWeeks = all ? weeks.slice(index + 1) : weeks.slice(index + 1, index + 2)
        const changes = targetsWeeks.flatMap((week) => disciplines.map((discipline) => {
            const measure = measureFor(discipline, season.primaryUnit)
            return { seasonWeekId: week.id, discipline, value: targetAmount(source.disciplines[discipline].target, measure) }
        }))
        if (changes.length) onTargetsChange(changes)
    }

    const [rescaleIndex, setRescaleIndex] = useState<number | null>(null)
    const [rescalePercent, setRescalePercent] = useState('-10')
    const parsedPercent = Number(rescalePercent.replace(',', '.').replace('%', '').trim())
    const validPercent = rescalePercent.trim() !== '' && Number.isFinite(parsedPercent) && parsedPercent > -100 && parsedPercent <= 200

    const rescaleFrom = (index: number, percent: number) => {
        const factor = 1 + percent / 100
        const changes = weeks.slice(index).flatMap((week) => disciplines.flatMap((discipline) => {
            const measure = measureFor(discipline, season.primaryUnit)
            const current = targetAmount(week.disciplines[discipline].target, measure)
            if (current === null) return []
            const scaled = measure === 'minutes'
                ? Math.round((current * factor) / 5) * 5
                : measure === 'sessions' ? Math.round(current * factor) : Math.round(current * factor * 10) / 10
            return [{ seasonWeekId: week.id, discipline, value: Math.max(0, scaled) }]
        }))
        if (changes.length) onTargetsChange(changes)
    }

    return (
        <>
        <Dialog open={rescaleIndex !== null} onOpenChange={(open) => { if (!open) setRescaleIndex(null) }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Reescalar desde la semana {rescaleIndex !== null ? weeks[rescaleIndex]?.weekNumber : ''}</DialogTitle>
                    <DialogDescription>
                        Sube o baja todos los objetivos desde esta semana hasta el final, sin tocar las sesiones. El tiempo se redondea a 5 min.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <Label htmlFor="season-rescale">Cambio (%)</Label>
                    <Input id="season-rescale" inputMode="decimal" value={rescalePercent} onChange={(e) => setRescalePercent(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Negativo para bajar (p. ej. -15), positivo para subir.</p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRescaleIndex(null)}>Cancelar</Button>
                    <Button
                        disabled={!validPercent}
                        onClick={() => {
                            if (rescaleIndex !== null && validPercent) rescaleFrom(rescaleIndex, parsedPercent)
                            setRescaleIndex(null)
                        }}
                    >
                        Aplicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        <div className="relative overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="sticky left-0 z-10 w-36 bg-card px-3 py-2">Semana</th>
                        {disciplines.map((discipline) => {
                            const meta = DISCIPLINE_META[discipline]
                            const Icon = meta.icon
                            return (
                                <th key={discipline} className="px-2 py-2">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={cn('flex h-5 w-5 items-center justify-center rounded', meta.chipClass)}><Icon className="h-3 w-3" /></span>
                                        {meta.label}
                                    </span>
                                </th>
                            )
                        })}
                        <th className="w-10 px-2 py-2"><span className="sr-only">Acciones</span></th>
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, index) => (
                        <tr
                            key={week.id}
                            className={cn(
                                'border-b border-border/40 align-top last:border-b-0',
                                week.weekType === 'descarga' && 'bg-sky-500/[0.04]',
                                week.timing === 'current' && 'bg-primary/[0.05]'
                            )}
                        >
                            {/* Fija al desplazar la rejilla en horizontal (móvil) */}
                            <td className="sticky left-0 z-10 bg-card px-3 py-2">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="font-semibold tabular-nums">S{week.weekNumber}</span>
                                    <span className="text-xs text-muted-foreground">{dayLabel(week.weekStart)}</span>
                                    {week.timing === 'current' && <span className="text-[10px] font-semibold uppercase text-primary">Actual</span>}
                                </div>
                                {week.phaseName && <p className="text-[11px] text-muted-foreground">{week.phaseName}</p>}
                                <Select value={week.weekType} onValueChange={(value) => onWeekTypeChange(week, value as SeasonWeekType)}>
                                    <SelectTrigger
                                        aria-label={`Tipo de la semana ${week.weekNumber}`}
                                        className={cn('mt-1 h-6 w-auto gap-1 rounded-full border-0 px-2 text-[11px] font-semibold', WEEK_TYPE_META[week.weekType].badgeClass)}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {WEEK_TYPES.map((type) => <SelectItem key={type} value={type}>{WEEK_TYPE_META[type].label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </td>
                            {disciplines.map((discipline) => {
                                const measure = measureFor(discipline, season.primaryUnit)
                                return (
                                    <td key={discipline} className="px-2 py-2">
                                        <TargetCell
                                            value={targetAmount(week.disciplines[discipline].target, measure)}
                                            measure={measure}
                                            label={`Objetivo de ${DISCIPLINE_META[discipline].label} en la semana ${week.weekNumber}`}
                                            onSave={(value) => onTargetsChange([{ seasonWeekId: week.id, discipline, value }])}
                                        />
                                        <CellReading week={week} discipline={discipline} measure={measure} />
                                    </td>
                                )
                            })}
                            <td className="px-1 py-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de la semana ${week.weekNumber}`}>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Semana {week.weekNumber}</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => onOpenWeek(week)}>
                                            <CalendarDays className="mr-2 h-4 w-4" />Abrir en Planificación
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem disabled={index === weeks.length - 1} onClick={() => copyToNext(index, false)}>
                                            <Copy className="mr-2 h-4 w-4" />Copiar a la semana siguiente
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={index === weeks.length - 1} onClick={() => copyToNext(index, true)}>
                                            <Copy className="mr-2 h-4 w-4" />Copiar a todas las siguientes
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setRescaleIndex(index)}>
                                            <Percent className="mr-2 h-4 w-4" />Reescalar desde aquí…
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        </>
    )
}
