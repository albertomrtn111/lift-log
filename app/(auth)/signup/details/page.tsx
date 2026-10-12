'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthHeading, AuthShell, AuthStatus, SignupSteps } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, AuthInput, PasswordInput, PasswordStrength } from '@/components/auth/AuthFields'
import { findTier, isCycle, priceOf } from '@/components/auth/plans'
import { authErrorMessage, classifyAuthError } from '@/lib/auth/auth-errors'

function SignupDetailsInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const tier = findTier(searchParams.get('plan'))
    const cycleParam = searchParams.get('cycle')
    const cycle = isCycle(cycleParam) ? cycleParam : null

    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<{ kind: string; message: string } | null>(null)
    const [loading, setLoading] = useState(false)
    const [sentTo, setSentTo] = useState<string | null>(null)

    // Sin plan válido volvemos a elegirlo
    useEffect(() => {
        if (!tier || !cycle) router.replace('/signup')
    }, [tier, cycle, router])

    if (!tier || !cycle) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
    }

    const TierIcon = tier.icon
    const price = priceOf(tier, cycle)

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (password.length < 6) {
            setError({ kind: 'weak_password', message: authErrorMessage({ code: 'weak_password' }) })
            return
        }
        setLoading(true)

        try {
            const supabase = createClient()
            const target = email.trim()
            const { data, error } = await supabase.auth.signUp({
                email: target,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    data: {
                        full_name: fullName.trim(),
                        subscription_tier: tier.id,
                        billing_cycle: cycle,
                    },
                },
            })

            if (error) {
                setError({ kind: classifyAuthError(error), message: authErrorMessage(error) })
                return
            }
            // Con confirmación por email activa, Supabase no da error si el email ya existe:
            // devuelve un usuario sin identidades.
            if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                setError({ kind: 'already_registered', message: authErrorMessage({ code: 'user_already_exists' }) })
                return
            }
            if (data.session) {
                router.push('/')
                router.refresh()
                return
            }
            setSentTo(target)
        } catch (err) {
            setError({ kind: 'unknown', message: authErrorMessage(err) })
        } finally {
            setLoading(false)
        }
    }

    if (sentTo) {
        return (
            <AuthStatus
                icon={MailCheck}
                tone="success"
                title="Confirma tu email"
                actions={
                    <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                        <Link href="/login">Ir a iniciar sesión</Link>
                    </Button>
                }
            >
                <p>
                    Te hemos enviado un enlace a <span className="font-semibold text-foreground">{sentTo}</span>. Ábrelo para activar tu cuenta con el plan{' '}
                    <span className="font-semibold text-foreground">{tier.name}</span>.
                </p>
                <p className="text-sm">¿No llega? Mira en spam o promociones; puede tardar un par de minutos.</p>
            </AuthStatus>
        )
    }

    return (
        <>
            <SignupSteps current={2} className="mb-8" />
            <AuthHeading title="Crea tu cuenta" description="En un minuto estarás dando de alta a tu primer atleta." />

            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <TierIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                        Plan {tier.name} <span className="font-normal text-muted-foreground">· {cycle === 'monthly' ? 'mensual' : 'anual'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {price} €/{cycle === 'monthly' ? 'mes' : 'año'} · hasta {tier.athletes} atletas
                    </p>
                </div>
                <Link href="/signup" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10">
                    Cambiar
                </Link>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">
                <AuthField id="fullName" label="Nombre y apellidos">
                    <AuthInput
                        id="fullName"
                        autoComplete="name"
                        placeholder="Cómo te verán tus atletas"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        autoFocus
                        disabled={loading}
                    />
                </AuthField>

                <AuthField id="email" label="Email">
                    <AuthInput
                        id="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="tu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                </AuthField>

                <AuthField id="password" label="Contraseña" hint={<PasswordStrength value={password} />}>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        placeholder="Mínimo 6 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                    />
                </AuthField>

                {error?.kind === 'already_registered' ? (
                    <AuthAlert tone="warning" title="Ya tienes una cuenta con este email">
                        Puede que tu entrenador ya te invitara. <Link href={`/login?email=${encodeURIComponent(email.trim())}`}>Inicia sesión</Link> o{' '}
                        <Link href={`/forgot-password?email=${encodeURIComponent(email.trim())}`}>crea tu contraseña</Link>.
                    </AuthAlert>
                ) : error ? (
                    <AuthAlert tone="error">{error.message}</AuthAlert>
                ) : null}

                <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-[15px] font-semibold" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando tu cuenta…</> : 'Crear cuenta'}
                </Button>
            </form>
        </>
    )
}

export default function SignupDetailsPage() {
    return (
        <AuthShell
            topRight={<Link href="/login" className="font-medium text-foreground hover:text-primary">Iniciar sesión</Link>}
            panelTitle={<>Empieza hoy.<br /><span className="text-white/50">Tus atletas lo notarán mañana.</span></>}
        >
            <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <SignupDetailsInner />
            </Suspense>
        </AuthShell>
    )
}
