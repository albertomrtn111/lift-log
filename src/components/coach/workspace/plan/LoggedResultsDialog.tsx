'use client'

import { useEffect, useState } from 'react'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { formatWeekList } from '@/lib/training/strength-structure-plan'
import type { StrengthResultConflict } from '@/lib/training/strength-results-data'

export type LoggedResultsDecision = 'keep' | 'delete' | 'cancel'

export type LoggedResultsPrompt = {
    conflicts: StrengthResultConflict[]
    /** structure: IA o plantilla · days: quitar días en el paso 2 */
    context: 'structure' | 'days'
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count === 1 ? one : many}`
}

/** «9 series · sem. 1–3» */
export function describeLoggedResults({ sets, weeks, completedSessions = 0 }: { sets: number; weeks: number[]; completedSessions?: number }) {
    const parts: string[] = []
    if (completedSessions > 0) parts.push(plural(completedSessions, 'sesión completada', 'sesiones completadas'))
    if (sets > 0) parts.push(plural(sets, 'serie', 'series'))
    const weekList = formatWeekList(weeks)
    if (weekList) parts.push(`sem. ${weekList}`)
    return parts.join(' · ') || 'Con registros'
}

/** «semanas 1–3» / «semana 2» */
export function describeWeeks(weeks: number[]) {
    const list = formatWeekList(weeks)
    if (!list) return ''
    return `${weeks.length === 1 ? 'semana' : 'semanas'} ${list}`
}

/**
 * Aviso antes de quitar algo que el atleta ya ha entrenado (NXT-124).
 * Cerrar el aviso equivale a cancelar: no se toca nada.
 */
export function LoggedResultsDialog({
    prompt,
    onResolve,
}: {
    prompt: LoggedResultsPrompt | null
    onResolve: (decision: LoggedResultsDecision) => void
}) {
    // Mientras se cierra, el aviso sigue mostrando lo último que enseñó.
    const [lastPrompt, setLastPrompt] = useState(prompt)
    useEffect(() => {
        if (prompt) setLastPrompt(prompt)
    }, [prompt])
    const shown = prompt ?? lastPrompt
    const conflicts = shown?.conflicts ?? []
    const hasDays = conflicts.some(conflict => conflict.kind === 'day')
    const hasExercises = conflicts.some(conflict => conflict.kind === 'exercise')
    const totalSets = conflicts.reduce((sum, conflict) => sum + conflict.sets, 0)
    const single = conflicts.length === 1

    const title = hasDays && hasExercises
        ? 'Hay ejercicios y días con entrenamientos registrados'
        : hasDays
            ? (single ? 'Este día tiene entrenamientos registrados' : 'Hay días con entrenamientos registrados')
            : 'Hay ejercicios con series registradas'
    const what = hasDays && hasExercises ? 'ejercicios y días' : hasDays ? (single ? 'un día' : 'días') : (single ? 'un ejercicio' : 'ejercicios')
    const description = shown?.context === 'days'
        ? `Vas a quitar ${what} que el atleta ya ha entrenado.`
        : `Con estos cambios se quitarían ${what} que el atleta ya ha entrenado.`
    const keepHelp = shown?.context === 'days'
        ? (single ? '«Conservarlo» deja el día como estaba.' : '«Conservarlos» deja esos días como estaban.')
        : `«${single ? 'Conservarlo' : 'Conservarlos'}» aplica el resto de cambios y ${hasDays && !hasExercises ? 'deja esos días al final del programa' : 'los deja al final de su día'}.`
    const deleteLabel = `${single ? 'Quitarlo' : 'Quitarlos'} y borrar ${totalSets > 0 ? plural(totalSets, 'serie', 'series') : 'sus registros'}`

    return (
        <AlertDialog open={!!prompt} onOpenChange={open => { if (!open) onResolve('cancel') }}>
            <AlertDialogContent className="max-w-lg rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>

                <ul className="max-h-60 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
                    {conflicts.map(conflict => (
                        <li key={conflict.id} className="space-y-0.5 px-3 py-2.5">
                            <p className="text-sm font-medium">
                                {conflict.name}
                                <span className="font-normal text-muted-foreground">
                                    {' · '}{conflict.kind === 'day' ? 'día entero' : conflict.dayName}
                                </span>
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                                {describeLoggedResults({
                                    sets: conflict.sets,
                                    weeks: conflict.weeks,
                                    completedSessions: conflict.kind === 'day' ? conflict.completedSessions : 0,
                                })}
                            </p>
                        </li>
                    ))}
                </ul>

                {shown?.context === 'structure' && (
                    <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
                        Si es un cambio grande, crea un programa nuevo: el actual se archiva con todo su historial.
                    </p>
                )}
                <p className="text-xs text-muted-foreground">{keepHelp}</p>

                <AlertDialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
                    <Button variant="ghost" onClick={() => onResolve('cancel')}>Cancelar</Button>
                    <Button
                        variant="outline"
                        className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onResolve('delete')}
                    >
                        {deleteLabel}
                    </Button>
                    <Button onClick={() => onResolve('keep')}>{single ? 'Conservarlo' : 'Conservarlos'}</Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
