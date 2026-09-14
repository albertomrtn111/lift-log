'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarRange, Check, Loader2, Pause, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { generatePlanningBlockOutlineAction, generatePlanningBlockWeekAction, applyPlanningBlockAction } from '@/app/(coach)/coach/workspace/planning-block-actions'
import { addDateDays, blockRequestSchema, BLOCK_PHASE_LABELS, buildBlockWeeks, type BlockOutline, type BlockWeekSessions } from '@/lib/ai/planning-block'

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const dateLabel = (value: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))

export function PlanningAIBlockDialog({ clientId, coachId, onApplied }: { clientId: string; coachId: string; onApplied: () => void | Promise<void> }) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('Preparación de maratón')
    const [eventDate, setEventDate] = useState('')
    const [weeks, setWeeks] = useState('12')
    const [sport, setSport] = useState<'running' | 'bike' | 'swim' | 'hybrid'>('running')
    const [unit, setUnit] = useState<'km' | 'min'>('km')
    const [currentVolume, setCurrentVolume] = useState('')
    const [peakVolume, setPeakVolume] = useState('75')
    const [deloadEvery, setDeloadEvery] = useState('4')
    const [taperWeeks, setTaperWeeks] = useState('3')
    const [eventDistance, setEventDistance] = useState('42.195')
    const [trainingDays, setTrainingDays] = useState([2, 3, 4, 6, 7])
    const [instructions, setInstructions] = useState('')
    const [outline, setOutline] = useState<BlockOutline | null>(null)
    const [details, setDetails] = useState<BlockWeekSessions[]>([])
    const [busy, setBusy] = useState<'outline' | 'sessions' | 'apply' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [progress, setProgress] = useState('')
    const stop = useRef(false)
    const inFlight = useRef(false)
    const mounted = useRef(true)
    useEffect(() => { mounted.current = true; return () => { stop.current = true; mounted.current = false } }, [])

    const complete = Boolean(outline && details.length === outline.weeks.length)
    const sessionCount = details.reduce((sum, week) => sum + week.sessions.length, 0)
    const rawRequest = { title, eventDate, weeks: Number(weeks), sport, unit, currentVolume: Number(currentVolume), peakVolume: Number(peakVolume), deloadEvery: Number(deloadEvery), taperWeeks: Number(taperWeeks), trainingDays, eventDistanceKm: eventDistance.trim() ? Number(eventDistance) : null, instructions }
    const validated = blockRequestSchema.safeParse(rawRequest)
    const start = validated.success ? buildBlockWeeks(validated.data)[0].start : null

    async function generateOutline() {
        if (inFlight.current) return
        if (!validated.success) { setError(validated.error.issues[0]?.message || 'Revisa los parámetros.'); return }
        inFlight.current = true
        setBusy('outline'); setError(null)
        try {
            const result = await generatePlanningBlockOutlineAction({ clientId, coachId, request: validated.data })
            if (!mounted.current) return
            if (!result.success) { setError(result.error); return }
            setOutline(result.outline); setDetails([])
        } catch { setError('No se pudo conectar con la IA. Tu configuración se conserva.') }
        finally { inFlight.current = false; if (mounted.current) setBusy(null) }
    }

    async function generateSessions() {
        if (!outline || inFlight.current) return
        inFlight.current = true; stop.current = false
        setBusy('sessions'); setError(null)
        const generated = [...details]
        try {
            for (let index = generated.length + 1; index <= outline.weeks.length; index++) {
                if (stop.current) break
                setProgress(`Generando semana ${index} de ${outline.weeks.length}…`)
                const result = await generatePlanningBlockWeekAction({ clientId, coachId, outline, index, previousWeek: generated[generated.length - 1] })
                if (!mounted.current) return
                if (!result.success) { setError(result.error); break }
                generated.push(result.week)
                setDetails([...generated])
            }
        } catch { if (mounted.current) setError('La generación se interrumpió. Puedes continuar desde la última semana completada.') }
        finally { inFlight.current = false; if (mounted.current) { setBusy(null); setProgress('') } }
    }

    async function applyBlock() {
        if (!outline || !complete || inFlight.current) return
        inFlight.current = true; setBusy('apply'); setError(null)
        try {
            const result = await applyPlanningBlockAction({ clientId, coachId, outline, weeks: details })
            if (!result.success) { setError(result.error); return }
            toast({ title: 'Bloque añadido al calendario', description: `${outline.weeks.length} semanas · ${result.count} sesiones.` })
            setOutline(null); setDetails([]); setOpen(false)
            await onApplied()
        } catch { setError('No se pudo confirmar el guardado. Puedes reintentar este bloque sin duplicar sesiones.') }
        finally { inFlight.current = false; if (mounted.current) setBusy(null) }
    }

    return <Dialog open={open} onOpenChange={value => { if (busy === 'apply') return; if (!value) stop.current = true; setOpen(value) }}>
        <DialogTrigger asChild><AIActionButton type="button" size="sm"><CalendarRange className="mr-2 h-4 w-4" />Planificar bloque con IA</AIActionButton></DialogTrigger>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col overflow-hidden p-0" onPointerDownOutside={event => { if (busy) event.preventDefault() }}>
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-14 sm:px-6">
                <DialogTitle>Planifica hasta tu objetivo</DialogTitle>
                <DialogDescription>De 2 a 26 semanas con progresión, descargas y tapering. Primero revisa el bloque; después sus sesiones.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                {!outline ? <>
                    <div className="space-y-2"><Label htmlFor="block-title">Objetivo del bloque</Label><Input id="block-title" value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Maratón de Valencia, primera media maratón…" /></div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="block-date">Fecha objetivo / competición</Label><Input id="block-date" type="date" value={eventDate} onChange={event => setEventDate(event.target.value)} /></div>
                        <NumberField id="block-weeks" label="Semanas de preparación" value={weeks} onChange={setWeeks} min={2} max={26} />
                        <div className="space-y-2"><Label htmlFor="block-sport">Disciplina principal</Label><select id="block-sport" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={sport} onChange={event => { const next = event.target.value as typeof sport; setSport(next); setCurrentVolume(''); setPeakVolume(''); setEventDistance(''); if (next === 'hybrid') setUnit('min') }}><option value="running">Carrera</option><option value="bike">Ciclismo</option><option value="swim">Natación</option><option value="hybrid">Híbrido</option></select></div>
                        <div className="space-y-2"><Label htmlFor="block-unit">Unidad del volumen semanal</Label><select id="block-unit" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={unit} onChange={event => { setUnit(event.target.value as typeof unit); setCurrentVolume(''); setPeakVolume('') }} disabled={sport === 'hybrid'}><option value="km">Kilómetros por semana</option><option value="min">Minutos por semana</option></select></div>
                        <NumberField id="block-current" label={`Volumen inicial (${unit}/semana)`} value={currentVolume} onChange={setCurrentVolume} min={0.1} max={5000} step="0.1" hint="Carga que el atleta tolera actualmente. Se contrasta con sus registros recientes." />
                        <NumberField id="block-peak" label={`Pico deseado (${unit}/semana)`} value={peakVolume} onChange={setPeakVolume} min={0.1} max={5000} step="0.1" hint="Máximo semanal de entrenamiento antes del tapering; no el volumen de la última semana." />
                        <NumberField id="block-deload" label="Descarga cada cuántas semanas" value={deloadEvery} onChange={setDeloadEvery} min={0} max={8} hint="Ejemplo: 4 → semanas 4 y 8. Usa 0 para desactivar." />
                        <NumberField id="block-taper" label="Semanas de tapering" value={taperWeeks} onChange={setTaperWeeks} min={0} max={6} hint="Incluye la semana de competición. Tiene prioridad sobre la descarga periódica." />
                        <NumberField id="block-event-distance" label="Distancia de competición (km, opcional)" value={eventDistance} onChange={setEventDistance} min={0.001} max={500} step="0.001" hint="42,195 para maratón. Se programa en la fecha objetivo y se contabiliza aparte del entrenamiento." />
                    </div>
                    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Días disponibles para esta disciplina</legend><div className="flex flex-wrap gap-2">{WEEKDAYS.map((day, index) => <Button key={day} type="button" variant={trainingDays.includes(index + 1) ? 'default' : 'outline'} className="min-h-11" aria-pressed={trainingDays.includes(index + 1)} onClick={() => setTrainingDays(days => days.includes(index + 1) ? days.filter(value => value !== index + 1) : [...days, index + 1].sort())}>{day}</Button>)}</div></fieldset>
                    <div className="space-y-2"><Label htmlFor="block-instructions">Criterios y preferencias del entrenador</Label><Textarea id="block-instructions" rows={5} maxLength={6000} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Tirada larga el domingo, mantener fuerza martes y jueves, máximo 60 min entre semana, objetivo de marca, molestias a tener en cuenta…" /></div>
                    <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">{start ? `Del ${dateLabel(start)} al ${dateLabel(eventDate)}. ` : ''}Los microciclos duran siete días y terminan en la fecha objetivo. La distribución inicial propone una descarga del 25% y un tapering progresivo; revísalos según el atleta.</div>
                </> : <>
                    <div className="space-y-2"><p className="text-lg font-semibold break-words">{outline.request.title}</p><p className="text-sm text-muted-foreground">{dateLabel(outline.weeks[0].start)} – {dateLabel(outline.request.eventDate)} · {outline.weeks.length} semanas · pico {outline.request.peakVolume} {outline.request.unit}/semana</p><p className="whitespace-pre-line text-sm leading-relaxed">{outline.summary}</p></div>
                    {outline.assumptions.length > 0 && <Notice title="Supuestos a revisar" lines={outline.assumptions} />}
                    {outline.warnings.length > 0 && <Notice title="Revisa antes de generar las sesiones" lines={outline.warnings} warning />}
                    <p className="rounded-xl border bg-muted/30 p-3 text-sm">La fuerza y el cardio que ya existen se respetan. Se añaden las sesiones que faltan para completar el volumen; si lo existente ya supera el objetivo, se indicará qué semana debes revisar.</p>
                    <div className="space-y-3">{outline.weeks.map(week => {
                        const detail = details.find(item => item.index === week.index)
                        return <div key={week.index} className="min-w-0 rounded-xl border p-3 sm:p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Semana {week.index} · {BLOCK_PHASE_LABELS[week.phase]}</p><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium">{week.targetVolume} {outline.request.unit}</span></div>
                            <p className="mt-1 text-xs text-muted-foreground">{dateLabel(week.start)} – {dateLabel(week.end)}{detail ? ` · ${detail.sessions.length} sesiones nuevas` : ''}</p>
                            <p className="mt-2 text-sm leading-relaxed">{week.objective}</p>
                            {detail && <details className="mt-3"><summary className="cursor-pointer py-2 text-sm font-medium">Revisar sesiones y criterio de la semana</summary><p className="mb-3 text-sm text-muted-foreground">{detail.rationale}</p>{detail.warnings.length > 0 && <Notice title="Observaciones" lines={detail.warnings} warning />}
                                <div className="mt-3 space-y-3">{detail.sessions.map(session => <div key={session.id} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{dateLabel(session.date)}{session.purpose === 'event' ? ' · Competición' : ''}</p><p className="break-words text-sm font-semibold">{session.title}</p><p className="mt-1 text-xs">{session.distanceKm != null ? `${session.distanceKm} km` : ''}{session.durationMin != null ? ` · ${session.durationMin} min` : ''}</p><p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{session.details}</p>{session.notes && <p className="mt-2 text-xs text-muted-foreground">{session.notes}</p>}</div>)}</div>
                            </details>}
                        </div>
                    })}</div>
                    {details.length > 0 && <p className="text-sm text-muted-foreground">{details.length}/{outline.weeks.length} semanas preparadas · {sessionCount} sesiones. Se guardarán juntas al aplicar el bloque.</p>}
                </>}
                {busy === 'sessions' && <div role="status" className="space-y-2 rounded-xl border p-3 text-sm"><p>{progress}</p><progress className="w-full" value={details.length} max={outline?.weeks.length ?? 1} /><p className="text-xs text-muted-foreground">Puedes pausar y continuar desde la última semana preparada.</p></div>}
                {busy === 'outline' && <p role="status" className="text-sm text-muted-foreground">Revisando el historial y preparando la periodización…</p>}
                {error && <div role="alert" className="break-words rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div>}
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t bg-background p-4 [&_button]:min-h-11 sm:flex-row sm:flex-wrap sm:justify-between">
                {outline ? <Button type="button" variant="outline" disabled={!!busy} onClick={() => { setOutline(null); setDetails([]); setError(null) }}>Ajustar objetivo y criterios</Button> : <Button type="button" variant="outline" disabled={!!busy} onClick={() => setOpen(false)}>Cerrar</Button>}
                <div className="flex flex-col gap-2 sm:flex-row">
                    {outline && details.length > 0 && !busy && <Button type="button" variant="outline" onClick={() => { setDetails([]); setError(null) }}>Rehacer sesiones</Button>}
                    {busy === 'sessions' ? <Button type="button" variant="outline" onClick={() => { stop.current = true; setProgress('Pausando al terminar esta semana…') }}><Pause className="mr-2 h-4 w-4" />Pausar</Button>
                        : !outline ? <Button type="button" disabled={!!busy} onClick={generateOutline}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Preparar bloque</Button>
                        : complete ? <Button type="button" disabled={!!busy} onClick={applyBlock}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Aplicar {sessionCount} sesiones</Button>
                        : <Button type="button" disabled={!!busy} onClick={generateSessions}><Sparkles className="mr-2 h-4 w-4" />{details.length ? 'Continuar sesiones' : 'Generar sesiones del bloque'}</Button>}
                </div>
            </div>
        </DialogContent>
    </Dialog>
}

function NumberField({ id, label, value, onChange, min, max, step = '1', hint }: { id: string; label: string; value: string; onChange: (value: string) => void; min: number; max: number; step?: string; hint?: string }) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={event => onChange(event.target.value)} />{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
}

function Notice({ title, lines, warning = false }: { title: string; lines: string[]; warning?: boolean }) {
    return <div className={`space-y-2 rounded-xl border p-3 text-sm ${warning ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/30'}`}><p className="font-medium">{title}</p><ul className="list-disc space-y-1 pl-4">{lines.map((line, index) => <li key={index} className="break-words">{line}</li>)}</ul></div>
}
