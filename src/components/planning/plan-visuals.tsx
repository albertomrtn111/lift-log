import {
    Bike,
    Dumbbell,
    Footprints,
    Gauge,
    Moon,
    Shuffle,
    TrendingUp,
    Waves,
    Zap,
    type LucideIcon,
} from 'lucide-react'
import type { CalendarItem } from '@/data/client-schedule'
import { resolveCardioDisplayKind } from '@/lib/cardio/display-kind'

// Identidad visual de cada tipo de sesión del plan. Las clases van escritas
// enteras para que Tailwind las detecte.

export type PlanSport = 'running' | 'bike' | 'swim' | 'hybrid' | 'strength'

export interface SessionVisual {
    icon: LucideIcon
    label: string
    sport: PlanSport | null
    /** Barra lateral y puntos sólidos */
    accent: string
    /** Punto de sesión aún sin hacer */
    softDot: string
    /** Fondo + color del icono */
    tile: string
}

const VISUALS = {
    running: {
        icon: Footprints,
        label: 'Rodaje',
        sport: 'running',
        accent: 'bg-emerald-500',
        softDot: 'bg-emerald-500/50',
        tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    series: {
        icon: Zap,
        label: 'Series',
        sport: 'running',
        accent: 'bg-amber-500',
        softDot: 'bg-amber-500/50',
        tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    tempo: {
        icon: Gauge,
        label: 'Tempo',
        sport: 'running',
        accent: 'bg-blue-500',
        softDot: 'bg-blue-500/50',
        tile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    progressive: {
        icon: TrendingUp,
        label: 'Progresivo',
        sport: 'running',
        accent: 'bg-indigo-500',
        softDot: 'bg-indigo-500/50',
        tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    },
    fartlek: {
        icon: Shuffle,
        label: 'Fartlek',
        sport: 'running',
        accent: 'bg-pink-500',
        softDot: 'bg-pink-500/50',
        tile: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    },
    hybrid: {
        icon: Shuffle,
        label: 'Híbrido',
        sport: 'hybrid',
        accent: 'bg-purple-500',
        softDot: 'bg-purple-500/50',
        tile: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    },
    bike: {
        icon: Bike,
        label: 'Bici',
        sport: 'bike',
        accent: 'bg-cyan-500',
        softDot: 'bg-cyan-500/50',
        tile: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    },
    swim: {
        icon: Waves,
        label: 'Natación',
        sport: 'swim',
        accent: 'bg-sky-500',
        softDot: 'bg-sky-500/50',
        tile: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    },
    strength: {
        icon: Dumbbell,
        label: 'Fuerza',
        sport: 'strength',
        accent: 'bg-orange-500',
        softDot: 'bg-orange-500/50',
        tile: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    },
    rest: {
        icon: Moon,
        label: 'Descanso',
        sport: null,
        accent: 'bg-muted-foreground/50',
        softDot: 'bg-muted-foreground/20',
        tile: 'bg-muted text-muted-foreground',
    },
} satisfies Record<string, SessionVisual>

export function getSessionVisual(item: CalendarItem): SessionVisual {
    if (item.kind === 'rest') return VISUALS.rest
    if (item.kind === 'strength') return VISUALS.strength
    return VISUALS[resolveCardioDisplayKind(item.activityType, item.trainingType) as keyof typeof VISUALS] ?? VISUALS.running
}

export const SPORT_SUMMARY: Record<PlanSport, { label: string; icon: LucideIcon; accent: string; tile: string }> = {
    running: { label: 'Running', icon: Footprints, accent: VISUALS.running.accent, tile: VISUALS.running.tile },
    bike: { label: 'Bicicleta', icon: Bike, accent: VISUALS.bike.accent, tile: VISUALS.bike.tile },
    swim: { label: 'Natación', icon: Waves, accent: VISUALS.swim.accent, tile: VISUALS.swim.tile },
    hybrid: { label: 'Híbrido', icon: Shuffle, accent: VISUALS.hybrid.accent, tile: VISUALS.hybrid.tile },
    strength: { label: 'Fuerza', icon: Dumbbell, accent: VISUALS.strength.accent, tile: VISUALS.strength.tile },
}

export type SessionStatus = 'completed' | 'today' | 'missed' | 'upcoming' | 'rest'

export function getSessionStatus(item: CalendarItem, today: string): SessionStatus {
    if (item.kind === 'rest') return 'rest'
    if (item.isCompleted) return 'completed'
    if (item.date === today) return 'today'
    if (item.date < today) return 'missed'
    return 'upcoming'
}

// ------------------------------------------------------------------
// Formato
// ------------------------------------------------------------------

const kmFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

export function formatKm(value: number) {
    return `${kmFormatter.format(value)} km`
}

export function formatMinutes(totalMinutes: number) {
    const rounded = Math.round(totalMinutes)
    if (rounded < 60) return `${rounded} min`
    const hours = Math.floor(rounded / 60)
    const minutes = rounded % 60
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes.toString().padStart(2, '0')}`
}

export function toLocalDateStr(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export function parseDateStr(value: string) {
    return new Date(`${value}T12:00:00`)
}
