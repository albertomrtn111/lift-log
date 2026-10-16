'use client'

import { FileSpreadsheet, LayoutTemplate, Sparkles, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { PlanStartIntent } from './plan-start'

const OPTIONS: { intent: PlanStartIntent; title: string; description: string; icon: React.ElementType }[] = [
    {
        intent: 'template',
        title: 'Desde una plantilla',
        description: 'Elige uno de tus programas guardados y ajústalo a este atleta.',
        icon: LayoutTemplate,
    },
    {
        intent: 'csv',
        title: 'Importar un CSV',
        description: 'Sube la dieta que ya tienes en una hoja de cálculo.',
        icon: FileSpreadsheet,
    },
    {
        intent: 'ai',
        title: 'Generar con IA',
        description: 'La IA propone el entrenamiento a partir de su onboarding. Tú lo revisas.',
        icon: Sparkles,
    },
]

/** Paso 4 de "Primeros pasos": las tres formas de preparar el primer plan */
export function FirstPlanChooser({ onChoose, onDismiss }: {
    onChoose: (intent: PlanStartIntent) => void
    onDismiss: () => void
}) {
    return (
        <Card className="mb-4 border-primary/25 p-4 sm:p-5" aria-labelledby="first-plan-title">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 id="first-plan-title" className="font-semibold">Prepara su primer plan</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">Elige cómo empezar. Unos 5 minutos.</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onDismiss} aria-label="Cerrar">
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                {OPTIONS.map(option => {
                    const Icon = option.icon
                    return (
                        <button
                            key={option.intent}
                            type="button"
                            onClick={() => onChoose(option.intent)}
                            className="flex items-start gap-3 rounded-xl border bg-background p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Icon className="h-4 w-4" />
                            </span>
                            <span>
                                <span className="block text-sm font-semibold">{option.title}</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </Card>
    )
}
