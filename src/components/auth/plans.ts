import { Building2, Rocket, Sparkles } from 'lucide-react'

export type TierId = 'starter' | 'pro' | 'studio'
export type Cycle = 'monthly' | 'yearly'

export interface Tier {
    id: TierId
    name: string
    tagline: string
    icon: React.ElementType
    monthly: number
    yearly: number
    athletes: number
    features: string[]
    highlight?: boolean
}

export const TIERS: Tier[] = [
    {
        id: 'starter',
        name: 'Starter',
        tagline: 'Para coaches que empiezan',
        icon: Rocket,
        monthly: 29,
        yearly: 290,
        athletes: 20,
        features: [
            'Entrenamiento y nutrición',
            'Check-ins semanales',
            'IA básica',
            'App para tus atletas y plantillas',
            'Soporte estándar',
        ],
    },
    {
        id: 'pro',
        name: 'Pro',
        tagline: 'Para vivir del coaching',
        icon: Sparkles,
        monthly: 79,
        yearly: 790,
        athletes: 75,
        features: [
            'Todo lo de Starter',
            'IA completa en revisiones y check-ins',
            'IA para nutrición y plantillas',
            'Automatizaciones y métricas avanzadas',
            'Branding mejorado e integraciones prioritarias',
        ],
        highlight: true,
    },
    {
        id: 'studio',
        name: 'Studio',
        tagline: 'Para equipos y alto volumen',
        icon: Building2,
        monthly: 199,
        yearly: 1990,
        athletes: 250,
        features: [
            'Todo lo de Pro',
            'Varios coaches en la misma cuenta',
            'Gestión de permisos',
            'Soporte prioritario',
            'Onboarding guiado y reporting avanzado',
        ],
    },
]

export const CONCIERGE = {
    from: 399,
    features: ['Migración desde Trainerize, Everfit o Excel', 'Configuración contigo, mano a mano', 'Canal directo con el equipo'],
}

export const SALES_EMAIL = 'hola@nexttrain.app'

export function findTier(id: string | null): Tier | null {
    return TIERS.find(tier => tier.id === id) ?? null
}

export function isCycle(value: string | null): value is Cycle {
    return value === 'monthly' || value === 'yearly'
}

export function priceOf(tier: Tier, cycle: Cycle) {
    return cycle === 'monthly' ? tier.monthly : tier.yearly
}

/** Tabla comparativa: true = incluido, false = no, texto = valor concreto */
export const COMPARISON: Array<{ label: string; values: Record<TierId, boolean | string> }> = [
    { label: 'Atletas activos', values: { starter: '20', pro: '75', studio: '250' } },
    { label: 'Entrenamiento y nutrición', values: { starter: true, pro: true, studio: true } },
    { label: 'Check-ins semanales', values: { starter: true, pro: true, studio: true } },
    { label: 'App para tus atletas', values: { starter: true, pro: true, studio: true } },
    { label: 'Inteligencia artificial', values: { starter: 'Básica', pro: 'Completa', studio: 'Completa' } },
    { label: 'Automatizaciones y métricas', values: { starter: false, pro: true, studio: true } },
    { label: 'Branding mejorado', values: { starter: false, pro: true, studio: true } },
    { label: 'Varios coaches y permisos', values: { starter: false, pro: false, studio: true } },
    { label: 'Onboarding guiado', values: { starter: false, pro: false, studio: true } },
    { label: 'Soporte', values: { starter: 'Estándar', pro: 'Estándar', studio: 'Prioritario' } },
]
