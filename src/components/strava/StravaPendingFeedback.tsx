'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Activity,
    ArrowLeft,
    Bike,
    Check,
    ChevronRight,
    Footprints,
    HeartPulse,
    Loader2,
    Mountain,
    Waves,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { describeHrZone, resolveHrBounds, type CustomZones, type HrZoneMethod } from '@/lib/training/zones'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { notifyStravaActivityCompleted, STRAVA_PENDING_UPDATED_EVENT } from '@/lib/strava/events'
import { RPE_LABELS, dayLabel, groupByDay, inboxRange, inboxTotals } from '@/lib/strava/pending-inbox'
import { formatCardioIntensity } from '@/lib/cardio/discipline'

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
    if (!meters) return null
    return `${(Number(meters) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} km`
}

function formatDuration(seconds: number | null) {
    if (!seconds) return null
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

// start_date_local es la hora de pared del atleta: se lee a mano para que el
// navegador no la reinterprete en otra zona horaria.
function formatActivityTime(value: string | null) {
    const match = value?.match(/[T ](\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : ''
}

function todayKey() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function relativeDayLabel(activityDate: string, sessionDate: string) {
    const diff = Math.round((new Date(`${sessionDate}T12:00:00`).getTime() - new Date(`${activityDate}T12:00:00`).getTime()) / 86_400_000)
    if (diff === 0) return 'Mismo día'
    if (diff === -1) return 'Día anterior'
    if (diff === 1) return 'Día siguiente'
    return diff < 0 ? `${Math.abs(diff)} días antes` : `${diff} días después`
}

function formatPlannedSession(session: PlannedSessionOption) {
    const parts: string[] = []
    if (session.target_distance_km) parts.push(`${Number(session.target_distance_km).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`)
    if (session.target_duration_min) parts.push(`${Math.round(Number(session.target_duration_min))} min`)
    if (session.target_pace) parts.push(session.target_pace)
    return parts.join(' · ')
}

function sessionName(session: PlannedSessionOption) {
    return session.name || session.training_type || session.activity_type || 'Cardio'
}

function sportOf(activity: PendingStravaActivity) {
    const sport = activity.sport_type || activity.activity_type || 'Cardio'
    if (/ride|bike|cycl/i.test(sport)) return { icon: Bike, label: 'Bici', isRide: true }
    if (/swim/i.test(sport)) return { icon: Waves, label: 'Natación', isRide: false }
    if (/hike/i.test(sport)) return { icon: Mountain, label: 'Senderismo', isRide: false }
    if (/walk/i.test(sport)) return { icon: Footprints, label: 'Caminata', isRide: false }
    if (/run/i.test(sport)) return { icon: Footprints, label: 'Carrera', isRide: false }
    return { icon: Activity, label: sport, isRide: false }
}

// «Más tarde» pospone la bandeja entera (no actividad a actividad): al volver
// aparecen todas las pendientes juntas en vez de en tandas.
const SNOOZE_STORAGE_KEY = 'strava:inbox-snoozed-until'
const LEGACY_SNOOZE_KEY = 'strava:pending-snoozed'
const SNOOZE_MS = 6 * 60 * 60 * 1000

function readSnoozedUntil(): number {
    try {
        window.localStorage.removeItem(LEGACY_SNOOZE_KEY)
        const value = Number(window.localStorage.getItem(SNOOZE_STORAGE_KEY))
        return Number.isFinite(value) && value > Date.now() ? value : 0
    } catch {
        return 0
    }
}

function writeSnoozedUntil(value: number) {
    try {
        window.localStorage.setItem(SNOOZE_STORAGE_KEY, String(value))
    } catch {
        // Sin almacenamiento la posposición dura solo mientras la app esté abierta
    }
}

export function StravaPendingFeedback() {
    const router = useRouter()
    const [activities, setActivities] = useState<PendingStravaActivity[]>([])
    const [snoozedUntil, setSnoozedUntil] = useState(0)
    const [openId, setOpenId] = useState<string | null>(null)
    const [rpe, setRpe] = useState<number | null>(null)
    const [notes, setNotes] = useState('')
    const [selectedSessionId, setSelectedSessionId] = useState('')
    const [saving, setSaving] = useState(false)
    const [ignoring, setIgnoring] = useState(false)
    const [zoneBounds, setZoneBounds] = useState<{ run: number[] | null; bike: number[] | null } | null>(null)

    // Límites de zona del atleta (RLS devuelve solo su fila)
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
        setSnoozedUntil(readSnoozedUntil())
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

    const today = useMemo(() => todayKey(), [])
    const groups = useMemo(() => groupByDay(activities, today), [activities, today])
    const totals = useMemo(() => inboxTotals(activities), [activities])
    // Con una sola pendiente se abre directamente su detalle
    const current = activities.find(item => item.id === openId) ?? (activities.length === 1 ? activities[0] : null)

    useEffect(() => {
        if (!current) return
        setRpe(null)
        setNotes('')
        const options = current.planned_sessions || []
        const matched = current.matched_planned_session_id
        setSelectedSessionId(matched && options.some(session => session.id === matched) ? matched : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.id])

    function removeResolved(activityId: string, usedSessionId: string | null) {
        setOpenId(null)
        setActivities(list => list
            .filter(item => item.id !== activityId)
            // Una sesión ya completada no puede ofrecerse a otra actividad
            .map(item => usedSessionId
                ? {
                    ...item,
                    planned_sessions: item.planned_sessions.filter(session => session.id !== usedSessionId),
                    matched_planned_session_id: item.matched_planned_session_id === usedSessionId ? null : item.matched_planned_session_id,
                }
                : item))
    }

    async function saveFeedback() {
        if (!current || rpe === null) return
        setSaving(true)
        const usedSessionId = selectedSessionId && selectedSessionId !== 'extra' ? selectedSessionId : null
        try {
            const res = await fetch(`/api/strava/activities/${current.id}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rpe,
                    athleteNotes: notes,
                    plannedSessionId: usedSessionId,
                    clearPlannedSessionMatch: selectedSessionId === 'extra',
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (res.status === 409 && data?.error) {
                    // La sesión elegida ya no está libre: se quita de las opciones
                    toast.error(data.error)
                    if (usedSessionId) {
                        setActivities(list => list.map(item => ({
                            ...item,
                            planned_sessions: item.planned_sessions.filter(session => session.id !== usedSessionId),
                        })))
                        setSelectedSessionId('')
                    }
                    return
                }
                throw new Error('feedback')
            }

            toast.success('Actividad registrada')
            removeResolved(current.id, usedSessionId)
            if (data?.cardioSessionId) {
                notifyStravaActivityCompleted({
                    cardioSessionId: data.cardioSessionId,
                    scheduledDate: data.scheduledDate ?? current.local_date,
                })
            }
            // Para que resumen y progreso muestren la sesión como realizada
            router.refresh()
        } catch {
            toast.error('No se pudo guardar la actividad')
        } finally {
            setSaving(false)
        }
    }

    async function ignoreCurrent() {
        if (!current) return
        setIgnoring(true)
        try {
            const res = await fetch(`/api/strava/activities/${current.id}/ignore`, { method: 'POST' })
            if (!res.ok) throw new Error('ignore')
            toast.success('Actividad descartada')
            removeResolved(current.id, null)
        } catch {
            toast.error('No se pudo descartar la actividad')
        } finally {
            setIgnoring(false)
        }
    }

    function snoozeInbox() {
        const until = Date.now() + SNOOZE_MS
        writeSnoozedUntil(until)
        setSnoozedUntil(until)
        setOpenId(null)
    }

    const open = activities.length > 0 && snoozedUntil <= Date.now()
    if (!open) return null

    return (
        <Dialog open onOpenChange={(value) => !value && snoozeInbox()}>
            <DialogContent className="flex max-h-[calc(100dvh-var(--safe-area-top,0px)-0.75rem)] w-[calc(100vw-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0 [&>button]:top-[calc(var(--safe-area-top,0px)+0.875rem)] sm:max-h-[88vh] sm:[&>button]:top-4">
                {current ? (
                    <ActivityDetail
                        activity={current}
                        canGoBack={activities.length > 1}
                        onBack={() => setOpenId(null)}
                        zoneBounds={zoneBounds}
                        selectedSessionId={selectedSessionId}
                        onSelectSession={setSelectedSessionId}
                        rpe={rpe}
                        onRpe={setRpe}
                        notes={notes}
                        onNotes={setNotes}
                        saving={saving}
                        ignoring={ignoring}
                        onSave={saveFeedback}
                        onIgnore={ignoreCurrent}
                        today={today}
                    />
                ) : (
                    <>
                        <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-5 pb-4 pt-[calc(var(--safe-area-top,0px)+1.25rem)] pr-12 text-left sm:pt-5">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                                    <Activity className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <DialogTitle className="text-lg leading-tight">
                                        {activities.length} actividades por registrar
                                    </DialogTitle>
                                    <DialogDescription className="text-xs">
                                        Strava · {inboxRange(activities).replace(/^del /, '')}
                                        {totals.hasDistance ? ` · ${totals.km} km` : ''}
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                            {groups.map(group => (
                                <section key={group.date} className="mb-3 last:mb-0">
                                    <h3 className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {group.label}
                                    </h3>
                                    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
                                        {group.items.map(item => (
                                            <li key={item.id}>
                                                <InboxRow activity={item} onOpen={() => setOpenId(item.id)} />
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>

                        <div className="shrink-0 border-t border-border/60 px-5 py-3 pb-[max(0.75rem,var(--safe-area-bottom,0px))]">
                            <p className="mb-2.5 text-center text-xs text-muted-foreground">
                                Toca una para decir a qué sesión corresponde y cómo te fue.
                            </p>
                            <Button variant="outline" className="h-11 w-full rounded-xl" onClick={snoozeInbox}>
                                Más tarde
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

function InboxRow({ activity, onOpen }: { activity: PendingStravaActivity; onOpen: () => void }) {
    const sport = sportOf(activity)
    const Icon = sport.icon
    const matched = activity.planned_sessions.find(session => session.id === activity.matched_planned_session_id)
    const stats = [formatDistance(activity.distance_meters), formatDuration(activity.moving_time_seconds)].filter(Boolean).join(' · ')

    return (
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{activity.name || sport.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatActivityTime(activity.start_date_local)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{stats || sport.label}</span>
                {matched ? (
                    <span className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        <Check className="h-3 w-3 shrink-0" />
                        <span className="truncate">{sessionName(matched)}</span>
                    </span>
                ) : activity.planned_sessions.length > 0 ? (
                    <span className="mt-1.5 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        Elige la sesión
                    </span>
                ) : null}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
    )
}

interface ActivityDetailProps {
    activity: PendingStravaActivity
    canGoBack: boolean
    onBack: () => void
    zoneBounds: { run: number[] | null; bike: number[] | null } | null
    selectedSessionId: string
    onSelectSession: (id: string) => void
    rpe: number | null
    onRpe: (value: number) => void
    notes: string
    onNotes: (value: string) => void
    saving: boolean
    ignoring: boolean
    onSave: () => void
    onIgnore: () => void
    today: string
}

function ActivityDetail({
    activity,
    canGoBack,
    onBack,
    zoneBounds,
    selectedSessionId,
    onSelectSession,
    rpe,
    onRpe,
    notes,
    onNotes,
    saving,
    ignoring,
    onSave,
    onIgnore,
    today,
}: ActivityDetailProps) {
    const sport = sportOf(activity)
    const Icon = sport.icon
    const plannedSessions = activity.planned_sessions || []
    const needsSession = plannedSessions.length > 0 && !selectedSessionId
    const busy = saving || ignoring

    // Zona de FC según los límites del deporte. La bici no reutiliza los de
    // carrera (su LTHR suele ser más bajo); si faltan, se avisa.
    const bounds = sport.isRide ? (zoneBounds?.bike ?? null) : (zoneBounds?.run ?? null)
    const bikeZonesPending = sport.isRide && !zoneBounds?.bike && Boolean(activity.average_heartrate)
    const hrZone = bounds && activity.average_heartrate ? describeHrZone(bounds, Math.round(Number(activity.average_heartrate))) : null
    // Sin stream, el pico evita que una sesión con series se lea como suave
    const peakZone = bounds && activity.max_heartrate ? describeHrZone(bounds, Math.round(Number(activity.max_heartrate))) : null
    const showPeakZone = peakZone && (!hrZone || peakZone.zone > hrZone.zone)

    const stats = [
        { label: 'Distancia', value: formatDistance(activity.distance_meters) },
        { label: 'Tiempo', value: formatDuration(activity.moving_time_seconds) },
        sport.isRide
            ? { label: 'Velocidad', value: formatCardioIntensity({ discipline: 'bicicleta', distanceKm: activity.distance_meters ? Number(activity.distance_meters) / 1000 : null, durationMin: activity.moving_time_seconds ? Number(activity.moving_time_seconds) / 60 : null, paceSecondsPerKm: activity.average_pace_seconds_per_km }) }
            : { label: 'Ritmo', value: formatPace(activity.average_pace_seconds_per_km) },
        { label: 'FC media', value: activity.average_heartrate ? `${Math.round(Number(activity.average_heartrate))} ppm` : null },
    ].filter(stat => stat.value)

    const saveLabel = needsSession ? 'Elige la sesión' : rpe === null ? 'Indica el esfuerzo' : 'Guardar'

    return (
        <>
            <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-5 pb-4 pt-[calc(var(--safe-area-top,0px)+1.25rem)] pr-12 text-left sm:pt-5">
                {canGoBack && (
                    <button type="button" onClick={onBack} disabled={busy} className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" /> Todas
                    </button>
                )}
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <DialogTitle className="truncate text-lg leading-tight">{activity.name || sport.label}</DialogTitle>
                        <DialogDescription className="text-xs">
                            {dayLabel(activity.local_date, today)} · {formatActivityTime(activity.start_date_local)} · {sport.label}
                        </DialogDescription>
                    </div>
                </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-4">
                {stats.length > 0 && (
                    <div>
                        <div className={cn('grid gap-2', stats.length >= 4 ? 'grid-cols-2 min-[400px]:grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                            {stats.map(stat => (
                                <div key={stat.label} className="min-w-0 rounded-xl bg-muted/60 px-2.5 py-2">
                                    <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                                    <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{stat.value}</p>
                                </div>
                            ))}
                        </div>
                        {(hrZone || showPeakZone || bikeZonesPending) && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                                {hrZone && (
                                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold', hrZone.badgeClass)} title="Zona de la FC media">
                                        <HeartPulse className="h-3 w-3" /> {hrZone.label}
                                    </span>
                                )}
                                {showPeakZone && peakZone && (
                                    <span className={cn('rounded-full border px-2 py-0.5 font-semibold', peakZone.badgeClass)} title={`Pico de ${Math.round(Number(activity.max_heartrate))} ppm`}>
                                        Pico Z{peakZone.zone}
                                    </span>
                                )}
                                {bikeZonesPending && (
                                    <span className="rounded-full border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                                        Zonas de bici pendientes
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {plannedSessions.length > 0 && (
                    <section className="space-y-2.5">
                        <h4 className="text-sm font-semibold">¿Qué sesión era?</h4>
                        <div className="space-y-2" role="radiogroup" aria-label="Sesión planificada">
                            {plannedSessions.map(session => {
                                const details = formatPlannedSession(session)
                                const sameDay = session.scheduled_date === activity.local_date
                                return (
                                    <ChoiceCard
                                        key={session.id}
                                        selected={selectedSessionId === session.id}
                                        onSelect={() => onSelectSession(session.id)}
                                        title={sessionName(session)}
                                        subtitle={details || undefined}
                                        badge={relativeDayLabel(activity.local_date, session.scheduled_date)}
                                        badgeStrong={sameDay}
                                    />
                                )
                            })}
                            <ChoiceCard
                                selected={selectedSessionId === 'extra'}
                                onSelect={() => onSelectSession('extra')}
                                title="Actividad extra"
                                subtitle="No era ninguna sesión del plan"
                            />
                        </div>
                    </section>
                )}

                <section className="space-y-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                        <h4 className="text-sm font-semibold">¿Cuánto te costó?</h4>
                        <span className="text-xs font-medium text-muted-foreground">
                            {rpe === null ? 'Esfuerzo de 1 a 10' : `${rpe}/10 · ${RPE_LABELS[rpe]}`}
                        </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Esfuerzo percibido">
                        {Array.from({ length: 10 }, (_, index) => index + 1).map(value => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={rpe === value}
                                aria-label={`${value}, ${RPE_LABELS[value]}`}
                                onClick={() => onRpe(value)}
                                className={cn(
                                    'h-10 rounded-xl border text-sm font-semibold tabular-nums transition-colors',
                                    rpe === value
                                        ? cn('border-transparent text-white', value <= 3 ? 'bg-emerald-500' : value <= 6 ? 'bg-amber-500' : value <= 8 ? 'bg-orange-500' : 'bg-rose-600')
                                        : 'border-border/70 bg-card hover:bg-muted',
                                )}
                            >
                                {value}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="space-y-2">
                    <label htmlFor="strava-notes" className="text-sm font-semibold">Notas para tu coach <span className="font-normal text-muted-foreground">(opcional)</span></label>
                    <Textarea
                        id="strava-notes"
                        value={notes}
                        onChange={event => onNotes(event.target.value)}
                        placeholder="Sensaciones, molestias, contexto…"
                        className="min-h-[80px] resize-none rounded-xl"
                    />
                </section>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-5 py-3 pb-[max(0.75rem,var(--safe-area-bottom,0px))]">
                <Button variant="ghost" onClick={onIgnore} disabled={busy} className="h-11 shrink-0 rounded-xl px-3 text-muted-foreground hover:text-destructive">
                    {ignoring && <Loader2 className="h-4 w-4 animate-spin" />}
                    No importar
                </Button>
                <Button onClick={onSave} disabled={busy || needsSession || rpe === null} className="h-11 flex-1 rounded-xl text-[15px] font-semibold">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : !needsSession && rpe !== null ? <Check className="h-4 w-4" /> : null}
                    {saveLabel}
                </Button>
            </div>
        </>
    )
}

function ChoiceCard({ selected, onSelect, title, subtitle, badge, badgeStrong }: {
    selected: boolean
    onSelect: () => void
    title: string
    subtitle?: string
    badge?: string
    badgeStrong?: boolean
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/70 bg-card hover:bg-muted/50',
            )}
        >
            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{title}</span>
                {subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>}
            </span>
            {badge && (
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', badgeStrong ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                    {badge}
                </span>
            )}
        </button>
    )
}
