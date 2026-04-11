'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Sparkles,
    Loader2,
    Wand2,
    CalendarDays,
    ArrowRight,
    Dumbbell,
    Activity,
    Timer,
    AlertTriangle,
    RotateCcw,
} from 'lucide-react'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { applyWeeklyPlanningAIAction, generateWeeklyPlanningAIAction } from '@/app/(coach)/coach/workspace/planning-actions'
import type { PlanningAIPlannedSession, WeeklyPlanningAIProposal } from '@/types/planning'

type Step = 'input' | 'preview'

interface PlanningAIWeeklyDialogProps {
    clientId: string
    coachId: string
    weekStart: string
    weekEnd: string
    disabled?: boolean
    onApplied: () => Promise<void> | void
}

const EXAMPLE_PROMPTS = [
    'Muéveme la fuerza al martes y viernes y mete un rodaje suave el jueves.',
    'Semana orientada a carrera: una sesión de series, una de tempo y un rodaje largo.',
    'Quiero una semana híbrida con la fuerza actual y una sesión tipo Hyrox el sábado.',
    'Descarga esta semana: mantén solo la fuerza y dos rodajes suaves.',
]

function parseLocalDate(value: string) {
    return new Date(`${value}T12:00:00`)
}

function formatDayLabel(date: string) {
    return format(parseLocalDate(date), "EEEE d MMM", { locale: es })
}

function getSessionTypeLabel(session: PlanningAIPlannedSession) {
    if (session.kind === 'hybrid') return 'Híbrido'

    const labels: Record<string, string> = {
        rodaje: 'Rodaje',
        series: 'Series',
        tempo: 'Tempo',
        fartlek: 'Fartlek',
        progressive: 'Progresivos',
        bike: 'Bicicleta',
        swim: 'Natación',
    }

    return labels[session.trainingType] || session.trainingType
}

function getSessionAccent(session: PlanningAIPlannedSession) {
    if (session.kind === 'hybrid') {
        return 'border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-100'
    }

    if (session.trainingType === 'series') {
        return 'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-100'
    }

    if (session.trainingType === 'tempo') {
        return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100'
    }

    return 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-100'
}

export function PlanningAIWeeklyDialog({
    clientId,
    coachId,
    weekStart,
    weekEnd,
    disabled,
    onApplied,
}: PlanningAIWeeklyDialogProps) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('input')
    const [prompt, setPrompt] = useState('')
    const [proposal, setProposal] = useState<WeeklyPlanningAIProposal | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const movementCount = useMemo(
        () => proposal?.days.reduce((sum, day) => sum + day.strengthAssignments.filter((assignment) => assignment.action === 'move').length, 0) || 0,
        [proposal]
    )
    const newCardioCount = useMemo(
        () => proposal?.days.reduce((sum, day) => sum + day.newSessions.filter((session) => session.kind === 'cardio').length, 0) || 0,
        [proposal]
    )
    const newHybridCount = useMemo(
        () => proposal?.days.reduce((sum, day) => sum + day.newSessions.filter((session) => session.kind === 'hybrid').length, 0) || 0,
        [proposal]
    )

    function resetDialog() {
        setStep('input')
        setPrompt('')
        setProposal(null)
        setError(null)
        setIsGenerating(false)
        setIsApplying(false)
    }

    function handleOpenChange(nextOpen: boolean) {
        setOpen(nextOpen)
        if (!nextOpen) {
            resetDialog()
        }
    }

    async function handleGenerate() {
        const trimmedPrompt = prompt.trim()
        if (!trimmedPrompt) {
            setError('Escribe una instrucción para que la IA organice esta semana.')
            return
        }

        setError(null)
        setIsGenerating(true)

        const result = await generateWeeklyPlanningAIAction({
            clientId,
            coachId,
            weekStart,
            prompt: trimmedPrompt,
        })

        setIsGenerating(false)

        if (!result.success || !('proposal' in result) || !result.proposal) {
            setError(result.error || 'No se pudo generar la propuesta semanal.')
            return
        }

        setProposal(result.proposal)
        setStep('preview')
    }

    async function handleApply() {
        if (!proposal) return

        setError(null)
        setIsApplying(true)

        const result = await applyWeeklyPlanningAIAction({
            clientId,
            coachId,
            weekStart,
            proposal,
        })

        setIsApplying(false)

        if (!result.success) {
            setError(result.error || 'No se pudo aplicar la planificación con IA.')
            return
        }

        toast({
            title: 'Planificación aplicada',
            description: `${result.counts?.movedStrength || 0} fuerzas movidas · ${result.counts?.createdCardio || 0} cardio nuevas · ${result.counts?.createdHybrid || 0} híbridos nuevos`,
        })

        await onApplied()
        setOpen(false)
        resetDialog()
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <AIActionButton
                    type="button"
                    size="sm"
                    disabled={disabled}
                >
                    Planificación con IA
                </AIActionButton>
            </DialogTrigger>
            <DialogContent className="flex w-[min(960px,calc(100vw-1.5rem))] max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-[860px]">
                <div className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="border-b px-5 py-5 pr-16 sm:px-6 sm:pr-16">
                        <div className="flex flex-col gap-3">
                            <div className="space-y-2">
                                <DialogTitle className="flex items-center gap-2 text-xl">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                    Planificación con IA
                                </DialogTitle>
                                <DialogDescription className="text-sm leading-relaxed">
                                    Genera una propuesta semanal sobre la semana visible, reubicando la fuerza existente si hace falta y añadiendo cardio o híbridos nuevos solo después de tu revisión.
                                </DialogDescription>
                            </div>
                            <Badge
                                variant="outline"
                                className="w-fit max-w-[calc(100%-1rem)] shrink-0 bg-primary/5 text-primary border-primary/20"
                            >
                                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                                {formatDayLabel(weekStart)} · {formatDayLabel(weekEnd)}
                            </Badge>
                        </div>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                        {step === 'input' ? (
                            <div className="space-y-5">
                                <Card className="border-primary/15 bg-primary/5">
                                    <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
                                        La IA trabaja solo sobre esta semana. Puede mover las sesiones de fuerza que ya existen en el programa y proponerte cardio o híbridos nuevos, pero no reescribe el contenido interno de fuerza.
                                    </CardContent>
                                </Card>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">Instrucción del coach</label>
                                    <Textarea
                                        value={prompt}
                                        onChange={(event) => setPrompt(event.target.value)}
                                        placeholder="Ej: Muéveme la fuerza al martes y viernes y mete un rodaje suave el jueves."
                                        className="min-h-[160px] resize-none"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Puedes indicar cómo quieres repartir la fuerza, el foco de running, si buscas una semana más suave o si quieres incluir un híbrido tipo Hyrox.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Ejemplos rápidos
                                    </p>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        {EXAMPLE_PROMPTS.map((example) => (
                                            <button
                                                key={example}
                                                type="button"
                                                onClick={() => setPrompt(example)}
                                                className="rounded-xl border bg-background px-3 py-3 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                                            >
                                                {example}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {error ? (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                                        {error}
                                    </div>
                                ) : null}
                            </div>
                        ) : proposal ? (
                            <div className="space-y-5">
                                <div className="grid gap-3 lg:grid-cols-4">
                                    <Card className="border-primary/15 bg-primary/5">
                                        <CardContent className="p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fuerza movida</p>
                                            <p className="mt-2 text-3xl font-bold tabular-nums">{movementCount}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Sesiones reubicadas dentro de la semana</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-green-200 bg-green-50/80 dark:border-green-900/50 dark:bg-green-950/20">
                                        <CardContent className="p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cardio nuevo</p>
                                            <p className="mt-2 text-3xl font-bold tabular-nums">{newCardioCount}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Sesiones creadas al aplicar</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-purple-200 bg-purple-50/80 dark:border-purple-900/50 dark:bg-purple-950/20">
                                        <CardContent className="p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Híbrido nuevo</p>
                                            <p className="mt-2 text-3xl font-bold tabular-nums">{newHybridCount}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Sesiones añadidas a la semana</p>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Semana visible</p>
                                            <p className="mt-2 text-sm font-semibold capitalize">{format(parseLocalDate(weekStart), "d MMM", { locale: es })} - {format(parseLocalDate(weekEnd), "d MMM", { locale: es })}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">No se aplican cambios fuera de este rango</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card className="border-primary/15 bg-primary/5">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Wand2 className="h-4 w-4 text-primary" />
                                            Resumen de la propuesta
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <p className="text-sm leading-relaxed">{proposal.overview}</p>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{proposal.rationale}</p>
                                        <div className="rounded-xl border bg-background/80 px-3 py-2 text-sm text-muted-foreground">
                                            <span className="font-medium text-foreground">Prompt usado:</span> {proposal.coachPrompt}
                                        </div>
                                        <div className="rounded-xl border bg-background/80 px-3 py-2 text-sm text-muted-foreground">
                                            <span className="font-medium text-foreground">Cómo se aplicará:</span> {proposal.existingCardioPolicy}
                                        </div>
                                    </CardContent>
                                </Card>

                                {proposal.assumptions.length > 0 ? (
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-semibold">Supuestos de la IA</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            {proposal.assumptions.map((assumption) => (
                                                <div key={assumption} className="text-sm text-muted-foreground">
                                                    {assumption}
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                ) : null}

                                {proposal.warnings.length > 0 ? (
                                    <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                                                Matices a revisar antes de aplicar
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                            {proposal.warnings.map((warning) => (
                                                <div key={warning} className="text-sm text-amber-900/80 dark:text-amber-100/90">
                                                    {warning}
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                ) : null}

                                <div className="space-y-3">
                                    {proposal.days.map((day) => (
                                        <Card key={day.date}>
                                            <CardHeader className="pb-3">
                                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                    <div>
                                                        <CardTitle className="text-base capitalize">{day.weekdayLabel}</CardTitle>
                                                        <p className="mt-1 text-sm text-muted-foreground">
                                                            {format(parseLocalDate(day.date), "d 'de' MMMM", { locale: es })}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {day.strengthAssignments.length > 0 ? (
                                                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-100 dark:border-red-900/50">
                                                                <Dumbbell className="mr-1.5 h-3 w-3" />
                                                                {day.strengthAssignments.length} fuerza
                                                            </Badge>
                                                        ) : null}
                                                        {day.newSessions.length > 0 ? (
                                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-100 dark:border-green-900/50">
                                                                <Activity className="mr-1.5 h-3 w-3" />
                                                                {day.newSessions.length} nueva{day.newSessions.length === 1 ? '' : 's'}
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="rounded-xl border bg-muted/20 px-3 py-3 text-sm leading-relaxed">
                                                    {day.summary}
                                                </div>

                                                {day.strengthAssignments.length > 0 ? (
                                                    <div className="space-y-2">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                            Fuerza existente
                                                        </p>
                                                        {day.strengthAssignments.map((assignment) => (
                                                            <div key={assignment.ref} className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 px-3 py-3 dark:border-red-900/50 dark:bg-red-950/20">
                                                                <div className="min-w-0">
                                                                    <p className="font-medium text-sm text-red-900 dark:text-red-100">{assignment.title}</p>
                                                                    <p className="text-xs text-red-700/80 dark:text-red-200/80">
                                                                        {assignment.action === 'move'
                                                                            ? `Se mueve desde ${formatDayLabel(assignment.sourceDate)}`
                                                                            : `Se mantiene en ${formatDayLabel(assignment.sourceDate)}`}
                                                                    </p>
                                                                </div>
                                                                <Badge variant="outline" className="shrink-0 border-red-200/70 bg-background/70 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
                                                                    {assignment.action === 'move' ? 'Mover' : 'Mantener'}
                                                                </Badge>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {day.newSessions.length > 0 ? (
                                                    <div className="space-y-2">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                            Sesiones nuevas
                                                        </p>
                                                        <div className="grid gap-3 lg:grid-cols-2">
                                                            {day.newSessions.map((session, index) => (
                                                                <div
                                                                    key={`${day.date}-${session.kind}-${session.title}-${index}`}
                                                                    className={cn('rounded-xl border px-3 py-3', getSessionAccent(session))}
                                                                >
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            {session.kind === 'hybrid' ? (
                                                                                <Timer className="h-4 w-4 shrink-0" />
                                                                            ) : (
                                                                                <Activity className="h-4 w-4 shrink-0" />
                                                                            )}
                                                                            <div className="min-w-0">
                                                                                <p className="font-semibold text-sm leading-snug">{session.title}</p>
                                                                                <p className="text-xs opacity-80">{getSessionTypeLabel(session)}</p>
                                                                            </div>
                                                                        </div>
                                                                        <Badge variant="outline" className="border-current/20 bg-background/70 text-current dark:bg-black/10">
                                                                            {session.kind === 'hybrid' ? 'Nuevo híbrido' : 'Nuevo cardio'}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                                                                        {session.kind === 'cardio' && session.distanceKm ? (
                                                                            <span className="rounded-full bg-background/70 px-2 py-1 dark:bg-black/10">
                                                                                {session.distanceKm} km
                                                                            </span>
                                                                        ) : null}
                                                                        {session.durationMin ? (
                                                                            <span className="rounded-full bg-background/70 px-2 py-1 dark:bg-black/10">
                                                                                {session.durationMin} min
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
                                                                        {session.details}
                                                                    </p>
                                                                    {session.notes ? (
                                                                        <p className="mt-2 whitespace-pre-line text-xs opacity-80">
                                                                            {session.notes}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}

                                                {day.strengthAssignments.length === 0 && day.newSessions.length === 0 ? (
                                                    <div className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                                                        Día libre o sin acciones nuevas para aplicar.
                                                    </div>
                                                ) : null}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>

                                {error ? (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                                        {error}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <DialogFooter className="border-t bg-background/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
                        {step === 'input' ? (
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted-foreground">
                                    La propuesta no toca el calendario hasta que la confirmes.
                                </p>
                                <div className="flex gap-2 justify-end">
                                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
                                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                        Generar propuesta
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setStep('input')
                                        setError(null)
                                    }}
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Ajustar prompt
                                </Button>
                                <div className="flex gap-2 justify-end">
                                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="button" onClick={handleApply} disabled={isApplying}>
                                        {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                                        Aplicar planificación
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
