'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Link2Off, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthHeading, AuthShell, AuthStatus } from '@/components/auth/AuthShell'
import { AuthAlert, AuthField, PasswordInput, PasswordStrength } from '@/components/auth/AuthFields'
import { authErrorMessage } from '@/lib/auth/auth-errors'
import { markAthleteSignedUpAction } from './actions'

function SetPasswordInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const isReset = searchParams.get('mode') === 'reset'

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [checking, setChecking] = useState(true)
    const [email, setEmail] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
            setEmail(user?.email ?? null)
            setChecking(false)
        })
    }, [])

    const mismatch = confirmPassword.length > 0 && password !== confirmPassword

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.')
            return
        }
        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.')
            return
        }

        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.updateUser({ password })
            if (error) {
                setError(authErrorMessage(error))
                return
            }
            if (!isReset) await markAthleteSignedUpAction().catch(() => undefined)
            setSuccess(true)
            setTimeout(() => {
                router.push('/')
                router.refresh()
            }, 1500)
        } catch (err) {
            setError(authErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    if (checking) {
        return <AuthStatus icon={Loader2} spin tone="muted" title="Comprobando el enlace…" />
    }

    if (!email) {
        return (
            <AuthStatus
                icon={Link2Off}
                tone="destructive"
                title="Este enlace ya no sirve"
                actions={
                    <>
                        <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                            <Link href="/forgot-password">Pedir un enlace nuevo</Link>
                        </Button>
                        <Button asChild variant="ghost" className="h-10 rounded-xl">
                            <Link href="/login">Ir a iniciar sesión</Link>
                        </Button>
                    </>
                }
            >
                <p>Ha caducado, ya se usó o se abrió en otro navegador. Pide uno nuevo con tu email y ábrelo en este dispositivo.</p>
            </AuthStatus>
        )
    }

    if (success) {
        return (
            <AuthStatus icon={CheckCircle2} tone="success" title="Contraseña guardada">
                <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Entrando en tu cuenta…</p>
            </AuthStatus>
        )
    }

    return (
        <>
            <AuthHeading
                title={isReset ? 'Crea una contraseña nueva' : 'Crea tu contraseña'}
                description={
                    <>
                        {isReset ? 'Para la cuenta ' : 'La usarás para entrar en NexTrain con '}
                        <span className="font-semibold text-foreground">{email}</span>.
                    </>
                }
            />
            <form onSubmit={handleSetPassword} className="space-y-5">
                {/* Ayuda a los gestores de contraseñas a asociarla al email correcto */}
                <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

                <AuthField id="password" label="Nueva contraseña" hint={<PasswordStrength value={password} />}>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        placeholder="Mínimo 6 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                        autoFocus
                    />
                </AuthField>

                <AuthField id="confirmPassword" label="Repite la contraseña" hint={mismatch ? <span className="text-destructive">No coincide con la anterior.</span> : undefined}>
                    <PasswordInput
                        id="confirmPassword"
                        autoComplete="new-password"
                        placeholder="Escríbela otra vez"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={loading}
                        aria-invalid={mismatch}
                    />
                </AuthField>

                {error && <AuthAlert tone="error">{error}</AuthAlert>}

                <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-[15px] font-semibold" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : 'Guardar y entrar'}
                </Button>
            </form>
        </>
    )
}

export default function SetPasswordPage() {
    return (
        <AuthShell>
            <Suspense fallback={<AuthStatus icon={Loader2} spin tone="muted" title="Comprobando el enlace…" />}>
                <SetPasswordInner />
            </Suspense>
        </AuthShell>
    )
}
