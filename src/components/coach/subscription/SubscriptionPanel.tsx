'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, CreditCard, Gift, Loader2, Lock, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LogoutButton } from '@/components/coach/LogoutButton'
import { SUPPORT_EMAIL } from '@/components/auth/AuthShell'
import { SALES_EMAIL, TIERS, priceOf, type Cycle, type TierId } from '@/components/auth/plans'
import { openBillingPortalAction, startCheckoutAction } from './subscription-actions'
import { cn } from '@/lib/utils'

type AccessState = 'comped' | 'trial' | 'active' | 'past_due' | 'trial_ended' | 'inactive' | 'missing'

interface SubscriptionPanelProps {
    state: AccessState
    trialDaysLeft: number | null
    status: string | null
    plan: TierId
    cycle: Cycle
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    hasStripeSubscription: boolean
    hasStripeCustomer: boolean
    isOwner: boolean
    paymentsEnabled: boolean
    justSubscribed: boolean
    athletes: { active: number; limit: number | null }
}

const TIER_NAMES: Record<string, string> = { starter: 'Starter', pro: 'Pro', studio: 'Studio', concierge: 'Concierge' }

function formatDate(value: string | null) {
    if (!value) return null
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

export function SubscriptionPanel(props: SubscriptionPanelProps) {
    const { state, isOwner, paymentsEnabled, hasStripeSubscription, status } = props
    const allowed = state === 'comped' || state === 'trial' || state === 'active' || state === 'past_due'
    const subscriptionEnded = status === 'canceled' || status === 'incomplete_expired'
    const showPlans = isOwner && state !== 'comped' && state !== 'missing' && (!hasStripeSubscription || subscriptionEnded)
    const canManage = isOwner && paymentsEnabled && props.hasStripeCustomer && hasStripeSubscription

    return (
        <div className="space-y-6">
            <StatusCard {...props} canManage={canManage} />

            {showPlans && <PlanPicker {...props} />}

            {!isOwner && state !== 'comped' && (
                <p className="text-sm text-muted-foreground">Solo el propietario del espacio puede elegir plan o cambiar el pago.</p>
            )}

            {!allowed && (
                <div className="flex flex-col items-start gap-2 border-t border-border/60 pt-5 text-sm text-muted-foreground">
                    <p>¿Dudas o quieres hablarlo antes? Escríbenos a <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
                    <div className="w-full max-w-[220px]"><LogoutButton /></div>
                </div>
            )}
        </div>
    )
}

function StatusCard(props: SubscriptionPanelProps & { canManage: boolean }) {
    const { state, trialDaysLeft, plan, cycle, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, hasStripeSubscription, athletes, justSubscribed, canManage, status } = props
    const [pending, startTransition] = useTransition()

    const manage = () => startTransition(async () => {
        const result = await openBillingPortalAction()
        if (result.url) window.location.href = result.url
        else toast.error(result.error)
    })

    const planName = TIER_NAMES[plan] ?? plan
    const cycleLabel = cycle === 'yearly' ? 'anual' : 'mensual'
    let icon = <Gift className="h-5 w-5" />
    let tone = 'bg-primary/10 text-primary'
    let title: string
    let text: React.ReactNode

    switch (state) {
        case 'trial':
            title = trialDaysLeft === 1 ? 'Prueba gratis de Pro: queda 1 día' : `Prueba gratis de Pro: quedan ${trialDaysLeft} días`
            text = hasStripeSubscription
                ? <>Has elegido <b>{planName}</b> ({cycleLabel}). El primer cobro será el {formatDate(trialEndsAt)}{cancelAtPeriodEnd ? ', aunque has pedido cancelarla: no se cobrará' : ''}.</>
                : <>Tienes todo Pro hasta el {formatDate(trialEndsAt)}, sin tarjeta. Elige plan cuando quieras: no se cobra nada hasta que acabe la prueba.</>
            break
        case 'active':
            icon = <Check className="h-5 w-5" />
            tone = 'bg-success/15 text-success'
            title = `Plan ${planName} · ${cycleLabel}`
            text = cancelAtPeriodEnd
                ? <>Tu suscripción termina el {formatDate(currentPeriodEnd)}. Puedes reactivarla desde «Gestionar suscripción».</>
                : <>Se renueva el {formatDate(currentPeriodEnd)}. Facturas, tarjeta y cambio de plan, en «Gestionar suscripción».</>
            break
        case 'past_due':
            icon = <AlertTriangle className="h-5 w-5" />
            tone = 'bg-amber-500/15 text-amber-600'
            title = 'No hemos podido cobrar tu último pago'
            text = <>Actualiza tu tarjeta en «Gestionar suscripción». Reintentaremos el cobro en los próximos días.</>
            break
        case 'comped':
            icon = <Check className="h-5 w-5" />
            tone = 'bg-success/15 text-success'
            title = 'Acceso incluido'
            text = <>Tu espacio tiene acceso sin coste. Si quieres cambiar de plan, escríbenos a {SALES_EMAIL}.</>
            break
        case 'trial_ended':
            icon = <Lock className="h-5 w-5" />
            tone = 'bg-destructive/10 text-destructive'
            title = 'Tu prueba gratis ha terminado'
            text = <>Tus datos y los de tus atletas siguen guardados y ellos pueden seguir usando su app. Elige un plan para volver a tu panel.</>
            break
        case 'inactive':
            icon = <Lock className="h-5 w-5" />
            tone = 'bg-destructive/10 text-destructive'
            title = status === 'unpaid' || status === 'paused' ? 'Tu suscripción está pausada por un pago pendiente' : 'Tu suscripción no está activa'
            text = status === 'unpaid' || status === 'paused'
                ? <>Actualiza tu tarjeta en «Gestionar suscripción» para recuperar el acceso. No se ha borrado nada.</>
                : <>No se ha borrado nada. Elige un plan para volver a tu panel.</>
            break
        default:
            icon = <Lock className="h-5 w-5" />
            tone = 'bg-destructive/10 text-destructive'
            title = 'Tu espacio no tiene suscripción'
            text = <>Escríbenos a {SUPPORT_EMAIL} y lo revisamos.</>
    }

    return (
        <Card className="p-5 sm:p-6">
            {justSubscribed && (
                <p className="mb-4 rounded-xl bg-success/10 px-3 py-2 text-sm font-medium text-success">¡Gracias! Tu suscripción ya está registrada.</p>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', tone)}>{icon}</span>
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold leading-tight">{title}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                    </div>
                </div>
                {canManage && (
                    <Button onClick={manage} disabled={pending} variant="outline" className="h-10 shrink-0 gap-2 rounded-xl">
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Gestionar suscripción
                    </Button>
                )}
            </div>
            <AthleteUsage {...athletes} />
        </Card>
    )
}

function AthleteUsage({ active, limit }: { active: number; limit: number | null }) {
    const pct = limit ? Math.min(100, Math.round((active / limit) * 100)) : 0
    return (
        <div className="mt-5 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" />Atletas activos</span>
                <span className="font-semibold tabular-nums">{limit ? `${active} de ${limit}` : `${active} · sin límite`}</span>
            </div>
            {limit && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    )
}

function PlanPicker({ plan, cycle: initialCycle, paymentsEnabled, athletes, state, trialDaysLeft }: SubscriptionPanelProps) {
    const [cycle, setCycle] = useState<Cycle>(initialCycle)
    const [pendingTier, setPendingTier] = useState<TierId | null>(null)
    const [, startTransition] = useTransition()

    const choose = (tierId: TierId) => {
        setPendingTier(tierId)
        startTransition(async () => {
            const result = await startCheckoutAction(tierId, cycle)
            if (result.url) {
                window.location.href = result.url
                return
            }
            toast.error(result.error)
            setPendingTier(null)
        })
    }

    const keepsTrial = state === 'trial' && (trialDaysLeft ?? 0) >= 2

    return (
        <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-lg font-bold">Elige tu plan</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {keepsTrial ? 'Pagas con tarjeta, pero el primer cobro es cuando acaba tu prueba.' : 'Pago con tarjeta. Cambia de plan o cancela cuando quieras.'} Precios sin IVA.
                    </p>
                </div>
                <div className="inline-grid shrink-0 grid-cols-2 self-start rounded-full border border-border/70 bg-muted/60 p-1" role="tablist" aria-label="Periodicidad">
                    {(['monthly', 'yearly'] as const).map(value => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={cycle === value}
                            onClick={() => setCycle(value)}
                            className={cn(
                                'flex h-8 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all',
                                cycle === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {value === 'monthly' ? 'Mensual' : 'Anual · 2 meses gratis'}
                        </button>
                    ))}
                </div>
            </div>

            {!paymentsEnabled && (
                <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    El pago online estará disponible muy pronto. Mientras tanto, escríbenos a{' '}
                    <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Quiero contratar NexTrain')}`}>{SALES_EMAIL}</a> y lo activamos.
                </p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                {TIERS.map(tier => {
                    const tooSmall = athletes.active > tier.athletes
                    const selected = tier.id === plan
                    const price = priceOf(tier, cycle)
                    return (
                        <Card key={tier.id} className={cn('flex flex-col p-5', selected && 'border-primary ring-1 ring-primary/40')}>
                            <div className="flex items-center justify-between">
                                <p className="font-bold">{tier.name}</p>
                                {selected && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Tu elección</span>}
                            </div>
                            <p className="mt-2">
                                <span className="text-3xl font-bold tabular-nums">{price} €</span>
                                <span className="text-sm text-muted-foreground"> /{cycle === 'monthly' ? 'mes' : 'año'} + IVA</span>
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">Hasta {tier.athletes} atletas activos</p>
                            <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                                {tier.features.slice(0, 3).map(feature => (
                                    <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />{feature}</li>
                                ))}
                            </ul>
                            {tooSmall && <p className="mt-3 text-xs text-destructive">Tienes {athletes.active} atletas activos: este plan se queda corto.</p>}
                            <Button
                                className="mt-4 h-10 rounded-xl font-semibold"
                                variant={selected ? 'default' : 'outline'}
                                disabled={!paymentsEnabled || tooSmall || pendingTier !== null}
                                onClick={() => choose(tier.id)}
                            >
                                {pendingTier === tier.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Elegir {tier.name}
                            </Button>
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}
