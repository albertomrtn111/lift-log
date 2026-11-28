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
            'App para tus atletas y plantillas',
            'Conecta Claude o ChatGPT a tus atletas',
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
            'IA en revisiones y check-ins',
            'IA para programas, nutrición y plantillas',
            'Asistente de IA dentro de la app',
            'Análisis del progreso con IA',
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
            'Tu marca: logo y colores en la app',
            'Soporte prioritario',
        ],
    },
]

export const CONCIERGE = {
    from: 399,
    features: ['Migración desde Trainerize, Everfit o Excel', 'Configuración contigo, mano a mano', 'Canal directo con el equipo'],
}

export const SALES_EMAIL = 'ventas@ascentechlabs.com'

export function findTier(id: string | null): Tier | null {
    return TIERS.find(tier => tier.id === id) ?? null
}

export function isCycle(value: string | null): value is Cycle {
    return value === 'monthly' || value === 'yearly'
}

export function priceOf(tier: Tier, cycle: Cycle) {
    return cycle === 'monthly' ? tier.monthly : tier.yearly
}

/**
 * Tabla comparativa: true = incluido, false = no, texto = valor concreto.
 * Tiene que cuadrar con plan_features (IA = 'ai', marca = 'branding', equipo = 'team') y con
 * la web comercial (nextrain-web, lib.ts). Modo Sala no va en ningún plan (NXT-152).
 */
export const COMPARISON: Array<{ label: string; values: Record<TierId, boolean | string> }> = [
    { label: 'Atletas activos', values: { starter: '20', pro: '75', studio: '250' } },
    { label: 'Entrenamiento y nutrición', values: { starter: true, pro: true, studio: true } },
    { label: 'Check-ins semanales', values: { starter: true, pro: true, studio: true } },
    { label: 'App para tus atletas', values: { starter: true, pro: true, studio: true } },
    { label: 'Automatizaciones y métricas', values: { starter: true, pro: true, studio: true } },
    { label: 'Conecta Claude o ChatGPT', values: { starter: true, pro: true, studio: true } },
    { label: 'IA dentro de la app', values: { starter: false, pro: true, studio: true } },
    { label: 'Tu marca: logo y colores', values: { starter: false, pro: false, studio: true } },
    { label: 'Varios coaches y permisos', values: { starter: false, pro: false, studio: true } },
    { label: 'Soporte', values: { starter: 'Estándar', pro: 'Estándar', studio: 'Prioritario' } },
]
