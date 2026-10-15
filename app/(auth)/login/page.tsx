'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthDivider, AuthHeading, AuthShell } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, AuthInput, PasswordInput } from '@/components/auth/AuthFields'
import { authErrorMessage, classifyAuthError, safeRedirectPath } from '@/lib/auth/auth-errors'

// Si el login vuelve a abrirse con sesión a los pocos segundos de continuar,
// no se reintenta solo (evita un bucle si el servidor no ve la sesión)
const AUTO_CONTINUE_KEY = 'auth:auto-continue-at'
const AUTO_CONTINUE_WINDOW_MS = 20_000

type ExistingSession = { status: 'checking' } | { status: 'none' } | { status: 'found'; email: string; auto: boolean }

function readAutoContinueAt() {
    try {
        return Number(window.sessionStorage.getItem(AUTO_CONTINUE_KEY)) || 0
    } catch {
        return 0
    }
}

function markAutoContinue() {
    try {
        window.sessionStorage.setItem(AUTO_CONTINUE_KEY, String(Date.now()))
    } catch {
        // Sin almacenamiento simplemente no hay protección contra bucles
    }
}

/**
 * El login no pasa por el middleware: si quien llega aquí ya tiene sesión
 * (p. ej. el servidor no la reconoció al abrir la app del móvil, pero sigue
 * viva), se continúa con ella en vez de pedir la contraseña otra vez.
 */
function useExistingSession(redirectTo: string) {
    const router = useRouter()
    const [state, setState] = useState<ExistingSession>({ status: 'checking' })

    useEffect(() => {
        let cancelled = false
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (cancelled) return
            if (!user) {
                setState({ status: 'none' })
                return
            }
            const recentlyTried = Date.now() - readAutoContinueAt() < AUTO_CONTINUE_WINDOW_MS
            setState({ status: 'found', email: user.email ?? '', auto: !recentlyTried })

            void fetch('/api/auth/session-recovered', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: redirectTo,
                    standalone: window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true,
                }),
                keepalive: true,
            }).catch(() => undefined)

            if (!recentlyTried) {
                markAutoContinue()
                router.replace(redirectTo)
                router.refresh()
            }
        }).catch(() => {
            if (!cancelled) setState({ status: 'none' })
        })
        return () => { cancelled = true }
    }, [redirectTo, router])

    const signOutExisting = async () => {
        await createClient().auth.signOut({ scope: 'local' })
        setState({ status: 'none' })
    }

    return { state, signOutExisting }
}

// useSearchParams() tiene que estar dentro de un Suspense (Next.js 14)
function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const redirectTo = safeRedirectPath(searchParams.get('redirect'))
    const { state: existing, signOutExisting } = useExistingSession(redirectTo)
    const [email, setEmail] = useState(searchParams.get('email') ?? '')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<{ kind: string; message: string } | null>(null)
    const [loading, setLoading] = useState(false)
    const [switching, setSwitching] = useState(false)

    if (existing.status === 'checking') {
        return <div className="flex h-[260px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
    }

    if (existing.status === 'found') {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {existing.auto ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserRound className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold">{existing.auto ? 'Entrando…' : 'Ya tienes la sesión iniciada'}</p>
                        <p className="truncate text-sm text-muted-foreground">{existing.email}</p>
                    </div>
                </div>
                {!existing.auto && (
                    <>
                        <Button
                            size="lg"
                            className="h-11 w-full rounded-xl text-[15px] font-semibold"
                            onClick={() => { router.replace(redirectTo); router.refresh() }}
                        >
                            Continuar
                        </Button>
                        <Button
                            variant="ghost"
                            className="h-10 w-full rounded-xl"
                            disabled={switching}
                            onClick={async () => { setSwitching(true); await signOutExisting(); setSwitching(false) }}
                        >
                            {switching && <Loader2 className="h-4 w-4 animate-spin" />}
                            Usar otra cuenta
                        </Button>
                    </>
                )}
            </div>
        )
    }

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
            router.push(redirectTo)
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
