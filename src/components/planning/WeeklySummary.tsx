import { Card } from '@/components/ui/card'
import { CalendarItem } from '@/data/client-schedule'
import {
    Dumbbell,
    Footprints,
    Bike,
    Waves,
    Shuffle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface WeeklySummaryCardProps {
    items: CalendarItem[]
}

// ---------------------------------------------------------------------------
// Categorías de deporte con su metadato visual
// ---------------------------------------------------------------------------
type SportCategory = 'running' | 'bike' | 'swim' | 'hybrid' | 'strength'

interface SportMeta {
    label: string
    icon: React.ReactNode
    color: string        // text-*
    barColor: string     // bg-*
    hasDistance: boolean
}

const SPORT_META: Record<SportCategory, SportMeta> = {
    running: {
        label: 'Running',
        icon: <Footprints className="h-4 w-4" />,
        color: 'text-green-500',
        barColor: 'bg-green-500',
        hasDistance: true,
    },
    bike: {
        label: 'Bicicleta',
        icon: <Bike className="h-4 w-4" />,
        color: 'text-cyan-500',
        barColor: 'bg-cyan-500',
        hasDistance: true,
    },
    swim: {
        label: 'Natación',
        icon: <Waves className="h-4 w-4" />,
        color: 'text-teal-500',
        barColor: 'bg-teal-500',
        hasDistance: true,
    },
    hybrid: {
        label: 'Híbrido',
        icon: <Shuffle className="h-4 w-4" />,
        color: 'text-purple-500',
        barColor: 'bg-purple-500',
        hasDistance: false,
    },
    strength: {
        label: 'Fuerza',
        icon: <Dumbbell className="h-4 w-4" />,
        color: 'text-warning',
        barColor: 'bg-warning',
        hasDistance: false,
    },
}

// ---------------------------------------------------------------------------
// Mapea trainingType / activityType → categoría de deporte
// ---------------------------------------------------------------------------
function resolveCategory(item: CalendarItem): SportCategory {
    if (item.kind === 'strength') return 'strength'

    const t = (item.trainingType ?? item.activityType ?? '').toLowerCase()
    if (t === 'bike' || t === 'bicicleta') return 'bike'
    if (t === 'swim' || t === 'natacion' || t === 'natación') return 'swim'
    if (t === 'hybrid' || t === 'hibrido' || t === 'híbrido') return 'hybrid'
    // Todo lo demás (rodaje, series, tempo, fartlek, progressive, default) → running
    return 'running'
}

// ---------------------------------------------------------------------------
// Stats por categoría
// ---------------------------------------------------------------------------
interface SportStats {
    category: SportCategory
    total: number
    completed: number
    plannedKm: number
    completedKm: number
}

export function WeeklySummary({ items }: WeeklySummaryCardProps) {
    const activeSessions = items.filter(i => i.kind !== 'rest')

    if (activeSessions.length === 0) {
        return (
            <Card className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Resumen semanal</h3>
                <p className="text-sm text-muted-foreground">No hay sesiones planificadas esta semana.</p>
            </Card>
        )
    }

    // Agrupar por categoría manteniendo el orden de aparición
    const statsMap = new Map<SportCategory, SportStats>()
    const ORDER: SportCategory[] = ['running', 'bike', 'swim', 'hybrid', 'strength']

    for (const item of activeSessions) {
        const cat = resolveCategory(item)
        if (!statsMap.has(cat)) {
            statsMap.set(cat, { category: cat, total: 0, completed: 0, plannedKm: 0, completedKm: 0 })
        }
        const s = statsMap.get(cat)!
        s.total++
        if (item.isCompleted) {
            s.completed++
            s.completedKm += item.actualDistanceKm ?? item.targetDistanceKm ?? 0
        }
        s.plannedKm += item.targetDistanceKm ?? 0
    }

    // Ordenar categorías según ORDER
    const stats = ORDER.map(cat => statsMap.get(cat)).filter(Boolean) as SportStats[]

    // Si solo hay 1 bloque, ocupa toda la fila; si hay más, en grid 2 columnas
    const gridCols = stats.length === 1 ? 'grid-cols-1' : 'grid-cols-2'

    // Bloques de distancia: categorías con distancia planificada > 0
    const distanceStats = stats.filter(s => SPORT_META[s.category].hasDistance && s.plannedKm > 0)

    return (
        <Card className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Resumen semanal</h3>

            {/* Grid de sesiones por deporte */}
            <div className={cn('grid gap-4', gridCols)}>
                {stats.map(s => {
                    const meta = SPORT_META[s.category]
                    const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0
                    return (
                        <div key={s.category} className="space-y-1">
                            <div className={cn('flex items-center gap-1.5', meta.color)}>
                                {meta.icon}
                                <span className="text-sm text-muted-foreground">{meta.label}</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-bold">{s.completed}</span>
                                <span className="text-muted-foreground text-sm">/ {s.total} sesiones</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={cn('h-full rounded-full transition-all', meta.barColor)}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Bloque de distancias (solo para deportes con km) */}
            {distanceStats.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border space-y-3">
                    {distanceStats.map(s => {
                        const meta = SPORT_META[s.category]
                        const pct = s.plannedKm > 0
                            ? Math.round((s.completedKm / s.plannedKm) * 100)
                            : 0
                        return (
                            <div key={`dist-${s.category}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <div className={cn('flex items-center gap-1.5 text-xs', meta.color)}>
                                        {meta.icon}
                                        <span className="text-muted-foreground">Distancia {meta.label}</span>
                                    </div>
                                    <span className="text-xs font-medium tabular-nums">
                                        {s.completedKm.toFixed(1)} / {s.plannedKm.toFixed(1)} km
                                    </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={cn('h-full rounded-full transition-all', meta.barColor)}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </Card>
    )
}
