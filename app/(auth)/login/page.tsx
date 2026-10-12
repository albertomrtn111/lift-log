'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthDivider, AuthHeading, AuthShell } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, AuthInput, PasswordInput } from '@/components/auth/AuthFields'
import { authErrorMessage, classifyAuthError, safeRedirectPath } from '@/lib/auth/auth-errors'

// useSearchParams() tiene que estar dentro de un Suspense (Next.js 14)
function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [email, setEmail] = useState(searchParams.get('email') ?? '')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<{ kind: string; message: string } | null>(null)
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

            if (error) {
                setError({ kind: classifyAuthError(error), message: authErrorMessage(error) })
                setLoading(false)
                return
            }

            // Con ?redirect= (p. ej. /forms/[id]) volvemos allí; si no, la raíz decide según el rol
            router.push(safeRedirectPath(searchParams.get('redirect')))
            router.refresh()
        } catch (err) {
            setError({ kind: 'unknown', message: authErrorMessage(err) })
            setLoading(false)
        }
    }

    const forgotHref = `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`

    return (
        <form onSubmit={handleLogin} className="space-y-5">
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
                    autoFocus
                    disabled={loading}
                />
            </AuthField>

            <AuthField
                id="password"
                label="Contraseña"
                aside={<Link href={forgotHref} className="font-medium text-primary hover:underline">¿La has olvidado?</Link>}
            >
                <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                />
            </AuthField>

            {error && (
                <AuthAlert tone="error">
                    {error.message}
                    {error.kind === 'invalid_credentials' && (
                        <> ¿Te invitó tu entrenador y no tienes contraseña? <Link href={forgotHref}>Créala aquí</Link>.</>
                    )}
                </AuthAlert>
            )}

            <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-[15px] font-semibold" disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Entrando…</> : 'Iniciar sesión'}
            </Button>
        </form>
    )
}

export default function LoginPage() {
    return (
        <AuthShell
            topRight={<Link href="/signup" className="font-medium text-foreground hover:text-primary">Crear cuenta</Link>}
        >
            <AuthHeading title="Bienvenido de nuevo" description="Entra para ver tu entrenamiento o gestionar a tus atletas." />

            <Suspense fallback={<div className="flex h-[260px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <LoginForm />
            </Suspense>

            <AuthDivider>¿Primera vez aquí?</AuthDivider>

            <div className="space-y-3">
                <Link
                    href="/signup"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                    <span>
                        <span className="block text-sm font-semibold">Soy entrenador</span>
                        <span className="block text-xs text-muted-foreground">Crea tu cuenta y elige plan</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">¿Eres atleta?</span> Tu entrenador te envía la invitación. Si no tienes contraseña,{' '}
                    <Link href="/forgot-password" className="font-medium text-primary hover:underline">créala con tu email</Link>.
                </p>
            </div>
        </AuthShell>
    )
}
