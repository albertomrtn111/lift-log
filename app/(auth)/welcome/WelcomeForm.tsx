'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Loader2, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthHeading } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, AuthInput } from '@/components/auth/AuthFields'
import { DISCIPLINES, EXPECTED_ATHLETES, type DisciplineId, type ExpectedAthletesId } from '@/lib/onboarding/coach-options'
import { cn } from '@/lib/utils'
import { completeWelcomeAction } from './actions'
import { TRIAL_DAYS } from '@/lib/subscription/access.js'

export function WelcomeForm({ firstName, initialBusinessName, initialDisciplines, initialExpectedAthletes }: {
    firstName: string | null
    initialBusinessName: string
    initialDisciplines: DisciplineId[]
    initialExpectedAthletes: ExpectedAthletesId | null
}) {
    const router = useRouter()
    const [businessName, setBusinessName] = useState(initialBusinessName)
    const [disciplines, setDisciplines] = useState<DisciplineId[]>(initialDisciplines)
    const [expectedAthletes, setExpectedAthletes] = useState<ExpectedAthletesId | null>(initialExpectedAthletes)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const toggleDiscipline = (id: DisciplineId) => {
        setDisciplines(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
    }

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
            const result = await completeWelcomeAction({
                businessName,
                disciplines,
                expectedAthletes: expectedAthletes ?? '',
            })
            if (!result.success) {
                setError(result.error)
                return
            }
            router.replace('/coach/dashboard')
            router.refresh()
        })
    }

    return (
        <>
            <AuthHeading
                eyebrow={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                        <PartyPopper className="h-3.5 w-3.5" />
                        Cuenta confirmada
                    </span>
                }
                title="Tu espacio está listo"
                description={`${firstName ? `${firstName}, t` : 'T'}ienes ${TRIAL_DAYS} días gratis con todo Pro. Tres preguntas y entras a tu panel.`}
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <AuthField id="businessName" label="Nombre de tu negocio" hint="Lo verán tus atletas en la app y en los emails.">
                    <AuthInput
                        id="businessName"
                        autoComplete="organization"
                        placeholder="Ej.: Álex Coaching"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        maxLength={80}
                        required
                        autoFocus
                        disabled={isPending}
                    />
                </AuthField>

                <fieldset className="space-y-2">
                    <legend className="mb-2 text-[13px] font-semibold">¿Qué disciplinas trabajas?</legend>
                    <div className="grid grid-cols-2 gap-2">
                        {DISCIPLINES.map(option => {
                            const selected = disciplines.includes(option.id)
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={selected}
                                    onClick={() => toggleDiscipline(option.id)}
                                    disabled={isPending}
                                    className={cn(
                                        'flex h-11 items-center justify-between rounded-xl border px-3.5 text-[15px] font-medium transition-colors',
                                        selected ? 'border-primary bg-primary/[0.06] text-foreground' : 'border-border hover:bg-muted/60',
                                    )}
                                >
                                    {option.label}
                                    <span className={cn(
                                        'flex h-5 w-5 items-center justify-center rounded-md border',
                                        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                                    )}>
                                        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <p className="text-xs text-muted-foreground">Puedes elegir varias.</p>
                </fieldset>

                <fieldset>
                    <legend className="mb-2 text-[13px] font-semibold">¿Cuántos atletas llevas, aproximadamente?</legend>
                    <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {EXPECTED_ATHLETES.map(option => {
                            const selected = expectedAthletes === option.id
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setExpectedAthletes(option.id)}
                                    disabled={isPending}
                                    className={cn(
                                        'h-11 rounded-xl border px-2 text-[15px] font-medium tabular-nums transition-colors',
                                        selected ? 'border-primary bg-primary/[0.06] text-foreground' : 'border-border hover:bg-muted/60',
                                    )}
                                >
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>
                </fieldset>

                {error && <AuthAlert>{error}</AuthAlert>}

                <Button type="submit" size="lg" className="group h-11 w-full rounded-xl text-[15px] font-semibold" disabled={isPending}>
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                            Entrar a mi panel
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                    )}
                </Button>
            </form>
        </>
    )
}
