'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Check, Clock, HeartPulse, Loader2, Route } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

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

function formatDate(value: string | null) {
    if (!value) return ''
    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
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
    const [activities, setActivities] = useState<PendingStravaActivity[]>([])
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())
    const [rpe, setRpe] = useState(5)
    const [notes, setNotes] = useState('')
    const [selectedSessionId, setSelectedSessionId] = useState('')
    const [saving, setSaving] = useState(false)
    const [ignoring, setIgnoring] = useState(false)

    async function loadPending() {
        try {
            const res = await fetch('/api/strava/activities/pending', { cache: 'no-store' })
            if (!res.ok) return
            const data = await res.json()
            setActivities(data.activities || [])
        } catch {
            setActivities([])
        }
    }

    useEffect(() => {
        loadPending()
        window.addEventListener('strava:pending-updated', loadPending)
        return () => window.removeEventListener('strava:pending-updated', loadPending)
    }, [])

    const activity = useMemo(
        () => activities.find((item) => !dismissedIds.has(item.id)) || null,
        [activities, dismissedIds]
    )

    useEffect(() => {
        if (activity) {
            setRpe(5)
            setNotes('')
            setSelectedSessionId(activity.matched_planned_session_id || '')
        }
    }, [activity?.id])

    async function saveFeedback() {
        if (!activity) return
        setSaving(true)
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
            if (!res.ok) throw new Error('feedback')
            toast.success('Actividad registrada')
            setActivities((current) => current.filter((item) => item.id !== activity.id))
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
            setActivities((current) => current.filter((item) => item.id !== activity.id))
        } catch {
            toast.error('No se pudo descartar la actividad')
        } finally {
            setIgnoring(false)
        }
    }

    function dismissCurrent() {
        if (!activity) return
        setDismissedIds((current) => new Set(current).add(activity.id))
    }

    if (!activity) return null

    const pace = formatPace(activity.average_pace_seconds_per_km)
    const sportType = activity.sport_type || activity.activity_type || 'Cardio'
    const plannedSessions = activity.planned_sessions || []
    const requiresSessionChoice = plannedSessions.length > 0 && !selectedSessionId

    return (
        <Dialog open={!!activity} onOpenChange={(open) => !open && dismissCurrent()}>
            <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden p-0">
                <DialogHeader className="border-b px-5 py-5 pr-12 text-left">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                        <Activity className="h-5 w-5 text-orange-600" />
                    </div>
                    <DialogTitle>Nueva actividad importada</DialogTitle>
                    <DialogDescription>{activity.name || 'Actividad importada'}</DialogDescription>
                </DialogHeader>

                <div className="space-y-5 px-5 py-5">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-border p-3">
                            <p className="text-xs text-muted-foreground">Fecha</p>
                            <p className="mt-1 font-semibold">{formatDate(activity.start_date_local)}</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                            <p className="text-xs text-muted-foreground">Tipo</p>
                            <p className="mt-1 font-semibold">{sportType}</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Route className="h-3 w-3" />
                                Distancia
                            </p>
                            <p className="mt-1 font-semibold">{formatDistance(activity.distance_meters)}</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                Tiempo
                            </p>
                            <p className="mt-1 font-semibold">{formatDuration(activity.moving_time_seconds)}</p>
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
                    </div>

                    {plannedSessions.length > 0 && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm font-medium">¿Qué actividad has realizado?</p>
                                <p className="text-xs text-muted-foreground">
                                    Elige una sesión planificada de esta semana o márcala como extra.
                                </p>
                            </div>
                            <RadioGroup value={selectedSessionId} onValueChange={setSelectedSessionId} className="space-y-2">
                                {plannedSessions.map((session) => {
                                    const details = formatPlannedSession(session)
                                    return (
                                        <Label
                                            key={session.id}
                                            htmlFor={`strava-session-${session.id}`}
                                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                                        >
                                            <RadioGroupItem id={`strava-session-${session.id}`} value={session.id} className="mt-1" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold">
                                                    {session.name || session.training_type || session.activity_type || 'Cardio'}
                                                </span>
                                                <span className="mt-0.5 block text-xs text-muted-foreground">
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
                    </div>

                    <Textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Notas, sensaciones o contexto para tu coach"
                        className="min-h-[96px] resize-none"
                    />
                </div>

                <DialogFooter className="flex-col gap-2 border-t px-5 py-4 sm:flex-row">
                    <Button variant="outline" onClick={dismissCurrent} disabled={saving}>
                        Ahora no
                    </Button>
                    <Button variant="ghost" onClick={ignoreCurrent} disabled={saving || ignoring} className="text-destructive hover:text-destructive">
                        {ignoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        No importar
                    </Button>
                    <Button onClick={saveFeedback} disabled={saving || ignoring || requiresSessionChoice} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Importar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
