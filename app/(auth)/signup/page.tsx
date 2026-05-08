'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    Dumbbell,
    Rocket,
    Sparkles,
    Building2,
    Crown,
    Check,
    ArrowRight,
} from 'lucide-react'

type TierId = 'starter' | 'pro' | 'studio' | 'concierge'
type Cycle = 'monthly' | 'yearly'

interface Tier {
    id: TierId
    name: string
    tagline: string
    icon: React.ElementType
    monthly: number
    yearly: number
    maxClients: string
    features: string[]
    highlight?: boolean
    cta: string
    isContact?: boolean
}

const TIERS: Tier[] = [
    {
        id: 'starter',
        name: 'Starter',
        tagline: 'Para coaches que empiezan',
        icon: Rocket,
        monthly: 29,
        yearly: 290,
        maxClients: 'Hasta 20 atletas activos',
        features: [
            'Entrenamiento y nutrición',
            'Check-ins semanales',
            'IA básica',
            'App cliente y plantillas',
            'Soporte estándar',
        ],
        cta: 'Empezar con Starter',
    },
    {
        id: 'pro',
        name: 'Pro',
        tagline: 'El plan estrella',
        icon: Sparkles,
        monthly: 79,
        yearly: 790,
        maxClients: 'Hasta 75 atletas activos',
        features: [
            'Todo lo de Starter',
            'IA completa en revisiones y check-ins',
            'IA para nutrición y plantillas',
            'Automatizaciones y métricas avanzadas',
            'Branding mejorado e integraciones prioritarias',
        ],
        highlight: true,
        cta: 'Empezar con Pro',
    },
    {
        id: 'studio',
        name: 'Studio',
        tagline: 'Para equipos y alto volumen',
        icon: Building2,
        monthly: 199,
        yearly: 1990,
        maxClients: 'Hasta 250 atletas activos',
        features: [
            'Todo lo de Pro',
            'Varios coaches y seats',
            'Gestión de permisos',
            'Soporte prioritario',
            'Onboarding guiado y reporting avanzado',
        ],
        cta: 'Empezar con Studio',
    },
    {
        id: 'concierge',
        name: 'Concierge',
        tagline: 'Servicio premium llave en mano',
        icon: Crown,
        monthly: 399,
        yearly: 0,
        maxClients: 'Atletas y coaches sin límite',
        features: [
            'Migración desde Trainerize, Everfit o Excel',
            'Setup contigo, mano a mano',
            'Acompañamiento dedicado',
            'Canal directo con el equipo',
            'Posible customización',
        ],
        cta: 'Contacta con ventas',
        isContact: true,
    },
]

const CONTACT_EMAIL = 'hola@nexttrain.app'

export default function SignupPlanPage() {
    const router = useRouter()
    const [cycle, setCycle] = useState<Cycle>('monthly')

    const handleSelect = (tier: Tier) => {
        if (tier.isContact) {
            window.location.href = `mailto:${CONTACT_EMAIL}?subject=Quiero%20un%20plan%20Concierge%20de%20NexTrain`
            return
        }
        router.push(`/signup/details?plan=${tier.id}&cycle=${cycle}`)
    }

    return (
        <div className="w-full max-w-6xl mx-auto py-8">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="inline-flex w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-4">
                    <Dumbbell className="h-7 w-7 text-primary" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                    Elige tu plan
                </h1>
                <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
                    Empieza con el plan que mejor encaje con tu negocio. Podrás cambiar cuando quieras.
                </p>
            </div>

            {/* Billing toggle */}
            <div className="flex justify-center mb-10">
                <div className="inline-flex items-center gap-1 p-1 bg-muted/60 rounded-full border border-border/50">
                    <button
                        type="button"
                        onClick={() => setCycle('monthly')}
                        className={cn(
                            'px-5 py-2 rounded-full text-sm font-medium transition-all',
                            cycle === 'monthly'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Mensual
                    </button>
                    <button
                        type="button"
                        onClick={() => setCycle('yearly')}
                        className={cn(
                            'px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
                            cycle === 'yearly'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Anual
                        <Badge
                            variant="secondary"
                            className={cn(
                                'text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wide',
                                cycle === 'yearly' ? 'bg-success/15 text-success border-0' : 'bg-muted-foreground/10 border-0'
                            )}
                        >
                            Ahorra 2 meses
                        </Badge>
                    </button>
                </div>
            </div>

            {/* Tiers grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {TIERS.map((tier) => (
                    <TierCard
                        key={tier.id}
                        tier={tier}
                        cycle={cycle}
                        onSelect={() => handleSelect(tier)}
                    />
                ))}
            </div>

            {/* Footer */}
            <p className="text-center text-sm text-muted-foreground mt-10">
                ¿Ya tienes cuenta?{' '}
                <Link href="/login" className="text-primary hover:underline font-medium">
                    Inicia sesión
                </Link>
            </p>
        </div>
    )
}

function TierCard({
    tier,
    cycle,
    onSelect,
}: {
    tier: Tier
    cycle: Cycle
    onSelect: () => void
}) {
    const Icon = tier.icon
    const isContact = tier.isContact
    const price = cycle === 'monthly' ? tier.monthly : tier.yearly

    return (
        <div
            className={cn(
                'group relative flex flex-col rounded-2xl p-6 transition-all duration-200',
                tier.highlight
                    ? 'bg-card ring-2 ring-primary shadow-xl shadow-primary/10 lg:-translate-y-2'
                    : isContact
                        ? 'bg-gradient-to-br from-foreground via-foreground to-foreground/90 text-background ring-1 ring-foreground/20 shadow-lg'
                        : 'bg-card border border-border hover:border-primary/40 hover:shadow-md',
            )}
        >
            {/* "Más elegido" badge */}
            {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground border-0 px-3 py-1 text-xs font-semibold shadow-lg">
                        ⭐ Más elegido
                    </Badge>
                </div>
            )}

            {/* Icon */}
            <div
                className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center mb-4',
                    tier.highlight
                        ? 'bg-primary/15 text-primary'
                        : isContact
                            ? 'bg-background/10 text-background'
                            : 'bg-accent/60 text-accent-foreground',
                )}
            >
                <Icon className="h-5 w-5" />
            </div>

            {/* Name + tagline */}
            <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
            <p
                className={cn(
                    'text-sm mb-5',
                    isContact ? 'text-background/70' : 'text-muted-foreground',
                )}
            >
                {tier.tagline}
            </p>

            {/* Price */}
            <div className="mb-5">
                {isContact ? (
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">Desde {tier.monthly} €</span>
                        <span className="text-sm text-background/60">/mes</span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold">{price}</span>
                            <span className="text-base font-semibold">€</span>
                            <span className="text-sm text-muted-foreground">
                                /{cycle === 'monthly' ? 'mes' : 'año'}
                            </span>
                        </div>
                        {cycle === 'yearly' && (
                            <p className="text-xs text-success font-medium mt-1">
                                Equivale a {Math.round(tier.yearly / 12)} €/mes
                            </p>
                        )}
                    </>
                )}
            </div>

            {/* Max clients chip */}
            <div
                className={cn(
                    'rounded-lg px-3 py-2 text-xs font-medium mb-5',
                    tier.highlight
                        ? 'bg-primary/10 text-primary'
                        : isContact
                            ? 'bg-background/10 text-background'
                            : 'bg-muted text-foreground',
                )}
            >
                {tier.maxClients}
            </div>

            {/* Features */}
            <ul className="space-y-2.5 mb-7 flex-1">
                {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                        <div
                            className={cn(
                                'shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center',
                                tier.highlight
                                    ? 'bg-primary/15 text-primary'
                                    : isContact
                                        ? 'bg-background/15 text-background'
                                        : 'bg-success/15 text-success',
                            )}
                        >
                            <Check className="h-3 w-3" strokeWidth={3} />
                        </div>
                        <span className={cn(isContact ? 'text-background/85' : 'text-foreground/85')}>
                            {feature}
                        </span>
                    </li>
                ))}
            </ul>

            {/* CTA */}
            <Button
                onClick={onSelect}
                size="lg"
                className={cn(
                    'w-full group/btn',
                    tier.highlight
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        : isContact
                            ? 'bg-background text-foreground hover:bg-background/90'
                            : '',
                )}
                variant={tier.highlight || isContact ? 'default' : 'outline'}
            >
                {tier.cta}
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover/btn:translate-x-0.5" />
            </Button>
        </div>
    )
}
