'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Crown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthShell, SignupSteps } from '@/components/auth/AuthShell'
import { COMPARISON, CONCIERGE, SALES_EMAIL, TIERS, priceOf, type Cycle, type Tier } from '@/components/auth/plans'
import { cn } from '@/lib/utils'

export default function SignupPlanPage() {
    const router = useRouter()
    const [cycle, setCycle] = useState<Cycle>('monthly')
    const choose = (tier: Tier) => router.push(`/signup/details?plan=${tier.id}&cycle=${cycle}`)

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
            {/* Cabecera */}
            <div className="flex flex-col items-center text-center">
                <SignupSteps current={1} />
                <h1 className="mt-6 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-[2.75rem]">
                    Elige tu plan
                </h1>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                    Según cuántos atletas lleves. Podrás cambiar de plan cuando quieras.
                </p>

                <div className="mt-8 inline-grid grid-cols-2 rounded-full border border-border/70 bg-muted/60 p-1" role="tablist" aria-label="Periodicidad">
                    {(['monthly', 'yearly'] as const).map(value => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={cycle === value}
                            onClick={() => setCycle(value)}
                            className={cn(
                                'flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all sm:px-5',
                                cycle === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {value === 'monthly' ? 'Mensual' : 'Anual'}
                            {value === 'yearly' && (
                                <span className="whitespace-nowrap rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold text-success">2 meses gratis</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Planes */}
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3 md:items-stretch md:gap-5">
                {TIERS.map((tier, index) => (
                    <TierCard key={tier.id} tier={tier} level={index + 1} cycle={cycle} onSelect={() => choose(tier)} />
                ))}
            </div>

            {/* Concierge */}
            <div className="mx-auto mt-5 max-w-5xl overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-7">
                    <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-sm">
                            <Crown className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Servicio llave en mano</p>
                            <p className="mt-0.5 text-lg font-bold">
                                Concierge <span className="text-sm font-medium text-muted-foreground">· desde {CONCIERGE.from} €/mes</span>
                            </p>
                            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4">
                                {[...CONCIERGE.features, 'Atletas y coaches sin límite'].map(feature => (
                                    <li key={feature} className="flex items-center gap-1.5">
                                        <Check className="h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={2.5} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <Button asChild variant="outline" className="h-11 shrink-0 rounded-xl px-5 font-semibold">
                        <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Quiero el plan Concierge de NexTrain')}`}>Hablar con nosotros</a>
                    </Button>
                </div>
            </div>

            {/* Comparativa */}
            <section className="mx-auto mt-14 max-w-5xl">
                <h2 className="text-center text-xl font-bold tracking-tight sm:text-2xl">Compara los planes</h2>
                <p className="mt-1.5 text-center text-sm text-muted-foreground">Lo que incluye cada uno, de un vistazo.</p>

                <div className="mt-6 overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
                    <table className="w-full table-fixed text-sm">
                        <colgroup>
                            <col className="w-[40%] sm:w-[34%]" />
                            {TIERS.map(tier => <col key={tier.id} />)}
                        </colgroup>
                        <thead>
                            <tr className="border-b border-border/70">
                                <th className="px-3 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Incluye</th>
                                {TIERS.map(tier => (
                                    <th key={tier.id} className={cn('px-1 py-3.5 text-center text-sm font-bold sm:px-3', tier.highlight && 'text-primary')}>
                                        {tier.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {COMPARISON.map(row => (
                                <tr key={row.label}>
                                    <td className="px-3 py-3 text-[13px] text-foreground/85 sm:px-5 sm:text-sm">{row.label}</td>
                                    {TIERS.map(tier => (
                                        <td key={tier.id} className={cn('px-1 py-3 text-center sm:px-3', tier.highlight && 'bg-primary/[0.04]')}>
                                            <ComparisonValue value={row.values[tier.id]} highlight={tier.highlight} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr>
                                <td className="px-3 py-3.5 sm:px-5" />
                                {TIERS.map(tier => (
                                    <td key={tier.id} className={cn('px-1 py-3.5 text-center sm:px-3', tier.highlight && 'bg-primary/[0.04]')}>
                                        <button
                                            type="button"
                                            onClick={() => choose(tier)}
                                            className={cn(
                                                'inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors',
                                                tier.highlight ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border/80 hover:bg-muted',
                                            )}
                                        >
                                            Elegir
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </AuthShell>
    )
}

function ComparisonValue({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
    if (value === true) {
        return (
            <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full', highlight ? 'bg-primary/15 text-primary' : 'bg-success/15 text-success')}>
                <Check className="h-3 w-3" strokeWidth={3} />
            </span>
        )
    }
    if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="No incluido" />
    return <span className="text-[13px] font-semibold tabular-nums sm:text-sm">{value}</span>
}

function TierCard({ tier, level, cycle, onSelect }: { tier: Tier; level: number; cycle: Cycle; onSelect: () => void }) {
    const Icon = tier.icon
    const price = priceOf(tier, cycle)
    const dark = Boolean(tier.highlight)
    const [inherited, ...ownFeatures] = tier.features[0]?.startsWith('Todo lo de') ? tier.features : [null, ...tier.features]
    const savings = tier.monthly * 12 - tier.yearly

    return (
        <div
            className={cn(
                'relative flex flex-col overflow-hidden rounded-3xl p-6 lg:p-7',
                dark
                    ? 'order-first bg-[#070b16] text-white shadow-2xl shadow-primary/20 ring-1 ring-white/10 md:order-none md:-my-3 md:py-9'
                    : 'border border-border/70 bg-card shadow-sm',
            )}
        >
            {dark && (
                <>
                    <div
                        className="pointer-events-none absolute inset-0 opacity-30"
                        style={{
                            backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
                            backgroundSize: '36px 36px',
                            maskImage: 'radial-gradient(ellipse at 80% 0%, black 10%, transparent 65%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at 80% 0%, black 10%, transparent 65%)',
                        }}
                    />
                    <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/45 blur-[90px]" />
                </>
            )}

            <div className="relative flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', dark ? 'bg-white/10 text-white' : 'bg-muted text-foreground')}>
                            <Icon className="h-4 w-4" />
                        </span>
                        <h2 className="text-lg font-bold">{tier.name}</h2>
                    </div>
                    {dark && (
                        <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                            Más elegido
                        </span>
                    )}
                </div>
                <p className={cn('mt-2 text-sm', dark ? 'text-white/60' : 'text-muted-foreground')}>{tier.tagline}</p>

                <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-[2.75rem] font-bold leading-none tracking-tight tabular-nums">{price} €</span>
                    <span className={cn('text-sm', dark ? 'text-white/50' : 'text-muted-foreground')}>/{cycle === 'monthly' ? 'mes' : 'año'}</span>
                </div>
                <p className={cn('mt-2 h-4 text-xs', dark ? 'text-white/50' : 'text-muted-foreground')}>
                    {cycle === 'yearly'
                        ? <><span className={cn('font-semibold', dark ? 'text-emerald-300' : 'text-success')}>Ahorras {savings} €</span> · equivale a {Math.round(tier.yearly / 12)} €/mes</>
                        : 'Facturación mensual'}
                </p>

                {/* Capacidad */}
                <div className={cn('mt-5 rounded-2xl px-3.5 py-3', dark ? 'bg-white/[0.06]' : 'bg-muted/60')}>
                    <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', dark ? 'text-white/50' : 'text-muted-foreground')}>Capacidad</span>
                        <span className="text-sm font-semibold">Hasta {tier.athletes} atletas</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1">
                        {[1, 2, 3].map(step => (
                            <span
                                key={step}
                                className={cn(
                                    'h-1.5 rounded-full',
                                    step <= level ? (dark ? 'bg-brand-light' : 'bg-primary') : (dark ? 'bg-white/10' : 'bg-border'),
                                )}
                            />
                        ))}
                    </div>
                </div>

                <Button
                    onClick={onSelect}
                    variant={dark ? 'default' : 'outline'}
                    className={cn(
                        'group mt-5 h-11 w-full rounded-xl text-[15px] font-semibold',
                        dark && 'bg-white text-[#070b16] hover:bg-white/90',
                    )}
                >
                    Elegir {tier.name}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>

                <div className={cn('mt-6 border-t pt-5', dark ? 'border-white/10' : 'border-border/60')}>
                    {inherited && (
                        <p className={cn('mb-3 text-xs font-semibold', dark ? 'text-white/60' : 'text-muted-foreground')}>{inherited}, más:</p>
                    )}
                    <ul className="space-y-2.5">
                        {ownFeatures.map(feature => (
                            <li key={feature} className={cn('flex items-start gap-2.5 text-sm', dark ? 'text-white/85' : 'text-foreground/85')}>
                                <Check className={cn('mt-0.5 h-4 w-4 shrink-0', dark ? 'text-brand-soft' : 'text-success')} strokeWidth={2.5} />
                                {feature}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}
