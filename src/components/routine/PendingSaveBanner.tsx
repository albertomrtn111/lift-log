'use client'

import { CloudOff, Loader2, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExerciseSet } from '@/types/training'
import type { StrengthSyncStatus } from '@/hooks/useStrengthSaveQueue'

/**
 * Aviso de Fuerza cuando hay cambios sin guardar en el servidor (NXT-146).
 * En el móvil flota encima de la barra de pestañas para verse siempre.
 */
export function PendingSaveBanner({
    status,
    pendingCount,
    onRetry,
    className,
}: {
    status: StrengthSyncStatus
    pendingCount: number
    onRetry: () => void
    className?: string
}) {
    if (pendingCount === 0) return null

    const changes = `${pendingCount} ${pendingCount === 1 ? 'cambio' : 'cambios'}`
    const saving = status === 'saving'
    const title = saving
        ? `Guardando ${changes}…`
        : status === 'retrying'
            ? `${changes[0].toUpperCase()}${changes.slice(1)} sin guardar`
            : `Sin conexión · ${changes} sin guardar`
    const detail = saving
        ? 'Lo marcado en ámbar aún no ha llegado a tu coach.'
        : status === 'retrying'
            ? 'No se ha podido guardar. Lo volvemos a intentar solo.'
            : 'Se quedan en este móvil y se guardarán solos cuando vuelva la cobertura.'

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'fixed inset-x-4 bottom-[var(--client-tab-bar-space)] z-40 md:static md:inset-auto',
                className
            )}
        >
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-card/95 p-3 shadow-lg backdrop-blur md:shadow-none">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{detail}</p>
                </div>
                {!saving && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                    >
                        <RotateCw className="h-3.5 w-3.5" />
                        Reintentar
                    </button>
                )}
            </div>
        </div>
    )
}

/** Clase para una casilla de serie cuyo valor aún no ha confirmado el servidor */
export function pendingFieldClass(set: ExerciseSet, field: 'weightKg' | 'reps' | 'rir') {
    return set.pendingFields?.includes(field)
        ? 'border-dashed border-amber-500/70 bg-amber-500/10 dark:border-amber-400/60'
        : undefined
}

/** ¿Alguna serie del ejercicio tiene algo sin guardar? */
export function hasPendingSets(sets: ExerciseSet[]) {
    return sets.some(s => (s.pendingFields?.length ?? 0) > 0)
}
