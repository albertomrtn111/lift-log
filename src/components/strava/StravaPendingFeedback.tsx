'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowLeft, Check, Clock, HeartPulse, Loader2, Route } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { describeHrZone, resolveHrBounds, type CustomZones, type HrZoneMethod } from '@/lib/training/zones'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { notifyStravaActivityCompleted, STRAVA_PENDING_UPDATED_EVENT } from '@/lib/strava/events'

interface PlannedSessionOption {
    id: string
    scheduled_date: string
    name: string | null
    activity_type: string | null
    training_type: string | null
    target_distance_km: number | null
    target_duration_min: number | null
    target_pace: string | null
    structure: any
}

interface PendingStravaActivity {
    id: string
    name: string | null
    activity_type: string | null
    sport_type: string | null
    start_date_local: string | null
    local_date: string
    distance_meters: number | null
    moving_time_seconds: number | null
    average_pace_seconds_per_km: number | null
    average_heartrate: number | null
    max_heartrate: number | null
    matched_planned_session_id: string | null
    planned_sessions: PlannedSessionOption[]
}

function formatDistance(meters: number | null) {
    if (!meters) return '0 km'
    return `${(Number(meters) / 1000).toFixed(2)} km`
}

function formatDuration(seconds: number | null) {
    if (!seconds) return '0 min'
    const totalMinutes = Math.round(Number(seconds) / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours === 0) return `${minutes} min`
    return `${hours} h ${minutes.toString().padStart(2, '0')} min`
}

function formatPace(seconds: number | null) {
    if (!seconds) return null
    const minutes = Math.floor(Number(seconds) / 60)
    const rest = Math.round(Number(seconds) % 60).toString().padStart(2, '0')
    return `${minutes}:${rest}/km`
}

// start_date_local es la hora de pared del atleta. Se construye la fecha a mano
// para que el navegador no la reinterprete en otra zona horaria (con un sufijo Z
// o en un móvil con otra zona, una carrera a las 23:00 saldría al día siguiente).
function parseWallClock(value: string | null) {
    if (!value) return null
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
    if (!match) return null
    const [, y, m, d, hh, mm] = match
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm))
}

function formatActivityDay(value: string | null) {
    const date = parseWallClock(value)
    if (!date) return ''
    const label = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
    }).format(date)
    return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatActivityTime(value: string | null) {
    const date = parseWallClock(value)
    if (!date) return ''
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function daysBetween(from: string, to: string) {
    const a = new Date(`${from}T12:00:00`).getTime()
    const b = new Date(`${to}T12:00:00`).getTime()
    return Math.round((b - a) / 86_400_000)
}

function relativeDayLabel(activityDate: string, sessionDate: string) {
    const diff = daysBetween(activityDate, sessionDate)
    if (diff === 0) return 'Mismo día'
    if (diff === -1) return 'Día anterior'
    if (diff === 1) return 'Día siguiente'
    return diff < 0 ? `${Math.abs(diff)} días antes` : `${diff} días después`
}

// "Ahora no" pospone la cola entera unas horas en este dispositivo, para que no
// vuelva a saltar en cada navegación o al reabrir la app.
const SNOOZE_STORAGE_KEY = 'strava:pending-snoozed'
const SNOOZE_MS = 6 * 60 * 60 * 1000

function readSnoozed(): Record<string, number> {
    try {
        const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        const now = Date.now()
        return Object.fromEntries(
            Object.entries(parsed as Record<string, number>).filter(([, until]) => typeof until === 'number' && until > now)
        )
    } catch {
        return {}
    }
}

function writeSnoozed(value: Record<string, number>) {
    try {
        window.localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(value))
    } catch {
        // Sin almacenamiento la posposición dura solo mientras la app esté abierta
    }
}

function formatDateOnly(value: string | null) {
    if (!value) return ''
    return new Intl.DateTimeFormat('es-ES', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
    }).format(new Date(`${value}T12:00:00`))
}

function formatPlannedSession(session: PlannedSessionOption) {
    const parts: string[] = []
    if (session.target_distance_km) parts.push(`${Number(session.target_distance_km).toFixed(1)} km`)
    if (session.target_duration_min) parts.push(`${Math.round(Number(session.target_duration_min))} min`)
    if (session.target_pace) parts.push(session.target_pace)
    return parts.join(' · ')
}

export function StravaPendingFeedback() {
    const router = useRouter()
    const [activities, setActivities] = useState<PendingStravaActivity[]>([])
    const [snoozed, setSnoozed] = useState<Record<string, number>>({})
    const [rpe, setRpe] = useState(5)
    const [notes, setNotes] = useState('')
    const [selectedSessionId, setSelectedSessionId] = useState('')
    const [saving, setSaving] = useState(false)
    const [ignoring, setIgnoring] = useState(false)
    const [step, setStep] = useState<'import' | 'feedback'>('import')
    const [zoneBounds, setZoneBounds] = useState<{ run: number[] | null; bike: number[] | null } | null>(null)

    // Límites de zona del atleta (RLS devuelve solo su fila): método configurado
    // por el coach + posibles intervalos personalizados
    useEffect(() => {
        const supabase = createClient()
        supabase
            .from('athlete_thresholds')
            .select('run_lthr, bike_lthr, max_hr, resting_hr, hr_zone_method, custom_zones')
            .maybeSingle()
            .then(({ data }) => {
                if (!data) return
                const method = (data.hr_zone_method ?? 'friel_lthr') as HrZoneMethod
                const common = {
                    method,
                    maxHr: data.max_hr as number | null,
                    restingHr: data.resting_hr as number | null,
                    custom: data.custom_zones as CustomZones | null,
                }
                const run = resolveHrBounds({ ...common, sport: 'run', lthr: data.run_lthr })
                const bike = resolveHrBounds({ ...common, sport: 'bike', lthr: data.bike_lthr })
                setZoneBounds({ run: run?.bounds ?? null, bike: bike?.bounds ?? null })
            })
    }, [])

    const loadPending = useCallback(async () => {
        setSnoozed(readSnoozed())
        try {
            const res = await fetch('/api/strava/activities/pending', { cache: 'no-store' })
            if (!res.ok) return
            const data = await res.json()
            setActivities(data.activities || [])
        } catch {
            setActivities([])
        }
    }, [])

    useEffect(() => {
        loadPending()
        window.addEventListener(STRAVA_PENDING_UPDATED_EVENT, loadPending)
        return () => window.removeEventListener(STRAVA_PENDING_UPDATED_EVENT, loadPending)
    }, [loadPending])

    const queue = useMemo(
        () => activities.filter((item) => !snoozed[item.id]),
        [activities, snoozed]
    )
    const activity = queue[0] ?? null
    // Posición dentro de la cola de esta visita (las ya resueltas desaparecen)
    const [initialQueueSize, setInitialQueueSize] = useState(0)
    useEffect(() => {
        setInitialQueueSize((current) => (queue.length > current || queue.length === 0 ? queue.length : current))
    }, [queue.length])
    const queuePosition = initialQueueSize - queue.length + 1

    useEffect(() => {
        if (activity) {
            setRpe(5)
            setNotes('')
            const options = activity.planned_sessions || []
            const matched = activity.matched_planned_session_id
            setSelectedSessionId(matched && options.some((session) => session.id === matched) ? matched : '')
            setStep('import')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activity?.id])

    function removeResolved(activityId: string, usedSessionId: string | null) {
        setActivities((current) => current
            .filter((item) => item.id !== activityId)
            // Una sesión ya completada no puede ofrecerse a la siguiente actividad
            .map((item) => usedSessionId
                ? {
                    ...item,
                    planned_sessions: item.planned_sessions.filter((session) => session.id !== usedSessionId),
                    matched_planned_session_id: item.matched_planned_session_id === usedSessionId ? null : item.matched_planned_session_id,
                }
                : item
            ))
    }

    async function saveFeedback() {
        if (!activity) return
        setSaving(true)
        const usedSessionId = selectedSessionId && selectedSessionId !== 'extra' ? selectedSessionId : null
        try {
            const res = await fetch(`/api/strava/activities/${activity.id}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rpe,
                    athleteNotes: notes,
                    plannedSessionId: selectedSessionId && selectedSessionId !== 'extra' ? selectedSessionId : null,
                    clearPlannedSessionMatch: selectedSessionId === 'extra',
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (res.status === 409 && data?.error) {
                    // La sesión elegida ya no está libre: se quita de las opciones
                    toast.error(data.error)
                    if (usedSessionId) {
                        setActivities((current) => current.map((item) => ({
                            ...item,
                            planned_sessions: item.planned_sessions.filter((session) => session.id !== usedSessionId),
                        })))
                        setSelectedSessionId('')
                        setStep('import')
                    }
                    return
                }
                throw new Error('feedback')
            }

            toast.success('Actividad registrada')
            removeResolved(activity.id, usedSessionId)
            if (data?.cardioSessionId) {
                notifyStravaActivityCompleted({
                    cardioSessionId: data.cardioSessionId,
                    scheduledDate: data.scheduledDate ?? activity.local_date,
                })
            }
            // Invalida la caché del router para que el resto de pantallas
            // (resumen, progreso...) muestren la sesión como realizada
            router.refresh()
        } catch {
            toast.error('No se pudo guardar el feedback')
        } finally {
            setSaving(false)
        }
    }

    async function ignoreCurrent() {
        if (!activity) return
        setIgnoring(true)
        try {
            const res = await fetch(`/api/strava/activities/${activity.id}/ignore`, {
                method: 'POST',
            })
            if (!res.ok) throw new Error('ignore')
            toast.success('Actividad descartada')
            removeResolved(activity.id, null)
        } catch {
            toast.error('No se pudo descartar la actividad')
        } finally {
            setIgnoring(false)
        }
    }

    function snoozeQueue() {
        const until = Date.now() + SNOOZE_MS
        const next = { ...readSnoozed() }
        for (const item of queue) next[item.id] = until
        writeSnoozed(next)
        setSnoozed(next)
    }

    if (!activity) return null

    const pace = formatPace(activity.average_pace_seconds_per_km)
    const sportType = activity.sport_type || activity.activity_type || 'Cardio'
    const plannedSessions = activity.planned_sessions || []
    const requiresSessionChoice = plannedSessions.length > 0 && !selectedSessionId

    // Zona de FC de la actividad según los límites del deporte
    // La bici no reutiliza los límites de carrera: su LTHR suele ser más bajo
    // y las zonas saldrían infladas. Si faltan, se avisa en vez de inventarlas.
    const isRide = /ride|bike|cycl/i.test(sportType)
    const activityBounds = isRide ? (zoneBounds?.bike ?? null) : (zoneBounds?.run ?? null)
    const bikeZonesPending = isRide && !zoneBounds?.bike && Boolean(activity.average_heartrate)
    const hrZone = activityBounds && activity.average_heartrate
        ? describeHrZone(activityBounds, Math.round(Number(activity.average_heartrate)))
        : null
    // Aquí no hay stream, así que la media es lo único que describe el conjunto.
    // El pico evita que una sesión con series se lea como suave solo por la media.
    const peakZone = activityBounds && activity.max_heartrate
        ? describeHrZone(activityBounds, Math.round(Number(activity.max_heartrate)))
        : null
    const showPeakZone = peakZone && (!hrZone || peakZone.zone > hrZone.zone)

    return (
        <Dialog open={!!activity} onOpenChange={(open) => !open && snoozeQueue()}>
            <DialogContent className="flex max-h-[calc(100dvh-var(--safe-area-top,0px)-0.75rem)] w-[calc(100vw-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0 [&>button]:top-[calc(var(--safe-area-top,0px)+1rem)] sm:max-h-[90vh] sm:w-[calc(100vw-1.5rem)] sm:[&>button]:top-4">
                <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[calc(var(--safe-area-top,0px)+1rem)] pr-12 text-left sm:px-5 sm:py-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                            <Activity className="h-5 w-5 text-orange-600" />
                        </div>
                        {Math.max(initialQueueSize, queue.length) > 1 && (
                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                                {Math.max(1, queuePosition)} de {Math.max(initialQueueSize, queue.length)}
                            </span>
                        )}
                    </div>
                    <DialogTitle className="leading-tight">
                        {step === 'import' ? formatActivityDay(activity.start_date_local) || 'Nueva actividad importada' : '¿Cómo fue la sesión?'}
                    </DialogTitle>
                    <DialogDescription className="break-words">
                        {activity.name || 'Actividad importada'}
                        {step === 'import' && formatActivityTime(activity.start_date_local) && ` · ${formatActivityTime(activity.start_date_local)}`}
                    </DialogDescription>
                </DialogHeader>

                {step === 'import' ? (
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="min-w-0 rounded-lg border border-border p-3">
                            <p className="text-xs text-muted-foreground">Fecha</p>
                            <p className="mt-1 break-words font-semibold leading-snug">
                                {formatActivityDay(activity.start_date_local)}
                                <span className="block text-xs font-normal text-muted-foreground">{formatActivityTime(activity.start_date_local)}</span>
                            </p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-border p-3">
                            <p className="text-xs text-muted-foreground">Tipo</p>
                            <p className="mt-1 break-words font-semibold leading-snug">{sportType}</p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-border p-3">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Route className="h-3 w-3" />
                                Distancia
                            </p>
                            <p className="mt-1 break-words font-semibold leading-snug">{formatDistance(activity.distance_meters)}</p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-border p-3">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                Tiempo
                            </p>
                            <p className="mt-1 break-words font-semibold leading-snug">{formatDuration(activity.moving_time_seconds)}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {pace && <span className="rounded-full bg-muted px-2 py-1">Ritmo {pace}</span>}
                        {activity.average_heartrate && (
                            <span className="rounded-full bg-muted px-2 py-1">
                                <HeartPulse className="mr-1 inline h-3 w-3" />
                                {Math.round(Number(activity.average_heartrate))} ppm
                            </span>
                        )}
                        {hrZone && (
                            <span
                                className={cn('rounded-full border px-2 py-1 font-semibold', hrZone.badgeClass)}
                                title="Zona de la FC media de toda la actividad"
                            >
                                {hrZone.label}
                            </span>
                        )}
                        {showPeakZone && peakZone && (
                            <span
                                className={cn('rounded-full border px-2 py-1 font-semibold', peakZone.badgeClass)}
                                title={`Pico de ${Math.round(Number(activity.max_heartrate))} ppm`}
                            >
                                Pico Z{peakZone.zone}
                            </span>
                        )}
                        {bikeZonesPending && (
                            <span className="rounded-full border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-400">
                                Zonas de bici pendientes
                            </span>
                        )}
                    </div>

                    {plannedSessions.length > 0 && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm font-medium">¿Qué actividad has realizado?</p>
                                <p className="text-xs text-muted-foreground">
                                    Elige la sesión planificada a la que corresponde o márcala como extra.
                                </p>
                            </div>
                            <RadioGroup value={selectedSessionId} onValueChange={setSelectedSessionId} className="space-y-2">
                                {plannedSessions.map((session) => {
                                    const details = formatPlannedSession(session)
                                    const relativeDay = relativeDayLabel(activity.local_date, session.scheduled_date)
                                    const isSameDay = session.scheduled_date === activity.local_date
                                    return (
                                        <Label
                                            key={session.id}
                                            htmlFor={`strava-session-${session.id}`}
                                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                                        >
                                            <RadioGroupItem id={`strava-session-${session.id}`} value={session.id} className="mt-1" />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-start justify-between gap-2">
                                                    <span className="text-sm font-semibold">
                                                        {session.name || session.training_type || session.activity_type || 'Cardio'}
                                                    </span>
                                                    <span className={cn(
                                                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                                                        isSameDay ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                                    )}>
                                                        {relativeDay}
                                                    </span>
                                                </span>
                                                <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                                                    {formatDateOnly(session.scheduled_date)}
                                                    {details ? ` · ${details}` : ''}
                                                </span>
                                            </span>
                                        </Label>
                                    )
                                })}
                                <Label
                                    htmlFor="strava-session-extra"
                                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                                >
                                    <RadioGroupItem id="strava-session-extra" value="extra" className="mt-1" />
                                    <span>
                                        <span className="block text-sm font-semibold">Actividad extra</span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">
                                            No corresponde a ninguna sesión planificada.
                                        </span>
                                    </span>
                                </Label>
                            </RadioGroup>
                        </div>
                    )}
                </div>
                ) : (
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
                    <p className="text-sm text-muted-foreground">
                        Cuéntale a tu coach cómo te ha ido esta actividad.
                    </p>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">RPE</span>
                            <span className="text-sm font-semibold tabular-nums">{rpe}/10</span>
                        </div>
                        <Slider
                            value={[rpe]}
                            min={1}
                            max={10}
                            step={1}
                            onValueChange={(value) => setRpe(value[0] ?? 5)}
                        />
                        <p className="text-xs text-muted-foreground">
                            1 = muy suave · 10 = esfuerzo máximo
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="strava-notes" className="text-sm font-medium">Notas</Label>
                        <Textarea
                            id="strava-notes"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Notas, sensaciones o contexto para tu coach"
                            className="min-h-[96px] resize-none"
                        />
                    </div>
                </div>
                )}

                {step === 'import' ? (
                <DialogFooter className="shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:px-5 sm:py-4">
                    <Button variant="outline" onClick={snoozeQueue} disabled={ignoring} className="w-full sm:w-auto">
                        {queue.length > 1 ? 'Más tarde' : 'Ahora no'}
                    </Button>
                    <Button variant="ghost" onClick={ignoreCurrent} disabled={ignoring} className="w-full text-destructive hover:text-destructive sm:w-auto">
                        {ignoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        No importar
                    </Button>
                    <Button onClick={() => setStep('feedback')} disabled={ignoring || requiresSessionChoice} className="w-full gap-2 sm:w-auto">
                        <Check className="h-4 w-4" />
                        Importar
                    </Button>
                </DialogFooter>
                ) : (
                <DialogFooter className="shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:px-5 sm:py-4">
                    <Button variant="outline" onClick={() => setStep('import')} disabled={saving} className="w-full gap-2 sm:w-auto">
                        <ArrowLeft className="h-4 w-4" />
                        Atrás
                    </Button>
                    <Button onClick={saveFeedback} disabled={saving} className="w-full gap-2 sm:w-auto">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Guardar
                    </Button>
                </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
