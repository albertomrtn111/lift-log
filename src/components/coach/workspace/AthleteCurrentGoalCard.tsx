'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Pencil, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    ATHLETE_GOAL_TYPES,
    type AthleteCurrentGoal,
    type AthleteCurrentGoalInput,
    type AthleteGoalType,
} from '@/types/athlete-current-goal'
import {
    deleteAthleteCurrentGoalAction,
    saveAthleteCurrentGoalAction,
} from './athlete-current-goal-actions'

interface AthleteCurrentGoalCardProps {
    coachId: string
    clientId: string
    goal: AthleteCurrentGoal | null
}

function localToday() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toForm(goal: AthleteCurrentGoal | null): AthleteCurrentGoalInput {
    return goal
        ? {
            goal_type: goal.goal_type,
            title: goal.title,
            start_date: goal.start_date,
            target_date: goal.target_date,
            notes: goal.notes,
        }
        : { goal_type: 'recomposition', title: '', start_date: localToday(), target_date: '', notes: null }
}

function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
    })
}

function daysBetween(from: string, to: string) {
    return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000)
}

export function AthleteCurrentGoalCard({ coachId, clientId, goal: initialGoal }: AthleteCurrentGoalCardProps) {
    const router = useRouter()
    const [goal, setGoal] = useState(initialGoal)
    const [form, setForm] = useState<AthleteCurrentGoalInput>(() => toForm(initialGoal))
    const [editing, setEditing] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [pending, setPending] = useState(false)

    useEffect(() => {
        setGoal(initialGoal)
        setForm(toForm(initialGoal))
    }, [initialGoal])

    const update = <K extends keyof AthleteCurrentGoalInput>(key: K, value: AthleteCurrentGoalInput[K]) => {
        setForm(current => ({ ...current, [key]: value }))
    }

    const save = () => {
        if (!form.title.trim() || !form.start_date || !form.target_date) {
            toast.error('Completa el objetivo y las dos fechas.')
            return
        }
        if (form.target_date < form.start_date) {
            toast.error('La fecha límite debe ser posterior al inicio.')
            return
        }
        setPending(true)
        void saveAthleteCurrentGoalAction(coachId, clientId, form).then(result => {
            if (!result.success || !result.goal) {
                toast.error(result.error || 'No se pudo guardar el objetivo.')
                return
            }
            setGoal(result.goal)
            setForm(toForm(result.goal))
            setEditing(false)
            toast.success('Objetivo actual guardado.')
            router.refresh()
        }).catch(() => toast.error('No se pudo guardar el objetivo.')).finally(() => setPending(false))
    }

    const remove = () => {
        setPending(true)
        void deleteAthleteCurrentGoalAction(coachId, clientId).then(result => {
            if (!result.success) {
                toast.error(result.error || 'No se pudo quitar el objetivo.')
                return
            }
            setGoal(null)
            setForm(toForm(null))
            setConfirmDelete(false)
            toast.success('Objetivo actual quitado.')
            router.refresh()
        }).catch(() => toast.error('No se pudo quitar el objetivo.')).finally(() => setPending(false))
    }

    const today = localToday()
    const remaining = goal ? daysBetween(today, goal.target_date) : null
    const duration = goal ? Math.max(1, daysBetween(goal.start_date, goal.target_date)) : 0
    const elapsed = goal ? Math.max(0, daysBetween(goal.start_date, today)) : 0
    const progress = goal ? Math.min(100, Math.round((elapsed / duration) * 100)) : 0
    const typeLabel = ATHLETE_GOAL_TYPES.find(type => type.value === goal?.goal_type)?.label

    return (
        <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-semibold">Objetivo actual</h2>
                        <p className="text-xs text-muted-foreground">La fase en la que está trabajando el atleta</p>
                    </div>
                </div>
                {!editing && (
                    <Button
                        type="button"
                        variant={goal ? 'outline' : 'default'}
                        className="min-h-10 w-full sm:w-auto"
                        onClick={() => { setForm(toForm(goal)); setEditing(true); setConfirmDelete(false) }}
                    >
                        {goal ? <Pencil className="mr-2 h-4 w-4" /> : <Target className="mr-2 h-4 w-4" />}
                        {goal ? 'Editar objetivo' : 'Definir objetivo'}
                    </Button>
                )}
            </div>

            {editing ? (
                <div className="space-y-5 p-4 sm:p-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`goal-type-${clientId}`}>Tipo de objetivo</Label>
                            <select
                                id={`goal-type-${clientId}`}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={form.goal_type}
                                onChange={event => update('goal_type', event.target.value as AthleteGoalType)}
                                disabled={pending}
                            >
                                {ATHLETE_GOAL_TYPES.map(type => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`goal-title-${clientId}`}>Objetivo concreto</Label>
                            <Input
                                id={`goal-title-${clientId}`}
                                value={form.title}
                                onChange={event => update('title', event.target.value)}
                                placeholder="Ej.: preparar una maratón o ganar masa muscular"
                                maxLength={160}
                                disabled={pending}
                            />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`goal-start-${clientId}`}>Fecha de inicio</Label>
                            <Input id={`goal-start-${clientId}`} type="date" className="min-w-0" value={form.start_date}
                                onChange={event => update('start_date', event.target.value)} disabled={pending} />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`goal-end-${clientId}`}>Fecha límite</Label>
                            <Input id={`goal-end-${clientId}`} type="date" className="min-w-0" value={form.target_date}
                                min={form.start_date} onChange={event => update('target_date', event.target.value)} disabled={pending} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`goal-notes-${clientId}`}>Notas para el coach (opcional)</Label>
                            <Textarea
                                id={`goal-notes-${clientId}`}
                                value={form.notes ?? ''}
                                onChange={event => update('notes', event.target.value)}
                                placeholder="Ej.: priorizar adherencia, mejorar marca o llegar a una prueba concreta"
                                maxLength={1000}
                                rows={3}
                                disabled={pending}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" className="min-h-10" disabled={pending}
                            onClick={() => { setForm(toForm(goal)); setEditing(false) }}>Cancelar</Button>
                        <Button type="button" className="min-h-10" disabled={pending} onClick={save}>
                            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar objetivo
                        </Button>
                    </div>
                </div>
            ) : goal ? (
                <div className="min-w-0 space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{typeLabel}</Badge>
                        {remaining !== null && (
                            <Badge variant={remaining < 0 ? 'destructive' : 'outline'}>
                                {remaining < 0 ? 'Plazo vencido' : remaining === 0 ? 'Vence hoy' : `${remaining} días restantes`}
                            </Badge>
                        )}
                    </div>
                    <p className="break-words text-lg font-semibold leading-snug">{goal.title}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span>{formatDate(goal.start_date)}</span>
                        <span aria-hidden="true">→</span>
                        <span>{formatDate(goal.target_date)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Tiempo transcurrido del objetivo"
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                    {goal.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{goal.notes}</p>}
                    {confirmDelete ? (
                        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm">¿Quitar este objetivo actual?</p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button type="button" variant="outline" className="min-h-10" disabled={pending}
                                    onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                                <Button type="button" variant="destructive" className="min-h-10" disabled={pending} onClick={remove}>
                                    {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Quitar objetivo
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button type="button" variant="ghost" className="min-h-10 px-2 text-muted-foreground"
                            onClick={() => setConfirmDelete(true)}>
                            <Trash2 className="mr-2 h-4 w-4" />Quitar objetivo
                        </Button>
                    )}
                </div>
            ) : (
                <p className="p-4 text-sm text-muted-foreground sm:p-5">
                    Define si está en recomposición, definición, volumen o preparando una prueba, y hasta cuándo.
                </p>
            )}
        </Card>
    )
}
