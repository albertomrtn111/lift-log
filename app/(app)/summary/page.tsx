'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    BarChart3,
    TrendingUp,
    Target,
    Calendar,
    Scale,
    Dumbbell,
    MessageSquare
} from 'lucide-react'
import { mockDailyMetrics, mockProgram } from '@/data/mockData'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function SummaryPage() {
    // Calculate stats
    const recentWeights = mockDailyMetrics
        .filter(m => m.weight)
        .slice(0, 7)
        .map(m => m.weight!)

    const avgWeight = recentWeights.length
        ? (recentWeights.reduce((a, b) => a + b, 0) / recentWeights.length).toFixed(1)
        : '--'

    const weightTrend = recentWeights.length >= 2
        ? (recentWeights[0] - recentWeights[recentWeights.length - 1]).toFixed(1)
        : null

    const trainedDays = 4 // Mock data
    const totalDays = 5
    const adherencePercent = Math.round((trainedDays / totalDays) * 100)

    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Resumen</h1>
                            <p className="text-sm text-muted-foreground">Tu progreso general</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 pt-4 space-y-4">
                {/* Current program */}
                <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                    <div className="flex items-start justify-between">
                        <div>
                            <Badge variant="secondary" className="mb-2 bg-primary/20 text-primary border-0">
                                Programa activo
                            </Badge>
                            <h2 className="font-bold text-lg">{mockProgram.name}</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Semana 3 de {mockProgram.totalWeeks}
                            </p>
                        </div>
                        <Dumbbell className="h-8 w-8 text-primary/40" />
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Progreso</span>
                            <span className="font-medium">50%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-bar-fill" style={{ width: '50%' }} />
                        </div>
                    </div>
                </Card>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4 card-hover">
                        <div className="flex items-center gap-2 mb-2">
                            <Scale className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Peso medio</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-bold">{avgWeight}</span>
                            <span className="text-muted-foreground text-sm mb-0.5">kg</span>
                        </div>
                        {weightTrend && (
                            <div className="flex items-center gap-1 mt-1">
                                <TrendingUp className={`h-3 w-3 ${parseFloat(weightTrend) > 0 ? 'text-success' : 'text-destructive'}`} />
                                <span className="text-xs text-muted-foreground">
                                    {parseFloat(weightTrend) > 0 ? '+' : ''}{weightTrend} kg
                                </span>
                            </div>
                        )}
                    </Card>

                    <Card className="p-4 card-hover">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-success" />
                            <span className="text-sm text-muted-foreground">Adherencia</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-bold">{adherencePercent}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {trainedDays}/{totalDays} días esta semana
                        </p>
                    </Card>
                </div>

                {/* Weight mini chart (simplified) */}
                <Card className="p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Evolución peso (7 días)
                    </h3>
                    <div className="flex items-end justify-between h-24 gap-1">
                        {mockDailyMetrics.slice(0, 7).reverse().map((entry, i) => {
                            const height = entry.weight
                                ? ((entry.weight - 77) / 3) * 100 // Normalize between 77-80kg
                                : 0
                            return (
                                <div key={entry.id} className="flex-1 flex flex-col items-center gap-1">
                                    <div
                                        className="w-full bg-primary/20 rounded-t transition-all duration-500"
                                        style={{ height: `${Math.max(20, Math.min(100, height))}%` }}
                                    >
                                        <div
                                            className="w-full h-full bg-primary rounded-t"
                                            style={{ opacity: 0.4 + (i * 0.1) }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                        {format(new Date(entry.date), 'EEE', { locale: es })}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </Card>

                {/* Last check-in */}
                <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Último check-in quincenal</span>
                    </div>
                    <p className="text-sm">
                        <span className="font-medium">15 de enero</span>
                        <span className="text-muted-foreground"> — Todo va según lo previsto. Mantén el ritmo.</span>
                    </p>
                </Card>

                {/* Coach message */}
                <Card className="p-4 bg-gradient-to-br from-accent/5 to-accent/10 border-accent/20">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                            <MessageSquare className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm">Mensaje de tu entrenador</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                "¡Gran semana! Veo que estás siendo muy constante. Esta semana intenta aumentar un poco el peso en press banca. ¡Vamos! 💪"
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                — Miguel, hace 2 días
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
