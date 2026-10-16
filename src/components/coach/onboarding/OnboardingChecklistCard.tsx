'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Loader2, Rocket, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Checklist } from '@/lib/onboarding/checklist.js'
import { dismissOnboardingChecklistAction } from './actions'

export function OnboardingChecklistCard({ coachId, checklist }: { coachId: string; checklist: Checklist }) {
    const [hidden, setHidden] = useState(false)
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()

    if (hidden) return null

    // El siguiente paso pendiente se destaca; el opcional solo cuando ya no quedan obligatorios
    const nextStep = checklist.steps.find(step => !step.done && !step.optional && step.href)
        ?? checklist.steps.find(step => !step.done && step.href)
    const percent = Math.round(checklist.progress * 100)

    const handleDismiss = () => {
        startTransition(async () => {
            const result = await dismissOnboardingChecklistAction(coachId)
            if (result.success) {
                setHidden(true)
            } else {
                toast({ title: 'No se pudo ocultar', description: result.error, variant: 'destructive' })
            }
        })
    }

    return (
        <Card className="overflow-hidden border-primary/25" aria-labelledby="primeros-pasos-title">
            <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Rocket className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 id="primeros-pasos-title" className="font-semibold">Primeros pasos</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {checklist.requiredDone} de {checklist.requiredTotal} pasos · en unos 10 minutos tendrás a tu primer atleta con plan
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={handleDismiss}
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Ocultar
                </Button>
            </div>

            <div className="px-4 pt-4 sm:px-5">
                <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label="Progreso de los primeros pasos"
                >
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                </div>
            </div>

            <ol className="divide-y divide-border/60 px-2 pb-2 pt-2 sm:px-3">
                {checklist.steps.map((step, index) => {
                    const isNext = step.id === nextStep?.id
                    return (
                        <li key={step.id} className={cn('flex flex-col gap-3 rounded-xl px-2 py-3 sm:flex-row sm:items-center sm:px-3', isNext && 'bg-primary/[0.04]')}>
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span
                                    className={cn(
                                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                        step.done ? 'bg-success text-white' : isNext ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground',
                                    )}
                                    aria-hidden
                                >
                                    {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className={cn('text-sm font-medium', step.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                                        {step.title}
                                        {step.optional && (
                                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground no-underline">
                                                Opcional
                                            </span>
                                        )}
                                        <span className="sr-only">{step.done ? ' (hecho)' : ' (pendiente)'}</span>
                                    </p>
                                    {!step.done && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">{step.blockedReason ?? step.description}</p>
                                    )}
                                </div>
                            </div>
                            {!step.done && step.href && (
                                <Button
                                    asChild
                                    size="sm"
                                    variant={isNext ? 'default' : 'outline'}
                                    className="ml-9 shrink-0 self-start sm:ml-0 sm:self-auto"
                                >
                                    <Link href={step.href}>
                                        {step.cta}
                                        <ArrowRight className="ml-1.5 h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        </li>
                    )
                })}
            </ol>
        </Card>
    )
}
