'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    Dumbbell,
    Loader2,
    Rocket,
    Sparkles,
    Building2,
    ArrowLeft,
} from 'lucide-react'

type TierId = 'starter' | 'pro' | 'studio'
type Cycle = 'monthly' | 'yearly'

interface TierMeta {
    name: string
    icon: React.ElementType
    monthly: number
    yearly: number
    maxClients: string
}

const TIER_META: Record<TierId, TierMeta> = {
    starter: {
        name: 'Starter',
        icon: Rocket,
        monthly: 29,
        yearly: 290,
        maxClients: 'Hasta 20 atletas',
    },
    pro: {
        name: 'Pro',
        icon: Sparkles,
        monthly: 79,
        yearly: 790,
        maxClients: 'Hasta 75 atletas',
    },
    studio: {
        name: 'Studio',
        icon: Building2,
        monthly: 199,
        yearly: 1990,
        maxClients: 'Hasta 250 atletas',
    },
}

function isValidTier(value: string | null): value is TierId {
    return value === 'starter' || value === 'pro' || value === 'studio'
}

function isValidCycle(value: string | null): value is Cycle {
    return value === 'monthly' || value === 'yearly'
}

function SignupDetailsInner() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const planParam = searchParams.get('plan')
    const cycleParam = searchParams.get('cycle')

    // If invalid params, kick back to plan selection
    if (!isValidTier(planParam) || !isValidCycle(cycleParam)) {
        if (typeof window !== 'undefined') router.replace('/signup')
        return null
    }

    const tier: TierId = planParam
    const cycle: Cycle = cycleParam
    const meta = TIER_META[tier]
    const TierIcon = meta.icon
    const price = cycle === 'monthly' ? meta.monthly : meta.yearly

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        subscription_tier: tier,
                        billing_cycle: cycle,
                    },
                },
            })

            if (error) {
                if (
                    error.message.toLowerCase().includes('already registered') ||
                    error.message.toLowerCase().includes('already been registered') ||
                    error.message.toLowerCase().includes('user already exists')
                ) {
                    setError('ALREADY_REGISTERED')
                } else {
                    setError(error.message)
                }
                return
            }

            setSuccess(true)
        } catch {
            setError('Error inesperado. Por favor, inténtalo de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <Card className="w-full max-w-md p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                    <Dumbbell className="h-8 w-8 text-success" />
                </div>
                <h1 className="text-2xl font-bold mb-2">¡Registro completado!</h1>
                <p className="text-muted-foreground mb-6">
                    Revisa tu correo electrónico para confirmar tu cuenta y empezar con el plan{' '}
                    <strong className="text-foreground">{meta.name}</strong>.
                </p>
                <Button onClick={() => router.push('/login')} className="w-full">
                    Ir a iniciar sesión
                </Button>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-md p-8">
            {/* Plan selected banner */}
            <Link
                href="/signup"
                className={cn(
                    'flex items-center gap-3 p-3 mb-6 rounded-xl',
                    'bg-accent/40 hover:bg-accent/60 border border-border/50',
                    'transition-colors group',
                )}
            >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <TierIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Plan {meta.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                            {cycle === 'monthly' ? 'Mensual' : 'Anual'}
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {price} €/{cycle === 'monthly' ? 'mes' : 'año'} · {meta.maxClients}
                    </p>
                </div>
                <div className="text-xs text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1 shrink-0">
                    <ArrowLeft className="h-3 w-3" />
                    Cambiar
                </div>
            </Link>

            <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Dumbbell className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold">Crear cuenta</h1>
                <p className="text-muted-foreground text-sm mt-1">Únete a NexTrain</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                        id="fullName"
                        type="text"
                        placeholder="Tu nombre"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="tu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                    />
                </div>

                {error === 'ALREADY_REGISTERED' ? (
                    <div className="text-sm bg-amber-500/10 border border-amber-500/30 p-4 rounded-md space-y-2">
                        <p className="font-medium text-amber-600 dark:text-amber-400">
                            Ya tienes una cuenta (o has sido invitado)
                        </p>
                        <p className="text-muted-foreground">
                            Este email ya está registrado. Inicia sesión con tu contraseña o solicita un enlace de recuperación.
                        </p>
                        <div className="flex gap-2 pt-1">
                            <Button asChild variant="outline" size="sm">
                                <Link href="/login">Iniciar sesión</Link>
                            </Button>
                        </div>
                    </div>
                ) : error ? (
                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                        {error}
                    </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creando cuenta...
                        </>
                    ) : (
                        `Crear cuenta y empezar con ${meta.name}`
                    )}
                </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
                ¿Ya tienes cuenta?{' '}
                <Link href="/login" className="text-primary hover:underline">
                    Inicia sesión
                </Link>
            </p>
        </Card>
    )
}

function FallbackUI() {
    return (
        <Card className="w-full max-w-md p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        </Card>
    )
}

export default function SignupDetailsPage() {
    return (
        <Suspense fallback={<FallbackUI />}>
            <SignupDetailsInner />
        </Suspense>
    )
}
