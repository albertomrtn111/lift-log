import { Bike, Dumbbell, Route as RouteIcon, Waves, Zap } from 'lucide-react'
import type { ElementType } from 'react'
import type { SeasonDiscipline, SeasonWeekType } from '@/types/season'

// Mismos colores que Progreso → Cardio (carrera teal, bici ámbar, natación
// azul, híbrido violeta) y Planificación (fuerza rojo)
export const DISCIPLINE_META: Record<SeasonDiscipline, {
    label: string
    icon: ElementType
    color: string
    chipClass: string
}> = {
    run: { label: 'Carrera', icon: RouteIcon, color: '#14b8a6', chipClass: 'bg-teal-500/10 text-teal-700 dark:text-teal-400' },
    bike: { label: 'Bici', icon: Bike, color: '#f59e0b', chipClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    swim: { label: 'Natación', icon: Waves, color: '#3b82f6', chipClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
    strength: { label: 'Fuerza', icon: Dumbbell, color: '#ef4444', chipClass: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    other: { label: 'Otros', icon: Zap, color: '#8b5cf6', chipClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-400' },
}

export const WEEK_TYPE_META: Record<SeasonWeekType, { label: string; badgeClass: string }> = {
    carga: { label: 'Carga', badgeClass: 'bg-muted text-muted-foreground' },
    descarga: { label: 'Descarga', badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
    test: { label: 'Test', badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    competicion: { label: 'Competición', badgeClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-400' },
    transicion: { label: 'Transición', badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
}

export const WEEK_TYPES = Object.keys(WEEK_TYPE_META) as SeasonWeekType[]

export const dayLabel = (value: string) =>
    new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`))

/** Clases de texto según la desviación (deviationStatus) */
export const DEVIATION_TEXT: Record<string, string> = {
    none: 'text-muted-foreground',
    empty: 'text-rose-600 dark:text-rose-400',
    low: 'text-amber-600 dark:text-amber-400',
    ok: 'text-emerald-600 dark:text-emerald-400',
    high: 'text-violet-600 dark:text-violet-400',
}
