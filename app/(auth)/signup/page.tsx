'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Crown, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthShell, SignupSteps } from '@/components/auth/AuthShell'
import { CONCIERGE, SALES_EMAIL, TIERS, priceOf, type Cycle, type Tier } from '@/components/auth/plans'
import { cn } from '@/lib/utils'

export default function SignupPlanPage() {
    const router = useRouter()
    const [cycle, setCycle] = useState<Cycle>('monthly')

    return (
        <AuthShell
            wide
            topRight={
                <span>
                    <span className="hidden sm:inline">¿Ya tienes cuenta? </span>
                    <Link href="/login" className="font-medium text-foreground hover:text-primary">Inicia sesión</Link>
                </span>
            }
        >
            <div className="flex flex-col items-center text-center">
                <SignupSteps current={1} />
                <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">Elige tu plan</h1>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                    Según cuántos atletas lleves. Podrás cambiar de plan cuando quieras.
                </p>

                <div className="mt-8 inline-grid grid-cols-2 rounded-full bg-muted p-1" role="tablist" aria-label="Periodicidad">
                    {(['monthly', 'yearly'] as const).map(value => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={cycle === value}
                            onClick={() => setCycle(value)}
                            className={cn(
                                'flex h-9 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all',
                                cycle === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {value === 'monthly' ? 'Mensual' : 'Anual'}
                            {value === 'yearly' && (
                                <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">−2 meses</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3 md:gap-5">
                {TIERS.map(tier => (
                    <TierCard
                        key={tier.id}
                        tier={tier}
                        cycle={cycle}
                        onSelect={() => router.push(`/signup/details?plan=${tier.id}&cycle=${cycle}`)}
                    />
                ))}
            </div>

            {/* Concierge */}
            <div className="mx-auto mt-5 flex max-w-5xl flex-col gap-5 rounded-3xl border border-border/70 bg-muted/30 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-7">
                <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                        <Crown className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-semibold">
                            Concierge <span className="font-normal text-muted-foreground">· desde {CONCIERGE.from} €/mes · sin límite de atletas</span>
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{CONCIERGE.features.join(' · ')}.</p>
                    </div>
                </div>
                <Button asChild variant="outline" className="h-10 shrink-0 rounded-xl">
                    <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Quiero el plan Concierge de NexTrain')}`}>Hablar con nosotros</a>
                </Button>
            </div>
        </AuthShell>
    )
}

function TierCard({ tier, cycle, onSelect }: { tier: Tier; cycle: Cycle; onSelect: () => void }) {
    const Icon = tier.icon
    const price = priceOf(tier, cycle)

    return (
        <div
            className={cn(
                'relative flex flex-col rounded-3xl border bg-card p-6 text-left transition-shadow lg:p-7',
                tier.highlight && 'order-first md:order-none',
                tier.highlight
                    ? 'border-primary/50 shadow-xl shadow-primary/10 ring-1 ring-primary/25'
                    : 'border-border/70 shadow-sm hover:shadow-md',
            )}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tier.highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                        <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="text-lg font-bold">{tier.name}</h2>
                </div>
                {tier.highlight && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">Más elegido</span>
                )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{tier.tagline}</p>

            <div className="mt-6 flex items-baseline gap-1">
                <span className="text-[2.5rem] font-bold leading-none tracking-tight tabular-nums">{price} €</span>
                <span className="text-sm text-muted-foreground">/{cycle === 'monthly' ? 'mes' : 'año'}</span>
            </div>
            <p className="mt-1.5 h-4 text-xs text-muted-foreground">
                {cycle === 'yearly' ? <span className="font-medium text-success">Equivale a {Math.round(tier.yearly / 12)} €/mes</span> : 'Facturación mensual'}
            </p>

            <p className="mt-5 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[13px] font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                Hasta {tier.athletes} atletas activos
            </p>

            <Button
                onClick={onSelect}
                variant={tier.highlight ? 'default' : 'outline'}
                className="group mt-5 h-11 w-full rounded-xl text-[15px] font-semibold"
            >
                Elegir {tier.name}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>

            <ul className="mt-6 space-y-2.5 border-t border-border/60 pt-6">
                {tier.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/85">
                        <Check className={cn('mt-0.5 h-4 w-4 shrink-0', tier.highlight ? 'text-primary' : 'text-success')} strokeWidth={2.5} />
                        {feature}
                    </li>
                ))}
            </ul>
        </div>
    )
}
